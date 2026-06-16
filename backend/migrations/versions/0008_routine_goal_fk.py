"""add goal_id and external_key to routines

Revision ID: 0008
Revises: 0007
Create Date: 2026-06-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0008'
down_revision: Union[str, None] = '0007'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("routines") as batch_op:
        batch_op.add_column(sa.Column("goal_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("external_key", sa.String(200), nullable=True))
        batch_op.create_foreign_key(
            "fk_routines_goal_id",
            "goals",
            ["goal_id"],
            ["id"],
            ondelete="SET NULL",
        )
    op.create_index("ix_routines_external_key", "routines", ["external_key"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_routines_external_key", table_name="routines")
    with op.batch_alter_table("routines") as batch_op:
        batch_op.drop_constraint("fk_routines_goal_id", type_="foreignkey")
        batch_op.drop_column("external_key")
        batch_op.drop_column("goal_id")
