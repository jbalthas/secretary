"""add tasks table

Revision ID: 0002
Revises: fb2466e21e43
Create Date: 2026-06-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0002"
down_revision: Union[str, None] = "fb2466e21e43"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tasks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("priority", sa.String(10), nullable=False, server_default="medium"),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reminder_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("recurrence_cron", sa.String(100), nullable=True),
        sa.Column("completed", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("tasks")
