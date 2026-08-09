import pandas as pd
from services.inventory_engine import run_inventory_analysis

df = pd.DataFrame([
    {"Cabang": "A", "Category": "B", "Date": "2026-01-01", "Penjualan": 10, "On Hand": 5, "PeriodLabel": "W1"}
])
res = run_inventory_analysis(df)
print(res)
