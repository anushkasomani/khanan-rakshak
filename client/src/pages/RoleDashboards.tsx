import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Contract, Mine, MineDashboard, MinesOverview } from '../types';
import { OFFICER_TYPES, ROLE_LABELS } from '../roles';
import { Section, Empty, ListSkeleton, titleCase, shortDate } from '../components/ui';
import { StatusPill } from '../components/StatusPill';
import { AttendanceCard } from '../components/AttendanceCard';
import { InspectionNudge } from '../components/InspectionNudge';
import { MinesMap } from '../components/MineMap';
import { formatTime } from '../attendance';
import { EscalationBanner } from './EscalationsPage';
import { WorkerDashboard } from './WorkerDashboard';
import { SirdarDashboard, OvermanDashboard } from './ShiftDashboards';
import { SpecialistDashboard } from './SpecialistDashboard';
import { DistrictBoard } from '../components/shift/DistrictBoard';
import { useShiftBoard } from '../components/shift/useShift';
import { Greeting, MineTiles, Tile, AttentionList, attentionFor, AttentionItem, WeeklyBars, RiskPill, RISK } from '../components/DashboardKit';

const REFRESH_MS = 60000;

const SEVERITY_DOT: Record<string, string> = {
  FATALITY: 'bg-red-500',
  CRITICAL: 'bg-red-400',
  SERIOUS: 'bg-orange-400',
  HIGH: 'bg-orange-400',
  MEDIUM: 'bg-amber-400',
};

/** /dashboard picks the home screen for the signed-in role. */
export const RoleDashboard: React.FC<{ mines: Mine[]; onOpenSos: () => void }> = ({ mines, onOpenSos }) => {
  const { user } = useAuth();
  switch (user?.role) {
    case 'SPECIALIST':
      return <SpecialistDashboard mines={mines} />;
    case 'SIRDAR':
      return <SirdarDashboard />;
    case 'OVERMAN':
      return <OvermanDashboard />;
    case 'OFFICER':
      return <OfficerDashboard />;
    case 'ASSISTANT_MANAGER':
    case 'MINE_MANAGER':
      return <ManagerDashboard />;
    case 'OWNER':
      return <OwnerDashboard />;
    case 'DGMS':
      return <OverviewDashboard subtitle={(n) => `DGMS · ${n} mines`} />;
    default:
      return <WorkerDashboard mines={mines} onOpenSos={onOpenSos} />;
  }
};

function useMineDashboard(withTrends = false) {
  const { user } = useAuth();
  const [data, setData] = useState<MineDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!user?.mineId) return;
    const load = () =>
      api
        .getMineDashboard(user.mineId!, withTrends)
        .then((d) => (setData(d), setError(null)))
        .catch((e) => setError(e.message));
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [user?.mineId, withTrends]);
  return { data, error };
}

const MineSubtitle: React.FC<{ data: MineDashboard | null; role: string }> = ({ data, role }) => (
  <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
    {role}
    {data && (
      <>
        <span className="text-zinc-700">·</span>
        {data.mine.name}
        <span className="text-zinc-700">·</span>
        <RiskPill level={data.kpis.risk.level} score={data.kpis.risk.score} />
      </>
    )}
  </span>
);

// ---------- Officer: their own discipline first ----------

const OfficerDashboard: React.FC = () => {
  const { user } = useAuth();
  const { data, error } = useMineDashboard();
  const focus = data?.focus;
  const area = OFFICER_TYPES[user?.officerType || 'OTHER'] || 'Your';
  const scope = focus?.allAreas ? 'all areas' : `${area.toLowerCase()} only`;
  // Only inspections this officer may approve (never their own), not everything waiting at the mine.
  const [toApprove, setToApprove] = useState<number | null>(null);
  useEffect(() => {
    api.getInspections().then((list) => setToApprove(list.filter((i) => i.canReview).length)).catch(() => setToApprove(0));
  }, []);

  return (
    <div className="space-y-8">
      <Greeting subtitle={<MineSubtitle data={data} role={`${area} officer`} />} />
      <EscalationBanner />
      {user?.mineId && <AttendanceCard />}
      <InspectionNudge />
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="grid grid-cols-3 gap-3">
        <Tile label="Open hazards" value={focus ? focus.hazards.length : '–'} hint={scope} to="/safety-reports" />
        <Tile label="Open incidents" value={focus ? focus.incidents.length : '–'} hint={scope} to="/incidents" />
        <Tile label="To approve" value={toApprove ?? '–'} hint="inspections" to="/inspections" />
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        <Section title={focus?.allAreas ? 'Open hazards' : `${area} hazards`} action={<ViewAll to="/safety-reports" />}>
          <div className="card divide-y divide-white/[0.05] stagger">
            {!focus ? (
              <ListSkeleton rows={3} />
            ) : focus.hazards.length === 0 ? (
              <Empty>Nothing open in your area.</Empty>
            ) : (
              focus.hazards.map((h) => (
                <Link key={h.id} to="/safety-reports" className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${SEVERITY_DOT[h.severity] || 'bg-zinc-500'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-200 truncate">{h.description}</p>
                    <p className="mt-0.5 text-xs text-zinc-500 truncate">
                      {titleCase(h.category)} · {titleCase(h.severity)} · {shortDate(h.createdAt)}
                    </p>
                  </div>
                  <StatusPill status={h.status} />
                </Link>
              ))
            )}
          </div>
        </Section>

        <Section title={focus?.allAreas ? 'Open incidents' : `${area} incidents`} action={<ViewAll to="/incidents" />}>
          <div className="card divide-y divide-white/[0.05] stagger">
            {!focus ? (
              <ListSkeleton rows={3} />
            ) : focus.incidents.length === 0 ? (
              <Empty>No open incidents in your area.</Empty>
            ) : (
              focus.incidents.map((i) => (
                <Link
                  key={i.id}
                  to={`/incidents?open=${encodeURIComponent(i.id)}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors"
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${SEVERITY_DOT[i.severity] || 'bg-zinc-500'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-200 truncate">{titleCase(i.incidentType)}</p>
                    <p className="mt-0.5 text-xs text-zinc-500 truncate">
                      {i.location} · {shortDate(i.createdAt)}
                    </p>
                  </div>
                  <StatusPill status={i.status} />
                </Link>
              ))
            )}
          </div>
        </Section>
      </div>
    </div>
  );
};

const DAY = 86400000;

/** Contract problems worth acting on: workers who can't work for lack of training, contracts about to run out, suspended ones. */
function useContractAttention(mineId?: string): AttentionItem[] {
  const [contracts, setContracts] = useState<Contract[]>([]);
  useEffect(() => {
    api
      .getContracts(mineId ? { mineId } : {})
      .then(setContracts)
      .catch(() => setContracts([]));
  }, [mineId]);
  const items: AttentionItem[] = [];
  const expired = contracts.filter((c) => c.status === 'ACTIVE').reduce((n, c) => n + (c.stats?.trainingExpired || 0), 0);
  if (expired)
    items.push({
      tone: 'warning',
      title: `${expired} contract worker${expired === 1 ? " can't" : "s can't"} work: training expired or missing`,
      detail: 'Their contractor needs to renew the vocational training certificate',
      to: '/contracts',
    });
  for (const c of contracts) {
    const left = Math.ceil((new Date(c.endDate).getTime() + DAY - Date.now()) / DAY);
    if (c.status === 'ACTIVE' && left <= 14)
      items.push({ tone: 'info', title: `${c.contractor.name} contract ${left < 0 ? 'is past its end date' : `ends in ${left} day${left === 1 ? '' : 's'}`}`, detail: c.title, to: '/contracts' });
    if (c.status === 'SUSPENDED') items.push({ tone: 'info', title: `${c.contractor.name} contract is suspended`, detail: c.statusNote || c.title, to: '/contracts' });
  }
  return items;
}

// ---------- Assistant manager, mine manager and owner: is the mine OK now, and which way is it heading? ----------

const ManagerDashboard: React.FC = () => {
  const { user } = useAuth();
  const { data, error } = useMineDashboard(true);
  const { board, reload } = useShiftBoard({}, !!user?.mineId);
  const contractItems = useContractAttention(user?.mineId || undefined);
  const t = data?.trends || [];
  const series = (pick: (w: (typeof t)[number]) => number) => t.map((w) => ({ weekStart: w.weekStart, value: pick(w) }));

  // Districts on the running shift that are unsafe or not yet inspected come first.
  const shiftItems: AttentionItem[] = board
    ? [
        ...board.districts
          .filter((d) => d.report?.status === 'UNSAFE')
          .map((d) => ({ tone: 'danger' as const, title: `${d.name} declared unsafe`, detail: `${board.shiftLabel} · ${d.report!.sirdar.name}`, to: '/shifts' })),
        ...board.districts
          .filter((d) => !d.report && d.crew.total > 0)
          .map((d) => ({ tone: 'warning' as const, title: `${d.name} not inspected yet`, detail: `${board.shiftLabel} · crew can't check in`, to: '/shifts' })),
      ]
    : [];

  return (
    <div className="space-y-8">
      <Greeting subtitle={<MineSubtitle data={data} role={ROLE_LABELS[user!.role!]} />} />
      <EscalationBanner />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Section title="Needs your attention">
        {data ? (
          <AttentionList items={[...shiftItems, ...attentionFor(data.kpis), ...contractItems]} empty="Nothing urgent. The mine looks steady." />
        ) : (
          <div className="card">
            <ListSkeleton rows={2} />
          </div>
        )}
      </Section>
      <Section
        title={board ? `Districts now · ${board.shiftLabel}` : 'Districts now'}
        action={<ViewAll to="/shifts" />}
      >
        {board ? (
          <DistrictBoard board={board} onChanged={reload} />
        ) : (
          <div className="card">
            <ListSkeleton rows={3} />
          </div>
        )}
      </Section>
      <Section title="Right now">
        <MineTiles k={data?.kpis ?? null} />
      </Section>
      <Section title="Last 8 weeks">
        {t.length ? (
          <div className="grid sm:grid-cols-2 gap-3">
            <WeeklyBars title="Attendance rate" points={series((w) => w.attendanceRate)} suffix="%" max={100} />
            <WeeklyBars title="Hazards reported" points={series((w) => w.hazards)} />
            <WeeklyBars title="Incidents" points={series((w) => w.incidents)} />
            <WeeklyBars title="Inspections completed" points={series((w) => w.inspectionsCompleted)} />
          </div>
        ) : (
          <div className="card">
            <ListSkeleton rows={3} />
          </div>
        )}
        <p className="mt-2 text-xs text-zinc-600">Each bar is one week, starting on the date under it. Attendance rate uses today's headcount.</p>
      </Section>
      {user?.mineId && <AttendanceCard />}
      <InspectionNudge />
    </div>
  );
};

// ---------- Owner / Agent: every mine the company holds ----------

const OwnerDashboard: React.FC = () => {
  const { user } = useAuth();
  const contractItems = useContractAttention();
  const company = user?.mine?.company;
  return (
    <OverviewDashboard
      subtitle={(n) => `Owner / Agent · ${company ? `${company} · ` : ''}${n} mine${n === 1 ? '' : 's'}`}
      extra={
        <Section title="Contractors">
          <AttentionList items={contractItems} empty="No contract problems at any of your mines." />
        </Section>
      }
    />
  );
};

// ---------- DGMS (every mine) and Owner (their company's mines): worst first ----------

const OverviewDashboard: React.FC<{ subtitle: (mineCount: number) => string; extra?: React.ReactNode }> = ({ subtitle, extra }) => {
  const [data, setData] = useState<MinesOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () =>
      api
        .getMinesOverview()
        .then((d) => (setData(d), setError(null)))
        .catch((e) => setError(e.message));
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  const mines = data?.mines || [];
  const byId = new Map(mines.map((m) => [m.id, m]));
  const sum = (pick: (k: (typeof mines)[number]['kpis']) => number) => mines.reduce((a, m) => a + pick(m.kpis), 0);
  const highRisk = mines.filter((m) => m.kpis.risk.level === 'HIGH').length;

  return (
    <div className="space-y-8">
      <Greeting subtitle={data ? subtitle(mines.length) : ''} />
      <EscalationBanner />
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Active SOS" value={data ? data.activeSos.length : '–'} tone={data?.activeSos.length ? 'danger' : 'default'} to="/sos-control" />
        <Tile label="High-risk mines" value={data ? highRisk : '–'} tone={highRisk ? 'danger' : 'default'} />
        <Tile label="Critical incidents" value={data ? sum((k) => k.severeIncidents) : '–'} to="/incidents" />
        <Tile label="Overdue inspections" value={data ? sum((k) => k.overdueInspections) : '–'} to="/inspections" />
      </div>

      {data && data.activeSos.length > 0 && (
        <Section title="Live SOS">
          <div className="card-danger divide-y divide-red-500/10 stagger">
            {data.activeSos.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-red-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-red-100 truncate">{titleCase(s.emergencyType)}</p>
                  <p className="mt-0.5 text-xs text-red-300/70 truncate">
                    {s.mine.name}
                    {s.district ? ` · ${s.district.name}` : ''} · {formatTime(s.triggeredAt)}
                  </p>
                </div>
                <StatusPill status={s.status} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {extra}

      <Section title="Mines by risk">
        {/* Riskiest drawn last so its pin stays on top when mines are close together. */}
        {data && <MinesMap mines={[...mines].reverse()} colorFor={(id) => RISK[byId.get(id)?.kpis.risk.level || 'NORMAL'].hex} height="h-80" />}
        <div className="mt-2 mb-4 flex flex-wrap gap-4">
          {(Object.keys(RISK) as (keyof typeof RISK)[]).map((l) => (
            <RiskPill key={l} level={l} />
          ))}
        </div>

        <div className="card overflow-x-auto">
          {!data ? (
            <ListSkeleton rows={4} />
          ) : (
            <table className="w-full text-sm min-w-[40rem]">
              <thead>
                <tr className="text-left text-xs text-zinc-500 border-b border-white/[0.06]">
                  <th className="font-normal px-4 py-2.5">Mine</th>
                  <th className="font-normal px-4 py-2.5">Risk</th>
                  <th className="font-normal px-4 py-2.5 text-right">SOS</th>
                  <th className="font-normal px-4 py-2.5 text-right">Critical incidents</th>
                  <th className="font-normal px-4 py-2.5 text-right">Overdue inspections</th>
                  <th className="font-normal px-4 py-2.5 text-right">High-risk hazards</th>
                  <th className="font-normal px-4 py-2.5 text-right">Present today</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {mines.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-3">
                      <p className="text-zinc-200">{m.name}</p>
                      <p className="text-xs text-zinc-500">{[m.locality, m.state].filter(Boolean).join(', ')}</p>
                    </td>
                    <td className="px-4 py-3">
                      <RiskPill level={m.kpis.risk.level} score={m.kpis.risk.score} />
                    </td>
                    <Num v={m.kpis.activeSos} danger />
                    <Num v={m.kpis.severeIncidents} danger />
                    <Num v={m.kpis.overdueInspections} />
                    <Num v={m.kpis.highHazards} />
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-300">
                      {m.kpis.staff ? `${m.kpis.present}/${m.kpis.staff}` : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="mt-2 text-xs text-zinc-600">
          Risk score: active SOS ×10, critical incidents ×5, other open incidents ×2, overdue inspections ×2, high-risk hazards ×1. 10 or more is high, 4 or more is elevated.
        </p>
      </Section>

      <InspectionNudge />
    </div>
  );
};

const Num: React.FC<{ v: number; danger?: boolean }> = ({ v, danger }) => (
  <td className={`px-4 py-3 text-right tabular-nums ${v === 0 ? 'text-zinc-600' : danger ? 'text-red-400' : 'text-zinc-200'}`}>{v}</td>
);

const ViewAll: React.FC<{ to: string }> = ({ to }) => (
  <Link to={to} className="text-sm text-zinc-500 hover:text-zinc-200 inline-flex items-center gap-1">
    View all <ArrowRight className="w-3.5 h-3.5" />
  </Link>
);
