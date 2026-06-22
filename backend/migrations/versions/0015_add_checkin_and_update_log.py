"""add check-in columns and update_log table"""
from alembic import op
import sqlalchemy as sa

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("app_settings") as batch_op:
        batch_op.add_column(sa.Column("check_in_hour", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("check_in_minute", sa.Integer(), nullable=True))
    op.create_table(
        "update_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("update_id", sa.String(length=200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_update_log_update_id", "update_log", ["update_id"], unique=True)


def downgrade():
    op.drop_index("ix_update_log_update_id", table_name="update_log")
    op.drop_table("update_log")
    with op.batch_alter_table("app_settings") as batch_op:
        batch_op.drop_column("check_in_minute")
        batch_op.drop_column("check_in_hour")
