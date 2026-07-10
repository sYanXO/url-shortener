# ============================================================================
# IMPORTS - bringing in libraries we need
# ============================================================================
import os

from fastapi import FastAPI, Depends, BackgroundTasks
# FastAPI = web framework for building APIs
# Depends = FastAPI's way to inject dependencies (we'll use this for DB)
# BackgroundTasks = FastAPI's built-in way to run tasks after returning response

from fastapi.responses import RedirectResponse, FileResponse
# RedirectResponse = sends an HTTP redirect to the browser (301/302)
# FileResponse = serves a static HTML file (our frontend)

from fastapi.staticfiles import StaticFiles
# StaticFiles = lets FastAPI serve CSS/JS/asset files from a folder

from sqlalchemy import create_engine, Column, String, Integer
# create_engine = connects to the database
# Column, String, Integer = building blocks for defining table structure

from sqlalchemy.ext.declarative import declarative_base
# declarative_base = lets us define tables as Python classes (ORM magic)

from sqlalchemy.orm import sessionmaker, Session
# sessionmaker = factory for creating database sessions
# Session = object that represents "I'm doing database work right now"

from pydantic import BaseModel
# BaseModel = Pydantic's way to validate incoming JSON data

from fastapi import HTTPException
# HTTPException = raise errors that FastAPI converts to HTTP responses (404, 500, etc)
from sqlalchemy.exc import IntegrityError

import secrets
# secrets = cryptographically secure random number generator (better than random)


import logging
import json
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# In-memory cache for redirects
memory_cache = {}

def log_click(short_code: str):
    logger.info(f"Click logged for: {short_code}")

app = FastAPI()
if os.path.exists("static"):
    app.mount("/static", StaticFiles(directory="static"), name="static")









DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./shortener.db")

# Render and other platforms sometimes pass postgres:// instead of postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args)


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


Base = declarative_base()


class URLMapping(Base):
    
    
    __tablename__ = "url_mappings"

    
    id = Column(Integer, primary_key=True, index=True)
    
    
    short_code = Column(String, unique=True, index=True)
   
    
    original_url = Column(String)
 

Base.metadata.create_all(bind=engine)



from urllib.parse import urlparse
from pydantic import BaseModel, field_validator
def is_valid_url(url:str)->bool:
    try:
        res = urlparse(url)
        return all([res.scheme, res.netloc])
    except:
        return False
class URLRequest(BaseModel):
    
    
    original_url: str

    @field_validator('original_url')
    @classmethod
    def validate_url(cls,v):
        if not is_valid_url(v):
            raise ValueError('Invalid URL format')
        return v
    


def get_db():
    
    
    db = SessionLocal()
    
    
    try:
        # "Try to do the following, and if something goes wrong..."
        yield db
        # yield = pause here and let the route function use this 'db'
        # When the route function finishes, come back here and continue
    finally:
        
        db.close()
        
@app.get("/")
# @app.get() = FastAPI decorator that registers a GET endpoint at "/"
# When someone visits http://localhost:8000/, this function runs

def read_root():
    # Serve the frontend HTML page at the root URL ("/")
    return FileResponse("static/index.html")

# ============================================================================
# ROUTE 2: SHORTEN A URL
# ============================================================================
from pybloom_live import BloomFilter
bloom_filter = BloomFilter(capacity=1000000, error_rate=0.001)

@app.on_event("startup")
def load_bloom_filter():
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

@app.post("/shorten")
# @app.post() = FastAPI decorator that registers a POST endpoint at "/shorten"
# Client sends JSON data in the body, not in the URL

def shorten(request: URLRequest, db: Session = Depends(get_db)):
    # request: URLRequest = FastAPI parses the JSON body and validates it
    #                       If validation fails, FastAPI rejects the request automatically
    # 
    # db: Session = Depends(get_db) = FastAPI calls get_db(), which yields a session,
    #                                 passes it to this function
    #                                 After function ends, get_db() resumes and calls db.close()

    logger.info(f"Shortening URL: {request.original_url}")
    
    short_code = generate_short_code_with_retry(db,max_retries=5)
    # secrets.token_urlsafe(6) = generate a random 6-character string
    # Examples: "aB3xY2", "m9K2Lp", "x7QwRt"
    # token_urlsafe = URL-safe (no weird symbols that break URLs)
    # secrets = cryptographically secure (truly random, not predictable)
    
    url_mapping = URLMapping(short_code=short_code, original_url=request.original_url)
    # Create a new URLMapping object (Python object, not in DB yet)
    # short_code = the random string we just generated
    # original_url = the URL the client sent us
    # id will be auto-set by SQLAlchemy when we commit
    
    db.add(url_mapping)
    db.commit()

    
    db.refresh(url_mapping)
    # Reload the object from the database
    # Why? The database might have modified it (e.g., auto-set the id)
    # Now url_mapping.id is populated (1, 2, 3, etc)

    bloom_filter.add(short_code)  # Add to bloom filter
    memory_cache[short_code] = request.original_url  # Add to cache
    logger.info(f"Created short code: {short_code}")
    
    return {"short_code": short_code}




@app.get("/{short_code}")
def redirect_url(short_code: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    logger.info(f"Redirecting short code: {short_code}")
    
    # Check Bloom filter
    if short_code not in bloom_filter:
        logger.warning(f"Bloom filter rejected: {short_code}")
        raise HTTPException(status_code=404, detail="Short code not found")
    
    # Check In-Memory Cache
    cached_url = memory_cache.get(short_code)
    if cached_url:
        logger.info(f"Cache hit: {short_code}")
        background_tasks.add_task(log_click, short_code)
        return RedirectResponse(url=cached_url)
    
    # Query DB
    mapping = db.query(URLMapping).filter(URLMapping.short_code == short_code).first()
    
    if not mapping:
        logger.warning(f"Short code not found: {short_code}")
        raise HTTPException(status_code=404, detail="Short code not found")
    
    # Store in In-Memory Cache
    memory_cache[short_code] = mapping.original_url
    logger.info(f"Cache miss, stored in memory cache: {short_code}")
    
    background_tasks.add_task(log_click, short_code)
    return RedirectResponse(url=mapping.original_url)
# ============================================================================
# HOW TO RUN THIS
# ============================================================================
# 
# 1. Save this file as shortener.py
# 2. Install dependencies:
#    pip install fastapi sqlalchemy uvicorn
# 
# 3. Run the server:
#    uvicorn shortener:app --reload
# 
# 4. Test it:
#    
#    # Create a short URL
#    curl -X POST http://localhost:8000/shorten \
#      -H "Content-Type: application/json" \
#      -d '{"original_url": "https://google.com"}'
#    
#    Response: {"short_code": "aB3xY2"}
#    
#    # Visit the short URL (opens in browser or use curl -L to follow redirect)
#    curl -L http://localhost:8000/aB3xY2
#    (Browser redirects to https://google.com)
#    
#    # Try a non-existent code
#    curl http://localhost:8000/invalid
#    Response: {"detail": "Short code not found"}
#    Status: 404

# ============================================================================
# DATABASE FILE
# ============================================================================
# 
# After you run the code, you'll see a file called shortener.db
# This is your SQLite database. It's just a file on disk.
# 
# To inspect it, you can use:
#   sqlite3 shortener.db
#   sqlite> SELECT * FROM url_mappings;
# 
# Or use a GUI tool like DB Browser for SQLite

def generate_short_code_with_retry(db:Session, max_retries:int=5):
    for attempt in range(max_retries):
        short_code = secrets.token_urlsafe(6)
        try:
            existing=db.query(URLMapping).filter(URLMapping.short_code==short_code).first()
            if not existing:
                return short_code
        except IntegrityError:
            db.rollback()
    raise HTTPException(status_code=500, detail="Failed to generate unique short code")

