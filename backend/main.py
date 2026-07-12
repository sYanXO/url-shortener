import os
import logging
import time
import secrets
from urllib.parse import urlparse

from fastapi import FastAPI, Depends, BackgroundTasks, Request, HTTPException, Cookie, Response
from fastapi.responses import RedirectResponse, FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, field_validator

from models import SessionLocal
from store import URLRepository, AnalyticsRepository
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


def get_or_create_session(response: Response, session_id: str | None = Cookie(None)):
    if not session_id:
        session_id = secrets.token_hex(16)
        response.set_cookie(
            key="session_id", 
            value=session_id, 
            httponly=True, 
            max_age=31536000, 
            path="/",
            samesite="lax",
            secure=os.getenv("ENVIRONMENT") == "production"
        )
    return session_id


def get_url_repository(request: Request, db: Session = Depends(get_db)) -> URLRepository:
    return URLRepository(
        db=db, 
        cache=request.app.state.memory_cache, 
        bloom_filter=request.app.state.bloom_filter
    )


def get_analytics_repository(db: Session = Depends(get_db)) -> AnalyticsRepository:
    return AnalyticsRepository(db)


def background_record_click(short_code: str):
    """Background task to record a click with its own DB session lifecycle."""
    db = SessionLocal()
    try:
        analytics = AnalyticsRepository(db)
        analytics.record_click(short_code)
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
        return FileResponse("backend/static/index.html")
    elif os.path.exists("static/dashboard.html"):
        return FileResponse("static/dashboard.html")
    return {"detail": "Frontend assets not found."}


@app.post("/shorten")
@limiter.limit("10/minute")
def shorten(
    request: Request, 
    payload: URLRequest, 
    repo: URLRepository = Depends(get_url_repository),
    owner_id: str = Depends(get_or_create_session)
):
    return repo.create(payload.original_url, payload.nickname, owner_id)


@app.get("/api/stats")
def get_stats(
    analytics: AnalyticsRepository = Depends(get_analytics_repository), 
    owner_id: str = Depends(get_or_create_session)
):
    return analytics.get_stats(owner_id)


@app.get("/api/links")
def get_links(
    limit: int = 50, 
    repo: URLRepository = Depends(get_url_repository), 
    owner_id: str = Depends(get_or_create_session)
):
    return repo.get_links(owner_id, limit)


@app.patch("/api/links/{short_code}/nickname")
def update_nickname(
    short_code: str, 
    payload: NicknameUpdateRequest, 
    repo: URLRepository = Depends(get_url_repository),
    owner_id: str = Depends(get_or_create_session)
):
    new_nickname = repo.update_nickname(short_code, payload.nickname, owner_id)
    return {"status": "success", "nickname": new_nickname}


@app.delete("/api/links/{short_code}")
def delete_link(
    short_code: str, 
    repo: URLRepository = Depends(get_url_repository),
    owner_id: str = Depends(get_or_create_session)
):
    repo.delete(short_code, owner_id)
    return {"status": "success"}


@app.get("/api/clicks-over-time")
def get_clicks_over_time(
    days: int = 14, 
    analytics: AnalyticsRepository = Depends(get_analytics_repository), 
    owner_id: str = Depends(get_or_create_session)
):
    return analytics.get_clicks_over_time(owner_id, days)


@app.get("/{short_code}")
def redirect_url(
    short_code: str, 
    background_tasks: BackgroundTasks, 
    repo: URLRepository = Depends(get_url_repository)
):
    url = repo.resolve(short_code)
    background_tasks.add_task(background_record_click, short_code)
    return RedirectResponse(url=url)
