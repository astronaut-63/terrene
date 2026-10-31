from alembic import context
from backend import config as _config  # Load the same repository .env as FastAPI.
from backend.database import engine, Base

with engine.connect() as connection:
    context.configure(connection=connection, target_metadata=Base.metadata)
    with context.begin_transaction():
        context.run_migrations()
