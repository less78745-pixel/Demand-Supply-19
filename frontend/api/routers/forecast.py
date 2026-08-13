from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
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
        
        # Save to DB for global visibility
        try:
            result_str = json.dumps(results)
            db_result = ProcessedResult(module="forecast", result_json=result_str)
            # db.add(db_result)
            # db.commit()
            # db.refresh(db_result)
            results["processed_at"] = (db_result.created_at or datetime.now()).isoformat()
        except Exception as e:
            print("Failed to save to DB:", e)
            results["processed_at"] = datetime.now().isoformat()
        
        return enforce_payload_budget(results)

    except Exception as e:
        import traceback
        traceback.print_exc()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}")
