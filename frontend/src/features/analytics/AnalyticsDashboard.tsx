import { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Pipeline } from '@/features/sales/types';
import {
  useKPIs,
  usePipelineFunnel,
  useSalesVelocity,
  useTicketResolution,
  useActivityBreakdown,
} from './analyticsApi';
import type { DateRange, DateRangePreset } from './types';

const PRESET_LABELS: { value: DateRangePreset; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'custom', label: 'Custom' },
];

const PIE_COLORS = ['#6366f1', '#22d3ee', '#f59e0b', '#10b981', '#f43f5e'];

function KPICard({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded-lg border bg-card p-5 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold">
        {value === undefined ? '—' : value.toLocaleString()}
      </p>
    </div>
  );
}

export default function AnalyticsDashboard() {
  const [range, setRange] = useState<DateRange>({ preset: '30d' });
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [selectedPipeline, setSelectedPipeline] = useState<string | null>(null);

  const { data: pipelines } = useQuery<Pipeline[], Error>({
    queryKey: ['pipelines'],
    queryFn: () => api.get<Pipeline[]>('/pipelines/'),
  });

  useEffect(() => {
    if (pipelines && pipelines.length > 0 && !selectedPipeline) {
      const def = pipelines.find((p) => p.is_default) ?? pipelines[0];
      setSelectedPipeline(def.id);
    }
  }, [pipelines, selectedPipeline]);

  const activeRange: DateRange =
    range.preset === 'custom' && customFrom && customTo
      ? { preset: 'custom', from: customFrom, to: customTo }
      : range.preset !== 'custom'
      ? range
      : { preset: '30d' };

  const { data: kpis } = useKPIs(activeRange);
  const { data: funnel } = usePipelineFunnel(selectedPipeline, activeRange);
  const { data: velocity } = useSalesVelocity(selectedPipeline, activeRange);
  const { data: resolution } = useTicketResolution(activeRange);
  const { data: breakdown } = useActivityBreakdown(activeRange);

  function handlePreset(preset: DateRangePreset) {
    setRange({ preset });
  }

  function handleCustomApply() {
    if (customFrom && customTo) {
      setRange({ preset: 'custom', from: customFrom, to: customTo });
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Analytics</h1>

        {/* Date range picker */}
        <div className="flex flex-wrap items-center gap-2">
          {PRESET_LABELS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => handlePreset(value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                range.preset === value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {label}
            </button>
          ))}
          {range.preset === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-md border bg-background px-2 py-1 text-sm"
              />
              <span className="text-muted-foreground text-sm">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-md border bg-background px-2 py-1 text-sm"
              />
              <button
                onClick={handleCustomApply}
                disabled={!customFrom || !customTo}
                className="px-3 py-1.5 rounded-md text-sm font-medium bg-primary text-primary-foreground disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KPICard label="Total Contacts" value={kpis?.total_contacts} />
        <KPICard label="Open Deals" value={kpis?.open_deals} />
        <KPICard label="Open Tickets" value={kpis?.open_tickets} />
        <KPICard label="Activities" value={kpis?.activities_count} />
      </div>

      {/* Pipeline selector */}
      {pipelines && pipelines.length > 0 && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-muted-foreground">Pipeline:</label>
          <select
            value={selectedPipeline ?? ''}
            onChange={(e) => setSelectedPipeline(e.target.value)}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Charts grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Pipeline Funnel */}
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold">Pipeline Funnel</h2>
          {funnel && funnel.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={funnel} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="stage_name" type="category" width={90} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="deal_count" name="Deals" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground">No data for selected range.</p>
          )}
        </div>

        {/* Sales Velocity */}
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold">Sales Velocity (avg days per stage)</h2>
          {velocity && velocity.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={velocity} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" unit="d" />
                <YAxis dataKey="stage_name" type="category" width={90} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="avg_days" name="Avg days" fill="#22d3ee" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground">No data for selected range.</p>
          )}
        </div>

        {/* Ticket Resolution Time */}
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold">Ticket Resolution Time</h2>
          {resolution ? (
            <div className="flex flex-col gap-2">
              <p className="text-4xl font-bold">
                {resolution.avg_resolution_hours !== null
                  ? `${resolution.avg_resolution_hours.toFixed(1)}h`
                  : '—'}
              </p>
              <p className="text-sm text-muted-foreground">
                Average resolution time &bull; {resolution.resolved_count} tickets resolved
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No data for selected range.</p>
          )}
        </div>

        {/* Activity Breakdown */}
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold">Activity Breakdown</h2>
          {breakdown && breakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={breakdown}
                  dataKey="count"
                  nameKey="type"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }: { name?: string; percent?: number }) =>
                    `${name ?? ''} ${(((percent ?? 0)) * 100).toFixed(0)}%`
                  }
                >
                  {breakdown.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground">No data for selected range.</p>
          )}
        </div>
      </div>
    </div>
  );
}
