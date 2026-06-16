import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { PageHeader } from '../../components/PageHeader.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Listing {
  id: string;
  title: string;
  category: string;
  type: string;
  status: string;
  user_id: string;
  price_cents: number | null;
  created_at: string;
  city?: string;
  views?: number;
  contact_count?: number;
}

interface ListingsResponse {
  items: Listing[];
  total: number;
}

type FeeTier = 'free' | 'basic' | 'premium' | 'top';

const FEE_TIERS: { value: FeeTier; label: string; price: string }[] = [
  { value: 'free', label: 'Free', price: '$0' },
  { value: 'basic', label: 'Basic', price: '$4.99' },
  { value: 'premium', label: 'Premium', price: '$9.99' },
  { value: 'top', label: 'Top Spot', price: '$19.99' },
];

const MOCK_REVENUE = '$1,234';

// ---------------------------------------------------------------------------
// Metric card
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}): JSX.Element {
  return (
    <div className="bg-white border border-border rounded-lg p-4">
      <div className="text-xs text-muted mb-1">{label}</div>
      <div className="text-2xl font-semibold text-ink">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function FeaturedListingsPage(): JSX.Element {
  const [categoryFilter, setCategoryFilter] = useState('');
  const [featuredIds, setFeaturedIds] = useState<Set<string>>(new Set());
  const [feeTiers, setFeeTiers] = useState<Record<string, FeeTier>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['featured-listings'],
    queryFn: () =>
      api<ListingsResponse>('/v1/admin/listings?status=approved&page=1&limit=50'),
    retry: false,
  });

  const items: Listing[] = data?.items ?? [];
  const total = data?.total ?? items.length;
  const featuredCount = featuredIds.size;

  const categories = Array.from(new Set(items.map((l) => l.category).filter(Boolean)));

  const filtered = categoryFilter
    ? items.filter((l) => l.category === categoryFilter)
    : items;

  const toggleFeatured = (id: string) => {
    setFeaturedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const setFeeTier = (id: string, tier: FeeTier) => {
    setFeeTiers((prev) => ({ ...prev, [id]: tier }));
  };

  return (
    <>
      <PageHeader
        title="Featured Listings"
        subtitle="Boost visibility for paid placements."
      />

      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <MetricCard label="Total Listings" value={total} />
        <MetricCard label="Featured" value={featuredCount} />
        <MetricCard label="Revenue (mock)" value={MOCK_REVENUE} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-1.5 text-xs bg-white text-ink border border-border rounded"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {categoryFilter && (
          <button
            onClick={() => setCategoryFilter('')}
            className="text-xs text-accent hover:underline"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-xs text-muted self-center">
          {filtered.length} listing{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white border border-border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface text-muted text-xs select-none">
            <tr>
              <th className="text-left px-3 py-2">Title</th>
              <th className="text-left px-3 py-2">Category</th>
              <th className="text-left px-3 py-2">City</th>
              <th className="text-right px-3 py-2">Price</th>
              <th className="text-right px-3 py-2">Views</th>
              <th className="text-right px-3 py-2">Contacts</th>
              <th className="text-left px-3 py-2">Fee tier</th>
              <th className="text-left px-3 py-2">Featured</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-t border-border">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-3 py-2">
                        <div className="h-3 bg-surface animate-pulse rounded w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              : filtered.length === 0
              ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-8 text-center text-muted"
                  >
                    {isLoading ? 'Loading…' : 'No approved listings found.'}
                  </td>
                </tr>
              )
              : filtered.map((l) => {
                  const isFeatured = featuredIds.has(l.id);
                  const tier = feeTiers[l.id] ?? 'free';
                  return (
                    <tr
                      key={l.id}
                      className={`border-t border-border ${
                        isFeatured
                          ? 'bg-amber-50 hover:bg-amber-100'
                          : 'hover:bg-surface'
                      }`}
                    >
                      <td className="px-3 py-2 text-xs max-w-[180px]">
                        <div className="flex items-center gap-1.5 truncate">
                          {isFeatured && (
                            <span
                              className="text-amber-500 flex-shrink-0"
                              title="Featured"
                            >
                              &#9733;
                            </span>
                          )}
                          <span className="truncate">{l.title}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs capitalize">
                        {l.category}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted">
                        {l.city ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-xs">
                        {l.price_cents != null
                          ? `$${(l.price_cents / 100).toFixed(2)}`
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-muted">
                        {l.views ?? 0}
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-muted">
                        {l.contact_count ?? 0}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <select
                          value={tier}
                          onChange={(e) =>
                            setFeeTier(l.id, e.target.value as FeeTier)
                          }
                          className="text-xs px-2 py-1 bg-white text-ink border border-border rounded"
                        >
                          {FEE_TIERS.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label} {t.price}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <button
                          onClick={() => toggleFeatured(l.id)}
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            isFeatured
                              ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {isFeatured ? 'Featured' : 'Set featured'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
    </>
  );
}
