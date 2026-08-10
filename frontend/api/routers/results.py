from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import json

from database import get_db
from schemas.models import ProcessedResult

router = APIRouter()

@router.get("/results/{module_name}")
def get_latest_result(module_name: str, db: Session = Depends(get_db)):
    """
    Fetch the latest processed result for a given module globally.
    This enables real-time synchronization across all users/devices.
    """
    result = db.query(ProcessedResult).filter(ProcessedResult.module == module_name)\
               .order_by(ProcessedResult.created_at.desc()).first()
    
    if not result:
        # Return empty data instead of 404 to gracefully handle first-time loads
        return {"data": None, "message": "No data found for this module."}
    
    try:
        # result_json is stored as string in DB, parse it back to dict
        data = json.loads(result.result_json)
        # Append the DB timestamp as processed_at
        data["processed_at"] = result.created_at.isoformat()
        return {"data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to parse result data")
