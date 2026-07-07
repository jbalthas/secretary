"""add parent_task_id to tasks and scheduled_blocks

Revision ID: 0020
Revises: 0019
Create Date: 2026-07-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0020"
down_revision: Union[str, None] = "0019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.add_column(sa.Column("parent_task_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_tasks_parent_task_id", "tasks", ["parent_task_id"], ["id"], ondelete="SET NULL",
        )
    op.create_index("ix_tasks_parent_task_id", "tasks", ["parent_task_id"])

    with op.batch_alter_table("scheduled_blocks") as batch_op:
        batch_op.add_column(sa.Column("parent_task_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_scheduled_blocks_parent_task_id", "tasks", ["parent_task_id"], ["id"], ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("scheduled_blocks") as batch_op:
        batch_op.drop_constraint("fk_scheduled_blocks_parent_task_id", type_="foreignkey")
        batch_op.drop_column("parent_task_id")

    op.drop_index("ix_tasks_parent_task_id", table_name="tasks")
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.drop_constraint("fk_tasks_parent_task_id", type_="foreignkey")
        batch_op.drop_column("parent_task_id")
