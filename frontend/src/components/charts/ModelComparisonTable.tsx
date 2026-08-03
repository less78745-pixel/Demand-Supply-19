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
        <table className="w-full text-sm text-left text-muted-foreground">
          <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
            <tr>
              <th scope="col" className="px-6 py-3 rounded-tl-lg">Model</th>
              <th scope="col" className="px-6 py-3">MAPE (%)</th>
              <th scope="col" className="px-6 py-3">Bias (Error)</th>
              <th scope="col" className="px-6 py-3">MAD (Unit)</th>
              <th scope="col" className="px-6 py-3 rounded-tr-lg">RMSE</th>
            </tr>
          </thead>
          <tbody>
            {modelComparison.map((model, index) => {
              const safeMape = Number(model?.mape || 0);
              const safeBias = Number(model?.bias || 0);
              const safeMad = Number(model?.mad || 0);
              const safeRmse = Number(model?.rmse || 0);

              return (
                <tr key={model.model || index} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="px-6 py-4 font-medium text-foreground flex items-center gap-2">
                    {index === 0 && <span className="w-2 h-2 rounded-full bg-primary"></span>}
                    {model.model || 'Unknown'} {index === 0 && <span className="text-xs text-primary ml-1">(Best)</span>}
                  </td>
                  <td className="px-6 py-4">{safeMape.toFixed(2)}%</td>
                  <td className={`px-6 py-4 ${safeBias > 0 ? 'text-destructive' : safeBias < 0 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                    {safeBias > 0 ? '+' : ''}{safeBias.toFixed(2)}
                  </td>
                  <td className="px-6 py-4">{safeMad.toFixed(2)}</td>
                  <td className="px-6 py-4">{safeRmse.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 text-xs text-muted-foreground">
        <p><strong className="text-primary">MAPE:</strong> Percentage error. Lower is better. Target &lt; 20%.</p>
        <p><strong className="text-primary">Bias:</strong> Direction of error. Positive = Under-forecast (Lost Sales risk). Negative = Over-forecast (Overstock risk). Target ~ 0.</p>
        <p><strong className="text-primary">MAD:</strong> Average unit deviation per month. Useful for daily operations buffer.</p>
        <p><strong className="text-primary">RMSE:</strong> Penalizes large errors. Detects models that produce extreme outliers.</p>
      </div>
    </GlassCard>
  );
}

