"""add advisory_log table, app_settings.last_advisory_at, goals.priority_rank"""

from alembic import op
import sqlalchemy as sa

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "advisory_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("advisory_id", sa.String(length=200), nullable=False),
        sa.Column("result_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_advisory_log_advisory_id", "advisory_log", ["advisory_id"], unique=True)

    with op.batch_alter_table("app_settings") as batch_op:
        batch_op.add_column(sa.Column("last_advisory_at", sa.DateTime(timezone=True), nullable=True))

    with op.batch_alter_table("goals") as batch_op:
        batch_op.add_column(sa.Column("priority_rank", sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table("goals") as batch_op:
        batch_op.drop_column("priority_rank")

    with op.batch_alter_table("app_settings") as batch_op:
        batch_op.drop_column("last_advisory_at")

    op.drop_index("ix_advisory_log_advisory_id", table_name="advisory_log")
    op.drop_table("advisory_log")
