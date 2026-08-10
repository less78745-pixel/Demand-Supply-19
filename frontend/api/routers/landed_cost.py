from fastapi import APIRouter, UploadFile, File, Form, Depends
from sqlalchemy.orm import Session
from database import get_db
from schemas.models import ProcessedResult
import json
from fastapi.responses import JSONResponse
import pandas as pd
import io
import traceback

router = APIRouter()


@router.post("/analyze/landed-cost")
async def analyze_landed_cost_endpoint(
    tracking_file: UploadFile = File(...),
    allocation_file: UploadFile = File(...),
    exchange_rate: str = Form("16000"),
    db: Session = Depends(get_db)
):
    """
    Analyze import container clearance and landed cost.
    
    tracking_file: No_BL, No_Container, Status, ETA_Port, Free_Time_End, costs...
    allocation_file: No_BL, SKU, Qty, Weight_Kg, Volume_CBM
    """
    try:
        def parse_file(upload: UploadFile, contents: bytes) -> pd.DataFrame:
            name = upload.filename or ""
            if name.endswith('.csv'):
                return pd.read_csv(io.BytesIO(contents))
            return pd.read_excel(io.BytesIO(contents))
        
        tracking_contents = await tracking_file.read()
        allocation_contents = await allocation_file.read()
        
        tracking_df = parse_file(tracking_file, tracking_contents)
        allocation_df = parse_file(allocation_file, allocation_contents)
        
        for name, df in [('Tracking', tracking_df), ('Allocation', allocation_df)]:
            if df.empty:
                return JSONResponse(status_code=400, content={"detail": f"File {name} kosong."})
        
        try:
            rate = float(exchange_rate)
        except Exception:
            rate = 16000.0
        
        from services.landed_cost_engine import analyze_landed_cost
        result = analyze_landed_cost(tracking_df, allocation_df, exchange_rate=rate)
        
        # Save to DB for global visibility
        try:
            result_str = json.dumps(result)
            db_result = ProcessedResult(module="landed_cost", result_json=result_str)
            db.add(db_result)
            db.commit()
            db.refresh(db_result)
            result["processed_at"] = db_result.created_at.isoformat()
        except Exception as e:
            print("Failed to save to DB:", e)
            
        return result
        
    except ValueError as ve:
        return JSONResponse(status_code=400, content={"detail": str(ve)})
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"detail": f"Error: {str(e)}"})
