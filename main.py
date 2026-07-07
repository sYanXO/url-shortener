from fastapi import FastAPI, Depends
from fastapi.responses import RedirectResponse
from sqlalchemy import create_engine, Column, String, Integer
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from pydantic import BaseModel
from fastapi import HTTPException
import secrets

app = FastAPI()

DATABASE_URL = "sqlite:///./shortener.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class URLMapping(Base):
    __tablename__ = "url_mappings"
    id = Column(Integer, primary_key=True, index=True)
    short_code = Column(String, unique=True, index=True)
    original_url = Column(String)

Base.metadata.create_all(bind=engine)

class URLRequest(BaseModel):
    original_url: str

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/")
def read_root():
    return {"message": "URL Shortener"}

@app.post("/shorten")
def shorten(request: URLRequest, db: Session = Depends(get_db)):
    short_code = secrets.token_urlsafe(6)
    url_mapping = URLMapping(short_code=short_code, original_url=request.original_url)
    db.add(url_mapping)
    db.commit()
    db.refresh(url_mapping)
    return {"short_code": short_code}

@app.get("/{short_code}")
def redirect_url(short_code: str, db: Session = Depends(get_db)):
    mapping = db.query(URLMapping).filter(URLMapping.short_code == short_code).first()
    if not mapping:
        raise HTTPException(status_code=404, detail="Short code not found")
    return RedirectResponse(url=mapping.original_url)