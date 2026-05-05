from collections.abc import Iterator
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "loraforge.db"

engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
)


def init_db() -> None:
    # Import table models so SQLModel.metadata sees them before create_all.
    from app.models.adapter import AdapterTable  # noqa: F401
    from app.models.run import RunTable  # noqa: F401
    from app.models.workflow import WorkflowTable  # noqa: F401

    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
