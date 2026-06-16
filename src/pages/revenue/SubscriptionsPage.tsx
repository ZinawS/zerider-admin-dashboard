import React, { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { PageHeader } from '../../components/PageHeader.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Plan {
  id: string;
  name: string;
  price_monthly: number;
  features: string[];
  rider_discount_pct: number;
  driver_fee_pct: number;
  active: boolean;
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const DEFAULT_PLANS: Plan[] = [
  {
    id: '1',
    name: 'Basic',
    price_monthly: 9.99,
    features: ['Priority matching', 'Lower fees (12%)'],
    rider_discount_pct: 0,
    driver_fee_pct: 12,
    active: true,
  },
  {
    id: '2',
    name: 'Pro',
    price_monthly: 24.99,
    features: [
      'Priority matching',
      'Lowest fees (8%)',
      'Free cancellations',
      'Dedicated support',
    ],
    rider_discount_pct: 5,
    driver_fee_pct: 8,
    active: true,
  },
  {
    id: '3',
    name: 'Elite',
    price_monthly: 49.99,
    features: [
      'VIP matching',
      'Zero fees (0%)',
      'Free cancellations',
      'Priority support',
      'Luxury vehicles',
    ],
    rider_discount_pct: 10,
    driver_fee_pct: 0,
    active: false,
  },
];

const MOCK_SUBSCRIBERS = [
  { name: 'Basic', subscribers: 234 },
  { name: 'Pro', subscribers: 89 },
  { name: 'Elite', subscribers: 12 },
];

// ---------------------------------------------------------------------------
// Edit modal
// ---------------------------------------------------------------------------

interface EditModalProps {
  plan: Plan;
  onSave: (updated: Plan) => void;
  onClose: () => void;
}

function EditModal({ plan, onSave, onClose }: EditModalProps): JSX.Element {
  const [price, setPrice] = useState(String(plan.price_monthly));
  const [driverFee, setDriverFee] = useState(String(plan.driver_fee_pct));
  const [riderDiscount, setRiderDiscount] = useState(
    String(plan.rider_discount_pct),
  );

  const handleSave = () => {
    onSave({
      ...plan,
      price_monthly: Number(price),
      driver_fee_pct: Number(driverFee),
      rider_discount_pct: Number(riderDiscount),
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded shadow-lg p-5 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-base font-semibold mb-4">Edit plan — {plan.name}</div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted mb-1">
              Monthly price ($)
            </label>
            <input
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full px-3 py-2 bg-white text-ink border border-border rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">
              Driver fee (%)
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={driverFee}
              onChange={(e) => setDriverFee(e.target.value)}
              className="w-full px-3 py-2 bg-white text-ink border border-border rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">
              Rider discount (%)
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={riderDiscount}
              onChange={(e) => setRiderDiscount(e.target.value)}
              className="w-full px-3 py-2 bg-white text-ink border border-border rounded text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm border border-border rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-sm bg-accent text-white rounded"
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add plan modal
// ---------------------------------------------------------------------------

const EMPTY_PLAN: Omit<Plan, 'id'> = {
  name: '',
  price_monthly: 9.99,
  features: [],
  rider_discount_pct: 0,
  driver_fee_pct: 15,
  active: true,
};

interface AddModalProps {
  onSave: (plan: Omit<Plan, 'id'>) => void;
  onClose: () => void;
}

function AddModal({ onSave, onClose }: AddModalProps): JSX.Element {
  const [form, setForm] = useState(EMPTY_PLAN);
  const [featuresText, setFeaturesText] = useState('');

  const handleSave = () => {
    if (!form.name.trim()) return;
    onSave({
      ...form,
      features: featuresText
        .split('\n')
        .map((f) => f.trim())
        .filter(Boolean),
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded shadow-lg p-5 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-base font-semibold mb-4">Add new plan</div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted mb-1">Plan name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Business"
              className="w-full px-3 py-2 bg-white text-ink border border-border rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">
              Monthly price ($)
            </label>
            <input
              type="number"
              step="0.01"
              value={form.price_monthly}
              onChange={(e) =>
                setForm({ ...form, price_monthly: Number(e.target.value) })
              }
              className="w-full px-3 py-2 bg-white text-ink border border-border rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">
              Driver fee (%)
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={form.driver_fee_pct}
              onChange={(e) =>
                setForm({ ...form, driver_fee_pct: Number(e.target.value) })
              }
              className="w-full px-3 py-2 bg-white text-ink border border-border rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">
              Rider discount (%)
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={form.rider_discount_pct}
              onChange={(e) =>
                setForm({ ...form, rider_discount_pct: Number(e.target.value) })
              }
              className="w-full px-3 py-2 bg-white text-ink border border-border rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">
              Features (one per line)
            </label>
            <textarea
              rows={4}
              value={featuresText}
              onChange={(e) => setFeaturesText(e.target.value)}
              placeholder="Priority matching&#10;Lower fees"
              className="w-full px-3 py-2 bg-white text-ink border border-border rounded text-sm resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm border border-border rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!form.name.trim()}
            className="px-3 py-1.5 text-sm bg-accent text-white rounded disabled:opacity-50"
          >
            Add plan
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function SubscriptionsPage(): JSX.Element {
  const [plans, setPlans] = useState<Plan[]>(DEFAULT_PLANS);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const toggleActive = (id: string) => {
    setPlans((prev) =>
      prev.map((p) => (p.id === id ? { ...p, active: !p.active } : p)),
    );
  };

  const handleEdit = (updated: Plan) => {
    setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setEditingPlan(null);
  };

  const handleAdd = (newPlan: Omit<Plan, 'id'>) => {
    const id = String(Date.now());
    setPlans((prev) => [...prev, { ...newPlan, id }]);
    setShowAdd(false);
  };

  // Revenue estimate: Pro plan x 100 drivers
  const proPlan = plans.find((p) => p.name === 'Pro');
  const revenueEstimate = proPlan
    ? (proPlan.price_monthly * 100).toFixed(2)
    : '0.00';

  return (
    <>
      <PageHeader
        title="Subscription Plans"
        subtitle="Manage driver and rider subscription tiers."
        actions={
          <button
            onClick={() => setShowAdd(true)}
            className="px-4 py-2 bg-accent text-white rounded text-sm"
          >
            + Add Plan
          </button>
        }
      />

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`bg-white border rounded-lg p-5 ${
              plan.active ? 'border-border' : 'border-border opacity-60'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-base font-semibold">{plan.name}</div>
                <div className="text-2xl font-bold mt-1">
                  ${plan.price_monthly.toFixed(2)}
                  <span className="text-sm font-normal text-muted">/mo</span>
                </div>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  plan.active
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {plan.active ? 'Active' : 'Inactive'}
              </span>
            </div>

            <ul className="text-xs text-muted space-y-1 mb-4">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-1.5">
                  <span className="text-green-600">&#10003;</span> {f}
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap gap-2 text-xs mb-4">
              <div className="bg-surface rounded px-2 py-1">
                <span className="text-muted">Driver fee:</span>{' '}
                <span className="font-medium">{plan.driver_fee_pct}%</span>
              </div>
              {plan.rider_discount_pct > 0 && (
                <div className="bg-surface rounded px-2 py-1">
                  <span className="text-muted">Rider discount:</span>{' '}
                  <span className="font-medium">{plan.rider_discount_pct}%</span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setEditingPlan(plan)}
                className="px-3 py-1.5 text-xs border border-border rounded hover:bg-surface"
              >
                Edit
              </button>
              <button
                onClick={() => toggleActive(plan.id)}
                className={`px-3 py-1.5 text-xs rounded ${
                  plan.active
                    ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                    : 'bg-green-100 text-green-700 hover:bg-green-200'
                }`}
              >
                {plan.active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Revenue estimate */}
      <div className="bg-white border border-border rounded-lg p-5 mb-8">
        <div className="text-sm font-semibold mb-2">Revenue estimate</div>
        <p className="text-xs text-muted mb-1">
          If 100 drivers on Pro = ${revenueEstimate}/mo
        </p>
        <p className="text-xs text-muted">
          All current subscribers:{' '}
          <span className="font-medium text-ink">
            $
            {MOCK_SUBSCRIBERS.reduce((sum, s) => {
              const plan = plans.find((p) => p.name === s.name);
              return sum + (plan ? plan.price_monthly * s.subscribers : 0);
            }, 0).toFixed(2)}
            /mo
          </span>
        </p>
      </div>

      {/* Subscriber chart */}
      <div className="bg-white border border-border rounded-lg p-5">
        <div className="text-sm font-semibold mb-4">Subscribers by plan</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={MOCK_SUBSCRIBERS}
            margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="subscribers" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Modals */}
      {editingPlan && (
        <EditModal
          plan={editingPlan}
          onSave={handleEdit}
          onClose={() => setEditingPlan(null)}
        />
      )}
      {showAdd && (
        <AddModal onSave={handleAdd} onClose={() => setShowAdd(false)} />
      )}
    </>
  );
}
