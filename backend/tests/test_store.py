import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from cachetools import LRUCache
from pybloom_live import BloomFilter

from models import Base, URLMapping, Click
from store import URLRepository, AnalyticsRepository

# Setup in-memory DB for tests
engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    yield db
    db.close()
    Base.metadata.drop_all(bind=engine)

@pytest.fixture
def cache():
    return LRUCache(maxsize=100)

@pytest.fixture
def bloom_filter():
    return BloomFilter(capacity=1000, error_rate=0.001)

@pytest.fixture
def url_repo(db_session, cache, bloom_filter):
    return URLRepository(db_session, cache, bloom_filter)

@pytest.fixture
def analytics_repo(db_session):
    return AnalyticsRepository(db_session)

def test_create_and_resolve_url(url_repo):
    original_url = "https://example.com"
    owner_id = "test_owner"
    
    result = url_repo.create(original_url, nickname="Example", owner_id=owner_id)
    assert "short_code" in result
    assert result["already_exists"] is False
    
    short_code = result["short_code"]
    
    # Test resolve
    resolved_url = url_repo.resolve(short_code)
    assert resolved_url == original_url

def test_resolve_not_found(url_repo):
    # Missing short code should raise HTTP 404
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        url_repo.resolve("nonexistent")
    assert exc.value.status_code == 404

def test_get_links_ownership(url_repo):
    url_repo.create("https://example.com/1", nickname=None, owner_id="owner_A")
    url_repo.create("https://example.com/2", nickname=None, owner_id="owner_A")
    url_repo.create("https://example.com/3", nickname=None, owner_id="owner_B")
    
    links_a = url_repo.get_links(owner_id="owner_A", limit=10)
    assert len(links_a) == 2
    
    links_b = url_repo.get_links(owner_id="owner_B", limit=10)
    assert len(links_b) == 1

def test_update_nickname(url_repo):
    res = url_repo.create("https://example.com", nickname=None, owner_id="owner_A")
    short_code = res["short_code"]
    
    # Update as owner
    new_nick = url_repo.update_nickname(short_code, "New Nick", "owner_A")
    assert new_nick == "New Nick"
    
    # Update as someone else
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        url_repo.update_nickname(short_code, "Hacked", "owner_B")
    assert exc.value.status_code == 404  # Not found for this owner

def test_delete_link(url_repo, db_session):
    res = url_repo.create("https://example.com", nickname=None, owner_id="owner_A")
    short_code = res["short_code"]
    
    # Delete as owner
    url_repo.delete(short_code, "owner_A")
    
    # Should not exist
    with pytest.raises(Exception):
        url_repo.resolve(short_code)

def test_analytics_record_and_stats(url_repo, analytics_repo):
    res = url_repo.create("https://example.com", nickname=None, owner_id="owner_A")
    short_code = res["short_code"]
    
    analytics_repo.record_click(short_code)
    analytics_repo.record_click(short_code)
    
    stats = analytics_repo.get_stats("owner_A")
    assert stats["total_links"] == 1
    assert stats["total_clicks"] == 2
