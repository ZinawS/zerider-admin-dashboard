import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { useToast } from '../../components/Toast';
import { useDebounced } from '../../hooks/useDebounced';

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtEtb(cents: number | null | undefined) {
  if (cents == null) return '—';
  return `ETB ${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── types ───────────────────────────────────────────────────────────────────

interface Catalog {
  id: string;
  merchant_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

interface Product {
  id: string;
  merchant_id: string;
  catalog_id: string | null;
  name: string;
  description: string | null;
  price_cents: number;
  compare_at_cents: number | null;
  image_url: string | null;
  sku: string | null;
  inventory_count: number | null;
  is_available: boolean;
  category: string | null;
  tags: string[];
  created_at: string;
  updated_at: string | null;
}

interface Merchant { id: string; business_name: string; status: string; }

// ─── catalog form ─────────────────────────────────────────────────────────────

interface CatalogFormProps {
  merchantId: string;
  existing?: Catalog | null;
  onDone: () => void;
  onCancel: () => void;
}

function CatalogForm({ merchantId, existing, onDone, onCancel }: CatalogFormProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [sortOrder, setSortOrder] = useState(String(existing?.sort_order ?? 0));
  const [isActive, setIsActive] = useState(existing?.is_active ?? true);

  const mutation = useMutation({
    mutationFn: () => existing
      ? api(`/v1/admin/merchants/${merchantId}/catalogs/${existing.id}`, {
          method: 'PATCH',
          body: { name: name.trim(), description: description.trim() || undefined, sort_order: +sortOrder, is_active: isActive },
        })
      : api(`/v1/admin/merchants/${merchantId}/catalogs`, {
          method: 'POST',
          body: { name: name.trim(), description: description.trim() || undefined, sort_order: +sortOrder },
        }),
    onSuccess: () => {
      toast(existing ? 'Catalog updated.' : 'Catalog created.', 'success');
      qc.invalidateQueries({ queryKey: ['admin-catalogs', merchantId] });
      onDone();
    },
    onError: (e: any) => toast('Failed: ' + (e?.message ?? 'error'), 'error'),
  });

  return (
    <div className="bg-bg border border-border rounded-xl p-4 space-y-3">
      <div className="text-xs font-semibold text-ink">{existing ? 'Edit catalog' : 'New catalog'}</div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Catalog name *"
        className="w-full border border-border rounded px-3 py-2 text-sm"
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="w-full border border-border rounded px-3 py-2 text-sm"
      />
      <div className="flex gap-3 items-center">
        <div className="flex-1">
          <label className="block text-xs text-muted mb-1">Sort order</label>
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="w-full border border-border rounded px-3 py-2 text-sm"
          />
        </div>
        {existing && (
          <label className="flex items-center gap-2 text-sm cursor-pointer pt-4">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active
          </label>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => mutation.mutate()}
          disabled={!name.trim() || mutation.isPending}
          className="flex-1 px-3 py-2 bg-ink text-white rounded text-xs hover:bg-ink/90 disabled:opacity-60"
        >
          {mutation.isPending ? 'Saving…' : existing ? 'Save changes' : 'Create catalog'}
        </button>
        <button onClick={onCancel} className="px-3 py-2 border border-border rounded text-xs hover:bg-surface">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── product form ─────────────────────────────────────────────────────────────

interface ProductFormProps {
  merchantId: string;
  catalogs: Catalog[];
  existing?: Product | null;
  defaultCatalogId?: string | null;
  onDone: () => void;
  onCancel: () => void;
}

function ProductForm({ merchantId, catalogs, existing, defaultCatalogId, onDone, onCancel }: ProductFormProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [priceCents, setPriceCents] = useState(existing ? String(existing.price_cents / 100) : '');
  const [compareAtCents, setCompareAtCents] = useState(
    existing?.compare_at_cents != null ? String(existing.compare_at_cents / 100) : '',
  );
  const [catalogId, setCatalogId] = useState(existing?.catalog_id ?? defaultCatalogId ?? '');
  const [sku, setSku] = useState(existing?.sku ?? '');
  const [category, setCategory] = useState(existing?.category ?? '');
  const [inventoryCount, setInventoryCount] = useState(
    existing?.inventory_count != null ? String(existing.inventory_count) : '',
  );
  const [imageUrl, setImageUrl] = useState(existing?.image_url ?? '');
  const [isAvailable, setIsAvailable] = useState(existing?.is_available ?? true);

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
        price_cents: Math.round(parseFloat(priceCents) * 100),
        compare_at_cents: compareAtCents ? Math.round(parseFloat(compareAtCents) * 100) : undefined,
        catalog_id: catalogId || undefined,
        sku: sku.trim() || undefined,
        category: category.trim() || undefined,
        inventory_count: inventoryCount !== '' ? parseInt(inventoryCount, 10) : undefined,
        image_url: imageUrl.trim() || undefined,
        is_available: isAvailable,
      };
      return existing
        ? api(`/v1/admin/merchants/${merchantId}/products/${existing.id}`, { method: 'PATCH', body })
        : api(`/v1/admin/merchants/${merchantId}/products`, { method: 'POST', body });
    },
    onSuccess: () => {
      toast(existing ? 'Product updated.' : 'Product created.', 'success');
      qc.invalidateQueries({ queryKey: ['admin-products', merchantId] });
      onDone();
    },
    onError: (e: any) => toast('Failed: ' + (e?.message ?? 'error'), 'error'),
  });

  const priceValid = priceCents !== '' && !isNaN(parseFloat(priceCents)) && parseFloat(priceCents) >= 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs text-muted mb-1">Product name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Tibs with Injera"
            className="w-full border border-border rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Price (ETB) *</label>
          <input
            type="number" min="0" step="0.01"
            value={priceCents}
            onChange={(e) => setPriceCents(e.target.value)}
            placeholder="0.00"
            className="w-full border border-border rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Compare-at price (ETB)</label>
          <input
            type="number" min="0" step="0.01"
            value={compareAtCents}
            onChange={(e) => setCompareAtCents(e.target.value)}
            placeholder="Optional"
            className="w-full border border-border rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Catalog</label>
          <select
            value={catalogId}
            onChange={(e) => setCatalogId(e.target.value)}
            className="w-full border border-border rounded px-3 py-2 text-sm"
          >
            <option value="">— No catalog —</option>
            {catalogs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Category</label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Main dish"
            className="w-full border border-border rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">SKU</label>
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="Optional"
            className="w-full border border-border rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Inventory (blank = unlimited)</label>
          <input
            type="number" min="0"
            value={inventoryCount}
            onChange={(e) => setInventoryCount(e.target.value)}
            placeholder="Unlimited"
            className="w-full border border-border rounded px-3 py-2 text-sm"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-muted mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
            rows={2}
            className="w-full border border-border rounded px-3 py-2 text-sm resize-none"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-muted mb-1">Image URL</label>
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…"
            className="w-full border border-border rounded px-3 py-2 text-sm"
          />
        </div>
        <div className="col-span-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={isAvailable} onChange={(e) => setIsAvailable(e.target.checked)} />
            Available for ordering
          </label>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => mutation.mutate()}
          disabled={!name.trim() || !priceValid || mutation.isPending}
          className="flex-1 px-3 py-2 bg-ink text-white rounded text-sm hover:bg-ink/90 disabled:opacity-60"
        >
          {mutation.isPending ? 'Saving…' : existing ? 'Save changes' : 'Create product'}
        </button>
        <button onClick={onCancel} className="px-3 py-2 border border-border rounded text-sm hover:bg-bg">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

export function MerchantCatalogPage(): JSX.Element {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const merchantIdParam = searchParams.get('merchant') ?? '';
  const [merchantInput, setMerchantInput] = useState(merchantIdParam);
  const [activeMerchantId, setActiveMerchantId] = useState(merchantIdParam);
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const debouncedSearch = useDebounced(productSearch, 300);

  // UI state
  const [showNewCatalog, setShowNewCatalog] = useState(false);
  const [editingCatalog, setEditingCatalog] = useState<Catalog | null>(null);
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingCatalogId, setDeletingCatalogId] = useState<string | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);

  // Sync URL param when merchant changes
  useEffect(() => {
    if (activeMerchantId) setSearchParams({ merchant: activeMerchantId }, { replace: true });
  }, [activeMerchantId]);

  // Merchant info
  const { data: merchant } = useQuery<Merchant>({
    queryKey: ['admin-merchant-info', activeMerchantId],
    queryFn: () => api<Merchant>(`/v1/admin/merchants/${activeMerchantId}`),
    enabled: !!activeMerchantId,
    staleTime: 5 * 60_000,
    retry: false,
  });

  // Catalogs
  const { data: catalogs = [], isLoading: catalogsLoading } = useQuery<Catalog[]>({
    queryKey: ['admin-catalogs', activeMerchantId],
    queryFn: () => api<Catalog[]>(`/v1/admin/merchants/${activeMerchantId}/catalogs`),
    enabled: !!activeMerchantId,
    staleTime: 60_000,
  });

  // Products
  const productQs = new URLSearchParams({
    limit: '200',
    offset: '0',
    ...(selectedCatalogId && { catalog: selectedCatalogId }),
    ...(debouncedSearch && { search: debouncedSearch }),
  }).toString();

  const { data: products = [], isLoading: productsLoading, refetch: refetchProducts } = useQuery<Product[]>({
    queryKey: ['admin-products', activeMerchantId, selectedCatalogId, debouncedSearch],
    queryFn: () => api<Product[]>(`/v1/admin/merchants/${activeMerchantId}/products?${productQs}`),
    enabled: !!activeMerchantId,
    staleTime: 30_000,
  });

  // Mutations
  const toggleAvailability = useMutation({
    mutationFn: (p: Product) => api(`/v1/admin/merchants/${activeMerchantId}/products/${p.id}/availability`, {
      method: 'PATCH',
      body: { is_available: !p.is_available },
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-products', activeMerchantId] }),
    onError: (e: any) => toast('Failed: ' + (e?.message ?? 'error'), 'error'),
  });

  const deleteProduct = useMutation({
    mutationFn: (id: string) => api(`/v1/admin/merchants/${activeMerchantId}/products/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast('Product deleted.', 'success');
      setDeletingProductId(null);
      qc.invalidateQueries({ queryKey: ['admin-products', activeMerchantId] });
    },
    onError: (e: any) => toast('Delete failed: ' + (e?.message ?? 'error'), 'error'),
  });

  const deleteCatalog = useMutation({
    mutationFn: (id: string) => api(`/v1/admin/merchants/${activeMerchantId}/catalogs/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast('Catalog deleted.', 'success');
      setDeletingCatalogId(null);
      if (selectedCatalogId === deletingCatalogId) setSelectedCatalogId(null);
      qc.invalidateQueries({ queryKey: ['admin-catalogs', activeMerchantId] });
    },
    onError: (e: any) => toast('Delete failed: ' + (e?.message ?? 'error'), 'error'),
  });

  function loadMerchant() {
    const id = merchantInput.trim();
    if (!id) return;
    setActiveMerchantId(id);
    setSelectedCatalogId(null);
    setProductSearch('');
    setShowNewCatalog(false);
    setShowNewProduct(false);
    setEditingCatalog(null);
    setEditingProduct(null);
  }

  const activeCatalog = catalogs.find((c) => c.id === selectedCatalogId);

  return (
    <div>
      <PageHeader title="Merchant Catalog" subtitle="Manage catalogs and products for any merchant" />

      {/* ── Merchant selector ── */}
      <div className="flex gap-3 mb-6 items-end">
        <div className="flex-1 max-w-md">
          <label className="block text-xs text-muted mb-1">Merchant ID</label>
          <input
            value={merchantInput}
            onChange={(e) => setMerchantInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadMerchant()}
            placeholder="Paste a merchant UUID…"
            className="w-full border border-border rounded px-3 py-2 text-sm"
          />
        </div>
        <button
          onClick={loadMerchant}
          disabled={!merchantInput.trim()}
          className="px-4 py-2 bg-ink text-white rounded text-sm hover:bg-ink/90 disabled:opacity-50"
        >
          Load catalog
        </button>
        {merchant && (
          <div className="text-sm">
            <span className="font-medium">{merchant.business_name}</span>
            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${merchant.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {merchant.status}
            </span>
          </div>
        )}
      </div>

      {!activeMerchantId && (
        <div className="text-center text-muted py-20 text-sm">
          Enter a merchant ID above to manage their catalog.
        </div>
      )}

      {activeMerchantId && (
        <div className="flex gap-6">

          {/* ── LEFT: Catalogs panel ── */}
          <div className="w-56 shrink-0 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs font-semibold text-muted uppercase tracking-wide">Catalogs</div>
              <button
                onClick={() => { setShowNewCatalog(true); setEditingCatalog(null); }}
                className="text-xs text-indigo-600 hover:underline"
              >
                + New
              </button>
            </div>

            {showNewCatalog && (
              <CatalogForm
                merchantId={activeMerchantId}
                onDone={() => setShowNewCatalog(false)}
                onCancel={() => setShowNewCatalog(false)}
              />
            )}

            {catalogsLoading && <div className="text-xs text-muted py-2">Loading…</div>}

            {/* All products option */}
            <button
              onClick={() => setSelectedCatalogId(null)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedCatalogId === null ? 'bg-ink text-white' : 'hover:bg-bg text-ink'}`}
            >
              All products
              <span className={`ml-1 text-xs ${selectedCatalogId === null ? 'text-white/70' : 'text-muted'}`}>
                ({products.length})
              </span>
            </button>

            {catalogs.map((c) => (
              <div key={c.id}>
                {editingCatalog?.id === c.id ? (
                  <CatalogForm
                    merchantId={activeMerchantId}
                    existing={c}
                    onDone={() => setEditingCatalog(null)}
                    onCancel={() => setEditingCatalog(null)}
                  />
                ) : (
                  <div
                    className={`group relative px-3 py-2 rounded-lg cursor-pointer transition-colors ${selectedCatalogId === c.id ? 'bg-ink text-white' : 'hover:bg-bg text-ink'}`}
                    onClick={() => setSelectedCatalogId(c.id)}
                  >
                    <div className="text-sm font-medium truncate pr-8">{c.name}</div>
                    {!c.is_active && (
                      <span className="text-[10px] text-amber-400">Inactive</span>
                    )}
                    {/* Edit / delete hover actions */}
                    <div className={`absolute right-2 top-2 hidden group-hover:flex gap-1 ${selectedCatalogId === c.id ? '' : ''}`}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingCatalog(c); setShowNewCatalog(false); }}
                        className={`text-[10px] px-1 py-0.5 rounded hover:bg-white/20 ${selectedCatalogId === c.id ? 'text-white' : 'text-muted'}`}
                        title="Edit"
                      >
                        ✎
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeletingCatalogId(c.id); }}
                        className={`text-[10px] px-1 py-0.5 rounded hover:bg-white/20 ${selectedCatalogId === c.id ? 'text-white' : 'text-red-400'}`}
                        title="Delete"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}

                {/* Delete catalog confirm */}
                {deletingCatalogId === c.id && (
                  <div className="mx-1 my-1 p-2 bg-red-50 border border-red-200 rounded text-xs space-y-1">
                    <div className="text-red-700 font-medium">Delete "{c.name}"?</div>
                    <div className="text-red-600">Products in this catalog will become uncategorized.</div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => deleteCatalog.mutate(c.id)}
                        disabled={deleteCatalog.isPending}
                        className="px-2 py-1 bg-red-600 text-white rounded text-[10px] hover:bg-red-700 disabled:opacity-60"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setDeletingCatalogId(null)}
                        className="px-2 py-1 border border-border rounded text-[10px]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ── RIGHT: Products panel ── */}
          <div className="flex-1 min-w-0">
            {/* Products header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="font-semibold text-sm">
                {activeCatalog ? activeCatalog.name : 'All products'}
                <span className="ml-2 text-muted font-normal text-xs">({products.length} items)</span>
              </div>
              <input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search products…"
                className="ml-auto text-sm px-3 py-1.5 border border-border rounded bg-surface w-44"
              />
              <button
                onClick={() => { setShowNewProduct(true); setEditingProduct(null); }}
                className="px-3 py-1.5 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700"
              >
                + Add product
              </button>
            </div>

            {/* New / edit product inline form */}
            {(showNewProduct || editingProduct) && (
              <div className="bg-surface border border-border rounded-xl p-5 mb-4">
                <div className="text-xs font-semibold text-ink mb-3">
                  {editingProduct ? `Editing: ${editingProduct.name}` : 'New product'}
                </div>
                <ProductForm
                  merchantId={activeMerchantId}
                  catalogs={catalogs}
                  existing={editingProduct}
                  defaultCatalogId={selectedCatalogId}
                  onDone={() => { setShowNewProduct(false); setEditingProduct(null); }}
                  onCancel={() => { setShowNewProduct(false); setEditingProduct(null); }}
                />
              </div>
            )}

            {/* Products table */}
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-bg">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted">Product</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted">Price</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted">Catalog</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted">Inventory</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted">Available</th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted"></th>
                  </tr>
                </thead>
                <tbody>
                  {productsLoading && (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">Loading…</td></tr>
                  )}
                  {!productsLoading && products.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-muted">
                        {debouncedSearch ? 'No products match the search.' : 'No products yet. Add one above.'}
                      </td>
                    </tr>
                  )}
                  {products.map((p, i) => {
                    const cat = catalogs.find((c) => c.id === p.catalog_id);
                    return (
                      <tr key={p.id} className={i % 2 ? 'bg-bg/20' : ''}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {p.image_url && (
                              <img src={p.image_url} alt="" className="w-8 h-8 rounded object-cover border border-border shrink-0" />
                            )}
                            <div>
                              <div className="font-medium">{p.name}</div>
                              {p.sku && <div className="text-xs text-muted">SKU: {p.sku}</div>}
                              {p.category && <div className="text-xs text-muted">{p.category}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                          <div className="font-medium">{fmtEtb(p.price_cents)}</div>
                          {p.compare_at_cents && (
                            <div className="text-xs text-muted line-through">{fmtEtb(p.compare_at_cents)}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted">{cat?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs">
                          {p.inventory_count != null ? p.inventory_count : '∞'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => toggleAvailability.mutate(p)}
                            className={`w-10 h-5 rounded-full transition-colors relative ${p.is_available ? 'bg-emerald-500' : 'bg-gray-300'}`}
                            title={p.is_available ? 'Available — click to hide' : 'Hidden — click to show'}
                          >
                            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${p.is_available ? 'right-0.5' : 'left-0.5'}`} />
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => { setEditingProduct(p); setShowNewProduct(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                              className="text-xs px-2 py-1 border border-border rounded hover:bg-bg"
                            >
                              Edit
                            </button>
                            {deletingProductId === p.id ? (
                              <div className="flex gap-1">
                                <button
                                  onClick={() => deleteProduct.mutate(p.id)}
                                  disabled={deleteProduct.isPending}
                                  className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-60"
                                >
                                  {deleteProduct.isPending ? '…' : 'Confirm'}
                                </button>
                                <button
                                  onClick={() => setDeletingProductId(null)}
                                  className="text-xs px-2 py-1 border border-border rounded hover:bg-bg"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeletingProductId(p.id)}
                                className="text-xs px-2 py-1 border border-red-200 text-red-500 rounded hover:bg-red-50"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
