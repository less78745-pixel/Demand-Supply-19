"use client";
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Filter, X } from 'lucide-react';

export type ColumnFilterType = 'text' | 'number' | 'select';

export interface ColumnFilterDef<T> {
  key: string;
  type: ColumnFilterType;
  getValue: (row: T) => string | number;
}

export interface ActiveColumnFilter {
  type: ColumnFilterType;
  text?: string;
  min?: string;
  max?: string;
  selected?: Set<string>;
}

function filterMatches(raw: string | number, type: ColumnFilterType, f: ActiveColumnFilter | undefined): boolean {
  if (!f) return true;
  if (type === 'text') {
    if (!f.text) return true;
    return String(raw).toLowerCase().includes(f.text.toLowerCase());
  }
  if (type === 'number') {
    const num = Number(raw);
    if (f.min !== undefined && f.min !== '' && num < Number(f.min)) return false;
    if (f.max !== undefined && f.max !== '' && num > Number(f.max)) return false;
    return true;
  }
  if (type === 'select') {
    if (!f.selected || f.selected.size === 0) return true;
    return f.selected.has(String(raw));
  }
  return true;
}

/** Excel-like per-column filtering over a plain array — no grid library required. */
export function useColumnFilters<T>(data: T[], defs: ColumnFilterDef<T>[]) {
  const [filters, setFilters] = useState<Record<string, ActiveColumnFilter>>({});

  const uniqueValuesByKey = useMemo(() => {
    const map: Record<string, string[]> = {};
    defs.forEach((def) => {
      if (def.type !== 'select') return;
      map[def.key] = Array.from(new Set(data.map((row) => String(def.getValue(row))))).sort();
    });
    return map;
  }, [data, defs]);

  const filteredData = useMemo(() => {
    return data.filter((row) =>
      defs.every((def) => filterMatches(def.getValue(row), def.type, filters[def.key]))
    );
  }, [data, defs, filters]);

  const setFilter = (key: string, value: ActiveColumnFilter | undefined) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (!value) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  const clearAll = () => setFilters({});
  const activeCount = Object.keys(filters).length;

  return { filteredData, filters, setFilter, clearAll, activeCount, uniqueValuesByKey };
}

export function FilterableHeader({
  label,
  columnKey,
  type,
  align = 'left',
  activeFilter,
  onChange,
  options,
  className = '',
  accentClassName = 'text-emerald-400',
}: {
  label: string;
  columnKey: string;
  type: ColumnFilterType;
  align?: 'left' | 'right' | 'center';
  activeFilter?: ActiveColumnFilter;
  onChange: (value: ActiveColumnFilter | undefined) => void;
  options?: string[];
  className?: string;
  /** Override the active-filter icon color, e.g. for modules with a strict palette. */
  accentClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isActive = !!activeFilter && (
    (!!activeFilter.text && activeFilter.text.length > 0) ||
    (activeFilter.min !== undefined && activeFilter.min !== '') ||
    (activeFilter.max !== undefined && activeFilter.max !== '') ||
    (!!activeFilter.selected && activeFilter.selected.size > 0)
  );

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  const justifyClass = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';

  return (
    <th className={`relative py-2.5 px-3 select-none ${alignClass} ${className}`}>
      <div className={`flex items-center gap-1.5 ${justifyClass}`}>
        <span>{label}</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
          className={`no-export p-0.5 rounded hover:bg-white/10 transition ${isActive ? accentClassName : 'text-muted-foreground/60'}`}
          aria-label={`Filter ${label}`}
        >
          <Filter className="w-3 h-3" fill={isActive ? 'currentColor' : 'none'} />
        </button>
      </div>

      {open && (
        <div
          ref={ref}
          className="no-export absolute z-50 top-full mt-1 left-0 w-56 bg-card border border-border rounded-lg shadow-2xl p-3 text-left normal-case font-normal text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          {type === 'text' && (
            <input
              autoFocus
              type="text"
              value={activeFilter?.text || ''}
              onChange={(e) => onChange({ type: 'text', text: e.target.value })}
              placeholder={`Cari ${label}...`}
              className="w-full px-2 py-1.5 text-xs border border-border rounded bg-background"
            />
          )}

          {type === 'number' && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={activeFilter?.min ?? ''}
                onChange={(e) => onChange({ type: 'number', min: e.target.value, max: activeFilter?.max })}
                placeholder="Min"
                className="w-full px-2 py-1.5 text-xs border border-border rounded bg-background"
              />
              <span className="text-muted-foreground text-xs">-</span>
              <input
                type="number"
                value={activeFilter?.max ?? ''}
                onChange={(e) => onChange({ type: 'number', min: activeFilter?.min, max: e.target.value })}
                placeholder="Max"
                className="w-full px-2 py-1.5 text-xs border border-border rounded bg-background"
              />
            </div>
          )}

          {type === 'select' && (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {(options || []).length === 0 && (
                <div className="text-[11px] text-muted-foreground px-1 py-0.5">Tidak ada opsi</div>
              )}
              {(options || []).map((opt) => {
                const checked = activeFilter?.selected?.has(opt) ?? false;
                return (
                  <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer px-1 py-0.5 hover:bg-muted rounded">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const nextSet = new Set(activeFilter?.selected || []);
                        if (e.target.checked) nextSet.add(opt); else nextSet.delete(opt);
                        onChange({ type: 'select', selected: nextSet });
                      }}
                    />
                    <span className="truncate">{opt}</span>
                  </label>
                );
              })}
            </div>
          )}

          {isActive && (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-rose-500 hover:text-rose-400"
            >
              <X className="w-3 h-3" /> Hapus Filter
            </button>
          )}
        </div>
      )}
    </th>
  );
}
