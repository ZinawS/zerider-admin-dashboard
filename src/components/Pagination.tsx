import React from 'react';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onChange }: PaginationProps): JSX.Element | null {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  const btn = (label: React.ReactNode, target: number, disabled = false, active = false) => (
    <button
      key={String(label)}
      onClick={() => !disabled && onChange(target)}
      disabled={disabled}
      className={`px-2.5 py-1 rounded text-sm border transition ${
        active
          ? 'bg-ink text-white border-ink'
          : disabled
          ? 'border-border text-muted cursor-not-allowed opacity-40'
          : 'border-border text-ink hover:bg-surface'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center justify-between mt-4">
      <span className="text-xs text-muted">
        {start}–{end} of {total}
      </span>
      <div className="flex items-center gap-1">
        {btn('‹', page - 1, page === 1)}
        {pages.map((p, i) =>
          p === '...'
            ? <span key={`dot-${i}`} className="px-1 text-muted">…</span>
            : btn(p, p as number, false, p === page)
        )}
        {btn('›', page + 1, page === totalPages)}
      </div>
    </div>
  );
}
