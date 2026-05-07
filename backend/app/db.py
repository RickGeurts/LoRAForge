from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "loraforge.db"

engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
)

# Tiny in-place schema patches for columns added after a table was first
# created. SQLite's CREATE TABLE IF NOT EXISTS won't add new columns to an
# existing table, so we ALTER manually. When churn slows down, replace this
# with Alembic.
_COLUMN_PATCHES: dict[str, dict[str, str]] = {
    "run": {"trace": "JSON DEFAULT '[]'"},
    "dataset": {"rows": "JSON DEFAULT '[]'"},
}


def _existing_columns(conn, table: str) -> set[str]:
    rows = conn.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()
    return {row[1] for row in rows}


def _apply_column_patches() -> None:
    with engine.begin() as conn:
        for table, columns in _COLUMN_PATCHES.items():
            existing = _existing_columns(conn, table)
            if not existing:
                continue  # table doesn't exist yet — create_all will handle it
            for column, ddl in columns.items():
                if column not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))


def init_db() -> None:
    # Import table models so SQLModel.metadata sees them before create_all.
    from app.models.adapter import AdapterTable  # noqa: F401
    from app.models.dataset import DatasetTable  # noqa: F401
    from app.models.finetune import FineTuneRunTable  # noqa: F401
    from app.models.run import RunTable  # noqa: F401
    from app.models.task import TaskTable  # noqa: F401
    from app.models.workflow import WorkflowTable  # noqa: F401

    SQLModel.metadata.create_all(engine)
    _apply_column_patches()


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
