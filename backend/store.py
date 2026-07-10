import secrets
import logging
from datetime import datetime, timedelta
from fastapi import HTTPException
from pybloom_live import BloomFilter
from cachetools import LRUCache
from sqlalchemy.orm import Session
from sqlalchemy import func

from models import SessionLocal, URLMapping, Click

logger = logging.getLogger(__name__)

# Cache and Bloom Filter instances
memory_cache = LRUCache(maxsize=10000)
bloom_filter = BloomFilter(capacity=1000000, error_rate=0.001)


def generate_short_code_with_retry(db: Session, max_retries: int = 5) -> str:
    from sqlalchemy.exc import IntegrityError
    for _ in range(max_retries):
        short_code = secrets.token_urlsafe(6)
        try:
            existing = db.query(URLMapping).filter(URLMapping.short_code == short_code).first()
            if not existing:
                return short_code
        except IntegrityError:
            db.rollback()
    raise HTTPException(status_code=500, detail="Failed to generate unique short code")


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
