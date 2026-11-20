from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext

from app.db import Base, engine, init_db


def test_migrations_match_models() -> None:
    init_db()
    with engine.connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn), Base.metadata)
    assert diff == []
