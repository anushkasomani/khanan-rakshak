import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../services/api';
import { Mine } from '../types';
import { StatusPill } from '../components/StatusPill';
import { PageHeader, Stat, Tabs, Empty, titleCase, ListSkeleton } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { atLeast } from '../roles';

interface ComplianceDashboardProps {
  mines: Mine[];
}

// Validated against the #0f0f10 card surface (dataviz validator, dark mode): all checks pass.
const SERIES_1 = '#3987e5';
const SERIES_2 = '#d95926';
// Fixed status steps; every severity bar is also labeled, so color never carries meaning alone.
const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: '#d03b3b',
  HIGH: '#ec835a',
  MEDIUM: '#fab219',
  LOW: '#52525b',
};
const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const SURFACE = '#0f0f10';
const GRID = '#1f1f23';
const MUTED = '#71717a';

const axisProps = { tick: { fill: MUTED, fontSize: 11 }, tickLine: false, axisLine: false } as const;
const tooltipProps = {
  contentStyle: {
    background: '#18181b',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8,
    fontSize: 12,
    padding: '8px 10px',
  },
  labelStyle: { color: '#a1a1aa', marginBottom: 4 },
  itemStyle: { color: '#e4e4e7', padding: 0 },
};

const ChartCard: React.FC<{
  title: string;
  legend?: { label: string; color: string }[];
  columns: string[];
  rows: (string | number)[][];
  children: React.ReactElement;
}> = ({ title, legend, columns, rows, children }) => {
  const [showTable, setShowTable] = useState(false);
  return (
    <div className="card p-5 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-4">
        <h3 className="text-sm font-medium">{title}</h3>
        <div className="flex items-center gap-4">
          {legend?.map((l) => (
            <span key={l.label} className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
              <span className="w-2 h-2 rounded-sm" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
          <button onClick={() => setShowTable((v) => !v)} className="text-xs text-zinc-500 hover:text-zinc-200">
            {showTable ? 'Chart' : 'Table'}
          </button>
        </div>
      </div>
      {showTable ? (
        rows.length === 0 ? (
          <Empty>No data.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-500">
                  {columns.map((c, i) => (
                    <th key={c} className={`pb-2 font-normal ${i > 0 ? 'text-right' : ''}`}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((cell, j) => (
                      <td key={j} className={`py-1.5 ${j > 0 ? 'text-right tabular-nums text-zinc-300' : 'text-zinc-400'}`}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : rows.length === 0 ? (
        <Empty>No data.</Empty>
      ) : (
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export const ComplianceDashboard: React.FC<ComplianceDashboardProps> = ({ mines }) => {
  const location = useLocation();
  const { user } = useAuth();
  const canCompareMines = atLeast(user, 'DGMS');
  const [view, setView] = useState<'overview' | 'mines'>(location.pathname === '/corporate' ? 'mines' : 'overview');
  const [mineId, setMineId] = useState('');
  const [data, setData] = useState<any>(null);
  const [corporate, setCorporate] = useState<any[]>([]);

  useEffect(() => {
    setView(location.pathname === '/corporate' ? 'mines' : 'overview');
  }, [location.pathname]);

  useEffect(() => {
    Promise.all([api.getComplianceDashboard(mineId || undefined), api.getCorporateSummary()])
      .then(([dash, corp]) => {
        setData(dash);
        setCorporate(Array.isArray(corp) ? corp : []);
      })
      .catch((e) => console.error('Error fetching compliance data:', e));
  }, [mineId]);

  const kpis = data?.kpis;
  const show = (v: number | undefined, suffix = '') => (v === undefined || v === null ? '–' : `${v}${suffix}`);

  const trends: any[] = data?.monthlyTrends || [];
  const categories: any[] = (data?.categoryBreakdown || []).map((c: any) => ({ ...c, label: titleCase(c.name) }));
  const severityCounts: Record<string, number> = Object.fromEntries(
    (data?.severityBreakdown || []).map((s: any) => [s.name, s.count])
  );
  const severities = SEVERITY_ORDER.map((name) => ({ name, label: titleCase(name), count: severityCounts[name] || 0 }));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Compliance"
        actions={
          view === 'overview' && (
            <select value={mineId} onChange={(e) => setMineId(e.target.value)} className="input w-auto max-w-[16rem]">
              <option value="">All mines</option>
              {mines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )
        }
      />

      {canCompareMines && (
        <Tabs
          value={view}
          onChange={setView}
          options={[
            { value: 'overview', label: 'Overview' },
            { value: 'mines', label: 'By mine' },
          ]}
        />
      )}

      {view === 'overview' ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Compliance" value={show(kpis?.overallCompliance, '%')} />
            <Stat label="Open violations" value={show(kpis?.openViolations)} />
            <Stat label="Critical hazards" value={show(kpis?.criticalViolations)} tone={kpis?.criticalViolations > 0 ? 'danger' : 'default'} />
            <Stat label="Overdue actions" value={show(kpis?.overdueCorrectiveActions)} tone={kpis?.overdueCorrectiveActions > 0 ? 'danger' : 'default'} />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <ChartCard
              title="Inspection completion by month (%)"
              columns={['Month', 'Completion %']}
              rows={trends.map((t) => [t.month, t.inspectionCompletionRate])}
            >
              <LineChart data={trends} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="month" {...axisProps} />
                <YAxis domain={[0, 100]} {...axisProps} />
                <Tooltip {...tooltipProps} cursor={{ stroke: '#3f3f46', strokeWidth: 1 }} />
                <Line
                  type="monotone"
                  dataKey="inspectionCompletionRate"
                  name="Inspection completion %"
                  stroke={SERIES_1}
                  strokeWidth={2}
                  dot={{ r: 4, fill: SERIES_1, stroke: SURFACE, strokeWidth: 2 }}
                  activeDot={{ r: 5, fill: SERIES_1, stroke: SURFACE, strokeWidth: 2 }}
                />
              </LineChart>
            </ChartCard>

            <ChartCard
              title="Incidents and resolved hazards by month"
              legend={[
                { label: 'Incidents', color: SERIES_1 },
                { label: 'Resolved hazards', color: SERIES_2 },
              ]}
              columns={['Month', 'Incidents', 'Resolved']}
              rows={trends.map((t) => [t.month, t.incidents, t.resolvedReports])}
            >
              <BarChart data={trends} barGap={2} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="month" {...axisProps} />
                <YAxis allowDecimals={false} {...axisProps} />
                <Tooltip {...tooltipProps} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="incidents" name="Incidents" fill={SERIES_1} radius={[4, 4, 0, 0]} maxBarSize={24} />
                <Bar dataKey="resolvedReports" name="Resolved hazards" fill={SERIES_2} radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ChartCard>

            <ChartCard
              title="Hazards by category"
              columns={['Category', 'Reports']}
              rows={categories.map((c) => [c.label, c.count])}
            >
              <BarChart layout="vertical" data={categories} margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={GRID} horizontal={false} />
                <XAxis type="number" allowDecimals={false} {...axisProps} />
                <YAxis type="category" dataKey="label" width={96} {...axisProps} />
                <Tooltip {...tooltipProps} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="count" name="Reports" fill={SERIES_1} radius={[0, 4, 4, 0]} maxBarSize={24} />
              </BarChart>
            </ChartCard>

            <ChartCard
              title="Hazards by severity"
              columns={['Severity', 'Reports']}
              rows={severities.map((s) => [s.label, s.count])}
            >
              <BarChart layout="vertical" data={severities} margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={GRID} horizontal={false} />
                <XAxis type="number" allowDecimals={false} {...axisProps} />
                <YAxis type="category" dataKey="label" width={96} {...axisProps} />
                <Tooltip {...tooltipProps} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="count" name="Reports" radius={[0, 4, 4, 0]} maxBarSize={24}>
                  {severities.map((s) => (
                    <Cell key={s.name} fill={SEVERITY_COLOR[s.name]} />
                  ))}
                </Bar>
              </BarChart>
            </ChartCard>
          </div>
        </>
      ) : (
        <div className="card overflow-x-auto">
          {corporate.length === 0 ? (
            <ListSkeleton />
          ) : (
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-xs text-zinc-500 border-b border-white/[0.06]">
                  <th className="px-4 py-3 font-normal">Mine</th>
                  <th className="px-4 py-3 font-normal text-right">Compliance</th>
                  <th className="px-4 py-3 font-normal text-right">Open issues</th>
                  <th className="px-4 py-3 font-normal text-right">Critical</th>
                  <th className="px-4 py-3 font-normal text-right">Active SOS</th>
                  <th className="px-4 py-3 font-normal text-right">Response</th>
                  <th className="px-4 py-3 font-normal">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {corporate.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-3">
                      <p className="text-zinc-200">{m.name}</p>
                      <p className="text-xs text-zinc-500">{m.state}</p>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-200">{m.complianceScore}%</td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-300">{m.openIssues}</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${m.criticalIssues > 0 ? 'text-red-400' : 'text-zinc-500'}`}>
                      {m.criticalIssues}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums ${m.activeSos > 0 ? 'text-red-400' : 'text-zinc-500'}`}>
                      {m.activeSos}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-500">{m.averageResponseTime ?? 'Unavailable'}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={m.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};
