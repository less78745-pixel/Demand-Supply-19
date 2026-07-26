/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import React from 'react';
import { GlassCard } from '@/components/ui/GlassCard';

interface ModelComparisonTableProps {
  modelComparison: any[];
}

export function ModelComparisonTable({ modelComparison }: ModelComparisonTableProps) {
  if (!modelComparison || modelComparison.length === 0) return null;

  return (
    <GlassCard>
      <h3 className="text-lg font-semibold text-white mb-4">Model Evaluation (6 Months Backtest)</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-slate-300">
          <thead className="text-xs text-slate-400 uppercase bg-slate-800/50">
            <tr>
              <th scope="col" className="px-6 py-3 rounded-tl-lg">Model</th>
              <th scope="col" className="px-6 py-3">MAPE (%)</th>
              <th scope="col" className="px-6 py-3">Bias (Error)</th>
              <th scope="col" className="px-6 py-3">MAD (Unit)</th>
              <th scope="col" className="px-6 py-3 rounded-tr-lg">RMSE</th>
            </tr>
          </thead>
          <tbody>
            {modelComparison.map((model, index) => (
              <tr key={model.model} className="border-b border-slate-700/50 hover:bg-slate-800/30">
                <td className="px-6 py-4 font-medium text-white flex items-center gap-2">
                  {index === 0 && <span className="w-2 h-2 rounded-full bg-emerald-400"></span>}
                  {model.model} {index === 0 && <span className="text-xs text-emerald-400 ml-1">(Best)</span>}
                </td>
                <td className="px-6 py-4">{model.mape?.toFixed(2) || '0.00'}%</td>
                <td className={`px-6 py-4 ${(model.bias || 0) > 0 ? 'text-rose-400' : (model.bias || 0) < 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                  {model.bias > 0 ? '+' : ''}{model.bias?.toFixed(2) || '0.00'}
                </td>
                <td className="px-6 py-4">{model.mad?.toFixed(2) || '0.00'}</td>
                <td className="px-6 py-4">{model.rmse?.toFixed(2) || '0.00'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 text-xs text-slate-400">
        <p><strong className="text-emerald-400">MAPE:</strong> Percentage error. Lower is better. Target &lt; 20%.</p>
        <p><strong className="text-emerald-400">Bias:</strong> Direction of error. Positive = Under-forecast (Lost Sales risk). Negative = Over-forecast (Overstock risk). Target ~ 0.</p>
        <p><strong className="text-emerald-400">MAD:</strong> Average unit deviation per month. Useful for daily operations buffer.</p>
        <p><strong className="text-emerald-400">RMSE:</strong> Penalizes large errors. Detects models that produce extreme outliers.</p>
      </div>
    </GlassCard>
  );
}

