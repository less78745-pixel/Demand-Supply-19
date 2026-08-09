import io
import pandas as pd

def parse_wh_trans_file(file_bytes, cost_per_cbm, max_capacity=None):
    # Read sheets
    xls = pd.ExcelFile(io.BytesIO(file_bytes))
    
    # 1. Demand Data
    if 'Demand' not in xls.sheet_names:
        raise ValueError("Sheet 'Demand' not found")
    df_demand = pd.read_excel(xls, 'Demand')
    # Expected columns: ID_Customer, Latitude, Longitude, Volume_Demand_Bulanan
    customers = []
    for _, row in df_demand.iterrows():
        customers.append({
            'id': str(row.get('ID_Customer', '')),
            'lat': float(row['Latitude']),
            'lon': float(row['Longitude']),
            'volume': float(row['Volume_Demand_Bulanan'])
        })
        
    # 2. RedZones
    red_zones = []
    if 'RedZone' in xls.sheet_names:
        df_rz = pd.read_excel(xls, 'RedZone')
        # Expected: ID_Zone, Latitude, Longitude, Radius
        for _, row in df_rz.iterrows():
            red_zones.append({
                'id': str(row.get('ID_Zone', '')),
                'name': str(row.get('ID_Zone', 'RedZone')),
                'lat': float(row['Latitude']),
                'lon': float(row['Longitude']),
                'radius': float(row['Radius'])
            })
            
    # 3. Supply (Optional for calculating central hub)
    # For Central Hub, we can either use the first supply point or the average of demand
    central_hub = {'lat': 0.0, 'lon': 0.0}
    if 'Supply' in xls.sheet_names:
        df_supply = pd.read_excel(xls, 'Supply')
        if not df_supply.empty:
            central_hub = {
                'lat': float(df_supply.iloc[0]['Latitude']),
                'lon': float(df_supply.iloc[0]['Longitude'])
            }
        else:
            # fallback to center of demand
            central_hub = {
                'lat': df_demand['Latitude'].mean(),
                'lon': df_demand['Longitude'].mean()
            }
    else:
        # fallback to center of demand
        central_hub = {
            'lat': df_demand['Latitude'].mean(),
            'lon': df_demand['Longitude'].mean()
        }
        
    return {
        'customers': customers,
        'red_zones': red_zones,
        'central_hub': central_hub,
        'cost_per_cbm_km': cost_per_cbm
    }
