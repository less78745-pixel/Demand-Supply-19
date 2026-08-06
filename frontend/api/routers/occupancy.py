from fastapi import APIRouter, UploadFile, File, HTTPException
import pandas as pd
import io
from utils.validators import validate_occupancy_schema
from utils.imputation import clean_occupancy_data
from services.occupancy_engine import calculate_occupancy, calculate_ddmrp_occupancy_from_bytes

router = APIRouter()

@router.post("/analyze/occupancy")
async def analyze_occupancy(file: UploadFile = File(...)):
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
                    return calculate_ddmrp_occupancy_from_bytes(contents)
            except Exception:
                pass
            df = pd.read_excel(io.BytesIO(contents))
        elif file.filename.lower().endswith('.csv'):
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
        
        # Validate and clean
        validate_occupancy_schema(df)
        df_clean = clean_occupancy_data(df)
        
        results = calculate_occupancy(df_clean)
        
        return results
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}")
