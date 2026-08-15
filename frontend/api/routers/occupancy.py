from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.orm import Session
from database import get_db
from schemas.models import ProcessedResult
import json
import asyncio
from datetime import datetime
from fastapi.responses import Response
import pandas as pd
import io
from services.occupancy_engine import calculate_mrp_occupancy_from_bytes, generate_mrp_template_bytes

router = APIRouter()

# Vercel Serverless Functions hard-cap the request/response body at 4.5MB
# regardless of plan. If the computed result (mainly the reconstructed Excel
# workbook re-embedded as base64) would still blow past that after the
# duplicate-payload fix, degrade gracefully instead of letting the platform
# kill the whole response with an opaque FUNCTION_PAYLOAD_TOO_LARGE error.
# Gzip handles payload compression effectively, but we still strip excel_base64
# for massive datasets to preserve server memory and client rendering stability.
RESPONSE_SAFE_LIMIT_BYTES = 10 * 1024 * 1024

def _enforce_response_budget(results: dict) -> dict:
    try:
        size = len(json.dumps(results, default=str))
    except Exception:
        return results
        
    if size <= RESPONSE_SAFE_LIMIT_BYTES:
        return results

    mrp = results.get("mrp_results")
    if isinstance(mrp, dict) and mrp.get("excel_base64"):
        mrp["excel_base64"] = None
        mrp["excel_download_unavailable"] = True
        results["warning"] = (
            "Dataset sangat besar. File Excel hasil olahan tidak disertakan dalam response "
            "untuk menghemat bandwidth. Analisa & chart tetap ditampilkan normal."
        )

    # Let it pass through. Gzip compression will shrink the repetitive JSON arrays by ~90%
    # easily bringing it under the Vercel 4.5MB hard limit.
    return results

@router.get("/analyze/occupancy/template")
async def get_mrp_template():
    try:
        content = generate_mrp_template_bytes()
        return Response(
            content=content,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=Template_Occupancy_MRP_Raw_WH.xlsx"}
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Gagal generate template: {str(e)}")

@router.post("/analyze/occupancy")
async def analyze_occupancy(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.lower().endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Only Excel files are supported for MRP analysis")
        
    try:
        contents = await file.read()
        
        try:
            results = await asyncio.to_thread(calculate_mrp_occupancy_from_bytes, contents)
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=str(ve))
        
        # Save to DB for global visibility
        try:
            result_str = json.dumps(results)
            db_result = ProcessedResult(module="occupancy", result_json=result_str)
            db.add(db_result)
            db.commit()
            db.refresh(db_result)
            results["processed_at"] = (db_result.created_at or datetime.now()).isoformat()
        except Exception as e:
            print("Failed to save to DB:", e)
            results["processed_at"] = datetime.now().isoformat()
        
        return _enforce_response_budget(results)
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}")
