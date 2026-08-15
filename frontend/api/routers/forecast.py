from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from database import get_db
from schemas.models import ProcessedResult
import json
import asyncio
from datetime import datetime
import pandas as pd
import io
from utils.validators import validate_forecast_schema
from utils.imputation import clean_forecast_data
from services.forecast_engine import run_forecast_pipeline
from utils.response_guard import enforce_payload_budget

router = APIRouter()

# Vercel's 4.5MB response cap makes a single-response `forecast_data` array
# unworkable for large uploads (many Cabang x Kategori groups x many months
# comfortably exceeds it). Instead of silently truncating rows, the endpoint
# below returns only the first PAGE_SIZE rows plus a `result_id`, and the
# frontend pages through the rest via GET /analyze/forecast/{result_id}/page
# - the full, untruncated data lives in Postgres (`processed_results`).
FORECAST_PAGE_SIZE = 8000

@router.post("/analyze/forecast")
async def analyze_forecast(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.lower().endswith(('.xlsx', '.xls', '.csv')):
        raise HTTPException(status_code=400, detail="Only Excel or CSV files are supported")
        
    try:
        contents = await file.read()
        if file.filename.lower().endswith('.csv'):
            try:
                # auto-detect comma vs semicolon, utf-8
                df = pd.read_csv(io.BytesIO(contents), sep=None, engine='python', encoding='utf-8')
            except UnicodeDecodeError:
                # Fallback to Windows Excel encoding
                try:
                    df = pd.read_csv(io.BytesIO(contents), sep=None, engine='python', encoding='cp1252')
                except Exception:
                    df = pd.read_csv(io.BytesIO(contents), encoding='cp1252')
            except Exception:
                df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))
        
        # Clean column names (strip whitespaces)
        df.columns = df.columns.str.strip()
        
        # Validate and clean
        validate_forecast_schema(df)
        df_clean, date_parse_failures = clean_forecast_data(df)

        if df_clean.empty:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Semua {len(df)} baris gagal diproses karena kolom 'Bulan' tidak terbaca sebagai "
                    "tanggal yang valid. Periksa format tanggalnya (contoh yang didukung: '2026-01-01', "
                    "'Januari 2026', 'Jan-2026')."
                ),
            )

        # Run heavy ML computation in a separate thread to avoid blocking the event loop
        results = await asyncio.to_thread(run_forecast_pipeline, df_clean)

        if date_parse_failures:
            total_failures = date_parse_failures + results.get('date_parse_failures', 0)
            results['date_parse_failures'] = total_failures
            results.setdefault('ai_insights', []).insert(
                0,
                f"⚠️ {total_failures} dari {len(df)} baris dibuang karena kolom 'Bulan' tidak terbaca sebagai "
                "tanggal valid — baris lainnya tetap diproses normal.",
            )
        
        # Save the full, untruncated result to DB so the frontend can page
        # through `forecast_data` for large datasets instead of losing rows
        # to the response-size guard below.
        result_id = None
        try:
            result_str = json.dumps(results)
            db_result = ProcessedResult(module="forecast", result_json=result_str)
            db.add(db_result)
            db.commit()
            db.refresh(db_result)
            result_id = db_result.id
            results["processed_at"] = (db_result.created_at or datetime.now()).isoformat()
        except Exception as e:
            print("Failed to save to DB:", e)
            results["processed_at"] = datetime.now().isoformat()

        full_forecast_data = results.get("forecast_data", [])
        total_rows = len(full_forecast_data)
        results["forecast_data"] = full_forecast_data[:FORECAST_PAGE_SIZE]
        results["result_id"] = result_id
        results["forecast_data_total_rows"] = total_rows
        results["forecast_data_page_size"] = FORECAST_PAGE_SIZE
        results["forecast_data_has_more"] = result_id is not None and total_rows > FORECAST_PAGE_SIZE

        return enforce_payload_budget(results)

    except Exception as e:
        import traceback
        traceback.print_exc()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}")


@router.get("/analyze/forecast/{result_id}/page")
async def get_forecast_page(
    result_id: int,
    offset: int = Query(0, ge=0),
    limit: int = Query(FORECAST_PAGE_SIZE, ge=1, le=FORECAST_PAGE_SIZE),
    db: Session = Depends(get_db),
):
    """Fetch a slice of a previously computed forecast's `forecast_data`.

    Lets the frontend assemble the complete (untruncated) array for large
    uploads across multiple small requests, each safely under Vercel's
    4.5MB response cap.
    """
    db_result = db.query(ProcessedResult).filter(
        ProcessedResult.id == result_id, ProcessedResult.module == "forecast"
    ).first()
    if db_result is None:
        raise HTTPException(status_code=404, detail="Hasil forecast tidak ditemukan.")

    try:
        full_results = json.loads(db_result.result_json)
    except Exception:
        raise HTTPException(status_code=500, detail="Gagal membaca hasil forecast tersimpan.")

    forecast_data = full_results.get("forecast_data", [])
    total = len(forecast_data)
    page = forecast_data[offset: offset + limit]

    return enforce_payload_budget({
        "data": page,
        "offset": offset,
        "limit": limit,
        "total": total,
        "has_more": offset + limit < total,
    })
