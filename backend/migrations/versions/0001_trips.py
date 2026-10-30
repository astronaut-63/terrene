from alembic import op
import sqlalchemy as sa

revision = '0001'
down_revision = None

def upgrade():
    op.create_table('trips', sa.Column('id', sa.String(36), primary_key=True), sa.Column('owner', sa.String(64), nullable=False), sa.Column('name', sa.String(120), nullable=False), sa.Column('plan', sa.JSON(), nullable=False))
    op.create_index('ix_trips_owner', 'trips', ['owner'])

def downgrade():
    op.drop_table('trips')
