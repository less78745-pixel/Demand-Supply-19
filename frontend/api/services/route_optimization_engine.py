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

    remaining = set(range(n)) - {depot}

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

    return routes


# ══════════════════════════════════════════════════════════════
#  4. CLARKE-WRIGHT SAVINGS ALGORITHM
# ══════════════════════════════════════════════════════════════

def clarke_wright_savings(
    dist_matrix: list[list[float]],
    demands: list[float],
    vehicle_capacity: float,
    depot: int = 0,
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
    customers = [i for i in range(n) if i != depot]

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
    customers = [i for i in range(len(dist_matrix)) if i != depot]
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

def generate_demo_data(n_customers: int = 20) -> dict:
    """Generate synthetic distribution data near Jakarta for demo."""
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
        })
    return {"depot": depot, "customers": customers}

def analyze_routes_from_file(df: pd.DataFrame, params: dict) -> dict:
    """
    Parse a DataFrame into depot and customers, then run optimization.
    Expected columns:
      - Tipe Lokasi / Type: "Depot" or "Pelanggan"
      - Nama Lokasi / Name: Name of the stop
      - Latitude / Lat
      - Longitude / Lon
      - Permintaan / Demand (0 for Depot)
    """
    # Normalize columns
    col_map = {}
    for c in df.columns:
        cl = str(c).strip().lower()
        if cl in ("tipe", "type", "tipe lokasi", "jenis"):
            col_map[c] = "type"
        elif cl in ("nama", "name", "nama lokasi", "customer"):
            col_map[c] = "name"
        elif cl in ("lat", "latitude"):
            col_map[c] = "lat"
        elif cl in ("lon", "longitude", "long"):
            col_map[c] = "lon"
        elif cl in ("demand", "permintaan", "qty", "quantity"):
            col_map[c] = "demand"
    
    df = df.rename(columns=col_map)
    
    req_cols = {"type", "name", "lat", "lon", "demand"}
    missing = req_cols - set(df.columns)
    if missing:
        # Try to fallback if columns are missing but standard
        if "lat" not in df.columns or "lon" not in df.columns:
            return {"error": f"Kolom GPS tidak lengkap. Kurang: {', '.join(missing)}"}
    
    depot = None
    customers = []
    
    for _, row in df.iterrows():
        t = str(row.get("type", "")).strip().lower()
        name = str(row.get("name", "Unknown"))
        
        try:
            lat = float(row.get("lat", 0))
            lon = float(row.get("lon", 0))
            demand = float(row.get("demand", 0))
        except (ValueError, TypeError):
            continue
            
        if t == "depot" or "depot" in t:
            depot = {"name": name, "lat": lat, "lon": lon, "demand": 0}
        else:
            customers.append({"name": name, "lat": lat, "lon": lon, "demand": demand})
            
    if not depot:
        return {"error": "Tidak ditemukan baris dengan tipe 'Depot' di dalam file."}
    if not customers:
        return {"error": "Tidak ditemukan baris dengan tipe 'Pelanggan' di dalam file."}
        
    params["depot"] = depot
    params["customers"] = customers
    
    return run_route_optimization(params)


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

    # Run all 3 methods
    methods_results = []

    total_stops = len(customers)

    # 1. Nearest Neighbor
    nn_routes = nearest_neighbor(dist_matrix, demands, vehicle_capacity)
    nn_dist = _total_distance(nn_routes, dist_matrix)
    nn_cost = calc_route_cost(nn_dist, len(nn_routes), total_stops, cost_params)
    methods_results.append({
        "method": "Nearest Neighbor",
        "routes": _format_routes(nn_routes, names),
        "raw_routes": nn_routes,
        "total_distance_km": round(nn_dist, 2),
        "n_vehicles": len(nn_routes),
        "cost": nn_cost,
    })

    # 2. Clarke-Wright Savings + 2-opt
    cw_routes = clarke_wright_savings(dist_matrix, demands, vehicle_capacity)
    cw_routes = [two_opt(r, dist_matrix) for r in cw_routes]
    cw_dist = _total_distance(cw_routes, dist_matrix)
    cw_cost = calc_route_cost(cw_dist, len(cw_routes), total_stops, cost_params)
    methods_results.append({
        "method": "Clarke-Wright + 2-opt",
        "routes": _format_routes(cw_routes, names),
        "raw_routes": cw_routes,
        "total_distance_km": round(cw_dist, 2),
        "n_vehicles": len(cw_routes),
        "cost": cw_cost,
    })

    # 3. Genetic Algorithm + 2-opt
    ga_routes, ga_convergence = genetic_algorithm(
        dist_matrix, demands, vehicle_capacity,
        pop_size=ga_pop_size, generations=ga_generations,
    )
    ga_dist = _total_distance(ga_routes, dist_matrix)
    ga_cost = calc_route_cost(ga_dist, len(ga_routes), total_stops, cost_params)
    methods_results.append({
        "method": "Genetic Algorithm + 2-opt",
        "routes": _format_routes(ga_routes, names),
        "raw_routes": ga_routes,
        "total_distance_km": round(ga_dist, 2),
        "n_vehicles": len(ga_routes),
        "cost": ga_cost,
        "convergence": [round(v, 2) for v in ga_convergence],
    })

    # Find best method
    best = min(methods_results, key=lambda x: x["cost"]["total_cost"])
    baseline_cost = methods_results[0]["cost"]["total_cost"]  # NN is baseline
    best_saving_pct = round((1 - best["cost"]["total_cost"] / max(baseline_cost, 1)) * 100, 2)

    # Sensitivity analysis using best method's distance
    sensitivity = run_sensitivity_analysis(
        best["total_distance_km"], best["n_vehicles"], total_stops, cost_params,
    )

    # Build location data for frontend visualization
    location_data = []
    for i, loc in enumerate(locations):
        location_data.append({
            "index": i,
            "name": names[i],
            "lat": loc["lat"],
            "lon": loc["lon"],
            "demand": demands[i],
            "is_depot": i == 0,
        })

    insights = [
        f"Metode terbaik: {best['method']} — total cost Rp {best['cost']['total_cost']:,.0f}.",
        f"Penghematan {best_saving_pct}% dibanding baseline (Nearest Neighbor).",
        f"Jumlah kendaraan optimal: {best['n_vehicles']} unit.",
        f"Total jarak: {best['total_distance_km']:.1f} km.",
    ]

    return {
        "methods": methods_results,
        "best_method": best["method"],
        "saving_vs_baseline_pct": best_saving_pct,
        "sensitivity": sensitivity,
        "locations": location_data,
        "insights": insights,
        "cost_params_used": cost_params,
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
