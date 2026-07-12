import secrets
import logging
from datetime import datetime, timedelta
from fastapi import HTTPException
from pybloom_live import BloomFilter
from cachetools import LRUCache
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from models import SessionLocal, URLMapping, Click

logger = logging.getLogger(__name__)


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


class URLRepository:
    def __init__(self, db: Session, cache: LRUCache, bloom_filter: BloomFilter):
        self.db = db
        self.cache = cache
        self.bloom_filter = bloom_filter

    def resolve(self, short_code: str) -> str:
        if short_code not in self.bloom_filter:
            logger.warning(f"Bloom filter rejected: {short_code}")
            raise HTTPException(status_code=404, detail="Short code not found")

        cached_url = self.cache.get(short_code)
        if cached_url:
            logger.info(f"Cache hit: {short_code}")
            return cached_url

        mapping = self.db.query(URLMapping).filter(URLMapping.short_code == short_code).first()
        if not mapping:
            logger.warning(f"Short code not found: {short_code}")
            raise HTTPException(status_code=404, detail="Short code not found")

        self.cache[short_code] = mapping.original_url
        logger.info(f"Cache miss, stored in memory cache: {short_code}")
        return mapping.original_url

    def create(self, original_url: str, nickname: str | None, owner_id: str) -> dict:
        existing = self.db.query(URLMapping).filter(URLMapping.original_url == original_url, URLMapping.owner_id == owner_id).first()
        if existing:
            if nickname:
                existing.nickname = nickname
                self.db.commit()
            logger.info(f"URL already exists, returning existing short code: {existing.short_code}")
            return {"short_code": existing.short_code, "already_exists": True}

        short_code = generate_short_code_with_retry(self.db)

        url_mapping = URLMapping(
            short_code=short_code,
            original_url=original_url,
            nickname=nickname,
            created_at=datetime.utcnow(),
            click_count=0,
            owner_id=owner_id,
        )
        self.db.add(url_mapping)
        self.db.commit()
        self.db.refresh(url_mapping)

        self.bloom_filter.add(short_code)
        self.cache[short_code] = original_url
        logger.info(f"Created short code: {short_code}")

        return {"short_code": short_code, "already_exists": False}

    def update_nickname(self, short_code: str, nickname: str | None, owner_id: str) -> str | None:
        mapping = self.db.query(URLMapping).filter(URLMapping.short_code == short_code, URLMapping.owner_id == owner_id).first()
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
        self.db.commit()
        return mapping.nickname

    def delete(self, short_code: str, owner_id: str):
        mapping = self.db.query(URLMapping).filter(URLMapping.short_code == short_code, URLMapping.owner_id == owner_id).first()
        if not mapping:
            raise HTTPException(status_code=404, detail="Link not found")
        self.db.delete(mapping)
        self.db.commit()
        if short_code in self.cache:
            del self.cache[short_code]

    def get_links(self, owner_id: str, limit: int) -> list:
        mappings = (
            self.db.query(URLMapping)
            .filter(URLMapping.owner_id == owner_id)
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


class AnalyticsRepository:
    def __init__(self, db: Session):
        self.db = db

    def record_click(self, short_code: str):
        try:
            self.db.query(URLMapping).filter(URLMapping.short_code == short_code).update(
                {URLMapping.click_count: URLMapping.click_count + 1}
            )
            click = Click(short_code=short_code, clicked_at=datetime.utcnow())
            self.db.add(click)
            self.db.commit()
        except Exception as e:
            logger.error(f"Failed to record click for {short_code}: {e}")
            self.db.rollback()

    def get_clicks_over_time(self, owner_id: str, days: int) -> list:
        since = datetime.utcnow() - timedelta(days=days)
        rows = (
            self.db.query(
                func.date(Click.clicked_at).label("day"),
                func.count(Click.id).label("count"),
            )
            .join(URLMapping, URLMapping.short_code == Click.short_code)
            .filter(Click.clicked_at >= since, URLMapping.owner_id == owner_id)
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

    def get_stats(self, owner_id: str) -> dict:
        total_links = self.db.query(func.count(URLMapping.id)).filter(URLMapping.owner_id == owner_id).scalar() or 0
        total_clicks = self.db.query(func.sum(URLMapping.click_count)).filter(URLMapping.owner_id == owner_id).scalar() or 0
        return {"total_links": total_links, "total_clicks": total_clicks}
