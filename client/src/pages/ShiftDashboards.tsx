import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Plus, Radio } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { RosterPerson, SafetyReport, SosAlert } from '../types';
import { Section, Empty, ListSkeleton, titleCase, shortDate } from '../components/ui';
import { StatusPill } from '../components/StatusPill';
import { AttendanceCard } from '../components/AttendanceCard';
import { InspectionNudge } from '../components/InspectionNudge';
import { RosterList } from '../components/AttendanceRoster';
import { Greeting } from '../components/DashboardKit';
import { ShiftReportForm } from '../components/shift/ShiftReportForm';
import { ShiftReportView, STATUS_TEXT } from '../components/shift/ShiftReportView';
import { DistrictBoard } from '../components/shift/DistrictBoard';
import { useMyShift, useShiftBoard } from '../components/shift/useShift';
import { EscalationBanner } from './EscalationsPage';
import { formatTime } from '../attendance';

const SEVERITY_DOT: Record<string, string> = { CRITICAL: 'bg-red-400', HIGH: 'bg-orange-400', MEDIUM: 'bg-amber-400', LOW: 'bg-zinc-500' };

/** A numbered step in the Sirdar's shift, ticked when done. */
const Step: React.FC<{ n: number; title: string; done?: boolean; detail?: React.ReactNode; children: React.ReactNode }> = ({ n, title, done, detail, children }) => (
  <section className="min-w-0">
    <div className="flex items-center gap-2.5 mb-3">
      <span
        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 ${
          done ? 'bg-emerald-500/15 text-emerald-400' : 'bg-zinc-800 text-zinc-300'
        }`}
      >
        {done ? <Check className="w-3.5 h-3.5" /> : n}
      </span>
      <h2 className="text-sm font-medium">{title}</h2>
      {detail && <span className="text-xs text-zinc-500 ml-auto">{detail}</span>}
    </div>
    {children}
  </section>
);

const HazardRows: React.FC<{ items: SafetyReport[] | null; empty: string }> = ({ items, empty }) => (
  <div className="card divide-y divide-white/[0.05] stagger">
    {items === null ? (
      <ListSkeleton rows={2} />
    ) : items.length === 0 ? (
      <Empty>{empty}</Empty>
    ) : (
      items.map((h) => (
        <Link key={h.id} to={`/safety-reports?open=${encodeURIComponent(h.id)}`} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${SEVERITY_DOT[h.severity] || 'bg-zinc-500'}`} />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-zinc-200 truncate">{h.description}</p>
            <p className="mt-0.5 text-xs text-zinc-500 truncate">
              {titleCase(h.category)}
              {h.district && ` · ${h.district.name}`} · {shortDate(h.createdAt)}
              {h.status === 'FIXED' && h.fixedByName && ` · fixed by ${h.fixedByName}`}
            </p>
          </div>
          <StatusPill status={h.status} />
        </Link>
      ))
    )}
  </div>
);

// ---------- Mining Sirdar: check in, inspect the district, then the crew can start ----------

export const SirdarDashboard: React.FC = () => {
  const { user } = useAuth();
  const { data: shift, error, reload, setData } = useMyShift();
  const [inspecting, setInspecting] = useState(false);
  const [hazards, setHazards] = useState<SafetyReport[] | null>(null);

  useEffect(() => {
    if (!user?.districtId) return;
    api
      .getSafetyReports({ districtId: user.districtId, status: 'OPEN' })
      .then(setHazards)
      .catch(() => setHazards([]));
  }, [user?.districtId]);

  if (!user?.districtId || !user.shift) {
    return (
      <div className="space-y-6">
        <Greeting />
        <p className="text-sm text-zinc-400">You don't have a district and shift yet. Ask the admin to set them on your account.</p>
      </div>
    );
  }

  const report = shift?.report || null;
  const crew = (shift?.crew || []) as RosterPerson[];
  const present = crew.filter((c) => c.attendance).length;
  const districtName = shift?.district?.name || user.district?.name || 'your district';
  const prev = shift?.previous;

  return (
    <div className="space-y-8">
      <Greeting subtitle={`Mining Sirdar · ${districtName} · ${shift?.shiftLabel || `Shift ${user.shift}`}`} />
      <EscalationBanner />
      {error && <p className="text-sm text-red-400">{error}</p>}

      <Step n={1} title="Check in" done={!!shift?.checkedIn}>
        <AttendanceCard onData={() => reload()} />
      </Step>

      <Step
        n={2}
        title="Pre-shift inspection"
        done={!!report}
        detail={report && <span className={STATUS_TEXT[report.status].text}>{STATUS_TEXT[report.status].label}</span>}
      >
        <div className="space-y-3">
          {prev?.handoverNote && !report && (
            <div className="card-warning px-4 py-3">
              <p className="text-xs text-amber-300">
                Handover from {prev.sirdar.name} · {prev.shiftLabel}
              </p>
              <p className="mt-1 text-sm text-zinc-200">{prev.handoverNote}</p>
            </div>
          )}
          {shift === undefined ? (
            <div className="card">
              <ListSkeleton rows={1} />
            </div>
          ) : report ? (
            <div className="card p-4 sm:p-5">
              <ShiftReportView report={report} canChangeStatus canHandover onChanged={(r) => setData((s) => s && { ...s, report: r })} />
            </div>
          ) : (
            <div className="card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <p className="flex-1 text-sm text-zinc-400">
                Walk every working place in {districtName}: gas, roof, ventilation, machines. Your crew can check in only after you submit.
              </p>
              <button
                onClick={() => setInspecting(true)}
                disabled={!shift?.checkedIn}
                className="btn-primary w-full sm:w-auto h-11 sm:h-9 disabled:opacity-50"
              >
                {shift?.checkedIn ? 'Start inspection' : 'Check in first'}
              </button>
            </div>
          )}
        </div>
      </Step>

      <Step n={3} title="Crew" detail={shift ? `${present} of ${crew.length} checked in` : undefined}>
        {shift === undefined ? (
          <div className="card">
            <ListSkeleton rows={3} />
          </div>
        ) : (
          <>
            {!report && crew.length > 0 && <p className="mb-2 text-xs text-zinc-500">They can't check in until your inspection is submitted.</p>}
            <RosterList people={crew} isToday empty="No workers are assigned to your district and shift." onChanged={reload} />
          </>
        )}
      </Step>

      <Section
        title={`Open hazards in ${districtName}`}
        action={
          <Link to="/safety-reports?new=1" className="btn-secondary h-8 px-3">
            <Plus className="w-4 h-4" />
            Report hazard
          </Link>
        }
      >
        <HazardRows items={hazards} empty="Nothing open in your district." />
      </Section>

      <InspectionNudge />

      {inspecting && shift?.district && (
        <ShiftReportForm
          districtName={shift.district.name}
          shiftLabel={shift.shiftLabel}
          onClose={() => setInspecting(false)}
          onDone={(r) => {
            setInspecting(false);
            setData((s) => s && { ...s, report: r });
          }}
        />
      )}
    </div>
  );
};

// ---------- Overman: every district on my shift ----------

export const OvermanDashboard: React.FC = () => {
  const { user } = useAuth();
  const { board, error, reload } = useShiftBoard({}, !!user?.mineId);
  const [fixes, setFixes] = useState<SafetyReport[] | null>(null);
  const [sos, setSos] = useState<SosAlert[]>([]);

  useEffect(() => {
    api
      .getSafetyReports({ status: 'FIXED' })
      .then((list) => setFixes(list.filter((h) => h.fixedById !== user?.id)))
      .catch(() => setFixes([]));
    api
      .getActiveSos()
      .then(setSos)
      .catch(() => setSos([]));
  }, [user?.id]);

  const rows = board?.districts || [];
  const inspected = rows.filter((d) => d.report).length;
  const unread = rows.filter((d) => d.report && !d.report.seenByName).length;
  const unsafe = rows.filter((d) => d.report?.status === 'UNSAFE');

  return (
    <div className="space-y-8">
      <Greeting subtitle={`Overman · ${board?.shiftLabel || (user?.shift ? `Shift ${user.shift}` : '')} · ${user?.mine?.name || ''}`} />
      <EscalationBanner />

      {sos.length > 0 && (
        <Link to="/sos-control" className="card-danger flex items-center gap-3 px-4 py-3 hover:brightness-125 transition">
          <Radio className="w-4 h-4 text-red-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-red-200 truncate">{sos.length === 1 ? `SOS: ${titleCase(sos[0].emergencyType)}` : `${sos.length} active SOS alerts`}</p>
            <p className="mt-0.5 text-xs text-red-300/70 truncate">
              {sos[0].district?.name || 'District not given'} · {formatTime(sos[0].triggeredAt)}
            </p>
          </div>
          <ArrowRight className="w-4 h-4 text-red-300/70 shrink-0" />
        </Link>
      )}

      {unsafe.map((d) => (
        <div key={d.id} className="card-danger px-4 py-3">
          <p className="text-sm text-red-200">{d.name} is unsafe. Nobody should be inside.</p>
          <p className="mt-0.5 text-xs text-red-300/70">
            {d.report!.history.length ? d.report!.history[d.report!.history.length - 1].note : d.report!.notes}
          </p>
        </div>
      ))}

      {user?.mineId && <AttendanceCard />}

      <Section
        title="Districts this shift"
        action={
          <Link to="/shifts" className="text-sm text-zinc-500 hover:text-zinc-200 inline-flex items-center gap-1">
            Other shifts <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        }
      >
        {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
        {board ? (
          <>
            <p className="mb-2 text-xs text-zinc-500">
              {inspected} of {rows.length} inspected{unread > 0 && ` · ${unread} to read`}
            </p>
            <DistrictBoard board={board} onChanged={reload} />
          </>
        ) : (
          <div className="card">
            <ListSkeleton rows={3} />
          </div>
        )}
      </Section>

      <Section title="Fixes to check">
        <HazardRows items={fixes} empty="No fixes waiting for a check." />
        <p className="mt-2 text-xs text-zinc-500">A Sirdar marked these fixed. Confirm the fix, send it back, or send someone to inspect it.</p>
      </Section>

      <InspectionNudge />
    </div>
  );
};
