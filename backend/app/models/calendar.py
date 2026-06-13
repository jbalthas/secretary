from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base


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
    start_dt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_dt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    all_day: Mapped[bool] = mapped_column(Boolean, default=False)
    start_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    cancelled: Mapped[bool] = mapped_column(Boolean, default=False)
