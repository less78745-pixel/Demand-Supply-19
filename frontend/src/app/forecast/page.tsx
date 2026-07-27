"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { FileUploader } from '@/components/ui/FileUploader';
import { KPICard } from '@/components/ui/KPICard';
import { ForecastChart } from '@/components/charts/ForecastChart';
import { ModelComparisonTable } from '@/components/charts/ModelComparisonTable';
import { LineChart, Info, AlertTriangle, Cpu, Target, BrainCircuit, Download } from 'lucide-react';
import { uploadForecastFile } from '@/lib/api';
import { MultiSelect } from '@/components/ui/MultiSelect';
import toast from 'react-hot-toast';

export default function ForecastPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<any>(null);
  
  const [selectedCabang, setSelectedCabang] = useState<string[]>(["All"]);
  const [selectedCategory, setSelectedCategory] = useState<string[]>(["All"]);
  const [selectedMethod, setSelectedMethod] = useState<string>("");

  // ── Restore previous results from localStorage ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem('lastForecast');
      if (saved) {
        const data = JSON.parse(saved);
        setResults(data);
        if (data.best_model) setSelectedMethod(data.best_model);
      }
    } catch { /* ignore corrupt data */ }
  }, []);

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    toast.loading('Training ML Models (SMA, SES, SARIMAX, XGBoost) per Cabang & Kategori...', { id: 'forecast-upload' });

    try {
      const data = await uploadForecastFile(file);
      if (data.error) {
        toast.error(data.error, { id: 'forecast-upload' });
      } else {
        setResults(data);
        setSelectedMethod(data.best_model);
        try {
          localStorage.setItem('lastForecast', JSON.stringify(data));
        } catch (e) {
          console.warn('Data terlalu besar untuk disimpan di memori browser');
        }
        toast.success('Analysis complete!', { id: 'forecast-upload' });
      }
    } catch (error: any) {
      console.error(error);
      const msg = error.message || 'Failed to train models. Check data format.';
      toast.error(msg, { id: 'forecast-upload' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExport = () => {
    if (!results) return;

    const lines = [
      'Cabang,Category,Date,Actual,SMA-3,SES,SARIMAX,XGBoost,Is Anomaly,Is Future,Best Model,MAPE,Bias,MAD,RMSE,ROP,Safety Stock',
      ...(results.forecast_data || []).map((r: any) => 
        `"${r.cabang}","${r.category}","${r.date}",${r.actual || ''},${r.forecasts['SMA-3'] ?? ''},${r.forecasts['SES'] ?? ''},${r.forecasts['SARIMAX'] ?? ''},${r.forecasts['XGBoost'] ?? ''},${r.is_anomaly},${r.is_future},"${r.best_model || ''}",${r.mape?.toFixed(2) || ''},${r.bias?.toFixed(2) || ''},${r.mad?.toFixed(2) || ''},${r.rmse?.toFixed(2) || ''},${r.rop?.toFixed(2) || ''},${r.safety_stock?.toFixed(2) || ''}`
      )
    ];

    // DSP Insights section
    const insights: string[] = results.ai_insights || [];
    if (insights.length > 0) {
      lines.push('');
      lines.push('--- DSP INSIGHTS ---');
      insights.forEach((ins: string) => lines.push(`"${ins}"`));
    }

    // KPI Summary
    lines.push('');
    lines.push('--- DSP KPI SUMMARY ---');
    lines.push(`Best Model (Global),${results.best_model || 'N/A'}`);
    lines.push(`Avg Safety Stock,${results.inventory_kpis?.avg_safety_stock || 0}`);
    lines.push(`Avg Reorder Point,${results.inventory_kpis?.avg_reorder_point || 0}`);

    // Model Tally
    const tally = results.model_tally || {};
    if (Object.keys(tally).length > 0) {
      lines.push('');
      lines.push('--- DSP MODEL DISTRIBUTION ---');
      lines.push('Model,Count');
      Object.entries(tally).forEach(([model, count]) => lines.push(`${model},${count}`));
    }

    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute("download", `Hasil Forecast_${dateStr}_DSP.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Full report exported with DSP Insights!');
  };

  const cabangs = useMemo(() => {
    if (!results) return [];
    return ["All", ...Array.from(new Set<string>(results.forecast_data.map((d:any) => d.cabang)))];
  }, [results]);

  const categories = useMemo(() => {
    if (!results) return [];
    return ["All", ...Array.from(new Set<string>(results.forecast_data.map((d:any) => d.category)))];
  }, [results]);

  const filteredData = useMemo(() => {
    if (!results) return [];
    return results.forecast_data.filter((d: any) => 
      (selectedCabang.includes("All") || selectedCabang.includes(d.cabang)) &&
      (selectedCategory.includes("All") || selectedCategory.includes(d.category))
    );
  }, [results, selectedCabang, selectedCategory]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      <header className="mb-8 border-b border-border pb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3 uppercase">
          <LineChart className="w-8 h-8 text-primary" />
          Advanced Causal Sales Forecasting
        </h1>
        <p className="text-muted-foreground mt-2 font-medium">
          Hierarchical forecasting combining historical trends with exogenous variables per branch and category.
        </p>
      </header>

      {/* Upload & Instructions Row */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <div className="md:col-span-2">
          <GlassCard>
            <FileUploader
              onFileUpload={handleFileUpload}
              isLoading={isProcessing}
              templateCsv={
                'Cabang,Category,Date,Sales\n' +
                'Jakarta,Electronics,2023-01-01,150\n' +
                'Surabaya,Apparel,2023-01-01,200\n' +
                'Jakarta,Electronics,2023-02-01,160'
              }
              templateName="forecast_template.csv"
              label="Upload Data Historis Penjualan"
              description="File CSV dengan minimal kolom: Cabang, Category, Date, Sales. Data akan ditraining dengan 4 model ML sekaligus."
            />
          </GlassCard>
        </div>
        <div className="md:col-span-1">
          <GlassCard className="h-full bg-muted/30">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 uppercase tracking-wide">
              <BrainCircuit className="w-5 h-5 text-primary" /> Auto-ML Pipeline
            </h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-none bg-primary mt-1.5 shrink-0" />
                <span><strong className="text-foreground">SMA (Simple Moving Avg)</strong>: Baseline stabil untuk produk minim tren.</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-none bg-primary mt-1.5 shrink-0" />
                <span><strong className="text-foreground">SES (Exponential Smoothing)</strong>: Sensitif pada data terbaru.</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-none bg-primary mt-1.5 shrink-0" />
                <span><strong className="text-foreground">SARIMAX</strong>: Menangkap pola musiman & auto-korelasi.</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-none bg-primary mt-1.5 shrink-0" />
                <span><strong className="text-foreground">XGBoost</strong>: Machine Learning untuk interaksi kompleks antar variabel (Gradient Boosting).</span>
              </li>
            </ul>
          </GlassCard>
        </div>
      </div>

      {results && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid md:grid-cols-4 gap-6">
            <KPICard title="Majority Best Model" value={results.best_model} icon={<Cpu />} />
            <KPICard title="Reorder Point (ROP)" value={results.inventory_kpis?.avg_reorder_point || 0} icon={<BrainCircuit />} />
            <KPICard title="Avg Safety Stock" value={results.inventory_kpis?.avg_safety_stock || 0} icon={<AlertTriangle />} />
            <KPICard title="Total Datapoints" value={filteredData.length} icon={<Target />} />
          </div>

          <GlassCard>
            <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4 border-b border-border pb-6">
              <div>
                <h3 className="text-lg font-bold text-foreground uppercase tracking-wide">Actual vs Forecast</h3>
                <div className="flex flex-wrap gap-3 mt-4">
                  <MultiSelect
                    options={cabangs}
                    selected={selectedCabang}
                    onChange={setSelectedCabang}
                    selectAllLabel="Semua Cabang"
                  />
                  <MultiSelect
                    options={categories}
                    selected={selectedCategory}
                    onChange={setSelectedCategory}
                    selectAllLabel="Semua Kategori"
                  />
                  <select 
                    value={selectedMethod} 
                    onChange={e => setSelectedMethod(e.target.value)} 
                    className="bg-background border border-border rounded-md px-3 py-2 text-sm text-primary font-bold focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary hover:border-primary/50 transition-colors"
                  >
                    {results.available_methods.map((m:string) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 shrink-0 mt-4 md:mt-0">
                <button onClick={handleExport}
                  className="px-4 py-2 bg-background text-foreground border border-border rounded-md hover:border-primary transition text-sm flex items-center gap-2 font-medium">
                  <Download className="w-4 h-4" /> Export CSV
                </button>
              </div>
            </div>
            
            {filteredData.length > 0
              ? <ForecastChart data={filteredData} activeMethod={selectedMethod} />
              : <div className="h-40 flex items-center justify-center text-muted-foreground text-sm font-medium">
                  Tidak ada data untuk filter yang dipilih.
                </div>
            }
          </GlassCard>

          {/* Model Comparison Table rendering based on current selection */}
          {results && results.model_comparison && (
            <ModelComparisonTable modelComparison={results.model_comparison} />
          )}
        </div>
      )}
    </div>
  );
}
