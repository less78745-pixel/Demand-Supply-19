from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import tempfile
import os

from database import engine
from schemas import models

# Initialize DB tables
models.Base.metadata.create_all(bind=engine)

# Use /tmp for ephemeral storage to avoid Vercel Read-Only File System Crash
STORAGE_DIR = os.path.join(tempfile.gettempdir(), "wms_storage")
UPLOADS_DIR = os.path.join(STORAGE_DIR, "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

from routers import occupancy, forecast, export, simulator, inventory, chat
from routers import safety_stock, rebalancing, landed_cost, control_tower
from routers import ddmrp, route_optimization, wh_trans_mp
from routers import results # We will create this

app = FastAPI(title="Demand Supply Planning API")

# Mount static files for uploads
app.mount("/storage", StaticFiles(directory=STORAGE_DIR), name="storage")

from fastapi.middleware.gzip import GZipMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(GZipMiddleware, minimum_size=1000)

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
app.include_router(wh_trans_mp.router, prefix="/api/v1", tags=["WH-TRANS-MP"])
app.include_router(results.router, prefix="/api/v1", tags=["Global Results"])

@app.get("/")
def read_root():
    return {"message": "Demand Supply Planning API is running"}

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "Demand Supply Planning Backend"}

