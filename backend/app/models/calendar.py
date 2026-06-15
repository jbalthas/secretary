from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, Text
from sqlalchemy.types import TypeDecorator
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base


class UtcDateTime(TypeDecorator):
    """DateTime stored as UTC; always read back as a UTC tz-aware datetime.

    SQLite drops tzinfo on store, returning naive datetimes on read. The whole
    app stores UTC, so re-attach UTC on read to keep timed events tz-aware.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if isinstance(value, str):
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if isinstance(value, datetime) and value.tzinfo is not None:
            return value.astimezone(timezone.utc)
        return value

    def process_result_value(self, value, dialect):
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value


class CalendarSync(Base):
    __tablename__ = "calendar_sync"
    id: Mapped[int] = mapped_column(primary_key=True)
    credentials_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    sync_token: Mapped[str | None] = mapped_column(String(500), nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CalendarEvent(Base):
    __tablename__ = "calendar_events"
    google_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    title: Mapped[str] = mapped_column(String(500), default="(No title)")
    start_dt: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)
    end_dt: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)
    all_day: Mapped[bool] = mapped_column(Boolean, default=False)
    start_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    cancelled: Mapped[bool] = mapped_column(Boolean, default=False)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
