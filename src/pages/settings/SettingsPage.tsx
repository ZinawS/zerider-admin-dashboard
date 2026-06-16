import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { PageHeader } from '../../components/PageHeader.js';

interface ContactsValue {
  [key: string]: string;
}

const DEFAULT_KEYS = [
  { key: 'support_email', label: 'Support email', placeholder: 'support@zerider.com' },
  { key: 'support_phone', label: 'Support phone', placeholder: '+1-800-ZERIDER' },
  { key: 'emergency', label: 'Emergency number', placeholder: '911' },
  { key: 'whatsapp', label: 'WhatsApp number', placeholder: '+15005550006' },
];

export function SettingsPage(): JSX.Element {
  const qc = useQueryClient();

  const { data: allSettings, isLoading, isError } = useQuery<Record<string, any>>({
    queryKey: ['platform-settings'],
    queryFn: () => api('/v1/admin/settings'),
    retry: false,
  });

  const contacts: ContactsValue = allSettings?.contacts ?? {};

  const [draft, setDraft] = useState<ContactsValue | null>(null);
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const [addingCustom, setAddingCustom] = useState(false);

  const editing = draft ?? contacts;

  const saveMutation = useMutation({
    mutationFn: (value: ContactsValue) =>
      api('/v1/admin/settings/contacts', { method: 'POST', body: { value } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-settings'] });
      setDraft(null);
    },
  });

  const handleChange = (key: string, value: string) => {
    setDraft({ ...editing, [key]: value });
  };

  const handleRemove = (key: string) => {
    const next = { ...editing };
    delete next[key];
    setDraft(next);
  };

  const handleAddCustom = () => {
    const k = newKey.trim().toLowerCase().replace(/\s+/g, '_');
    if (!k || !newVal.trim()) return;
    setDraft({ ...editing, [k]: newVal.trim() });
    setNewKey('');
    setNewVal('');
    setAddingCustom(false);
  };

  const isDirty = draft !== null;

  // Keys that are already in the contacts object but not in DEFAULT_KEYS
  const defaultKeyNames = DEFAULT_KEYS.map((d) => d.key);
  const customKeys = Object.keys(editing).filter((k) => !defaultKeyNames.includes(k));

  return (
    <div>
      <PageHeader
        title="Platform settings"
        subtitle="Manage contact details displayed in the mobile apps."
      />

      <div className="max-w-2xl space-y-8">
        {/* Contact info card */}
        <section className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-ink">Contact information</h2>
              <p className="text-xs text-muted mt-0.5">Shown on the Help screen in both rider and driver apps.</p>
            </div>
            {isDirty && (
              <div className="flex gap-2">
                <button
                  onClick={() => setDraft(null)}
                  className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-border/30"
                >
                  Discard
                </button>
                <button
                  onClick={() => saveMutation.mutate(editing)}
                  disabled={saveMutation.isPending}
                  className="px-3 py-1.5 text-sm bg-ink text-white rounded-lg hover:opacity-80 disabled:opacity-50"
                >
                  {saveMutation.isPending ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="px-6 py-8 text-center text-muted text-sm">Loading…</div>
          ) : isError ? (
            <div className="px-6 py-8 text-center text-muted text-sm">
              Could not load settings. Check that the admin service is running.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {/* Standard fields */}
              {DEFAULT_KEYS.map(({ key, label, placeholder }) => (
                <div key={key} className="px-6 py-4 flex items-center gap-4">
                  <label className="w-40 text-sm font-medium text-ink shrink-0">{label}</label>
                  <input
                    type="text"
                    value={editing[key] ?? ''}
                    onChange={(e) => handleChange(key, e.target.value)}
                    placeholder={placeholder}
                    className="flex-1 text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                  {editing[key] && (
                    <button
                      onClick={() => handleRemove(key)}
                      className="text-danger text-xs hover:underline shrink-0"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}

              {/* Custom fields */}
              {customKeys.map((key) => (
                <div key={key} className="px-6 py-4 flex items-center gap-4">
                  <label className="w-40 text-sm font-medium text-ink shrink-0 capitalize">
                    {key.replace(/_/g, ' ')}
                  </label>
                  <input
                    type="text"
                    value={editing[key] ?? ''}
                    onChange={(e) => handleChange(key, e.target.value)}
                    className="flex-1 text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                  <button
                    onClick={() => handleRemove(key)}
                    className="text-danger text-xs hover:underline shrink-0"
                  >
                    Remove
                  </button>
                </div>
              ))}

              {/* Add custom field */}
              {addingCustom ? (
                <div className="px-6 py-4 flex items-center gap-3">
                  <input
                    type="text"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder="Field name (e.g. billing_email)"
                    className="w-44 text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                  <input
                    type="text"
                    value={newVal}
                    onChange={(e) => setNewVal(e.target.value)}
                    placeholder="Value"
                    className="flex-1 text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-accent/40"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCustom()}
                  />
                  <button
                    onClick={handleAddCustom}
                    className="px-3 py-2 text-sm bg-ink text-white rounded-lg hover:opacity-80"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => { setAddingCustom(false); setNewKey(''); setNewVal(''); }}
                    className="text-muted text-sm hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="px-6 py-3">
                  <button
                    onClick={() => setAddingCustom(true)}
                    className="text-sm text-accent hover:underline"
                  >
                    + Add custom contact field
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {saveMutation.isError && (
          <p className="text-sm text-danger">Failed to save. Please try again.</p>
        )}
      </div>
    </div>
  );
}
