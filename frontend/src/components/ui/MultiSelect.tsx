"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MultiSelectProps {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  className?: string;
  selectAllLabel?: string;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Pilih Data",
  className,
  selectAllLabel = "Semua / Select All",
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const allOptions = options.filter((opt) => opt !== "All");
  const filteredOptions = allOptions.filter((opt) => String(opt).toLowerCase().includes(searchTerm.toLowerCase()));

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) setSearchTerm("");
  }, [isOpen]);

  const toggleOption = (option: string) => {
    let newSelected: string[];
    
    if (option === "All") {
      if (selected.includes("All")) {
        newSelected = []; // Deselect all
      } else {
        if (searchTerm) {
          const currentlySelected = selected.filter(o => o !== "All");
          const newSelection = Array.from(new Set([...currentlySelected, ...filteredOptions]));
          if (newSelection.length === allOptions.length) {
            newSelected = ["All"];
          } else {
            newSelected = newSelection;
          }
        } else {
          newSelected = ["All"];
        }
      }
    } else {
      if (selected.includes("All")) {
        newSelected = allOptions.filter(o => o !== option);
      } else {
        if (selected.includes(option)) {
          newSelected = selected.filter((o) => o !== option);
        } else {
          newSelected = [...selected, option];
        }
        
        if (newSelected.length === allOptions.length && allOptions.length > 0) {
          newSelected = ["All"];
        }
      }
    }

    onChange(newSelected);
  };

  const isSelected = (option: string) => {
    if (selected.includes("All")) return true;
    return selected.includes(option);
  };

  const displayValue = () => {
    if (selected.includes("All")) {
      return selectAllLabel;
    }
    if (selected.length === 0) {
      return placeholder;
    }
    if (selected.length === 1) {
      return selected[0];
    }
    return `${selected.length} item dipilih`;
  };

  // Determine if all visible options are selected when searching
  const isSelectAllVisibleChecked = () => {
    if (selected.includes("All")) return true;
    if (filteredOptions.length === 0) return false;
    return filteredOptions.every(opt => selected.includes(opt));
  };

  return (
    <div className={cn("relative w-full min-w-[200px] text-sm font-medium", className)} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full min-h-[44px] items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2.5 text-foreground shadow-sm hover:border-primary hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all font-semibold text-sm cursor-pointer"
      >
        <span className="truncate text-left text-foreground">{displayValue()}</span>
        <ChevronDown className={cn("h-4 w-4 text-primary shrink-0 transition-transform duration-200", isOpen ? "rotate-180 text-primary" : "")} />
      </button>

      {isOpen && (
        <div className="absolute left-0 z-[9999] mt-2 max-h-[450px] min-w-full w-max max-w-[500px] overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-[0_20px_50px_rgba(0,0,0,0.15)] ring-1 ring-black/5 flex flex-col backdrop-blur-2xl">
          <div className="p-2 border-b border-border/60 bg-muted/30">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input 
                type="text" 
                placeholder="Cari filter..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-background border border-border rounded-lg pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                autoFocus
              />
            </div>
          </div>
          
          <div className="overflow-y-auto flex-1 max-h-[350px]">
            <div
              onClick={() => toggleOption("All")}
              className="flex cursor-pointer items-center px-4 py-2.5 text-foreground hover:bg-muted/80 hover:text-primary transition-colors border-b border-border/50 font-bold sticky top-0 bg-card z-10"
            >
              <div className={cn(
                "flex h-4 w-4 items-center justify-center border rounded mr-3 shrink-0 transition-all shadow-inner",
                isSelectAllVisibleChecked() ? "border-primary bg-primary text-white shadow-primary/30" : "border-border bg-background"
              )}>
                {isSelectAllVisibleChecked() && <Check className="h-3 w-3 stroke-[3]" />}
              </div>
              <span>{searchTerm ? "Pilih Semua yang Tampil" : selectAllLabel}</span>
            </div>

            <div className="py-1">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => {
                  const checked = isSelected(option);
                  return (
                    <div
                      key={option}
                      onClick={() => toggleOption(option)}
                      className="flex cursor-pointer items-center px-4 py-2.5 text-foreground hover:bg-muted/70 hover:text-primary transition-colors text-sm font-medium"
                    >
                      <div className={cn(
                        "flex h-4 w-4 items-center justify-center border rounded mr-3 shrink-0 transition-all",
                        checked ? "border-primary bg-primary text-white shadow-sm" : "border-border bg-background"
                      )}>
                        {checked && <Check className="h-3 w-3 stroke-[3]" />}
                      </div>
                      <span className="break-words pr-2 whitespace-normal leading-snug">{option}</span>
                    </div>
                  );
                })
              ) : (
                <div className="px-4 py-4 text-muted-foreground text-xs italic text-center">Tidak ada opsi ditemukan untuk "{searchTerm}"</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
