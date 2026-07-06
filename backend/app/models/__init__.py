import enum
from datetime import datetime, timezone, date
from sqlalchemy import String, Boolean, DateTime, Date, Text, Enum as SAEnum, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
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
    goal_id: Mapped[int | None] = mapped_column(ForeignKey("goals.id", ondelete="SET NULL"), nullable=True)
    external_key: Mapped[str | None] = mapped_column(String(200), unique=True, nullable=True, index=True)
    is_habit: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    estimated_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    list_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    parent_list_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    goal: Mapped["Goal | None"] = relationship("Goal", back_populates="tasks", lazy="selectin")


class AppSettings(Base):
    __tablename__ = "app_settings"
    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    brief_hour: Mapped[int] = mapped_column(default=8)
    brief_minute: Mapped[int] = mapped_column(default=0)
    tts_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    work_start_hour: Mapped[int] = mapped_column(Integer, default=9)
    work_start_minute: Mapped[int] = mapped_column(Integer, default=0)
    work_end_hour: Mapped[int] = mapped_column(Integer, default=18)
    work_end_minute: Mapped[int] = mapped_column(Integer, default=0)
    stall_threshold_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_guidance_sent_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    check_in_hour: Mapped[int | None] = mapped_column(Integer, nullable=True)
    check_in_minute: Mapped[int | None] = mapped_column(Integer, nullable=True)
    check_in_enabled: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    last_advisory_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class UpdateLog(Base):
    __tablename__ = "update_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    update_id: Mapped[str] = mapped_column(String(200), unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class AdvisoryLog(Base):
    __tablename__ = "advisory_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    advisory_id: Mapped[str] = mapped_column(String(200), unique=True, nullable=False, index=True)
    result_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


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
    goal_id: Mapped[int | None] = mapped_column(ForeignKey("goals.id", ondelete="SET NULL"), nullable=True)
    external_key: Mapped[str | None] = mapped_column(String(200), unique=True, nullable=True, index=True)
    goal: Mapped["Goal | None"] = relationship("Goal", back_populates="routines", lazy="selectin")


from app.models.calendar import CalendarEvent, CalendarSync  # noqa: E402,F401
from app.models.goal import Goal, Milestone, GoalProgressSnapshot, GoalType, GoalStatus  # noqa: E402,F401
from app.models.plan import ScheduledBlock  # noqa: E402,F401
