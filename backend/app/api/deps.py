from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.db.session import get_db

# Shared dependencies for route handlers, e.g. `def list_months(db: DbSession) -> ...`.
DbSession = Annotated[Session, Depends(get_db)]
