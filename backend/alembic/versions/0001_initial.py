"""Initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-10-15

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # All tables are created by SQLAlchemy's create_all in dev;
    # this migration is a no-op placeholder so Alembic history starts clean.
    # In production, run: alembic upgrade head (which triggers env.py create_all)
    pass


def downgrade() -> None:
    pass
