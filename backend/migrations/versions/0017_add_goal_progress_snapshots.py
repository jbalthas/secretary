"""add goal progress snapshots"""

from alembic import op
import sqlalchemy as sa

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "goal_progress_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "goal_id",
            sa.Integer(),
            sa.ForeignKey("goals.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("snapshotted_on", sa.Date(), nullable=False),
        sa.Column("progress_pct", sa.Integer(), nullable=False),
        sa.Column("milestones_done", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tasks_completed_week", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tasks_slipped_week", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_snapshot_goal_date",
        "goal_progress_snapshots",
        ["goal_id", "snapshotted_on"],
        unique=True,
    )


def downgrade():
    op.drop_index("ix_snapshot_goal_date", table_name="goal_progress_snapshots")
    op.drop_table("goal_progress_snapshots")
