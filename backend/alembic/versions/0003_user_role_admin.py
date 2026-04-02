"""Add admin to userrole enum

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-01
"""

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE userrole ADD VALUE 'admin'")


def downgrade() -> None:
    # PostgreSQL does not support dropping enum values in a portable way.
    pass
