from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import Optional
import pandas as pd
import io

from services.ddmrp_engine import analyze_ddmrp_manual, analyze_ddmrp_from_file

router = APIRouter()


class DDMRPManualInput(BaseModel):
    adu: float = 50.0
    dlt_days: float = 14.0
    moq: float = 1.0
    order_cycle_days: float = 7.0
    on_hand: float = 200.0
    on_order: float = 0.0
    qualified_demand: float = 50.0
    cov_override: float = 0.40


class DDMRPFileParams(BaseModel):
    dlt_days: float = 14.0
    moq: float = 1.0
    order_cycle_days: float = 7.0
    on_hand: float = 200.0
    on_order: float = 0.0
    qualified_demand: float = 50.0


@router.post("/analyze/ddmrp/manual")
async def analyze_ddmrp_manual_endpoint(params: DDMRPManualInput):
    """Run DDMRP analysis from manual form input (single SKU)."""
    try:
        result = analyze_ddmrp_manual(params.model_dump())
        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}")


@router.post("/analyze/ddmrp")
async def analyze_ddmrp_file_endpoint(
    file: UploadFile = File(...),
    dlt_days: float = 14.0,
    moq: float = 1.0,
    order_cycle_days: float = 7.0,
    on_hand: float = 200.0,
    on_order: float = 0.0,
    qualified_demand: float = 50.0,
):
    """Run DDMRP analysis from uploaded sales data file."""
    if not file.filename.lower().endswith(('.xlsx', '.xls', '.csv')):
        raise HTTPException(status_code=400, detail="Only Excel or CSV files are supported")

    try:
        contents = await file.read()
        if file.filename.lower().endswith('.csv'):
            try:
                df = pd.read_csv(io.BytesIO(contents), sep=None, engine='python', encoding='utf-8')
            except UnicodeDecodeError:
                try:
                    df = pd.read_csv(io.BytesIO(contents), sep=None, engine='python', encoding='cp1252')
                except Exception:
                    df = pd.read_csv(io.BytesIO(contents), encoding='cp1252')
            except Exception:
                df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))

        df.columns = df.columns.str.strip()

        result = analyze_ddmrp_from_file(
            df=df,
            dlt_days=dlt_days,
            moq=moq,
            order_cycle_days=order_cycle_days,
            default_on_hand=on_hand,
            default_on_order=on_order,
            default_qualified_demand=qualified_demand
        )

        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])

        return result

    except Exception as e:
        import traceback
        traceback.print_exc()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}")
