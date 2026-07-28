from fastapi import APIRouter, UploadFile, File, HTTPException
import pandas as pd
import io
from utils.validators import validate_forecast_schema
from utils.imputation import clean_forecast_data
from services.forecast_engine import run_forecast_pipeline

router = APIRouter()

@router.post("/analyze/forecast")
async def analyze_forecast(file: UploadFile = File(...)):
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
        df_clean = clean_forecast_data(df)
        
        results = run_forecast_pipeline(df_clean)
        
        return results
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}")
