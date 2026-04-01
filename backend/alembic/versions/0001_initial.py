"""Initial migration

Revision ID: 0001
Revises:
Create Date: 2025-01-01
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('hashed_password', sa.String(255), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('role', sa.Enum('manager', 'developer', 'customer', name='userrole'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)
    op.create_index('ix_users_id', 'users', ['id'], unique=False)

    op.create_table(
        'projects',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.Enum('draft', 'active', 'completed', name='projectstatus'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('gitlab_repo_url', sa.String(512), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_projects_id', 'projects', ['id'], unique=False)

    op.create_table(
        'project_members',
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('role', sa.Enum('manager', 'developer', 'customer', name='projectmemberrole'), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('project_id', 'user_id'),
    )

    op.create_table(
        'epochs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('goals', sa.Text(), nullable=True),
        sa.Column('start_date', sa.Date(), nullable=True),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('status', sa.Enum('planning', 'active', 'completed', name='epochstatus'), nullable=False),
        sa.Column('order_index', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_epochs_id', 'epochs', ['id'], unique=False)

    op.create_table(
        'tasks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('epoch_id', sa.Integer(), nullable=True),
        sa.Column('title', sa.String(512), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.Enum('backlog', 'todo', 'in_progress', 'needs_info', 'review', 'done', name='taskstatus'), nullable=False),
        sa.Column('assignee_id', sa.Integer(), nullable=True),
        sa.Column('reporter_id', sa.Integer(), nullable=False),
        sa.Column('parent_task_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('due_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('order_index', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['assignee_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['epoch_id'], ['epochs.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['parent_task_id'], ['tasks.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['reporter_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_tasks_id', 'tasks', ['id'], unique=False)

    op.create_table(
        'task_labels',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('task_id', sa.Integer(), nullable=False),
        sa.Column('label', sa.String(100), nullable=False),
        sa.Column('color', sa.String(20), nullable=False),
        sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'task_watchers',
        sa.Column('task_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('task_id', 'user_id'),
    )

    op.create_table(
        'meetings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('epoch_id', sa.Integer(), nullable=True),
        sa.Column('task_id', sa.Integer(), nullable=True),
        sa.Column('title', sa.String(512), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.Enum('scheduling', 'scheduled', 'in_progress', 'completed', 'cancelled', name='meetingstatus'), nullable=False),
        sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('duration_minutes', sa.Integer(), nullable=False),
        sa.Column('jitsi_room_id', sa.String(255), nullable=False),
        sa.Column('recording_url', sa.String(512), nullable=True),
        sa.Column('transcript', sa.Text(), nullable=True),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('created_by_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['epoch_id'], ['epochs.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_meetings_id', 'meetings', ['id'], unique=False)

    op.create_table(
        'meeting_participants',
        sa.Column('meeting_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.Enum('pending', 'accepted', 'declined', name='meetingparticipantstatus'), nullable=False),
        sa.Column('responded_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['meeting_id'], ['meetings.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('meeting_id', 'user_id'),
    )

    op.create_table(
        'meeting_time_proposals',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('meeting_id', sa.Integer(), nullable=False),
        sa.Column('proposed_by_id', sa.Integer(), nullable=False),
        sa.Column('proposed_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('votes', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.ForeignKeyConstraint(['meeting_id'], ['meetings.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['proposed_by_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'documents',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('epoch_id', sa.Integer(), nullable=True),
        sa.Column('title', sa.String(512), nullable=False),
        sa.Column('content', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('visibility', sa.Enum('public', 'managers_devs', 'managers_only', name='documentvisibility'), nullable=False),
        sa.Column('status', sa.Enum('draft', 'pending_review', 'approved', name='documentstatus'), nullable=False),
        sa.Column('current_version', sa.Integer(), nullable=False),
        sa.Column('created_by_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['epoch_id'], ['epochs.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_documents_id', 'documents', ['id'], unique=False)

    op.create_table(
        'document_versions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('document_id', sa.Integer(), nullable=False),
        sa.Column('version_num', sa.Integer(), nullable=False),
        sa.Column('content', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('created_by_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('change_summary', sa.Text(), nullable=True),
        sa.Column('meeting_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['meeting_id'], ['meetings.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_document_versions_id', 'document_versions', ['id'], unique=False)

    op.create_table(
        'document_task_links',
        sa.Column('document_id', sa.Integer(), nullable=False),
        sa.Column('task_id', sa.Integer(), nullable=False),
        sa.Column('citation_text', sa.Text(), nullable=True),
        sa.Column('link_type', sa.Enum('manual', 'auto', name='documenttasklinktype'), nullable=False),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('document_id', 'task_id'),
    )

    op.create_table(
        'pull_requests',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('task_id', sa.Integer(), nullable=True),
        sa.Column('gitlab_pr_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(512), nullable=False),
        sa.Column('url', sa.String(512), nullable=False),
        sa.Column('status', sa.Enum('open', 'merged', 'closed', name='prstatus'), nullable=False),
        sa.Column('source_branch', sa.String(255), nullable=False),
        sa.Column('target_branch', sa.String(255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('author_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['author_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_pull_requests_id', 'pull_requests', ['id'], unique=False)

    op.create_table(
        'releases',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('epoch_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('version_tag', sa.String(100), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['epoch_id'], ['epochs.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_releases_id', 'releases', ['id'], unique=False)

    op.create_table(
        'notifications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('type', sa.Enum('mention', 'task_status_changed', 'document_updated', 'meeting_scheduled', 'pr_merged', 'pr_updated', 'sprint_update', name='notificationtype'), nullable=False),
        sa.Column('title', sa.String(512), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('entity_type', sa.String(100), nullable=True),
        sa.Column('entity_id', sa.String(100), nullable=True),
        sa.Column('is_read', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_notifications_id', 'notifications', ['id'], unique=False)


def downgrade() -> None:
    op.drop_table('notifications')
    op.drop_table('releases')
    op.drop_table('pull_requests')
    op.drop_table('document_task_links')
    op.drop_table('document_versions')
    op.drop_table('documents')
    op.drop_table('meeting_time_proposals')
    op.drop_table('meeting_participants')
    op.drop_table('meetings')
    op.drop_table('task_watchers')
    op.drop_table('task_labels')
    op.drop_table('tasks')
    op.drop_table('epochs')
    op.drop_table('project_members')
    op.drop_table('projects')
    op.drop_table('users')
