"""exact offer shares

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("flow_offers") as batch:
        batch.alter_column("share", type_=sa.Float(), existing_nullable=False)


def downgrade() -> None:
    with op.batch_alter_table("flow_offers") as batch:
        batch.alter_column("share", type_=sa.Integer(), existing_nullable=False)
