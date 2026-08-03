/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { KPICard } from '@/components/ui/KPICard';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { TimestampBadge } from '@/components/ui/TimestampBadge';
import { FileUploader } from '@/components/ui/FileUploader';
import {
  Layers, Activity, TrendingUp, AlertTriangle, CheckCircle2,
  Cpu, Sparkles, RefreshCw, FileSpreadsheet, Download,
  GitMerge, Calendar, ArrowRight, ShieldCheck, HelpCircle,
  BarChart3, Box, Zap
} from 'lucide-react';
import toast from 'react-hot-toast';
import { get, set } from 'idb-keyval';
import {
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend
} from 'recharts';
import * as XLSX from 'xlsx';
import { getStandardFilename } from '@/utils/export';

// ══════════════════════════════════════════════════════════════════════════════
//  TYPES & DATA STRUCTURES
// ══════════════════════════════════════════════════════════════════════════════

export interface DDMRPPhase2Row {
  id: string;
  cabang: string;
  category: string;
  cutOffDate: string;
  initialOnHand: number;
  leadTimeWeeks: number;
  moq: number;
  orderCycleWeeks: number;
  // 4 Months Rolling Supply Pipeline (Month 0, 1, 2, 3)
  inbound: {
    to: number[];
    vessel: number[];
    planLoading: number[];
    finishProd: number[];
  };
  // 3 Jalur Perhitungan Demand over 4 Months
  demandForecast: number[];
  demandTargetHistory: number[];
  demandTargetDesign: number[];
}

export interface MonthCalcResult {
  monthIndex: number;
  monthLabel: string;
  startingStock: number;
  inboundTotal: number; // TO + Vessel + PlanLoading + FinishProd
  qualifiedDemand: number;
  adu: number;
  redZone: number;
  yellowZone: number;
  greenZone: number;
  topOfRed: number;
  topOfYellow: number;
  topOfGreen: number;
  nfp: number; // Net Flow Position = Starting + Inbound - Demand
  orderSuggestion: number; // Replenishment suggestion based on MOQ
  endingStock: number; // Starting + Inbound + Order - Demand (rolled to next month)
  zoneStatus: 'RED' | 'YELLOW' | 'GREEN' | 'CYAN';
}

export interface CalculatedItem {
  raw: DDMRPPhase2Row;
  months: MonthCalcResult[];
}

type ScenarioType = 'forecast' | 'history' | 'design';

const SCENARIOS = [
  {
    id: 'forecast' as ScenarioType,
    title: 'Jalur 1: Data Forecast',
    desc: 'Perhitungan DDMRP berlandaskan estimasi peramalan demand mingguan (Forecast 52-Weeks).',
    color: 'from-blue-600 to-cyan-500',
    border: 'border-cyan-500/30',
    icon: BarChart3
  },
  {
    id: 'history' as ScenarioType,
    title: 'Jalur 2: Target Kontribusi History',
    desc: 'Perhitungan berlandaskan rasio tren penjualan nyata dari histori masa lampau.',
    color: 'from-purple-600 to-indigo-500',
    border: 'border-purple-500/30',
    icon: TrendingUp
  },
  {
    id: 'design' as ScenarioType,
    title: 'Jalur 3: Target by Design',
    desc: 'Perhitungan spesifik mengikuti target ekspansi dan alokasi yang ditetapkan manajemen.',
    color: 'from-emerald-600 to-teal-500',
    border: 'border-emerald-500/30',
    icon: Zap
  }
];

const MONTH_LABELS = [
  'Bulan Ini (M+0)',
  'Bulan Ke-2 (M+1)',
  'Bulan Ke-3 (M+2)',
  'Bulan Ke-4 (M+3)'
];

// ══════════════════════════════════════════════════════════════════════════════
//  DEMO DATA GENERATOR & HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

function generateDemoDataset(): DDMRPPhase2Row[] {
  const cabangs = ['Surabaya', 'Jakarta', 'Bandung', 'Medan', 'Semarang', 'Makassar'];
  const categories = [
    { name: 'Minyak Goreng Premium 2L', moq: 1000, lt: 2, cycle: 1, baseStock: 4500, baseDemand: 3200 },
    { name: 'Beras Setra Ramos 5Kg', moq: 500, lt: 3, cycle: 2, baseStock: 2800, baseDemand: 1800 },
    { name: 'Gula Pasir Kristal 1Kg', moq: 2000, lt: 2, cycle: 1, baseStock: 6000, baseDemand: 4500 },
    { name: 'Tepung Terigu Serbaguna 1Kg', moq: 1500, lt: 4, cycle: 2, baseStock: 3200, baseDemand: 2500 },
    { name: 'Susu Kental Manis 370g', moq: 1200, lt: 3, cycle: 1, baseStock: 3900, baseDemand: 2900 },
    { name: 'Kopi Bubuk Murni 250g', moq: 800, lt: 2, cycle: 1, baseStock: 2100, baseDemand: 1400 },
  ];

  const result: DDMRPPhase2Row[] = [];
  let counter = 1;

  cabangs.forEach((cabang, idxC) => {
    categories.forEach((cat, idxCat) => {
      const varFactor = 0.8 + ((idxC + idxCat) % 5) * 0.15;
      const initialStock = Math.round(cat.baseStock * varFactor);

      const to = [Math.round(500 * varFactor), Math.round(600 * varFactor), Math.round(450 * varFactor), Math.round(550 * varFactor)];
      const vessel = [Math.round(1200 * varFactor), Math.round(800 * varFactor), Math.round(1500 * varFactor), Math.round(1000 * varFactor)];
      const planLoading = [Math.round(900 * varFactor), Math.round(1100 * varFactor), Math.round(950 * varFactor), Math.round(1200 * varFactor)];
      const finishProd = [Math.round(800 * varFactor), Math.round(900 * varFactor), Math.round(850 * varFactor), Math.round(950 * varFactor)];

      const demandForecast = [
        Math.round(cat.baseDemand * varFactor),
        Math.round(cat.baseDemand * varFactor * 1.05),
        Math.round(cat.baseDemand * varFactor * 1.10),
        Math.round(cat.baseDemand * varFactor * 1.08),
      ];
      const demandHistory = [
        Math.round(cat.baseDemand * varFactor * 0.95),
        Math.round(cat.baseDemand * varFactor * 0.98),
        Math.round(cat.baseDemand * varFactor * 1.02),
        Math.round(cat.baseDemand * varFactor * 1.00),
      ];
      const demandDesign = [
        Math.round(cat.baseDemand * varFactor * 1.20),
        Math.round(cat.baseDemand * varFactor * 1.25),
        Math.round(cat.baseDemand * varFactor * 1.30),
        Math.round(cat.baseDemand * varFactor * 1.35),
      ];

      result.push({
        id: `DDMRP-P2-${counter++}`,
        cabang,
        category: cat.name,
        cutOffDate: '2026-08-01 (Week 31)',
        initialOnHand: initialStock,
        leadTimeWeeks: cat.lt,
        moq: cat.moq,
        orderCycleWeeks: cat.cycle,
        inbound: { to, vessel, planLoading, finishProd },
        demandForecast,
        demandTargetHistory: demandHistory,
        demandTargetDesign: demandDesign
      });
    });
  });

  return result;
}

/**
 * Core DDMRP Rolling Calculation Engine (4-Month Horizon)
 */
function calculateDDMRPPhase2(rows: DDMRPPhase2Row[], activeScenario: ScenarioType): CalculatedItem[] {
  return rows.map(row => {
    const months: MonthCalcResult[] = [];
    let prevEndingStock = row.initialOnHand;

    for (let m = 0; m < 4; m++) {
      const startingStock = m === 0 ? row.initialOnHand : prevEndingStock;
      
      const inboundTotal = (row.inbound.to[m] || 0) +
                           (row.inbound.vessel[m] || 0) +
                           (row.inbound.planLoading[m] || 0) +
                           (row.inbound.finishProd[m] || 0);

      let qualifiedDemand = 0;
      if (activeScenario === 'forecast') qualifiedDemand = row.demandForecast[m] || 0;
      else if (activeScenario === 'history') qualifiedDemand = row.demandTargetHistory[m] || 0;
      else qualifiedDemand = row.demandTargetDesign[m] || 0;

      const adu = Number((qualifiedDemand / 30).toFixed(2));
      const ltDays = row.leadTimeWeeks * 7;
      const cycleDays = row.orderCycleWeeks * 7;

      const yellowZone = Number((adu * ltDays).toFixed(0));
      const ltf = row.leadTimeWeeks >= 4 ? 0.5 : row.leadTimeWeeks >= 3 ? 0.65 : 0.8;
      const redBase = Number((yellowZone * ltf).toFixed(0));
      const variabilityFactor = 0.5;
      const redSafety = Number((redBase * variabilityFactor).toFixed(0));
      const redZone = redBase + redSafety;

      const greenCandidate1 = yellowZone * ltf;
      const greenCandidate2 = adu * cycleDays;
      const greenZone = Number((Math.max(greenCandidate1, greenCandidate2, row.moq)).toFixed(0));

      const topOfRed = redZone;
      const topOfYellow = redZone + yellowZone;
      const topOfGreen = redZone + yellowZone + greenZone;

      const nfp = startingStock + inboundTotal - qualifiedDemand;

      let orderSuggestion = 0;
      if (nfp <= topOfYellow) {
        const deficit = topOfGreen - nfp;
        if (deficit > 0) {
          orderSuggestion = Math.ceil(deficit / row.moq) * row.moq;
        }
      }

      let zoneStatus: 'RED' | 'YELLOW' | 'GREEN' | 'CYAN' = 'GREEN';
      if (nfp <= topOfRed) zoneStatus = 'RED';
      else if (nfp <= topOfYellow) zoneStatus = 'YELLOW';
      else if (nfp > topOfGreen) zoneStatus = 'CYAN';

      const endingStock = Math.max(0, startingStock + inboundTotal + orderSuggestion - qualifiedDemand);

      months.push({
        monthIndex: m,
        monthLabel: MONTH_LABELS[m],
        startingStock,
        inboundTotal,
        qualifiedDemand,
        adu,
        redZone,
        yellowZone,
        greenZone,
        topOfRed,
        topOfYellow,
        topOfGreen,
        nfp,
        orderSuggestion,
        endingStock,
        zoneStatus
      });

      prevEndingStock = endingStock;
    }

    return { raw: row, months };
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

export default function DDMRPPhase2Page() {
  const [rawData, setRawData] = useState<DDMRPPhase2Row[]>([]);
  const [activeScenario, setActiveScenario] = useState<ScenarioType>('forecast');
  const [lastProcessed, setLastProcessed] = useState<string>(new Date().toISOString());
  const [selectedCabang, setSelectedCabang] = useState<string[]>(['All']);
  const [selectedCategory, setSelectedCategory] = useState<string[]>(['All']);
  const [selectedItemForChart, setSelectedItemForChart] = useState<string>('');
  const [showHowTo, setShowHowTo] = useState<boolean>(false);

  useEffect(() => {
    get('last_ddmrp_phase2_state').then(saved => {
      if (saved && saved.rawData && saved.rawData.length > 0) {
        setRawData(saved.rawData);
        setLastProcessed(saved.lastProcessed || new Date().toISOString());
        if (saved.rawData[0]) setSelectedItemForChart(saved.rawData[0].id);
      } else {
        const demo = generateDemoDataset();
        setRawData(demo);
        if (demo[0]) setSelectedItemForChart(demo[0].id);
      }
    }).catch(() => {
      const demo = generateDemoDataset();
      setRawData(demo);
      if (demo[0]) setSelectedItemForChart(demo[0].id);
    });
  }, []);

  useEffect(() => {
    if (rawData.length > 0) {
      set('last_ddmrp_phase2_state', { rawData, lastProcessed }).catch(() => {});
    }
  }, [rawData, lastProcessed]);

  const handleGenerateDemo = () => {
    const demo = generateDemoDataset();
    setRawData(demo);
    setLastProcessed(new Date().toISOString());
    if (demo[0]) setSelectedItemForChart(demo[0].id);
    toast.success('🎉 Data Contoh 52-Weeks & Rolling DDMRP Berhasil Dimuat!');
  };

  const handleDownloadTemplate = () => {
    const headers = [
      'Cabang,Category,CutOff_Date,Initial_OnHand,LeadTime_Weeks,MOQ,Order_Cycle_Weeks',
      'TO_M0,Vessel_M0,PlanLoading_M0,FinishProd_M0,DemandForecast_M0,DemandHistory_M0,DemandDesign_M0',
      'TO_M1,Vessel_M1,PlanLoading_M1,FinishProd_M1,DemandForecast_M1,DemandHistory_M1,DemandDesign_M1',
      'TO_M2,Vessel_M2,PlanLoading_M2,FinishProd_M2,DemandForecast_M2,DemandHistory_M2,DemandDesign_M2',
      'TO_M3,Vessel_M3,PlanLoading_M3,FinishProd_M3,DemandForecast_M3,DemandHistory_M3,DemandDesign_M3'
    ].join(',');

    const exampleRow = [
      'Surabaya,Minyak Goreng Premium 2L,2026-08-01,4500,2,1000,1',
      '500,1200,900,800,3200,3000,3800',
      '600,800,1100,900,3360,3100,4000',
      '450,1500,950,850,3520,3250,4150',
      '550,1000,1200,950,3450,3200,4300'
    ].join(',');

    const blob = new Blob(['\ufeff' + headers + '\n' + exampleRow], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'template_raw_ddmrp_phase2_rolling.csv';
    link.click();
    URL.revokeObjectURL(url);
    toast.success('📁 Template CSV DDMRP Phase 2 Berhasil Diunduh');
  };

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result;
        if (!buffer) return;
        const data = new Uint8Array(buffer as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

        if (!rows || rows.length < 2) {
          toast.error('File Excel/CSV kosong atau format tidak valid!');
          return;
        }

        const newRows: DDMRPPhase2Row[] = [];
        // Mulai dari baris ke-1 (melewati header baris ke-0)
        for (let i = 1; i < rows.length; i++) {
          const rowData = rows[i];
          if (!rowData || rowData.length === 0) continue;

          const cols = rowData.map(c => c !== undefined && c !== null ? String(c).trim() : '');
          // Abaikan baris yang terlalu pendek atau seluruh atributnya kosong
          if (cols.join('').length < 3 || cols.length < 2) continue;

          const to = [Number(cols[7])||500, Number(cols[14])||600, Number(cols[21])||450, Number(cols[28])||550];
          const vessel = [Number(cols[8])||1200, Number(cols[15])||800, Number(cols[22])||1500, Number(cols[29])||1000];
          const planLoading = [Number(cols[9])||900, Number(cols[16])||1100, Number(cols[23])||950, Number(cols[30])||1200];
          const finishProd = [Number(cols[10])||800, Number(cols[17])||900, Number(cols[24])||850, Number(cols[31])||950];

          const demandForecast = [Number(cols[11])||2500, Number(cols[18])||2600, Number(cols[25])||2700, Number(cols[32])||2650];
          const demandTargetHistory = [Number(cols[12])||2300, Number(cols[19])||2400, Number(cols[26])||2500, Number(cols[33])||2450];
          const demandTargetDesign = [Number(cols[13])||3000, Number(cols[20])||3150, Number(cols[27])||3300, Number(cols[34])||3400];

          newRows.push({
            id: `DDMRP-UP-${i}`,
            cabang: cols[0] || 'Cabang Umum',
            category: cols[1] || 'Item Kategori',
            cutOffDate: cols[2] || '2026-08-01',
            initialOnHand: Number(cols[3]) || 4500,
            leadTimeWeeks: Number(cols[4]) || 2,
            moq: Number(cols[5]) || 500,
            orderCycleWeeks: Number(cols[6]) || 1,
            inbound: { to, vessel, planLoading, finishProd },
            demandForecast,
            demandTargetHistory,
            demandTargetDesign
          });
        }

        if (newRows.length > 0) {
          setRawData(newRows);
          setLastProcessed(new Date().toISOString());
          if (newRows[0]) setSelectedItemForChart(newRows[0].id);
          toast.success(`✅ Sukses memproses ${newRows.length} baris data dari file Excel/CSV!`);
        } else {
          toast.error('Gagal mengenali baris data pada file Anda.');
        }
      } catch (err) {
        console.error('Upload parser error:', err);
        toast.error('Terjadi kesalahan saat memproses struktur file Excel/CSV.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const calculated = useMemo(() => {
    return calculateDDMRPPhase2(rawData, activeScenario);
  }, [rawData, activeScenario]);

  const cabangs = useMemo(() => {
    return ['All', ...Array.from(new Set(rawData.map(r => r.cabang))).sort()];
  }, [rawData]);

  const categories = useMemo(() => {
    return ['All', ...Array.from(new Set(rawData.map(r => r.category))).sort()];
  }, [rawData]);

  const filteredData = useMemo(() => {
    return calculated.filter(item => {
      const matchCabang = selectedCabang.includes('All') || selectedCabang.includes(item.raw.cabang);
      const matchCategory = selectedCategory.includes('All') || selectedCategory.includes(item.raw.category);
      return matchCabang && matchCategory;
    });
  }, [calculated, selectedCabang, selectedCategory]);

  const kpiSummary = useMemo(() => {
    if (filteredData.length === 0) {
      return { totalItems: 0, totalOrderQty: 0, redAlertCount: 0, avgEndingStockM3: 0 };
    }
    let totalOrderQty = 0;
    let redAlertCount = 0;
    let totalEndingStockM3 = 0;

    filteredData.forEach(i => {
      i.months.forEach(m => {
        totalOrderQty += m.orderSuggestion;
        if (m.zoneStatus === 'RED') redAlertCount++;
      });
      totalEndingStockM3 += i.months[3].endingStock;
    });

    return {
      totalItems: filteredData.length,
      totalOrderQty,
      redAlertCount,
      avgEndingStockM3: Math.round(totalEndingStockM3 / filteredData.length)
    };
  }, [filteredData]);

  const currentChartItem = useMemo(() => {
    if (!selectedItemForChart && filteredData.length > 0) return filteredData[0];
    return filteredData.find(d => d.raw.id === selectedItemForChart) || filteredData[0];
  }, [filteredData, selectedItemForChart]);

  const chartSeries = useMemo(() => {
    if (!currentChartItem) return [];
    return currentChartItem.months.map(m => ({
      month: m.monthLabel,
      'Net Flow Position (NFP)': m.nfp,
      'Top of Green (Max Buffer)': m.topOfGreen,
      'Top of Yellow (Reorder Point)': m.topOfYellow,
      'Top of Red (Safety Limit)': m.topOfRed,
      'Recommended Order': m.orderSuggestion,
      'Ending Stock Proyeksi': m.endingStock
    }));
  }, [currentChartItem]);

  const handleExportExcel = () => {
    if (filteredData.length === 0) return;
    const header = [
      'Cabang,Category,CutOff_Date,LeadTime_Weeks,MOQ,OrderCycle_Weeks',
      'M0_StartingStock,M0_Inbound,M0_QualifiedDemand,M0_NFP,M0_Status,M0_OrderSuggestion,M0_EndingStock',
      'M1_StartingStock,M1_Inbound,M1_QualifiedDemand,M1_NFP,M1_Status,M1_OrderSuggestion,M1_EndingStock',
      'M2_StartingStock,M2_Inbound,M2_QualifiedDemand,M2_NFP,M2_Status,M2_OrderSuggestion,M2_EndingStock',
      'M3_StartingStock,M3_Inbound,M3_QualifiedDemand,M3_NFP,M3_Status,M3_OrderSuggestion,M3_EndingStock'
    ].join(',');

    const lines = [header];
    filteredData.forEach(row => {
      const basic = `"${row.raw.cabang}","${row.raw.category}","${row.raw.cutOffDate}",${row.raw.leadTimeWeeks},${row.raw.moq},${row.raw.orderCycleWeeks}`;
      const m0 = `${row.months[0].startingStock},${row.months[0].inboundTotal},${row.months[0].qualifiedDemand},${row.months[0].nfp},${row.months[0].zoneStatus},${row.months[0].orderSuggestion},${row.months[0].endingStock}`;
      const m1 = `${row.months[1].startingStock},${row.months[1].inboundTotal},${row.months[1].qualifiedDemand},${row.months[1].nfp},${row.months[1].zoneStatus},${row.months[1].orderSuggestion},${row.months[1].endingStock}`;
      const m2 = `${row.months[2].startingStock},${row.months[2].inboundTotal},${row.months[2].qualifiedDemand},${row.months[2].nfp},${row.months[2].zoneStatus},${row.months[2].orderSuggestion},${row.months[2].endingStock}`;
      const m3 = `${row.months[3].startingStock},${row.months[3].inboundTotal},${row.months[3].qualifiedDemand},${row.months[3].nfp},${row.months[3].zoneStatus},${row.months[3].orderSuggestion},${row.months[3].endingStock}`;
      lines.push(`${basic},${m0},${m1},${m2},${m3}`);
    });

    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = getStandardFilename(`DDMRP_Phase2_${activeScenario}`, new Date().toISOString(), 'csv');
    link.click();
    URL.revokeObjectURL(url);
    toast.success('📊 Hasil Analisis Rolling DDMRP Berhasil Diekspor!');
  };

  return (
    <div className="space-y-8 pb-16 min-h-screen animate-fade-in text-foreground">
      {/* ─── HEADER SECTION ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 sm:p-8 border border-indigo-500/20 shadow-2xl">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#6366f1_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase tracking-widest">
              <Layers className="w-3.5 h-3.5" /> Kalkulator DSP • Phase 2 Rolling
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white flex items-center gap-3">
              DDMRP Phase 2 <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-cyan-400 to-teal-300">(Rolling 4-Month Engine)</span>
            </h1>
            <p className="text-slate-300 text-sm sm:text-base max-w-3xl font-normal leading-relaxed">
              Simulasi interaktif visibilitas stok per <b>Cabang & Category</b> untuk <b>Bulan Ini hingga 3 Bulan ke Depan</b>.
              Menggabungkan jadwal suplai 52 minggu (TO, Vessel, Plan Loading, Finish Prod) dengan 3 Skenario Perhitungan Demand.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <TimestampBadge timestamp={lastProcessed} label="Olah Terakhir:" />
            <button
              onClick={() => setShowHowTo(!showHowTo)}
              className="w-full sm:w-auto px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              <HelpCircle className="w-4 h-4" />
              {showHowTo ? 'Tutup Panduan' : 'Panduan & Template'}
            </button>
          </div>
        </div>
      </div>

      {/* ─── PANDUAN, TEMPLATE & UPLOAD SECTION ─── */}
      {showHowTo && (
        <GlassCard className="p-6 border-indigo-500/30 bg-slate-900/80 backdrop-blur-xl animate-fade-in">
          <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-indigo-400" /> Panduan Raw Data & Upload 52-Weeks
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleDownloadTemplate}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-cyan-600/20"
              >
                <Download className="w-4 h-4" /> Unduh Template CSV
              </button>
              <button
                onClick={handleGenerateDemo}
                className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-indigo-500/20"
              >
                <Sparkles className="w-4 h-4" /> Gunakan Data Demo 52-Weeks
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-300 mb-6">
            <div className="space-y-2">
              <h4 className="font-semibold text-white">📌 Komponen Input Raw Data:</h4>
              <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-slate-400">
                <li><b>Cut Off Tanggal:</b> Tanggal acuan awal penarikan data (misal: 1 Agustus / Week 31).</li>
                <li><b>Initial On Hand:</b> Stok fisik tersedia pada tanggal Cut Off di cabang & kategori terkait.</li>
                <li><b>Suplai Inbound (Penambah Stok):</b> Gabungan dari jadwal <i>Transfer Order (TO), Vessel, Plan Loading,</i> & <i>Finish Production</i> per bulan/minggu sesuai ETA.</li>
                <li><b>Data Fix:</b> Parameter <i>Lead Time (Weeks), MOQ,</i> dan <i>Order Cycle (Weeks)</i>.</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-white">🔄 Mekanisme Rolling 4 Bulan:</h4>
              <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-slate-400">
                <li><b>Bulan Berjalan (M+0):</b> <code className="text-indigo-300">Ending Stock = Initial OnHand + Inbound + Recommended Order - Qualified Demand</code>.</li>
                <li><b>Bulan Ke-2 (M+1):</b> <code className="text-cyan-300">Ending Stock M+0</code> otomatis berubah menjadi <b>Saldo Awal (Starting Stock)</b> untuk Bulan Ke-2.</li>
                <li>Perhitungan terus berputar hingga <b>Bulan Ke-4 (M+3)</b> untuk memberikan Anda proyeksi lengkap kondisi ketersediaan barang.</li>
              </ul>
            </div>
          </div>

          <div className="pt-4 border-t border-white/10">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Unggah File Raw Data Anda (CSV/Excel):</h4>
            <FileUploader
              onFileUpload={handleFileUpload}
              label="Upload Data DDMRP Phase 2"
              description="Drag & drop file CSV/Excel Raw Data di sini, atau klik untuk browse"
            />
          </div>
        </GlassCard>
      )}

      {/* ─── TAB SWITCHER 3 JALUR PERHITUNGAN DEMAND ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
            <Zap className="w-4 h-4" /> Pilih 3 Jalur Perhitungan Demand (Skenario DDMRP):
          </h2>
          <span className="text-xs text-slate-400 italic hidden sm:inline">Klik tab untuk menghitung ulang seluruh matriks buffer secara instan!</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {SCENARIOS.map((sc) => {
            const Icon = sc.icon;
            const isSelected = activeScenario === sc.id;
            return (
              <button
                key={sc.id}
                onClick={() => {
                  setActiveScenario(sc.id);
                  toast.success(`Mengaktifkan perhitungan ${sc.title}`);
                }}
                className={`relative group p-4 sm:p-5 rounded-2xl transition-all duration-300 text-left border overflow-hidden shadow-lg ${
                  isSelected
                    ? `bg-gradient-to-br ${sc.color} text-white border-transparent ring-2 ring-white/20 shadow-indigo-500/25 scale-[1.02]`
                    : 'bg-slate-900/70 hover:bg-slate-800/80 text-slate-300 border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-base tracking-wide flex items-center gap-2.5">
                    <Icon className={`w-5 h-5 ${isSelected ? 'text-white' : 'text-indigo-400'}`} />
                    {sc.title}
                  </span>
                  {isSelected && (
                    <span className="px-2 py-0.5 rounded-full bg-white/20 text-white text-xs font-black uppercase tracking-wider">
                      Aktif
                    </span>
                  )}
                </div>
                <p className={`text-xs sm:text-sm leading-relaxed ${isSelected ? 'text-slate-100 font-medium' : 'text-slate-400'}`}>
                  {sc.desc}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── EXECUTIVE KPI SUMMARY CHIPS ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KPICard
          title="Kategori Dipantau"
          value={`${kpiSummary.totalItems} Item`}
          trend={`${selectedCabang.join(', ')}`}
          icon={<Box className="w-5 h-5 text-blue-400" />}
          className="border-blue-500/20 bg-blue-500/5 hover:border-blue-500/40 transition"
        />
        <KPICard
          title="Total Saran Order (4-Blok)"
          value={`${kpiSummary.totalOrderQty.toLocaleString('id-ID')} Qty`}
          trend="Total Replenishment 4 Bulan"
          icon={<TrendingUp className="w-5 h-5 text-emerald-400" />}
          className="border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/40 transition"
        />
        <KPICard
          title="Status Kritis (Red Alert)"
          value={`${kpiSummary.redAlertCount} Titik Bulan`}
          trend={kpiSummary.redAlertCount === 0 ? "Persediaan 100% Aman!" : "Membutuhkan percepatan PO/TO"}
          isAlert={kpiSummary.redAlertCount > 0}
          icon={<AlertTriangle className="w-5 h-5 text-rose-400" />}
          className="border-rose-500/20 bg-rose-500/5 hover:border-rose-500/40 transition"
        />
        <KPICard
          title="Rata-Rata Ending Stock M+3"
          value={`${kpiSummary.avgEndingStockM3.toLocaleString('id-ID')} Qty`}
          trend="Stok Akhir di Bulan Ke-4"
          icon={<CheckCircle2 className="w-5 h-5 text-purple-400" />}
          className="border-purple-500/20 bg-purple-500/5 hover:border-purple-500/40 transition"
        />
      </div>

      {/* ─── FILTER CONTROLS & SKU SELECTOR FOR CHART ─── */}
      <GlassCard className="p-5 border-slate-800 bg-slate-900/60 backdrop-blur-xl">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-2 block uppercase tracking-wider">Filter Cabang:</label>
            <MultiSelect
              options={cabangs}
              selected={selectedCabang}
              onChange={setSelectedCabang}
              selectAllLabel="Semua Cabang"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-2 block uppercase tracking-wider">Filter Kategori:</label>
            <MultiSelect
              options={categories}
              selected={selectedCategory}
              onChange={setSelectedCategory}
              selectAllLabel="Semua Kategori"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-2 block uppercase tracking-wider">Sorot Grafik Kategori & Cabang:</label>
            <select
              value={currentChartItem?.raw.id || ''}
              onChange={(e) => setSelectedItemForChart(e.target.value)}
              className="w-full h-11 rounded-xl border border-slate-700 bg-slate-950/80 px-3 text-sm text-slate-200 focus:border-indigo-500 outline-none transition font-medium"
            >
              {filteredData.map(item => (
                <option key={item.raw.id} value={item.raw.id}>
                  {item.raw.cabang} - {item.raw.category} (LT: {item.raw.leadTimeWeeks} W, MOQ: {item.raw.moq})
                </option>
              ))}
            </select>
          </div>
        </div>
      </GlassCard>

      {/* ─── VISUALIZATION CHART: ROLLING 4-MONTH PROJECTION ─── */}
      {currentChartItem && (
        <GlassCard className="p-6 border-indigo-500/30 bg-gradient-to-b from-slate-900/90 to-slate-950/90 shadow-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 mb-6 gap-3">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-400" />
                Proyeksi Zona DDMRP vs Net Flow Position (4-Months Horizon)
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Sorotan: <b className="text-cyan-400">{currentChartItem.raw.cabang}</b> • Kategori: <b className="text-white">{currentChartItem.raw.category}</b> • Skenario Aktif: <b className="text-amber-300">{activeScenario.toUpperCase()}</b>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                ● Top of Green
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold">
                ● Top of Yellow
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 font-semibold">
                ● Top of Red
              </span>
            </div>
          </div>

          <div className="h-[340px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartSeries} margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.6} />
                <XAxis dataKey="month" stroke="#94a3b8" tick={{ fill: '#e2e8f0', fontSize: 12, fontWeight: 600 }} />
                <YAxis stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#3b82f6', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}
                  labelStyle={{ color: '#38bdf8', fontWeight: 'bold', borderBottom: '1px solid #334155', paddingBottom: '4px' }}
                />
                <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '12px' }} />
                <Bar dataKey="Recommended Order" name="Saran Order (MOQ)" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={45} />
                <Line type="monotone" dataKey="Net Flow Position (NFP)" name="Net Flow Position (NFP)" stroke="#67e8f9" strokeWidth={3} dot={{ r: 6, fill: '#06b6d4', stroke: '#fff', strokeWidth: 2 }} />
                <Line type="monotone" dataKey="Top of Green (Max Buffer)" name="Top of Green" stroke="#10b981" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                <Line type="monotone" dataKey="Top of Yellow (Reorder Point)" name="Top of Yellow (ROP)" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                <Line type="monotone" dataKey="Top of Red (Safety Limit)" name="Top of Red (Safety)" stroke="#f43f5e" strokeWidth={2} strokeDasharray="2 2" dot={false} />
                <Line type="monotone" dataKey="Ending Stock Proyeksi" name="Ending Stock Proyeksi" stroke="#c084fc" strokeWidth={2.5} dot={{ r: 5, fill: '#a855f7' }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      )}

      {/* ─── TABEL COMPLEMENTARY: ROLLING 4-MONTH ANALYSIS TABLE ─── */}
      <GlassCard className="p-6 border-slate-800 bg-slate-900/80 shadow-2xl overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-800 pb-4 mb-6 gap-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2.5">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
              Tabel Analisis Komparatif Rolling 4 Bulan ({filteredData.length} Kategori)
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Menemukan status persediaan Anda dari <b>Bulan Berjalan (M+0)</b> hingga <b>3 Bulan Kedepan (M+1, M+2, M+3)</b>.
            </p>
          </div>

          <button
            onClick={handleExportExcel}
            className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-emerald-600/20 shrink-0"
          >
            <Download className="w-4 h-4" /> Ekspor Hasil ke Excel / CSV
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-[600px] overflow-y-auto">
          <table className="w-full text-left text-xs sm:text-sm border-collapse min-w-[1100px]">
            <thead className="bg-slate-950/90 text-slate-300 uppercase font-bold sticky top-0 z-20 shadow-md">
              <tr className="border-b border-slate-800 text-[11px] tracking-wider text-center">
                <th className="py-3 px-4 text-left">Cabang & Kategori</th>
                <th className="py-3 px-3 border-l border-slate-800 text-indigo-400">Parameter Fix</th>
                <th className="py-3 px-4 border-l border-slate-800 bg-indigo-950/30 text-cyan-300">Bulan Ini (M+0)</th>
                <th className="py-3 px-4 border-l border-slate-800 bg-indigo-950/20 text-indigo-300">Bulan Ke-2 (M+1)</th>
                <th className="py-3 px-4 border-l border-slate-800 bg-indigo-950/10 text-purple-300">Bulan Ke-3 (M+2)</th>
                <th className="py-3 px-4 border-l border-slate-800 bg-indigo-950/5 text-emerald-300">Bulan Ke-4 (M+3)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-300">
              {filteredData.map((item) => (
                <tr
                  key={item.raw.id}
                  className="hover:bg-slate-800/40 transition cursor-pointer"
                  onClick={() => setSelectedItemForChart(item.raw.id)}
                >
                  {/* Cabang & Category */}
                  <td className="py-3.5 px-4 align-top">
                    <div className="font-bold text-white text-sm">{item.raw.category}</div>
                    <div className="text-xs text-indigo-400 font-semibold mt-0.5">📍 {item.raw.cabang}</div>
                    <div className="text-[11px] text-slate-400 mt-1">Cut-off: {item.raw.cutOffDate}</div>
                  </td>

                  {/* Parameter Fix */}
                  <td className="py-3.5 px-3 border-l border-slate-800 text-center align-top font-mono text-xs space-y-1">
                    <div>LT: <b className="text-amber-400">{item.raw.leadTimeWeeks}W</b></div>
                    <div>MOQ: <b className="text-cyan-400">{item.raw.moq}</b></div>
                    <div>Cycle: <b className="text-slate-300">{item.raw.orderCycleWeeks}W</b></div>
                  </td>

                  {/* 4 Rolling Months Display */}
                  {item.months.map((m, idxM) => (
                    <td key={idxM} className="py-3 px-3.5 border-l border-slate-800 align-top text-xs space-y-1.5">
                      <div className="flex items-center justify-between font-medium">
                        <span className="text-slate-400">Saldo Awal:</span>
                        <span className="font-semibold text-slate-200">{m.startingStock.toLocaleString('id-ID')}</span>
                      </div>
                      <div className="flex items-center justify-between font-medium">
                        <span className="text-emerald-400" title="Vessel + Plan Loading + Finish Prod + TO">+ Inbound (On Order):</span>
                        <span className="font-semibold text-emerald-400">+{m.inboundTotal.toLocaleString('id-ID')}</span>
                      </div>
                      <div className="flex items-center justify-between font-medium">
                        <span className="text-rose-400">- Qualified Demand:</span>
                        <span className="font-semibold text-rose-400">-{m.qualifiedDemand.toLocaleString('id-ID')}</span>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-slate-800 font-bold">
                        <span className="text-cyan-300">NFP / Ending:</span>
                        <span className="text-white bg-slate-800/80 px-1.5 py-0.5 rounded">{m.nfp.toLocaleString('id-ID')} / {m.endingStock.toLocaleString('id-ID')}</span>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          m.zoneStatus === 'RED' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' :
                          m.zoneStatus === 'YELLOW' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' :
                          m.zoneStatus === 'CYAN' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40' :
                          'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        }`}>
                          {m.zoneStatus === 'RED' ? '🔴 RED ZONE' : m.zoneStatus === 'YELLOW' ? '🟡 RE-ORDER' : m.zoneStatus === 'CYAN' ? '🔵 OVERSTOCK' : '🟢 GREEN SAFE'}
                        </span>
                        {m.orderSuggestion > 0 ? (
                          <span className="text-[11px] font-extrabold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 animate-pulse">
                            📦 Order: +{m.orderSuggestion.toLocaleString('id-ID')}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500 italic">No Order</span>
                        )}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
