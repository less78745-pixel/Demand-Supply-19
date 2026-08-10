from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from database import Base

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
    result_json = Column(Text) # Storing JSON string
    status = Column(String, default="success")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
