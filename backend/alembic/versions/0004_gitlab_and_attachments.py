"""GitLab project id + document file attachments

Revision ID: 0004
Revises: 0003
Create Date: 2026-04-01
"""

from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("gitlab_project_id", sa.Integer(), nullable=True))
    op.create_index("ix_projects_gitlab_project_id", "projects", ["gitlab_project_id"], unique=False)

    op.create_table(
        "document_attachments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("document_id", sa.Integer(), nullable=False),
        sa.Column("storage_key", sa.String(512), nullable=False),
        sa.Column("original_filename", sa.String(512), nullable=False),
        sa.Column("mime_type", sa.String(255), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("created_by_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_document_attachments_id", "document_attachments", ["id"], unique=False)
    op.create_index("ix_document_attachments_document_id", "document_attachments", ["document_id"], unique=False)


def downgrade() -> None:
    op.drop_table("document_attachments")
    op.drop_index("ix_projects_gitlab_project_id", table_name="projects")
    op.drop_column("projects", "gitlab_project_id")
