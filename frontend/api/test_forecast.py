import pandas as pd
from services.forecast_engine import run_forecast_pipeline

data = {
    'Bulan': ['2024-01-01', '2024-02-01', '2024-03-01', '2024-04-01', '2024-05-01', '2024-06-01', '2024-07-01', '2024-08-01', '2024-09-01', '2024-10-01'],
    'Deskripsi': ['Januari']*10,
    'Cabang': ['Bali']*10,
    'Kategori': ['Apparel']*10,
    'Penjualan': [44806, 32476, 95630, 74635, 10000, 20000, 30000, 40000, 50000, 60000],
    'AO': [681, 296, 593, 641, 600, 600, 600, 600, 600, 600],
    'RO': [141, 227, 365, 95, 100, 100, 100, 100, 100, 100],
    'Rerata Drop Size': [956, 121, 832, 866, 800, 800, 800, 800, 800, 800],
    'NOO': [51, 8, 11, 25, 20, 20, 20, 20, 20, 20]
}
df = pd.DataFrame(data)
res = run_forecast_pipeline(df)
print(res)
