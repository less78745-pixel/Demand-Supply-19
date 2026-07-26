// @ts-nocheck — page removed from navigation, suppress type errors
"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function InboundPage() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    description: '',
    qty: '',
    qcStatus: '',
    rackArea: '',
  });

  const handleNext = () => setStep((s) => Math.min(s + 1, 3));
  const handlePrev = () => setStep((s) => Math.max(s - 1, 1));
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Data Inbound berhasil disimpan!');
    // Reset form
    setStep(1);
    setFormData({ description: '', qty: '', qcStatus: '', rackArea: '' });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-col space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Transaksi Inbound</h1>
        <p className="text-gray-500">Proses penerimaan barang masuk ke gudang</p>
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
              {s === 1 ? 'Data PO' : s === 2 ? 'QC Check' : 'Alokasi Rak'}
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
              {step === 1 && 'Langkah 1: Input Data PO'}
              {step === 2 && 'Langkah 2: Quality Control (Gudang Transit)'}
              {step === 3 && 'Langkah 3: Alokasi Gudang Baik'}
            </CardTitle>
          </CardHeader>
          
          <CardContent className="space-y-4">
            {step === 1 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="desc">Deskripsi / SKU Barang</Label>
                  <Input 
                    id="desc" 
                    placeholder="Contoh: SKU-001 - Laptop Pro 15" 
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="qty">Kuantitas (Qty)</Label>
                  <Input 
                    id="qty" 
                    type="number" 
                    min="1" 
                    placeholder="0" 
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
                  Barang saat ini berada di <strong>Gudang Transit</strong>. Lakukan pengecekan QC.
                </div>
                <div className="space-y-2">
                  <Label>Hasil Quality Control</Label>
                  <Select 
                    value={formData.qcStatus} 
                    onValueChange={(val) => setFormData({...formData, qcStatus: val})}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih Status QC" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OK">Barang Baik (OK)</SelectItem>
                      <SelectItem value="RUSAK">Barang Rusak / Cacat</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                {formData.qcStatus === 'RUSAK' ? (
                  <div className="p-4 bg-red-50 text-red-800 rounded-md text-sm">
                    Barang ditandai <strong>RUSAK</strong> dan akan dipindahkan ke Gudang Rusak. Proses selesai.
                  </div>
                ) : (
                  <>
                    <div className="p-4 bg-emerald-50 text-emerald-800 rounded-md text-sm">
                      Barang ditandai <strong>OK</strong>. Silakan alokasikan ke rak Gudang Baik.
                    </div>
                    <div className="space-y-2">
                      <Label>Pilih Area / Rak</Label>
                      <Select 
                        value={formData.rackArea} 
                        onValueChange={(val) => setFormData({...formData, rackArea: val})}
                        required
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih Rak" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="RAK-A1">Rak A1 - Elektronik</SelectItem>
                          <SelectItem value="RAK-B2">Rak B2 - Aksesoris</SelectItem>
                          <SelectItem value="RAK-C3">Rak C3 - Periferal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
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
            <Button type="submit">
              {step === 3 ? 'Selesaikan Inbound' : 'Selanjutnya'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
