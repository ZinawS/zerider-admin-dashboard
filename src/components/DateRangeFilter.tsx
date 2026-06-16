import React from 'react';

interface DateRangeFilterProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  label?: string;
}

export function DateRangeFilter({ from, to, onChange, label = 'Date range' }: DateRangeFilterProps): JSX.Element {
  const hasValue = from || to;
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted whitespace-nowrap">{label}:</span>
      <input
        type="date"
        value={from}
        onChange={(e) => onChange(e.target.value, to)}
        className="px-2 py-1.5 text-xs border border-border rounded bg-white text-ink"
        title="From date"
      />
      <span className="text-muted text-xs">–</span>
      <input
        type="date"
        value={to}
        min={from || undefined}
        onChange={(e) => onChange(from, e.target.value)}
        className="px-2 py-1.5 text-xs border border-border rounded bg-white text-ink"
        title="To date"
      />
      {hasValue && (
        <button
          onClick={() => onChange('', '')}
          className="text-xs text-muted hover:text-ink"
          title="Clear date range"
        >
          ✕
        </button>
      )}
    </div>
  );
}
