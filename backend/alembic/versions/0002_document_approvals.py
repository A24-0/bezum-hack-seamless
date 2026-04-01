"""Add document approvals

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-01
"""

from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "document_approvals",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("document_id", sa.Integer(), nullable=False),
        sa.Column("version_num", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("decision", sa.Enum("approved", "rejected", name="documentapprovaldecision"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("document_id", "version_num", "user_id", name="uq_doc_approval"),
    )
    op.create_index("ix_document_approvals_id", "document_approvals", ["id"], unique=False)
    op.create_index(
        "ix_document_approvals_document_version",
        "document_approvals",
        ["document_id", "version_num"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_document_approvals_document_version", table_name="document_approvals")
    op.drop_index("ix_document_approvals_id", table_name="document_approvals")
    op.drop_table("document_approvals")
    op.execute("DROP TYPE IF EXISTS documentapprovaldecision")

