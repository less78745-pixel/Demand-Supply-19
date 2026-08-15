import pandas as pd
import numpy as np
from sklearn.cluster import KMeans
import folium
import math
import random

# Haversine formula to calculate distance between two coordinates in KM
def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    lat1_rad = math.radians(lat1)
    lon1_rad = math.radians(lon1)
    lat2_rad = math.radians(lat2)
    lon2_rad = math.radians(lon2)
    
    dlon = lon2_rad - lon1_rad
    dlat = lat2_rad - lat1_rad
    
    a = math.sin(dlat / 2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c

# Vectorized haversine (same formula as `haversine` above, but over whole
# numpy arrays at once) - `simulate_network` used to call the scalar version
# through `df.apply(..., axis=1)`, which is still a per-row Python-level loop
# under the hood and doesn't scale to large customer uploads.
def haversine_vec(lat1, lon1, lat2, lon2):
    R = 6371.0
    lat1_rad = np.radians(lat1)
    lon1_rad = np.radians(lon1)
    lat2_rad = np.radians(lat2)
    lon2_rad = np.radians(lon2)

    dlon = lon2_rad - lon1_rad
    dlat = lat2_rad - lat1_rad

    a = np.sin(dlat / 2) ** 2 + np.cos(lat1_rad) * np.cos(lat2_rad) * np.sin(dlon / 2) ** 2
    c = 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))

    return R * c

# Function to calculate new coordinate given starting point, distance, and bearing
def get_destination_point(lat, lon, distance, bearing_degrees):
    R = 6371.0
    lat_rad = math.radians(lat)
    lon_rad = math.radians(lon)
    bearing_rad = math.radians(bearing_degrees)
    
    dest_lat_rad = math.asin(
        math.sin(lat_rad) * math.cos(distance / R) +
        math.cos(lat_rad) * math.sin(distance / R) * math.cos(bearing_rad)
    )
    
    dest_lon_rad = lon_rad + math.atan2(
        math.sin(bearing_rad) * math.sin(distance / R) * math.cos(lat_rad),
        math.cos(distance / R) - math.sin(lat_rad) * math.sin(dest_lat_rad)
    )
    
    return math.degrees(dest_lat_rad), math.degrees(dest_lon_rad)

# Anti-Gravity Repulsion Logic
def apply_anti_gravity(hub_lat, hub_lon, red_zones):
    final_lat, final_lon = hub_lat, hub_lon
    pushed = False
    
    # Iterate through red zones to see if hub is inside any
    for rz in red_zones:
        dist = haversine(final_lat, final_lon, rz['lat'], rz['lon'])
        if dist < rz['radius']:
            pushed = True
            # Calculate bearing from Red Zone to Hub to push it outwards
            # If perfectly aligned, push randomly
            if dist == 0:
                bearing = random.uniform(0, 360)
            else:
                dLon = math.radians(final_lon - rz['lon'])
                y = math.sin(dLon) * math.cos(math.radians(final_lat))
                x = math.cos(math.radians(rz['lat'])) * math.sin(math.radians(final_lat)) - \
                    math.sin(math.radians(rz['lat'])) * math.cos(math.radians(final_lat)) * math.cos(dLon)
                bearing = (math.degrees(math.atan2(y, x)) + 360) % 360
            
            # Push distance needed to get out of the red zone + 1km buffer
            push_distance = rz['radius'] - dist + 1.0 
            final_lat, final_lon = get_destination_point(final_lat, final_lon, push_distance, bearing)
            
    return final_lat, final_lon, pushed

def generate_dummy_data(num_customers=100):
    # Center around Jakarta
    center_lat, center_lon = -6.200000, 106.816666
    
    customers = []
    for i in range(num_customers):
        # random spread within ~50km
        lat = center_lat + random.uniform(-0.4, 0.4)
        lon = center_lon + random.uniform(-0.4, 0.4)
        vol = random.randint(10, 500) # CBM
        customers.append({"id": f"CUST-{i+1}", "lat": lat, "lon": lon, "volume": vol})
        
    red_zones = [
        {"id": "RZ-1", "name": "Tanjung Priok Bottleneck", "lat": -6.1132, "lon": 106.8797, "radius": 8.0}, # 8km radius
        {"id": "RZ-2", "name": "Sudirman CBD High Cost", "lat": -6.2255, "lon": 106.8080, "radius": 4.0},
        {"id": "RZ-3", "name": "Cikarang Industrial Jam", "lat": -6.3262, "lon": 107.1507, "radius": 10.0}
    ]
    
    central_hub = {"lat": -6.200000, "lon": 106.816666} # Initial central hub
    
    return {
        "customers": customers,
        "red_zones": red_zones,
        "central_hub": central_hub,
        "cost_per_cbm_km": 1500 # IDR
    }

def simulate_network(data, num_hubs=3):
    df = pd.DataFrame(data['customers'])
    
    # 1. K-Means Clustering for N Hubs (weighted by volume)
    # Using sample weights in K-Means (we can repeat rows or use KMeans sample_weight)
    kmeans = KMeans(n_clusters=num_hubs, random_state=42, n_init=10)
    X = df[['lat', 'lon']].values
    weights = df['volume'].values
    
    kmeans.fit(X, sample_weight=weights)
    labels = kmeans.labels_
    centers = kmeans.cluster_centers_
    
    df['cluster'] = labels
    
    # 2. Anti-Gravity Repulsion
    hubs = []
    for i in range(num_hubs):
        raw_lat, raw_lon = centers[i]
        adj_lat, adj_lon, pushed = apply_anti_gravity(raw_lat, raw_lon, data['red_zones'])
        hubs.append({
            "hub_id": f"HUB-{i+1}",
            "raw_lat": raw_lat,
            "raw_lon": raw_lon,
            "lat": adj_lat,
            "lon": adj_lon,
            "pushed": pushed
        })
        
    # 3. Calculate Distances and Costs
    # Scenario A: 1 Central Hub
    central = data['central_hub']
    df['dist_central'] = haversine_vec(df['lat'].values, df['lon'].values, central['lat'], central['lon'])
    df['cost_central'] = df['dist_central'] * df['volume'] * data['cost_per_cbm_km']

    # Scenario B: N Decentralized Hubs
    hub_lats = np.array([h['lat'] for h in hubs])
    hub_lons = np.array([h['lon'] for h in hubs])
    assigned_lat = hub_lats[df['cluster'].values]
    assigned_lon = hub_lons[df['cluster'].values]
    df['dist_decentral'] = haversine_vec(df['lat'].values, df['lon'].values, assigned_lat, assigned_lon)
    df['cost_decentral'] = df['dist_decentral'] * df['volume'] * data['cost_per_cbm_km']
    
    total_cost_central = df['cost_central'].sum()
    total_cost_decentral = df['cost_decentral'].sum()
    avg_dist_central = df['dist_central'].mean()
    avg_dist_decentral = df['dist_decentral'].mean()
    
    # 4. Generate Map (Folium)
    m = folium.Map(location=[central['lat'], central['lon']], zoom_start=10, tiles='CartoDB dark_matter')
    
    # Draw Red Zones
    for rz in data['red_zones']:
        folium.Circle(
            location=[rz['lat'], rz['lon']],
            radius=rz['radius'] * 1000, # meters
            color='red',
            fill=True,
            fill_color='red',
            fill_opacity=0.3,
            popup=rz['name']
        ).add_to(m)
        
    # Draw Central Hub (Ghosted out)
    folium.Marker(
        location=[central['lat'], central['lon']],
        icon=folium.Icon(color='lightgray', icon='cloud', prefix='fa'),
        popup="Old Central Hub"
    ).add_to(m)
    
    # Draw New Hubs
    colors = ['blue', 'green', 'purple', 'orange', 'cadetblue', 'pink', 'white']
    hub_allocations = []
    
    for i, hub in enumerate(hubs):
        color = colors[i % len(colors)]
        
        # Hub marker
        folium.Marker(
            location=[hub['lat'], hub['lon']],
            icon=folium.Icon(color=color, icon='star', prefix='fa'),
            popup=f"{hub['hub_id']} {'(Repulsed)' if hub['pushed'] else ''}"
        ).add_to(m)
        
        # Customers for this hub
        cluster_data = df[df['cluster'] == i]
        total_vol = cluster_data['volume'].sum()
        hub_allocations.append({
            "hub_id": hub['hub_id'],
            "allocated_volume": int(total_vol),
            "customer_count": len(cluster_data),
            "lat": hub['lat'],
            "lon": hub['lon'],
            "pushed": hub['pushed']
        })
        
        for _, row in cluster_data.iterrows():
            # Bubble marker for customer
            folium.CircleMarker(
                location=[row['lat'], row['lon']],
                radius=min(max(row['volume'] / 50, 2), 8),
                color=color,
                fill=True,
                fill_color=color,
                fill_opacity=0.6,
                popup=f"Cust: {row['id']} | Vol: {row['volume']}"
            ).add_to(m)
            
            # Line from Hub to Customer
            folium.PolyLine(
                locations=[[hub['lat'], hub['lon']], [row['lat'], row['lon']]],
                color=color,
                weight=1,
                opacity=0.3
            ).add_to(m)
            
    map_html = m.get_root().render()
    
    return {
        "map_html": map_html,
        "summary": {
            "total_cost_central": float(total_cost_central),
            "total_cost_decentral": float(total_cost_decentral),
            "cost_savings": float(total_cost_central - total_cost_decentral),
            "savings_pct": float((total_cost_central - total_cost_decentral) / total_cost_central * 100) if total_cost_central > 0 else 0,
            "avg_dist_central": float(avg_dist_central),
            "avg_dist_decentral": float(avg_dist_decentral),
            "hubs": hub_allocations
        },
        "chart_data": [
            {"name": "1 Central Hub", "Total Cost": float(total_cost_central), "Avg Lead Dist (KM)": float(avg_dist_central)},
            {f"name": f"{num_hubs} Decentralized Hubs", "Total Cost": float(total_cost_decentral), "Avg Lead Dist (KM)": float(avg_dist_decentral)}
        ]
    }


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
    # Vectorized instead of a per-row iterrows() loop building dicts one at a
    # time - a large customer upload (thousands of rows) shouldn't pay for a
    # Python-level loop just to reshape columns into records.
    # `.map(str)` (not `.astype(str)`) to match the original per-row `str(value)`
    # exactly, including turning an actual NaN cell into the string 'nan' -
    # `.astype(str)` has special NA-preserving behavior that leaves NaN as NaN.
    id_col = df_demand['ID_Customer'].map(str) if 'ID_Customer' in df_demand.columns else pd.Series([''] * len(df_demand))
    customers = pd.DataFrame({
        'id': id_col.values,
        'lat': df_demand['Latitude'].astype(float).values,
        'lon': df_demand['Longitude'].astype(float).values,
        'volume': df_demand['Volume_Demand_Bulanan'].astype(float).values,
    }).to_dict('records')

    # 2. RedZones
    red_zones = []
    if 'RedZone' in xls.sheet_names:
        df_rz = pd.read_excel(xls, 'RedZone')
        # Expected: ID_Zone, Latitude, Longitude, Radius
        rz_id_col = df_rz['ID_Zone'].map(str) if 'ID_Zone' in df_rz.columns else pd.Series([''] * len(df_rz))
        rz_name_col = df_rz['ID_Zone'].map(str) if 'ID_Zone' in df_rz.columns else pd.Series(['RedZone'] * len(df_rz))
        red_zones = pd.DataFrame({
            'id': rz_id_col.values,
            'name': rz_name_col.values,
            'lat': df_rz['Latitude'].astype(float).values,
            'lon': df_rz['Longitude'].astype(float).values,
            'radius': df_rz['Radius'].astype(float).values,
        }).to_dict('records')
            
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
