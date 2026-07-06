from datetime import datetime, timezone

from sqlalchemy import Boolean, String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.calendar import UtcDateTime


class ScheduledBlock(Base):
    __tablename__ = "scheduled_blocks"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    start_dt: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)
    end_dt: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)
    date_key: Mapped[str] = mapped_column(String(10), index=True)
    approved_at: Mapped[datetime] = mapped_column(
        UtcDateTime, default=lambda: datetime.now(timezone.utc)
    )
    completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
