import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import models
from main import app, get_db
from bootstrap import AppBootstrap

# Override dependencies
engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Monkeypatch SessionLocal so startup event doesn't hit real DB
models.SessionLocal = TestingSessionLocal

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(scope="session", autouse=True)
def setup_db():
    models.Base.metadata.create_all(bind=engine)
    yield
    models.Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="module")
def client():
    # Trigger startup event manually or use TestClient context manager
    with TestClient(app) as c:
        yield c

def test_shorten_url(client):
    response = client.post("/shorten", json={"original_url": "https://example.com/test", "nickname": "TestLink"})
    assert response.status_code == 200
    data = response.json()
    assert "short_code" in data
    assert "already_exists" in data
    
    # Store session cookie for next tests
    assert "session_id" in response.cookies

def test_get_links(client):
    # Shorten a link first
    client.post("/shorten", json={"original_url": "https://example.com/abc"})
    
    response = client.get("/api/links")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    # Check that the links are in the data (order may vary)
    urls = [link["original_url"] for link in data]
    assert "https://example.com/abc" in urls

def test_stats(client):
    response = client.get("/api/stats")
    assert response.status_code == 200
    data = response.json()
    assert "total_links" in data
    assert "total_clicks" in data
    assert data["total_links"] >= 1

def test_redirect(client):
    res = client.post("/shorten", json={"original_url": "https://example.com/target"})
    short_code = res.json()["short_code"]
    
    # Do redirect
    redirect_res = client.get(f"/{short_code}", follow_redirects=False)
    assert redirect_res.status_code == 307
    assert redirect_res.headers["location"] == "https://example.com/target"

def test_delete_link(client):
    res = client.post("/shorten", json={"original_url": "https://example.com/delete_me"})
    short_code = res.json()["short_code"]
    
    del_res = client.delete(f"/api/links/{short_code}")
    assert del_res.status_code == 200
    
    # Verify it's gone
    links_res = client.get("/api/links")
    codes = [l["short_code"] for l in links_res.json()]
    assert short_code not in codes
