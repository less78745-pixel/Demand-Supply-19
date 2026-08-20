from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
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
    # Diisi hanya oleh alur upload async (BackgroundTasks) -- dipakai frontend
    # untuk membedakan "hasil upload saya sendiri" vs "update dari user lain"
    # di realtime subscription, karena alur async tidak lagi punya processed_at
    # yang diketahui secara sinkron sebelum baris ini benar-benar ter-insert.
    job_id = Column(String, nullable=True)

class DspProcessingJob(Base):
    """Status tracking untuk upload async (Supabase Storage -> FastAPI BackgroundTasks).
    id disimpan bertipe String (bukan native UUID SQLAlchemy) supaya tetap portable
    dengan fallback SQLite lokal di database.py, dan dibuat oleh Postgres/Supabase
    lewat `default gen_random_uuid()` di sisi DDL, bukan di sisi ORM."""
    __tablename__ = "dsp_processing_jobs"

    id = Column(String, primary_key=True, index=True)
    module = Column(String, index=True, nullable=False)
    storage_path = Column(String, nullable=False)
    status = Column(String, nullable=False, default="pending")
    error_message = Column(Text, nullable=True)
    result_id = Column(Integer, ForeignKey("processed_results.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
