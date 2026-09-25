import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, X, Check, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { SafetyReport, Mine } from '../types';
import { StatusPill } from '../components/StatusPill';
import { AttendanceCard } from '../components/AttendanceCard';
import { ClearanceNotice } from '../components/shift/ClearanceNotice';
import { useMyShift } from '../components/shift/useShift';
import { describeRole } from '../roles';
import { firstNameOf } from '../components/DashboardKit';
import { InspectionNudge } from '../components/InspectionNudge';
import { ListSkeleton } from '../components/ui';

interface WorkerDashboardProps {
  onOpenSos: () => void;
  mines: Mine[];
}

const CATEGORIES = [
  { value: 'STRUCTURAL', label: 'Roof and sides' },
  { value: 'GAS', label: 'Gas / methane' },
  { value: 'VENTILATION', label: 'Ventilation' },
  { value: 'MACHINERY', label: 'Machinery' },
  { value: 'ELECTRICAL', label: 'Electrical' },
  { value: 'ENVIRONMENTAL', label: 'Water / flooding' },
  { value: 'PPE', label: 'PPE / respirator' },
];

const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const SEVERITY_DOT: Record<string, string> = {
  CRITICAL: 'bg-red-400',
  HIGH: 'bg-orange-400',
  MEDIUM: 'bg-amber-400',
  LOW: 'bg-zinc-500',
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export const WorkerDashboard: React.FC<WorkerDashboardProps> = ({ mines }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [reports, setReports] = useState<SafetyReport[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [showReportModal, setShowReportModal] = useState(false);
  const { data: myShift, reload: reloadShift } = useMyShift();
  const [form, setForm] = useState({
    mineId: user?.mineId || '',
    districtId: user?.districtId || '',
    category: 'STRUCTURAL',
    severity: 'MEDIUM',
    description: '',
    immediateActionTaken: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdReport, setCreatedReport] = useState<any>(null);

  const loadData = async () => {
    try {
      const [reps, anns] = await Promise.all([
        api.getSafetyReports(user?.mineId ? { mineId: user.mineId } : undefined),
        api.getAnnouncements(user?.mineId || undefined),
      ]);
      setReports(Array.isArray(reps) ? reps : []);
      setAnnouncements(Array.isArray(anns) ? anns : []);
    } catch (e) {
      console.error('Error loading dashboard:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.id]);

  const formDistricts = mines.find((m) => m.id === (form.mineId || user?.mineId))?.districts || [];
  const openReports = reports.filter((r) => r.status !== 'RESOLVED');
  const criticalOpen = openReports.filter((r) => r.severity === 'CRITICAL' || r.severity === 'HIGH');
  const firstName = firstNameOf(user?.name);

  const openReportModal = () => {
    setCreatedReport(null);
    setSubmitError(null);
    setForm((f) => ({ ...f, districtId: user?.districtId || '', description: '', immediateActionTaken: '' }));
    setShowReportModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const mineId = form.mineId || user?.mineId;
    if (!mineId) {
      setSubmitError('Select a mine.');
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await api.createSafetyReport({
        mineId,
        districtId: form.districtId || undefined,
        category: form.category,
        severity: form.severity,
        description: form.description,
        immediateActionTaken: form.immediateActionTaken || undefined,
      });
      setCreatedReport(res.report);
      await loadData();
    } catch (err: any) {
      setSubmitError(err.message || 'Could not submit the report.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting()}{firstName && `, ${firstName}`}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {user ? describeRole(user) : ''} · {user?.mine?.name || 'No mine assigned yet'}
          </p>
        </div>
        <button onClick={openReportModal} className="btn-primary">
          <Plus className="w-4 h-4" />
          Report hazard
        </button>
      </div>

      {user?.contract && (!user.trainingValidUntil || new Date(user.trainingValidUntil).getTime() < Date.now()) && (
        <div className="card-danger px-4 py-3">
          <p className="text-sm text-zinc-100">
            {user.trainingValidUntil
              ? `Your vocational training certificate expired on ${new Date(user.trainingValidUntil).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}.`
              : 'Your vocational training certificate is not on record.'}
          </p>
          <p className="mt-0.5 text-sm text-zinc-400">
            You can't check in until it is renewed. Ask {user.contract.contractor.name} to send the new certificate to the mine office.
          </p>
        </div>
      )}
      {myShift && <ClearanceNotice shift={myShift} />}
      {user?.mineId && <AttendanceCard onData={() => reloadShift()} />}
      <InspectionNudge />

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Open hazards', value: isLoading ? '–' : openReports.length },
          { label: 'High risk', value: isLoading ? '–' : criticalOpen.length },
          { label: 'Points', value: user?.points ?? 0 },
        ].map((s) => (
          <div key={s.label} className="card px-3 py-3 sm:px-4 sm:py-4">
            <p className="text-xs text-zinc-500">{s.label}</p>
            <p className="mt-1.5 text-2xl font-semibold tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <section className="lg:col-span-2 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium">Recent hazards</h2>
            <Link to="/safety-reports" className="text-sm text-zinc-500 hover:text-zinc-200 inline-flex items-center gap-1">
              View all <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="card divide-y divide-white/[0.05] stagger">
            {isLoading ? (
              <ListSkeleton />
            ) : reports.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-zinc-500">No hazards reported yet.</p>
            ) : (
              reports.slice(0, 6).map((r) => (
                <button
                  key={r.id}
                  onClick={() => navigate('/safety-reports')}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${SEVERITY_DOT[r.severity] || 'bg-zinc-500'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-200 truncate">{r.description}</p>
                    <p className="mt-0.5 text-xs text-zinc-500 truncate">
                      {r.district?.name || r.mine?.name} · {new Date(r.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                  <StatusPill status={r.status} />
                </button>
              ))
            )}
          </div>
        </section>

        <section className="min-w-0">
          <h2 className="text-sm font-medium mb-3">Announcements</h2>
          <div className="card divide-y divide-white/[0.05] stagger">
            {announcements.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-zinc-500">Nothing new.</p>
            ) : (
              announcements.slice(0, 4).map((a) => (
                <div key={a.id} className="px-4 py-3">
                  <div className="flex items-start gap-2">
                    {a.priority !== 'NORMAL' && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
                    <p className="text-sm text-zinc-200">{a.title}</p>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500 line-clamp-2">{a.content}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>

      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-zinc-900 border border-white/[0.08] rounded-t-2xl sm:rounded-2xl shadow-panel-lg max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 h-14 border-b border-white/[0.06]">
              <h2 className="text-sm font-semibold">Report a hazard</h2>
              <button onClick={() => setShowReportModal(false)} aria-label="Close" className="btn-ghost -mr-2">
                <X className="w-4 h-4" />
              </button>
            </div>

            {createdReport ? (
              <div className="p-6 text-center">
                <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <Check className="w-6 h-6 text-emerald-400" />
                </div>
                <h3 className="mt-4 text-base font-semibold">Report submitted</h3>
                <p className="mt-1 text-sm text-zinc-400">Your Sirdar and the Overman on shift have been notified.</p>
                <p className="mt-4 font-mono text-xs text-zinc-500">{createdReport.id}</p>
                <button onClick={() => setShowReportModal(false)} className="btn-secondary w-full mt-6">
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                {!user?.mineId && (
                  <div>
                    <label className="label">Mine</label>
                    <select
                      required
                      value={form.mineId}
                      onChange={(e) => setForm({ ...form, mineId: e.target.value })}
                      className="input"
                    >
                      <option value="" disabled>
                        Select a mine
                      </option>
                      {mines.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {formDistricts.length > 0 && (
                  <div>
                    <label className="label">Where</label>
                    <select value={form.districtId} onChange={(e) => setForm({ ...form, districtId: e.target.value })} className="input">
                      <option value="">Not sure</option>
                      {formDistricts.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="label">What kind</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="input"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label">Severity</label>
                  <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-zinc-950 border border-white/10">
                    {SEVERITIES.map((sev) => (
                      <button
                        key={sev}
                        type="button"
                        onClick={() => setForm({ ...form, severity: sev })}
                        className={`h-7 rounded-md text-xs transition-colors ${
                          form.severity === sev ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        {sev.charAt(0) + sev.slice(1).toLowerCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="label">What did you see?</label>
                  <textarea
                    rows={3}
                    required
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="What is wrong, and exactly where, e.g. roof leaking in gallery 14"
                    className="input resize-none"
                  />
                </div>

                <div>
                  <label className="label">Action already taken (optional)</label>
                  <input
                    type="text"
                    value={form.immediateActionTaken}
                    onChange={(e) => setForm({ ...form, immediateActionTaken: e.target.value })}
                    placeholder="e.g. Fenced off, stopped the conveyor"
                    className="input"
                  />
                </div>

                {submitError && <p className="text-sm text-red-400">{submitError}</p>}

                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={() => setShowReportModal(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" disabled={isSubmitting} className="btn-primary">
                    {isSubmitting ? 'Submitting…' : 'Submit'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
};
