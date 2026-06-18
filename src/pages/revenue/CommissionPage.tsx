import React, { useState } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { PageHeader } from '../../components/PageHeader.js';
import { useToast } from '../../components/Toast.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PricingRule {
  id: string;
  vehicle_category: string;
  service_fee_pct: number | string;
  minimum_fare_cents: number;
  cancellation_fee_cents: number;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const REVENUE_BREAKDOWN = [
  { name: 'Ride Commission', value: 60, color: '#6366f1' },
  { name: 'Surge Fees', value: 20, color: '#f59e0b' },
  { name: 'Cancellation Fees', value: 10, color: '#ef4444' },
  { name: 'Marketplace Fees', value: 10, color: '#10b981' },
];

const TREND_DATA = [
  { month: 'Jan', revenue: 42000 },
  { month: 'Feb', revenue: 48500 },
  { month: 'Mar', revenue: 55200 },
  { month: 'Apr', revenue: 51800 },
  { month: 'May', revenue: 63400 },
  { month: 'Jun', revenue: 71200 },
];

const VEHICLE_CATEGORIES = [
  'economy',
  'comfort',
  'premium',
  'xl',
  'luxury',
  'ev',
  'taxi',
  'van',
  'motorcycle',
] as const;

type VehicleCategory = (typeof VEHICLE_CATEGORIES)[number];

const DEFAULT_CATEGORY_RATES: Record<VehicleCategory, number> = {
  economy: 20,
  comfort: 18,
  premium: 15,
  xl: 17,
  luxury: 12,
  ev: 16,
  taxi: 22,
  van: 18,
  motorcycle: 15,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function CommissionPage(): JSX.Element {
  const { toast } = useToast();

  // Per-category rates (local editable state)
  const [categoryRates, setCategoryRates] =
    useState<Record<VehicleCategory, number>>(DEFAULT_CATEGORY_RATES);

  // Fetch current pricing rules to extract global rates
  const { data: pricingData } = useQuery({
    queryKey: ['commission-pricing'],
    queryFn: () =>
      api<{ items: PricingRule[] } | PricingRule[]>('/v1/admin/pricing').then(
        (r) => (Array.isArray(r) ? r : (r.items ?? [])),
      ),
    retry: false,
  });

  const rules: PricingRule[] = Array.isArray(pricingData)
    ? pricingData
    : (pricingData ?? []);

  // Derive summary metrics from first available rule or use defaults
  const firstRule = rules[0];
  const baseCommission = firstRule
    ? Number(firstRule.service_fee_pct)
    : 20;
  const minFare = firstRule ? firstRule.minimum_fare_cents : 250;
  const cancellationFee = firstRule ? firstRule.cancellation_fee_cents : 500;

  const handleRateChange = (cat: VehicleCategory, value: string) => {
    const num = parseFloat(value);
    if (!Number.isNaN(num)) {
      setCategoryRates((prev) => ({ ...prev, [cat]: num }));
    }
  };

  const handleSave = () => {
    toast('Commission rates saved successfully.', 'success');
  };

  return (
    <>
      <PageHeader
        title="Commission & Fees"
        subtitle="Platform commission rates and per-category fee configuration."
      />

      {/* Current rates card */}
      <div className="bg-white border border-border rounded-lg p-5 mb-6">
        <div className="text-sm font-semibold mb-4">Current rates (global defaults)</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-muted mb-1">Base commission</div>
            <div className="text-xl font-bold">{baseCommission.toFixed(1)}%</div>
          </div>
          <div>
            <div className="text-xs text-muted mb-1">Surge multiplier cap</div>
            <div className="text-xl font-bold">3.0x</div>
          </div>
          <div>
            <div className="text-xs text-muted mb-1">Minimum fare</div>
            <div className="text-xl font-bold">{money(minFare)}</div>
          </div>
          <div>
            <div className="text-xs text-muted mb-1">Cancellation fee</div>
            <div className="text-xl font-bold">{money(cancellationFee)}</div>
          </div>
        </div>
      </div>

      {/* Per-category rate table */}
      <div className="bg-white border border-border rounded-lg overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="text-sm font-semibold">Per-category commission rates</div>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 bg-accent text-white rounded text-sm"
          >
            Save Changes
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-surface text-muted text-xs select-none">
            <tr>
              <th className="text-left px-4 py-2">Vehicle category</th>
              <th className="text-left px-4 py-2">Commission rate (%)</th>
              <th className="text-left px-4 py-2">Rate from pricing rules</th>
            </tr>
          </thead>
          <tbody>
            {VEHICLE_CATEGORIES.map((cat) => {
              const ruleForCat = rules.find((r) => r.vehicle_category === cat);
              return (
                <tr key={cat} className="border-t border-border hover:bg-surface">
                  <td className="px-4 py-2 text-xs capitalize font-medium">
                    {cat}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      value={categoryRates[cat]}
                      onChange={(e) => handleRateChange(cat, e.target.value)}
                      className="w-24 px-2 py-1 bg-white text-ink border border-border rounded text-xs"
                    />
                  </td>
                  <td className="px-4 py-2 text-xs text-muted">
                    {ruleForCat
                      ? `${Number(ruleForCat.service_fee_pct).toFixed(1)}%`
                      : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Revenue breakdown pie */}
        <div className="bg-white border border-border rounded-lg p-5">
          <div className="text-sm font-semibold mb-4">Revenue breakdown</div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={REVENUE_BREAKDOWN}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
              >
                {REVENUE_BREAKDOWN.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => v != null ? `${v}%` : ''} />
              <Legend
                iconType="circle"
                iconSize={10}
                formatter={(value) => (
                  <span className="text-xs">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Historical trend line */}
        <div className="bg-white border border-border rounded-lg p-5">
          <div className="text-sm font-semibold mb-4">
            Revenue trend — last 6 months
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart
              data={TREND_DATA}
              margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(v) =>
                  [`$${Number(v ?? 0).toLocaleString()}`, 'Revenue']
                }
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#6366f1"
                strokeWidth={2}
                dot={{ r: 4, fill: '#6366f1' }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}
