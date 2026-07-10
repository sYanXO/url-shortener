import os
import logging
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from models import SessionLocal
from store import ShortURLStore

logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address)

class AppBootstrap:
    @staticmethod
    def setup(app: FastAPI):
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

        # Mount static asset directory
        if os.path.exists("backend/static"):
            app.mount("/static", StaticFiles(directory="backend/static"), name="static")
        elif os.path.exists("static"):
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
