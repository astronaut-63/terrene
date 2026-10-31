import os
from sqlalchemy import create_engine, String, JSON, Float
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

database_url = os.getenv('DATABASE_URL', 'sqlite:///terrene.db')
engine = create_engine(database_url, pool_pre_ping=True, connect_args={'timeout': 5, 'check_same_thread': False} if database_url.startswith('sqlite:') else {})
Session = sessionmaker(engine)

class Base(DeclarativeBase):
    pass

class Trip(Base):
    __tablename__ = 'trips'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner: Mapped[str] = mapped_column(String(64), index=True)
    name: Mapped[str] = mapped_column(String(120))
    plan: Mapped[dict] = mapped_column(JSON)

class SavedPlace(Base):
    __tablename__ = 'saved_places'
    owner: Mapped[str] = mapped_column(String(64), primary_key=True)
    place_id: Mapped[str] = mapped_column(String(256), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
