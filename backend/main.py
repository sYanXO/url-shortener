import os
import logging
import time
from urllib.parse import urlparse

from fastapi import FastAPI, Depends, BackgroundTasks, Request, HTTPException
from fastapi.responses import RedirectResponse, FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, field_validator

from models import SessionLocal
from store import ShortURLStore, ClickTracker
from bootstrap import AppBootstrap, limiter

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()
AppBootstrap.setup(app)


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
# ROUTES
# ============================================================================
@app.get("/")
def read_root():
    if os.path.exists("backend/static/index.html"):
        return FileResponse("backend/static/index.html")
    elif os.path.exists("static/index.html"):
        return FileResponse("static/index.html")
    return {"detail": "Frontend assets not found. Please build the frontend."}


@app.get("/dashboard")
def read_dashboard():
    if os.path.exists("backend/static/index.html"):
        # For React Router SPA routing, serve index.html for dashboard path
        return FileResponse("backend/static/index.html")
    elif os.path.exists("static/dashboard.html"):
        return FileResponse("static/dashboard.html")
    return {"detail": "Frontend assets not found."}


@app.post("/shorten")
@limiter.limit("10/minute")
def shorten(request: Request, payload: URLRequest, db: Session = Depends(get_db)):
    return ShortURLStore.create(payload.original_url, payload.nickname, db)


_stats_cache = {"data": None, "timestamp": 0}

@app.get("/api/stats")
def get_stats(db: Session = Depends(get_db)):
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
