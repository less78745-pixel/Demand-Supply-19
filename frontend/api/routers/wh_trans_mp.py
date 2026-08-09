from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Dict, Any
import logging
from services.wh_trans_mp_service import generate_dummy_data, simulate_network, parse_wh_trans_file


logger = logging.getLogger(__name__)
router = APIRouter()

class SimulateRequest(BaseModel):
    num_hubs: int
    data: Dict[str, Any]

@router.get("/wh-trans/dummy-data")
def get_dummy_data(num_customers: int = 100):
    try:
        data = generate_dummy_data(num_customers)
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(f"Error generating dummy data: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/wh-trans/simulate")
def run_simulation(req: SimulateRequest):
    try:
        result = simulate_network(req.data, req.num_hubs)
        return {"status": "success", "result": result}
    except Exception as e:
        logger.error(f"Error running network simulation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/wh-trans/file")
async def run_simulation_file(
    file: UploadFile = File(...),
    num_hubs: int = Form(...),
    cost_per_cbm_km: float = Form(...)
):
    try:
        contents = await file.read()
        data = parse_wh_trans_file(contents, cost_per_cbm_km)
        result = simulate_network(data, num_hubs)
        return {"status": "success", "result": result, "data_summary": data}
    except Exception as e:
        logger.error(f"Error processing WH-TRANS-MP file: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
