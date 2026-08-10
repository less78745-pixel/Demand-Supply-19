from fastapi import APIRouter, UploadFile, File, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
import pandas as pd
import io
import os
import json
import uuid
import traceback

from database import get_db
from schemas.models import Upload, ProcessedResult

router = APIRouter()


@router.post("/analyze/rebalancing")
async def analyze_rebalancing_endpoint(
    stock_file: UploadFile = File(...),
    demand_file: UploadFile = File(...),
    freight_file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Optimize inter-branch stock rebalancing from 3 uploaded files.
    """
    try:
        def parse_and_save_file(upload: UploadFile, contents: bytes) -> tuple[pd.DataFrame, str]:
            name = upload.filename or "file.csv"
            
            import tempfile
            STORAGE_DIR = os.path.join(tempfile.gettempdir(), "wms_storage", "uploads")
            unique_name = f"{uuid.uuid4()}_{name}"
            file_path = os.path.join(STORAGE_DIR, unique_name)
            
            with open(file_path, "wb") as f:
                f.write(contents)
            
            file_url = f"/storage/uploads/{unique_name}"
            
            if name.endswith('.csv'):
                return pd.read_csv(io.BytesIO(contents)), file_url
            return pd.read_excel(io.BytesIO(contents)), file_url
        
        stock_contents = await stock_file.read()
        demand_contents = await demand_file.read()
        freight_contents = await freight_file.read()
        
        stock_df, stock_url = parse_and_save_file(stock_file, stock_contents)
        demand_df, demand_url = parse_and_save_file(demand_file, demand_contents)
        freight_df, freight_url = parse_and_save_file(freight_file, freight_contents)
        
        for name, df in [('Stock', stock_df), ('Demand', demand_df), ('Freight', freight_df)]:
            if df.empty:
                return JSONResponse(
                    status_code=400,
                    content={"detail": f"File {name} kosong."}
                )
        
        # Save upload records
        db_upload = Upload(module="rebalancing", file_url=f"{stock_url},{demand_url},{freight_url}")
        db.add(db_upload)
        db.commit()
        db.refresh(db_upload)
        
        from services.rebalancing_engine import analyze_rebalancing
        result = analyze_rebalancing(stock_df, demand_df, freight_df)
        
        # Save result to DB for global visibility
        result_str = json.dumps(result)
        db_result = ProcessedResult(module="rebalancing", result_json=result_str)
        db.add(db_result)
        db.commit()
        db.refresh(db_result)
        
        result["processed_at"] = db_result.created_at.isoformat()
        
        return result
        
    except ValueError as ve:
        return JSONResponse(status_code=400, content={"detail": str(ve)})
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"detail": f"Error: {str(e)}"})
