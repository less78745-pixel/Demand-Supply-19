"use client";

import React, { useState } from 'react';
import { Download, FileCode } from 'lucide-react';
import { getHtmlExportString, downloadHtml } from '@/utils/exportHtml';
import { buildOfflineExportHtml, ModuleExportConfig } from '@/utils/offlineExport';
import { getStandardFilename } from '@/utils/export';
import toast from 'react-hot-toast';

interface ExportHtmlButtonProps {
  /** Legacy mode: plain DOM-snapshot with a text-search box only. */
  elementId?: string;
  /** Preferred mode: data-driven export with real, working dropdown filters. */
  config?: ModuleExportConfig;
  moduleName: string;
  processedAt?: string;
  className?: string;
  label?: string;
}

export function ExportHtmlButton({
  elementId,
  config,
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

      const htmlString = config ? buildOfflineExportHtml(config) : getHtmlExportString(elementId!);
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
          ? 'bg-muted text-muted-foreground cursor-not-allowed border border-border'
          : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white hover:-translate-y-0.5 border border-emerald-400'
        } ${className}`}
      title="Unduh seluruh halaman ini ke dalam bentuk file HTML interaktif statis"
    >
      <FileCode className="w-4 h-4" />
      {isExporting ? 'Memproses...' : label}
    </button>
  );
}
