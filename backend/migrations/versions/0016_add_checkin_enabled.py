"""add check_in_enabled to app_settings"""
from alembic import op
import sqlalchemy as sa

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("app_settings") as batch_op:
        batch_op.add_column(sa.Column("check_in_enabled", sa.Boolean(), nullable=True))


def downgrade():
    with op.batch_alter_table("app_settings") as batch_op:
        batch_op.drop_column("check_in_enabled")
