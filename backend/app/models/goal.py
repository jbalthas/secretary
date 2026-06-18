import enum
from datetime import date, datetime, timezone
from sqlalchemy import String, Boolean, DateTime, Date, Text, Enum as SAEnum, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db import Base


class GoalType(str, enum.Enum):
    career = "career"
    life = "life"
    health = "health"
    learning = "learning"
    financial = "financial"


class GoalStatus(str, enum.Enum):
    active = "active"
    archived = "archived"
    completed = "completed"


class Goal(Base):
    __tablename__ = "goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    external_key: Mapped[str | None] = mapped_column(String(200), unique=True, nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[GoalType] = mapped_column(SAEnum(GoalType), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[GoalStatus] = mapped_column(SAEnum(GoalStatus), default=GoalStatus.active, nullable=False)
    list_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    milestones: Mapped[list["Milestone"]] = relationship(
        "Milestone", back_populates="goal", cascade="all, delete-orphan", lazy="selectin"
    )
    tasks: Mapped[list["Task"]] = relationship("Task", back_populates="goal", lazy="selectin")
    routines: Mapped[list["Routine"]] = relationship("Routine", back_populates="goal", lazy="selectin")


class Milestone(Base):
    __tablename__ = "milestones"

    id: Mapped[int] = mapped_column(primary_key=True)
    goal_id: Mapped[int] = mapped_column(ForeignKey("goals.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    done: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    goal: Mapped["Goal"] = relationship("Goal", back_populates="milestones")
