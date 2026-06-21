// Currency formatting by region currency_code
export function formatCurrency(cents: number, currencyCode = 'USD'): string {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode, minimumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

// Distance formatting by unit ('km' | 'mi')
export function formatDistance(meters: number, unit: 'km' | 'mi' = 'km'): string {
  if (unit === 'mi') return `${(meters / 1609.34).toFixed(1)} mi`;
  return `${(meters / 1000).toFixed(1)} km`;
}

// Date formatting
export function formatDate(iso: string, locale?: string): string {
  return new Date(iso).toLocaleDateString(locale ?? undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(iso: string, locale?: string): string {
  return new Date(iso).toLocaleString(locale ?? undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Relative time
export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
