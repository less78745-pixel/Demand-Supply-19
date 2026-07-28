from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import occupancy, forecast, export, simulator, inventory, chat

app = FastAPI(title="WMS Advanced Analytics API")

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

@app.get("/")
def read_root():
    return {"message": "WMS Analytics API is running"}

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "WMS Analytics Backend"}
