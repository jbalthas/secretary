"""add guidance columns: completed_at on tasks, stall_threshold_days + last_guidance_sent_date on app_settings

Revision ID: 0010
Revises: 0009
Create Date: 2026-06-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0010'
down_revision: Union[str, None] = '0009'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.add_column(sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True))

    with op.batch_alter_table("app_settings") as batch_op:
        batch_op.add_column(sa.Column("stall_threshold_days", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("last_guidance_sent_date", sa.Date(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("app_settings") as batch_op:
        batch_op.drop_column("last_guidance_sent_date")
        batch_op.drop_column("stall_threshold_days")

    with op.batch_alter_table("tasks") as batch_op:
        batch_op.drop_column("completed_at")
