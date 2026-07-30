from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from services.route_optimization_engine import run_route_optimization, generate_demo_data

router = APIRouter()


class LocationInput(BaseModel):
    name: str = "Location"
    lat: float
    lon: float
    demand: float = 0.0


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
    cost_params: Optional[CostParamsInput] = None
    ga_generations: int = 100
    ga_pop_size: int = 50
    use_demo_data: bool = False


@router.post("/analyze/route-optimization")
async def analyze_route_optimization(params: RouteOptimizationInput):
    """Run route optimization with multiple methods."""
    try:
        if params.use_demo_data:
            demo = generate_demo_data(20)
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
            "cost_params": params.cost_params.model_dump() if params.cost_params else {},
            "ga_generations": params.ga_generations,
            "ga_pop_size": params.ga_pop_size,
        }

        result = run_route_optimization(run_params)

        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])

        return result

    except Exception as e:
        import traceback
        traceback.print_exc()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}")
