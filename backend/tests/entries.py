"""Helpers that add entries through the API, for tests that need a month with
entries."""

from fastapi.testclient import TestClient
from httpx2 import Response

from app.schemas.entry import EntryCreate, EntryRead
from tests.months import SEPTEMBER_PATH, send_json

SEPTEMBER_ENTRIES_PATH = f"{SEPTEMBER_PATH}/entries"


def post_entry(
    client: TestClient,
    headers: dict[str, str],
    new_entry: EntryCreate,
    path: str = SEPTEMBER_ENTRIES_PATH,
) -> Response:
    return send_json(client, "POST", path, headers, new_entry)


def create_entry(
    client: TestClient,
    headers: dict[str, str],
    new_entry: EntryCreate,
    path: str = SEPTEMBER_ENTRIES_PATH,
) -> EntryRead:
    """Add the entry to the month at `path` (September by default), failing the test
    unless the API accepts it."""
    response = post_entry(client, headers, new_entry, path)
    assert response.status_code == 201, response.text
    return EntryRead.model_validate(response.json())
