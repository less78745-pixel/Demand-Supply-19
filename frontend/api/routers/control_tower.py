from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
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


@router.post("/analyze/control-tower")
async def analyze_control_tower_endpoint(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Analyze SCM health across branches for Control Tower dashboard.
    
    Expected columns: Cabang, In_Stock_Rate, Days_of_Supply, OTIF_Score
    Optional: Current_Stock, ROP_Level, Category, Region
    """
    try:
        contents = await file.read()
        filename = file.filename or ""
        
        if filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))
        
        if df.empty:
            return JSONResponse(status_code=400, content={"detail": "File kosong."})
        
        from services.control_tower_engine import analyze_control_tower
        result = await asyncio.to_thread(analyze_control_tower, df)
        
        # Save to DB for global visibility
        try:
            result_str = json.dumps(result)
            db_result = ProcessedResult(module="control_tower", result_json=result_str)
            # db.add(db_result)
            # db.commit()
            # db.refresh(db_result)
            result["processed_at"] = (db_result.created_at or datetime.now()).isoformat()
        except Exception as e:
            print("Failed to save to DB:", e)
            result["processed_at"] = datetime.now().isoformat()

        return enforce_payload_budget(result)

    except ValueError as ve:
        return JSONResponse(status_code=400, content={"detail": str(ve)})
    except HTTPException as he:
        return JSONResponse(status_code=he.status_code, content={"detail": he.detail})
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"detail": f"Error: {str(e)}"})
