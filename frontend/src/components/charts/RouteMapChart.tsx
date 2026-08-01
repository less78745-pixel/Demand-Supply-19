/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useMemo } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ZAxis, Line, ComposedChart, Legend,
} from 'recharts';

interface Location {
  index: number;
  name: string;
  lat: number;
  lon: number;
  demand: number;
  is_depot: boolean;
}

interface RouteStop {
  index: number;
  name: string;
}

interface RouteData {
  route_id: number;
  stops: RouteStop[];
  n_stops: number;
}

interface RouteMapChartProps {
  locations: Location[];
  routes: RouteData[];
  methodName: string;
}

const ROUTE_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
];

export function RouteMapChart({ locations, routes, methodName }: RouteMapChartProps) {
  const depot = locations.find(l => l.is_depot);
  const customers = locations.filter(l => !l.is_depot);

  // Build route lines as segments
  const routeLines = useMemo(() => {
    const lines: { lat1: number; lon1: number; lat2: number; lon2: number; routeId: number; color: string }[] = [];

    routes.forEach((route, idx) => {
      const color = ROUTE_COLORS[idx % ROUTE_COLORS.length];
      const stops = route.stops;
      if (!depot || stops.length === 0) return;

      // Depot → first stop
      const firstStop = locations.find(l => l.index === stops[0].index);
      if (firstStop) {
        lines.push({ lat1: depot.lat, lon1: depot.lon, lat2: firstStop.lat, lon2: firstStop.lon, routeId: route.route_id, color });
      }

      // Between stops
      for (let i = 0; i < stops.length - 1; i++) {
        const from = locations.find(l => l.index === stops[i].index);
        const to = locations.find(l => l.index === stops[i + 1].index);
        if (from && to) {
          lines.push({ lat1: from.lat, lon1: from.lon, lat2: to.lat, lon2: to.lon, routeId: route.route_id, color });
        }
      }

      // Last stop → depot
      const lastStop = locations.find(l => l.index === stops[stops.length - 1].index);
      if (lastStop) {
        lines.push({ lat1: lastStop.lat, lon1: lastStop.lon, lat2: depot.lat, lon2: depot.lon, routeId: route.route_id, color });
      }
    });

    return lines;
  }, [locations, routes, depot]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const data = payload[0]?.payload;
    if (!data) return null;
    return (
      <div className="glass-card rounded-lg px-3 py-2 text-xs shadow-lg border border-border">
        <p className="font-bold text-foreground">{data.name}</p>
        <p className="text-muted-foreground">
          {data.is_depot ? '📍 Depot' : `Demand: ${data.demand} unit`}
        </p>
        <p className="text-muted-foreground font-mono">
          ({data.lat.toFixed(4)}, {data.lon.toFixed(4)})
        </p>
      </div>
    );
  };

  // Calculate bounds for axes
  const allLats = locations.map(l => l.lat);
  const allLons = locations.map(l => l.lon);
  const latPad = (Math.max(...allLats) - Math.min(...allLats)) * 0.1 || 0.01;
  const lonPad = (Math.max(...allLons) - Math.min(...allLons)) * 0.1 || 0.01;

  return (
    <div>
      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
        Peta Rute — {methodName}
      </h4>

      <div className="relative" style={{ height: 400 }}>
        {/* SVG overlay for route lines */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox={`${Math.min(...allLons) - lonPad} ${Math.min(...allLats) - latPad} ${Math.max(...allLons) - Math.min(...allLons) + lonPad * 2} ${Math.max(...allLats) - Math.min(...allLats) + latPad * 2}`}
          preserveAspectRatio="none"
          style={{ zIndex: 5 }}
        >
          {routeLines.map((line, idx) => (
            <line
              key={idx}
              x1={line.lon1}
              y1={line.lat1}
              x2={line.lon2}
              y2={line.lat2}
              stroke={line.color}
              strokeWidth={0.002}
              strokeOpacity={0.7}
            />
          ))}
        </svg>

        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              type="number" dataKey="lon" name="Longitude"
              domain={[Math.min(...allLons) - lonPad, Math.max(...allLons) + lonPad]}
              stroke="hsl(var(--muted-foreground))" fontSize={10} tickCount={6}
            />
            <YAxis
              type="number" dataKey="lat" name="Latitude"
              domain={[Math.min(...allLats) - latPad, Math.max(...allLats) + latPad]}
              stroke="hsl(var(--muted-foreground))" fontSize={10} tickCount={6}
            />
            <ZAxis type="number" dataKey="demand" range={[60, 300]} />
            <Tooltip content={<CustomTooltip />} />

            {/* Depot */}
            {depot && (
              <Scatter
                name="Depot"
                data={[depot]}
                fill="#ef4444"
                shape="star"
              />
            )}

            {/* Customers */}
            <Scatter
              name="Pelanggan"
              data={customers}
              fill="#3b82f6"
              shape="circle"
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Route legend */}
      <div className="flex flex-wrap gap-3 mt-3">
        {routes.map((route: any, idx) => (
          <span
            key={route.route_id}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border transition-all ${
              route.is_dedicated
                ? 'bg-orange-500/10 border-orange-500/40 text-orange-500 font-bold shadow-xs'
                : 'bg-background/50 border-border text-muted-foreground'
            }`}
          >
            <span className="w-3 h-1 rounded" style={{ background: ROUTE_COLORS[idx % ROUTE_COLORS.length] }} />
            {route.vehicle_name || `Rute ${route.route_id}`} {route.is_dedicated ? '🛡️ [DEDICATED]' : '⚡ [OPTIMASI]'} ({route.n_stops} stop)
          </span>
        ))}
      </div>
    </div>
  );
}
