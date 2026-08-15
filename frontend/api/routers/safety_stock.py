from fastapi import APIRouter, UploadFile, File, Query, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from schemas.models import ProcessedResult
import json
import asyncio
from datetime import datetime
from fastapi.responses import JSONResponse
import pandas as pd
import io
import traceback
from utils.response_guard import enforce_payload_budget

router = APIRouter()


@router.post("/analyze/safety-stock")
async def analyze_safety_stock_endpoint(
    file: UploadFile = File(...),
    service_level: float = Query(0.95, ge=0.80, le=0.99),
    db: Session = Depends(get_db)
):
    """
    Analyze Safety Stock & ROP from uploaded Excel/CSV file.
    
    Expected columns: Cabang, SKU, Daily_Usage, Lead_Time_Days
    Optional: Current_Stock, In_Transit, Backorder, MOQ, Order_Cycle_Days
    """
    try:
        contents = await file.read()
        filename = file.filename or ""
        
        # Parse file
        if filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))
        
        if df.empty:
            return JSONResponse(
                status_code=400,
                content={"detail": "File kosong. Pastikan file berisi data."}
            )
        
        from services.safety_stock_engine import analyze_safety_stock
        result = await asyncio.to_thread(analyze_safety_stock, df, service_level)
        
        # Save to DB for global visibility
        try:
            result_str = json.dumps(result)
            db_result = ProcessedResult(module="safety_stock", result_json=result_str)
            db.add(db_result)
            db.commit()
            db.refresh(db_result)
            result["processed_at"] = (db_result.created_at or datetime.now()).isoformat()
        except Exception as e:
            print("Failed to save to DB:", e)
            result["processed_at"] = datetime.now().isoformat()

        return enforce_payload_budget(result)

    except ValueError as ve:
        return JSONResponse(
            status_code=400,
            content={"detail": str(ve)}
        )
    except HTTPException as he:
        return JSONResponse(status_code=he.status_code, content={"detail": he.detail})
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error processing file: {str(e)}"}
        )
