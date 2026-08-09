"use client";

import React, { useState } from 'react';
import { Download, FileCode } from 'lucide-react';
import { getHtmlExportString, downloadHtml } from '@/utils/exportHtml';
import { getStandardFilename } from '@/utils/export';
import toast from 'react-hot-toast';

interface ExportHtmlButtonProps {
  elementId: string;
  moduleName: string;
  processedAt?: string;
  className?: string;
  label?: string;
}

export function ExportHtmlButton({ 
  elementId, 
  moduleName, 
  processedAt, 
  className = '',
  label = 'Export HTML'
}: ExportHtmlButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    try {
      setIsExporting(true);
      toast.loading('Menyiapkan file HTML...', { id: 'export-html' });
      
      // Delay sedikit agar loading toast sempat muncul dan rendering stabil
      await new Promise(r => setTimeout(r, 500));
      
      const htmlString = getHtmlExportString(elementId);
      const filename = getStandardFilename(moduleName, processedAt, 'html');
      
      downloadHtml(htmlString, filename);
      
      toast.success('File HTML berhasil diunduh!', { id: 'export-html' });
    } catch (err: any) {
      toast.error('Gagal mengekspor HTML: ' + (err.message || 'Error tidak diketahui'), { id: 'export-html' });
      console.error("Export HTML Error", err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={isExporting}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold shadow-md transition-all no-export
        ${isExporting 
          ? 'bg-slate-200 text-slate-500 cursor-not-allowed border border-slate-300' 
          : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white hover:-translate-y-0.5 border border-emerald-400'
        } ${className}`}
      title="Unduh seluruh halaman ini ke dalam bentuk file HTML interaktif statis"
    >
      <FileCode className="w-4 h-4" />
      {isExporting ? 'Memproses...' : label}
    </button>
  );
}
