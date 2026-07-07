"""add group_photos table"""

from alembic import op
import sqlalchemy as sa

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "group_photos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("group_key", sa.String(length=200), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_group_photos_group_key", "group_photos", ["group_key"], unique=True)


def downgrade():
    op.drop_index("ix_group_photos_group_key", table_name="group_photos")
    op.drop_table("group_photos")
