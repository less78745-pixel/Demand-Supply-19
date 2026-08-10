"""
Script to create tables on Supabase directly.
Run once to initialize the database.
"""
import os
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime
from sqlalchemy.orm import declarative_base
from sqlalchemy.sql import func
from sqlalchemy import inspect

url = "postgresql://postgres.zynoznmdxcttkokyildh:j%40A_4f%252%2BSc8H%23%26@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres"

Base = declarative_base()

class Upload(Base):
    __tablename__ = "uploads"
    id = Column(Integer, primary_key=True, index=True)
    module = Column(String, index=True)
    file_url = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class ProcessedResult(Base):
    __tablename__ = "processed_results"
    id = Column(Integer, primary_key=True, index=True)
    module = Column(String, index=True)
    result_json = Column(Text)
    status = Column(String, default="success")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

print("Connecting to Supabase...")
engine = create_engine(url)

print("Creating tables...")
Base.metadata.create_all(bind=engine)
print("Tables created successfully!")

# Verify
inspector = inspect(engine)
tables = inspector.get_table_names()
print(f"Tables in database: {tables}")
