"""User techs + git repo URL

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-02
"""

from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("git_repo_url", sa.String(length=512), nullable=True))
    op.create_table(
        "user_techs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("tech", sa.String(length=200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "tech", name="uq_user_tech"),
    )
    op.create_index("ix_user_techs_user_id", "user_techs", ["user_id"], unique=False)
    op.create_index("ix_user_techs_tech", "user_techs", ["tech"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_user_techs_tech", table_name="user_techs")
    op.drop_index("ix_user_techs_user_id", table_name="user_techs")
    op.drop_table("user_techs")
    op.drop_column("users", "git_repo_url")

