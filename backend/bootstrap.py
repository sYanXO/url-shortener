import os
import logging
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from pybloom_live import BloomFilter
from cachetools import LRUCache

from models import SessionLocal, URLMapping

logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address)

class AppBootstrap:
    @staticmethod
    def setup(app: FastAPI):
        app.state.limiter = limiter
        app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
        
        # Trust boundary for reverse proxies
        from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware
        app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")

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
            app.state.memory_cache = LRUCache(maxsize=10000)
            app.state.bloom_filter = BloomFilter(capacity=1000000, error_rate=0.001)

            db = SessionLocal()
            try:
                mappings = db.query(URLMapping.short_code).all()
                for m in mappings:
                    app.state.bloom_filter.add(m.short_code)
                logger.info(f"Loaded {len(mappings)} short codes into Bloom Filter.")
            except Exception as e:
                logger.error(f"Failed to populate Bloom filter on startup: {e}")
            finally:
                db.close()
