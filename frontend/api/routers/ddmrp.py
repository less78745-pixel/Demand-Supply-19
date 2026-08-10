from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.orm import Session
from database import get_db
from schemas.models import ProcessedResult
import json
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import pandas as pd
import io

from services.ddmrp_engine import analyze_ddmrp_manual, analyze_ddmrp_from_file, project_ddmrp_inventory_occupancy

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
    db: Session = Depends(get_db)
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

        # Save to DB for global visibility
        try:
            result_str = json.dumps(result)
            db_result = ProcessedResult(module="ddmrp", result_json=result_str)
            # db.add(db_result)
            # db.commit()
            # db.refresh(db_result)
            result["processed_at"] = db_result.created_at.isoformat()
        except Exception as e:
            print("Failed to save to DB:", e)

        return result

    except Exception as e:
        import traceback
        traceback.print_exc()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}")


@router.post("/analyze/ddmrp/phase2-projection")
async def analyze_ddmrp_phase2_endpoint(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Run DDMRP Phase 2: Proyeksi Inventory & Occupancy (16 Weeks) from uploaded Excel file."""
    if not file.filename.lower().endswith(('.xlsx', '.xls', '.csv')):
        raise HTTPException(status_code=400, detail="Hanya file Excel (.xlsx, .xls) atau CSV yang didukung untuk simulasi ini.")
    try:
        contents = await file.read()
        result = project_ddmrp_inventory_occupancy(contents)
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        # Remove _df before returning JSON
        result.pop("_df", None)
        
        # Save to DB for global visibility
        try:
            result_str = json.dumps(result)
            db_result = ProcessedResult(module="ddmrp_phase2", result_json=result_str)
            # db.add(db_result)
            # db.commit()
            # db.refresh(db_result)
            result["processed_at"] = db_result.created_at.isoformat()
        except Exception as e:
            print("Failed to save to DB:", e)
            
        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}")


@router.post("/analyze/ddmrp/phase2-projection/export")
async def export_ddmrp_phase2_endpoint(file: UploadFile = File(...)):
    """Run DDMRP Phase 2 Proyeksi and directly return 'Hasil_Proyeksi_DDMRP.xlsx' file."""
    if not file.filename.lower().endswith(('.xlsx', '.xls', '.csv')):
        raise HTTPException(status_code=400, detail="Hanya file Excel/CSV yang didukung untuk export ini.")
    try:
        contents = await file.read()
        result = project_ddmrp_inventory_occupancy(contents)
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        
        df_master = result.get("_df")
        if df_master is None:
            raise HTTPException(status_code=500, detail="Gagal menghasilkan DataFrame proyeksi.")

        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df_master.to_excel(writer, index=False, sheet_name="Proyeksi DDMRP")
        output.seek(0)

        headers = {
            'Content-Disposition': 'attachment; filename="Hasil_Proyeksi_DDMRP.xlsx"'
        }
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers=headers
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}")

