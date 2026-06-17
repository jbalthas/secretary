"""create scheduled_blocks table and add work-hours columns to app_settings

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0009'
down_revision: Union[str, None] = '0008'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "scheduled_blocks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("task_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("start_dt", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_dt", sa.DateTime(timezone=True), nullable=False),
        sa.Column("date_key", sa.String(10), nullable=False),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_scheduled_blocks_date_key", "scheduled_blocks", ["date_key"])

    with op.batch_alter_table("app_settings") as batch_op:
        batch_op.add_column(sa.Column("work_start_hour", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("work_start_minute", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("work_end_hour", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("work_end_minute", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("app_settings") as batch_op:
        batch_op.drop_column("work_end_minute")
        batch_op.drop_column("work_end_hour")
        batch_op.drop_column("work_start_minute")
        batch_op.drop_column("work_start_hour")

    op.drop_index("ix_scheduled_blocks_date_key", table_name="scheduled_blocks")
    op.drop_table("scheduled_blocks")
