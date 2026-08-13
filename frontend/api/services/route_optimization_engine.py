"""
Route Optimization Engine for Distribution Companies
=====================================================
Implements multiple route optimization algorithms:
  1. Haversine distance  — real GPS coordinate distance
  2. Cost model          — fixed + fuel + maintenance + driver + emission
  3. 4M1E framework      — Man, Machine, Method, Material, Environment
  4. Nearest Neighbor    — baseline heuristic
  5. Clarke-Wright Savings + 2-opt improvement
  6. Genetic Algorithm   — tournament, OX crossover, elitism + 2-opt

Literature Benchmarks (ScienceDirect & literatur terkait):
  - Clarke-Wright improvements: optimal on 81% of 84 test instances (0.14% avg deviation)
  - Hybrid ACO: 62.07% improvement over comparison algorithms
  - Deep RL + GNN: 1.73% cost reduction vs ACO
  - Milk-run: unused capacity reduced from 49% to 3%
"""

import math
import random
import numpy as np
import pandas as pd
from typing import Optional


# ══════════════════════════════════════════════════════════════
#  1. DISTANCE FUNCTIONS
# ══════════════════════════════════════════════════════════════

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Haversine Formula — great-circle distance between two GPS points.
    ──────────────────────────────────────────────────────────────────
    a = sin²(Δφ/2) + cos(φ₁) · cos(φ₂) · sin²(Δλ/2)
    c = 2 · atan2(√a, √(1−a))
    d = R · c

    where R = 6371 km (Earth radius)
    """
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = math.sin(dphi / 2) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def build_distance_matrix(locations: list[dict]) -> list[list[float]]:
    """Build NxN distance matrix from list of {lat, lon} dicts."""
    n = len(locations)
    matrix = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            d = haversine_km(
                locations[i]["lat"], locations[i]["lon"],
                locations[j]["lat"], locations[j]["lon"],
            )
            matrix[i][j] = d
            matrix[j][i] = d
    return matrix


# ══════════════════════════════════════════════════════════════
#  2. COST MODEL
# ══════════════════════════════════════════════════════════════

DEFAULT_COST_PARAMS = {
    "fuel_price_per_liter": 13500,       # Rp/liter
    "fuel_efficiency_km_per_liter": 8,   # km/liter
    "driver_cost_per_day": 250000,       # Rp/day
    "driver_cost_per_hour": 35000,       # Rp/hour (overtime/variable)
    "fixed_cost_per_vehicle": 150000,    # Rp/trip (depreciation, insurance, etc.)
    "maintenance_per_km": 500,           # Rp/km
    "carbon_price_per_kg": 50000,        # Rp/kg CO2  (optional carbon cost)
    "emission_factor_kg_per_km": 0.00027,  # kg CO2/km (light truck)
    "traffic_factor": 1.0,              # 1.0 = normal, 1.3 = heavy traffic (adds 30%)
    "avg_speed_kmh": 40,                 # average speed for time estimation
    "service_time_per_stop_mins": 30,    # mins/stop (VRPTW insight)
}


def calc_route_cost(
    distance_km: float,
    n_vehicles: int,
    total_stops: int,
    cost_params: Optional[dict] = None,
) -> dict:
    """
    Total Route Cost with Service Time (VRPTW insight)
    ══════════════════════════════════════════════════
    Fuel Cost        = distance × traffic_factor × (fuel_price / fuel_efficiency)
    Time             = (distance × traffic_factor / speed) + (stops × service_time)
    Driver Cost      = (n_vehicles × fixed_day_rate) + (total_time × hourly_rate)
    Fixed Cost       = n_vehicles × fixed_cost_per_vehicle
    Maintenance Cost = distance × traffic_factor × maintenance_per_km
    Emission Cost    = distance × emission_factor × carbon_price

    Total = Fuel + Driver + Fixed + Maintenance + Emission
    """
    p = {**DEFAULT_COST_PARAMS, **(cost_params or {})}

    effective_distance = distance_km * p["traffic_factor"]
    
    driving_time_hours = effective_distance / max(p["avg_speed_kmh"], 1)
    service_time_hours = total_stops * (p["service_time_per_stop_mins"] / 60)
    total_time_hours = driving_time_hours + service_time_hours

    fuel_cost = effective_distance * (p["fuel_price_per_liter"] / p["fuel_efficiency_km_per_liter"])
    # Hybrid driver cost: base day rate per vehicle + hourly rate for total time
    driver_cost = (n_vehicles * p["driver_cost_per_day"]) + (total_time_hours * p["driver_cost_per_hour"])
    fixed_cost = n_vehicles * p["fixed_cost_per_vehicle"]
    maint_cost = effective_distance * p["maintenance_per_km"]
    emission_cost = effective_distance * p["emission_factor_kg_per_km"] * p["carbon_price_per_kg"]

    total = fuel_cost + driver_cost + fixed_cost + maint_cost + emission_cost

    return {
        "fuel_cost": round(fuel_cost),
        "driver_cost": round(driver_cost),
        "fixed_cost": round(fixed_cost),
        "maintenance_cost": round(maint_cost),
        "emission_cost": round(emission_cost),
        "total_cost": round(total),
        "effective_distance_km": round(effective_distance, 2),
        "estimated_time_hours": round(total_time_hours, 2),
    }


# ══════════════════════════════════════════════════════════════
#  3. NEAREST NEIGHBOR HEURISTIC (Baseline)
# ══════════════════════════════════════════════════════════════

def nearest_neighbor(
    dist_matrix: list[list[float]],
    demands: list[float],
    vehicle_capacity: float,
    depot: int = 0,
    available_customers: Optional[set[int]] = None,
) -> list[list[int]]:
    """
    Nearest Neighbor Heuristic
    ══════════════════════════
    Start from depot. Greedily visit nearest unvisited customer.
    When capacity exceeded, return to depot and start new route.
    """
    n = len(dist_matrix)
    visited = [False] * n
    visited[depot] = True
    routes = []

    remaining = set(available_customers) if available_customers is not None else (set(range(n)) - {depot})

    while remaining:
        route = []
        load = 0.0
        current = depot

        while remaining:
            # Find nearest unvisited that fits capacity
            best_next = None
            best_dist = float("inf")
            for j in remaining:
                if load + demands[j] <= vehicle_capacity and dist_matrix[current][j] < best_dist:
                    best_dist = dist_matrix[current][j]
                    best_next = j

            if best_next is None:
                break

            route.append(best_next)
            load += demands[best_next]
            visited[best_next] = True
            remaining.remove(best_next)
            current = best_next

        if route:
            routes.append(route)
        else:
            # No remaining customer fits even alone (its demand alone exceeds
            # vehicle_capacity). Without forcing progress here, `remaining`
            # never shrinks and this loop spins forever, hanging the request
            # until the serverless function times out. Ship it as its own
            # over-capacity route instead of hanging or silently dropping demand.
            oversized = min(remaining, key=lambda j: dist_matrix[depot][j])
            routes.append([oversized])
            visited[oversized] = True
            remaining.remove(oversized)

    return routes


# ══════════════════════════════════════════════════════════════
#  4. CLARKE-WRIGHT SAVINGS ALGORITHM
# ══════════════════════════════════════════════════════════════

def clarke_wright_savings(
    dist_matrix: list[list[float]],
    demands: list[float],
    vehicle_capacity: float,
    depot: int = 0,
    available_customers: Optional[set[int]] = None,
) -> list[list[int]]:
    """
    Clarke-Wright Savings Algorithm
    ════════════════════════════════
    S(i,j) = d(0,i) + d(0,j) − d(i,j)

    Higher savings → merging routes i and j saves more distance.
    Steps:
      1. Initialize each customer in its own route.
      2. Calculate all savings S(i,j).
      3. Sort savings descending.
      4. Merge routes if capacity allows and customers are at route endpoints.
    """
    n = len(dist_matrix)
    customers = sorted(list(available_customers)) if available_customers is not None else [i for i in range(n) if i != depot]

    # Calculate savings
    savings = []
    for i in customers:
        for j in customers:
            if i < j:
                s = dist_matrix[depot][i] + dist_matrix[depot][j] - dist_matrix[i][j]
                savings.append((s, i, j))

    savings.sort(key=lambda x: -x[0])

    # Initialize: each customer in its own route
    routes = [[c] for c in customers]
    route_of = {c: idx for idx, c in enumerate(customers)}

    def get_route_load(route_idx: int) -> float:
        return sum(demands[c] for c in routes[route_idx])

    for s_val, i, j in savings:
        ri, rj = route_of.get(i), route_of.get(j)
        if ri is None or rj is None or ri == rj:
            continue

        route_i = routes[ri]
        route_j = routes[rj]

        if not route_i or not route_j:
            continue

        # Check if i and j are at endpoints of their routes
        i_at_end = (route_i[0] == i or route_i[-1] == i)
        j_at_end = (route_j[0] == j or route_j[-1] == j)
        if not (i_at_end and j_at_end):
            continue

        # Check capacity
        combined_load = get_route_load(ri) + get_route_load(rj)
        if combined_load > vehicle_capacity:
            continue

        # Merge: orient so i is at end of route_i, j is at start of route_j
        if route_i[-1] != i:
            route_i.reverse()
        if route_j[0] != j:
            route_j.reverse()

        merged = route_i + route_j
        routes[ri] = merged
        routes[rj] = []

        for c in merged:
            route_of[c] = ri

    return [r for r in routes if r]


# ══════════════════════════════════════════════════════════════
#  5. 2-OPT LOCAL IMPROVEMENT
# ══════════════════════════════════════════════════════════════

def two_opt(route: list[int], dist_matrix: list[list[float]], depot: int = 0) -> list[int]:
    """
    2-opt Local Search
    ══════════════════
    Repeatedly reverse segments to reduce total route distance.
    """
    if len(route) < 3:
        return route

    def route_distance(r: list[int]) -> float:
        d = dist_matrix[depot][r[0]]
        for k in range(len(r) - 1):
            d += dist_matrix[r[k]][r[k + 1]]
        d += dist_matrix[r[-1]][depot]
        return d

    improved = True
    best = route[:]
    best_dist = route_distance(best)

    while improved:
        improved = False
        for i in range(len(best) - 1):
            for j in range(i + 1, len(best)):
                candidate = best[:i] + best[i:j + 1][::-1] + best[j + 1:]
                cd = route_distance(candidate)
                if cd < best_dist - 1e-9:
                    best = candidate
                    best_dist = cd
                    improved = True
                    break
            if improved:
                break

    return best


# ══════════════════════════════════════════════════════════════
#  6. GENETIC ALGORITHM
# ══════════════════════════════════════════════════════════════

def _decode_giant_tour(
    tour: list[int],
    demands: list[float],
    vehicle_capacity: float,
    depot: int = 0,
) -> list[list[int]]:
    """Split giant tour into feasible routes by capacity."""
    routes = []
    current_route = []
    current_load = 0.0

    for customer in tour:
        if current_load + demands[customer] > vehicle_capacity:
            if current_route:
                routes.append(current_route)
            current_route = [customer]
            current_load = demands[customer]
        else:
            current_route.append(customer)
            current_load += demands[customer]

    if current_route:
        routes.append(current_route)

    return routes


def _total_distance(routes: list[list[int]], dist_matrix: list[list[float]], depot: int = 0) -> float:
    total = 0.0
    for route in routes:
        if not route:
            continue
        total += dist_matrix[depot][route[0]]
        for k in range(len(route) - 1):
            total += dist_matrix[route[k]][route[k + 1]]
        total += dist_matrix[route[-1]][depot]
    return total


def _ox_crossover(p1: list[int], p2: list[int]) -> list[int]:
    """Order Crossover (OX)."""
    n = len(p1)
    if n < 3:
        return p1[:]
    start, end = sorted(random.sample(range(n), 2))
    child = [None] * n
    child[start:end + 1] = p1[start:end + 1]
    fill_values = [x for x in p2 if x not in child[start:end + 1]]
    idx = 0
    for i in range(n):
        if child[i] is None:
            child[i] = fill_values[idx]
            idx += 1
    return child


def genetic_algorithm(
    dist_matrix: list[list[float]],
    demands: list[float],
    vehicle_capacity: float,
    depot: int = 0,
    pop_size: int = 50,
    generations: int = 100,
    mutation_rate: float = 0.15,
    elite_size: int = 5,
    available_customers: Optional[set[int]] = None,
) -> tuple[list[list[int]], list[float]]:
    """
    Genetic Algorithm for VRP
    ═════════════════════════
    Encoding: giant-tour (permutation of customers)
    Selection: tournament (size=3)
    Crossover: OX (Order Crossover)
    Mutation: swap mutation
    Elitism: top-N preserved
    Post-processing: 2-opt on each route

    Returns: (best_routes, convergence_history)
    """
    customers = sorted(list(available_customers)) if available_customers is not None else [i for i in range(len(dist_matrix)) if i != depot]
    n = len(customers)

    if n == 0:
        return [], []

    # Initialize population
    population = []
    for _ in range(pop_size):
        perm = customers[:]
        random.shuffle(perm)
        population.append(perm)

    def fitness(tour: list[int]) -> float:
        routes = _decode_giant_tour(tour, demands, vehicle_capacity, depot)
        return _total_distance(routes, dist_matrix, depot)

    convergence = []

    for gen in range(generations):
        scored = [(fitness(ind), ind) for ind in population]
        scored.sort(key=lambda x: x[0])
        convergence.append(scored[0][0])

        # Elitism
        new_pop = [ind[:] for _, ind in scored[:elite_size]]

        # Fill rest with crossover + mutation
        while len(new_pop) < pop_size:
            # Tournament selection (size=3)
            candidates = random.sample(scored, min(3, len(scored)))
            p1 = min(candidates, key=lambda x: x[0])[1]
            candidates = random.sample(scored, min(3, len(scored)))
            p2 = min(candidates, key=lambda x: x[0])[1]

            child = _ox_crossover(p1, p2)

            # Swap mutation
            if random.random() < mutation_rate and len(child) > 1:
                i, j = random.sample(range(len(child)), 2)
                child[i], child[j] = child[j], child[i]

            new_pop.append(child)

        population = new_pop

    # Final: get best
    scored = [(fitness(ind), ind) for ind in population]
    scored.sort(key=lambda x: x[0])
    best_tour = scored[0][1]

    # Decode and apply 2-opt to each route
    best_routes = _decode_giant_tour(best_tour, demands, vehicle_capacity, depot)
    best_routes = [two_opt(r, dist_matrix, depot) for r in best_routes]

    return best_routes, convergence


def hybrid_aco(
    dist_matrix: list[list[float]],
    demands: list[float],
    vehicle_capacity: float,
    depot: int = 0,
    num_ants: int = 15,
    generations: int = 30,
    available_customers: Optional[set[int]] = None,
) -> list[list[int]]:
    """
    Hybrid Ant Colony Optimization (HACO) proxy.
    Uses pheromone matrix and visibility to construct routes.
    """
    n = len(dist_matrix)
    customers = sorted(list(available_customers)) if available_customers is not None else [i for i in range(n) if i != depot]
    if not customers:
        return []
    
    pheromone = [[1.0]*n for _ in range(n)]
    best_routes = []
    best_dist = float('inf')
    
    for _ in range(generations):
        all_routes = []
        for _ in range(num_ants):
            unvisited = set(customers)
            routes = []
            while unvisited:
                curr_route = []
                curr_cap = vehicle_capacity
                curr_node = depot
                
                while unvisited:
                    # Filter valid next stops
                    valid = [c for c in unvisited if demands[c] <= curr_cap]
                    if not valid:
                        break
                        
                    # Calculate probabilities
                    probs = []
                    for c in valid:
                        p = pheromone[curr_node][c]
                        # visibility = 1 / dist
                        v = 1.0 / (dist_matrix[curr_node][c] + 1e-6)
                        probs.append((p ** 1.0) * (v ** 2.0))
                        
                    total_prob = sum(probs)
                    if total_prob == 0:
                        chosen = random.choice(valid)
                    else:
                        probs = [p/total_prob for p in probs]
                        r = random.random()
                        cum = 0
                        chosen = valid[-1]
                        for i, p in enumerate(probs):
                            cum += p
                            if r <= cum:
                                chosen = valid[i]
                                break
                                
                    curr_route.append(chosen)
                    unvisited.remove(chosen)
                    curr_cap -= demands[chosen]
                    curr_node = chosen
                    
                routes.append(curr_route)
            
            # Post-process with 2-opt
            routes = [two_opt(r, dist_matrix, depot) for r in routes]
            dist = _total_distance(routes, dist_matrix, depot)
            all_routes.append((dist, routes))
            
            if dist < best_dist:
                best_dist = dist
                best_routes = routes
                
        # Evaporate pheromones
        for i in range(n):
            for j in range(n):
                pheromone[i][j] *= 0.9 # evaporation rate
                
        # Deposit pheromones (best ant only)
        if best_routes:
            deposit = 100.0 / best_dist
            for route in best_routes:
                if not route: continue
                pheromone[depot][route[0]] += deposit
                for i in range(len(route)-1):
                    pheromone[route[i]][route[i+1]] += deposit
                pheromone[route[-1]][depot] += deposit
                
    return best_routes

# ══════════════════════════════════════════════════════════════
#  7. SENSITIVITY ANALYSIS
# ══════════════════════════════════════════════════════════════

def run_sensitivity_analysis(
    base_distance: float,
    base_n_vehicles: int,
    total_stops: int,
    cost_params: dict,
) -> list[dict]:
    """
    Sensitivity Analysis — vary one factor at a time.
    ──────────────────────────────────────────────────
    Factors:
      - Traffic factor (Man/Environment): 0.8, 1.0, 1.2, 1.5
      - Fuel efficiency (Machine): 6, 8, 10, 12 km/L
      - Driver wage (Man): 150k, 200k, 250k, 300k
      - Carbon price (Environment): 0, 25k, 50k, 100k
    """
    results = []

    # Traffic factor variations
    for tf in [0.8, 1.0, 1.2, 1.5]:
        params = {**cost_params, "traffic_factor": tf}
        cost = calc_route_cost(base_distance, base_n_vehicles, total_stops, params)
        results.append({
            "factor": "Traffic (Lingkungan)",
            "variation": f"{tf}x",
            "total_cost": cost["total_cost"],
            "category": "Environment",
        })

    # Fuel efficiency variations
    for fe in [6, 8, 10, 12]:
        params = {**cost_params, "fuel_efficiency_km_per_liter": fe}
        cost = calc_route_cost(base_distance, base_n_vehicles, total_stops, params)
        results.append({
            "factor": "Efisiensi BBM (Machine)",
            "variation": f"{fe} km/L",
            "total_cost": cost["total_cost"],
            "category": "Machine",
        })

    # Driver wage variations
    for dw in [150000, 200000, 250000, 300000]:
        params = {**cost_params, "driver_cost_per_day": dw}
        cost = calc_route_cost(base_distance, base_n_vehicles, total_stops, params)
        results.append({
            "factor": "Upah Sopir (Man)",
            "variation": f"Rp {dw:,.0f}",
            "total_cost": cost["total_cost"],
            "category": "Man",
        })

    # Carbon price variations
    for cp in [0, 25000, 50000, 100000]:
        params = {**cost_params, "carbon_price_per_kg": cp}
        cost = calc_route_cost(base_distance, base_n_vehicles, total_stops, params)
        results.append({
            "factor": "Harga Karbon (Environment)",
            "variation": f"Rp {cp:,.0f}",
            "total_cost": cost["total_cost"],
            "category": "Environment",
        })

    return results


# ══════════════════════════════════════════════════════════════
#  8. SYNTHETIC DATA GENERATOR (for demo)
# ══════════════════════════════════════════════════════════════

def generate_demo_data(n_customers: int = 20, num_dedicated_vehicles: int = 2) -> dict:
    """Generate synthetic distribution data near Jakarta for demo with dedicated routes support."""
    random.seed(42)
    np.random.seed(42)

    depot = {"name": "Depot (Jakarta)", "lat": -6.2088, "lon": 106.8456, "demand": 0}

    customers = []
    for i in range(n_customers):
        customers.append({
            "name": f"Pelanggan {i + 1}",
            "lat": depot["lat"] + np.random.uniform(-0.15, 0.15),
            "lon": depot["lon"] + np.random.uniform(-0.15, 0.15),
            "demand": round(np.random.uniform(5, 30)),
            "is_dedicated": i < (num_dedicated_vehicles * 3)
        })
    return {"depot": depot, "customers": customers}

def _safe_float(v, default=0.0) -> float:
    if v is None:
        return default
    if isinstance(v, (int, float)):
        if math.isnan(v) or math.isinf(v):
            return default
        return float(v)
    try:
        s = str(v).strip()
        if s in ('', '-', ' - ', 'nan', 'null', 'None', 'NaN'):
            return default
        import re
        s = re.sub(r'[^\d.,+-]', '', s)
        if not s:
            return default
        if '.' in s and ',' in s:
            if s.rfind(',') > s.rfind('.'):
                s = s.replace('.', '').replace(',', '.')
            else:
                s = s.replace(',', '')
        elif ',' in s and '.' not in s:
            s = s.replace(',', '.')
        elif '.' in s and ',' not in s:
            if s.count('.') > 1:
                s = s.replace('.', '')
        val = float(s)
        if math.isnan(val) or math.isinf(val):
            return default
        return val
    except Exception:
        return default


def analyze_routes_from_file(df: pd.DataFrame, params: dict) -> dict:
    """
    Parse a DataFrame into depot and customers, then run optimization per Cabang.
    Expected columns:
      - Tipe Lokasi / Type: "Depot" or "Pelanggan"
      - Nama Lokasi / Name: Name of the stop
      - Latitude / Lat
      - Longitude / Lon
      - Permintaan / Demand (0 for Depot)
      - Cabang / Branch (optional for grouping)
      - Bulan / Date (optional for grouping)
      - Parameter columns (optional, overrides UI params)
    """
    col_map = {}
    for c in df.columns:
        cl = str(c).strip().lower()
        if cl in ("tipe", "type", "tipe lokasi", "jenis", "peran", "role", "kategori lokasi"):
            col_map[c] = "type"
        elif cl in ("nama", "name", "nama lokasi", "customer", "pelanggan", "nama pelanggan", "tujuan", "stop", "titik", "toko", "store"):
            col_map[c] = "name"
        elif cl in ("lat", "latitude", "lintang", "koordinat x", "y", "lat (y)"):
            col_map[c] = "lat"
        elif cl in ("lon", "longitude", "long", "bujur", "koordinat y", "x", "lon (x)", "lng"):
            col_map[c] = "lon"
        elif cl in ("demand", "permintaan", "qty", "quantity", "muatan", "berat", "volume", "pesanan", "unit"):
            col_map[c] = "demand"
        elif cl in ("cabang", "branch", "lokasi", "gudang", "site", "regional", "area"):
            col_map[c] = "cabang"
        elif cl in ("bulan", "date", "tanggal", "waktu", "bulan-tahun", "periode"):
            col_map[c] = "date"
        elif cl in ("kapasitas kendaraan", "kapasitas kendaraan (unit)", "vehicle_capacity", "kapasitas", "capacity"):
            col_map[c] = "vehicle_capacity"
        elif cl in ("harga bbm", "harga bbm (rp/l)", "fuel_price", "bbm"):
            col_map[c] = "fuel_price"
        elif cl in ("efisiensi bbm", "efisiensi bbm (km/l)", "fuel_efficiency", "konsumsi bbm"):
            col_map[c] = "fuel_efficiency"
        elif cl in ("upah sopir", "upah sopir (rp/hari)", "driver_cost", "upah driver", "biaya sopir"):
            col_map[c] = "driver_cost"
        elif cl in ("fixed cost", "fixed cost (rp/trip)", "biaya tetap", "biaya kendaraan"):
            col_map[c] = "fixed_cost"
        elif cl in ("maintenance", "maintenance (rp/km)", "perawatan", "biaya servis"):
            col_map[c] = "maintenance"
        elif cl in ("traffic factor", "traffic factor (1.0-1.5)", "faktor macet", "macet"):
            col_map[c] = "traffic_factor"
        elif cl in ("ga generasi", "generasi ga", "ga_generations", "generasi"):
            col_map[c] = "ga_generations"
        elif cl in ("dedicated", "is_dedicated", "rute dedicated", "tetap", "khusus"):
            col_map[c] = "is_dedicated"
        elif cl in ("jumlah kendaraan", "total armada", "num_vehicles", "n_vehicles", "armada"):
            col_map[c] = "num_vehicles"
        elif cl in ("kendaraan dedicated", "num_dedicated_vehicles", "armada dedicated"):
            col_map[c] = "num_dedicated_vehicles"
            
    df = df.rename(columns=col_map)
    
    # Fallback jika nama kolom tidak sesuai standard: cek apakah kolom ke 2/3/4 adalah angka float untuk koordinat
    if "lat" not in df.columns or "lon" not in df.columns:
        # Cari kolom numerik yang memiliki nilai representatif koordinat (mis. lat di Indonesia -11 s/d 6, lon 95 s/d 141)
        for col in df.columns:
            if col not in ("lat", "lon", "demand", "type", "name", "cabang", "date"):
                try:
                    sample_vals = [_safe_float(x, default=-999) for x in df[col].dropna().head(10)]
                    valid_vals = [v for v in sample_vals if v != -999]
                    if valid_vals:
                        avg_v = np.mean(valid_vals)
                        if -15 <= avg_v <= 10 and "lat" not in df.columns:
                            df["lat"] = df[col]
                        elif 90 <= avg_v <= 145 and "lon" not in df.columns:
                            df["lon"] = df[col]
                except Exception:
                    pass
                    
    if "lat" not in df.columns or "lon" not in df.columns:
        return {"error": f"Kolom koordinat GPS (Latitude/Longitude) tidak tertangkap di file Anda. Kolom terdeteksi: {', '.join([str(c) for c in df.columns])}"}

    if "demand" not in df.columns:
        df["demand"] = 10.0 # default demand per stop bila kolom tidak ada

    group_cols = []
    if "cabang" in df.columns:
        group_cols.append("cabang")
    if "date" in df.columns:
        group_cols.append("date")

    results = []
    groups = df.groupby(group_cols) if group_cols else [("All", df)]

    for group_key, group_df in groups:
        if isinstance(group_key, str):
            label = group_key
        else:
            label = " — ".join(str(k) for k in group_key)
            
        depot = None
        customers = []
        
        # Override params if present in first row
        group_params = params.copy()
        group_cost_params = group_params.get("cost_params", DEFAULT_COST_PARAMS.copy()).copy()
        
        first_row = group_df.iloc[0]
        if "vehicle_capacity" in group_df.columns and not pd.isna(first_row["vehicle_capacity"]):
            group_params["vehicle_capacity"] = _safe_float(first_row["vehicle_capacity"], default=group_params.get("vehicle_capacity", 100))
        if "fuel_price" in group_df.columns and not pd.isna(first_row["fuel_price"]):
            group_cost_params["fuel_price_per_liter"] = _safe_float(first_row["fuel_price"], default=13500)
        if "fuel_efficiency" in group_df.columns and not pd.isna(first_row["fuel_efficiency"]):
            group_cost_params["fuel_efficiency_km_per_liter"] = _safe_float(first_row["fuel_efficiency"], default=8)
        if "driver_cost" in group_df.columns and not pd.isna(first_row["driver_cost"]):
            group_cost_params["driver_cost_per_day"] = _safe_float(first_row["driver_cost"], default=250000)
        if "fixed_cost" in group_df.columns and not pd.isna(first_row["fixed_cost"]):
            group_cost_params["fixed_cost_per_vehicle"] = _safe_float(first_row["fixed_cost"], default=150000)
        if "maintenance" in group_df.columns and not pd.isna(first_row["maintenance"]):
            group_cost_params["maintenance_per_km"] = _safe_float(first_row["maintenance"], default=500)
        if "traffic_factor" in group_df.columns and not pd.isna(first_row["traffic_factor"]):
            group_cost_params["traffic_factor"] = _safe_float(first_row["traffic_factor"], default=1.0)
        if "ga_generations" in group_df.columns and not pd.isna(first_row["ga_generations"]):
            group_params["ga_generations"] = int(_safe_float(first_row["ga_generations"], default=100))
        if "num_vehicles" in group_df.columns and not pd.isna(first_row["num_vehicles"]):
            group_params["num_vehicles"] = int(_safe_float(first_row["num_vehicles"], default=8))
        if "num_dedicated_vehicles" in group_df.columns and not pd.isna(first_row["num_dedicated_vehicles"]):
            group_params["num_dedicated_vehicles"] = int(_safe_float(first_row["num_dedicated_vehicles"], default=2))
            
        group_params["cost_params"] = group_cost_params
        
        for _, row in group_df.iterrows():
            t = str(row.get("type", "")).strip().lower()
            name = str(row.get("name", "Unknown"))
            lat = _safe_float(row.get("lat", 0), default=0.0)
            lon = _safe_float(row.get("lon", 0), default=0.0)
            demand = _safe_float(row.get("demand", 0), default=10.0)
            
            if abs(lat) < 0.0001 and abs(lon) < 0.0001:
                continue
                
            is_dedicated = bool(row.get("is_dedicated", False)) if "is_dedicated" in row and not pd.isna(row["is_dedicated"]) else False
            if t == "depot" or "depot" in t or "gudang" in t or "pusat" in t:
                depot = {"name": name, "lat": lat, "lon": lon, "demand": 0}
            else:
                customers.append({"name": name, "lat": lat, "lon": lon, "demand": demand, "is_dedicated": is_dedicated})
                
        if not depot:
            # Jika tidak ada baris berlabel Depot, cari dari daftar yang demand == 0 atau namanya mengandung depot/gudang/dc
            for i, c in enumerate(customers):
                c_name_lower = str(c["name"]).lower()
                if c["demand"] == 0 or any(w in c_name_lower for w in ["depot", "gudang", "dc", "pusat", "office", "kantor", "wh"]):
                    depot = {"name": c["name"], "lat": c["lat"], "lon": c["lon"], "demand": 0}
                    customers.pop(i)
                    break
            # Jika masih tidak ada, ambil baris pertama sebagai Depot dan sisanya sebagai Pelanggan
            if not depot and len(customers) >= 2:
                first_c = customers.pop(0)
                depot = {"name": f"Depot ({first_c['name']})", "lat": first_c["lat"], "lon": first_c["lon"], "demand": 0}

        if not depot or not customers:
            if not results: return {"error": f"Data lokasi di grup {label} tidak cukup. Pastikan minimal ada 1 Depot dan 1 Pelanggan dengan koordinat GPS valid."}
            continue
            
        group_params["depot"] = depot
        group_params["customers"] = customers
        
        opt_res = run_route_optimization(group_params)
        opt_res["label"] = label
        results.append(opt_res)
        
    if not results:
        return {"error": "Tidak ada grup rute yang valid untuk diproses."}
        
    # Return array of results
    return {"results": results}


# ══════════════════════════════════════════════════════════════
#  9. FULL PIPELINE
# ══════════════════════════════════════════════════════════════

def run_route_optimization(params: dict) -> dict:
    """
    Full route optimization pipeline.

    Input params:
        depot: {name, lat, lon}
        customers: [{name, lat, lon, demand}, ...]
        vehicle_capacity: float
        cost_params: dict (optional, see DEFAULT_COST_PARAMS)
        ga_generations: int (optional, default 100)
        ga_pop_size: int (optional, default 50)
    """
    depot_info = params.get("depot")
    customers = params.get("customers", [])
    vehicle_capacity = float(params.get("vehicle_capacity", 100))
    num_vehicles = int(params.get("num_vehicles", 8))
    num_dedicated_vehicles = int(params.get("num_dedicated_vehicles", 2))
    cost_params = {**DEFAULT_COST_PARAMS, **params.get("cost_params", {})}
    ga_generations = int(params.get("ga_generations", 100))
    ga_pop_size = int(params.get("ga_pop_size", 50))

    if not depot_info or not customers:
        return {"error": "Depot dan customers harus disertakan."}

    # Build locations array: index 0 = depot
    locations = [{"lat": depot_info["lat"], "lon": depot_info["lon"]}]
    demands = [0.0]  # depot demand = 0
    names = [depot_info.get("name", "Depot")]

    for c in customers:
        locations.append({"lat": c["lat"], "lon": c["lon"]})
        demands.append(float(c.get("demand", 0)))
        names.append(c.get("name", "Customer"))

    dist_matrix = build_distance_matrix(locations)

    total_stops = len(customers)

    # Limit max input size to prevent timeout without reducing accuracy
    if total_stops > 50:
        return {"error": f"Batas maksimal data adalah 50 titik untuk mempertahankan akurasi kalkulasi. Anda memasukkan {total_stops} titik. Harap filter data Anda."}

    # ── Separate Dedicated vs Optimizable Customers ──
    dedicated_raw_routes = []
    assigned_dedicated = set()
    
    explicit_dedicated = [i for i, c in enumerate(customers, start=1) if c.get("is_dedicated") or str(c.get("is_dedicated", "")).lower() in ("true", "1", "yes", "ya", "dedicated")]
    
    if explicit_dedicated or num_dedicated_vehicles > 0:
        target_dedicated_vehicles = num_dedicated_vehicles if num_dedicated_vehicles > 0 else max(1, len(explicit_dedicated) // 3)
        pool = explicit_dedicated if explicit_dedicated else list(range(1, total_stops + 1))
        
        curr_route = []
        curr_load = 0.0
        routes_created = 0
        
        for idx in pool:
            if routes_created >= target_dedicated_vehicles:
                break
            if curr_load + demands[idx] <= vehicle_capacity and len(curr_route) < 4:
                curr_route.append(idx)
                curr_load += demands[idx]
                assigned_dedicated.add(idx)
            else:
                if curr_route:
                    dedicated_raw_routes.append(curr_route)
                    routes_created += 1
                if routes_created < target_dedicated_vehicles:
                    curr_route = [idx]
                    curr_load = demands[idx]
                    assigned_dedicated.add(idx)
                else:
                    curr_route = []
                    break
        if curr_route and routes_created < target_dedicated_vehicles:
            dedicated_raw_routes.append(curr_route)
            
    optimizable_customers = set(range(1, total_stops + 1)) - assigned_dedicated
    dedicated_dist = _total_distance(dedicated_raw_routes, dist_matrix)
    dedicated_formatted = _format_detailed_routes(dedicated_raw_routes, names, demands, dist_matrix, vehicle_capacity, start_id=1, is_dedicated=True, prefix="Armada Dedicated")

    # Dynamic scaling to prevent Vercel Timeout (Max 300s)
    max_ga_ops = 500000
    current_ga_ops = total_stops * ga_pop_size * ga_generations
    if current_ga_ops > max_ga_ops:
        scale_factor = max_ga_ops / max(1, current_ga_ops)
        ga_generations = max(10, int(ga_generations * scale_factor))
        
    max_aco_ops = 150000
    aco_generations = min(30, ga_generations)
    aco_ants = 15
    current_aco_ops = (total_stops ** 2) * aco_ants * aco_generations
    if current_aco_ops > max_aco_ops:
        scale_factor = max_aco_ops / max(1, current_aco_ops)
        aco_generations = max(5, int(aco_generations * math.sqrt(scale_factor)))
        aco_ants = max(5, int(aco_ants * math.sqrt(scale_factor)))

    # Run all 4 methods on optimizable_customers
    methods_results = []

    # 1. Nearest Neighbor
    nn_opt_routes = nearest_neighbor(dist_matrix, demands, vehicle_capacity, available_customers=optimizable_customers)
    nn_opt_dist = _total_distance(nn_opt_routes, dist_matrix)
    nn_total_dist = dedicated_dist + nn_opt_dist
    nn_opt_formatted = _format_detailed_routes(nn_opt_routes, names, demands, dist_matrix, vehicle_capacity, start_id=len(dedicated_formatted)+1, is_dedicated=False, prefix="Armada Optimasi (NN)")
    nn_all_routes = dedicated_raw_routes + nn_opt_routes
    nn_all_formatted = dedicated_formatted + nn_opt_formatted
    nn_cost = calc_route_cost(nn_total_dist, len(nn_all_routes), total_stops, cost_params)
    methods_results.append({
        "method": "Nearest Neighbor",
        "routes": nn_all_formatted,
        "dedicated_routes": dedicated_formatted,
        "optimized_routes": nn_opt_formatted,
        "raw_routes": nn_all_routes,
        "total_distance_km": round(nn_total_dist, 2),
        "dedicated_distance_km": round(dedicated_dist, 2),
        "optimized_distance_km": round(nn_opt_dist, 2),
        "n_vehicles": len(nn_all_routes),
        "n_dedicated_vehicles": len(dedicated_formatted),
        "n_optimized_vehicles": len(nn_opt_formatted),
        "total_fleet": num_vehicles,
        "vehicle_capacity": vehicle_capacity,
        "cost": nn_cost,
    })

    # 2. Clarke-Wright Savings + 2-opt
    cw_opt_routes = clarke_wright_savings(dist_matrix, demands, vehicle_capacity, available_customers=optimizable_customers)
    cw_opt_routes = [two_opt(r, dist_matrix) for r in cw_opt_routes]
    cw_opt_dist = _total_distance(cw_opt_routes, dist_matrix)
    cw_total_dist = dedicated_dist + cw_opt_dist
    cw_opt_formatted = _format_detailed_routes(cw_opt_routes, names, demands, dist_matrix, vehicle_capacity, start_id=len(dedicated_formatted)+1, is_dedicated=False, prefix="Armada Optimasi (CW)")
    cw_all_routes = dedicated_raw_routes + cw_opt_routes
    cw_all_formatted = dedicated_formatted + cw_opt_formatted
    cw_cost = calc_route_cost(cw_total_dist, len(cw_all_routes), total_stops, cost_params)
    methods_results.append({
        "method": "Clarke-Wright + 2-opt",
        "routes": cw_all_formatted,
        "dedicated_routes": dedicated_formatted,
        "optimized_routes": cw_opt_formatted,
        "raw_routes": cw_all_routes,
        "total_distance_km": round(cw_total_dist, 2),
        "dedicated_distance_km": round(dedicated_dist, 2),
        "optimized_distance_km": round(cw_opt_dist, 2),
        "n_vehicles": len(cw_all_routes),
        "n_dedicated_vehicles": len(dedicated_formatted),
        "n_optimized_vehicles": len(cw_opt_formatted),
        "total_fleet": num_vehicles,
        "vehicle_capacity": vehicle_capacity,
        "cost": cw_cost,
    })

    # 3. Genetic Algorithm + 2-opt
    ga_opt_routes, ga_convergence = genetic_algorithm(
        dist_matrix, demands, vehicle_capacity,
        pop_size=ga_pop_size, generations=ga_generations,
        available_customers=optimizable_customers
    )
    ga_opt_routes = [two_opt(r, dist_matrix) for r in ga_opt_routes]
    ga_opt_dist = _total_distance(ga_opt_routes, dist_matrix)
    ga_total_dist = dedicated_dist + ga_opt_dist
    ga_opt_formatted = _format_detailed_routes(ga_opt_routes, names, demands, dist_matrix, vehicle_capacity, start_id=len(dedicated_formatted)+1, is_dedicated=False, prefix="Armada Optimasi (GA)")
    ga_all_routes = dedicated_raw_routes + ga_opt_routes
    ga_all_formatted = dedicated_formatted + ga_opt_formatted
    ga_cost = calc_route_cost(ga_total_dist, len(ga_all_routes), total_stops, cost_params)
    methods_results.append({
        "method": "Genetic Algorithm + 2-opt",
        "routes": ga_all_formatted,
        "dedicated_routes": dedicated_formatted,
        "optimized_routes": ga_opt_formatted,
        "raw_routes": ga_all_routes,
        "total_distance_km": round(ga_total_dist, 2),
        "dedicated_distance_km": round(dedicated_dist, 2),
        "optimized_distance_km": round(ga_opt_dist, 2),
        "n_vehicles": len(ga_all_routes),
        "n_dedicated_vehicles": len(dedicated_formatted),
        "n_optimized_vehicles": len(ga_opt_formatted),
        "total_fleet": num_vehicles,
        "vehicle_capacity": vehicle_capacity,
        "cost": ga_cost,
        "convergence": [round(v, 2) for v in ga_convergence],
    })

    # 4. Hybrid ACO (Ant Colony) + 2-opt
    haco_opt_routes = hybrid_aco(
        dist_matrix, demands, vehicle_capacity,
        generations=aco_generations,
        num_ants=aco_ants,
        available_customers=optimizable_customers
    )
    haco_opt_dist = _total_distance(haco_opt_routes, dist_matrix)
    haco_total_dist = dedicated_dist + haco_opt_dist
    haco_opt_formatted = _format_detailed_routes(haco_opt_routes, names, demands, dist_matrix, vehicle_capacity, start_id=len(dedicated_formatted)+1, is_dedicated=False, prefix="Armada Optimasi (ACO)")
    haco_all_routes = dedicated_raw_routes + haco_opt_routes
    haco_all_formatted = dedicated_formatted + haco_opt_formatted
    haco_cost = calc_route_cost(haco_total_dist, len(haco_all_routes), total_stops, cost_params)
    methods_results.append({
        "method": "Hybrid ACO + 2-opt",
        "routes": haco_all_formatted,
        "dedicated_routes": dedicated_formatted,
        "optimized_routes": haco_opt_formatted,
        "raw_routes": haco_all_routes,
        "total_distance_km": round(haco_total_dist, 2),
        "dedicated_distance_km": round(dedicated_dist, 2),
        "optimized_distance_km": round(haco_opt_dist, 2),
        "n_vehicles": len(haco_all_routes),
        "n_dedicated_vehicles": len(dedicated_formatted),
        "n_optimized_vehicles": len(haco_opt_formatted),
        "total_fleet": num_vehicles,
        "vehicle_capacity": vehicle_capacity,
        "cost": haco_cost,
    })

    # Find best method
    best = min(methods_results, key=lambda x: x["cost"]["total_cost"])
    baseline_cost = methods_results[0]["cost"]["total_cost"]
    best_saving_pct = round((1 - best["cost"]["total_cost"] / max(baseline_cost, 1)) * 100, 2)

    # Sensitivity analysis
    sensitivity = run_sensitivity_analysis(
        best["total_distance_km"], best["n_vehicles"], total_stops, cost_params,
    )

    location_data = []
    for i, loc in enumerate(locations):
        location_data.append({
            "index": i,
            "name": names[i],
            "lat": loc["lat"],
            "lon": loc["lon"],
            "demand": demands[i],
            "is_depot": i == 0,
            "is_dedicated": i in assigned_dedicated,
        })

    insights = [
        f"Metode terbaik: {best['method']} — total cost Rp {best['cost']['total_cost']:,.0f}.",
        f"Penghematan {best_saving_pct}% dibanding baseline (Nearest Neighbor).",
        f"Penggunaan Armada: {best['n_vehicles']} unit digunakan dari total {num_vehicles} kendaraan (Kapasitas per armada: {vehicle_capacity} unit).",
        f"Rute Dedicated: {best['n_dedicated_vehicles']} kendaraan bertugas pada rute tetap ({best['dedicated_distance_km']:.1f} km). Rute Selanjutnya (Optimasi): {best['n_optimized_vehicles']} kendaraan diatur oleh sistem ({best['optimized_distance_km']:.1f} km).",
    ]

    return {
        "methods": methods_results,
        "best_method": best["method"],
        "saving_vs_baseline_pct": best_saving_pct,
        "sensitivity": sensitivity,
        "locations": location_data,
        "insights": insights,
        "cost_params_used": cost_params,
        "num_vehicles": num_vehicles,
        "num_dedicated_vehicles": num_dedicated_vehicles,
        "vehicle_capacity": vehicle_capacity,
    }


def _format_routes(routes: list[list[int]], names: list[str]) -> list[dict]:
    """Format routes for frontend display."""
    formatted = []
    for idx, route in enumerate(routes):
        stops = [{"index": c, "name": names[c]} for c in route]
        formatted.append({
            "route_id": idx + 1,
            "stops": stops,
            "n_stops": len(route),
        })
    return formatted


def _format_detailed_routes(
    routes: list[list[int]],
    names: list[str],
    demands: list[float],
    dist_matrix: list[list[float]],
    vehicle_capacity: float,
    start_id: int = 1,
    is_dedicated: bool = False,
    prefix: str = "Armada"
) -> list[dict]:
    formatted = []
    for idx, route in enumerate(routes):
        stops_data = [{"index": c, "name": names[c], "demand": demands[c]} for c in route]
        route_dist = 0.0
        if route:
            route_dist += dist_matrix[0][route[0]]
            for k in range(len(route) - 1):
                route_dist += dist_matrix[route[k]][route[k + 1]]
            route_dist += dist_matrix[route[-1]][0]
        route_load = sum(demands[c] for c in route)
        cap_pct = round((route_load / max(1, vehicle_capacity)) * 100, 1)
        formatted.append({
            "route_id": start_id + idx,
            "vehicle_name": f"{prefix} #{start_id + idx}",
            "is_dedicated": is_dedicated,
            "stops": stops_data,
            "n_stops": len(route),
            "distance_km": round(route_dist, 2),
            "load": round(route_load, 1),
            "capacity_pct": cap_pct,
        })
    return formatted
