from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.orm import Session
from database import get_db
from schemas.models import ProcessedResult
import json
from fastapi.responses import Response
import pandas as pd
import io
from utils.validators import validate_occupancy_schema
from utils.imputation import clean_occupancy_data
from services.occupancy_engine import calculate_occupancy, calculate_mrp_occupancy_from_bytes, generate_mrp_template_bytes

router = APIRouter()

@router.get("/analyze/occupancy/template")
async def get_mrp_template():
    try:
        content = generate_mrp_template_bytes()
        return Response(
            content=content,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=Template_Occupancy_MRP_Raw_WH.xlsx"}
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Gagal generate template: {str(e)}")

@router.post("/analyze/occupancy")
async def analyze_occupancy(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.lower().endswith(('.xlsx', '.xls', '.csv')):
        raise HTTPException(status_code=400, detail="Only Excel or CSV files are supported")
        
    try:
        contents = await file.read()
        if file.filename.lower().endswith(('.xlsx', '.xls')):
            import openpyxl
            is_mrp_multi_sheet = False
            try:
                wb = openpyxl.load_workbook(io.BytesIO(contents), read_only=True)
                sheet_names = wb.sheetnames
                wb.close()
                if "Raw" in sheet_names and "WH" in sheet_names:
                    is_mrp_multi_sheet = True
            except Exception:
                pass
            if is_mrp_multi_sheet:
                return calculate_mrp_occupancy_from_bytes(contents)
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
        
        # Save to DB for global visibility
        try:
            result_str = json.dumps(results)
            db_result = ProcessedResult(module="occupancy", result_json=result_str)
            # db.add(db_result)
            # db.commit()
            # db.refresh(db_result)
            results["processed_at"] = db_result.created_at.isoformat()
        except Exception as e:
            print("Failed to save to DB:", e)
        
        return results
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}")
