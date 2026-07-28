import pandas as pd
from fastapi import HTTPException

OCCUPANCY_COLUMNS = ['Cabang', 'Category', 'On Hand', 'In', 'Out', 'Capacity', 'Date']
FORECAST_COLUMNS = ['Bulan', 'Deskripsi', 'Cabang', 'Kategori', 'Penjualan', 'AO', 'RO', 'Rerata Drop Size', 'NOO']

def validate_occupancy_schema(df: pd.DataFrame):
    missing_cols = [col for col in OCCUPANCY_COLUMNS if col not in df.columns]
    if missing_cols:
        raise HTTPException(
            status_code=422,
            detail=f"Missing required columns for Occupancy: {', '.join(missing_cols)}"
        )
    return True

def validate_forecast_schema(df: pd.DataFrame):
    missing_cols = [col for col in FORECAST_COLUMNS if col not in df.columns]
    if missing_cols:
        raise HTTPException(
            status_code=422,
            detail=f"Missing required columns for Forecast: {', '.join(missing_cols)}"
        )
    return True
