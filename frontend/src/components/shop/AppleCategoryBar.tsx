'use client';

import * as React from 'react';
import { Search, X, SlidersHorizontal, RotateCcw } from 'lucide-react';

interface Category {
  id: number;
  name: string;
  slug?: string;
  icon?: string | null;
  _count?: { products: number };
}

interface AppleCategoryBarProps {
  categories: Category[];
  selectedCategoryId: string | null;
  search: string;
  minPrice: string;
  maxPrice: string;
  onSelectCategory: (id: string | null) => void;
  onSearchChange: (val: string) => void;
  onSearchSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onResetFilters: () => void;
  totalProductsCount: number;
}

export function AppleCategoryBar({
  categories,
  selectedCategoryId,
  search,
  onSelectCategory,
  onSearchChange,
  onSearchSubmit,
  onResetFilters,
  totalProductsCount,
}: AppleCategoryBarProps) {
  return (
    <div className="sticky top-16 z-30 mb-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 bg-black/75 backdrop-blur-2xl border-y border-white/[0.08]">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        
        {/* Category Horizontal Scrollable Pills */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          <button
            type="button"
            onClick={() => onSelectCategory(null)}
            className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 ${
              selectedCategoryId === null
                ? 'bg-white text-black shadow-md shadow-white/10'
                : 'bg-white/[0.06] text-[#86868b] hover:text-white hover:bg-white/[0.1]'
            }`}
          >
            <span>สินค้าทั้งหมด</span>
            <span className="ml-2 opacity-60 font-mono text-[10px]">({totalProductsCount})</span>
          </button>

          {categories.map((cat) => {
            const isSelected = selectedCategoryId === String(cat.id);
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onSelectCategory(String(cat.id))}
                className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-white text-black shadow-md shadow-white/10'
                    : 'bg-white/[0.06] text-[#86868b] hover:text-white hover:bg-white/[0.1]'
                }`}
              >
                {cat.icon && <span>{cat.icon}</span>}
                <span>{cat.name}</span>
                {cat._count?.products !== undefined && (
                  <span className="ml-1 opacity-60 font-mono text-[10px]">
                    ({cat._count.products})
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search & Reset Controls (Apple Spotlight Style) */}
        <form onSubmit={onSearchSubmit} className="flex items-center gap-2 shrink-0">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868b]" />
            <input
              type="text"
              name="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="ค้นหาชื่อสินค้า..."
              className="w-full pl-9 pr-8 py-2 rounded-full bg-white/[0.06] border border-white/[0.1] text-xs text-white placeholder-[#86868b] focus:outline-none focus:border-white/30 focus:bg-white/[0.09] transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  onSearchChange('');
                  onResetFilters();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86868b] hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="submit"
            className="px-4 py-2 rounded-full text-xs font-medium bg-white/[0.08] hover:bg-white/[0.15] text-white border border-white/[0.1] transition-colors"
          >
            ค้นหา
          </button>

          {(search || selectedCategoryId !== null) && (
            <button
              type="button"
              onClick={onResetFilters}
              className="p-2 rounded-full text-[#86868b] hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
              title="ล้างการค้นหา"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </form>

      </div>
    </div>
  );
}
