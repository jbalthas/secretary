"""Single source of truth for the tts_enabled flag.

Patchable at app.services.tts_settings.get_tts_enabled without touching
the database models or router code directly. Uses the same DB file as the
async engine so tests (which replace app_db.engine) work correctly.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app import db as app_db


def get_tts_enabled() -> bool:
    """Read tts_enabled from AppSettings id=1. Returns True if no row exists."""
    from app.models import AppSettings

    sync_url = str(app_db.engine.url).replace("+aiosqlite", "")
    engine = create_engine(sync_url)
    with sessionmaker(engine)() as session:
        row = session.get(AppSettings, 1)
    engine.dispose()
    return row.tts_enabled if row is not None else True
