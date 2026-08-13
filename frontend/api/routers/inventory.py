from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.orm import Session
from database import get_db
from schemas.models import ProcessedResult
import json
import asyncio
from datetime import datetime
import pandas as pd
import io
from services.inventory_engine import run_inventory_analysis, run_inventory_from_mrp_bytes
from utils.response_guard import enforce_payload_budget

router = APIRouter()

@router.post("/analyze/inventory")
async def analyze_inventory(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.lower().endswith(('.xlsx', '.xls', '.csv')):
        raise HTTPException(status_code=400, detail="Only Excel or CSV files are supported")
        
    try:
        is_mrp_multi_sheet = False
        contents = await file.read()
        if file.filename.lower().endswith(('.xlsx', '.xls')):
            import openpyxl
            try:
                wb = openpyxl.load_workbook(io.BytesIO(contents), read_only=True)
                sheet_names = wb.sheetnames
                wb.close()
                if "Raw" in sheet_names and "WH" in sheet_names:
                    is_mrp_multi_sheet = True
            except Exception:
                pass
            if is_mrp_multi_sheet:
                # Run heavy computation in a separate thread to avoid blocking the event loop
                results = await asyncio.to_thread(run_inventory_from_mrp_bytes, contents)
            else:
                df = pd.read_excel(io.BytesIO(contents))
        elif file.filename.lower().endswith('.csv'):
            try:
                # auto-detect comma vs semicolon
                df = pd.read_csv(io.BytesIO(contents), sep=None, engine='python')
            except Exception:
                df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))
        
        if not is_mrp_multi_sheet:
            # Basic schema check
            required_cols = ['Category', 'Date', 'Penjualan', 'On Hand']
            missing = [c for c in required_cols if c not in df.columns]
            if missing:
                raise HTTPException(status_code=400, detail=f"Missing columns: {missing}")
                
            # Run heavy computation in a separate thread to avoid blocking the event loop
            results = await asyncio.to_thread(run_inventory_analysis, df)
            
        # Save to DB for global visibility
        try:
            result_str = json.dumps(results)
            db_result = ProcessedResult(module="inventory", result_json=result_str)
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
        raise HTTPException(status_code=500, detail=f"Failed to process dataset: {str(e)}")
