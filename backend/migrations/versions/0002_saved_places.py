from alembic import op
import sqlalchemy as sa

revision = '0002'
down_revision = '0001'

def upgrade():
    op.create_table(
        'saved_places',
        sa.Column('owner', sa.String(64), nullable=False),
        sa.Column('place_id', sa.String(256), nullable=False),
        sa.Column('name', sa.String(120), nullable=False),
        sa.Column('display_name', sa.String(256), nullable=True),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.PrimaryKeyConstraint('owner', 'place_id'),
    )
    op.create_index('ix_saved_places_owner', 'saved_places', ['owner'])

def downgrade():
    op.drop_index('ix_saved_places_owner', table_name='saved_places')
    op.drop_table('saved_places')
