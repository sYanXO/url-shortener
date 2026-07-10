# ============================================================================
# IMPORTS
# ============================================================================
import os
import secrets
import logging
from datetime import datetime, date, timedelta
from urllib.parse import urlparse
from collections import defaultdict

from fastapi import FastAPI, Depends, BackgroundTasks, HTTPException, Request
from fastapi.responses import RedirectResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import create_engine, Column, String, Integer, DateTime, ForeignKey, func
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, field_validator
from pybloom_live import BloomFilter
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============================================================================
# DATABASE SETUP
# ============================================================================
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./shortener.db")

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {}
engine_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
else:
    # PostgreSQL specific engine args for Neon / persistent pool health
    engine_args = {
        "pool_pre_ping": True,
        "pool_recycle": 300,
        "pool_size": 10,
        "max_overflow": 20,
    }

engine = create_engine(DATABASE_URL, connect_args=connect_args, **engine_args)
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
    nickname = Column(String, nullable=True)
    last_nickname_updated_at = Column(DateTime, nullable=True)
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
    """Add created_at, click_count, nickname, and last_nickname_updated_at to url_mappings if they don't exist yet."""
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
            if "nickname" not in existing_cols:
                conn.execute(text("ALTER TABLE url_mappings ADD COLUMN nickname VARCHAR(255)"))
                conn.commit()
                logger.info("Migration: added nickname column")
            if "last_nickname_updated_at" not in existing_cols:
                conn.execute(text(f"ALTER TABLE url_mappings ADD COLUMN last_nickname_updated_at {ts_type}"))
                conn.commit()
                logger.info("Migration: added last_nickname_updated_at column")
    except Exception as e:
        logger.warning(f"Migration skipped or failed: {e}")

_safe_migrate()

# ============================================================================
# APP SETUP
# ============================================================================
# In-memory cache for redirects (LRU to prevent unbounded memory growth)
from cachetools import LRUCache
memory_cache = LRUCache(maxsize=10000)
bloom_filter = BloomFilter(capacity=1000000, error_rate=0.001)

limiter = Limiter(key_func=get_remote_address)
app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# GZip Compression
from fastapi.middleware.gzip import GZipMiddleware
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Security Headers
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data: https://api.qrserver.com; "
        "connect-src 'self';"
    )
    return response

if os.path.exists("static"):
    app.mount("/static", StaticFiles(directory="static"), name="static")


@app.on_event("startup")
def startup():
    db = SessionLocal()
    try:
        ShortURLStore.populate_filter(db)
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
        return res.scheme in ("http", "https") and bool(res.netloc)
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


# ============================================================================
# PYDANTIC SCHEMAS
# ============================================================================
class URLRequest(BaseModel):
    original_url: str
    nickname: str | None = None

    @field_validator("original_url")
    @classmethod
    def validate_url(cls, v):
        if len(v) > 2048:
            raise ValueError("URL exceeds maximum length of 2048 characters")
        if not is_valid_url(v):
            raise ValueError("Invalid URL format")
        return v


class NicknameUpdateRequest(BaseModel):
    nickname: str | None = None


# ============================================================================
# DEEP MODULES
# ============================================================================
class ShortURLStore:
    @staticmethod
    def populate_filter(db: Session):
        mappings = db.query(URLMapping.short_code).all()
        for m in mappings:
            bloom_filter.add(m.short_code)
        logger.info(f"Loaded {len(mappings)} short codes into Bloom Filter.")

    @staticmethod
    def resolve(short_code: str, db: Session) -> str:
        if short_code not in bloom_filter:
            logger.warning(f"Bloom filter rejected: {short_code}")
            raise HTTPException(status_code=404, detail="Short code not found")

        cached_url = memory_cache.get(short_code)
        if cached_url:
            logger.info(f"Cache hit: {short_code}")
            return cached_url

        mapping = db.query(URLMapping).filter(URLMapping.short_code == short_code).first()
        if not mapping:
            logger.warning(f"Short code not found: {short_code}")
            raise HTTPException(status_code=404, detail="Short code not found")

        memory_cache[short_code] = mapping.original_url
        logger.info(f"Cache miss, stored in memory cache: {short_code}")
        return mapping.original_url

    @staticmethod
    def create(original_url: str, nickname: str | None, db: Session) -> dict:
        # Check if original URL already exists
        existing = db.query(URLMapping).filter(URLMapping.original_url == original_url).first()
        if existing:
            if nickname:
                existing.nickname = nickname
                db.commit()
            logger.info(f"URL already exists, returning existing short code: {existing.short_code}")
            return {"short_code": existing.short_code, "already_exists": True}

        short_code = generate_short_code_with_retry(db)

        url_mapping = URLMapping(
            short_code=short_code,
            original_url=original_url,
            nickname=nickname,
            created_at=datetime.utcnow(),
            click_count=0,
        )
        db.add(url_mapping)
        db.commit()
        db.refresh(url_mapping)

        bloom_filter.add(short_code)
        memory_cache[short_code] = original_url
        logger.info(f"Created short code: {short_code}")

        return {"short_code": short_code, "already_exists": False}

    @staticmethod
    def update_nickname(short_code: str, nickname: str | None, db: Session) -> str | None:
        mapping = db.query(URLMapping).filter(URLMapping.short_code == short_code).first()
        if not mapping:
            raise HTTPException(status_code=404, detail="Link not found")

        if mapping.nickname == nickname:
            return mapping.nickname

        if mapping.last_nickname_updated_at:
            delta = datetime.utcnow() - mapping.last_nickname_updated_at
            if delta < timedelta(days=7):
                days_left = 7 - delta.days
                hours_left = 24 - int(delta.seconds / 3600) % 24
                if days_left > 0:
                    time_str = f"{days_left} day{'s' if days_left != 1 else ''}"
                else:
                    time_str = f"{hours_left} hour{'s' if hours_left != 1 else ''}"
                raise HTTPException(
                    status_code=400,
                    detail=f"Nickname can only be updated once every 7 days. Try again in {time_str}."
                )

        mapping.nickname = nickname
        mapping.last_nickname_updated_at = datetime.utcnow()
        db.commit()
        return mapping.nickname

    @staticmethod
    def delete(short_code: str, db: Session):
        mapping = db.query(URLMapping).filter(URLMapping.short_code == short_code).first()
        if not mapping:
            raise HTTPException(status_code=404, detail="Link not found")
        db.delete(mapping)
        db.commit()
        if short_code in memory_cache:
            del memory_cache[short_code]

    @staticmethod
    def get_links(limit: int, db: Session) -> list:
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
                "nickname": m.nickname,
            }
            for m in mappings
        ]


class ClickTracker:
    @staticmethod
    def record(short_code: str):
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

    @staticmethod
    def get_clicks_over_time(days: int, db: Session) -> list:
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

        result = {}
        for i in range(days):
            d = (datetime.utcnow() - timedelta(days=days - 1 - i)).strftime("%Y-%m-%d")
            result[d] = 0
        for row in rows:
            result[str(row.day)] = row.count

        return [{"date": k, "count": v} for k, v in sorted(result.items())]

    @staticmethod
    def get_stats(db: Session) -> dict:
        total_links = db.query(func.count(URLMapping.id)).scalar() or 0
        total_clicks = db.query(func.sum(URLMapping.click_count)).scalar() or 0
        return {"total_links": total_links, "total_clicks": total_clicks}


# ============================================================================
# ROUTES
# ============================================================================
@app.get("/")
def read_root():
    return FileResponse("static/index.html")

@app.get("/dashboard")
def read_dashboard():
    return FileResponse("static/dashboard.html")

@app.post("/shorten")
@limiter.limit("10/minute")
def shorten(request: Request, payload: URLRequest, db: Session = Depends(get_db)):
    return ShortURLStore.create(payload.original_url, payload.nickname, db)


_stats_cache = {"data": None, "timestamp": 0}

@app.get("/api/stats")
def get_stats(db: Session = Depends(get_db)):
    import time
    now = time.time()
    if _stats_cache["data"] is not None and now - _stats_cache["timestamp"] < 10:
        return _stats_cache["data"]

    stats = ClickTracker.get_stats(db)
    _stats_cache["data"] = stats
    _stats_cache["timestamp"] = now
    return stats


@app.get("/api/links")
def get_links(limit: int = 50, db: Session = Depends(get_db)):
    return ShortURLStore.get_links(limit, db)


@app.patch("/api/links/{short_code}/nickname")
def update_nickname(short_code: str, payload: NicknameUpdateRequest, db: Session = Depends(get_db)):
    new_nickname = ShortURLStore.update_nickname(short_code, payload.nickname, db)
    return {"status": "success", "nickname": new_nickname}


@app.delete("/api/links/{short_code}")
def delete_link(short_code: str, db: Session = Depends(get_db)):
    ShortURLStore.delete(short_code, db)
    return {"status": "success"}


@app.get("/api/clicks-over-time")
def get_clicks_over_time(days: int = 14, db: Session = Depends(get_db)):
    return ClickTracker.get_clicks_over_time(days, db)


@app.get("/{short_code}")
def redirect_url(short_code: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    url = ShortURLStore.resolve(short_code, db)
    background_tasks.add_task(ClickTracker.record, short_code)
    return RedirectResponse(url=url)
