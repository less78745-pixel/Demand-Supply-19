/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { FileUploader } from '@/components/ui/FileUploader';
import { KPICard } from '@/components/ui/KPICard';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { TimestampBadge } from '@/components/ui/TimestampBadge';
import {
  TrendingUp, BarChart3, Download, Sparkles,
  AlertCircle, Award, Layers, HelpCircle, FileSpreadsheet, AlertTriangle,
  Filter, Search, X, RefreshCw, CheckCircle2, Info, ArrowUpRight, ArrowDownRight, ShieldAlert, Zap
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ComposedChart, Line, ReferenceArea, ReferenceLine, Cell, LabelList
} from 'recharts';
import { get, set } from 'idb-keyval';
import { parseDynamicCSV, findColumn, ParsedData } from '@/lib/csvParser';
import { getStandardFilename } from '@/utils/export';
import { formatNumberCompact } from '@/lib/utils';
import * as XLSX from 'xlsx';

const COLORS = ['#3b82f6', '#f97316', '#22c55e', '#ef4444', '#a855f7', '#eab308', '#06b6d4', '#ec4899'];

function generateDemoHistorySales(): ParsedData {
  const cabangs = [
    { cab: 'Surabaya', reg: 'Jatim' },
    { cab: 'Jakarta', reg: 'DKI' },
    { cab: 'Bandung', reg: 'Jabar' },
    { cab: 'Medan', reg: 'Sumut' },
    { cab: 'Semarang', reg: 'Jateng' },
    { cab: 'Makassar', reg: 'Sulsel' },
    { cab: 'Palembang', reg: 'Sumsel' },
    { cab: 'Denpasar', reg: 'Bali' }
  ];
  const categories = ['Minyak Goreng Premium', 'Beras Setra Ramos', 'Gula Pasir Kristal', 'Tepung Terigu Serbaguna', 'Kopi Bubuk Murni', 'Susu Kental Manis'];
  const insentifTiers = ['Tier 1 (High Performance)', 'Tier 2 (Core Growth)', 'Tier 3 (Standard)', 'Non-Insentif'];
  const data: any[] = [];

  cabangs.forEach((item, idx) => {
    categories.forEach((cat, cIdx) => {
      const m3 = Math.round(1800 + Math.random() * 5000);
      const m2 = Math.round(2000 + Math.random() * 5200);
      const m1 = Math.round(2100 + Math.random() * 5300);
      const m0 = Math.round(2200 + Math.random() * 5500);
      const avg = Math.round((m2 + m1 + m0) / 3);
      const soh = Math.round(1500 + Math.random() * 4000);
      const hold = Math.round(100 + Math.random() * 500);
      const vessel = Math.round(200 + Math.random() * 800);
      const to = Math.round(150 + Math.random() * 600);
      const tier = insentifTiers[(idx + cIdx) % insentifTiers.length];

      data.push({
        Cabang: item.cab,
        Region: item.reg,
        Item: `ITM-00${cIdx + 1}`,
        'NAMA BARANG': `${cat} 1kg`,
        CATEGORY: 'Food & Beverage',
        GRUP: cat,
        'CATEGORY ITEM': cat,
        'Sub item': 'Regular',
        'STATUS DOI': 'ACTIVE',
        SOH: soh,
        'M-12': Math.round(1500 + Math.random() * 3000),
        'M-11': Math.round(1600 + Math.random() * 3200),
        'M-10': Math.round(1700 + Math.random() * 3500),
        'M-9': Math.round(1800 + Math.random() * 3800),
        'M-8': Math.round(2500 + Math.random() * 6000),
        'M-7': Math.round(1900 + Math.random() * 4000),
        'M-6': Math.round(1800 + Math.random() * 3900),
        'M-5': Math.round(2000 + Math.random() * 4200),
        'M-4': Math.round(2100 + Math.random() * 4500),
        'M-3': m3,
        'M-2': m2,
        'M-1': m1,
        'M': m0,
        'AVG Sales 3 Bln': avg,
        'On Vessel': vessel,
        'Hold Delivery': hold,
        SPJM: Math.round(50 + Math.random() * 200),
        Load: Math.round(100 + Math.random() * 400),
        'Plan Loading': Math.round(300 + Math.random() * 700),
        Ready: Math.round(200 + Math.random() * 500),
        TO: to,
        'Category Insentif': tier
      });
    });
  });

  const headers = [
    'Cabang', 'Region', 'Item', 'NAMA BARANG', 'CATEGORY', 'GRUP', 'CATEGORY ITEM', 'Sub item', 'STATUS DOI', 'SOH',
    'M-12', 'M-11', 'M-10', 'M-9', 'M-8', 'M-7', 'M-6', 'M-5', 'M-4', 'M-3', 'M-2', 'M-1', 'M',
    'AVG Sales 3 Bln', 'On Vessel', 'Hold Delivery', 'SPJM', 'Load', 'Plan Loading', 'Ready', 'TO', 'Category Insentif'
  ];

  const targetColumns = [
    { index: 9, name: 'SOH' },
    { index: 17, name: 'M-5' },
    { index: 18, name: 'M-4' },
    { index: 19, name: 'M-3' },
    { index: 20, name: 'M-2' },
    { index: 21, name: 'M-1' },
    { index: 22, name: 'M' },
    { index: 23, name: 'AVG Sales 3 Bln' },
    { index: 24, name: 'On Vessel' },
    { index: 25, name: 'Hold Delivery' },
    { index: 30, name: 'TO' }
  ];

  const targetData: any[] = [];
  cabangs.forEach(item => {
    targetData.push({
      Cabang: item.cab,
      'week start': 31,
      'M': Math.round(50000 + Math.random() * 20000),
      'M+1': Math.round(52000 + Math.random() * 20000),
      'M+2': Math.round(55000 + Math.random() * 20000)
    });
  });

  return {
    headers,
    targetColumns,
    data,
    sheetNames: ['History Sales', 'Target Value'],
    sheets: {
      'History Sales': { headers, targetColumns, data },
      'Target Value': { headers: ['Cabang', 'week start', 'M', 'M+1', 'M+2'], targetColumns: [], data: targetData }
    },
    processed_at: new Date().toISOString()
  };
}

// ===== PRECISION & ACCURACY COMPUTATION ENGINE =====
export const parseHighPrecision = (val: any): number => {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (val === null || val === undefined || val === '') return 0;
  const str = String(val).trim();
  if (!str) return 0;
  let cleaned = str;
  if (str.includes(',') && str.includes('.')) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      cleaned = str.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    cleaned = str.replace(/,/g, '.');
  }
  const parsed = parseFloat(cleaned.replace(/[^0-9.-]+/g, ''));
  return isNaN(parsed) ? 0 : parsed;
};

export const toExactFloat = (num: number, decimals: number = 2): number => {
  if (isNaN(num) || !isFinite(num)) return 0;
  return Number(Math.round(Number(num + 'e' + decimals)) + 'e-' + decimals);
};

export default function HistorySalesPage() {
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [chartFilter, setChartFilter] = useState<'all' | 'sales' | 'outstanding' | 'avg3'>('all');
  const [showHowTo, setShowHowTo] = useState<boolean>(false);
  const [selectedCabangForChart, setSelectedCabangForChart] = useState<string>('All');

  // Filter states
  const [selectedCabang, setSelectedCabang] = useState<string[]>(['All']);
  const [selectedRegion, setSelectedRegion] = useState<string[]>(['All']);
  const [selectedCategory, setSelectedCategory] = useState<string[]>(['All']);
  const [selectedCategoryInsentif, setSelectedCategoryInsentif] = useState<string[]>(['All']);

  // Excel AutoFilter state for Raw Data table
  const [activeRawColModal, setActiveRawColModal] = useState<string | null>(null);
  const [rawModalSearchInput, setRawModalSearchInput] = useState<string>('');
  const [rawColFilters, setRawColFilters] = useState<Record<string, { search?: string; selected?: string[] }>>({});

  useEffect(() => {
    get('last_history_sales').then(saved => {
      if (saved && saved.data && saved.data.length > 0) {
        setParsed(saved);
      } else {
        setParsed(generateDemoHistorySales());
      }
    }).catch(err => {
      console.warn('Failed to load History Sales state from IndexDB', err);
      setParsed(generateDemoHistorySales());
    });
  }, []);

  const handleGenerateDemo = () => {
    const demo = generateDemoHistorySales();
    setParsed(demo);
    toast.success('🎉 Data Demo History Sales Berhasil Dimuat!');
  };

  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new();

    const ws1_data = [
      ['Cabang','Region','Item','NAMA BARANG','CATEGORY','GRUP','CATEGORY ITEM','Sub item','STATUS DOI','SOH','M-12','M-11','M-10','M-9','M-8','M-7','M-6','M-5','M-4','M-3','M-2','M-1','M','AVG Sales 3 Bln','On Vessel','Hold Delivery','SPJM','Load','Plan Loading','Ready','TO','Category Insentif'],
      ['Surabaya','Jatim','ITM-001','Minyak Goreng Premium 1kg','Food & Beverage','Minyak Goreng Premium','Minyak Goreng Premium','Regular','ACTIVE',3500,2100,2200,2300,2400,3100,2500,2400,2600,2700,3000,4500,4800,5100,4800,600,200,100,300,500,400,350,'Tier 1'],
      ['Jakarta','DKI','ITM-002','Beras Setra Ramos 5kg','Food & Beverage','Beras Setra Ramos','Beras Setra Ramos','Regular','ACTIVE',2800,1800,1900,2000,2100,2800,2200,2100,2300,2400,2600,3200,3400,3600,3400,450,150,80,250,400,300,280,'Tier 1']
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(ws1_data);
    XLSX.utils.book_append_sheet(wb, ws1, "History Sales");

    const ws2_data = [
      ['Cabang', 'week start', 'M', 'M+1', 'M+2'],
      ['Surabaya', 31, 50000, 52000, 55000],
      ['Jakarta', 31, 48000, 49000, 52000]
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(ws2_data);
    XLSX.utils.book_append_sheet(wb, ws2, "Target Value");

    XLSX.writeFile(wb, 'template_history_sales.xlsx');
    toast.success('📁 Template Excel History Sales Berhasil Diunduh');
  };

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    toast.loading('Membaca data History Sales (Excel/CSV)...', { id: 'sales' });
    try {
      const parsedData = await parseDynamicCSV(file);
      setParsed(parsedData);
      try {
        await set('last_history_sales', parsedData);
      } catch (e) {
        console.warn('Data terlalu besar untuk disimpan di IndexDB', e);
      }
      toast.success('✅ Data History Sales Berhasil Diproses!', { id: 'sales' });
    } catch (err: any) {
      toast.error(err.message || 'Gagal memproses file', { id: 'sales' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Identify column names dynamically
  const colCabang = useMemo(() => parsed ? findColumn(parsed.headers, ['cabang', 'branch_name', 'branch', 'cab']) : undefined, [parsed]);
  const colRegion = useMemo(() => parsed ? findColumn(parsed.headers, ['region', 'regional', 'wilayah']) : undefined, [parsed]);
  const colGrup = useMemo(() => parsed ? findColumn(parsed.headers, ['grup', 'group', 'grup barang', 'group item', 'divisi', 'division']) : undefined, [parsed]);
  const colCategory = useMemo(() => parsed ? findColumn(parsed.headers, ['category item', 'kategori item', 'category', 'kategori', 'grup']) : undefined, [parsed]);
  const colCategoryInsentif = useMemo(() => parsed ? findColumn(parsed.headers, ['category insentif', 'category_insentif', 'kategori insentif', 'insentif', 'cat insentif']) : undefined, [parsed]);

  // Linked Filter options
  const regions = useMemo(() => {
    if (!parsed || !colRegion) return [];
    const source = parsed.data.filter(d =>
      (!colCabang || selectedCabang.includes('All') || selectedCabang.includes(d[colCabang])) &&
      (!colCategory || selectedCategory.includes('All') || selectedCategory.includes(d[colCategory])) &&
      (!colCategoryInsentif || selectedCategoryInsentif.includes('All') || selectedCategoryInsentif.includes(d[colCategoryInsentif]))
    );
    return ['All', ...Array.from(new Set(source.map(d => d[colRegion]).filter(v => v && !String(v).includes('#N/A') && !String(v).includes('#REF!') && String(v).toLowerCase() !== 'semua region'))).sort()];
  }, [parsed, colRegion, selectedCabang, selectedCategory, selectedCategoryInsentif, colCabang, colCategory, colCategoryInsentif]);

  const cabangs = useMemo(() => {
    if (!parsed || !colCabang) return [];
    const source = parsed.data.filter(d =>
      (!colRegion || selectedRegion.includes('All') || selectedRegion.includes(d[colRegion])) &&
      (!colCategory || selectedCategory.includes('All') || selectedCategory.includes(d[colCategory])) &&
      (!colCategoryInsentif || selectedCategoryInsentif.includes('All') || selectedCategoryInsentif.includes(d[colCategoryInsentif]))
    );
    return ['All', ...Array.from(new Set(source.map(d => d[colCabang]).filter(v => v && !String(v).includes('#N/A') && !String(v).includes('#REF!') && String(v).toLowerCase() !== 'semua cabang'))).sort()];
  }, [parsed, colCabang, selectedRegion, selectedCategory, selectedCategoryInsentif, colRegion, colCategory, colCategoryInsentif]);

  const categories = useMemo(() => {
    if (!parsed || !colCategory) return [];
    const source = parsed.data.filter(d =>
      (!colRegion || selectedRegion.includes('All') || selectedRegion.includes(d[colRegion])) &&
      (!colCabang || selectedCabang.includes('All') || selectedCabang.includes(d[colCabang])) &&
      (!colCategoryInsentif || selectedCategoryInsentif.includes('All') || selectedCategoryInsentif.includes(d[colCategoryInsentif]))
    );
    return ['All', ...Array.from(new Set(source.map(d => d[colCategory]).filter(v => v && !String(v).includes('#N/A') && !String(v).includes('#REF!') && String(v).toLowerCase() !== 'semua kategori'))).sort()];
  }, [parsed, colCategory, selectedRegion, selectedCabang, selectedCategoryInsentif, colRegion, colCabang, colCategoryInsentif]);

  const categoryInsentifs = useMemo(() => {
    if (!parsed || !colCategoryInsentif) return [];
    const source = parsed.data.filter(d =>
      (!colRegion || selectedRegion.includes('All') || selectedRegion.includes(d[colRegion])) &&
      (!colCabang || selectedCabang.includes('All') || selectedCabang.includes(d[colCabang])) &&
      (!colCategory || selectedCategory.includes('All') || selectedCategory.includes(d[colCategory]))
    );
    return ['All', ...Array.from(new Set(source.map(d => d[colCategoryInsentif]).filter(v => v && !String(v).includes('#N/A') && !String(v).includes('#REF!') && String(v).toLowerCase() !== 'semua insentif'))).sort()];
  }, [parsed, colCategoryInsentif, selectedRegion, selectedCabang, selectedCategory, colRegion, colCabang, colCategory]);

  // Filtered Data (Pure historical actuals, without simulation alteration)
  const filtered = useMemo(() => {
    if (!parsed) return [];
    return parsed.data.filter(d =>
      (!colRegion || selectedRegion.includes('All') || selectedRegion.includes(d[colRegion])) &&
      (!colCabang || selectedCabang.includes('All') || selectedCabang.includes(d[colCabang])) &&
      (!colCategory || selectedCategory.includes('All') || selectedCategory.includes(d[colCategory])) &&
      (!colCategoryInsentif || selectedCategoryInsentif.includes('All') || selectedCategoryInsentif.includes(d[colCategoryInsentif]))
    );
  }, [parsed, selectedRegion, selectedCabang, selectedCategory, selectedCategoryInsentif, colRegion, colCabang, colCategory, colCategoryInsentif]);

  // Executive Summary Insights Computation
  const executiveSummary = useMemo(() => {
    if (!parsed || filtered.length === 0) return null;

    let totalSales = 0;
    let totalOutstanding = 0;
    const salesCols: string[] = [];
    const outstandingCols: string[] = [];

    parsed.targetColumns.forEach(tc => {
      const lower = tc.name.toLowerCase().trim();
      if (lower.includes('sales') || lower.includes('jual') || lower.includes('avg') || /^m(?:-\d+)?$/.test(lower) || lower.startsWith('m-') || lower === 'm') {
        salesCols.push(tc.name);
      } else {
        outstandingCols.push(tc.name);
      }
    });

    const cabangVol: Record<string, { sales: number; outstanding: number; total: number }> = {};

    for (const row of filtered) {
      const cbg = colCabang ? (String(row[colCabang] || 'Unknown')) : 'All';
      if (!cabangVol[cbg]) cabangVol[cbg] = { sales: 0, outstanding: 0, total: 0 };

      salesCols.forEach(col => {
        const val = Number(row[col]) || 0;
        totalSales += val;
        cabangVol[cbg].sales += val;
        cabangVol[cbg].total += val;
      });

      outstandingCols.forEach(col => {
        const val = Number(row[col]) || 0;
        totalOutstanding += val;
        cabangVol[cbg].outstanding += val;
        cabangVol[cbg].total += val;
      });
    }

    const sortedCabang = Object.entries(cabangVol).sort((a, b) => b[1].total - a[1].total);
    const topCabang = sortedCabang.length > 0 ? { name: sortedCabang[0][0], ...sortedCabang[0][1] } : null;
    const ratioNum = totalSales > 0 ? ((totalOutstanding / totalSales) * 100) : 0;
    const ratio = totalSales > 0 ? ratioNum.toFixed(1) + "%" : "N/A";

    return {
      totalSales,
      totalOutstanding,
      topCabang,
      ratio,
      ratioNum,
      salesCols,
      outstandingCols,
      cabangVol,
      totalRows: filtered.length
    };
  }, [parsed, filtered, colCabang]);

  // Chart data: Grouped by Cabang
  const chartData = useMemo(() => {
    if (!parsed || filtered.length === 0) return [];
    const map: Record<string, any> = {};
    for (const row of filtered) {
      const cbg = colCabang ? (row[colCabang] || 'Unknown') : 'All';
      if (selectedCabangForChart !== 'All' && cbg !== selectedCabangForChart) continue;

      if (!map[cbg]) {
        map[cbg] = { cabang: cbg };
        parsed.targetColumns.forEach(tc => map[cbg][tc.name] = 0);
      }
      parsed.targetColumns.forEach(tc => {
        map[cbg][tc.name] += (row[tc.name] || 0);
      });
    }
    return Object.values(map);
  }, [parsed, filtered, colCabang, selectedCabangForChart]);

  const displayedChartColumns = useMemo(() => {
    if (!parsed) return [];
    if (!executiveSummary || chartFilter === 'all') return parsed.targetColumns;
    if (chartFilter === 'avg3') {
      return parsed.targetColumns.filter(tc => tc.name.toLowerCase().includes('avg'));
    }
    const targetSet = new Set(chartFilter === 'sales' ? executiveSummary.salesCols : executiveSummary.outstandingCols);
    return parsed.targetColumns.filter(tc => targetSet.has(tc.name));
  }, [parsed, executiveSummary, chartFilter]);

  // Table Data grouped per Cabang + Category for detailed comparison & growth analysis
  const tableData = useMemo(() => {
    if (!parsed || !executiveSummary || filtered.length === 0) return [];
    const map: Record<string, { cabang: string; grup: string; category: string; sales: number; outstanding: number; total: number; avg3: number; m: number; m1: number }> = {};
    
    const salesSet = new Set(executiveSummary.salesCols);
    const outSet = new Set(executiveSummary.outstandingCols);
    const colAvg = findColumn(parsed.headers, ['avg sales 3 bln', 'avg sales', 'avg']);
    const colM = parsed.headers.find(h => h.trim().toUpperCase() === 'M') || findColumn(parsed.headers, ['m', 'bulan m', 'sales m']);
    const colM1 = parsed.headers.find(h => h.trim().toUpperCase() === 'M-1' || h.trim().toUpperCase() === 'M - 1') || findColumn(parsed.headers, ['m-1', 'bulan m-1']);

    for (const row of filtered) {
      const cbg = colCabang ? String(row[colCabang] || 'Unknown') : 'All';
      const grp = colGrup ? String(row[colGrup] || '-') : '-';
      const cat = colCategory ? String(row[colCategory] || 'Uncategorized') : 'General';
      const key = `${cbg}___${grp}___${cat}`;

      if (!map[key]) {
        map[key] = { cabang: cbg, grup: grp, category: cat, sales: 0, outstanding: 0, total: 0, avg3: 0, m: 0, m1: 0 };
      }

      parsed.targetColumns.forEach(tc => {
        const val = Number(String(row[tc.name] || 0).replace(/[^0-9.-]+/g, '')) || 0;
        if (salesSet.has(tc.name)) {
          map[key].sales += val;
          map[key].total += val;
        } else if (outSet.has(tc.name)) {
          map[key].outstanding += val;
          map[key].total += val;
        }
      });

      if (colAvg) {
        map[key].avg3 += Number(String(row[colAvg] || 0).replace(/[^0-9.-]+/g, '')) || 0;
      }
      if (colM) {
        map[key].m += Number(String(row[colM] || 0).replace(/[^0-9.-]+/g, '')) || 0;
      }
      if (colM1) {
        map[key].m1 += Number(String(row[colM1] || 0).replace(/[^0-9.-]+/g, '')) || 0;
      }
    }

    const cabangTotalAvg3: Record<string, number> = {};
    Object.values(map).forEach(item => {
      cabangTotalAvg3[item.cabang] = (cabangTotalAvg3[item.cabang] || 0) + item.avg3;
    });

    return Object.values(map).map(item => {
      const ratio = item.sales > 0 ? toExactFloat((item.outstanding / item.sales) * 100, 2) : 0;
      const growthM = item.avg3 > 0 ? toExactFloat(((item.m - item.avg3) / item.avg3) * 100, 2) : 0;
      const growthM1 = item.avg3 > 0 ? toExactFloat(((item.m1 - item.avg3) / item.avg3) * 100, 2) : 0;
      const totalCbgAvg3 = cabangTotalAvg3[item.cabang] || 0;
      const kontribusi = totalCbgAvg3 > 0 ? toExactFloat((item.avg3 / totalCbgAvg3) * 100, 2) : 0;
      return { ...item, ratio, growthM, growthM1, kontribusi };
    }).sort((a, b) => {
      if (a.cabang !== b.cabang) return a.cabang.localeCompare(b.cabang);
      if (a.grup !== b.grup) return a.grup.localeCompare(b.grup);
      return b.sales - a.sales;
    });
  }, [parsed, executiveSummary, filtered, colCabang, colGrup, colCategory]);

  // Supply vs Monthly Sales (M to M-5) computation
  const supplyVsMonthlySales = useMemo(() => {
    if (!parsed || filtered.length === 0) return null;
    let totalSOH = 0;
    let totalTO = 0;
    let totalVessel = 0;

    const periodNames = ['M', 'M-1', 'M-2', 'M-3', 'M-4', 'M-5'];
    const periodTotals: Record<string, number> = {
      'M': 0,
      'M-1': 0,
      'M-2': 0,
      'M-3': 0,
      'M-4': 0,
      'M-5': 0
    };

    const colSOH = findColumn(parsed.headers, ['soh', 'on hand', 'stock on hand']);
    const colTO = findColumn(parsed.headers, ['to', 'transfer order']);
    const colVessel = findColumn(parsed.headers, ['on vessel', 'vessel', 'in transit']);

    const periodCols: Record<string, string | undefined> = {};
    periodNames.forEach(p => {
      const found = parsed.headers.find(h => h.trim().toUpperCase() === p.toUpperCase());
      if (found) periodCols[p] = found;
    });

    for (const row of filtered) {
      if (colSOH) totalSOH += Number(String(row[colSOH] || 0).replace(/[^0-9.-]+/g, '')) || 0;
      if (colTO) totalTO += Number(String(row[colTO] || 0).replace(/[^0-9.-]+/g, '')) || 0;
      if (colVessel) totalVessel += Number(String(row[colVessel] || 0).replace(/[^0-9.-]+/g, '')) || 0;

      periodNames.forEach(p => {
        const colName = periodCols[p];
        if (colName) {
          periodTotals[p] += Number(String(row[colName] || 0).replace(/[^0-9.-]+/g, '')) || 0;
        }
      });
    }

    const totalSupply = totalSOH + totalTO + totalVessel;
    const barColors = ['#facc15', '#fbcfe8', '#86efac', '#475569', '#fcd34d', '#8b5cf6'];

    const chartData = periodNames.map((p, index) => ({
      period: p,
      sales: periodTotals[p],
      fill: barColors[index % barColors.length]
    }));

    const maxSales = Math.max(...Object.values(periodTotals), 0);
    const maxY = Math.max(totalSupply, maxSales) * 1.15;

    return {
      totalSOH,
      totalTO,
      totalVessel,
      totalSupply,
      chartData,
      maxY
    };
  }, [parsed, filtered]);

  // Insentif Analysis Grouping by Cabang & Category Insentif + M to M-5
  const insentifAnalysis = useMemo(() => {
    if (!parsed || !colCategoryInsentif || filtered.length === 0) return [];
    const map: Record<string, { key: string; name: string; cabang: string; categoryInsentif: string; totalSales: number; totalOutstanding: number; itemCount: number; periods: Record<string, number> }> = {};
    
    const salesSet = new Set(executiveSummary?.salesCols || []);
    const outSet = new Set(executiveSummary?.outstandingCols || []);
    const periodNames = ['M', 'M-1', 'M-2', 'M-3', 'M-4', 'M-5'];
    const periodCols: Record<string, string | undefined> = {};
    periodNames.forEach(p => {
      const found = parsed.headers.find(h => h.trim().toUpperCase() === p.toUpperCase());
      if (found) periodCols[p] = found;
    });

    for (const row of filtered) {
      const cbg = String(colCabang ? (row[colCabang] || 'All Cabang') : 'All Cabang').trim();
      const grup = String(colGrup ? (row[colGrup] || '-') : '-').trim();
      const category = String(colCategory ? (row[colCategory] || 'Umum') : 'Umum').trim();
      const cat = String(row[colCategoryInsentif] || 'Non-Insentif / Umum').trim();
      const key = `${cbg}_${grup}_${category}`;
      const name = `${cbg} - ${grup} - ${category}`;

      if (!map[key]) {
        map[key] = { key, name, cabang: cbg, category, categoryInsentif: cat, totalSales: 0, totalOutstanding: 0, itemCount: 0, periods: { 'M': 0, 'M-1': 0, 'M-2': 0, 'M-3': 0, 'M-4': 0, 'M-5': 0 } };
      }
      map[key].itemCount += 1;

      let rowSales = 0;
      let rowOut = 0;
      parsed.targetColumns.forEach(tc => {
        const val = Number(String(row[tc.name] || 0).replace(/[^0-9.-]+/g, '')) || 0;
        if (salesSet.has(tc.name)) {
          rowSales += val;
        } else if (outSet.has(tc.name)) {
          rowOut += val;
        }
      });

      periodNames.forEach(p => {
        const colName = periodCols[p];
        if (colName && row[colName] !== undefined) {
          map[key].periods[p] += Number(String(row[colName] || 0).replace(/[^0-9.-]+/g, '')) || 0;
        }
      });

      map[key].totalSales += rowSales;
      map[key].totalOutstanding += rowOut;
    }

    return Object.values(map).map(item => {
      const ratio = item.totalSales > 0 ? (item.totalOutstanding / item.totalSales) * 100 : 0;
      return { ...item, labelKey: `${item.cabang} (${item.categoryInsentif})`, ratio };
    }).sort((a, b) => b.totalSales - a.totalSales);
  }, [parsed, filtered, colCabang, colCategoryInsentif, executiveSummary]);

  const insentifChartData = useMemo(() => {
    if (!parsed || !colCategoryInsentif || filtered.length === 0) return { data: [], categories: [] };
    const periods = ['M', 'M-1', 'M-2', 'M-3', 'M-4', 'M-5'];
    const catSet = new Set<string>();
    const periodMap: Record<string, Record<string, number>> = {};
    periods.forEach(p => { periodMap[p] = {}; });

    const periodCols: Record<string, string | undefined> = {};
    periods.forEach(p => {
      const found = parsed.headers.find(h => h.trim().toUpperCase() === p.toUpperCase());
      if (found) periodCols[p] = found;
    });

    for (const row of filtered) {
      const cat = String(row[colCategoryInsentif] || 'Non-Insentif / Umum').trim();
      catSet.add(cat);
      periods.forEach(p => {
        const colName = periodCols[p];
        if (colName && row[colName] !== undefined) {
          const val = Number(String(row[colName] || 0).replace(/[^0-9.-]+/g, '')) || 0;
          periodMap[p][cat] = (periodMap[p][cat] || 0) + val;
        }
      });
    }

    const categories = Array.from(catSet);
    const data = periods.map(p => {
      const entry: any = { period: p };
      let totalQty = 0;
      categories.forEach(cat => {
        totalQty += (periodMap[p][cat] || 0);
      });
      categories.forEach(cat => {
        const rawQty = Math.round(periodMap[p][cat] || 0);
        const pct = totalQty > 0 ? Number(((rawQty / totalQty) * 100).toFixed(2)) : 0;
        entry[cat] = pct;
        entry[`${cat}_qty`] = rawQty;
      });
      entry._totalQty = Math.round(totalQty);
      return entry;
    });

    return { data, categories };
  }, [parsed, filtered, colCategoryInsentif]);

  // 1. ABC-XYZ Analysis calculation (M s/d M-5)
  const abcXyzAnalysis = useMemo(() => {
    if (!parsed || filtered.length === 0) return null;
    const periodNames = ['M', 'M-1', 'M-2', 'M-3', 'M-4', 'M-5'];
    const periodCols: Record<string, string | undefined> = {};
    periodNames.forEach(p => {
      const found = parsed.headers.find(h => h.trim().toUpperCase() === p.toUpperCase());
      if (found) periodCols[p] = found;
    });

    const itemMap: Record<string, any> = {};
    for (const row of filtered) {
      const cab = colCabang ? (row[colCabang] || 'All') : 'All';
      const grup = colGrup ? (row[colGrup] || '-') : '-';
      const cat = colCategory ? (row[colCategory] || 'Umum') : 'Umum';
      const itemDesc = `${grup} - ${cat}`;
      const key = `${cab}___${grup}___${cat}`;

      if (!itemMap[key]) {
        itemMap[key] = { key, cabang: cab, category: cat, name: itemDesc, periods: [], totalVol: 0 };
      }

      periodNames.forEach((p, idx) => {
        const colName = periodCols[p];
        const val = colName && row[colName] !== undefined ? Number(String(row[colName] || 0).replace(/[^0-9.-]+/g, '')) || 0 : 0;
        itemMap[key].periods[idx] = (itemMap[key].periods[idx] || 0) + val;
      });
    }

    const rawItems = Object.values(itemMap).map(item => {
      const totalVol = item.periods.reduce((a: number, b: number) => a + b, 0);
      const mean = totalVol / 6;
      let variance = 0;
      item.periods.forEach((val: number) => {
        variance += Math.pow(val - mean, 2);
      });
      const stdDev = Math.sqrt(variance / 6);
      const cv = mean > 0 ? stdDev / mean : 0;
      let xyz = 'Z';
      if (cv <= 0.20) xyz = 'X';
      else if (cv <= 0.50) xyz = 'Y';

      return { ...item, totalVol, mean, stdDev, cv: Number(cv.toFixed(2)), xyz };
    }).sort((a, b) => b.totalVol - a.totalVol);

    const grandTotalVol = rawItems.reduce((a, b) => a + b.totalVol, 0);
    let cumVol = 0;
    const classifiedItems = rawItems.map(item => {
      cumVol += item.totalVol;
      const cumPct = grandTotalVol > 0 ? (cumVol / grandTotalVol) * 100 : 100;
      let abc = 'C';
      if (cumPct <= 80 || (item.totalVol > 0 && cumVol === item.totalVol && cumPct > 80)) abc = 'A';
      else if (cumPct <= 95) abc = 'B';
      const matrix = `${abc}${item.xyz}`;
      return { ...item, abc, cumPct: Number(cumPct.toFixed(1)), matrix };
    });

    const matrixCount: Record<string, { count: number; volume: number }> = {
      'AX': { count: 0, volume: 0 }, 'AY': { count: 0, volume: 0 }, 'AZ': { count: 0, volume: 0 },
      'BX': { count: 0, volume: 0 }, 'BY': { count: 0, volume: 0 }, 'BZ': { count: 0, volume: 0 },
      'CX': { count: 0, volume: 0 }, 'CY': { count: 0, volume: 0 }, 'CZ': { count: 0, volume: 0 }
    };

    classifiedItems.forEach(item => {
      if (matrixCount[item.matrix]) {
        matrixCount[item.matrix].count += 1;
        matrixCount[item.matrix].volume += item.totalVol;
      }
    });

    const chartData = Object.entries(matrixCount).map(([matrix, data]) => ({
      matrix,
      count: data.count,
      volume: Math.round(data.volume),
      fill: matrix.startsWith('A') ? '#10b981' : matrix.startsWith('B') ? '#3b82f6' : '#f59e0b'
    }));

    const topAZ = classifiedItems.filter(i => i.matrix === 'AZ' || i.matrix === 'AY');
    const topAX = classifiedItems.filter(i => i.matrix === 'AX' || i.matrix === 'BX');

    return { classifiedItems, matrixCount, chartData, grandTotalVol, topAZ, topAX };
  }, [parsed, filtered, colCabang, colCategory]);

  // 2. Cabang Supply (SOH + TO + Vessel + Hold Delivery + SPJM) vs AVG 3 Bulan calculation & insight
  const cabangSupplyVsAvg3 = useMemo(() => {
    if (!parsed || filtered.length === 0) return null;
    const map: Record<string, { cabang: string; name: string; soh: number; to: number; vessel: number; holdDelivery: number; spjm: number; totalSupply: number; avg3: number; ratio: number; diff: number }> = {};

    const colSOH = findColumn(parsed.headers, ['soh', 'on hand', 'stock on hand']);
    const colTO = findColumn(parsed.headers, ['to', 'transfer order']);
    const colVessel = findColumn(parsed.headers, ['on vessel', 'vessel', 'in transit', 'on_vessel']);
    const colHoldDelivery = findColumn(parsed.headers, ['hold delivery', 'hold_delivery']);
    const colSPJM = findColumn(parsed.headers, ['spjm']);
    const colAvg = findColumn(parsed.headers, ['avg sales 3 bln', 'avg sales', 'avg']);

    for (const row of filtered) {
      const cab = colCabang ? String(row[colCabang] || 'Unknown') : 'All';
      const grup = colGrup ? String(row[colGrup] || '-') : '-';
      const cat = colCategory ? String(row[colCategory] || 'Umum') : 'Umum';
      const key = `${cab}___${grup}___${cat}`;
      const name = `${cab} - ${grup} - ${cat}`;
      if (!map[key]) {
        map[key] = { cabang: cab, name, soh: 0, to: 0, vessel: 0, holdDelivery: 0, spjm: 0, totalSupply: 0, avg3: 0, ratio: 0, diff: 0 };
      }
      const soh = colSOH ? Number(String(row[colSOH] || 0).replace(/[^0-9.-]+/g, '')) || 0 : 0;
      const to = colTO ? Number(String(row[colTO] || 0).replace(/[^0-9.-]+/g, '')) || 0 : 0;
      const vessel = colVessel ? Number(String(row[colVessel] || 0).replace(/[^0-9.-]+/g, '')) || 0 : 0;
      const holdDelivery = colHoldDelivery ? Number(String(row[colHoldDelivery] || 0).replace(/[^0-9.-]+/g, '')) || 0 : 0;
      const spjm = colSPJM ? Number(String(row[colSPJM] || 0).replace(/[^0-9.-]+/g, '')) || 0 : 0;
      const avg3 = colAvg ? Number(String(row[colAvg] || 0).replace(/[^0-9.-]+/g, '')) || 0 : 0;

      map[key].soh += soh;
      map[key].to += to;
      map[key].vessel += vessel;
      map[key].holdDelivery += holdDelivery;
      map[key].spjm += spjm;
      map[key].totalSupply += (soh + to + vessel + holdDelivery + spjm);
      map[key].avg3 += avg3;
    }

    const list = Object.values(map).map(item => {
      const ratio = item.avg3 > 0 ? Number(((item.totalSupply / item.avg3) * 100).toFixed(1)) : 0;
      const diff = item.totalSupply - item.avg3;
      return { ...item, ratio, diff };
    });

    const underAvg = list.filter(item => item.totalSupply < item.avg3 && Math.round(item.avg3) > 0).sort((a, b) => a.ratio - b.ratio);
    const over125 = list.filter(item => item.totalSupply > (1.25 * item.avg3)).sort((a, b) => b.ratio - a.ratio);
    const normalRange = list.filter(item => item.totalSupply >= item.avg3 && item.totalSupply <= (1.25 * item.avg3));

    return { underAvg, over125, normalRange, list };
  }, [parsed, filtered, colCabang]);

  // 3. Table Sales vs Outstanding Insights
  const tableSalesVsOutInsights = useMemo(() => {
    if (!tableData || tableData.length === 0) return null;
    let countPositiveGrowth = 0;
    let countNegativeGrowth = 0;
    let totalSalesVol = 0;
    let totalOutVol = 0;
    let highestOutRatioItem: any = null;

    tableData.forEach(row => {
      totalSalesVol += row.sales;
      totalOutVol += row.outstanding;
      if (row.growthM > 0) countPositiveGrowth++;
      else if (row.growthM < 0) countNegativeGrowth++;

      if (row.sales > 50 && (!highestOutRatioItem || row.ratio > highestOutRatioItem.ratio)) {
        highestOutRatioItem = row;
      }
    });

    const globalOutRatio = totalSalesVol > 0 ? Number(((totalOutVol / totalSalesVol) * 100).toFixed(1)) : 0;
    const topContributors = [...tableData].sort((a, b) => b.kontribusi - a.kontribusi).slice(0, 3);

    return {
      countPositiveGrowth,
      countNegativeGrowth,
      globalOutRatio,
      highestOutRatioItem,
      topContributors
    };
  }, [tableData]);

  // 4. Insentif Analysis Insights
  const insentifInsights = useMemo(() => {
    if (!insentifAnalysis || insentifAnalysis.length === 0) return null;
    let topTier: any = null;
    let totalTierSales = 0;
    const contributors: Record<string, Record<string, number>> = {};

    insentifAnalysis.forEach(item => {
      totalTierSales += item.totalSales;
      if (!topTier || item.totalSales > topTier.totalSales) {
        topTier = item;
      }
      if (!contributors[item.categoryInsentif]) {
        contributors[item.categoryInsentif] = {};
      }
      contributors[item.categoryInsentif][item.category] = (contributors[item.categoryInsentif][item.category] || 0) + item.totalSales;
    });

    const topContributorsPerTier = Object.keys(contributors).map(tier => {
      const cats = Object.entries(contributors[tier])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([cat, sales]) => ({ name: cat, sales }));
      return { tier, contributors: cats };
    }).sort((a, b) => {
       const sumA = a.contributors.reduce((acc, c) => acc + c.sales, 0);
       const sumB = b.contributors.reduce((acc, c) => acc + c.sales, 0);
       return sumB - sumA;
    });

    return { topTier, topContributorsPerTier };
  }, [insentifAnalysis]);

  const currentRawUniqueValues = useMemo(() => {
    if (!activeRawColModal || !parsed) return [];
    const set = new Set<string>();
    filtered.forEach(r => {
      const val = String(r[activeRawColModal] !== undefined && r[activeRawColModal] !== null ? r[activeRawColModal] : '');
      if (val) set.add(val);
    });
    return Array.from(set).sort();
  }, [filtered, activeRawColModal, parsed]);

  const displayedRawData = useMemo(() => {
    return filtered.filter(row => {
      for (const [key, filter] of Object.entries(rawColFilters)) {
        if (!filter) continue;
        const rawVal = row[key];
        const val = String(rawVal !== undefined && rawVal !== null ? rawVal : '');
        if (filter.selected && filter.selected.length > 0 && !filter.selected.includes(val)) {
          return false;
        }
        if (filter.search && !val.toLowerCase().includes(filter.search.toLowerCase())) {
          return false;
        }
      }
      return true;
    });
  }, [filtered, rawColFilters]);

  const handleExport = () => {
    if (!tableData || tableData.length === 0) return;
    
    const wb = XLSX.utils.book_new();

    // 1. History Sales Komparatif Analis
    const ws1_data: any[][] = [
      [
        'Cabang / Wilayah',
        'Grup',
        'Kategori Item',
        'Total Volume Sales',
        'AVG Sales 3 Bln',
        '% Kontribusi (per Cabang)',
        'Volume M',
        'Volume M-1',
        'Pertumbuhan M vs AVG (%)',
        'Pertumbuhan M-1 vs AVG (%)'
      ]
    ];

    tableData.forEach(row => {
      ws1_data.push([
        row.cabang,
        row.grup || '-',
        row.category,
        toExactFloat(row.sales, 2),
        toExactFloat(row.avg3, 2),
        toExactFloat(row.kontribusi, 2),
        toExactFloat(row.m, 2),
        toExactFloat(row.m1, 2),
        row.growthM,
        row.growthM1
      ]);
    });
    const ws1 = XLSX.utils.aoa_to_sheet(ws1_data);
    XLSX.utils.book_append_sheet(wb, ws1, "History Sales Komparatif");

    // 2. Breakdown Kontribusi
    const ws2_data: any[][] = [
      ['Cabang', 'Grup', 'Category', 'Kontribusi', 'Nama Week', 'Total Target Perbulan', 'Target Per Minggu']
    ];

    const targetValueSheetName = parsed?.sheetNames?.find(n => n.toLowerCase().includes('target value'));
    const targetData = targetValueSheetName && parsed?.sheets ? parsed.sheets[targetValueSheetName]?.data : [];

    let weekStartVal: any = 1;
    let monthCols: string[] = [];
    if (targetData && targetData.length > 0) {
      // Find week start
      for (const r of targetData) {
        const keys = Object.keys(r);
        const wsKey = keys.find(k => k.toLowerCase().includes('week start'));
        if (wsKey && r[wsKey] !== undefined && r[wsKey] !== null) {
          const wStr = String(r[wsKey]).replace(/\D/g, ''); 
          if (wStr) {
            weekStartVal = parseInt(wStr, 10);
          } else {
            weekStartVal = r[wsKey];
          }
          break;
        }
      }
      
      const keys = Object.keys(targetData[0]);
      monthCols = keys.filter(k => {
        const kLower = k.toLowerCase().trim();
        return kLower === 'm' || kLower.startsWith('m+') || kLower.startsWith('m-') || /^m\s*\+?\s*\d+$/.test(kLower);
      });
    }
    
    let weekStartNum = parseInt(String(weekStartVal).replace(/\D/g, ''), 10);
    if (isNaN(weekStartNum)) weekStartNum = 1;

    tableData.forEach(row => {
      const cabang = row.cabang;
      const targetRow = targetData?.find((t: any) => {
        const cKey = Object.keys(t).find(k => k.toLowerCase() === 'cabang' || k.toLowerCase() === 'branch' || k.toLowerCase() === 'cab');
        return cKey && String(t[cKey]).trim().toLowerCase() === String(cabang).trim().toLowerCase();
      });

      if (targetRow && monthCols.length > 0) {
        let currentWeekNum = weekStartNum;
        
        for (const mCol of monthCols) {
          const monthTarget = Number(targetRow[mCol]) || 0;
          const kontribusiPct = row.kontribusi / 100;
          const totalTargetPerbulan = kontribusiPct * monthTarget;
          const targetPerMinggu = totalTargetPerbulan / 4;
          
          for (let w = 1; w <= 4; w++) {
            const namaWeek = (typeof weekStartVal === 'number' || !isNaN(parseInt(String(weekStartVal))))
                           ? `Week ${currentWeekNum}` 
                           : `${weekStartVal} + ${currentWeekNum - weekStartNum}`;
            ws2_data.push([
              cabang,
              row.grup || '-',
              row.category,
              toExactFloat(row.kontribusi, 2) + '%',
              namaWeek,
              toExactFloat(totalTargetPerbulan, 2),
              toExactFloat(targetPerMinggu, 2)
            ]);
            currentWeekNum++;
          }
        }
      }
    });

    const ws2 = XLSX.utils.aoa_to_sheet(ws2_data);
    XLSX.utils.book_append_sheet(wb, ws2, "Breakdown Kontribusi");

    XLSX.writeFile(wb, getStandardFilename(`History_Sales_Komparatif_Analisis`, new Date().toISOString(), 'xlsx'));
    toast.success('📊 Hasil Analisis Presisi History Sales Berhasil Diekspor!');
  };

  return (
    <div className="space-y-8 pb-16 min-h-screen animate-fade-in text-foreground">
      {/* ─── HERO BANNER HEADER ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 p-6 sm:p-8 border border-blue-500/20 shadow-2xl">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#3b82f6_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-widest">
              <TrendingUp className="w-3.5 h-3.5" /> Dashboard Data Harian • History Sales
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white flex items-center gap-3">
              History Sales & Outstanding <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-sky-400 to-cyan-300">(Analytics Engine)</span>
            </h1>
            <p className="text-slate-300 text-sm sm:text-base max-w-3xl font-normal leading-relaxed">
              Pemantauan performa penjualan historis terhadap pesanan tertunggak (outstanding). Menganalisa metrik otomatis dari sheet Data Compile secara aktual dan riil.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <TimestampBadge timestamp={parsed?.processed_at || new Date().toISOString()} label="Olah Terakhir:" />
            <button
              onClick={() => setShowHowTo(!showHowTo)}
              className="w-full sm:w-auto px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              <HelpCircle className="w-4 h-4" />
              {showHowTo ? 'Tutup Panduan' : 'Panduan & Template'}
            </button>
          </div>
        </div>
      </div>

      {/* ─── PANDUAN, TEMPLATE & UPLOAD SECTION ─── */}
      {showHowTo && (
        <GlassCard className="p-6 border-blue-500/30 bg-white backdrop-blur-xl animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-blue-400" /> Panduan Upload Data History Sales (Excel / CSV)
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleDownloadTemplate}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-slate-900 font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-sky-600/20"
              >
                <Download className="w-4 h-4" /> Unduh Template CSV
              </button>
              <button
                onClick={handleGenerateDemo}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-slate-900 font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-blue-500/20"
              >
                <Sparkles className="w-4 h-4" /> Gunakan Data Demo
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-700 mb-6">
            <div className="space-y-2">
              <h4 className="font-semibold text-slate-900">📌 Analisis Sales vs Outstanding:</h4>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Modul ini otomatis mendeteksi kolom metrik berlabel <i>Sales, AVG Sales,</i> atau <i>Jual</i> sebagai Volume Penjualan, dan metrik lainnya sebagai <i>Outstanding Order / Hold Delivery</i>.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-slate-900">⚙️ Engine Pembacaan Excel (XLSX & CSV):</h4>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Didukung parser XLSX ArrayBuffer, Anda dapat mengunggah file Excel (.xlsx) langsung dari ERP atau Google Sheet tanpa kekhawatiran error karakter binari atau pemisahan desimal yang keliru.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200">
            <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Unggah File Data Compile Anda:</h4>
            <FileUploader
              onFileUpload={handleFileUpload}
              isLoading={isProcessing}
              label="Upload Data History Sales (Sheet: Data Compile)"
              description="Drag & drop file Excel/CSV di sini. Sistem otomatis mendeteksi metrik penjualan dan outstanding."
            />
          </div>
        </GlassCard>
      )}

      {/* ─── EXECUTIVE KPI SUMMARY CHIPS ─── */}
      {executiveSummary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KPICard
            title="Total Volume Sales"
            value={`${formatNumberCompact(executiveSummary.totalSales)}`}
            trend="Akumulasi Penjualan Cabang"
            icon={<TrendingUp className="w-5 h-5 text-blue-400" />}
            className="border-blue-500/20 bg-blue-500/5 hover:border-blue-500/40 transition"
          />
          <KPICard
            title="Total Outstanding Order"
            value={`${formatNumberCompact(executiveSummary.totalOutstanding)}`}
            trend="Pesanan Belum Terkirim / Hold"
            icon={<AlertCircle className="w-5 h-5 text-amber-400" />}
            className="border-amber-500/20 bg-amber-500/5 hover:border-amber-500/40 transition"
          />
          <KPICard
            title="Rasio Outstanding / Sales"
            value={executiveSummary.ratio}
            trend={executiveSummary.ratioNum > 25 ? "Rasio Tinggi (>25% Peringatan)" : "Rasio Terkendali (<25%)"}
            isAlert={executiveSummary.ratioNum > 25}
            icon={<AlertTriangle className={`w-5 h-5 ${executiveSummary.ratioNum > 25 ? 'text-rose-400' : 'text-emerald-400'}`} />}
            className={`transition ${executiveSummary.ratioNum > 25 ? 'border-rose-500/20 bg-rose-500/5 hover:border-rose-500/40' : 'border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/40'}`}
          />
          <KPICard
            title="Cabang Kontribusi Tertinggi"
            value={executiveSummary.topCabang ? executiveSummary.topCabang.name : 'N/A'}
            trend={executiveSummary.topCabang ? `${executiveSummary.topCabang.total.toLocaleString('id-ID')} Total Vol` : ''}
            icon={<Award className="w-5 h-5 text-purple-400" />}
            className="border-purple-500/20 bg-purple-500/5 hover:border-purple-500/40 transition"
          />
        </div>
      )}

      {/* ─── FILTER CONTROLS & SELECTION (EXPANDED & OVERFLOW-VISIBLE) ─── */}
      <GlassCard allowOverflow={true} className="p-6 border-slate-200 bg-white backdrop-blur-xl mb-10 shadow-xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 block uppercase tracking-wider">🌍 Filter Region:</label>
            <MultiSelect
              options={regions}
              selected={selectedRegion}
              onChange={setSelectedRegion}
              selectAllLabel="Semua Region"
              placeholder="Pilih Region..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 block uppercase tracking-wider">🏢 Filter Cabang:</label>
            <MultiSelect
              options={cabangs}
              selected={selectedCabang}
              onChange={setSelectedCabang}
              selectAllLabel="Semua Cabang"
              placeholder="Pilih Cabang..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 block uppercase tracking-wider">📦 Filter Kategori Item:</label>
            <MultiSelect
              options={categories}
              selected={selectedCategory}
              onChange={setSelectedCategory}
              selectAllLabel="Semua Kategori Item"
              placeholder="Pilih Kategori..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-purple-300 block uppercase tracking-wider">💎 Filter Category Insentif:</label>
            <MultiSelect
              options={categoryInsentifs.length > 0 ? categoryInsentifs : ['All', 'Tier 1 (High Performance)', 'Tier 2 (Core Growth)', 'Tier 3 (Standard)', 'Non-Insentif']}
              selected={selectedCategoryInsentif}
              onChange={setSelectedCategoryInsentif}
              selectAllLabel="Semua Category Insentif"
              placeholder="Pilih Insentif..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 block uppercase tracking-wider">📍 Sorot Grafik Cabang:</label>
            <select
              value={selectedCabangForChart}
              onChange={(e) => setSelectedCabangForChart(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 outline-none transition font-semibold cursor-pointer shadow-md"
            >
              <option value="All">📊 Semua Cabang (Gabungan)</option>
              {cabangs.filter(c => c !== 'All').map(c => (
                <option key={c} value={c}>📍 Fokus: {c}</option>
              ))}
            </select>
          </div>
        </div>
      </GlassCard>

      {/* ─── ANALISIS ABC-XYZ (DATA M s/d M-5) ─── */}
      {abcXyzAnalysis && abcXyzAnalysis.classifiedItems.length > 0 && (
        <GlassCard className="p-6 border-indigo-500/40 bg-gradient-to-br from-slate-900 via-indigo-950/20 to-slate-950 shadow-2xl overflow-hidden">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-200 pb-4 mb-6 gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase tracking-widest mb-2 shadow-sm">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Advanced Analytics • Matriks ABC-XYZ (M s/d M-5)
              </div>
              <h3 className="text-lg sm:text-xl font-black text-white flex items-center gap-2.5">
                <BarChart3 className="w-6 h-6 text-indigo-400" />
                Grafik &amp; Analisa Matriks ABC-XYZ (Volume vs Fluktuasi Permintaan)
              </h3>
              <p className="text-xs text-slate-300 mt-1 max-w-3xl leading-relaxed">
                Menggabungkan klasifikasi <b>ABC</b> (kontribusi volume sales) dengan <b>XYZ</b> (koefisien variasi permintaan M s/d M-5) untuk menentukan strategi stok yang presisi.
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 font-mono text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200 shrink-0">
              <span className="text-slate-600 text-[10px]">TOTAL ITEMS DIANALISA</span>
              <strong className="text-indigo-400 text-base font-extrabold">{abcXyzAnalysis.classifiedItems.length} Item / Kombinasi</strong>
              <span className="text-[10px] text-emerald-400">X: Stabil (CV &le; 20%) | Y: Sedang | Z: Fluktuatif (CV &gt; 50%)</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            {/* Chart: Distribusi Matriks ABC-XYZ */}
            <div className="lg:col-span-6 flex flex-col bg-slate-50 p-5 rounded-2xl border border-slate-200 shadow-inner">
              <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-300 mb-4 text-center flex items-center justify-center gap-1.5">
                📊 Jumlah Item dalam 9 Kuadran Matriks ABC-XYZ
              </h4>
              <div className="h-[280px] w-full flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={abcXyzAnalysis.chartData} margin={{ top: 15, right: 15, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                    <XAxis dataKey="matrix" stroke="#94a3b8" tick={{ fill: '#e2e8f0', fontSize: 13, fontWeight: 'bold' }} />
                    <YAxis stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#6366f1', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.8)' }}
                      formatter={(val: any, name: any, props: any) => [
                        `${Number(val).toLocaleString('id-ID')} Item (Vol: ${props.payload.volume.toLocaleString('id-ID')} Unit)`,
                        'Jumlah Item'
                      ]}
                      labelStyle={{ color: '#818cf8', fontWeight: 'bold' }}
                    />
                    <Bar dataKey="count" name="Jumlah Item" radius={[6, 6, 0, 0]} maxBarSize={50}>
                      {abcXyzAnalysis.chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} stroke="#ffffff" strokeWidth={1} />
                      ))}
                      <LabelList dataKey="count" position="top" fill="#ffffff" fontSize={12} fontWeight="bold" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center items-center gap-4 mt-3 text-[11px] font-semibold">
                <span className="flex items-center gap-1.5 text-emerald-400"><span className="w-2.5 h-2.5 rounded bg-emerald-500"></span> A (Top 80% Vol)</span>
                <span className="flex items-center gap-1.5 text-blue-400"><span className="w-2.5 h-2.5 rounded bg-blue-500"></span> B (15% Vol)</span>
                <span className="flex items-center gap-1.5 text-amber-400"><span className="w-2.5 h-2.5 rounded bg-amber-500"></span> C (5% Vol)</span>
              </div>
            </div>

            {/* Insight & Rekomendasi ABC-XYZ */}
            <div className="lg:col-span-6 flex flex-col justify-between gap-4">
              {/* Box 1: Sorotan Risiko (AZ & AY - Volume Tinggi, Permintaan Tidak Menentu) */}
              <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 flex flex-col max-h-[300px]">
                <div className="flex items-center gap-2 text-amber-300 font-extrabold text-xs uppercase tracking-wider mb-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                  <span>Sorotan Risiko Kritis: Kelompok AY &amp; AZ (High Vol, High Fluctuation)</span>
                </div>
                <p className="text-xs text-amber-100 mb-3 leading-relaxed shrink-0">
                  Item dalam kuadran <b>AZ &amp; AY</b> adalah penyumbang omzet terbesar namun memiliki fluktuasi permintaan tinggi. Rentan mengalami stockout drastis atau overstock!
                </p>
                <div className="overflow-y-auto pr-2 space-y-1.5 grow">
                  {abcXyzAnalysis.topAZ.length > 0 ? (
                    abcXyzAnalysis.topAZ.map((it, idx) => (
                      <div key={idx} className="p-2 rounded-lg bg-slate-50 border border-amber-500/20 flex items-center justify-between text-xs">
                        <div className="truncate pr-2">
                          <span className="font-bold text-slate-900 block">📍 {it.cabang} - {it.name}</span>
                          <span className="text-[10px] text-slate-600">Avg Vol: {Math.round(it.mean).toLocaleString('id-ID')} /bln | CV: {it.cv}</span>
                        </div>
                        <span className="px-2 py-1 bg-amber-500/20 text-amber-500 font-mono font-black text-xs rounded border border-amber-500/30">
                          {it.matrix}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-slate-400 font-medium py-2">Semua item volume tinggi memiliki permintaan cukup stabil.</div>
                  )}
                </div>
              </div>

              {/* Box 2: Strategi Optimasi (AX & BX - Stabil & Predictable) */}
              <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 flex flex-col max-h-[300px]">
                <div className="flex items-center gap-2 text-emerald-400 font-extrabold text-xs uppercase tracking-wider mb-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Kinerja Stabil: Kelompok AX &amp; BX (Predictable)</span>
                </div>
                <p className="text-xs text-emerald-100 mb-3 leading-relaxed shrink-0">
                  Item <b>AX &amp; BX</b> stabil dan terprediksi. Ketersediaan stok harus dijamin 99% menggunakan <i>auto-replenishment</i> dengan <i>safety stock</i> rendah.
                </p>
                <div className="overflow-y-auto pr-2 space-y-1.5 grow">
                  {abcXyzAnalysis.topAX.length > 0 ? (
                    abcXyzAnalysis.topAX.map((it, idx) => (
                      <div key={idx} className="p-2 rounded-lg bg-slate-50 border border-emerald-500/20 flex items-center justify-between text-xs">
                        <div className="truncate pr-2">
                          <span className="font-bold text-slate-900 block">📍 {it.cabang} - {it.name}</span>
                          <span className="text-[10px] text-slate-600">Avg Vol: {Math.round(it.mean).toLocaleString('id-ID')} /bln | CV: {it.cv}</span>
                        </div>
                        <span className="px-2 py-1 bg-emerald-500/20 text-emerald-600 font-mono font-black text-xs rounded border border-emerald-500/30">
                          {it.matrix}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-slate-400 font-medium py-2">Belum ada item stabil yang dapat diprediksi kuat.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </GlassCard>
      )}

      {/* ─── VISUALIZATION CHART: SALES VS OUTSTANDING ─── */}
      {chartData && chartData.length > 0 && (
        <GlassCard className="p-6 border-blue-500/30 bg-gradient-to-b from-slate-900/90 to-slate-950/90 shadow-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-4 mb-6 gap-3">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-400" />
                Grafik Komparasi Volume Sales vs Outstanding per Cabang
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                Sorotan: <b className="text-cyan-400">{selectedCabangForChart === 'All' ? 'Seluruh Cabang' : selectedCabangForChart}</b> • Data Mode: <b className="text-emerald-300">AKTUAL & RIIL</b>
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200 shrink-0">
              <button
                onClick={() => setChartFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                  chartFilter === 'all' ? 'bg-blue-600 text-slate-900 shadow-md scale-105' : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" /> Semua Metrik
              </button>
              <button
                onClick={() => setChartFilter('sales')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                  chartFilter === 'sales' ? 'bg-emerald-600 text-slate-900 shadow-md scale-105' : 'text-slate-600 hover:text-emerald-400'
                }`}
              >
                📈 Fokus Sales
              </button>
              <button
                onClick={() => setChartFilter('outstanding')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                  chartFilter === 'outstanding' ? 'bg-amber-600 text-slate-900 shadow-md scale-105' : 'text-slate-600 hover:text-amber-400'
                }`}
              >
                ⚠️ Fokus Outstanding
              </button>
              <button
                onClick={() => setChartFilter('avg3')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                  chartFilter === 'avg3' ? 'bg-rose-600 text-slate-900 shadow-md scale-105' : 'text-slate-600 hover:text-rose-400'
                }`}
              >
                📈 AVG 3 Bulan (Garis)
              </button>
            </div>
          </div>

          <div className="h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 30, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                <XAxis dataKey="cabang" stroke="#94a3b8" tick={{ fill: '#e2e8f0', fontSize: 12, fontWeight: 600 }} angle={-15} textAnchor="end" height={50} />
                <YAxis stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#3b82f6', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}
                  labelStyle={{ color: '#38bdf8', fontWeight: 'bold', borderBottom: '1px solid #334155', paddingBottom: '4px' }}
                />
                <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '12px' }} />
                {displayedChartColumns.map((tc, idx) => {
                  const lower = tc.name.toLowerCase().trim();
                  const isAvg = lower.includes('avg') || lower.includes('rata');
                  if (isAvg) {
                    return (
                      <Line
                        key={tc.name}
                        type="monotone"
                        dataKey={tc.name}
                        name={`📈 ${tc.name} (Line Trend)`}
                        stroke="#f43f5e"
                        strokeWidth={3}
                        dot={{ r: 6, fill: '#f43f5e', stroke: '#ffffff', strokeWidth: 1.5 }}
                        activeDot={{ r: 7 }}
                      />
                    );
                  }

                  const isSupplyOrOutstanding = 
                    lower.includes('soh') || 
                    lower === 'on hand' ||
                    lower.includes('to') || 
                    lower === 'transfer order' ||
                    lower.includes('vessel') || 
                    lower.includes('hold') || 
                    lower.includes('outstanding') || 
                    lower.includes('order') ||
                    lower.includes('inbound');

                  let barColor = COLORS[idx % COLORS.length];
                  if (lower.includes('hold')) barColor = '#f59e0b';
                  else if (lower.includes('vessel')) barColor = '#3b82f6';
                  else if (lower.includes('soh')) barColor = '#10b981';
                  else if (lower === 'to' || lower.includes('to ')) barColor = '#f97316';
                  else if (!isSupplyOrOutstanding) barColor = COLORS[(idx + 2) % COLORS.length];

                  return (
                    <Bar
                      key={tc.name}
                      dataKey={tc.name}
                      name={isSupplyOrOutstanding ? `📦 ${tc.name}` : `📊 ${tc.name} (Sales Vol)`}
                      stackId={isSupplyOrOutstanding ? "supply_outstanding" : undefined}
                      fill={barColor}
                      maxBarSize={60}
                    />
                  );
                })}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* ─── INSIGHT CABANG: SOH + TO + VESSEL VS AVG SALES 3 BULAN ─── */}
          {cabangSupplyVsAvg3 && (
            <div className="mt-8 p-5 rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-blue-500/30 shadow-lg">
              <div className="flex items-center gap-2.5 border-b border-slate-200 pb-3 mb-4">
                <span className="p-2 rounded-xl bg-blue-500/20 text-blue-400">
                  <ShieldAlert className="w-5 h-5 text-blue-400 animate-pulse" />
                </span>
                <div>
                  <h4 className="font-extrabold text-white text-sm sm:text-base tracking-wide flex items-center gap-2">
                    Insight Analitis: Komparasi Total Pasokan (SOH + TO + Vessel + Hold Delivery + SPJM) vs Rata-Rata Sales 3 Bulan
                  </h4>
                  <p className="text-xs text-slate-600">
                    Evaluasi ketahanan stok cabang terhadap kebutuhan rata-rata 3 bulan historis (AVG 3 Bln).
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Box 1: Cabang Kurang dari AVG 3 Bulan */}
                <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/30 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3 border-b border-rose-500/20 pb-2">
                      <span className="text-rose-300 font-black text-xs uppercase tracking-wider flex items-center gap-1.5">
                        <ArrowDownRight className="w-4 h-4 text-rose-400" /> Kategori Pasokan Kurang dari AVG 3 Bln (&lt;100%)
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-mono font-extrabold text-[11px] border border-rose-500/30">
                        {cabangSupplyVsAvg3.underAvg.length} Category Kritis
                      </span>
                    </div>
                    {cabangSupplyVsAvg3.underAvg.length > 0 ? (
                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {cabangSupplyVsAvg3.underAvg.map((item, idx) => (
                          <div key={idx} className="p-2.5 rounded-xl bg-slate-50 border border-rose-500/20 flex items-center justify-between text-xs shadow-sm">
                            <div>
                              <div className="font-bold text-slate-900 text-sm">📍 {item.name}</div>
                              <div className="text-[11px] text-slate-600 mt-0.5">
                                Pasokan: <span className="text-rose-700 font-mono">{Math.round(item.totalSupply).toLocaleString('id-ID')}</span> | AVG 3 Bln: <span className="text-slate-800 font-mono">{Math.round(item.avg3).toLocaleString('id-ID')}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-mono font-black text-rose-700 text-sm">{item.ratio}%</div>
                              <div className="text-[10px] text-rose-600 font-semibold">Defisit: {Math.round(item.diff).toLocaleString('id-ID')}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-6 text-center text-emerald-400 font-bold text-xs">
                        🎉 Semua kategori memiliki pasokan melebihi kebutuhan rata-rata 3 bulan!
                      </div>
                    )}
                  </div>
                  <div className="mt-3.5 pt-2.5 border-t border-rose-500/20 text-[11px] text-rose-300 leading-relaxed">
                    ⚠️ <strong>Peringatan Kritis:</strong> Kategori di atas berpotensi kehabisan stok sebelum siklus bulan depan. Segera alokasikan kiriman TO tambahan atau percepat jadwal kapal!
                  </div>
                </div>

                {/* Box 2: Cabang Melebihi 125% dari AVG 3 Bulan */}
                <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3 border-b border-emerald-500/20 pb-2">
                      <span className="text-emerald-400 font-black text-xs uppercase tracking-wider flex items-center gap-1.5">
                        <ArrowUpRight className="w-4 h-4 text-emerald-400" /> Kategori Melebihi 125% dari AVG 3 Bln (&gt;125%)
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-extrabold text-[11px] border border-emerald-500/30">
                        {cabangSupplyVsAvg3.over125.length} Category Surplus / Buffer
                      </span>
                    </div>
                    {cabangSupplyVsAvg3.over125.length > 0 ? (
                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {cabangSupplyVsAvg3.over125.map((item, idx) => (
                          <div key={idx} className="p-2.5 rounded-xl bg-slate-50 border border-emerald-500/20 flex items-center justify-between text-xs shadow-sm">
                            <div>
                              <div className="font-bold text-slate-900 text-sm">📍 {item.name}</div>
                              <div className="text-[11px] text-slate-600 mt-0.5">
                                Pasokan: <span className="text-emerald-700 font-mono">{Math.round(item.totalSupply).toLocaleString('id-ID')}</span> | AVG 3 Bln: <span className="text-slate-800 font-mono">{Math.round(item.avg3).toLocaleString('id-ID')}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-mono font-black text-emerald-700 text-sm">{item.ratio}%</div>
                              <div className="text-[10px] text-emerald-600 font-semibold">Surplus: +{Math.round(item.diff).toLocaleString('id-ID')}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-6 text-center text-slate-600 font-bold text-xs">
                        Tidak ada kategori yang pasokannya melebihi batas buffer 125%.
                      </div>
                    )}
                  </div>
                  <div className="mt-3.5 pt-2.5 border-t border-emerald-500/20 text-[11px] text-emerald-300 leading-relaxed">
                    🟢 <strong>Status: Buffer Sangat Aman / Overstocked.</strong> Kategori ini memiliki ketahanan suplai di atas 1,25 bulan. Sangat cocok sebagai sumber redistribusi (Transfer Order) jika ada cabang terdekat yang mengalami krisis suplai.
                  </div>
                </div>
              </div>
            </div>
          )}
        </GlassCard>
      )}

      {/* ─── NEW VISUALIZATION: ON HAND + VESSEL + TO VS HISTORY M s/d M-5 ─── */}
      {supplyVsMonthlySales && (
        <GlassCard className="p-6 border-amber-500/40 bg-gradient-to-b from-slate-900/95 via-slate-950/90 to-slate-900/95 shadow-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-4 mb-6 gap-3">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-black bg-amber-500/10 text-amber-400 border border-amber-500/30 uppercase tracking-widest mb-2">
                <Layers className="w-3.5 h-3.5" /> Kapasitas Stok vs History Penjualan
              </div>
              <h3 className="text-lg sm:text-xl font-black text-white flex items-center gap-2.5">
                <BarChart3 className="w-5 h-5 text-amber-400" />
                Komparasi Stok (SOH + TO + Vessel) Terhadap Penjualan Bulanan (M s/d M-5)
              </h3>
              <p className="text-xs text-slate-700 mt-1">
                Visualisasi terpadu membandingkan volume transaksi penjualan dari 6 bulan terakhir (M s/d M-5) dengan kapasitas posisi stok aktual dan perjalanan.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs font-mono font-bold">
              <span className="px-2.5 py-1 rounded bg-slate-700/50 text-slate-800">SOH: {supplyVsMonthlySales.totalSOH.toLocaleString('id-ID')}</span>
              <span className="text-slate-500">+</span>
              <span className="px-2.5 py-1 rounded bg-blue-500/20 text-blue-300">TO: {supplyVsMonthlySales.totalTO.toLocaleString('id-ID')}</span>
              <span className="text-slate-500">+</span>
              <span className="px-2.5 py-1 rounded bg-slate-200/20 text-slate-800">Vessel: {supplyVsMonthlySales.totalVessel.toLocaleString('id-ID')}</span>
              <span className="text-slate-500">=</span>
              <span className="px-3 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">Total: {supplyVsMonthlySales.totalSupply.toLocaleString('id-ID')}</span>
            </div>
          </div>

          <div className="h-[420px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={supplyVsMonthlySales.chartData} margin={{ top: 25, right: 75, left: 75, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                <XAxis dataKey="period" stroke="#94a3b8" tick={{ fill: '#ffffff', fontSize: 15, fontWeight: 800 }} />
                <YAxis stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 12 }} domain={[0, supplyVsMonthlySales.maxY]} tickFormatter={(val) => val.toLocaleString('id-ID')} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#eab308', borderRadius: '12px', padding: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.8)' }}
                  formatter={(val: any) => [Number(val).toLocaleString('id-ID') + ' Unit', 'Volume Sales']}
                  labelStyle={{ color: '#fde047', fontWeight: 'bold' }}
                />

                {/* Background Zones representing SOH, TO, VESSEL */}
                <ReferenceArea y1={0} y2={supplyVsMonthlySales.totalSOH} fill="#64748b" fillOpacity={0.35} stroke="none" />
                <ReferenceArea y1={supplyVsMonthlySales.totalSOH} y2={supplyVsMonthlySales.totalSOH + supplyVsMonthlySales.totalTO} fill="#3b82f6" fillOpacity={0.3} stroke="none" />
                <ReferenceArea y1={supplyVsMonthlySales.totalSOH + supplyVsMonthlySales.totalTO} y2={supplyVsMonthlySales.totalSupply} fill="#cbd5e1" fillOpacity={0.25} stroke="none" />

                {/* Zone Labels inside left & right */}
                <ReferenceLine y={supplyVsMonthlySales.totalSOH / 2} stroke="none" label={{ value: 'SOH', position: 'insideLeft', fill: '#334155', fontSize: 14, fontWeight: 900 }} />
                <ReferenceLine y={supplyVsMonthlySales.totalSOH / 2} stroke="none" label={{ value: 'SOH', position: 'insideRight', fill: '#334155', fontSize: 14, fontWeight: 900 }} />

                <ReferenceLine y={supplyVsMonthlySales.totalSOH + supplyVsMonthlySales.totalTO / 2} stroke="none" label={{ value: 'TO', position: 'insideLeft', fill: '#1e40af', fontSize: 14, fontWeight: 900 }} />
                <ReferenceLine y={supplyVsMonthlySales.totalSOH + supplyVsMonthlySales.totalTO / 2} stroke="none" label={{ value: 'TO', position: 'insideRight', fill: '#1e40af', fontSize: 14, fontWeight: 900 }} />

                <ReferenceLine y={supplyVsMonthlySales.totalSOH + supplyVsMonthlySales.totalTO + supplyVsMonthlySales.totalVessel / 2} stroke="none" label={{ value: 'VESSEL', position: 'insideLeft', fill: '#475569', fontSize: 14, fontWeight: 900 }} />
                <ReferenceLine y={supplyVsMonthlySales.totalSOH + supplyVsMonthlySales.totalTO + supplyVsMonthlySales.totalVessel / 2} stroke="none" label={{ value: 'VESSEL', position: 'insideRight', fill: '#475569', fontSize: 14, fontWeight: 900 }} />

                {/* Dashed boundary lines with numerical summary */}
                <ReferenceLine y={supplyVsMonthlySales.totalSOH} stroke="#64748b" strokeDasharray="3 3" label={{ value: `SOH: ${supplyVsMonthlySales.totalSOH.toLocaleString('id-ID')}`, position: 'insideTopLeft', fill: '#64748b', fontSize: 11, fontWeight: 'bold' }} />
                <ReferenceLine y={supplyVsMonthlySales.totalSOH + supplyVsMonthlySales.totalTO} stroke="#3b82f6" strokeDasharray="3 3" label={{ value: `+TO: ${(supplyVsMonthlySales.totalSOH + supplyVsMonthlySales.totalTO).toLocaleString('id-ID')}`, position: 'insideTopLeft', fill: '#2563eb', fontSize: 11, fontWeight: 'bold' }} />
                <ReferenceLine y={supplyVsMonthlySales.totalSupply} stroke="#cbd5e1" strokeDasharray="4 4" strokeWidth={2} label={{ value: `Total (SOH+TO+Vessel): ${supplyVsMonthlySales.totalSupply.toLocaleString('id-ID')}`, position: 'top', fill: '#0f172a', fontSize: 12, fontWeight: 'bold' }} />

                {/* Monthly Sales Bars */}
                <Bar dataKey="sales" name="Volume Sales Bulanan" radius={[6, 6, 0, 0]} maxBarSize={80}>
                  {supplyVsMonthlySales.chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} stroke="#0f172a" strokeWidth={1} />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      )}

      {/* ─── TABEL COMPLEMENTARY: ANALISIS PERFORMANCE & ZONASI OUTSTANDING ─── */}
      <GlassCard className="p-6 border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-200 pb-4 mb-6 gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
              <FileSpreadsheet className="w-5 h-5 text-blue-400" />
              Tabel Analisis Komparatif Sales vs Outstanding ({tableData.length} Kombinasi Cabang / Grup / Kategori)
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              Rincian performa penjualan, rata-rata 3 bulan, serta % kontribusi per kombinasi Cabang, Grup, & Kategori secara real-time.
            </p>
          </div>

          <button
            onClick={handleExport}
            className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-slate-900 font-semibold text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-blue-600/20 shrink-0"
          >
            <Download className="w-4 h-4" /> Ekspor Hasil ke Excel / CSV
          </button>
        </div>

        {/* ─── INSIGHT TABEL SALES VS OUTSTANDING ─── */}
        {tableSalesVsOutInsights && (
          <div className="mb-6 p-5 rounded-2xl bg-gradient-to-r from-blue-950/40 via-slate-900 to-slate-950 border border-blue-500/30 shadow-lg">
            <div className="flex items-center gap-2 text-blue-400 font-extrabold text-sm sm:text-base mb-3 border-b border-blue-500/20 pb-2.5">
              <Sparkles className="w-5 h-5 text-blue-400" />
              <span>Insight Evaluasi Komparatif Sales vs Outstanding Order</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-600 font-bold text-[10px] uppercase block mb-1">Tren Pertumbuhan (M vs AVG 3 Bln)</span>
                <div className="flex items-center justify-between text-sm font-extrabold mt-2">
                  <span className="text-emerald-400 flex items-center gap-1">▲ {tableSalesVsOutInsights.countPositiveGrowth} Kombinasi Positif</span>
                  <span className="text-rose-400 flex items-center gap-1">▼ {tableSalesVsOutInsights.countNegativeGrowth} Melambat</span>
                </div>
                <p className="text-[11px] text-slate-600 mt-2 leading-tight">
                  Menunjukkan perbandingan persentase item yang mengalami pertumbuhan volume pada bulan berjalan dibanding rata-rata 3 bulan.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/30">
                <span className="text-amber-300 font-bold text-[10px] uppercase block mb-1">Rasio Outstanding Tertinggi (Bottleneck)</span>
                {tableSalesVsOutInsights.highestOutRatioItem ? (
                  <div>
                    <div className="font-extrabold text-white text-sm truncate mt-1">📍 {tableSalesVsOutInsights.highestOutRatioItem.cabang} ({tableSalesVsOutInsights.highestOutRatioItem.category})</div>
                    <div className="text-xs font-mono font-black text-amber-400 mt-1">Rasio Out/Sales: {tableSalesVsOutInsights.highestOutRatioItem.ratio.toFixed(1)}% ({tableSalesVsOutInsights.highestOutRatioItem.outstanding.toLocaleString('id-ID')} Unit Hold)</div>
                    <p className="text-[11px] text-amber-200 mt-1.5 leading-tight">
                      ⚠️ Kombinasi ini mengalami tunggakan pesanan paling tinggi terhadap penjualan aktual. Perlu intervensi logistik segera!
                    </p>
                  </div>
                ) : (
                  <span className="text-slate-400 text-xs">Tidak ada data outstanding signifikan.</span>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-500/30">
                <span className="text-purple-300 font-bold text-[10px] uppercase block mb-1">Top Kontributor Terhadap AVG Sales</span>
                <div className="space-y-1.5 mt-2">
                  {tableSalesVsOutInsights.topContributors.map((tc, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs">
                      <span className="text-white font-bold truncate pr-2">🏆 {tc.cabang} ({tc.category})</span>
                      <span className="text-purple-300 font-mono font-black shrink-0">{tc.kontribusi.toFixed(1)}% Vol</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-[600px] overflow-y-auto">
          <table className="w-full text-left text-xs sm:text-sm border-collapse min-w-[1350px]">
            <thead className="bg-slate-50 text-slate-700 uppercase font-bold sticky top-0 z-20 shadow-md">
              <tr className="border-b border-slate-200 text-[11px] tracking-wider text-center">
                <th className="py-3.5 px-4 text-left">Cabang / Wilayah</th>
                <th className="py-3.5 px-4 border-l border-slate-200 text-slate-700">🏷️ Grup</th>
                <th className="py-3.5 px-4 border-l border-slate-200 text-purple-300">📦 Kategori Item</th>
                <th className="py-3.5 px-4 border-l border-slate-200 text-blue-400">📈 Total Volume Sales</th>
                <th className="py-3.5 px-4 border-l border-slate-200 text-rose-400">📊 AVG Sales 3 Bln</th>
                <th className="py-3.5 px-4 border-l border-slate-200 text-amber-300">✨ % Kontribusi (per Cabang)</th>
                <th className="py-3.5 px-4 border-l border-slate-200 text-cyan-400">📅 Volume M & M-1</th>
                <th className="py-3.5 px-4 border-l border-slate-200 text-emerald-400">📈 Pertumbuhan vs AVG 3 Bln</th>
                <th className="py-3.5 px-4 border-l border-slate-200 text-amber-300">💡 Analisis Pertumbuhan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-700 text-center">
              {tableData.map((row, idx) => {
                const isCritical = row.ratio > 30;
                const isWarning = row.ratio > 15 && !isCritical;
                const isPrime = row.ratio <= 15 && row.sales > 5000;

                return (
                  <tr
                    key={`${row.cabang}-${row.grup}-${row.category}-${idx}`}
                    className="hover:bg-slate-100 transition cursor-pointer font-medium"
                    onClick={() => setSelectedCabangForChart(row.cabang === selectedCabangForChart ? 'All' : row.cabang)}
                  >
                    <td className="py-3.5 px-4 text-left align-middle">
                      <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                        {row.cabang}
                        {row.cabang === executiveSummary?.topCabang?.name && (
                          <span className="text-[10px] px-2 py-0.5 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-full font-bold">🏆 TOP</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-600 mt-0.5">Sales & Outstanding Track</div>
                    </td>
                    <td className="py-3.5 px-4 border-l border-slate-200 align-middle">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 border border-slate-200 font-bold text-xs">
                        🏷️ {row.grup || '-'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 border-l border-slate-200 align-middle">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-100 text-purple-800 border border-purple-300 font-bold text-xs">
                        📦 {row.category}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 border-l border-slate-200 font-extrabold text-blue-700 text-base font-mono align-middle">
                      {row.sales.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3.5 px-4 border-l border-slate-200 font-extrabold text-rose-700 text-base font-mono align-middle">
                      {row.avg3.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3.5 px-4 border-l border-slate-200 font-black text-amber-600 text-base font-mono align-middle">
                      {row.kontribusi.toFixed(2)}%
                    </td>
                    <td className="py-3.5 px-4 border-l border-slate-200 text-xs align-middle">
                      <div className="font-mono text-cyan-700 font-bold">M: {row.m.toLocaleString('id-ID')}</div>
                      <div className="font-mono text-slate-700 mt-1">M-1: {row.m1.toLocaleString('id-ID')}</div>
                    </td>
                    <td className="py-3.5 px-4 border-l border-slate-200 text-xs align-middle">
                      <div className={`font-mono font-bold ${row.growthM >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        M vs AVG: {row.growthM >= 0 ? '▲ +' : '▼ '}{row.growthM.toFixed(1)}%
                      </div>
                      <div className={`font-mono font-bold mt-1 ${row.growthM1 >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        M-1 vs AVG: {row.growthM1 >= 0 ? '▲ +' : '▼ '}{row.growthM1.toFixed(1)}%
                      </div>
                    </td>
                    <td className="py-3.5 px-4 border-l border-slate-200 align-middle">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider inline-block ${
                        row.growthM >= 5 ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                        row.growthM <= -5 ? 'bg-rose-100 text-rose-800 border border-rose-300' :
                        'bg-blue-100 text-blue-800 border border-blue-300'
                      }`}>
                        {row.growthM >= 5 ? '🚀 PERTUMBUHAN POSITIF' : row.growthM <= -5 ? '📉 SALES MELAMBAT' : '⚖️ STABLE SALES'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* ─── ANALISIS TAMPILAN TAMBAHAN: GROUP BY CATEGORY INSENTIF & CABANG ─── */}
      {insentifAnalysis && insentifAnalysis.length > 0 && (
        <GlassCard className="p-6 border-purple-500/40 bg-gradient-to-b from-slate-900/95 via-purple-950/30 to-slate-950/95 shadow-2xl overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-4 mb-6 gap-3">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/40 uppercase tracking-widest mb-2 shadow-sm">
                <Award className="w-3.5 h-3.5" /> Analisis Tambahan • Group by Cabang & Category Insentif
              </div>
              <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2.5">
                <BarChart3 className="w-5 h-5 text-purple-400" />
                Performa Volume Sales per Category Insentif
              </h3>
              <p className="text-xs text-slate-300 mt-1">
                Pengelompokan riwayat penjualan dari <b>M sampai M-5</b> berdasarkan kombinasi <b>Cabang &amp; Kategori Insentif</b>.
              </p>
            </div>
          </div>

          {/* ─── INSIGHT PERFORMA INSENTIF ─── */}
          {insentifInsights && (
            <div className="mb-6 p-5 rounded-2xl bg-gradient-to-r from-purple-950/50 via-slate-900 to-slate-950 border border-purple-500/40 shadow-xl">
              <div className="flex items-center gap-2 text-purple-300 font-extrabold text-sm sm:text-base mb-3 border-b border-purple-500/20 pb-2.5">
                <Zap className="w-5 h-5 text-purple-400 animate-pulse" />
                <span>Insight Eksekutif: Performa Penjualan per Kategori Insentif</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
                  <div>
                    <span className="text-purple-700 font-extrabold uppercase tracking-wider text-[11px] flex items-center gap-1.5 mb-2">
                      <Award className="w-4 h-4 text-purple-600" /> Kontributor Insentif Utama (Tier Dominan)
                    </span>
                    {insentifInsights.topTier ? (
                      <div className="mt-2">
                        <div className="text-base font-black text-slate-900 flex items-center gap-2">
                          <span>💎 {insentifInsights.topTier.categoryInsentif}</span>
                          <span className="text-xs font-semibold text-slate-700">({insentifInsights.topTier.name})</span>
                        </div>
                        <div className="text-sm font-mono font-extrabold text-cyan-700 mt-1">
                          Total Volume Sales: {Math.round(insentifInsights.topTier.totalSales).toLocaleString('id-ID')} Unit
                        </div>
                        <p className="text-[11px] text-slate-800 mt-2 leading-relaxed">
                          Kombinasi ini merupakan motor penggerak utama volume penjualan insentif. Pastikan alokasi stok untuk kategori ini selalu menjadi prioritas di gudang cabang agar ritme pencapaian insentif tim sales terjaga.
                        </p>
                      </div>
                    ) : (
                      <span className="text-slate-600">Belum ada data insentif.</span>
                    )}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-500/30 flex flex-col justify-between">
                  <div>
                    <span className="text-purple-300 font-extrabold uppercase tracking-wider text-[11px] flex items-center gap-1.5 mb-2">
                      <BarChart3 className="w-4 h-4 text-purple-400" /> Penyumbang Terbesar (Kategori) per Tier
                    </span>
                    <div className="mt-2 space-y-3 max-h-40 overflow-y-auto pr-2">
                      {insentifInsights.topContributorsPerTier.map((tierData: any, idx: number) => (
                        <div key={idx} className="border-b border-purple-500/20 pb-2 last:border-0 last:pb-0">
                           <div className="text-purple-300 font-bold mb-1">{tierData.tier}</div>
                           <div className="space-y-1">
                              {tierData.contributors.map((c: any, cIdx: number) => (
                                 <div key={cIdx} className="flex justify-between text-[11px] text-slate-300">
                                    <span>- {c.name}</span>
                                    <span className="font-mono text-purple-200">{Math.round(c.sales).toLocaleString('id-ID')} Unit</span>
                                 </div>
                              ))}
                           </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-8">
            {/* Grafik Bar Category Insentif Stacked per Periode */}
            <div className="h-[400px] w-full bg-slate-50 p-5 rounded-2xl border border-slate-200 shadow-inner flex flex-col justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-purple-700 mb-2 text-center flex items-center justify-center gap-2">
                📊 Proporsi Volume Penjualan per Category Insentif (100% Stacked • Sumbu X: M s/d M-5)
              </h4>
              <div className="flex-1 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={insentifChartData.data} margin={{ top: 15, right: 20, left: 10, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                    <XAxis dataKey="period" stroke="#94a3b8" tick={{ fill: '#ffffff', fontSize: 14, fontWeight: 800 }} />
                    <YAxis domain={[0, 100]} stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 11 }} tickFormatter={(val) => `${Number(val)}%`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#a855f7', borderRadius: '12px', boxShadow: '0 15px 35px rgba(0,0,0,0.8)' }}
                      labelStyle={{ color: '#d8b4fe', fontWeight: 'bold', borderBottom: '1px solid #334155', paddingBottom: '4px' }}
                      formatter={(val: any, name: any, props: any) => {
                        const rawQty = props?.payload?.[`${name}_qty`] || 0;
                        return [`${Number(rawQty).toLocaleString('id-ID')} Unit (${Number(val).toFixed(1)}%)`, name];
                      }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '15px', fontSize: '12px', fontWeight: 'bold' }} />
                    {insentifChartData.categories.map((cat, idx) => (
                      <Bar key={cat} dataKey={cat} name={cat} stackId="insentif_stack" fill={COLORS[idx % COLORS.length]} maxBarSize={70}>
                        <LabelList
                          dataKey={cat}
                          position="center"
                          fill="#ffffff"
                          fontSize={11}
                          fontWeight="bold"
                          formatter={(val: any) => (Number(val) > 4 ? `${Math.round(Number(val))}%` : '')}
                        />
                      </Bar>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Tabel Ringkasan Insentif dengan M s/d M-5 */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200 max-h-[450px] overflow-y-auto bg-slate-50 shadow-lg">
              <table className="w-full text-left text-xs sm:text-sm border-collapse min-w-[1000px]">
                <thead className="bg-slate-50 text-slate-700 uppercase font-extrabold sticky top-0 z-20 shadow-md border-b border-slate-200">
                  <tr className="text-[11px] tracking-wider text-center">
                    <th className="py-3.5 px-4 text-left">Cabang / Grup / Kategori</th>
                    <th className="py-3.5 px-4 border-l border-slate-200 text-purple-700 text-left">Category Insentif</th>
                    <th className="py-3.5 px-3 border-l border-slate-200 text-cyan-700">M</th>
                    <th className="py-3.5 px-3 border-l border-slate-200 text-cyan-700">M-1</th>
                    <th className="py-3.5 px-3 border-l border-slate-200 text-cyan-700">M-2</th>
                    <th className="py-3.5 px-3 border-l border-slate-200 text-cyan-700">M-3</th>
                    <th className="py-3.5 px-3 border-l border-slate-200 text-cyan-700">M-4</th>
                    <th className="py-3.5 px-3 border-l border-slate-200 text-cyan-700">M-5</th>
                    <th className="py-3.5 px-4 border-l border-slate-200 bg-purple-100 text-purple-800 font-extrabold">📈 Total Sales Vol</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-800 text-center font-medium">
                  {insentifAnalysis.map((item) => {
                    const isAlert = item.ratio > 25;
                    return (
                      <tr key={item.key} className="hover:bg-slate-100 transition">
                        <td className="py-3 px-4 text-left font-extrabold text-slate-900 text-sm">
                          {item.name}
                        </td>
                        <td className="py-3 px-4 border-l border-slate-200 text-left font-extrabold text-purple-700 flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-tr from-purple-500 to-pink-400 shrink-0 shadow-sm shadow-purple-500/50" />
                          <span>{item.categoryInsentif}</span>
                        </td>
                        <td className="py-3 px-3 border-l border-slate-200 font-mono text-cyan-700 font-bold">
                          {Math.round(item.periods['M'] || 0).toLocaleString('id-ID')}
                        </td>
                        <td className="py-3 px-3 border-l border-slate-200 font-mono text-slate-700">
                          {Math.round(item.periods['M-1'] || 0).toLocaleString('id-ID')}
                        </td>
                        <td className="py-3 px-3 border-l border-slate-200 font-mono text-slate-700">
                          {Math.round(item.periods['M-2'] || 0).toLocaleString('id-ID')}
                        </td>
                        <td className="py-3 px-3 border-l border-slate-200 font-mono text-slate-600">
                          {Math.round(item.periods['M-3'] || 0).toLocaleString('id-ID')}
                        </td>
                        <td className="py-3 px-3 border-l border-slate-200 font-mono text-slate-600">
                          {Math.round(item.periods['M-4'] || 0).toLocaleString('id-ID')}
                        </td>
                        <td className="py-3 px-3 border-l border-slate-200 font-mono text-slate-600">
                          {Math.round(item.periods['M-5'] || 0).toLocaleString('id-ID')}
                        </td>
                        <td className="py-3 px-4 border-l border-slate-200 bg-purple-50 font-mono font-extrabold text-purple-800 text-sm">
                          {Math.round(item.totalSales).toLocaleString('id-ID')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </GlassCard>
      )}

      {/* ─── FULL DATA TABLE (SEMUA KOLOM RAW DATA DENGAN FILTER ALA EXCEL) ─── */}
      {parsed && parsed.headers && (
        <GlassCard className="p-6 border-slate-200 bg-white shadow-2xl overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-4 mb-6 gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
                  <BarChart3 className="w-5 h-5 text-emerald-400" />
                  Data Detail (Semua 32 Kolom Raw Data - Terintegrasi M-12 s/d M) ({displayedRawData.length} dari {filtered.length} baris)
                </h3>
                {Object.keys(rawColFilters).some(k => rawColFilters[k]?.search || (rawColFilters[k]?.selected && rawColFilters[k]?.selected.length > 0)) && (
                  <button
                    onClick={() => { setRawColFilters({}); toast.success('Semua filter kolom raw data dibersihkan!'); }}
                    className="px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Reset Filter Kolom
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Dilengkapi <b className="text-emerald-400">Filter Kolom ala Excel</b> (klik ikon filter di setiap header untuk cari & pilih data pada seluruh 32 kolom).
              </p>
            </div>
          </div>

          {/* Excel Filter Modal Popover for Raw Data */}
          {activeRawColModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 max-w-sm w-full shadow-2xl text-slate-800">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
                  <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <Filter className="w-4 h-4 text-emerald-400" /> Filter Kolom: <span className="text-emerald-400">{activeRawColModal}</span>
                  </h4>
                  <button onClick={() => setActiveRawColModal(null)} className="text-slate-600 hover:text-slate-900 transition">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-slate-600" />
                    <input
                      type="text"
                      value={rawModalSearchInput}
                      onChange={e => setRawModalSearchInput(e.target.value)}
                      placeholder={`Cari dalam ${activeRawColModal}...`}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                    {rawModalSearchInput && (
                      <button onClick={() => setRawModalSearchInput('')} className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-900 text-xs">
                        Hapus
                      </button>
                    )}
                  </div>

                  <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl bg-slate-50 p-2 space-y-1 text-xs">
                    <div className="text-[11px] font-semibold text-slate-600 mb-1 px-1 flex justify-between">
                      <span>Daftar Nilai Unik ({currentRawUniqueValues.length}):</span>
                    </div>
                    {currentRawUniqueValues.filter(val => !rawModalSearchInput || val.toLowerCase().includes(rawModalSearchInput.toLowerCase())).slice(0, 50).map((val, idx) => {
                      const isChecked = !rawColFilters[activeRawColModal]?.selected?.length || rawColFilters[activeRawColModal]?.selected?.includes(val);
                      return (
                        <label
                          key={idx}
                          className="flex items-center gap-2 py-1 px-2 rounded hover:bg-slate-100 cursor-pointer text-slate-700 truncate"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              const curSelected = rawColFilters[activeRawColModal]?.selected?.length ? [...(rawColFilters[activeRawColModal]?.selected || [])] : [...currentRawUniqueValues];
                              let nextSelected: string[];
                              if (curSelected.includes(val)) {
                                nextSelected = curSelected.filter(item => item !== val);
                              } else {
                                nextSelected = [...curSelected, val];
                              }
                              if (nextSelected.length === currentRawUniqueValues.length) {
                                nextSelected = [];
                              }
                              setRawColFilters({
                                ...rawColFilters,
                                [activeRawColModal]: { ...rawColFilters[activeRawColModal], selected: nextSelected }
                              });
                            }}
                            className="rounded border-slate-200 bg-white text-emerald-500 focus:ring-emerald-500/30"
                          />
                          <span className="truncate" title={val}>{val || '(Kosong)'}</span>
                        </label>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                    <button
                      onClick={() => {
                        const next = { ...rawColFilters };
                        delete next[activeRawColModal];
                        setRawColFilters(next);
                        setRawModalSearchInput('');
                        toast.success(`Filter kolom ${activeRawColModal} direset!`);
                      }}
                      className="flex-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-700 font-bold text-xs text-slate-700 hover:text-slate-900 transition"
                    >
                      Reset
                    </button>
                    <button
                      onClick={() => {
                        setRawColFilters({
                          ...rawColFilters,
                          [activeRawColModal]: { ...rawColFilters[activeRawColModal], search: rawModalSearchInput }
                        });
                        setActiveRawColModal(null);
                        toast.success('Filter diterapkan!');
                      }}
                      className="flex-1 py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 font-bold text-xs text-slate-950 transition shadow-lg shadow-emerald-500/20"
                    >
                      Terapkan
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-[600px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[1200px]">
              <thead className="bg-slate-50 text-slate-700 uppercase font-bold sticky top-0 z-20 shadow-md">
                <tr className="border-b border-slate-200 text-[10px] tracking-wider text-center">
                  {parsed.headers.map((h) => (
                    <th key={h} className="py-3 px-3 border-l border-slate-200 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 justify-between">
                        <span>{h}</span>
                        <button onClick={() => { setActiveRawColModal(h); setRawModalSearchInput(rawColFilters[h]?.search || ''); }} className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 transition"><Filter className="w-3.5 h-3.5 text-emerald-400" /></button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-700 text-center">
                {displayedRawData.slice(0, 100).map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-100 transition">
                    {parsed.headers.map((h) => {
                      const val = row[h];
                      return (
                        <td key={h} className="py-2.5 px-3 border-l border-slate-200 whitespace-nowrap">
                          {typeof val === 'number' ? val.toLocaleString('id-ID') : (val || '-')}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {displayedRawData.length > 100 && (
            <p className="text-xs text-slate-600 mt-4 italic">
              * Menampilkan 100 baris pertama dari total {displayedRawData.length} baris data (setelah filter)...
            </p>
          )}
        </GlassCard>
      )}
    </div>
  );
}
