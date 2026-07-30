from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import occupancy, forecast, export, simulator, inventory, chat
from routers import safety_stock, rebalancing, landed_cost, control_tower
from routers import ddmrp, route_optimization

app = FastAPI(title="Demand Supply Planning API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(occupancy.router, prefix="/api/v1", tags=["Occupancy"])
app.include_router(forecast.router, prefix="/api/v1", tags=["Forecast"])
app.include_router(export.router, prefix="/api/v1", tags=["Export"])
app.include_router(simulator.router, prefix="/api/v1", tags=["Simulator"])
app.include_router(inventory.router, prefix="/api/v1", tags=["Inventory"])
app.include_router(chat.router, prefix="/api/v1", tags=["Chat"])
app.include_router(safety_stock.router, prefix="/api/v1", tags=["SCM - Safety Stock"])
app.include_router(rebalancing.router, prefix="/api/v1", tags=["SCM - Rebalancing"])
app.include_router(landed_cost.router, prefix="/api/v1", tags=["SCM - Landed Cost"])
app.include_router(control_tower.router, prefix="/api/v1", tags=["SCM - Control Tower"])
app.include_router(ddmrp.router, prefix="/api/v1", tags=["DDMRP"])
app.include_router(route_optimization.router, prefix="/api/v1", tags=["Route Optimization"])

@app.get("/")
def read_root():
    return {"message": "Demand Supply Planning API is running"}

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "Demand Supply Planning Backend"}

