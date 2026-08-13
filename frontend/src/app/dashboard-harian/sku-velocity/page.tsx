/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import LZString from 'lz-string';

import React, { useState, useMemo, useEffect } from 'react';
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
  Legend, ResponsiveContainer, LineChart, Line, ComposedChart, BarChart, Bar, ZAxis, Cell
} from 'recharts';
import { get, set } from 'idb-keyval';
import { supabase } from '@/lib/supabase';
import { parseDynamicCSV, ParsedData } from '@/lib/csvParser';
import { getStandardFilename } from '@/utils/export';
import { ExportHtmlButton } from '@/components/ui/ExportHtmlButton';
import { ModuleExportConfig } from '@/utils/offlineExport';
import { formatNumberCompact } from '@/lib/utils';

// Utility formatters
const formatRp = (val: number) => `Rp ${val.toLocaleString('id-ID')}`;
const formatNum = (val: number) => val.toLocaleString('id-ID');

export default function SKUVelocityPage() {
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showHowTo, setShowHowTo] = useState<boolean>(false);

  // Filter states
  const [selectedCabang, setSelectedCabang] = useState<string[]>(['All']);
  const [selectedCategory, setSelectedCategory] = useState<string[]>(['All']);
  const [selectedStatus, setSelectedStatus] = useState<string[]>(['All']);
  const [selectedBulan, setSelectedBulan] = useState<string[]>(['All']);
  const [trendGrouping, setTrendGrouping] = useState<'Category' | 'Branch Name' | 'Status Product'>('Category');
  const [trendMetric, setTrendMetric] = useState<'Value' | 'CBM' | 'Qty'>('Value');

  // Local filter states for Trend Analysis
  const [localCabang, setLocalCabang] = useState<string[]>(['All']);
  const [localCategory, setLocalCategory] = useState<string[]>(['All']);
  const [localStatus, setLocalStatus] = useState<string[]>(['All']);

  // Table & Chart Highlight state
  const [activeHighlight, setActiveHighlight] = useState<'All' | 'DeadStock' | 'RisingStar'>('All');

  // Auto-select latest month when parsed data changes
  useEffect(() => {
    if (parsed && parsed.data) {
      const allBulans = Array.from(new Set(parsed.data.map(d => d['BULAN']))).filter(Boolean) as string[];
      if (allBulans.length > 0) {
        const sorted = allBulans.sort();
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

      if (!error && data && data.result_json) {
        let parsedData = JSON.parse(data.result_json);
        if (parsedData.compressed && parsedData.data) {
          const decompressed = LZString.decompressFromBase64(parsedData.data);
          if (decompressed) parsedData = JSON.parse(decompressed);
        }
        setParsed(parsedData);
      } else {
        get('last_sku_velocity_data').then(saved => {
          if (saved && saved.data && saved.data.length > 0) {
            setParsed(saved);
          } else {
            handleGenerateDemo();
          }
        }).catch(err => {
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
    const branches = ['Gudang JKT', 'Gudang SBY', 'Gudang MDN', 'Gudang BPN'];
    const categories = ['Home Care', 'Personal Care', 'Food & Beverage', 'Electronics', 'Apparel'];
    const statuses = ['Active', 'Active', 'Active', 'Passive', 'New Item'];

    const headers = [
      'ItemCode', 'NAMA BARANG', 'Category', 'On Hand', 'Value', 
      '4th', '3rd', '2nd', '1st', '0th', 'AVG SALES MONTH', 'DOI',
      'Status Product', 'Branch Name', 'Last Income', 'Qty Receipt', 'CBM', 'BULAN'
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
              ItemCode: itemCode, 'NAMA BARANG': name, Category: cat,
              'On Hand': Math.round(onHand), Value: Math.round(val),
              '4th': Math.round(m4), '3rd': Math.round(m3), '2nd': Math.round(m2), '1st': Math.round(m1), '0th': Math.round(m0),
              'AVG SALES MONTH': Math.round(avgSales), DOI: Math.round(doi),
              'Status Product': status, 'Branch Name': branch, 'Last Income': '2026-08-01',
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
    setIsProcessing(true);
    toast.loading('Membaca file data SKU Velocity...', { id: 'upload' });
    try {
      const parsedData = await parseDynamicCSV(file);
      setParsed(parsedData);
      
      const uniqueBulans = Array.from(new Set(parsedData.data.map((d: any) => d['BULAN']))).filter(Boolean).sort();
      if (uniqueBulans.length > 0) {
        setSelectedBulan([uniqueBulans[uniqueBulans.length - 1] as string]);
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
  const bulans = useMemo(() => parsed ? ['All', ...Array.from(new Set(parsed.data.map(d => d['BULAN']))).filter(Boolean).sort()] : [], [parsed]);

  // Engine Classification Functions removed in favor of direct Status Product mapping

  // Processed Data
  const analyzedData = useMemo(() => {
    if (!parsed) return [];
    
    let result = parsed.data.filter(d => 
      (selectedBulan.includes('All') || selectedBulan.includes(d['BULAN'])) &&
      (selectedCabang.includes('All') || selectedCabang.includes(d['Branch Name'])) &&
      (selectedCategory.includes('All') || selectedCategory.includes(d['Category'])) &&
      (selectedStatus.includes('All') || selectedStatus.includes(d['Status Product']))
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

    if (activeHighlight === 'DeadStock') {
      result = result.filter(r => r.analysisStatus.includes('Discontinue'));
    } else if (activeHighlight === 'RisingStar') {
      result = result.filter(r => r.analysisStatus.includes('Fast'));
    }

    return result;
  }, [parsed, selectedBulan, selectedCabang, selectedCategory, selectedStatus, activeHighlight]);

  // Executive Summaries (Filtered to LATEST MONTH ONLY)
  const executiveSummary = useMemo(() => {
    // 1. Determine the latest month
    const uniqueMonths = Array.from(new Set(analyzedData.map(r => r['BULAN']))).filter(Boolean).sort();
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
      totalItems: latestData.length
    };
  }, [analyzedData, parsed]);

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
    
    const uniqueBulans = Array.from(new Set(parsed.data.map(d => d['BULAN']))).filter(Boolean).sort();
    
    return uniqueBulans.map(bulan => {
      let deadVol = 0;
      let risingVol = 0;

      let healthyVol = 0;

      

      parsed.data.filter(d => 

        d['BULAN'] === bulan &&

        (selectedCabang.includes('All') || selectedCabang.includes(d['Branch Name'])) &&

        (selectedCategory.includes('All') || selectedCategory.includes(d['Category'])) &&

        (selectedStatus.includes('All') || selectedStatus.includes(d['Status Product']))

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

  }, [parsed, selectedCabang, selectedCategory, selectedStatus]);



  // Aggregate Multi-Dimensional Trend Data

  const multiDimensionalTrendData = useMemo(() => {

    if (!parsed) return { data: [], series: [], uniqueStatuses: [], targetGroups: [], GROUP_COLORS: [], OPACITIES: [] };

    

    // Apply local filters

    let filtered = parsed.data.filter(d => 

      (localCabang.includes('All') || localCabang.includes(d['Branch Name'])) &&

      (localCategory.includes('All') || localCategory.includes(d['Category'])) &&

      (localStatus.includes('All') || localStatus.includes(d['Status Product']))

    );



    // Find Target Groups

    const overallGroupMap: Record<string, number> = {};

    filtered.forEach(r => {

      const key = r[trendGrouping] || 'Unknown';

      overallGroupMap[key] = (overallGroupMap[key] || 0) + (r['Value'] || 0); 

    });

    

    let targetGroups = Object.keys(overallGroupMap).sort((a, b) => overallGroupMap[b] - overallGroupMap[a]);

    

    // LIMIT TO TOP 5 ONLY IF CATEGORY

    if (trendGrouping === 'Category') {

      targetGroups = targetGroups.slice(0, 5);

    }



    // Keep only rows belonging to target groups

    filtered = filtered.filter(r => targetGroups.includes(r[trendGrouping] || 'Unknown'));



    // Determine the stack dimension (what makes up the blocks inside a bar)

    let stackGrouping = 'Status Product';

    if (trendGrouping === 'Status Product') {

      stackGrouping = 'Category';

    }



    // Unique Stacks in this filtered data

    let targetStacks: string[] = [];

    if (stackGrouping === 'Status Product') {

      targetStacks = Array.from(new Set(filtered.map(d => d['Status Product'] || 'Unknown'))).sort();

    } else {

      const stackMap: Record<string, number> = {};

      filtered.forEach(r => {

        const key = r[stackGrouping] || 'Unknown';

        stackMap[key] = (stackMap[key] || 0) + (r['Value'] || 0);

      });

      targetStacks = Object.keys(stackMap).sort((a, b) => stackMap[b] - stackMap[a]).slice(0, 5);

    }

    

    // Filter out rows that don't belong to the target stacks (if it was sliced to Top 5)

    if (stackGrouping === 'Category') {

      filtered = filtered.filter(r => targetStacks.includes(r[stackGrouping] || 'Unknown'));

    }



    // Group by BULAN

    const monthMap: Record<string, any> = {};

    

    filtered.forEach(r => {

      const bulan = r['BULAN'] || 'Unknown';

      const groupKey = r[trendGrouping] || 'Unknown';

      const stackKey = r[stackGrouping] || 'Unknown';

      

      if (!monthMap[bulan]) {

        monthMap[bulan] = { name: bulan };

      }

      

      const dataKey = `${groupKey}||${stackKey}`;

      

      if (!monthMap[bulan][dataKey]) monthMap[bulan][dataKey] = 0;

      

      let valToAdd = 0;

      if (trendMetric === 'Value') valToAdd = r['Value'] || 0;

      else if (trendMetric === 'CBM') valToAdd = r['CBM'] || 0;

      else valToAdd = r['On Hand'] || 0;



      monthMap[bulan][dataKey] += valToAdd;

    });



    const uniqueBulans = Array.from(new Set(parsed.data.map(d => d['BULAN']))).filter(Boolean).sort();

    const result = uniqueBulans.map(b => monthMap[b]).filter(Boolean);



    // Build series definition

    const series: Array<{ dataKey: string, stackId: string, group: string, status: string, color: string, opacity: number }> = [];

    const GROUP_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'];

    const OPACITIES = [1, 0.75, 0.5, 0.25, 0.1];



    targetGroups.forEach((group, gIdx) => {

      targetStacks.forEach((stack, sIdx) => {

        series.push({

          dataKey: `${group}||${stack}`,

          stackId: group, // This makes it stack by group!

          group: group,

          status: stack, // 'status' is now used as the stack label

          color: GROUP_COLORS[gIdx % GROUP_COLORS.length],

          opacity: OPACITIES[sIdx % OPACITIES.length]

        });

      });

    });



    return { data: result, series, targetGroups, uniqueStatuses: targetStacks, GROUP_COLORS, OPACITIES };

  }, [parsed, localCabang, localCategory, localStatus, trendGrouping, trendMetric]);



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





  const handleExport = () => {

    if (analyzedData.length === 0) return;

    const header = ['ItemCode', 'NAMA BARANG', 'Kategori', 'Cabang', 'Tren (4th->0th)', 'DOI (Hari)', 'Value Tertahan (Rp)', 'Utilisasi Gudang (CBM)', 'Status Analisis', 'Rekomendasi Action'].map(h => `"${h}"`).join(',');

    const lines = [header];



    analyzedData.forEach(row => {

      const line = [

        `"${row.ItemCode}"`, `"${row['NAMA BARANG']}"`, `"${row.Category}"`, `"${row['Branch Name']}"`,

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

  const exportConfig: ModuleExportConfig | undefined = parsed ? {
    moduleName: 'SKU_Velocity_Insights',
    processedAt: parsed.processed_at,
    domElementId: 'export-container',
    filters: [
      { field: 'BULAN', label: 'Filter Bulan', options: bulans.filter((b) => b !== 'All') },
      { field: 'Branch Name', label: 'Filter Cabang', options: cabangs.filter((c) => c !== 'All') },
      { field: 'Category', label: 'Filter Kategori', options: categories.filter((c) => c !== 'All') },
      { field: 'Status Product', label: 'Filter Status Product', options: statuses.filter((s) => s !== 'All') },
    ],
    tables: [
      {
        id: 'action_plan',
        title: 'Tabel Action Plan & Drill-Down',
        filterFields: ['BULAN', 'Branch Name', 'Category', 'Status Product'],
        data: analyzedData,
        columns: [
          { key: 'ItemCode', label: 'Kode' },
          { key: 'NAMA BARANG', label: 'Nama Barang' },
          { key: 'Category', label: 'Kategori' },
          { key: 'Branch Name', label: 'Cabang' },
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
        filterFields: ['BULAN', 'Branch Name', 'Category', 'Status Product'],
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
        filterFields: ['BULAN', 'Branch Name', 'Category', 'Status Product'],
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
    ],
    kpis: [
      { id: 'dead_stock_value', label: 'Dead Stock Trapped Value', sourceTableId: 'dead_stock_items', field: 'Value', agg: 'sum', decimals: 0 },
      { id: 'dead_stock_count', label: 'Dead Stock SKU', sourceTableId: 'dead_stock_items', field: 'Value', agg: 'count', decimals: 0, suffix: ' SKU' },
      { id: 'rising_star_count', label: 'Fast Moving Opportunities', sourceTableId: 'rising_star_items', field: 'Value', agg: 'count', decimals: 0, suffix: ' SKU' },
      { id: 'total_evaluated', label: 'Total Evaluated SKU', sourceTableId: 'action_plan', field: 'Value', agg: 'count', decimals: 0, suffix: ' SKU' },
    ],
  } : undefined;

  return (

    <div id="export-container" className="space-y-8 pb-16 min-h-screen animate-fade-in text-foreground">

      {/* HEADER SECTION */}

      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 sm:p-8 border border-indigo-500/20 shadow-2xl">

        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#6366f1_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">

          <div className="space-y-2">

            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase tracking-widest">

              <Activity className="w-3.5 h-3.5" /> Dashboard Data Harian • SKU Velocity

            </div>

            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white flex items-center gap-3">

              SKU Velocity Analysis <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-300">(Dead Stock vs Fast Moving)</span>

            </h1>

            <p className="text-slate-300 text-sm sm:text-base max-w-3xl font-normal leading-relaxed">

              Modul analitik cerdas untuk membedah kinerja barang: mengidentifikasi item yang menyedot modal (Kandidat Discontinue) dan item yang berpotensi kehabisan stok di masa tren naik (Rising Star).

            </p>

          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">

            <TimestampBadge timestamp={parsed?.processed_at || new Date().toISOString()} label="Olah Terakhir:" />

            {exportConfig
              ? <ExportHtmlButton config={exportConfig} moduleName="SKU_Velocity_Insights" processedAt={parsed?.processed_at} />
              : <ExportHtmlButton elementId="export-container" moduleName="SKU_Velocity_Insights" processedAt={parsed?.processed_at} />}
            <button

              onClick={() => setShowHowTo(!showHowTo)}

              className="no-export w-full sm:w-auto px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-2"

            >

              <HelpCircle className="w-4 h-4" />

              {showHowTo ? 'Tutup Panduan' : 'Panduan & Template'}

            </button>

          </div>

        </div>

      </div>



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

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">

          <div className="space-y-2">

            <label className="text-xs font-bold text-slate-700 block uppercase">📅 Bulan:</label>

            <MultiSelect options={bulans} selected={selectedBulan} onChange={setSelectedBulan} selectAllLabel="Semua Bulan" placeholder="Pilih Bulan..." />

          </div>

          <div className="space-y-2">

            <label className="text-xs font-bold text-slate-700 block uppercase">🏢 Cabang:</label>

            <MultiSelect options={cabangs} selected={selectedCabang} onChange={setSelectedCabang} selectAllLabel="Semua Cabang" placeholder="Pilih Cabang..." />

          </div>

          <div className="space-y-2">

            <label className="text-xs font-bold text-slate-700 block uppercase">📦 Kategori:</label>

            <MultiSelect options={categories} selected={selectedCategory} onChange={setSelectedCategory} selectAllLabel="Semua Kategori" placeholder="Pilih Kategori..." />

          </div>

          <div className="space-y-2">

            <label className="text-xs font-bold text-slate-700 block uppercase">🔖 Status Product:</label>

            <MultiSelect options={statuses} selected={selectedStatus} onChange={setSelectedStatus} selectAllLabel="Semua Status" placeholder="Pilih Status..." />

          </div>

          <div className="space-y-2">

            <label className="text-xs font-bold text-slate-700 block uppercase">🎯 Sorotan Matrix:</label>

            <select

              value={activeHighlight}

              onChange={(e) => setActiveHighlight(e.target.value as any)}

              className="w-full h-[42px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold focus:border-indigo-500 outline-none"

            >

              <option value="All">Lihat Semua SKU</option>

              <option value="DeadStock">🔴 Hanya Kandidat Discontinue</option>

              <option value="RisingStar">🟢 Hanya Fast Moving</option>

            </select>

          </div>

        </div>

      </GlassCard>



      {/* VISUALIZATION QUADRANTS */}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Scatter Plot */}

        <GlassCard className="p-6 border-indigo-500/30 bg-slate-900 shadow-2xl">

          <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">

            <BarChart3 className="w-5 h-5 text-indigo-400" /> Kuadran Analisis (DOI vs Volume Penjualan)

          </h3>

          <p className="text-xs text-slate-400 mb-4">

            Ukuran gelembung mewakili <b>Total Value Tertahan</b>. Merah = Discontinue, Hijau = Fast Moving.

          </p>

          <div className="h-[400px] w-full bg-slate-950/50 rounded-xl p-2 border border-slate-800">

            <ResponsiveContainer width="100%" height="100%">

              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>

                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />

                <XAxis type="number" dataKey="avgSales" name="Rata-rata Penjualan" stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 11 }} tickFormatter={formatNum} label={{ value: 'Rata-rata Penjualan/Bulan', position: 'insideBottom', fill: '#94a3b8', fontSize: 11, offset: -10 }} />

                <YAxis type="number" dataKey="doi" name="DOI (Hari)" stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 11 }} label={{ value: 'Days of Inventory (DOI)', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11 }} />

                <ZAxis type="number" dataKey="value" range={[50, 600]} name="Value Tertahan" />

                <Tooltip

                  cursor={{ strokeDasharray: '3 3' }}

                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#3b82f6', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}

                  formatter={(value: any, name: any) => name === 'Value Tertahan' ? formatRp(value) : formatNum(value)}

                  labelFormatter={() => ''}

                  content={({ active, payload }: any) => {

                    if (active && payload && payload.length) {

                      const data = payload[0].payload;

                      return (

                        <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl shadow-xl">

                          <p className="text-white font-bold mb-1 border-b border-slate-700 pb-1">{data.name}</p>

                          <p className="text-xs text-slate-300">Status: <span style={{color: data.fill}} className="font-bold">{data.status}</span></p>

                          <p className="text-xs text-slate-300">Avg Sales: {formatNum(data.avgSales)}</p>

                          <p className="text-xs text-slate-300">DOI: {data.doi} Hari</p>

                          <p className="text-xs text-slate-300">Value: {formatRp(data.value)}</p>

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

        <GlassCard className="p-6 border-indigo-500/30 bg-slate-900 shadow-2xl">

          <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">

            <TrendingUp className="w-5 h-5 text-purple-400" /> Tren Nilai Penjualan Berdasarkan Bulan (Agregat SKU)

          </h3>

          <p className="text-xs text-slate-400 mb-4">

            Perbandingan total nilai (Value) pergerakan antar klasifikasi matriks berdasar kelompok bulan.

          </p>

          <div className="h-[400px] w-full bg-slate-950/50 rounded-xl p-2 border border-slate-800">

            <ResponsiveContainer width="100%" height="100%">

              <LineChart data={trendData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>

                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />

                <XAxis dataKey="name" stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 12, fontWeight: 600 }} />

                <YAxis stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 11 }} tickFormatter={(val) => formatNumberCompact(val)} width={60} />

                <Tooltip

                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#6366f1', borderRadius: '12px' }}

                  formatter={(val: any) => [formatRp(val), undefined]}

                />

                <Legend wrapperStyle={{ paddingTop: '10px' }} />

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

        <div className="h-[450px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={multiDimensionalTrendData.data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(val) => formatNumberCompact(val)} width={70} />
              
              <Tooltip
                wrapperStyle={{ pointerEvents: 'auto' }}
                content={({ active, payload, label }: any) => {
                  if (active && payload && payload.length) {
                    // Group payload by stackId (which is the group name)
                    const groups: Record<string, any[]> = {};
                    payload.forEach((entry: any) => {
                       const grp = entry.dataKey.split('||')[0];
                       if (!groups[grp]) groups[grp] = [];
                       groups[grp].push(entry);
                    });

                    return (
                      <div className="bg-white/95 backdrop-blur-md p-4 border border-slate-200 rounded-xl shadow-xl z-50 min-w-[220px] max-h-[350px] overflow-y-auto pointer-events-auto custom-scrollbar">
                        <p className="font-bold text-slate-800 mb-2 border-b pb-1.5 flex justify-between">
                          <span>{label}</span>
                          <span className="text-indigo-600 ml-2">{trendMetric}</span>
                        </p>
                        
                        {Object.entries(groups).map(([grp, entries]) => {
                           const total = entries.reduce((sum, e) => sum + e.value, 0);
                           if (total === 0) return null; // hide empty groups
                           
                           return (
                             <div key={grp} className="mb-3 last:mb-0">
                               <p className="font-bold text-xs text-slate-700 mb-1 flex justify-between items-center bg-slate-100 p-1.5 rounded-md">
                                 <span>{grp}</span>
                                 <span className="text-indigo-600">{formatNum(total)}</span>
                               </p>
                               <div className="space-y-1">
                                 {entries.map((entry, idx) => {
                                   if (entry.value === 0) return null;
                                   const percent = ((entry.value / total) * 100).toFixed(1) + '%';
                                   return (
                                     <div key={idx} className="flex justify-between items-center text-xs pl-2 border-l-2 mb-0.5" style={{ borderColor: entry.color, opacity: entry.payload.opacity }}>
                                       <span className="text-slate-600 font-medium">{entry.name}</span>
                                       <span className="font-semibold text-slate-700 ml-3">
                                         {formatNum(entry.value)} <span className="text-[10px] text-slate-400 font-medium">({percent})</span>
                                       </span>
                                     </div>
                                   );
                                 })}
                               </div>
                             </div>
                           );
                        })}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend 
                content={(props) => {
                  const { targetGroups, uniqueStatuses, GROUP_COLORS, OPACITIES } = multiDimensionalTrendData;
                  return (
                    <div className="flex flex-col items-center gap-2 pt-6">
                      <div className="flex flex-wrap justify-center gap-4">
                        {targetGroups.map((grp, i) => (
                          <div key={grp} className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                            <span className="w-3.5 h-3.5 rounded-sm shadow-sm" style={{ backgroundColor: GROUP_COLORS[i % GROUP_COLORS.length] }}></span>
                            {grp}
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap justify-center gap-3">
                        {uniqueStatuses.map((status, i) => (
                          <div key={status} className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
                            <span className="w-3 h-3 rounded-sm bg-slate-800" style={{ opacity: OPACITIES[i % OPACITIES.length] }}></span>
                            {status}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }}
              />
              
              {multiDimensionalTrendData.series.map((s) => (
                <Bar 
                  key={s.dataKey} 
                  dataKey={s.dataKey} 
                  name={s.status}
                  stackId={s.stackId}
                  fill={s.color} 
                  fillOpacity={s.opacity}
                  radius={[0, 0, 0, 0]} // removed radius to avoid rounded inner stacks
                  maxBarSize={50}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
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



