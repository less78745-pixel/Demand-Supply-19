from fastapi import APIRouter, UploadFile, File, Query
from fastapi.responses import JSONResponse
import pandas as pd
import io
import traceback

router = APIRouter()


@router.post("/analyze/safety-stock")
async def analyze_safety_stock_endpoint(
    file: UploadFile = File(...),
    service_level: float = Query(0.95, ge=0.80, le=0.99),
):
    """
    Analyze Safety Stock & ROP from uploaded Excel/CSV file.
    
    Expected columns: Cabang, SKU, Daily_Usage, Lead_Time_Days
    Optional: Current_Stock, In_Transit, Backorder, MOQ, Order_Cycle_Days
    """
    try:
        contents = await file.read()
        filename = file.filename or ""
        
        # Parse file
        if filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))
        
        if df.empty:
            return JSONResponse(
                status_code=400,
                content={"detail": "File kosong. Pastikan file berisi data."}
            )
        
        from services.safety_stock_engine import analyze_safety_stock
        result = analyze_safety_stock(df, service_level=service_level)
        
        return result
        
    except ValueError as ve:
        return JSONResponse(
            status_code=400,
            content={"detail": str(ve)}
        )
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error processing file: {str(e)}"}
        )
