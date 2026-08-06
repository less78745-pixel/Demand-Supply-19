from fastapi import APIRouter, UploadFile, File, HTTPException
import pandas as pd
import io
from services.inventory_engine import run_inventory_analysis

router = APIRouter()

@router.post("/analyze/inventory")
async def analyze_inventory(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(('.xlsx', '.xls', '.csv')):
        raise HTTPException(status_code=400, detail="Only Excel or CSV files are supported")
        
    try:
        contents = await file.read()
        if file.filename.lower().endswith(('.xlsx', '.xls')):
            import openpyxl
            try:
                wb = openpyxl.load_workbook(io.BytesIO(contents), read_only=True)
                sheet_names = wb.sheetnames
                wb.close()
                if "Raw" in sheet_names and "WH" in sheet_names:
                    from ddmrp_program import process_ddmrp_in_memory
                    res = process_ddmrp_in_memory(contents)
                    return res.get("inventory_analysis", {})
            except Exception:
                pass
            df = pd.read_excel(io.BytesIO(contents))
        elif file.filename.lower().endswith('.csv'):
            try:
                # auto-detect comma vs semicolon
                df = pd.read_csv(io.BytesIO(contents), sep=None, engine='python')
            except Exception:
                df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))
        
        # Basic schema check
        required_cols = ['Category', 'Date', 'Penjualan', 'On Hand']
        missing = [c for c in required_cols if c not in df.columns]
        if missing:
            raise HTTPException(status_code=400, detail=f"Missing columns: {missing}")
            
        results = run_inventory_analysis(df)
        return results
        
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Failed to process dataset: {str(e)}")
