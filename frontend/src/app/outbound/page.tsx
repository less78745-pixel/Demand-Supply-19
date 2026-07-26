// @ts-nocheck — page removed from navigation, suppress type errors
"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuthStore } from '@/stores/useAuthStore';

// Mock inventory for validation
const MOCK_INVENTORY: Record<string, number> = {
  'SKU-001': 45,
  'SKU-002': 120,
};

export default function OutboundPage() {
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    sku: '',
    qty: '',
    qcStatus: '',
  });

  const handleNext = () => {
    setError('');
    // Validasi Stok di Step 1
    if (step === 1) {
      const requestedQty = parseInt(formData.qty);
      const availableStock = MOCK_INVENTORY[formData.sku] || 0;
      
      if (requestedQty > availableStock) {
        setError(`Stok tidak mencukupi! Sisa stok untuk ${formData.sku}: ${availableStock}`);
        return;
      }
    }
    setStep((s) => Math.min(s + 1, 3));
  };
  
  const handlePrev = () => {
    setError('');
    setStep((s) => Math.max(s - 1, 1));
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Surat Jalan berhasil dibuat! Outbound selesai.');
    setStep(1);
    setFormData({ sku: '', qty: '', qcStatus: '' });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-col space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Transaksi Outbound</h1>
        <p className="text-gray-500">Proses pengeluaran barang dari gudang</p>
      </div>

      {/* Stepper Indicator */}
      <div className="flex items-center justify-between mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex flex-col items-center relative z-10">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold border-2 
              ${step >= s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-400 border-gray-300'}`}>
              {s}
            </div>
            <span className={`text-xs mt-2 font-medium ${step >= s ? 'text-blue-600' : 'text-gray-400'}`}>
              {s === 1 ? 'Pilih Barang' : s === 2 ? 'Transit & QC' : 'Surat Jalan'}
            </span>
          </div>
        ))}
        {/* Progress Line */}
        <div className="absolute left-0 top-5 w-full h-0.5 bg-gray-200 -z-10" />
      </div>

      <Card>
        <form onSubmit={step === 3 ? handleSubmit : (e) => { e.preventDefault(); handleNext(); }}>
          <CardHeader>
            <CardTitle>
              {step === 1 && 'Langkah 1: Pilih Barang & Cek Stok'}
              {step === 2 && 'Langkah 2: Quality Control Pengeluaran'}
              {step === 3 && 'Langkah 3: Pembuatan Surat Jalan'}
            </CardTitle>
          </CardHeader>
          
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 bg-red-100 text-red-700 rounded-md text-sm font-medium">
                ❌ {error}
              </div>
            )}

            {step === 1 && (
              <>
                <div className="space-y-2">
                  <Label>SKU Barang</Label>
                  <Select 
                    value={formData.sku} 
                    onValueChange={(val) => setFormData({...formData, sku: val})}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih SKU" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SKU-001">SKU-001 - Laptop Pro 15 (Stok: 45)</SelectItem>
                      <SelectItem value="SKU-002">SKU-002 - Wireless Mouse (Stok: 120)</SelectItem>
                      <SelectItem value="SKU-999">SKU-999 - Item Kosong (Stok: 0)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="qty">Kuantitas (Qty) Keluar</Label>
                  <Input 
                    id="qty" 
                    type="number" 
                    min="1" 
                    placeholder="Contoh: 10" 
                    value={formData.qty}
                    onChange={(e) => setFormData({...formData, qty: e.target.value})}
                    required
                  />
                </div>
              </>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="p-4 bg-amber-50 text-amber-800 rounded-md text-sm">
                  Barang dipindahkan ke <strong>Gudang Transit</strong> untuk dipacking. Lakukan pengecekan akhir.
                </div>
                <div className="space-y-2">
                  <Label>Status Packing & QC</Label>
                  <Select 
                    value={formData.qcStatus} 
                    onValueChange={(val) => setFormData({...formData, qcStatus: val})}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="READY">Siap Kirim</SelectItem>
                      <SelectItem value="REJECT">Packing Gagal / Cacat</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                {formData.qcStatus === 'REJECT' ? (
                  <div className="p-4 bg-red-50 text-red-800 rounded-md text-sm">
                    Barang ditandai <strong>REJECT</strong>. Proses pengeluaran dibatalkan.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 bg-emerald-50 text-emerald-800 rounded-md text-sm">
                      Barang <strong>SIAP KIRIM</strong>. Silakan generate Surat Jalan.
                    </div>
                    <div className="p-4 border rounded-md bg-gray-50 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-gray-700">Preview Surat Jalan</p>
                        <p className="text-sm text-gray-500">Tujuan: Customer A | Item: {formData.sku} ({formData.qty} pcs)</p>
                      </div>
                      <Button type="button" variant="outline" size="sm">Download PDF</Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>

          <CardFooter className="flex justify-between">
            <Button 
              type="button" 
              variant="outline" 
              onClick={handlePrev}
              disabled={step === 1}
            >
              Kembali
            </Button>
            <Button type="submit" disabled={step === 3 && formData.qcStatus === 'REJECT'}>
              {step === 3 ? 'Generate Surat Jalan' : 'Selanjutnya'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
