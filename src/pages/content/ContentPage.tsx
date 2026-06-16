import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { PageHeader } from '../../components/PageHeader.js';

type Section = 'faq_rider' | 'faq_driver' | 'terms' | 'privacy';

interface ContentItem {
  id: string;
  section: Section;
  heading: string;
  body: string;
  sort_order: number;
  updated_at: string;
}

interface SectionSummary {
  section: Section;
  item_count: number;
  last_updated: string | null;
}

const SECTION_LABELS: Record<Section, string> = {
  faq_rider: 'Rider FAQ',
  faq_driver: 'Driver FAQ',
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
};

const SECTION_HELP: Record<Section, string> = {
  faq_rider: 'Questions displayed in the Rider app Help screen. Each item is one question + answer.',
  faq_driver: 'Questions displayed in the Driver app Help screen. Each item is one question + answer.',
  terms: 'Sections displayed in the Terms of Service screen in both apps. Each item is one numbered section.',
  privacy: 'Sections displayed in the Privacy Policy screen in both apps. Each item is one numbered section.',
};

const SECTIONS: Section[] = ['faq_rider', 'faq_driver', 'terms', 'privacy'];

const BLANK = { heading: '', body: '' };

export function ContentPage(): JSX.Element {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Section>('faq_rider');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState(BLANK);
  const [adding, setAdding] = useState(false);
  const [addDraft, setAddDraft] = useState(BLANK);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data: summaries } = useQuery<SectionSummary[]>({
    queryKey: ['content-sections'],
    queryFn: () => api('/v1/admin/content'),
  });

  const { data, isLoading, isError, error } = useQuery<{ section: Section; items: ContentItem[] }>({
    queryKey: ['content-items', activeTab],
    queryFn: () => api(`/v1/admin/content/${activeTab}`),
    retry: 1,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['content-items', activeTab] });
    qc.invalidateQueries({ queryKey: ['content-sections'] });
  };

  const createMutation = useMutation({
    mutationFn: (body: { heading: string; body: string }) =>
      api(`/v1/admin/content/${activeTab}`, { method: 'POST', body }),
    onSuccess: () => { invalidate(); setAdding(false); setAddDraft(BLANK); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { heading?: string; body?: string } }) =>
      api(`/v1/admin/content/items/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: () => { invalidate(); setEditingId(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/v1/admin/content/items/${id}`, { method: 'DELETE' }),
    onSuccess: () => { invalidate(); setDeleteConfirm(null); },
  });

  const items = data?.items ?? [];
  const summaryMap = Object.fromEntries((summaries ?? []).map((s) => [s.section, s]));

  const startEdit = (item: ContentItem) => {
    setEditingId(item.id);
    setEditDraft({ heading: item.heading, body: item.body });
    setAdding(false);
  };

  const cancelEdit = () => { setEditingId(null); setEditDraft(BLANK); };

  return (
    <>
      <div className="mb-6">
        <PageHeader
          title="App Content"
          subtitle="Manage FAQ questions, Terms of Service, and Privacy Policy shown in the rider and driver apps."
        />
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 border-b border-border mb-6">
        {SECTIONS.map((section) => {
          const summary = summaryMap[section];
          return (
            <button
              key={section}
              onClick={() => { setActiveTab(section); setEditingId(null); setAdding(false); }}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === section
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {SECTION_LABELS[section]}
              {summary && (
                <span className="ml-1.5 text-xs text-muted">({summary.item_count})</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Help text */}
      <p className="text-xs text-muted mb-4">{SECTION_HELP[activeTab]}</p>

      {/* Add new button */}
      <div className="flex justify-end mb-4">
        {!adding && (
          <button
            onClick={() => { setAdding(true); setAddDraft(BLANK); setEditingId(null); }}
            className="px-4 py-2 bg-accent text-white text-sm rounded"
          >
            + Add new
          </button>
        )}
      </div>

      {/* Add form */}
      {adding && (
        <div className="mb-6 border border-accent/40 rounded-lg p-4 bg-accent/5">
          <h3 className="text-sm font-semibold mb-3">New item</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-muted mb-1">
                {activeTab.startsWith('faq') ? 'Question' : 'Section heading'}
              </label>
              <input
                value={addDraft.heading}
                onChange={(e) => setAddDraft({ ...addDraft, heading: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded text-sm"
                placeholder={activeTab.startsWith('faq') ? 'How do I…?' : '1. Section Title'}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">
                {activeTab.startsWith('faq') ? 'Answer' : 'Content'}
              </label>
              <textarea
                value={addDraft.body}
                onChange={(e) => setAddDraft({ ...addDraft, body: e.target.value })}
                rows={4}
                className="w-full px-3 py-2 border border-border rounded text-sm resize-y"
              />
            </div>
            {createMutation.isError && (
              <p className="text-xs text-danger">{String((createMutation.error as any)?.message ?? 'Error')}</p>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setAdding(false)} className="px-3 py-1.5 text-sm border border-border rounded hover:bg-surface">Cancel</button>
              <button
                disabled={!addDraft.heading.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate(addDraft)}
                className="px-3 py-1.5 text-sm bg-accent text-white rounded disabled:opacity-40"
              >
                {createMutation.isPending ? 'Adding…' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Items list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border border-border rounded-lg p-4 animate-pulse">
              <div className="h-4 bg-surface2 rounded w-2/3 mb-2" />
              <div className="h-3 bg-surface2 rounded w-full mb-1" />
              <div className="h-3 bg-surface2 rounded w-4/5" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="border border-red-200 bg-red-50 rounded-lg p-4">
          <p className="text-sm font-semibold text-red-700 mb-1">Failed to load items</p>
          <p className="text-xs text-red-600">
            {(error as any)?.message ?? 'Unknown error — check that the auth service is running and migrations have been applied (pnpm db:migrate).'}
          </p>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ['content-items', activeTab] })}
            className="mt-3 text-xs text-red-700 underline"
          >
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="text-muted text-sm italic">No items yet. Click "+ Add new" to create the first one.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="border border-border rounded-lg bg-white overflow-hidden">
              {editingId === item.id ? (
                /* ── Edit form ── */
                <div className="p-4 space-y-3">
                  <div>
                    <label className="block text-xs text-muted mb-1">
                      {activeTab.startsWith('faq') ? 'Question' : 'Section heading'}
                    </label>
                    <input
                      value={editDraft.heading}
                      onChange={(e) => setEditDraft({ ...editDraft, heading: e.target.value })}
                      className="w-full px-3 py-2 border border-border rounded text-sm"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted mb-1">
                      {activeTab.startsWith('faq') ? 'Answer' : 'Content'}
                    </label>
                    <textarea
                      value={editDraft.body}
                      onChange={(e) => setEditDraft({ ...editDraft, body: e.target.value })}
                      rows={5}
                      className="w-full px-3 py-2 border border-border rounded text-sm resize-y"
                    />
                  </div>
                  {updateMutation.isError && (
                    <p className="text-xs text-danger">{String((updateMutation.error as any)?.message ?? 'Error')}</p>
                  )}
                  <div className="flex gap-2 justify-end">
                    <button onClick={cancelEdit} className="px-3 py-1.5 text-sm border border-border rounded hover:bg-surface">Cancel</button>
                    <button
                      disabled={!editDraft.heading.trim() || updateMutation.isPending}
                      onClick={() => updateMutation.mutate({ id: item.id, patch: editDraft })}
                      className="px-3 py-1.5 text-sm bg-accent text-white rounded disabled:opacity-40"
                    >
                      {updateMutation.isPending ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Read view ── */
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink">{item.heading}</p>
                      {item.body && (
                        <p className="text-sm text-muted mt-1 whitespace-pre-wrap line-clamp-3">{item.body}</p>
                      )}
                      <p className="text-xs text-muted mt-2">
                        Updated {new Date(item.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => startEdit(item)}
                        className="px-3 py-1 text-xs border border-border rounded hover:bg-surface"
                      >
                        Edit
                      </button>
                      {deleteConfirm === item.id ? (
                        <>
                          <button
                            onClick={() => deleteMutation.mutate(item.id)}
                            disabled={deleteMutation.isPending}
                            className="px-3 py-1 text-xs bg-danger text-white rounded disabled:opacity-50"
                          >
                            {deleteMutation.isPending ? 'Deleting…' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="px-3 py-1 text-xs border border-border rounded hover:bg-surface"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(item.id)}
                          className="px-3 py-1 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
