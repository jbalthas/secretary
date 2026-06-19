"""add parent list names to tasks and goals

Revision ID: 0013
Revises: 0012
Create Date: 2026-06-19 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.add_column(sa.Column("parent_list_name", sa.String(100), nullable=True))
    with op.batch_alter_table("goals") as batch_op:
        batch_op.add_column(sa.Column("parent_list_name", sa.String(100), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("goals") as batch_op:
        batch_op.drop_column("parent_list_name")
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.drop_column("parent_list_name")
