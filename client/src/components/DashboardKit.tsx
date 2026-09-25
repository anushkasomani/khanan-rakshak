import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { MineKpis, RiskLevel } from '../types';
import { describeRole } from '../roles';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

const TITLES = /^(dr|mr|mrs|ms|miss|prof|shri|smt|sri|er)\.?$/i;

/** "Dr. Vikramaditya Singh" -> "Vikramaditya". */
export const firstNameOf = (name?: string | null) => (name || '').split(/\s+/).find((w) => w && !TITLES.test(w))?.replace(/\.$/, '') || '';

export const Greeting: React.FC<{ subtitle?: React.ReactNode; action?: React.ReactNode }> = ({ subtitle, action }) => {
  const { user } = useAuth();
  const firstName = firstNameOf(user?.name);
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting()}
          {firstName && `, ${firstName}`}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">{subtitle ?? (user ? describeRole(user) : '')}</p>
      </div>
      {action}
    </div>
  );
};

export const RISK: Record<RiskLevel, { label: string; dot: string; text: string; hex: string }> = {
  HIGH: { label: 'High risk', dot: 'bg-red-400', text: 'text-red-400', hex: '#f87171' },
  ELEVATED: { label: 'Elevated', dot: 'bg-amber-400', text: 'text-amber-400', hex: '#fbbf24' },
  NORMAL: { label: 'Normal', dot: 'bg-emerald-400', text: 'text-emerald-400', hex: '#34d399' },
};

export const RiskPill: React.FC<{ level: RiskLevel; score?: number }> = ({ level, score }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-zinc-300 whitespace-nowrap" title={score != null ? `Risk score ${score}` : undefined}>
    <span className={`w-1.5 h-1.5 rounded-full ${RISK[level].dot}`} />
    {RISK[level].label}
  </span>
);

/** A number that opens the page behind it. */
export const Tile: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: string;
  to?: string;
  tone?: 'default' | 'danger' | 'warning';
}> = ({ label, value, hint, to, tone = 'default' }) => {
  const body = (
    <>
      <p className="text-xs text-zinc-500 truncate">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${tone === 'danger' ? 'text-red-400' : tone === 'warning' ? 'text-amber-400' : ''}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-zinc-500 truncate">{hint}</p>}
    </>
  );
  const cls = 'card px-3 py-3 sm:px-4 sm:py-4 min-w-0 block';
  return to ? (
    <Link to={to} className={`${cls} hover:border-white/[0.12] transition-colors`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
};

/** The standard six numbers for one mine. */
export const MineTiles: React.FC<{ k: MineKpis | null }> = ({ k }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
    <Tile label="Present today" value={k ? `${k.present}/${k.staff}` : '–'} to="/attendance" />
    <Tile label="Active SOS" value={k?.activeSos ?? '–'} tone={k?.activeSos ? 'danger' : 'default'} to="/sos-control" />
    <Tile
      label="Open incidents"
      value={k?.openIncidents ?? '–'}
      hint={k?.severeIncidents ? `${k.severeIncidents} critical or fatal` : undefined}
      tone={k?.severeIncidents ? 'danger' : 'default'}
      to="/incidents"
    />
    <Tile
      label="Overdue inspections"
      value={k?.overdueInspections ?? '–'}
      hint={k ? `${k.awaitingApproval} awaiting approval` : undefined}
      tone={k?.overdueInspections ? 'warning' : 'default'}
      to="/inspections"
    />
    <Tile label="Open hazards" value={k?.openHazards ?? '–'} hint={k ? `${k.highHazards} high risk` : undefined} to="/safety-reports" />
    <Tile label="Open escalations" value={k?.openEscalations ?? '–'} to="/escalations" />
  </div>
);

export type AttentionItem = { tone: 'danger' | 'warning' | 'info'; title: string; detail?: string; to: string };

const TONE_DOT = { danger: 'bg-red-400', warning: 'bg-amber-400', info: 'bg-sky-400' };

/** Short list of things someone should act on, most urgent first. */
export const AttentionList: React.FC<{ items: AttentionItem[]; empty: string }> = ({ items, empty }) => (
  <div className="card divide-y divide-white/[0.05] stagger">
    {items.length === 0 ? (
      <p className="px-4 py-6 text-sm text-zinc-500">{empty}</p>
    ) : (
      items.map((i) => (
        <Link key={i.title} to={i.to} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${TONE_DOT[i.tone]}`} />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-zinc-200 truncate">{i.title}</p>
            {i.detail && <p className="mt-0.5 text-xs text-zinc-500 truncate">{i.detail}</p>}
          </div>
          <ArrowRight className="w-4 h-4 text-zinc-500 shrink-0" />
        </Link>
      ))
    )}
  </div>
);

export function attentionFor(k: MineKpis): AttentionItem[] {
  const items: AttentionItem[] = [];
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  if (k.activeSos) items.push({ tone: 'danger', title: n(k.activeSos, 'active SOS', 'active SOS alerts'), to: '/sos-control' });
  if (k.severeIncidents)
    items.push({ tone: 'danger', title: n(k.severeIncidents, 'critical incident open', 'critical incidents open'), to: '/incidents' });
  if (k.openEscalations)
    items.push({ tone: 'warning', title: n(k.openEscalations, 'escalation not yet acknowledged', 'escalations not yet acknowledged'), to: '/escalations' });
  if (k.overdueInspections)
    items.push({ tone: 'warning', title: n(k.overdueInspections, 'inspection overdue', 'inspections overdue'), to: '/inspections' });
  if (k.staff && k.present / k.staff < 0.6 && new Date().getHours() >= 10)
    items.push({ tone: 'warning', title: `Only ${k.present} of ${k.staff} people checked in today`, to: '/attendance' });
  return items;
}

const weekLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** One series over eight weeks. Every bar is labelled, so there's no axis to read. */
export const WeeklyBars: React.FC<{
  title: string;
  points: { weekStart: string; value: number }[];
  suffix?: string;
  max?: number;
}> = ({ title, points, suffix = '', max }) => {
  const top = Math.max(max ?? 0, ...points.map((p) => p.value), 1);
  const latest = points[points.length - 1]?.value ?? 0;
  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <p className="text-sm text-zinc-300">{title}</p>
        <p className="text-xs text-zinc-500">
          this week <span className="text-zinc-200 tabular-nums">{latest}{suffix}</span>
        </p>
      </div>
      <div className="grid grid-cols-8 gap-1.5 h-28" role="img" aria-label={`${title}: ${points.map((p) => `${weekLabel(p.weekStart)} ${p.value}${suffix}`).join(', ')}`}>
        {points.map((p, i) => {
          const last = i === points.length - 1;
          return (
            <div key={p.weekStart} className="flex flex-col items-center justify-end gap-1 min-w-0" title={`Week of ${weekLabel(p.weekStart)}: ${p.value}${suffix}`}>
              <span className={`text-[10px] tabular-nums ${last ? 'text-zinc-200' : 'text-zinc-500'}`}>{p.value}</span>
              <span
                className="w-full max-w-[1.75rem] rounded-t bg-[#3987e5]"
                style={{ height: `${Math.max((p.value / top) * 64, p.value ? 3 : 1)}px`, opacity: last ? 1 : 0.5 }}
              />
              <span className="text-[10px] text-zinc-600 truncate w-full text-center">{weekLabel(p.weekStart)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
