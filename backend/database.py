import os
from sqlalchemy import create_engine, String, JSON
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

engine = create_engine(os.getenv('DATABASE_URL', 'sqlite:///terrene.db'))
Session = sessionmaker(engine)

class Base(DeclarativeBase):
    pass

class Trip(Base):
    __tablename__ = 'trips'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner: Mapped[str] = mapped_column(String(64), index=True)
    name: Mapped[str] = mapped_column(String(120))
    plan: Mapped[dict] = mapped_column(JSON)
