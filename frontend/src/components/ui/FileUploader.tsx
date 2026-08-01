"use client";

import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, FileSpreadsheet, X, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileUploaderProps {
  onFileUpload: (file: File) => void;
  isLoading?: boolean;
  acceptedTypes?: Record<string, string[]>;
  label?: string;
  description?: string;
  templateCsv?: string;
  templateName?: string;
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
  templateName = "template.csv"
}: FileUploaderProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      setSelectedFile(file);
      onFileUpload(file);
    }
  }, [onFileUpload]);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: acceptedTypes,
    maxFiles: 1,
    disabled: isLoading,
  });

  return (
    <div className="w-full">
      <div
        {...getRootProps()}
        className={cn(
          "relative overflow-hidden rounded-xl border-2 border-dashed p-5 flex flex-col items-center justify-center transition-all duration-300 min-h-[160px]",
          isDragActive ? "border-primary bg-primary/20 shadow-[0_0_30px_hsl(var(--primary)/0.2)]" : "border-white/20 hover:border-primary/50 hover:bg-white/5",
          isDragReject && "border-destructive bg-destructive/20",
          isLoading && "opacity-50 cursor-not-allowed pointer-events-none"
        )}
      >
        <input {...getInputProps()} />
        
        {/* Animated Background Ring */}
        {isDragActive && (
          <motion.div 
            layoutId="dropzone-ring"
            className="absolute inset-0 border-4 border-primary/30 rounded-xl"
            initial={{ scale: 1.1, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", damping: 20 }}
          />
        )}

        <AnimatePresence mode="wait">
          {!selectedFile ? (
            <motion.div
              key="upload-prompt"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-col items-center text-center space-y-2.5"
            >
              <div className={cn(
                "p-2 rounded-full transition-colors duration-300",
                isDragActive ? "bg-primary/20 text-primary" : "bg-white/5 text-slate-400"
              )}>
                <UploadCloud className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">{label}</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-[220px] leading-relaxed">
                  {description}
                </p>
                {templateCsv && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // Excel uses system locale delimiter. The user's system separates by comma.
                      const content = '\ufeff' + (templateCsv || '');
                      const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = templateName;
                      a.click();
                      window.URL.revokeObjectURL(url);
                    }}
                    className="mt-3 px-3 py-1.5 bg-primary/20 hover:bg-primary/40 text-primary text-[11px] font-semibold rounded-md border border-primary/40 shadow-sm transition-all duration-200 hover:scale-105 active:scale-95 z-20 relative"
                  >
                    Download Excel/CSV Format
                  </button>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="file-info"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center text-center space-y-2 z-10"
            >
              <div className="relative">
                <FileSpreadsheet className="w-10 h-10 text-primary" />
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
                    <CheckCircle className="w-3.5 h-3.5 text-white" />
                  </motion.div>
                )}
              </div>
              <div>
                <p className="font-medium text-xs text-white truncate max-w-[180px]">{selectedFile.name}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
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
                  className="mt-2 flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  <X className="w-3.5 h-3.5" /> Remove File
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
