/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { KPICard } from '@/components/ui/KPICard';
import {
  MapPin, Settings, Play, Database,
  DollarSign, Clock, Layers, Maximize, UploadCloud, Download
} from 'lucide-react';
import { simulateWHTrans, uploadWHTransFile } from '@/lib/api';
import toast from 'react-hot-toast';
import { FileUploader } from '@/components/ui/FileUploader';
import { supabase } from '@/lib/supabase';
import { useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer
} from 'recharts';

export default function WHTransMPPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  
  // Params
  const [file, setFile] = useState<File | null>(null);
  const [numHubs, setNumHubs] = useState(3);
  const [costPerCbmKm, setCostPerCbmKm] = useState(1500);
  const [maxSla, setMaxSla] = useState(3);
  
  const handleDownloadTemplate = () => {
    window.open('/wh_trans_template.xlsx', '_blank');
  };

  // ── Restore previous results from Supabase ──
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const { data: dbData, error } = await supabase
          .from('processed_results')
          .select('*')
          .eq('module', 'wh_trans_mp')
          .order('created_at', { ascending: false })
          .limit(1);
          
        if (dbData && dbData.length > 0) {
          const row = dbData[0];
          const parsed = JSON.parse(row.result_json);
          parsed.processed_at = row.created_at;
          setData(parsed.data_summary);
          setSimulationResult(parsed.result);
        }
      } catch (err) {
        console.error("Failed fetching initial wh-trans data:", err);
      }
    };
    
    fetchInitialData();
    
    const channel = supabase
      .channel('wh_trans_mp_updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'processed_results', filter: 'module=eq.wh_trans_mp' },
        (payload) => {
          try {
            const newData = JSON.parse(payload.new.result_json);
            newData.processed_at = payload.new.created_at;
            
            const lastProcessedAt = sessionStorage.getItem('last_processed_at_wh_trans_mp');
            if (lastProcessedAt === newData.processed_at) return;

            setData(newData.data_summary);
            setSimulationResult(newData.result);
            toast.success('Pembaruan data dari pengguna lain diterima!', { 
              icon: '🔄',
              duration: 5000,
              style: { background: '#22c55e', color: '#fff', fontWeight: 'bold' } 
            });
          } catch (e) {
            console.error("Failed parsing realtime data", e);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleLoadDemo = async () => {
    try {
      setLoading(true);
      const res = await fetch('/wh_trans_template.xlsx');
      const blob = await res.blob();
      const demoFile = new File([blob], 'demo_data.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      setFile(demoFile);
      toast.success('Demo data loaded! Click Run to simulate.');
    } catch (err) {
      toast.error('Failed to load demo data');
    } finally {
      setLoading(false);
    }
  };

  const handleSimulate = async () => {
    if (!file) return toast.error('Please upload an Excel dataset first');
    try {
      setLoading(true);
      const res = await uploadWHTransFile(file, numHubs, costPerCbmKm);
      res.processed_at = res.processed_at || new Date().toISOString();
      setData(res.data_summary);
      setSimulationResult(res.result);
      sessionStorage.setItem('last_processed_at_wh_trans_mp', res.processed_at);
      toast.success('Simulation completed');
    } catch (err: any) {
      toast.error(err.message || 'Failed to run simulation');
    } finally {
      setLoading(false);
    }
  };

  // Format currency
  const formatRp = (val: number) => 
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 animate-in fade-in zoom-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-200">
              <MapPin className="w-6 h-6 text-white" />
            </div>
            WH-TRANS-MP
          </h1>
          <p className="text-slate-500 mt-2 flex items-center gap-2">
            Decentralized Logistics Network Simulator
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Controls Panel */}
        <GlassCard className="p-6 border-slate-200 bg-white/60 shadow-xl lg:col-span-1 h-fit">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-6 pb-4 border-b border-slate-200">
            <Settings className="w-5 h-5 text-indigo-500" />
            Simulation Parameters
          </h2>
          
          <div className="space-y-6">
            <div className="mb-4">
              <FileUploader 
                onFileUpload={(f) => setFile(f)}
                acceptedTypes={{
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
                }}
                label="Upload Dataset (Excel)"
                description="Upload file containing Demand, Supply, and RedZone sheets"
              />
            </div>
            
            <div className="flex gap-2">
              <button 
                onClick={handleDownloadTemplate}
                className="w-1/2 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-all text-sm flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Template
              </button>
              <button 
                onClick={handleLoadDemo}
                className="w-1/2 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl font-bold transition-all text-sm flex items-center justify-center gap-2"
              >
                <Database className="w-4 h-4" />
                Data Demo
              </button>
            </div>

            <div className="pt-6 border-t border-slate-200 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Cost per CBM per KM (Rp)</label>
                <input 
                  type="number" 
                  value={costPerCbmKm}
                  onChange={(e) => setCostPerCbmKm(parseInt(e.target.value) || 0)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Target SLA (Max Lead Time Days)</label>
                <input 
                  type="number" 
                  value={maxSla}
                  onChange={(e) => setMaxSla(parseInt(e.target.value) || 1)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Number of Decentralized Hubs (N)</label>
              <input 
                type="number" 
                value={numHubs}
                onChange={(e) => setNumHubs(parseInt(e.target.value) || 1)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <button 
              onClick={handleSimulate}
              disabled={loading || !file}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-200 hover:shadow-xl hover:shadow-indigo-300 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Play className="w-5 h-5" />
              Run Clustering
            </button>
          </div>

          {file && !simulationResult && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-xl text-green-800 text-sm">
              <strong>Data loaded!</strong> File {file.name} is ready. Click Run to simulate network optimization.
            </div>
          )}
        </GlassCard>

        {/* Output Panel */}
        <div className="lg:col-span-2 space-y-6">
          
          {simulationResult ? (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <KPICard 
                  title="Total Cost Savings" 
                  value={formatRp(simulationResult.summary.cost_savings)} 
                  icon={<DollarSign className="w-5 h-5" />} 
                  trend={`${simulationResult.summary.savings_pct.toFixed(1)}%`} 
                />
                <KPICard 
                  title="Avg Dist 1-Hub" 
                  value={`${simulationResult.summary.avg_dist_central.toFixed(1)} km`} 
                  icon={<Maximize className="w-5 h-5" />} 
                  trend="Before" 
                />
                <KPICard 
                  title="Avg Dist N-Hubs" 
                  value={`${simulationResult.summary.avg_dist_decentral.toFixed(1)} km`} 
                  icon={<Clock className="w-5 h-5" />} 
                  trend="After" 
                />
              </div>

              {/* Map View */}
              <GlassCard className="p-0 border-slate-200 bg-white shadow-xl overflow-hidden rounded-xl">
                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-indigo-500" />
                    Interactive Network Map
                  </h3>
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded font-medium border border-red-200">
                    Red Zones Avoided
                  </span>
                </div>
                <iframe 
                  className="w-full h-[500px] border-0"
                  srcDoc={simulationResult.map_html}
                  title="Interactive Network Map"
                />
              </GlassCard>

              {/* Chart & Tables */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <GlassCard className="p-6 border-slate-200 bg-white shadow-xl">
                  <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <Layers className="w-5 h-5 text-indigo-500" />
                    Cost vs SLA Trade-off
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={simulationResult.chart_data}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="left" tickFormatter={(v) => (v/1000000).toFixed(0) + 'M'} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => v.toFixed(0) + 'km'} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <RechartsTooltip cursor={{ fill: '#f1f5f9' }} formatter={(val: any, name: any) => [String(name).includes('Cost') ? formatRp(val) : val.toFixed(2) + ' km', name]} />
                        <Legend wrapperStyle={{ fontSize: 12, paddingTop: '10px' }} />
                        <Bar yAxisId="left" dataKey="Total Cost" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={50} />
                        <Bar yAxisId="right" dataKey="Avg Lead Dist (KM)" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={50} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </GlassCard>

                <GlassCard className="p-6 border-slate-200 bg-white shadow-xl">
                  <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-indigo-500" />
                    Hub Allocation Summary
                  </h3>
                  <div className="overflow-auto max-h-64 rounded-lg border border-slate-200">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 text-slate-600 font-semibold sticky top-0">
                        <tr>
                          <th className="px-4 py-3">Hub ID</th>
                          <th className="px-4 py-3">Customers</th>
                          <th className="px-4 py-3">Vol Allocated</th>
                          <th className="px-4 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {simulationResult.summary.hubs.map((hub: any, i: number) => (
                          <tr key={i} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-medium text-slate-700">{hub.hub_id}</td>
                            <td className="px-4 py-3">{hub.customer_count}</td>
                            <td className="px-4 py-3 font-medium">{hub.allocated_volume.toLocaleString()} CBM</td>
                            <td className="px-4 py-3">
                              {hub.pushed ? (
                                <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs font-bold border border-amber-200">Repulsed</span>
                              ) : (
                                <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold border border-green-200">Optimal</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </GlassCard>
              </div>
            </>
          ) : (
            <div className="h-full min-h-[400px] flex items-center justify-center bg-slate-50 border border-slate-200 border-dashed rounded-xl">
              <div className="text-center text-slate-400">
                <MapPin className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>Generate data and run simulation to view network analytics</p>
              </div>
            </div>
          )}
          
          {/* Raw Data Model */}
          {data && (
            <GlassCard className="p-6 border-slate-200 bg-white shadow-xl mt-6">
              <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                <Database className="w-5 h-5 text-indigo-500" />
                Raw Data Model (Preview)
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-semibold text-slate-600 mb-2">Demand Data (Sample)</h4>
                  <div className="overflow-auto max-h-48 rounded-lg border border-slate-200">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-600 font-semibold sticky top-0">
                        <tr>
                          <th className="px-3 py-2">ID</th>
                          <th className="px-3 py-2">Lat</th>
                          <th className="px-3 py-2">Lon</th>
                          <th className="px-3 py-2">Volume</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.customers?.slice(0, 50).map((c: any, i: number) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-medium">{c.id}</td>
                            <td className="px-3 py-2">{c.lat.toFixed(4)}</td>
                            <td className="px-3 py-2">{c.lon.toFixed(4)}</td>
                            <td className="px-3 py-2">{c.volume.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-slate-600 mb-2">Red Zone Constraints</h4>
                  <div className="overflow-auto max-h-48 rounded-lg border border-slate-200">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-600 font-semibold sticky top-0">
                        <tr>
                          <th className="px-3 py-2">Zone Name</th>
                          <th className="px-3 py-2">Lat</th>
                          <th className="px-3 py-2">Lon</th>
                          <th className="px-3 py-2">Radius (KM)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.red_zones?.map((rz: any, i: number) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-medium">{rz.name}</td>
                            <td className="px-3 py-2">{rz.lat.toFixed(4)}</td>
                            <td className="px-3 py-2">{rz.lon.toFixed(4)}</td>
                            <td className="px-3 py-2">{rz.radius}</td>
                          </tr>
                        ))}
                        {(!data.red_zones || data.red_zones.length === 0) && (
                          <tr>
                            <td colSpan={4} className="px-3 py-4 text-center text-slate-400">No Red Zones defined</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </GlassCard>
          )}

        </div>
      </div>
    </div>
  );
}
