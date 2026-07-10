import os
import logging
from datetime import datetime
from sqlalchemy import create_engine, Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./shortener.db")

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {}
engine_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
else:
    engine_args = {
        "pool_pre_ping": True,
        "pool_recycle": 300,
        "pool_size": 10,
        "max_overflow": 20,
    }

engine = create_engine(DATABASE_URL, connect_args=connect_args, **engine_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

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

def _safe_migrate():
    """Add created_at, click_count, nickname, and last_nickname_updated_at to url_mappings if they don't exist yet."""
    from sqlalchemy import text, inspect
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
