from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from database import get_db
from schemas.models import ProcessedResult
import json
import asyncio
from datetime import datetime
from pydantic import BaseModel
from typing import Optional

from services.route_optimization_engine import run_route_optimization, generate_demo_data
from utils.response_guard import enforce_payload_budget

router = APIRouter()


class LocationInput(BaseModel):
    name: str = "Location"
    lat: float
    lon: float
    demand: float = 0.0
    is_dedicated: bool = False


class CostParamsInput(BaseModel):
    fuel_price_per_liter: float = 13500
    fuel_efficiency_km_per_liter: float = 8
    driver_cost_per_day: float = 250000
    fixed_cost_per_vehicle: float = 150000
    maintenance_per_km: float = 500
    carbon_price_per_kg: float = 50000
    emission_factor_kg_per_km: float = 0.00027
    traffic_factor: float = 1.0
    avg_speed_kmh: float = 40


class RouteOptimizationInput(BaseModel):
    depot: Optional[LocationInput] = None
    customers: Optional[list[LocationInput]] = None
    vehicle_capacity: float = 100
    num_vehicles: int = 8
    num_dedicated_vehicles: int = 2
    cost_params: Optional[CostParamsInput] = None
    ga_generations: int = 100
    ga_pop_size: int = 50
    use_demo_data: bool = False


@router.post("/analyze/route-optimization")
async def analyze_route_optimization(params: RouteOptimizationInput, db: Session = Depends(get_db)):
    """Run route optimization with multiple methods."""
    try:
        if params.use_demo_data:
            demo = generate_demo_data(20, params.num_dedicated_vehicles)
            depot = demo["depot"]
            customers = demo["customers"]
        else:
            if not params.depot or not params.customers:
                raise HTTPException(
                    status_code=400,
                    detail="Depot dan customers harus disertakan, atau gunakan use_demo_data=true."
                )
            depot = params.depot.model_dump()
            customers = [c.model_dump() for c in params.customers]

        run_params = {
            "depot": depot,
            "customers": customers,
            "vehicle_capacity": params.vehicle_capacity,
            "num_vehicles": params.num_vehicles,
            "num_dedicated_vehicles": params.num_dedicated_vehicles,
            "cost_params": params.cost_params.model_dump() if params.cost_params else {},
            "ga_generations": params.ga_generations,
            "ga_pop_size": params.ga_pop_size,
        }

        result = await asyncio.to_thread(run_route_optimization, run_params)

        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])

        # Save to DB for global visibility
        try:
            result_str = json.dumps(result)
            db_result = ProcessedResult(module="route_optimization", result_json=result_str)
            db.add(db_result)
            db.commit()
            db.refresh(db_result)
            result["processed_at"] = (db_result.created_at or datetime.now()).isoformat()
        except Exception as e:
            print("Failed to save to DB:", e)
            result["processed_at"] = datetime.now().isoformat()

        return enforce_payload_budget(result)

    except Exception as e:
        import traceback
        traceback.print_exc()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}")


from fastapi import UploadFile, File, Form
import pandas as pd
import io
from services.route_optimization_engine import analyze_routes_from_file

@router.post("/analyze/route-optimization/file")
async def analyze_route_optimization_file(
    file: UploadFile = File(...),
    vehicle_capacity: float = Form(100),
    num_vehicles: int = Form(8),
    num_dedicated_vehicles: int = Form(2),
    ga_generations: int = Form(100),
    ga_pop_size: int = Form(50),
    fuel_price_per_liter: float = Form(13500),
    fuel_efficiency_km_per_liter: float = Form(8),
    driver_cost_per_day: float = Form(250000),
    driver_cost_per_hour: float = Form(35000),
    fixed_cost_per_vehicle: float = Form(150000),
    maintenance_per_km: float = Form(500),
    carbon_price_per_kg: float = Form(50000),
    emission_factor_kg_per_km: float = Form(0.00027),
    traffic_factor: float = Form(1.0),
    avg_speed_kmh: float = Form(40),
    service_time_per_stop_mins: float = Form(30),
    db: Session = Depends(get_db)
):
    """Run route optimization from an uploaded Excel or CSV file."""
    try:
        contents = await file.read()
        
        # Determine file type
        filename_lower = file.filename.lower() if file.filename else ""
        if filename_lower.endswith(".csv"):
            try:
                df = pd.read_csv(io.BytesIO(contents), sep=None, engine='python', encoding='utf-8')
            except UnicodeDecodeError:
                try:
                    df = pd.read_csv(io.BytesIO(contents), sep=None, engine='python', encoding='cp1252')
                except Exception:
                    df = pd.read_csv(io.BytesIO(contents), encoding='cp1252')
            except Exception:
                df = pd.read_csv(io.BytesIO(contents))
        elif filename_lower.endswith((".xls", ".xlsx", ".xlsm", ".xlsb")):
            df = pd.read_excel(io.BytesIO(contents))
        else:
            raise HTTPException(status_code=400, detail="Hanya mendukung file CSV atau Excel (.xls, .xlsx)")

        df.columns = df.columns.str.strip()

        cost_params = {
            "fuel_price_per_liter": fuel_price_per_liter,
            "fuel_efficiency_km_per_liter": fuel_efficiency_km_per_liter,
            "driver_cost_per_day": driver_cost_per_day,
            "driver_cost_per_hour": driver_cost_per_hour,
            "fixed_cost_per_vehicle": fixed_cost_per_vehicle,
            "maintenance_per_km": maintenance_per_km,
            "carbon_price_per_kg": carbon_price_per_kg,
            "emission_factor_kg_per_km": emission_factor_kg_per_km,
            "traffic_factor": traffic_factor,
            "avg_speed_kmh": avg_speed_kmh,
            "service_time_per_stop_mins": service_time_per_stop_mins
        }

        run_params = {
            "vehicle_capacity": vehicle_capacity,
            "num_vehicles": num_vehicles,
            "num_dedicated_vehicles": num_dedicated_vehicles,
            "cost_params": cost_params,
            "ga_generations": ga_generations,
            "ga_pop_size": ga_pop_size,
        }

        result = await asyncio.to_thread(analyze_routes_from_file, df, run_params)

        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])

        # Save to DB for global visibility
        try:
            result_str = json.dumps(result)
            db_result = ProcessedResult(module="route_optimization", result_json=result_str)
            db.add(db_result)
            db.commit()
            db.refresh(db_result)
            result["processed_at"] = (db_result.created_at or datetime.now()).isoformat()
        except Exception as e:
            print("Failed to save to DB:", e)
            result["processed_at"] = datetime.now().isoformat()

        return enforce_payload_budget(result)

    except Exception as e:
        import traceback
        traceback.print_exc()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}")

