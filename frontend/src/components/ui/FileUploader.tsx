"use client";

import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, FileSpreadsheet, X, CheckCircle, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore, canUpload } from '@/stores/useAuthStore';

interface FileUploaderProps {
  onFileUpload: (file: File) => void;
  isLoading?: boolean;
  acceptedTypes?: Record<string, string[]>;
  label?: string;
  description?: string;
  templateCsv?: string;
  templateName?: string;
  /** Raw file size accepted at the dropzone. Excel workbooks carry heavy XML/
   *  styling overhead vs. their actual data, so this is intentionally well
   *  above the server's payload cap - `prepareUploadFile()` (lib/api.ts)
   *  converts Excel to CSV and enforces the real ~4MB post-conversion limit
   *  right before the network request, with an actionable error if a file is
   *  still too large after conversion. This dropzone cap only exists to reject
   *  obviously-wrong files (e.g. a 200MB dump) early. */
  maxSizeMB?: number;
}

export function FileUploader({
  onFileUpload,
  isLoading = false,
  acceptedTypes = {
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    'application/vnd.ms-excel': ['.xls'],
    'text/csv': ['.csv']
  },
  label = "Upload Dataset",
  description = "Drag & drop an Excel file here, or click to select",
  templateCsv,
  templateName = "template.csv",
  maxSizeMB = 30,
}: FileUploaderProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rejectionError, setRejectionError] = useState<string | null>(null);
  const { user } = useAuthStore();
  const hasUploadAccess = canUpload(user?.role);

  const onDrop = useCallback((acceptedFiles: File[], fileRejections: any[]) => {
    if (fileRejections.length > 0) {
      const reason = fileRejections[0]?.errors?.[0]?.code === 'file-too-large'
        ? `File terlalu besar (maks ${maxSizeMB}MB). Pecah file menjadi beberapa bagian (mis. per cabang/periode) lalu coba lagi.`
        : 'File tidak didukung. Gunakan format Excel (.xlsx/.xls) atau CSV.';
      setRejectionError(reason);
      setSelectedFile(null);
      return;
    }
    if (acceptedFiles.length > 0) {
      setRejectionError(null);
      const file = acceptedFiles[0];
      setSelectedFile(file);
      onFileUpload(file);
    }
  }, [onFileUpload, maxSizeMB]);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: acceptedTypes,
    maxFiles: 1,
    maxSize: maxSizeMB * 1024 * 1024,
    disabled: isLoading || !hasUploadAccess,
  });

  // Locked state for non-Super Admin users
  if (!hasUploadAccess) {
    return (
      <div className="w-full">
        <div className={cn(
          "relative overflow-hidden rounded-lg border border-dashed p-3 flex flex-col items-center justify-center min-h-[90px] w-full opacity-50 cursor-not-allowed",
          "border-white/10 bg-white/[0.02]"
        )}>
          <div className="flex flex-col items-center text-center space-y-1.5">
            <div className="p-1.5 rounded-full bg-white/5 text-muted-foreground">
              <Lock className="w-5 h-5" />
            </div>
            <div className="flex flex-col items-center">
              <h3 className="text-xs font-bold text-muted-foreground tracking-wide">{label}</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[200px] leading-tight">
                Akses upload hanya untuk Super Admin
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div
        {...getRootProps()}
        className={cn(
          "relative overflow-hidden rounded-lg border border-dashed p-3 flex flex-col items-center justify-center transition-all duration-300 min-h-[90px] w-full",
          isDragActive ? "border-primary bg-primary/20 shadow-[0_0_20px_hsl(var(--primary)/0.2)]" : "border-white/20 hover:border-primary/50 hover:bg-white/5",
          isDragReject && "border-destructive bg-destructive/20",
          isLoading && "opacity-50 cursor-not-allowed pointer-events-none"
        )}
      >
        <input {...getInputProps()} />
        
        {/* Animated Background Ring */}
        {isDragActive && (
          <motion.div 
            layoutId="dropzone-ring"
            className="absolute inset-0 border-2 border-primary/30 rounded-lg"
            initial={{ scale: 1.05, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", damping: 20 }}
          />
        )}

        <AnimatePresence mode="wait">
          {!selectedFile ? (
            <motion.div
              key="upload-prompt"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-col items-center text-center space-y-1.5"
            >
              <div className={cn(
                "p-1.5 rounded-full transition-colors duration-300",
                isDragActive ? "bg-primary/20 text-primary" : "bg-white/5 text-muted-foreground"
              )}>
                <UploadCloud className="w-5 h-5" />
              </div>
              <div className="flex flex-col items-center">
                <h3 className="text-xs font-bold text-white tracking-wide">{label}</h3>
                <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[200px] leading-tight line-clamp-2">
                  {description}
                </p>
                {templateCsv && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const content = '\ufeff' + (templateCsv || '');
                      const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = templateName;
                      a.click();
                      window.URL.revokeObjectURL(url);
                    }}
                    className="mt-2 px-2.5 py-1 bg-primary/20 hover:bg-primary/40 text-primary text-[10px] font-bold rounded border border-primary/40 shadow-sm transition-all duration-150 hover:scale-105 active:scale-95 z-20 relative"
                  >
                    Download Format Excel/CSV
                  </button>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="file-info"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center text-center space-y-1 z-10"
            >
              <div className="relative">
                <FileSpreadsheet className="w-8 h-8 text-primary" />
                {isLoading && (
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  />
                )}
                {!isLoading && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -bottom-1 -right-1 bg-emerald-500 rounded-full p-0.5"
                  >
                    <CheckCircle className="w-3 h-3 text-white" />
                  </motion.div>
                )}
              </div>
              <div>
                <p className="font-medium text-[11px] text-white truncate max-w-[160px]">{selectedFile.name}</p>
                <p className="text-[9px] text-muted-foreground mt-0.5">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              
              {!isLoading && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                  }}
                  className="mt-1.5 flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 transition-colors font-medium"
                >
                  <X className="w-3 h-3" /> Remove File
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {rejectionError && (
        <p className="mt-1.5 text-[11px] font-medium text-destructive flex items-center gap-1">
          <X className="w-3 h-3 shrink-0" /> {rejectionError}
        </p>
      )}
    </div>
  );
}
