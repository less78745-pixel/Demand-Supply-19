from fastapi import APIRouter, UploadFile, File
from fastapi.responses import JSONResponse
import pandas as pd
import io
import traceback

router = APIRouter()


@router.post("/analyze/rebalancing")
async def analyze_rebalancing_endpoint(
    stock_file: UploadFile = File(...),
    demand_file: UploadFile = File(...),
    freight_file: UploadFile = File(...),
):
    """
    Optimize inter-branch stock rebalancing from 3 uploaded files.
    
    stock_file: Cabang, SKU, Qty_Available
    demand_file: Cabang, Entity, SKU, Qty_Needed, Max_Lead_Time_Days
    freight_file: Origin, Destination, Mode, Cost_Per_Ton, Capacity_Max, Lead_Time_Est
    """
    try:
        def parse_file(upload: UploadFile, contents: bytes) -> pd.DataFrame:
            name = upload.filename or ""
            if name.endswith('.csv'):
                return pd.read_csv(io.BytesIO(contents))
            return pd.read_excel(io.BytesIO(contents))
        
        stock_contents = await stock_file.read()
        demand_contents = await demand_file.read()
        freight_contents = await freight_file.read()
        
        stock_df = parse_file(stock_file, stock_contents)
        demand_df = parse_file(demand_file, demand_contents)
        freight_df = parse_file(freight_file, freight_contents)
        
        for name, df in [('Stock', stock_df), ('Demand', demand_df), ('Freight', freight_df)]:
            if df.empty:
                return JSONResponse(
                    status_code=400,
                    content={"detail": f"File {name} kosong."}
                )
        
        from services.rebalancing_engine import analyze_rebalancing
        result = analyze_rebalancing(stock_df, demand_df, freight_df)
        
        return result
        
    except ValueError as ve:
        return JSONResponse(status_code=400, content={"detail": str(ve)})
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"detail": f"Error: {str(e)}"})
