import { useState, useMemo } from 'react';

export interface SortState { key: string; dir: 'asc' | 'desc' }

export function useSort<T>(
  rows: T[],
  getVal: (row: T, key: string) => any,
  initial?: SortState,
) {
  const [sort, setSort] = useState<SortState>(initial ?? { key: '', dir: 'asc' });

  const toggle = (key: string) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));

  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    return [...rows].sort((a, b) => {
      const av = getVal(a, sort.key);
      const bv = getVal(b, sort.key);
      const cmp = av == null ? 1 : bv == null ? -1
        : typeof av === 'number' && typeof bv === 'number' ? av - bv
        : String(av).localeCompare(String(bv));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sort, getVal]);

  return { sort, toggle, sorted };
}
