# ============================================================================
# IMPORTS - bringing in libraries we need
# ============================================================================

from fastapi import FastAPI, Depends
# FastAPI = web framework for building APIs
# Depends = FastAPI's way to inject dependencies (we'll use this for DB)

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

# ============================================================================
# INITIALIZE THE APP
# ============================================================================

app = FastAPI()
# Create the FastAPI app object. This is what runs the web server.

app.mount("/static", StaticFiles(directory="static"), name="static")
# Serve static assets (CSS/JS/images) from the static/ folder at the /static URL path.

# ============================================================================
# DATABASE SETUP
# ============================================================================

DATABASE_URL = "sqlite:///./shortener.db"
# SQLite connection string
# "sqlite:///" = use SQLite
# "./shortener.db" = create/use a file called shortener.db in current directory
# This is a local file database, not a remote server (good for learning)

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
# create_engine = opens/creates the database connection
# connect_args={"check_same_thread": False} = SQLite normally complains if you use it
#   from different threads (for safety). We're telling it "don't worry, FastAPI handles this"
#   This is safe to use for learning/small projects.

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
# sessionmaker = a FACTORY that creates new database sessions
# autocommit=False = don't auto-save changes. We have to explicitly call db.commit()
# autoflush=False = don't auto-flush pending changes. We control when to flush
# bind=engine = use the engine we just created to make sessions
# 
# Think of it like: SessionLocal() returns a new "session" object each time you call it

Base = declarative_base()
# declarative_base = creates a base class for all our table definitions
# When we define URLMapping(Base), SQLAlchemy knows it's a table definition
# This is the ORM (Object-Relational Mapping) magic

# ============================================================================
# DATABASE TABLE DEFINITION (as a Python class)
# ============================================================================

class URLMapping(Base):
    # Inherit from Base so SQLAlchemy knows this is a table definition
    
    __tablename__ = "url_mappings"
    # The actual table name in the database
    # SQLAlchemy will create a table called "url_mappings" in shortener.db
    
    # Each of the following are COLUMNS in the url_mappings table:
    
    id = Column(Integer, primary_key=True, index=True)
    # id = column name
    # Integer = data type (whole numbers)
    # primary_key=True = this is the main unique identifier for each row
    # index=True = SQLAlchemy auto-increments this (1, 2, 3, ...)
    #             also makes searches by id faster
    
    short_code = Column(String, unique=True, index=True)
    # short_code = column name (stores the shortened code like "aB3xY2")
    # String = text data
    # unique=True = no two rows can have the same short_code
    #              (prevents duplicate shortened URLs)
    # index=True = makes searches by short_code faster
    
    original_url = Column(String)
    # original_url = column name (stores the long URL)
    # String = text data
    # (no unique or index needed - multiple URLs might exist, lookups aren't as frequent)

# ============================================================================
# CREATE THE TABLE IN THE DATABASE (if it doesn't exist)
# ============================================================================

Base.metadata.create_all(bind=engine)
# This runs ONCE when the app starts
# Looks at all classes that inherit from Base (just URLMapping so far)
# Creates the actual SQL table in shortener.db if it doesn't exist
# 
# Behind the scenes, this essentially runs:
#   CREATE TABLE url_mappings (
#       id INTEGER PRIMARY KEY,
#       short_code TEXT UNIQUE,
#       original_url TEXT
#   );
# 
# If the table already exists, this does nothing (safe to run multiple times)

# ============================================================================
# REQUEST DATA VALIDATION (Pydantic)
# ============================================================================
from urllib.parse import urlparse
from pydantic import BaseModel, field_validator
def is_valid_url(url:str)->bool:
    try:
        res = urlparse(url)
        return all([res.scheme, res.netloc])
    except:
        return False
class URLRequest(BaseModel):
    # When a client sends JSON to /shorten, Pydantic parses it into this class
    # This validates that the JSON has the right structure
    
    original_url: str

    @field_validator('original_url')
    @classmethod
    def validate_url(cls,v):
        if not is_valid_url(v):
            raise ValueError('Invalid URL format')
        return v
    # original_url = field name
    # str = must be a string
    # No default = it's REQUIRED (client must include it)
    #
    # Valid JSON:
    #   {"original_url": "https://google.com"}
    # 
    # Invalid JSON (FastAPI rejects these):
    #   {}                                     (missing field)
    #   {"original_url": 123}                  (not a string)
    #   {"original_url": "url", "extra": "x"}  (extra fields are ignored but ok)

# ============================================================================
# DEPENDENCY INJECTION HELPER
# ============================================================================

def get_db():
    # This function is called by FastAPI automatically (via Depends)
    # It creates and manages a database session for each request
    
    db = SessionLocal()
    # Create a new session
    # SessionLocal() returns a Session object that can query/add/delete/etc
    # Each request gets its own session (no cross-request contamination)
    
    try:
        # "Try to do the following, and if something goes wrong..."
        yield db
        # yield = pause here and let the route function use this 'db'
        # When the route function finishes, come back here and continue
    finally:
        # "...no matter what, run this code"
        # This runs AFTER the route function finishes
        # (Even if the route raised an error, finally runs)
        db.close()
        # Close the database connection and clean up
        # This is important! Don't leave connections open.

# ============================================================================
# ROUTE 1: HOME PAGE
# ============================================================================

@app.get("/")
# @app.get() = FastAPI decorator that registers a GET endpoint at "/"
# When someone visits http://localhost:8000/, this function runs

def read_root():
    # Serve the frontend HTML page at the root URL ("/")
    return FileResponse("static/index.html")

# ============================================================================
# ROUTE 2: SHORTEN A URL
# ============================================================================

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
    
    
    
    # Actually write the queued changes to the database
    # Now the row physically exists in shortener.db
    # If something fails here, the entire transaction is rolled back (nothing gets saved)
    
    db.refresh(url_mapping)
    # Reload the object from the database
    # Why? The database might have modified it (e.g., auto-set the id)
    # Now url_mapping.id is populated (1, 2, 3, etc)

    logger.info(f"Created short code: {short_code}")
    
    return {"short_code": short_code}
    # Return the short code to the client
    # Client gets: {"short_code": "aB3xY2"}
    # They can now use http://localhost:8000/aB3xY2 to access it

# ============================================================================
# ROUTE 3: REDIRECT TO ORIGINAL URL
# ============================================================================

@app.get("/{short_code}")
# @app.get("/{short_code}") = GET endpoint with a path parameter
# The {} means it's a variable
# If client visits http://localhost:8000/aB3xY2, short_code="aB3xY2"
# If client visits http://localhost:8000/xyz123, short_code="xyz123"

def redirect_url(short_code: str, db: Session = Depends(get_db)):
    # short_code: str = FastAPI extracts "aB3xY2" from the URL and passes it here
    # db: Session = same dependency injection as before

    logger.info(f"Redirecting short code: {short_code}")
    
    mapping = db.query(URLMapping).filter(URLMapping.short_code == short_code).first()
    # db.query(URLMapping) = "I want to search the url_mappings table"
    # .filter(URLMapping.short_code == short_code) = "where short_code matches what the user entered"
    #                                                 (e.g., short_code == "aB3xY2")
    # .first() = "give me the first result, or None if nothing matches"
    # 
    # In SQL terms, this is like:
    #   SELECT * FROM url_mappings WHERE short_code = 'aB3xY2' LIMIT 1;
    # 
    # mapping = either a URLMapping object, or None
    
    if not mapping:
        # If the short code doesn't exist in the database
        raise HTTPException(status_code=404, detail="Short code not found")
        # Send a 404 error to the client
        # Response: {"detail": "Short code not found"}

    logger.info(f"Redirecting {short_code} to {mapping.original_url}")
    
    return RedirectResponse(url=mapping.original_url)
    # mapping.original_url = the long URL stored in the database
    # RedirectResponse = send an HTTP redirect (301 or 302)
    # Browser automatically follows the redirect
    # 
    # Example:
    #   Client visits http://localhost:8000/aB3xY2
    #   Server responds with a redirect to https://google.com
    #   Browser follows the redirect and shows google.com
    #   User sees https://google.com in the address bar

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

