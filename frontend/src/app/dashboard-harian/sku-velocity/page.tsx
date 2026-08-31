/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import LZString from 'lz-string';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { FileUploader } from '@/components/ui/FileUploader';
import { KPICard } from '@/components/ui/KPICard';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { TimestampBadge } from '@/components/ui/TimestampBadge';
import {
  ClipboardList, Download, Info, Package, BarChart3,
  Layers, Sparkles, FileSpreadsheet, Zap, CheckCircle2, TrendingUp, AlertTriangle, AlertOctagon, Rocket, Activity, HelpCircle, AlertCircle, Cloud } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, LineChart, Line, ComposedChart, ZAxis, Cell
} from 'recharts';
import { get, set } from 'idb-keyval';
import { supabase } from '@/lib/supabase';
import { parseDynamicCSV, ParsedData, sortBulans, normalizeGrupRegionColumns } from '@/lib/csvParser';
import { getStandardFilename } from '@/utils/export';
import { ExportHtmlButton } from '@/components/ui/ExportHtmlButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { ModuleExportConfig } from '@/utils/offlineExport';
import { formatNumberCompact } from '@/lib/utils';
import { buildMultiDimTrendData, MultiDimTrendChart, EMPTY_MULTI_DIM_TREND, TrendMetric } from '@/components/charts/MultiDimTrendChart';
import { PptxSlideSpec } from '@/utils/exportPptx';

// Utility formatters
const formatRp = (val: number) => `Rp ${val.toLocaleString('id-ID')}`;
const formatNum = (val: number) => val.toLocaleString('id-ID');

export default function SKUVelocityPage() {
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showHowTo, setShowHowTo] = useState<boolean>(false);

  // True the instant the user has loaded data locally (upload or "Generate
  // Demo"), synchronously — before any of that action's own async work runs.
  // Guards against the mount-time background fetch (Supabase "global" row,
  // then IndexedDB, then demo fallback) or a later realtime event resolving
  // AFTER the user's own upload and silently overwriting it with stale data
  // (the "upload Mei, dashboard shows Maret" bug: the background fetch was
  // still in flight when the upload finished, then won the race and clobbered it).
  const hasLocalDataRef = useRef(false);

  // "Export to PowerPoint" targets — every chart card on this page gets its
  // own ref so html2canvas can snapshot each one into its own deck slide.
  const scatterChartRef = useRef<HTMLDivElement>(null);
  const trendChartRef = useRef<HTMLDivElement>(null);
  const multiDimTrendRef = useRef<HTMLDivElement>(null);
  const groupTrendRef = useRef<HTMLDivElement>(null);

  // Filter states
  const [selectedCabang, setSelectedCabang] = useState<string[]>(['All']);
  const [selectedCategory, setSelectedCategory] = useState<string[]>(['All']);
  const [selectedStatus, setSelectedStatus] = useState<string[]>(['All']);
  const [selectedBulan, setSelectedBulan] = useState<string[]>(['All']);
  const [selectedGrup, setSelectedGrup] = useState<string[]>(['All']);
  const [selectedRegion, setSelectedRegion] = useState<string[]>(['All']);
  const [trendGrouping, setTrendGrouping] = useState<'Category' | 'Branch Name' | 'Status Product'>('Category');
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('Value');

  // Local filter states for Trend Analysis
  const [localCabang, setLocalCabang] = useState<string[]>(['All']);
  const [localCategory, setLocalCategory] = useState<string[]>(['All']);
  const [localStatus, setLocalStatus] = useState<string[]>(['All']);
  const [localBulan, setLocalBulan] = useState<string[]>(['All']);

  // Local filter + metric states for "Analisa Grup" (stacked bar, X-axis
  // toggle Grup/Cabang/Status Product, clustered by BULAN) — deliberately
  // independent from the Trend Multidimensi chart above.
  const [grupChartGrup, setGrupChartGrup] = useState<string[]>(['All']);
  const [grupChartCabang, setGrupChartCabang] = useState<string[]>(['All']);
  const [grupChartStatus, setGrupChartStatus] = useState<string[]>(['All']);
  const [grupChartBulan, setGrupChartBulan] = useState<string[]>(['All']);
  const [grupChartMetric, setGrupChartMetric] = useState<TrendMetric>('Value');
  const [grupChartXAxis, setGrupChartXAxis] = useState<'Grup' | 'Branch Name' | 'Status Product'>('Grup');

  // Filters for the "Kondisi Bulan Terakhir per Grup" table (Request 2).
  const [groupStatusRegion, setGroupStatusRegion] = useState<string[]>(['All']);
  const [groupStatusCabang, setGroupStatusCabang] = useState<string[]>(['All']);

  // Table & Chart Highlight state
  // Sorotan Matrix - array (not a single value) so users can highlight Dead
  // Stock and Rising Star together (excluding only Healthy), same multi-pick
  // pattern as every other filter on this page (Cabang/Category/Status/Bulan).
  const [activeHighlight, setActiveHighlight] = useState<string[]>(['All']);

  // Auto-select latest month when parsed data changes
  useEffect(() => {
    if (parsed && parsed.data) {
      const allBulans = Array.from(new Set(parsed.data.map(d => d['BULAN']))).filter(Boolean) as string[];
      if (allBulans.length > 0) {
        const sorted = sortBulans(allBulans);
        const latest = sorted[sorted.length - 1];
        setSelectedBulan([latest]);
      } else {
        setSelectedBulan(['All']);
      }
    }
  }, [parsed]);

  useEffect(() => {
    const fetchGlobalData = async () => {
      const { data, error } = await supabase
        .from('processed_results')
        .select('*')
        .eq('module', 'sku_velocity')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // The user may have uploaded their own file (or clicked "Generate Demo")
      // while this request was in flight — that local action always wins over
      // this background fetch, no matter which of it resolves last.
      if (hasLocalDataRef.current) return;

      if (!error && data && data.result_json) {
        let parsedData = JSON.parse(data.result_json);
        if (parsedData.compressed && parsedData.data) {
          const decompressed = LZString.decompressFromBase64(parsedData.data);
          if (decompressed) parsedData = JSON.parse(decompressed);
        }
        setParsed(parsedData);
      } else {
        get('last_sku_velocity_data').then(saved => {
          if (hasLocalDataRef.current) return;
          if (saved && saved.data && saved.data.length > 0) {
            setParsed(saved);
          } else {
            handleGenerateDemo();
          }
        }).catch(err => {
          if (hasLocalDataRef.current) return;
          console.warn('Failed to load state from IndexDB', err);
          handleGenerateDemo();
        });
      }
    };

    fetchGlobalData();

    const channel = supabase
      .channel('sku_velocity_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'processed_results', filter: "module=eq.sku_velocity" },
        (payload) => {
          // Don't let another user's save silently blow away this tab's own
          // unsaved local upload/demo data — same guard as the mount fetch above.
          if (hasLocalDataRef.current) return;
          const timestampStr = sessionStorage.getItem('last_processed_at_sku_velocity');
          if (payload.new && payload.new.result_json) {
            let parsedData = JSON.parse(payload.new.result_json);
            if (parsedData.compressed && parsedData.data) {
              const decompressed = LZString.decompressFromBase64(parsedData.data);
              if (decompressed) parsedData = JSON.parse(decompressed);
            }
            if (!timestampStr || parsedData.processed_at !== timestampStr) {
              setParsed(parsedData);
              toast.success('🔄 Pembaruan data dari pengguna lain diterima!', {
                icon: '🔄',
                style: { background: '#10B981', color: '#fff' },
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleSaveToGlobal = async () => {
    if (!parsed) {
      toast.error("Tidak ada data untuk disimpan.");
      return;
    }
    toast.loading('Menyimpan ke Global DB...', { id: 'save-global' });
    const timestamp = new Date().toISOString();
    const dataCopy = { ...parsed, processed_at: timestamp };
    sessionStorage.setItem('last_processed_at_sku_velocity', timestamp);
    const { error } = await supabase.from('processed_results').insert([{ module: 'sku_velocity', result_json: JSON.stringify({ compressed: true, data: LZString.compressToBase64(JSON.stringify(dataCopy)) }) }]);
    if (error) {
      toast.error('Gagal menyimpan ke Global DB', { id: 'save-global' });
    } else {
      toast.success('Berhasil disimpan ke Global DB!', { id: 'save-global' });
    }
  };

  const handleGenerateDemo = () => {
    hasLocalDataRef.current = true;
    const branches = ['Gudang JKT', 'Gudang SBY', 'Gudang MDN', 'Gudang BPN'];
    const branchRegionMap: Record<string, string> = {
      'Gudang JKT': 'Jabodetabek', 'Gudang SBY': 'Jawa Timur', 'Gudang MDN': 'Sumatera', 'Gudang BPN': 'Kalimantan'
    };
    const categories = ['Home Care', 'Personal Care', 'Food & Beverage', 'Electronics', 'Apparel'];
    const groups = ['Grup A', 'Grup B', 'Grup C'];
    const statuses = ['Active', 'Active', 'Active', 'Passive', 'New Item'];

    const headers = [
      'ItemCode', 'NAMA BARANG', 'Grup', 'Category', 'On Hand', 'Value',
      '4th', '3rd', '2nd', '1st', '0th', 'AVG SALES MONTH', 'DOI',
      'Status Product', 'Region', 'Branch Name', 'Last Income', 'Qty Receipt', 'CBM', 'BULAN'
    ];

    const data: any[] = [];
    let codeCounter = 1;
    const bulansList = ['Juni 2026', 'Juli 2026', 'Agustus 2026'];

    branches.forEach(branch => {
      categories.forEach((cat) => {
        for (let i = 0; i < 15; i++) {
          const itemCode = `ITM-${String(codeCounter).padStart(4, '0')}`;
          const name = `Produk ${cat} ${i + 1}`;
          const status = statuses[Math.floor(Math.random() * statuses.length)];
          const grup = groups[Math.floor(Math.random() * groups.length)];
          const region = branchRegionMap[branch] || 'Unknown';
          
          bulansList.forEach(bulanStr => {
            const rand = Math.random();
            let m4 = 0, m3 = 0, m2 = 0, m1 = 0, m0 = 0;
            let onHand = 0, cbm = 0, val = 0, receipt = 0;
            
            if (rand < 0.2) {
              // Dead stock scenario
              m4 = 100 + Math.random() * 50; m3 = 60 + Math.random() * 40;
              m2 = 30 + Math.random() * 20; m1 = 10 + Math.random() * 10;
              m0 = Math.random() * 5;
              onHand = 500 + Math.random() * 1000;
              cbm = 5 + Math.random() * 15;
              val = onHand * (50000 + Math.random() * 100000);
              receipt = 0;
            } else if (rand > 0.8) {
              // Rising star scenario
              m4 = 10 + Math.random() * 20; m3 = 30 + Math.random() * 20;
              m2 = 60 + Math.random() * 30; m1 = 120 + Math.random() * 50;
              m0 = 250 + Math.random() * 100;
              onHand = 50 + Math.random() * 150;
              cbm = 0.5 + Math.random() * 2;
              val = onHand * (20000 + Math.random() * 50000);
              receipt = Math.random() * 50;
            } else {
              // Normal scenario
              const base = 100 + Math.random() * 200;
              m4 = base * (0.8 + Math.random() * 0.4); m3 = base * (0.8 + Math.random() * 0.4);
              m2 = base * (0.8 + Math.random() * 0.4); m1 = base * (0.8 + Math.random() * 0.4);
              m0 = base * (0.8 + Math.random() * 0.4);
              onHand = base * 2 + Math.random() * base;
              cbm = 2 + Math.random() * 5;
              val = onHand * (30000 + Math.random() * 80000);
              receipt = base + Math.random() * base;
            }

            const avgSales = (m4 + m3 + m2 + m1 + m0) / 5;
            const doi = avgSales > 0 ? (onHand / avgSales) * 30 : 999;
            
            data.push({
              ItemCode: itemCode, 'NAMA BARANG': name, Grup: grup, Category: cat,
              'On Hand': Math.round(onHand), Value: Math.round(val),
              '4th': Math.round(m4), '3rd': Math.round(m3), '2nd': Math.round(m2), '1st': Math.round(m1), '0th': Math.round(m0),
              'AVG SALES MONTH': Math.round(avgSales), DOI: Math.round(doi),
              'Status Product': status, Region: region, 'Branch Name': branch, 'Last Income': '2026-08-01',
              'Qty Receipt': Math.round(receipt), CBM: Number(cbm.toFixed(2)), BULAN: bulanStr
            });
          });

          codeCounter++;
        }
      });
    });

    const demoData = {
      headers,
      targetColumns: headers.map((h, i) => ({ index: i, name: h })),
      data,
      processed_at: new Date().toISOString()
    };
    
    const timestamp = new Date().toISOString();
    demoData.processed_at = timestamp;
        
    
    setParsed(demoData);
    toast.success('Data Demo SKU Velocity Berhasil Dimuat!');
  };

  const handleDownloadTemplate = async () => {
    try {
      if (!parsed || !parsed.data) return;
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(parsed.data, { header: parsed.headers });
      XLSX.utils.book_append_sheet(wb, ws, "Raw Data");
      XLSX.writeFile(wb, "template_sku_velocity.xlsx");
      toast.success("Template Excel Berhasil Diunduh");
    } catch (err: any) {
      toast.error("Gagal mengunduh template: " + err.message);
    }
  };

  const handleFileUpload = async (file: File) => {
    hasLocalDataRef.current = true;
    setIsProcessing(true);
    toast.loading('Membaca file data SKU Velocity...', { id: 'upload' });
    try {
      const parsedData = normalizeGrupRegionColumns(await parseDynamicCSV(file));
      setParsed(parsedData);

      const uniqueBulans = sortBulans(Array.from(new Set(parsedData.data.map((d: any) => d['BULAN']))).filter(Boolean) as string[]);
      if (uniqueBulans.length > 0) {
        setSelectedBulan([uniqueBulans[uniqueBulans.length - 1]]);
      }

      const hasGrup = parsedData.data.some((d: any) => d['Grup']);
      const hasRegion = parsedData.data.some((d: any) => d['Region']);
      if (!hasGrup || !hasRegion) {
        const missing = [!hasGrup && 'Grup', !hasRegion && 'Region'].filter(Boolean).join(' & ');
        toast(`Kolom "${missing}" tidak ditemukan di file ini — chart/tabel Analisa Grup akan kosong sampai kolom itu ditambahkan.`, { icon: '⚠️', duration: 6000 });
      }
      
      try {
        await set('last_sku_velocity_data', parsedData);
      } catch (e) {
        console.warn('Data terlalu besar untuk IndexDB', e);
      }
      const timestamp = new Date().toISOString();
      parsedData.processed_at = timestamp;
            
      toast.success('File berhasil diproses!', { id: 'upload' });
    } catch (err: any) {
      toast.error(err.message || 'Gagal memproses file', { id: 'upload' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Filter Options
  const cabangs = useMemo(() => parsed ? ['All', ...Array.from(new Set(parsed.data.map(d => d['Branch Name']))).filter(Boolean).sort()] : [], [parsed]);
  const categories = useMemo(() => parsed ? ['All', ...Array.from(new Set(parsed.data.map(d => d['Category']))).filter(Boolean).sort()] : [], [parsed]);
  const statuses = useMemo(() => parsed ? ['All', ...Array.from(new Set(parsed.data.map(d => d['Status Product']))).filter(Boolean).sort()] : [], [parsed]);
  const bulans = useMemo(() => parsed ? ['All', ...sortBulans(Array.from(new Set(parsed.data.map(d => d['BULAN']))).filter(Boolean) as string[])] : [], [parsed]);
  const groupsList = useMemo(() => parsed ? ['All', ...Array.from(new Set(parsed.data.map(d => d['Grup']))).filter(Boolean).sort()] : [], [parsed]);
  const regionsList = useMemo(() => parsed ? ['All', ...Array.from(new Set(parsed.data.map(d => d['Region']))).filter(Boolean).sort()] : [], [parsed]);

  // Engine Classification Functions removed in favor of direct Status Product mapping

  // Processed Data
  const analyzedData = useMemo(() => {
    if (!parsed) return [];
    
    let result = parsed.data.filter(d =>
      (selectedBulan.includes('All') || selectedBulan.includes(d['BULAN'])) &&
      (selectedCabang.includes('All') || selectedCabang.includes(d['Branch Name'])) &&
      (selectedCategory.includes('All') || selectedCategory.includes(d['Category'])) &&
      (selectedStatus.includes('All') || selectedStatus.includes(d['Status Product'])) &&
      (selectedGrup.includes('All') || selectedGrup.includes(d['Grup'])) &&
      (selectedRegion.includes('All') || selectedRegion.includes(d['Region']))
    ).map(row => {
      let analysisStatus = '⚪ Healthy Stock';
      let action = 'Maintain Min/Max Level';
      let colorClass = 'bg-slate-100/50 text-slate-700';
      const rawStatus = (row['Status Product'] || '').toLowerCase();

      if (rawStatus === 'dead moving') {
        analysisStatus = '🔴 Kandidat Discontinue';
        action = 'Flash Sale / Bundling Promo';
        colorClass = 'bg-rose-100/80 text-rose-900 border border-rose-300';
      } else if (rawStatus === 'fast moving') {
        analysisStatus = '🟢 Fast Moving / Urgent';
        action = 'Expedite PO / Push Prod';
        colorClass = 'bg-emerald-100/80 text-emerald-900 border border-emerald-300';
      }

      return {
        ...row,
        analysisStatus,
        action,
        colorClass,
        trendStr: `${Math.round(row['4th']||0)} → ${Math.round(row['0th']||0)}`
      };
    });

    if (!activeHighlight.includes('All')) {
      result = result.filter(r =>
        (activeHighlight.includes('Kandidat Discontinue (Dead Stock)') && r.analysisStatus.includes('Discontinue')) ||
        (activeHighlight.includes('Fast Moving (Rising Star)') && r.analysisStatus.includes('Fast'))
      );
    }

    return result;
  }, [parsed, selectedBulan, selectedCabang, selectedCategory, selectedStatus, selectedGrup, selectedRegion, activeHighlight]);

  // Total universe of SKU rows matching the dimensional filters (Cabang/Category/
  // Status/Grup/Region), deliberately NOT scoped to a single BULAN. This is the
  // fix for the "9.037 vs 25.062" bug: the auto-selected latest-month default
  // (see the `useEffect` above) is a convenience for the month-scoped snapshot
  // cards below, not an implicit population filter for "Total Evaluated SKU".
  const totalEvaluatedData = useMemo(() => {
    if (!parsed) return [];
    return parsed.data.filter(d =>
      (selectedCabang.includes('All') || selectedCabang.includes(d['Branch Name'])) &&
      (selectedCategory.includes('All') || selectedCategory.includes(d['Category'])) &&
      (selectedStatus.includes('All') || selectedStatus.includes(d['Status Product'])) &&
      (selectedGrup.includes('All') || selectedGrup.includes(d['Grup'])) &&
      (selectedRegion.includes('All') || selectedRegion.includes(d['Region']))
    );
  }, [parsed, selectedCabang, selectedCategory, selectedStatus, selectedGrup, selectedRegion]);

  // Executive Summaries (Dead Stock / Rising Star snapshot filtered to LATEST MONTH ONLY;
  // Total Evaluated SKU is NOT — see `totalEvaluatedData` above)
  const executiveSummary = useMemo(() => {
    // 1. Determine the latest month
    const uniqueMonths = sortBulans(Array.from(new Set(analyzedData.map(r => r['BULAN']))).filter(Boolean) as string[]);
    const latestMonth = uniqueMonths.length > 0 ? uniqueMonths[uniqueMonths.length - 1] : null;

    // 2. Filter data for the latest month
    const latestData = latestMonth ? analyzedData.filter(r => r['BULAN'] === latestMonth) : analyzedData;

    let deadStockCount = 0, deadStockValue = 0, deadStockCBM = 0;
    let risingStarCount = 0, risingStarLostSalesVal = 0;
    
    // Detailed Maps for Insights
    const deadCatMap: Record<string, { val: number, doiAvg: number, count: number }> = {};
    const risingSKUMap: Record<string, { trendStr: string, doi: number, demand: number, name: string, value: number }> = {};

    latestData.forEach(r => {
      if (r.analysisStatus.includes('Discontinue')) {
        deadStockCount++;
        deadStockValue += (r['Value'] || 0);
        deadStockCBM += (r['CBM'] || 0);
        
        const cat = r['Category'];
        if (!deadCatMap[cat]) deadCatMap[cat] = { val: 0, doiAvg: 0, count: 0 };
        deadCatMap[cat].val += (r['Value'] || 0);
        deadCatMap[cat].doiAvg += (r['DOI'] || 0);
        deadCatMap[cat].count++;
      } else if (r.analysisStatus.includes('Fast')) {
        risingStarCount++;
        // Rough lost sales potential: If they run out in X days, they lose (30-X) days of average sales
        const doi = r['DOI'] || 0;
        const avg = r['AVG SALES MONTH'] || 0;
        if (doi < 30 && avg > 0) {
          const unitPrice = (r['Value'] || 0) / (r['On Hand'] || 1);
          risingStarLostSalesVal += ((30 - doi) / 30) * avg * unitPrice;
        }

        risingSKUMap[r['ItemCode']] = {
          name: r['NAMA BARANG'],
          trendStr: `+${Math.round((((r['0th']||0) - (r['1st']||0)) / (r['1st']||1)) * 100)}% vs bulan lalu`,
          doi: Number(r['DOI'] || 0),
          demand: r['0th'] || 0,
          value: r['Value'] || 0
        };
      }
    });

    const topDeadCats = Object.entries(deadCatMap)
      .map(([cat, data]) => ({ cat, val: data.val, doiAvg: Math.round(data.doiAvg / data.count) || 0 }))
      .sort((a, b) => b.val - a.val)
      .slice(0, 5);
      
    const topRisingSKUs = Object.values(risingSKUMap)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // Cross-Branch Rebalancing Logic
    const allLatestData = parsed && latestMonth ? parsed.data.filter(r => r['BULAN'] === latestMonth) : [];
    const itemMap: Record<string, { name: string, branches: Record<string, { status: string, value: number }> }> = {};
    
    allLatestData.forEach(r => {
      const code = r['ItemCode'];
      if (!code) return;
      if (!itemMap[code]) itemMap[code] = { name: r['NAMA BARANG'], branches: {} };
      itemMap[code].branches[r['Branch Name']] = {
        status: (r['Status Product'] || '').toLowerCase(),
        value: r['Value'] || 0
      };
    });

    const crossBranchOpps: Array<{ name: string, badBranches: string[], goodBranches: string[], trappedValue: number }> = [];

    Object.values(itemMap).forEach(item => {
      const badBranches: string[] = [];
      const goodBranches: string[] = [];
      let trappedValue = 0;
      
      Object.entries(item.branches).forEach(([bName, data]) => {
        if (data.status === 'dead moving' || data.status === 'slow moving') {
          badBranches.push(bName);
          trappedValue += data.value;
        } else if (data.status === 'fast moving') {
          goodBranches.push(bName);
        }
      });

      if (badBranches.length > 0 && goodBranches.length > 0) {
        crossBranchOpps.push({
          name: item.name,
          badBranches,
          goodBranches,
          trappedValue
        });
      }
    });

    const topCrossBranchOpps = crossBranchOpps.sort((a, b) => b.trappedValue - a.trappedValue).slice(0, 10);

    return {
      deadStockCount, deadStockValue, deadStockCBM,
      risingStarCount, risingStarLostSalesVal,
      topDeadCats, topRisingSKUs, topCrossBranchOpps,
      totalItems: totalEvaluatedData.length
    };
  }, [analyzedData, parsed, totalEvaluatedData]);

  // Scatter Plot Data (DOI vs AVG SALES)
  const scatterData = useMemo(() => {
    let targetData = analyzedData;
    
    // Performance optimization: Rendering 30k+ points in Recharts SVG hangs the browser
    if (targetData.length > 800) {
      const interesting = targetData.filter(r => r.analysisStatus !== '⚪ Healthy Stock');
      const normal = targetData.filter(r => r.analysisStatus === '⚪ Healthy Stock');
      
      if (interesting.length >= 800) {
        targetData = interesting.slice(0, 800);
      } else {
        targetData = [...interesting, ...normal.slice(0, 800 - interesting.length)];
      }
    }

    return targetData.map(r => ({
      id: r.ItemCode,
      name: r['NAMA BARANG'],
      category: r['Category'] || '-',
      cabang: r['Branch Name'] || '-',
      avgSales: r['AVG SALES MONTH'] || 0,
      doi: Math.min(r['DOI'] || 0, 365), // cap at 365 for visual clarity
      value: r['Value'] || 0,
      cbm: r['CBM'] || 0,
      status: r.analysisStatus,
      fill: r.analysisStatus.includes('Discontinue') ? '#f43f5e' : r.analysisStatus.includes('Fast') ? '#10b981' : '#94a3b8'
    }));
  }, [analyzedData]);

  // Aggregate Trend Line Data (comparing Dead vs Rising by BULAN)
  const trendData = useMemo(() => {
    if (!parsed) return [];
    
    const uniqueBulans = sortBulans(Array.from(new Set(parsed.data.map(d => d['BULAN']))).filter(Boolean) as string[]);
    
    return uniqueBulans.map(bulan => {
      let deadVol = 0;
      let risingVol = 0;

      let healthyVol = 0;

      

      parsed.data.filter(d =>

        d['BULAN'] === bulan &&

        (selectedCabang.includes('All') || selectedCabang.includes(d['Branch Name'])) &&

        (selectedCategory.includes('All') || selectedCategory.includes(d['Category'])) &&

        (selectedStatus.includes('All') || selectedStatus.includes(d['Status Product'])) &&

        (selectedGrup.includes('All') || selectedGrup.includes(d['Grup'])) &&

        (selectedRegion.includes('All') || selectedRegion.includes(d['Region']))

      ).forEach(r => {

        const rawStatus = (r['Status Product'] || '').toLowerCase();

        if (rawStatus === 'dead moving') deadVol += (r['Value'] || 0);

        else if (rawStatus === 'fast moving') risingVol += (r['Value'] || 0);

        else healthyVol += (r['Value'] || 0);

      });



      return {

        name: bulan,

        'Dead Stock Value': deadVol,

        'Fast Moving Value': risingVol,

        'Healthy Value': healthyVol

      };

    });

  }, [parsed, selectedCabang, selectedCategory, selectedStatus, selectedGrup, selectedRegion]);



  // Aggregate Multi-Dimensional Trend Data

  // Rows shared by every "Analisa Trend Multidimensi" chart on this page,
  // after the local Bulan/Cabang/Category/Status filters (each chart then
  // applies its own grouping dimension on top of this).
  const multiDimLocalFiltered = useMemo(() => {
    if (!parsed) return [];
    return parsed.data.filter(d =>
      (localBulan.includes('All') || localBulan.includes(d['BULAN'])) &&
      (localCabang.includes('All') || localCabang.includes(d['Branch Name'])) &&
      (localCategory.includes('All') || localCategory.includes(d['Category'])) &&
      (localStatus.includes('All') || localStatus.includes(d['Status Product']))
    );
  }, [parsed, localBulan, localCabang, localCategory, localStatus]);

  // Full, unfiltered month list — used where "latest month" must stay a
  // global concept (e.g. the "Kondisi Bulan Terakhir per Grup" table below),
  // independent of any chart's own local Bulan filter.
  const multiDimAllBulans = useMemo(
    () => parsed ? sortBulans(Array.from(new Set(parsed.data.map(d => d['BULAN']))).filter(Boolean) as string[]) : [],
    [parsed]
  );

  // X-axis ticks for "Analisa Trend Multidimensi" respect the local Bulan
  // filter (a month absent after filtering simply doesn't show a tick).
  const multiDimFilteredBulans = useMemo(
    () => sortBulans(Array.from(new Set(multiDimLocalFiltered.map(d => d['BULAN']))).filter(Boolean) as string[]),
    [multiDimLocalFiltered]
  );

  const multiDimensionalTrendData = useMemo(() => {
    if (!parsed) return EMPTY_MULTI_DIM_TREND;
    return buildMultiDimTrendData(multiDimLocalFiltered, trendGrouping, trendMetric, multiDimFilteredBulans, trendGrouping === 'Category');
  }, [parsed, multiDimLocalFiltered, multiDimFilteredBulans, trendGrouping, trendMetric]);

  // "Analisa Grup" — X-axis toggles between Grup / Cabang / Status Product
  // (grupChartXAxis), always clustered by BULAN (so each X-axis category
  // shows one stacked column per month), stacked by Status Product (Fast/
  // Medium/Slow/Dead Moving, whatever values the data actually has). Own
  // local filters (Grup/Cabang/Status Product/Bulan) + own metric toggle.
  const grupChartFiltered = useMemo(() => {
    if (!parsed) return [];
    return parsed.data.filter(d =>
      (grupChartBulan.includes('All') || grupChartBulan.includes(d['BULAN'])) &&
      (grupChartGrup.includes('All') || grupChartGrup.includes(d['Grup'])) &&
      (grupChartCabang.includes('All') || grupChartCabang.includes(d['Branch Name'])) &&
      (grupChartStatus.includes('All') || grupChartStatus.includes(d['Status Product']))
    );
  }, [parsed, grupChartBulan, grupChartGrup, grupChartCabang, grupChartStatus]);

  const allGrupNames = useMemo(() => groupsList.filter(g => g !== 'All'), [groupsList]);

  const grupChartAllXValues = useMemo(() => {
    if (grupChartXAxis === 'Branch Name') return cabangs.filter(c => c !== 'All');
    if (grupChartXAxis === 'Status Product') return statuses.filter(s => s !== 'All');
    return allGrupNames;
  }, [grupChartXAxis, allGrupNames, cabangs, statuses]);

  const groupTrendData = useMemo(() => {
    if (!parsed) return EMPTY_MULTI_DIM_TREND;
    return buildMultiDimTrendData(grupChartFiltered, 'BULAN', grupChartMetric, grupChartAllXValues, false, grupChartXAxis);
  }, [parsed, grupChartFiltered, grupChartAllXValues, grupChartMetric, grupChartXAxis]);

  // "Kondisi Bulan Terakhir per Grup" table — Grup x Status Product (Fast/
  // Medium/Slow/Dead Moving) breakdown in Rupiah for the latest month only,
  // each cell's % taken against the single grand total (all Grup x all
  // Status in that month, after the Region/Cabang filters below).
  const groupStatusLatestMonth = useMemo(
    () => multiDimAllBulans.length > 0 ? multiDimAllBulans[multiDimAllBulans.length - 1] : null,
    [multiDimAllBulans]
  );

  const groupStatusTable = useMemo(() => {
    if (!parsed || !groupStatusLatestMonth) return { rows: [] as { grup: string; cells: Record<string, number>; rowTotal: number }[], statusCols: [] as string[], grandTotal: 0 };

    const rows = parsed.data.filter(d =>
      d['BULAN'] === groupStatusLatestMonth &&
      (groupStatusRegion.includes('All') || groupStatusRegion.includes(d['Region'])) &&
      (groupStatusCabang.includes('All') || groupStatusCabang.includes(d['Branch Name']))
    );

    const map: Record<string, Record<string, number>> = {};
    const statusSet = new Set<string>();
    const groupSet = new Set<string>();
    let grandTotal = 0;

    rows.forEach(r => {
      const g = r['Grup'] || 'Unknown';
      const s = r['Status Product'] || 'Unknown';
      const val = r['Value'] || 0;
      groupSet.add(g);
      statusSet.add(s);
      if (!map[g]) map[g] = {};
      map[g][s] = (map[g][s] || 0) + val;
      grandTotal += val;
    });

    const statusCols = Array.from(statusSet).sort();
    const tableRows = Array.from(groupSet).sort().map(g => {
      const cells = map[g] || {};
      const rowTotal = statusCols.reduce((sum, s) => sum + (cells[s] || 0), 0);
      return { grup: g, cells, rowTotal };
    });

    return { rows: tableRows, statusCols, grandTotal };
  }, [parsed, groupStatusLatestMonth, groupStatusRegion, groupStatusCabang]);



  const trendInsights = useMemo(() => {

    if (!parsed || !parsed.data) return null;

    

    const branchMap: Record<string, number> = {};

    const catDeadMap: Record<string, number> = {};

    const catFastMap: Record<string, number> = {};

    

    parsed.data.forEach(d => {

      const cabang = d['Branch Name'] || 'Unknown';

      const cat = d['Category'] || 'Unknown';

      const status = (d['Status Product'] || '').toLowerCase();

      const val = d['Value'] || 0;

      

      if (status.includes('dead') || status.includes('slow')) {

        branchMap[cabang] = (branchMap[cabang] || 0) + val;

        catDeadMap[cat] = (catDeadMap[cat] || 0) + val;

      }

      

      if (status.includes('fast')) {

        catFastMap[cat] = (catFastMap[cat] || 0) + val;

      }

    });

    

    const worstBranch = Object.entries(branchMap).sort((a, b) => b[1] - a[1])[0];

    const worstCat = Object.entries(catDeadMap).sort((a, b) => b[1] - a[1])[0];

    const bestCat = Object.entries(catFastMap).sort((a, b) => b[1] - a[1])[0];

    

    return {

      worstBranch: worstBranch ? { name: worstBranch[0], val: worstBranch[1] } : null,

      worstCat: worstCat ? { name: worstCat[0], val: worstCat[1] } : null,

      bestCat: bestCat ? { name: bestCat[0], val: bestCat[1] } : null

    };

  }, [parsed]);





  // Builds the PPTX deck's slide list for this module: every chart/insight on
  // this page (Supply Chain Automated Insights, Cross-Branch Rebalancing,
  // scatter quadrant, trend line, both multi-dimensional trend charts, and
  // Kondisi Bulan Terakhir per Grup as a text-only conclusion), each paired
  // with a text insight built from the same executiveSummary/trendInsights
  // numbers already shown on screen. Raw-data tables stay Excel-only. Called
  // by the shared `ExportHtmlButton` (see `pptxSlides` prop below) so one
  // click downloads HTML/Excel and this .pptx deck together.
  const buildPptxSlides = (): PptxSlideSpec[] => {
    const filterLabel = [
      !selectedCabang.includes('All') ? `Cabang: ${selectedCabang.join(', ')}` : null,
      !selectedCategory.includes('All') ? `Kategori: ${selectedCategory.join(', ')}` : null,
      !selectedStatus.includes('All') ? `Status: ${selectedStatus.join(', ')}` : null,
      !selectedGrup.includes('All') ? `Grup: ${selectedGrup.join(', ')}` : null,
      !selectedRegion.includes('All') ? `Region: ${selectedRegion.join(', ')}` : null,
    ].filter(Boolean).join(' | ');
    const filterSuffix = filterLabel ? ` (${filterLabel})` : ' (Semua Data)';

    const trendInsightLines = [
      `Dead Stock Trapped Value: Rp ${executiveSummary.deadStockValue.toLocaleString('id-ID')} pada ${executiveSummary.deadStockCount} SKU, menyita ${executiveSummary.deadStockCBM.toFixed(1)} m3 kapasitas gudang.`,
      `Fast Moving Opportunities: ${executiveSummary.risingStarCount} SKU berpotensi kehilangan penjualan senilai Rp ${Math.round(executiveSummary.risingStarLostSalesVal).toLocaleString('id-ID')} bila stok habis (OOS).`,
      trendInsights?.worstBranch ? `Cabang perhatian ekstra: ${trendInsights.worstBranch.name} (Dead/Slow Value Rp ${trendInsights.worstBranch.val.toLocaleString('id-ID')}).` : null,
      trendInsights?.worstCat ? `Kategori rawan (dead stock terbesar): ${trendInsights.worstCat.name}.` : null,
      trendInsights?.bestCat ? `Top kategori fast moving: ${trendInsights.bestCat.name}.` : null,
      'Rekomendasi: prioritaskan rasionalisasi dead stock di cabang/kategori rawan, dan expedite replenishment untuk kategori fast moving agar tidak OOS.',
    ].filter(Boolean).join('\n');

    const scatterInsightLines = [
      `Dead Stock Trapped Value: Rp ${executiveSummary.deadStockValue.toLocaleString('id-ID')} pada ${executiveSummary.deadStockCount} SKU (kuadran merah, Kandidat Discontinue).`,
      `Fast Moving Opportunities: ${executiveSummary.risingStarCount} SKU pada kuadran hijau (Rising Star) berpotensi kehilangan penjualan senilai Rp ${Math.round(executiveSummary.risingStarLostSalesVal).toLocaleString('id-ID')} bila stok habis (OOS).`,
      'Sumbu X = rata-rata penjualan/bulan, sumbu Y = DOI (hari), ukuran gelembung = value tertahan.',
      'Rekomendasi: prioritaskan SKU di kuadran DOI tinggi & penjualan rendah untuk rasionalisasi stok.',
    ].filter(Boolean).join('\n');

    const multiDimInsightLines = [
      trendInsights?.worstBranch ? `Cabang perhatian ekstra: ${trendInsights.worstBranch.name} (Dead/Slow Value Rp ${trendInsights.worstBranch.val.toLocaleString('id-ID')}).` : null,
      trendInsights?.worstCat ? `Kategori rawan (dead stock terbesar): ${trendInsights.worstCat.name}.` : null,
      trendInsights?.bestCat ? `Top kategori fast moving: ${trendInsights.bestCat.name}.` : null,
      `Grafik menampilkan Top 5 ${trendGrouping} otomatis berdasarkan metrik ${trendMetric}.`,
      'Rekomendasi: gunakan tren per bulan ini untuk memantau pergeseran status produk antar kelompok dari waktu ke waktu.',
    ].filter(Boolean).join('\n');

    const groupInsightLines = [
      `Grafik menampilkan distribusi ${grupChartMetric === 'Qty' ? 'Qty (On Hand)' : grupChartMetric} per Status Product (Fast/Medium/Slow/Dead Moving), dikelompokkan berdasarkan ${grupChartXAxis === 'Branch Name' ? 'Cabang' : grupChartXAxis}.`,
      'Rekomendasi: bandingkan proporsi Dead/Slow Moving antar kelompok untuk menentukan prioritas rasionalisasi stok.',
    ].join('\n');

    // Text-only slide: "Supply Chain Automated Insights" card — Critical Dead
    // Stock + Peluang Cuan (Fast Moving) sub-panels have no chart of their own.
    const automatedInsightLines = [
      `Critical Dead Stock: ${formatRp(executiveSummary.deadStockValue)} modal kerja dan ${executiveSummary.deadStockCBM.toFixed(1)} m3 kapasitas gudang terperangkap pada ${executiveSummary.deadStockCount} SKU Dead Stock.`,
      ...executiveSummary.topDeadCats.slice(0, 5).map((c) => `Kategori mendesak: ${c.cat} (Tertahan: ${formatNumberCompact(c.val)} | Rata-rata DOI: >${c.doiAvg} Hari).`),
      'Saran Tindakan: pertimbangkan bundling promo atau diskon khusus untuk membebaskan modal dan ruang.',
      `Peluang Cuan (Fast Moving): ${executiveSummary.risingStarCount} SKU tren kenaikan penjualan ekstrem beruntun, stok (DOI) kritis di bawah 30 hari dan minim jadwal Receipt.`,
      ...executiveSummary.topRisingSKUs.slice(0, 5).map((s) => `SKU butuh percepatan replenishment: ${s.name} (Value: ${formatNumberCompact(s.value)}).`),
      'Saran Tindakan: expedite PO saat ini, amankan ketersediaan barang.',
    ].join('\n');

    // Text-only slide: "Cross-Branch Rebalancing Insight" sub-panel — pure
    // text/insight cards, no chart backs this section either.
    const rebalancingInsightLines = executiveSummary.topCrossBranchOpps.length > 0 ? [
      `Terdapat ${executiveSummary.topCrossBranchOpps.length} rekomendasi pemindahan stok (rebalancing) untuk SKU berstatus mati/lambat di satu cabang, namun Fast Moving di cabang lainnya.`,
      ...executiveSummary.topCrossBranchOpps.slice(0, 10).map((s) =>
        `${s.name} — Value Tertahan: ${formatNumberCompact(s.trappedValue)} | Dead/Slow di: ${s.badBranches.join(', ')} | Fast Moving di: ${s.goodBranches.join(', ')}.`
      ),
    ].join('\n') : null;

    // Text-only slide: "Kondisi Bulan Terakhir per Grup" — only the table's
    // conclusion goes into the deck, not the raw Grup x Status Product grid.
    const groupStatusInsightLines = groupStatusTable.rows.length > 0 ? (() => {
      const topGrup = [...groupStatusTable.rows].sort((a, b) => b.rowTotal - a.rowTotal)[0];
      const colTotals = groupStatusTable.statusCols.map((s) => ({
        status: s,
        total: groupStatusTable.rows.reduce((sum, r) => sum + (r.cells[s] || 0), 0),
      }));
      const topStatus = [...colTotals].sort((a, b) => b.total - a.total)[0];
      return [
        `Value (Rp) per Grup x Status Product untuk bulan terakhir${groupStatusLatestMonth ? ` (${groupStatusLatestMonth})` : ''}.`,
        `Grand Total seluruh Grup & Status: ${formatRp(groupStatusTable.grandTotal)}.`,
        topGrup ? `Grup dengan Value tertinggi: ${topGrup.grup} (${formatRp(topGrup.rowTotal)}, ${groupStatusTable.grandTotal > 0 ? ((topGrup.rowTotal / groupStatusTable.grandTotal) * 100).toFixed(1) : '0'}% dari Grand Total).` : null,
        topStatus ? `Status Product dengan kontribusi terbesar: ${topStatus.status} (${formatRp(topStatus.total)}, ${groupStatusTable.grandTotal > 0 ? ((topStatus.total / groupStatusTable.grandTotal) * 100).toFixed(1) : '0'}% dari Grand Total).` : null,
        'Rekomendasi: gunakan Grup dan Status Product dominan di atas sebagai prioritas rasionalisasi/replenishment bulan berjalan.',
      ].filter(Boolean).join('\n');
    })() : null;

    const slides: (PptxSlideSpec | null)[] = [
      {
        insightText: automatedInsightLines,
        slideTitle: `SKU Velocity - Supply Chain Automated Insights${filterSuffix}`,
      },
      rebalancingInsightLines ? {
        insightText: rebalancingInsightLines,
        slideTitle: `SKU Velocity - Cross-Branch Rebalancing Insight${filterSuffix}`,
      } : null,
      scatterChartRef.current ? {
        chartElement: scatterChartRef.current,
        insightText: scatterInsightLines,
        slideTitle: `SKU Velocity - Kuadran Analisis DOI vs Volume${filterSuffix}`,
      } : null,
      trendChartRef.current ? {
        chartElement: trendChartRef.current,
        insightText: trendInsightLines,
        slideTitle: `SKU Velocity - Tren Value${filterSuffix}`,
      } : null,
      multiDimTrendRef.current ? {
        chartElement: multiDimTrendRef.current,
        insightText: multiDimInsightLines,
        slideTitle: 'SKU Velocity - Analisa Trend Multidimensi',
      } : null,
      groupTrendRef.current ? {
        chartElement: groupTrendRef.current,
        insightText: groupInsightLines,
        slideTitle: 'SKU Velocity - Analisa Grup',
      } : null,
      groupStatusInsightLines ? {
        insightText: groupStatusInsightLines,
        slideTitle: 'SKU Velocity - Kondisi Bulan Terakhir per Grup',
      } : null,
    ];
    return slides.filter((s): s is PptxSlideSpec => s !== null);
  };

  const handleExport = () => {

    if (analyzedData.length === 0) return;

    const header = ['ItemCode', 'NAMA BARANG', 'Grup', 'Kategori', 'Cabang', 'Region', 'Tren (4th->0th)', 'DOI (Hari)', 'Value Tertahan (Rp)', 'Utilisasi Gudang (CBM)', 'Status Analisis', 'Rekomendasi Action'].map(h => `"${h}"`).join(',');

    const lines = [header];



    analyzedData.forEach(row => {

      const line = [

        `"${row.ItemCode}"`, `"${row['NAMA BARANG']}"`, `"${row.Grup || ''}"`, `"${row.Category}"`, `"${row['Branch Name']}"`, `"${row.Region || ''}"`,

        `"${row.trendStr}"`, row.DOI, row.Value, row.CBM,

        `"${row.analysisStatus}"`, `"${row.action}"`

      ].join(',');

      lines.push(line);

    });



    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });

    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');

    link.href = url;

    link.download = getStandardFilename(`SKU_Velocity_ActionPlan`, new Date().toISOString(), 'csv');

    link.click();

    URL.revokeObjectURL(url);

    toast.success('Action Plan Berhasil Diekspor!');

  };



  // ── Offline HTML export config: full analyzedData (already carries stable
  // field names regardless of upload) split into derived tables so KPI counts
  // can be recomputed live from whichever rows currently match the filters. ──
  const deadStockItems = useMemo(() => analyzedData.filter((r) => r.analysisStatus.includes('Discontinue')), [analyzedData]);
  const risingStarItems = useMemo(() => analyzedData.filter((r) => r.analysisStatus.includes('Fast')), [analyzedData]);

  // Re-filter UI options for the offline export must reflect only the values
  // present in analyzedData (the already-filtered/on-screen dataset), not the
  // full raw dataset, so the exported HTML's own filters never offer values
  // that aren't even present in the exported subset.
  const contextualBulanOptions = useMemo(
    () => sortBulans(Array.from(new Set<string>(analyzedData.map((d: any) => d['BULAN']))).filter(Boolean)),
    [analyzedData]
  );
  const contextualCabangOptions = useMemo(
    () => Array.from(new Set<string>(analyzedData.map((d: any) => d['Branch Name']))).filter(Boolean).sort(),
    [analyzedData]
  );
  const contextualCategoryOptions = useMemo(
    () => Array.from(new Set<string>(analyzedData.map((d: any) => d['Category']))).filter(Boolean).sort(),
    [analyzedData]
  );
  const contextualStatusOptions = useMemo(
    () => Array.from(new Set<string>(analyzedData.map((d: any) => d['Status Product']))).filter(Boolean).sort(),
    [analyzedData]
  );
  const contextualGrupOptions = useMemo(
    () => Array.from(new Set<string>(analyzedData.map((d: any) => d['Grup']))).filter(Boolean).sort(),
    [analyzedData]
  );
  const contextualRegionOptions = useMemo(
    () => Array.from(new Set<string>(analyzedData.map((d: any) => d['Region']))).filter(Boolean).sort(),
    [analyzedData]
  );
  const exportConfig: ModuleExportConfig | undefined = parsed ? {
    moduleName: 'SKU_Velocity_Insights',
    processedAt: parsed.processed_at,
    domElementId: 'export-container',
    filters: [
      { field: 'BULAN', label: 'Filter Bulan', options: contextualBulanOptions },
      { field: 'Branch Name', label: 'Filter Cabang', options: contextualCabangOptions },
      { field: 'Region', label: 'Filter Region', options: contextualRegionOptions },
      { field: 'Category', label: 'Filter Kategori', options: contextualCategoryOptions },
      { field: 'Grup', label: 'Filter Grup', options: contextualGrupOptions },
      { field: 'Status Product', label: 'Filter Status Product', options: contextualStatusOptions },
    ],
    tables: [
      {
        id: 'action_plan',
        title: 'Tabel Action Plan & Drill-Down',
        filterFields: ['BULAN', 'Branch Name', 'Region', 'Category', 'Grup', 'Status Product'],
        data: analyzedData,
        columns: [
          { key: 'ItemCode', label: 'Kode' },
          { key: 'NAMA BARANG', label: 'Nama Barang' },
          { key: 'Grup', label: 'Grup' },
          { key: 'Category', label: 'Kategori' },
          { key: 'Branch Name', label: 'Cabang' },
          { key: 'Region', label: 'Region' },
          { key: 'BULAN', label: 'Bulan' },
          { key: 'trendStr', label: 'Tren 4th→0th' },
          { key: 'DOI', label: 'DOI (Hari)', align: 'right', format: 'number' },
          { key: 'Value', label: 'Value Tertahan', align: 'right', format: 'number' },
          { key: 'CBM', label: 'CBM', align: 'right', format: 'number', decimals: 2 },
          { key: 'analysisStatus', label: 'Status Analisis' },
          { key: 'action', label: 'Rekomendasi Action' },
        ],
      },
      {
        id: 'dead_stock_items',
        title: 'Kandidat Discontinue (Dead Stock)',
        filterFields: ['BULAN', 'Branch Name', 'Region', 'Category', 'Grup', 'Status Product'],
        data: deadStockItems,
        emptyLabel: 'Tidak ada kandidat discontinue untuk filter yang dipilih.',
        columns: [
          { key: 'ItemCode', label: 'Kode' },
          { key: 'NAMA BARANG', label: 'Nama Barang' },
          { key: 'Branch Name', label: 'Cabang' },
          { key: 'DOI', label: 'DOI (Hari)', align: 'right', format: 'number' },
          { key: 'Value', label: 'Value Tertahan', align: 'right', format: 'number' },
        ],
      },
      {
        id: 'rising_star_items',
        title: 'Fast Moving / Rising Star',
        filterFields: ['BULAN', 'Branch Name', 'Region', 'Category', 'Grup', 'Status Product'],
        data: risingStarItems,
        emptyLabel: 'Tidak ada item fast moving untuk filter yang dipilih.',
        columns: [
          { key: 'ItemCode', label: 'Kode' },
          { key: 'NAMA BARANG', label: 'Nama Barang' },
          { key: 'Branch Name', label: 'Cabang' },
          { key: 'DOI', label: 'DOI (Hari)', align: 'right', format: 'number' },
          { key: 'Value', label: 'Value Tertahan', align: 'right', format: 'number' },
        ],
      },
      {
        id: 'total_evaluated_universe',
        title: 'Total Evaluated SKU (Universe)',
        hidden: true,
        filterFields: ['Branch Name', 'Region', 'Category', 'Grup', 'Status Product'],
        data: totalEvaluatedData,
        columns: [{ key: 'ItemCode', label: 'Kode' }],
      },
    ],
    kpis: [
      { id: 'dead_stock_value', label: 'Dead Stock Trapped Value', sourceTableId: 'dead_stock_items', field: 'Value', agg: 'sum', decimals: 0 },
      { id: 'dead_stock_count', label: 'Dead Stock SKU', sourceTableId: 'dead_stock_items', field: 'Value', agg: 'count', decimals: 0, suffix: ' SKU' },
      { id: 'rising_star_count', label: 'Fast Moving Opportunities', sourceTableId: 'rising_star_items', field: 'Value', agg: 'count', decimals: 0, suffix: ' SKU' },
      { id: 'total_evaluated', label: 'Total Evaluated SKU', sourceTableId: 'total_evaluated_universe', field: 'Value', agg: 'count', decimals: 0, suffix: ' SKU' },
    ],
  } : undefined;

  // ── Dual-export (HTML + Excel raw data terfilter) wiring ──
  // Excel raw source dari `analyzedData` (bukan `parsed.data` mentah) supaya
  // baris yang diekspor persis sama dengan yang sedang ditampilkan di layar —
  // sudah tunduk pada SEMUA filter aktif (bulan, cabang, category, status,
  // grup, region) DAN filter "Highlight" (Kandidat Discontinue / Fast
  // Moving), karena itu juga benar-benar menyembunyikan baris dari tampilan,
  // bukan cuma penekanan visual. Kolom hasil enrichment untuk analisis di
  // layar (analysisStatus, action, colorClass, trendStr) dibuang lagi supaya
  // Excel-nya berisi kolom mentah asli saja. Kolom cabang di halaman ini
  // fixed ('Branch Name'), bukan hasil deteksi dinamis seperti modul lain.
  const dualExportRawRows = useMemo(() => {
    if (analyzedData.length === 0) return undefined;
    return analyzedData.map(({ analysisStatus, action, colorClass, trendStr, ...rawRow }) => rawRow);
  }, [analyzedData]);

  return (

    <div id="export-container" className="space-y-8 pb-16 min-h-screen animate-fade-in text-foreground">

      {/* ─── HERO BANNER HEADER ─── */}
      <PageHeader
        icon={Activity}
        eyebrow="Dashboard Data Harian • SKU Velocity"
        title="SKU Velocity Analysis"
        highlight="(Dead Stock vs Fast Moving)"
        description="Modul analitik cerdas untuk membedah kinerja barang: mengidentifikasi item yang menyedot modal (Kandidat Discontinue) dan item yang berpotensi kehabisan stok di masa tren naik (Rising Star)."
        actions={
          <>
            <TimestampBadge timestamp={parsed?.processed_at} label="Olah Terakhir:" />
            {exportConfig
              ? <ExportHtmlButton
                  config={exportConfig}
                  moduleName="SKU_Velocity_Insights"
                  processedAt={parsed?.processed_at}
                  cabang={selectedCabang}
                  rawRows={dualExportRawRows}
                  cabangField="Branch Name"
                  pptxSlides={buildPptxSlides}
                  pptxModuleName="SKU_Velocity_Insights"
                />
              : <ExportHtmlButton elementId="export-container" moduleName="SKU_Velocity_Insights" processedAt={parsed?.processed_at} pptxSlides={buildPptxSlides} pptxModuleName="SKU_Velocity_Insights" />}
            <button
              onClick={() => setShowHowTo(!showHowTo)}
              className="no-export min-h-[44px] w-full sm:w-auto px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl text-xs sm:text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <HelpCircle className="w-4 h-4" />
              {showHowTo ? 'Tutup Panduan' : 'Panduan & Template'}
            </button>
          </>
        }
      />


      {showHowTo && (

        <GlassCard className="p-6 border-indigo-500/30 bg-white backdrop-blur-xl animate-fade-in">

          <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">

            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">

              <FileSpreadsheet className="w-5 h-5 text-indigo-500" /> Panduan Raw Data SKU Velocity

            </h3>

            <div className="flex flex-wrap gap-2">

              <button

                onClick={handleDownloadTemplate}

                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-indigo-600/20"

              >

                <Download className="w-4 h-4" /> Unduh Template CSV

              </button>

              <button

                onClick={handleGenerateDemo}

                className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-purple-500/20"

              >

                <Sparkles className="w-4 h-4" /> Gunakan Data Demo

              </button>
              <button
                onClick={handleSaveToGlobal}
                disabled={!parsed}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg"
              >
                <Cloud className="w-4 h-4" /> Simpan ke Global
              </button>

            </div>

          </div>

          <FileUploader

            onFileUpload={handleFileUpload}

            isLoading={isProcessing}

            label="Upload Data SKU Velocity (Excel/CSV)"

            description="File harus memuat kolom: ItemCode, NAMA BARANG, Category, On Hand, Value, 4th s/d 0th, AVG SALES MONTH, DOI, Qty Receipt, CBM."

          />

        </GlassCard>

      )}



      {/* EXECUTIVE SUMMARY KPI (frozen snapshot — a live, filterable copy is generated in the offline export section below) */}

      <div className="no-export grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">

        <div className="p-6 rounded-2xl bg-gradient-to-br from-rose-950/80 to-slate-900 border border-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.15)] relative overflow-hidden transition-all hover:scale-[1.02]">

          <div className="absolute top-4 right-4 w-12 h-12 rounded-full bg-rose-500/20 border border-rose-500/30 flex items-center justify-center">

            <AlertOctagon className="w-6 h-6 text-rose-400" />

          </div>

          <h3 className="text-sm font-extrabold text-rose-300 uppercase tracking-wider mb-2">Dead Stock Trapped Value</h3>

          <div className="text-3xl font-black text-white drop-shadow-md">{formatNumberCompact(executiveSummary.deadStockValue)}</div>

          <div className="mt-3 flex items-center gap-3 text-xs text-rose-200">

            <span className="font-mono bg-rose-900/50 px-2 py-1 rounded border border-rose-500/30">{executiveSummary.deadStockCount} SKU</span>

            <span>Menyita <b>{executiveSummary.deadStockCBM.toFixed(1)} m³</b> kapasitas gudang</span>

          </div>

        </div>



        <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-950/80 to-slate-900 border border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.15)] relative overflow-hidden transition-all hover:scale-[1.02]">

          <div className="absolute top-4 right-4 w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">

            <Rocket className="w-6 h-6 text-emerald-400" />

          </div>

          <h3 className="text-sm font-extrabold text-emerald-300 uppercase tracking-wider mb-2">Fast Moving Opportunities</h3>

          <div className="text-3xl font-black text-white drop-shadow-md">{executiveSummary.risingStarCount} SKU</div>

          <div className="mt-3 flex items-center gap-3 text-xs text-emerald-200">

            <span>Potensi Loss: <b>{formatNumberCompact(executiveSummary.risingStarLostSalesVal)}</b> bila OOS</span>

          </div>

        </div>

        

        <div className="p-6 rounded-2xl bg-gradient-to-br from-indigo-950/80 to-slate-900 border border-indigo-500/50 shadow-[0_0_20px_rgba(99,102,241,0.15)] relative overflow-hidden transition-all hover:scale-[1.02]">

          <div className="absolute top-4 right-4 w-12 h-12 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">

            <CheckCircle2 className="w-6 h-6 text-indigo-400" />

          </div>

          <h3 className="text-sm font-extrabold text-indigo-300 uppercase tracking-wider mb-2">Total Evaluated SKU</h3>

          <div className="text-3xl font-black text-white drop-shadow-md">{executiveSummary.totalItems}</div>

          <div className="mt-3 flex items-center gap-3 text-xs text-indigo-200">

            <span>Data SKU tervalidasi siap untuk pengambilan keputusan.</span>

          </div>

        </div>

      </div>



      {/* AUTOMATED INSIGHTS NARRATIVE */}

      <GlassCard className="p-6 border-indigo-500/40 bg-gradient-to-br from-slate-900 to-slate-800 shadow-2xl">

        <h2 className="text-xl font-black text-white flex items-center gap-2 mb-4 border-b border-slate-700 pb-3">

          <Sparkles className="w-6 h-6 text-amber-400 animate-pulse" /> Supply Chain Automated Insights

        </h2>

        

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          <div className="bg-slate-900 p-4 rounded-xl border border-rose-500/50 shadow-inner">

            <h4 className="text-rose-400 font-bold mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4"/> Critical Dead Stock Insight</h4>

            <p className="text-sm text-slate-300 mb-3 leading-relaxed">

              Saat ini terdapat <b>{formatRp(executiveSummary.deadStockValue)}</b> modal kerja dan <b>{executiveSummary.deadStockCBM.toFixed(1)} m³</b> kapasitas gudang yang terperangkap pada <b>{executiveSummary.deadStockCount} SKU Dead Stock</b>.

            </p>

            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Top 5 Kategori Mendesak (Rasionalisasi):</p>

            <ul className="text-xs text-slate-300 space-y-1.5 list-disc pl-4">

              {executiveSummary.topDeadCats.map((c, i) => (

                <li key={i}>

                  <span className="text-rose-300 font-semibold">{c.cat}</span> (Tertahan: {formatNumberCompact(c.val)} | Rata-rata DOI: &gt;{c.doiAvg} Hari)

                </li>

              ))}

            </ul>

            <div className="mt-4 px-3 py-2 bg-rose-500/20 rounded-lg border border-rose-500/50 text-xs text-rose-100 font-medium">

              <b>Saran Tindakan:</b> Pertimbangkan bundling promo atau diskon khusus untuk membebaskan modal dan ruang.

            </div>

          </div>



          <div className="bg-slate-900 p-4 rounded-xl border border-emerald-500/50 shadow-inner">

            <h4 className="text-emerald-400 font-bold mb-2 flex items-center gap-2"><Rocket className="w-4 h-4"/> Peluang Cuan (Fast Moving)</h4>

            <p className="text-sm text-slate-300 mb-3 leading-relaxed">

              Terdapat <b>{executiveSummary.risingStarCount} SKU</b> yang menunjukkan tren kenaikan penjualan ekstrem beruntun, namun stoknya (DOI) kritis di bawah 30 hari dan minim jadwal penerimaan (Receipt).

            </p>

            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Top 5 SKU Butuh Percepatan Replenishment:</p>

            <ul className="text-xs text-slate-300 space-y-1.5 list-disc pl-4">

              {executiveSummary.topRisingSKUs.map((s, i) => (

                <li key={i}>

                  <span className="text-emerald-300 font-semibold">{s.name}</span> (Value: {formatNumberCompact(s.value)})

                </li>

              ))}

            </ul>

            <div className="mt-4 px-3 py-2 bg-emerald-500/20 rounded-lg border border-emerald-500/50 text-xs text-emerald-100 font-medium">

              <b>Saran Tindakan:</b> Expedite PO saat ini, amankan ketersediaan barang.

            </div>

          </div>

        </div>



        {executiveSummary.topCrossBranchOpps.length > 0 && (

          <div className="mt-4 bg-slate-900 p-4 rounded-xl border border-indigo-500/50 shadow-inner">

            <h4 className="text-indigo-400 font-bold mb-2 flex items-center gap-2">🔄 Cross-Branch Rebalancing Insight</h4>

            <p className="text-sm text-slate-300 mb-3 leading-relaxed">

              Terdapat <b>{executiveSummary.topCrossBranchOpps.length} rekomendasi pemindahan stok</b> (rebalancing) untuk SKU yang berstatus mati/lambat di satu cabang, namun tergolong <b>Fast Moving</b> di cabang lainnya.

            </p>

            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Top 10 SKU Rekomendasi Rebalancing (Berdasarkan Value Tertahan):</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">

              {executiveSummary.topCrossBranchOpps.map((s, i) => (

                <div key={i} className="bg-slate-800/50 p-3 rounded border border-slate-700/50">

                  <div className="text-indigo-300 font-semibold mb-1 text-sm">{s.name}</div>

                  <div className="text-xs text-slate-300 mb-1">Total Value Tertahan: <b>{formatNumberCompact(s.trappedValue)}</b></div>

                  <div className="text-xs text-slate-400">

                    <span className="text-rose-400">Dead/Slow di:</span> {s.badBranches.join(', ')}<br/>

                    <span className="text-emerald-400">Fast Moving di:</span> {s.goodBranches.join(', ')}

                  </div>

                </div>

              ))}

            </div>

          </div>

        )}

      </GlassCard>



      {/* FILTER CONTROLS */}

      <GlassCard allowOverflow={true} className="p-6 border-slate-200 bg-white shadow-xl relative z-40 no-export">

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">

          <div className="space-y-2">

            <label className="text-xs font-bold text-slate-700 block uppercase">📅 Bulan:</label>

            <MultiSelect options={bulans} selected={selectedBulan} onChange={setSelectedBulan} selectAllLabel="Semua Bulan" placeholder="Pilih Bulan..." />

          </div>

          <div className="space-y-2">

            <label className="text-xs font-bold text-slate-700 block uppercase">🏢 Cabang:</label>

            <MultiSelect options={cabangs} selected={selectedCabang} onChange={setSelectedCabang} selectAllLabel="Semua Cabang" placeholder="Pilih Cabang..." />

          </div>

          <div className="space-y-2">

            <label className="text-xs font-bold text-slate-700 block uppercase">🌍 Region:</label>

            <MultiSelect options={regionsList} selected={selectedRegion} onChange={setSelectedRegion} selectAllLabel="Semua Region" placeholder="Pilih Region..." />

          </div>

          <div className="space-y-2">

            <label className="text-xs font-bold text-slate-700 block uppercase">📦 Kategori:</label>

            <MultiSelect options={categories} selected={selectedCategory} onChange={setSelectedCategory} selectAllLabel="Semua Kategori" placeholder="Pilih Kategori..." />

          </div>

          <div className="space-y-2">

            <label className="text-xs font-bold text-slate-700 block uppercase">🧩 Grup:</label>

            <MultiSelect options={groupsList} selected={selectedGrup} onChange={setSelectedGrup} selectAllLabel="Semua Grup" placeholder="Pilih Grup..." />

          </div>

          <div className="space-y-2">

            <label className="text-xs font-bold text-slate-700 block uppercase">🔖 Status Product:</label>

            <MultiSelect options={statuses} selected={selectedStatus} onChange={setSelectedStatus} selectAllLabel="Semua Status" placeholder="Pilih Status..." />

          </div>

          <div className="space-y-2">

            <label className="text-xs font-bold text-slate-700 block uppercase">🎯 Sorotan Matrix:</label>

            <MultiSelect
              options={['All', 'Kandidat Discontinue (Dead Stock)', 'Fast Moving (Rising Star)']}
              selected={activeHighlight}
              onChange={setActiveHighlight}
              selectAllLabel="Lihat Semua SKU"
              placeholder="Pilih Sorotan..."
            />

          </div>

        </div>

      </GlassCard>



      {/* VISUALIZATION QUADRANTS */}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Scatter Plot */}

        <GlassCard className="p-6 border-indigo-200 bg-white shadow-2xl">

          <h3 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">

            <BarChart3 className="w-5 h-5 text-indigo-500" /> Kuadran Analisis (DOI vs Volume Penjualan)

          </h3>

          <p className="text-xs text-slate-600 mb-4">

            Ukuran gelembung mewakili <b>Total Value Tertahan</b>. Merah = Discontinue, Hijau = Fast Moving.

          </p>

          <div ref={scatterChartRef} className="h-[400px] w-full bg-slate-50 rounded-xl p-2 border border-slate-200">

            <ResponsiveContainer width="100%" height="100%">

              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>

                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.6} />

                <XAxis type="number" dataKey="avgSales" name="Rata-rata Penjualan" stroke="#475569" tick={{ fill: '#1e293b', fontSize: 11 }} tickFormatter={formatNum} label={{ value: 'Rata-rata Penjualan/Bulan', position: 'insideBottom', fill: '#334155', fontSize: 11, offset: -10 }} />

                <YAxis type="number" dataKey="doi" name="DOI (Hari)" stroke="#475569" tick={{ fill: '#1e293b', fontSize: 11 }} label={{ value: 'Days of Inventory (DOI)', angle: -90, position: 'insideLeft', fill: '#334155', fontSize: 11 }} />

                <ZAxis type="number" dataKey="value" range={[50, 600]} name="Value Tertahan" />

                <Tooltip

                  cursor={{ strokeDasharray: '3 3' }}

                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#3b82f6', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}

                  formatter={(value: any, name: any) => name === 'Value Tertahan' ? formatRp(value) : formatNum(value)}

                  labelFormatter={() => ''}

                  content={({ active, payload }: any) => {

                    if (active && payload && payload.length) {

                      const data = payload[0].payload;

                      return (

                        <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-xl">

                          <p className="text-slate-900 font-bold mb-1 border-b border-slate-200 pb-1">{data.name}</p>

                          <p className="text-xs text-slate-700">Status: <span style={{color: data.fill}} className="font-bold">{data.status}</span></p>

                          <p className="text-xs text-slate-700">Category: <span className="font-semibold">{data.category}</span></p>

                          <p className="text-xs text-slate-700">Cabang: <span className="font-semibold">{data.cabang}</span></p>

                          <p className="text-xs text-slate-700">Avg Sales: {formatNum(data.avgSales)}</p>

                          <p className="text-xs text-slate-700">DOI: {data.doi} Hari</p>

                          <p className="text-xs text-slate-700">Value: {formatRp(data.value)}</p>

                        </div>

                      );

                    }

                    return null;

                  }}

                />

                <Scatter data={scatterData} opacity={0.8}>

                  {scatterData.map((entry, index) => (

                    <Cell key={`cell-${index}`} fill={entry.fill} />

                  ))}

                </Scatter>

              </ScatterChart>

            </ResponsiveContainer>

          </div>

        </GlassCard>



        {/* Trend Line Chart */}

        <GlassCard className="p-6 border-indigo-200 bg-white shadow-2xl">

          <div className="flex items-start justify-between gap-3 mb-2">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-purple-500" /> Tren Nilai Persediaan
            </h3>
          </div>

          <p className="text-xs text-slate-600 mb-4">

            Perbandingan total nilai (Value) pergerakan antar klasifikasi matriks berdasar kelompok bulan.

          </p>

          <div ref={trendChartRef} className="h-[400px] w-full bg-slate-50 rounded-xl p-2 border border-slate-200">

            <ResponsiveContainer width="100%" height="100%">

              <LineChart data={trendData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>

                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.6} />

                <XAxis dataKey="name" stroke="#475569" tick={{ fill: '#1e293b', fontSize: 12, fontWeight: 600 }} />

                <YAxis stroke="#475569" tick={{ fill: '#1e293b', fontSize: 11 }} tickFormatter={(val) => formatNumberCompact(val)} width={60} />

                <Tooltip

                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#6366f1', borderRadius: '12px' }}

                  formatter={(val: any) => [formatRp(val), undefined]}

                />

                <Legend wrapperStyle={{ paddingTop: '10px', color: '#1e293b' }} />

                <Line type="monotone" dataKey="Dead Stock Value" stroke="#f43f5e" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />

                <Line type="monotone" dataKey="Fast Moving Value" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />

                <Line type="monotone" dataKey="Healthy Value" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} />

              </LineChart>

            </ResponsiveContainer>

          </div>

        </GlassCard>

      </div>



      {/* TREND ANALISIS MULTIDIMENSI */}
      <GlassCard className="p-6 border-slate-200 bg-white shadow-2xl overflow-hidden mt-8">
        <div className="flex flex-col xl:flex-row xl:items-start justify-between border-b border-slate-200 pb-4 mb-6 gap-6">
          <div className="flex-1">
            <h3 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
              <Layers className="w-6 h-6 text-indigo-500" />
              Analisa Trend Multidimensi
            </h3>
            <p className="text-xs text-slate-500 mt-1 mb-4">Grafik pergerakan per bulan. Menampilkan maksimal Top 5 secara otomatis.</p>
            
            {/* Filter Lokal */}
            <div className="flex flex-wrap gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 no-export">

              <MultiSelect options={bulans} selected={localBulan} onChange={setLocalBulan} placeholder="Semua Bulan" />
              <MultiSelect options={cabangs} selected={localCabang} onChange={setLocalCabang} placeholder="Semua Cabang" />
              <MultiSelect options={categories} selected={localCategory} onChange={setLocalCategory} placeholder="Semua Kategori" />
              <MultiSelect options={statuses} selected={localStatus} onChange={setLocalStatus} placeholder="Semua Status" />
            </div>
            
            {/* Insights */}
            {trendInsights && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <div className="bg-red-50 p-4 rounded-xl border border-red-100 flex items-start gap-3">
                  <div className="p-2 bg-red-100 rounded-lg text-red-600"><AlertTriangle className="w-5 h-5" /></div>
                  <div>
                    <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mb-0.5">Cabang Perhatian Ekstra</p>
                    <p className="text-sm font-black text-slate-800">{trendInsights.worstBranch?.name}</p>
                    <p className="text-xs text-slate-500 mt-1">Dead/Slow Value: <span className="font-semibold text-red-600">Rp {formatNumberCompact(trendInsights.worstBranch?.val || 0)}</span></p>
                  </div>
                </div>
                <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 flex items-start gap-3">
                  <div className="p-2 bg-orange-100 rounded-lg text-orange-600"><AlertCircle className="w-5 h-5" /></div>
                  <div>
                    <p className="text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-0.5">Kategori Rawan (Dead)</p>
                    <p className="text-sm font-black text-slate-800">{trendInsights.worstCat?.name}</p>
                    <p className="text-xs text-slate-500 mt-1">Dead/Slow Value: <span className="font-semibold text-orange-600">Rp {formatNumberCompact(trendInsights.worstCat?.val || 0)}</span></p>
                  </div>
                </div>
                <div className="bg-green-50 p-4 rounded-xl border border-green-100 flex items-start gap-3">
                  <div className="p-2 bg-green-100 rounded-lg text-green-600"><TrendingUp className="w-5 h-5" /></div>
                  <div>
                    <p className="text-[10px] font-bold text-green-500 uppercase tracking-wider mb-0.5">Top Kategori Fast Moving</p>
                    <p className="text-sm font-black text-slate-800">{trendInsights.bestCat?.name}</p>
                    <p className="text-xs text-slate-500 mt-1">Fast Moving Value: <span className="font-semibold text-green-600">Rp {formatNumberCompact(trendInsights.bestCat?.val || 0)}</span></p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 items-end">
            <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 self-stretch sm:self-auto justify-center">
              {['Value', 'CBM', 'Qty'].map(opt => (
                <button
                  key={opt}
                  onClick={() => setTrendMetric(opt as any)}
                  className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${trendMetric === opt ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {opt === 'Qty' ? 'Qty (On Hand)' : opt}
                </button>
              ))}
            </div>
            <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 self-stretch sm:self-auto justify-center">
              {['Category', 'Branch Name', 'Status Product'].map(opt => (
                <button
                  key={opt}
                  onClick={() => setTrendGrouping(opt as any)}
                  className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${trendGrouping === opt ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {opt === 'Branch Name' ? 'Cabang' : opt}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div ref={multiDimTrendRef}>
          <MultiDimTrendChart trendData={multiDimensionalTrendData} trendMetric={trendMetric} />
        </div>
      </GlassCard>

      {/* ANALISA GRUP — sumbu X toggle Grup/Cabang/Status Product, satu stacked column per bulan, distack oleh Status Product (Fast/Medium/Slow/Dead Moving) */}
      <GlassCard className="p-6 border-slate-200 bg-white shadow-2xl overflow-hidden mt-8">
        <div className="flex flex-col xl:flex-row xl:items-start justify-between border-b border-slate-200 pb-4 mb-6 gap-6">
          <div className="flex-1">
            <h3 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
              <Layers className="w-6 h-6 text-indigo-500" />
              Analisa Grup
            </h3>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Sumbu X: <b>{grupChartXAxis === 'Branch Name' ? 'Cabang' : grupChartXAxis}</b>. Setiap kategori punya satu kolom stacked per bulan, menampilkan proporsi {grupChartMetric === 'Qty' ? 'Qty (On Hand)' : grupChartMetric} per Status Product (Fast/Medium/Slow/Dead Moving).
            </p>

            {/* Filter Lokal — independen dari filter "Analisa Trend Multidimensi" */}
            <div className="flex flex-wrap gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 no-export">
              <MultiSelect options={bulans} selected={grupChartBulan} onChange={setGrupChartBulan} placeholder="Semua Bulan" />
              <MultiSelect options={groupsList} selected={grupChartGrup} onChange={setGrupChartGrup} placeholder="Semua Grup" />
              <MultiSelect options={cabangs} selected={grupChartCabang} onChange={setGrupChartCabang} placeholder="Semua Cabang" />
              <MultiSelect options={statuses} selected={grupChartStatus} onChange={setGrupChartStatus} placeholder="Semua Status" />
            </div>
          </div>

          <div className="flex flex-col gap-3 items-end">
            <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 self-stretch sm:self-auto justify-center">
              {(['Value', 'CBM', 'Qty'] as TrendMetric[]).map(opt => (
                <button
                  key={opt}
                  onClick={() => setGrupChartMetric(opt)}
                  className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${grupChartMetric === opt ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {opt === 'Qty' ? 'Qty (On Hand)' : opt}
                </button>
              ))}
            </div>
            <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 self-stretch sm:self-auto justify-center">
              {(['Grup', 'Branch Name', 'Status Product'] as const).map(opt => (
                <button
                  key={opt}
                  onClick={() => setGrupChartXAxis(opt)}
                  className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${grupChartXAxis === opt ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {opt === 'Branch Name' ? 'Cabang' : opt}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div ref={groupTrendRef}>
          {grupChartAllXValues.length === 0 ? (
            <div className="h-[200px] flex flex-col items-center justify-center text-center gap-1 border border-dashed border-amber-300 bg-amber-50 rounded-xl">
              <p className="text-sm font-bold text-amber-700">Kolom &quot;{grupChartXAxis === 'Branch Name' ? 'Branch Name' : grupChartXAxis}&quot; tidak ditemukan di data yang diupload</p>
              <p className="text-xs text-amber-600 max-w-md">Tambahkan kolom bernama <b>{grupChartXAxis === 'Branch Name' ? 'Branch Name' : grupChartXAxis}</b> pada file sumber Anda (Excel/CSV), lalu upload ulang agar chart ini terisi.</p>
            </div>
          ) : (
            <MultiDimTrendChart trendData={groupTrendData} trendMetric={grupChartMetric} />
          )}
        </div>
      </GlassCard>

      {/* KONDISI BULAN TERAKHIR PER GRUP — Grup x Status Product breakdown (Rp + % grand total), filter Region/Cabang */}
      <GlassCard className="p-6 border-slate-200 bg-white shadow-2xl overflow-hidden mt-8">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between border-b border-slate-200 pb-4 mb-6 gap-4">
          <div className="flex-1">
            <h3 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
              <ClipboardList className="w-6 h-6 text-indigo-500" />
              Kondisi Bulan Terakhir per Grup
            </h3>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Value (Rp) per Grup × Status Product untuk bulan terakhir{groupStatusLatestMonth ? <> (<b>{groupStatusLatestMonth}</b>)</> : ''}. Persentase dihitung terhadap Grand Total keseluruhan (semua Grup, semua Status, sesuai filter di bawah).
            </p>
            <div className="flex flex-wrap gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 no-export">
              <MultiSelect options={regionsList} selected={groupStatusRegion} onChange={setGroupStatusRegion} placeholder="Semua Region" />
              <MultiSelect options={cabangs} selected={groupStatusCabang} onChange={setGroupStatusCabang} placeholder="Semua Cabang" />
            </div>
          </div>
        </div>

        {allGrupNames.length === 0 ? (
          <div className="py-10 flex flex-col items-center justify-center text-center gap-1 border border-dashed border-amber-300 bg-amber-50 rounded-xl">
            <p className="text-sm font-bold text-amber-700">Kolom &quot;Grup&quot; tidak ditemukan di data yang diupload</p>
            <p className="text-xs text-amber-600 max-w-md">Tambahkan kolom bernama <b>Grup</b> pada file sumber Anda (Excel/CSV), lalu upload ulang agar tabel ini terisi.</p>
          </div>
        ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs sm:text-sm border-collapse min-w-[700px]">
            <thead className="bg-slate-800 text-slate-200 uppercase font-bold">
              <tr>
                <th className="px-4 py-3 border-b border-slate-700">Grup</th>
                {groupStatusTable.statusCols.map(s => (
                  <th key={s} className="px-4 py-3 border-b border-slate-700 text-right">{s}</th>
                ))}
                <th className="px-4 py-3 border-b border-slate-700 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {groupStatusTable.rows.length === 0 ? (
                <tr>
                  <td colSpan={groupStatusTable.statusCols.length + 2} className="px-4 py-6 text-center text-slate-400 italic">
                    Tidak ada data untuk bulan terakhir / filter yang dipilih.
                  </td>
                </tr>
              ) : (
                groupStatusTable.rows.map((row, idx) => (
                  <tr key={row.grup} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="px-4 py-3 font-bold text-slate-800 border-b border-slate-100">{row.grup}</td>
                    {groupStatusTable.statusCols.map(s => {
                      const val = row.cells[s] || 0;
                      const pct = groupStatusTable.grandTotal > 0 ? (val / groupStatusTable.grandTotal) * 100 : 0;
                      return (
                        <td key={s} className="px-4 py-3 text-right border-b border-slate-100">
                          <div className="font-semibold text-slate-700">{formatRp(val)}</div>
                          <div className="text-[10px] text-slate-400">{pct.toFixed(1)}%</div>
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-right border-b border-slate-100">
                      <div className="font-black text-indigo-600">{formatRp(row.rowTotal)}</div>
                      <div className="text-[10px] text-slate-400">
                        {(groupStatusTable.grandTotal > 0 ? (row.rowTotal / groupStatusTable.grandTotal) * 100 : 0).toFixed(1)}%
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {groupStatusTable.rows.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100 font-bold">
                  <td className="px-4 py-3 text-slate-800">Grand Total</td>
                  {groupStatusTable.statusCols.map(s => {
                    const colTotal = groupStatusTable.rows.reduce((sum, r) => sum + (r.cells[s] || 0), 0);
                    const pct = groupStatusTable.grandTotal > 0 ? (colTotal / groupStatusTable.grandTotal) * 100 : 0;
                    return (
                      <td key={s} className="px-4 py-3 text-right">
                        <div className="text-slate-800">{formatRp(colTotal)}</div>
                        <div className="text-[10px] text-slate-500 font-normal">{pct.toFixed(1)}%</div>
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-right">
                    <div className="text-indigo-700">{formatRp(groupStatusTable.grandTotal)}</div>
                    <div className="text-[10px] text-slate-500 font-normal">100%</div>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        )}
      </GlassCard>

      {/* ACTION PLAN TABLE (replaced by the filterable "Action Plan" table in the offline export section) */}
      <GlassCard className="no-export p-6 border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-4 mb-6 gap-4">
          <h3 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-indigo-500" />
            Tabel Action Plan & Drill-Down ({analyzedData.length} SKU)
          </h3>
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg"
          >
            <Download className="w-4 h-4" /> Ekspor ke Excel (CSV)
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-[500px] overflow-y-auto">
          <table className="w-full text-left text-xs sm:text-sm border-collapse min-w-[1200px]">
            <thead className="bg-slate-800 text-slate-200 uppercase font-bold sticky top-0 z-20 shadow-md">
              <tr>
                <th className="px-4 py-3 border-b border-slate-700">Kode & Barang</th>
                <th className="px-4 py-3 border-b border-slate-700">Cabang</th>
                <th className="px-4 py-3 border-b border-slate-700 text-right">Tren 4th→0th</th>
                <th className="px-4 py-3 border-b border-slate-700 text-right">DOI</th>
                <th className="px-4 py-3 border-b border-slate-700 text-right">Value Tertahan</th>
                <th className="px-4 py-3 border-b border-slate-700 text-right">CBM</th>
                <th className="px-4 py-3 border-b border-slate-700">Status Analisis</th>
                <th className="px-4 py-3 border-b border-slate-700">Rekomendasi Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {analyzedData.map((row, idx) => (
                <tr key={idx} className={`hover:bg-slate-50 transition-colors ${row.colorClass}`}>
                  <td className="px-4 py-3 font-medium">
                    <div className="text-[10px] text-slate-500 font-mono mb-0.5">{row.ItemCode}</div>
                    <div className="font-bold text-slate-800">{row['NAMA BARANG']}</div>
                    <div className="text-[10px] text-slate-500 uppercase">{row.Category}</div>
                  </td>
                  <td className="px-4 py-3 font-semibold">{row['Branch Name']}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold">{row.trendStr}</td>
                  <td className="px-4 py-3 text-right font-mono">{row.DOI} Hr</td>
                  <td className="px-4 py-3 text-right font-mono">{formatRp(row.Value)}</td>
                  <td className="px-4 py-3 text-right font-mono">{row.CBM}</td>
                  <td className="px-4 py-3 font-bold">{row.analysisStatus}</td>
                  <td className="px-4 py-3 font-semibold italic">{row.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}



