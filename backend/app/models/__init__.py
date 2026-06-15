import enum
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, Text, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base


class Priority(str, enum.Enum):
    high = "high"
    medium = "medium"
    low = "low"


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority: Mapped[Priority] = mapped_column(SAEnum(Priority), default=Priority.medium)
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reminder_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    recurrence_cron: Mapped[str | None] = mapped_column(String(100), nullable=True)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class AppSettings(Base):
    __tablename__ = "app_settings"
    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    brief_hour: Mapped[int] = mapped_column(default=8)
    brief_minute: Mapped[int] = mapped_column(default=0)
    tts_enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class RoutineAction(str, enum.Enum):
    send_daily_brief = "send_daily_brief"


class Routine(Base):
    __tablename__ = "routines"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    cron: Mapped[str] = mapped_column(String(100), nullable=False)
    action: Mapped[RoutineAction] = mapped_column(SAEnum(RoutineAction), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


from app.models.calendar import CalendarEvent, CalendarSync  # noqa: E402,F401
