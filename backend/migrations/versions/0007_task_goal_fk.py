"""add goal_id, external_key, is_habit, estimated_minutes to tasks

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0007'
down_revision: Union[str, None] = '0006'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.add_column(sa.Column("goal_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("external_key", sa.String(200), nullable=True))
        batch_op.add_column(sa.Column("is_habit", sa.Boolean(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("estimated_minutes", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_tasks_goal_id",
            "goals",
            ["goal_id"],
            ["id"],
            ondelete="SET NULL",
        )
    op.create_index("ix_tasks_external_key", "tasks", ["external_key"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_tasks_external_key", table_name="tasks")
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.drop_constraint("fk_tasks_goal_id", type_="foreignkey")
        batch_op.drop_column("estimated_minutes")
        batch_op.drop_column("is_habit")
        batch_op.drop_column("external_key")
        batch_op.drop_column("goal_id")
