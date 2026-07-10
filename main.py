# ============================================================================
# IMPORTS
# ============================================================================
import os
import secrets
import logging
from datetime import datetime, date, timedelta
from urllib.parse import urlparse
from collections import defaultdict

from fastapi import FastAPI, Depends, BackgroundTasks, HTTPException
from fastapi.responses import RedirectResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import create_engine, Column, String, Integer, DateTime, ForeignKey, func
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, field_validator
from pybloom_live import BloomFilter

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============================================================================
# DATABASE SETUP
# ============================================================================
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./shortener.db")

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# ============================================================================
# MODELS
# ============================================================================
class URLMapping(Base):
    __tablename__ = "url_mappings"

    id = Column(Integer, primary_key=True, index=True)
    short_code = Column(String, unique=True, index=True)
    original_url = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    click_count = Column(Integer, default=0)

    clicks = relationship("Click", back_populates="url_mapping", cascade="all, delete-orphan")


class Click(Base):
    __tablename__ = "clicks"

    id = Column(Integer, primary_key=True, index=True)
    short_code = Column(String, ForeignKey("url_mappings.short_code"), index=True)
    clicked_at = Column(DateTime, default=datetime.utcnow)

    url_mapping = relationship("URLMapping", back_populates="clicks")


Base.metadata.create_all(bind=engine)

# Safe migration: add new columns to existing databases that predate them
def _safe_migrate():
    """Add created_at and click_count to url_mappings if they don't exist yet."""
    from sqlalchemy import text, inspect
    # PostgreSQL uses TIMESTAMP; SQLite uses DATETIME
    is_pg = DATABASE_URL.startswith("postgresql")
    ts_type = "TIMESTAMP" if is_pg else "DATETIME"
    try:
        insp = inspect(engine)
        existing_cols = {col["name"] for col in insp.get_columns("url_mappings")}
        with engine.connect() as conn:
            if "click_count" not in existing_cols:
                conn.execute(text("ALTER TABLE url_mappings ADD COLUMN click_count INTEGER DEFAULT 0"))
                conn.commit()
                logger.info("Migration: added click_count column")
            if "created_at" not in existing_cols:
                conn.execute(text(f"ALTER TABLE url_mappings ADD COLUMN created_at {ts_type}"))
                conn.commit()
                logger.info("Migration: added created_at column")
    except Exception as e:
        logger.warning(f"Migration skipped or failed: {e}")

_safe_migrate()

# ============================================================================
# APP SETUP
# ============================================================================
# In-memory cache for redirects
memory_cache = {}
bloom_filter = BloomFilter(capacity=1000000, error_rate=0.001)

app = FastAPI()
if os.path.exists("static"):
    app.mount("/static", StaticFiles(directory="static"), name="static")


@app.on_event("startup")
def startup():
    db = SessionLocal()
    try:
        mappings = db.query(URLMapping.short_code).all()
        for m in mappings:
            bloom_filter.add(m.short_code)
        logger.info(f"Loaded {len(mappings)} short codes into Bloom Filter.")
    except Exception as e:
        logger.error(f"Failed to populate Bloom filter on startup: {e}")
    finally:
        db.close()


# ============================================================================
# DEPENDENCY
# ============================================================================
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ============================================================================
# HELPERS
# ============================================================================
def is_valid_url(url: str) -> bool:
    try:
        res = urlparse(url)
        return all([res.scheme, res.netloc])
    except Exception:
        return False


def generate_short_code_with_retry(db: Session, max_retries: int = 5) -> str:
    for _ in range(max_retries):
        short_code = secrets.token_urlsafe(6)
        try:
            existing = db.query(URLMapping).filter(URLMapping.short_code == short_code).first()
            if not existing:
                return short_code
        except IntegrityError:
            db.rollback()
    raise HTTPException(status_code=500, detail="Failed to generate unique short code")


def record_click(short_code: str):
    """Increment click counter and record a click event in the DB."""
    db = SessionLocal()
    try:
        db.query(URLMapping).filter(URLMapping.short_code == short_code).update(
            {URLMapping.click_count: URLMapping.click_count + 1}
        )
        click = Click(short_code=short_code, clicked_at=datetime.utcnow())
        db.add(click)
        db.commit()
    except Exception as e:
        logger.error(f"Failed to record click for {short_code}: {e}")
        db.rollback()
    finally:
        db.close()


# ============================================================================
# PYDANTIC SCHEMAS
# ============================================================================
class URLRequest(BaseModel):
    original_url: str

    @field_validator("original_url")
    @classmethod
    def validate_url(cls, v):
        if not is_valid_url(v):
            raise ValueError("Invalid URL format")
        return v


# ============================================================================
# ROUTES — FRONTEND
# ============================================================================
@app.get("/")
def read_root():
    return FileResponse("static/index.html")

@app.get("/dashboard")
def read_dashboard():
    return FileResponse("static/dashboard.html")


# ============================================================================
# ROUTES — CORE
# ============================================================================
@app.post("/shorten")
def shorten(request: URLRequest, db: Session = Depends(get_db)):
    logger.info(f"Shortening URL: {request.original_url}")
    short_code = generate_short_code_with_retry(db)

    url_mapping = URLMapping(
        short_code=short_code,
        original_url=request.original_url,
        created_at=datetime.utcnow(),
        click_count=0,
    )
    db.add(url_mapping)
    db.commit()
    db.refresh(url_mapping)

    bloom_filter.add(short_code)
    memory_cache[short_code] = request.original_url
    logger.info(f"Created short code: {short_code}")

    return {"short_code": short_code}


@app.get("/api/stats")
def get_stats(db: Session = Depends(get_db)):
    """Return aggregate stats: total links, total clicks."""
    total_links = db.query(func.count(URLMapping.id)).scalar() or 0
    total_clicks = db.query(func.sum(URLMapping.click_count)).scalar() or 0
    return {"total_links": total_links, "total_clicks": total_clicks}


@app.get("/api/links")
def get_links(limit: int = 50, db: Session = Depends(get_db)):
    """Return all links ordered by click count descending."""
    mappings = (
        db.query(URLMapping)
        .order_by(URLMapping.click_count.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "short_code": m.short_code,
            "original_url": m.original_url,
            "click_count": m.click_count,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in mappings
    ]


@app.get("/api/clicks-over-time")
def get_clicks_over_time(days: int = 14, db: Session = Depends(get_db)):
    """Return click counts grouped by day for the last N days."""
    since = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(
            func.date(Click.clicked_at).label("day"),
            func.count(Click.id).label("count"),
        )
        .filter(Click.clicked_at >= since)
        .group_by(func.date(Click.clicked_at))
        .order_by(func.date(Click.clicked_at))
        .all()
    )

    # Build a full date range with zeros for missing days
    result = {}
    for i in range(days):
        d = (datetime.utcnow() - timedelta(days=days - 1 - i)).strftime("%Y-%m-%d")
        result[d] = 0
    for row in rows:
        result[str(row.day)] = row.count

    return [{"date": k, "count": v} for k, v in sorted(result.items())]


@app.get("/{short_code}")
def redirect_url(short_code: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    logger.info(f"Redirecting short code: {short_code}")

    if short_code not in bloom_filter:
        logger.warning(f"Bloom filter rejected: {short_code}")
        raise HTTPException(status_code=404, detail="Short code not found")

    cached_url = memory_cache.get(short_code)
    if cached_url:
        logger.info(f"Cache hit: {short_code}")
        background_tasks.add_task(record_click, short_code)
        return RedirectResponse(url=cached_url)

    mapping = db.query(URLMapping).filter(URLMapping.short_code == short_code).first()
    if not mapping:
        logger.warning(f"Short code not found: {short_code}")
        raise HTTPException(status_code=404, detail="Short code not found")

    memory_cache[short_code] = mapping.original_url
    logger.info(f"Cache miss, stored in memory cache: {short_code}")

    background_tasks.add_task(record_click, short_code)
    return RedirectResponse(url=mapping.original_url)
