import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { SafetyReport, Mine, StaffMember } from '../types';
import { atLeast, describeRole, minesFor } from '../roles';
import { StatusPill } from '../components/StatusPill';
import { TamperProofBadge } from '../components/TamperProofBadge';
import { PageHeader, Modal, Empty, Field, Segmented, DetailRows, titleCase, shortDate, ListSkeleton } from '../components/ui';

interface SafetyReportsPageProps {
  mines: Mine[];
}

const CATEGORIES = [
  { value: 'PPE', label: 'PPE / respirator' },
  { value: 'MACHINERY', label: 'Machinery' },
  { value: 'ELECTRICAL', label: 'Electrical' },
  { value: 'VENTILATION', label: 'Ventilation' },
  { value: 'GAS', label: 'Gas / methane' },
  { value: 'STRUCTURAL', label: 'Roof and sides' },
  { value: 'TRANSPORTATION', label: 'Haulage / transport' },
  { value: 'ENVIRONMENTAL', label: 'Water / flooding' },
];

const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

const SEVERITY_DOT: Record<string, string> = {
  CRITICAL: 'bg-red-400',
  HIGH: 'bg-orange-400',
  MEDIUM: 'bg-amber-400',
  LOW: 'bg-zinc-500',
};

/** Report → someone takes it on → it is fixed → someone above the fixer checks it → closed. */
export const HAZARD_STATUS: Record<SafetyReport['status'], string> = {
  SUBMITTED: 'New',
  ASSIGNED: 'Being handled',
  FIXED: 'Fixed, needs a check',
  RESOLVED: 'Closed',
};

const emptyForm = (mineId: string, districtId: string) => ({
  mineId,
  districtId,
  category: 'STRUCTURAL',
  severity: 'MEDIUM' as string,
  description: '',
  immediateActionTaken: '',
});

const inDays = (n: number) => {
  const d = new Date(Date.now() + n * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const SafetyReportsPage: React.FC<SafetyReportsPageProps> = ({ mines }) => {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [reports, setReports] = useState<SafetyReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<SafetyReport | null>(null);

  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterMine, setFilterMine] = useState('');
  const [filterDistrict, setFilterDistrict] = useState(params.get('district') || '');

  const [isCreateOpen, setIsCreateOpen] = useState(params.get('new') === '1');
  const [form, setForm] = useState(emptyForm(user?.mineId || '', user?.districtId || ''));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const choices = minesFor(user, mines);
  const canPickMine = choices.length > 1;
  const viewMine = filterMine || user?.mineId || '';
  const viewDistricts = mines.find((m) => m.id === viewMine)?.districts || [];

  const loadReports = async () => {
    try {
      const data = await api.getSafetyReports({
        severity: filterSeverity || undefined,
        status: filterStatus || undefined,
        mineId: filterMine || undefined,
        districtId: filterDistrict || undefined,
      });
      const rows = Array.isArray(data) ? data : [];
      setReports(rows);
      const openId = params.get('open');
      const match = openId && rows.find((row) => row.id === openId);
      if (match) setSelected(match);
    } catch (e) {
      console.error('Error fetching safety reports:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const closeSelected = () => {
    setSelected(null);
    if (params.has('open')) setParams({}, { replace: true });
  };

  useEffect(() => {
    loadReports();
  }, [filterSeverity, filterStatus, filterMine, filterDistrict]);

  const formDistricts = mines.find((m) => m.id === form.mineId)?.districts || [];

  const openCreate = () => {
    setForm(emptyForm(user?.mineId || '', user?.districtId || ''));
    setFormError(null);
    setIsCreateOpen(true);
  };

  const closeCreate = () => {
    setIsCreateOpen(false);
    if (params.has('new')) setParams({}, { replace: true });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.mineId) {
      setFormError('Select a mine.');
      return;
    }
    setIsSubmitting(true);
    setFormError(null);
    try {
      const res = await api.createSafetyReport({
        mineId: form.mineId,
        districtId: form.districtId || undefined,
        category: form.category,
        severity: form.severity,
        description: form.description,
        immediateActionTaken: form.immediateActionTaken || undefined,
      });
      closeCreate();
      await loadReports();
      setSelected(res.report);
    } catch (err: any) {
      setFormError(err.message || 'Could not submit the report.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasFilters = filterSeverity || filterStatus || filterMine || filterDistrict;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Hazards"
        description="Something unsafe that needs fixing. For an emergency, use SOS."
        actions={
          <button onClick={openCreate} className="btn-primary">
            <Plus className="w-4 h-4" />
            Report hazard
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input w-auto">
          <option value="">Any status</option>
          <option value="OPEN">Not closed</option>
          {(Object.keys(HAZARD_STATUS) as SafetyReport['status'][]).map((s) => (
            <option key={s} value={s}>
              {HAZARD_STATUS[s]}
            </option>
          ))}
        </select>
        <select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)} className="input w-auto">
          <option value="">Any severity</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {titleCase(s)}
            </option>
          ))}
        </select>
        {canPickMine && (
          <select
            value={filterMine}
            onChange={(e) => {
              setFilterMine(e.target.value);
              setFilterDistrict('');
            }}
            className="input w-auto max-w-[16rem]"
          >
            <option value="">All mines</option>
            {choices.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
        {viewDistricts.length > 0 && (
          <select value={filterDistrict} onChange={(e) => setFilterDistrict(e.target.value)} className="input w-auto">
            <option value="">All districts</option>
            {viewDistricts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
        {hasFilters && (
          <button
            onClick={() => {
              setFilterSeverity('');
              setFilterStatus('');
              setFilterMine('');
              setFilterDistrict('');
            }}
            className="text-sm text-zinc-500 hover:text-zinc-200 px-2"
          >
            Clear
          </button>
        )}
      </div>

      <div className="card divide-y divide-white/[0.05] stagger">
        {isLoading ? (
          <ListSkeleton />
        ) : reports.length === 0 ? (
          <Empty>{hasFilters ? 'No reports match these filters.' : 'No hazards reported yet.'}</Empty>
        ) : (
          reports.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelected(r)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${SEVERITY_DOT[r.severity] || 'bg-zinc-500'}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-zinc-200 truncate">{r.description}</p>
                <p className="mt-0.5 text-xs text-zinc-500 truncate">
                  {titleCase(r.category)} · {r.district?.name || r.mine?.name} · {shortDate(r.createdAt)}
                </p>
              </div>
              <StatusPill status={r.status} label={HAZARD_STATUS[r.status]} />
            </button>
          ))
        )}
      </div>

      {selected && (
        <HazardDetail
          report={selected}
          onClose={closeSelected}
          onChanged={(r) => {
            setSelected(r);
            loadReports();
          }}
        />
      )}

      {isCreateOpen && (
        <Modal title="Report a hazard" onClose={closeCreate}>
          <form onSubmit={handleCreate} className="p-5 space-y-4">
            <div className={`grid gap-3 ${canPickMine ? 'grid-cols-2' : ''}`}>
              {canPickMine && (
                <Field label="Mine">
                  <select
                    required
                    value={form.mineId}
                    onChange={(e) => setForm({ ...form, mineId: e.target.value, districtId: '' })}
                    className="input"
                  >
                    <option value="" disabled>
                      Select
                    </option>
                    {choices.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Where">
                <select value={form.districtId} onChange={(e) => setForm({ ...form, districtId: e.target.value })} className="input">
                  <option value="">Not sure</option>
                  {formDistricts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="What kind">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input">
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="How serious">
              <Segmented
                value={form.severity}
                onChange={(v) => setForm({ ...form, severity: v })}
                options={SEVERITIES.map((s) => ({ value: s, label: titleCase(s) }))}
              />
            </Field>
            <Field label="What did you see?">
              <textarea
                rows={3}
                required
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What is wrong, and exactly where, e.g. roof leaking in gallery 14"
                className="input resize-none"
              />
            </Field>
            <Field label="Action already taken (optional)">
              <input
                type="text"
                value={form.immediateActionTaken}
                onChange={(e) => setForm({ ...form, immediateActionTaken: e.target.value })}
                placeholder="e.g. Fenced off, stopped the conveyor"
                className="input"
              />
            </Field>
            {formError && <p className="text-sm text-red-400">{formError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={closeCreate} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={isSubmitting} className="btn-primary">
                {isSubmitting ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

type Action = null | 'fixed' | 'reopen' | 'inspect';

const HazardDetail: React.FC<{ report: SafetyReport; onClose: () => void; onChanged: (r: SafetyReport) => void }> = ({
  report: r,
  onClose,
  onChanged,
}) => {
  const { user } = useAuth();
  const [action, setAction] = useState<Action>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canWork = atLeast(user, 'SIRDAR') && user?.role !== 'DGMS'; // DGMS reviews; the mine's staff act
  // The server also checks that the checker is above the person who fixed it.
  const canCheck = atLeast(user, 'OVERMAN') && user?.id !== r.fixedById;

  const run = async (fn: () => Promise<SafetyReport>, done: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const updated = await fn();
      setAction(null);
      setNote('');
      setMessage(done);
      onChanged(updated);
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={r.id} onClose={onClose}>
      <div className="p-5 space-y-5">
        {r.imageUrl && <img src={r.imageUrl} alt="" className="w-full h-44 object-cover rounded-lg border border-white/[0.06]" />}
        <p className="text-sm text-zinc-200 leading-relaxed">{r.description}</p>
        <DetailRows
          rows={[
            ['Status', <StatusPill status={r.status} label={HAZARD_STATUS[r.status]} />],
            ['Severity', titleCase(r.severity)],
            ['Kind', titleCase(r.category)],
            ['Where', r.district ? `${r.district.name}${r.district.location ? ` · ${r.district.location}` : ''}` : r.mine?.name],
            ['Reported by', r.reporter?.name || 'Anonymous'],
            ['Reported', shortDate(r.createdAt)],
            ['Action taken', r.immediateActionTaken],
            ['Handled by', r.assignedOfficer],
            ['Audit record', <TamperProofBadge hash={r.recordHash} recordId={r.id} />],
          ]}
        />

        {r.fixedByName && (
          <div className="card px-3 py-2.5">
            <p className="text-xs text-zinc-500">
              Fixed by {r.fixedByName}
              {r.fixedAt && ` · ${shortDate(r.fixedAt)}`}
            </p>
            <p className="mt-1 text-sm text-zinc-200">{r.fixNote}</p>
          </div>
        )}
        {r.verifiedByName && (
          <p className={`text-sm ${r.status === 'RESOLVED' ? 'text-emerald-400' : 'text-amber-400'}`}>
            {r.status === 'RESOLVED' ? `Checked and closed by ${r.verifiedByName}` : `Sent back by ${r.verifiedByName}`}
            {r.verifyNote && <span className="block mt-0.5 text-zinc-400">{r.verifyNote}</span>}
          </p>
        )}
        {r.status === 'FIXED' && r.inspectionId && (
          <p className="text-sm text-zinc-400">
            Inspection sent:{' '}
            <Link to={`/inspections?open=${encodeURIComponent(r.inspectionId)}`} className="underline text-zinc-200">
              {r.inspectionId}
            </Link>
            . It closes this hazard when approved.
          </p>
        )}

        {message && <p className="text-sm text-zinc-400">{message}</p>}

        {canWork && r.status !== 'RESOLVED' && action === null && (
          <div className="flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
            {r.status === 'SUBMITTED' && (
              <button disabled={busy} onClick={() => run(() => api.acknowledgeHazard(r.id), 'You are now handling this.')} className="btn-secondary flex-1">
                I'll handle it
              </button>
            )}
            {(r.status === 'SUBMITTED' || r.status === 'ASSIGNED') && (
              <button onClick={() => setAction('fixed')} className="btn-primary flex-1">
                Mark fixed
              </button>
            )}
            {r.status === 'FIXED' && canCheck && (
              <>
                <button
                  disabled={busy}
                  onClick={() => run(async () => (await api.verifyHazardFix(r.id, 'CONFIRM')).report, 'Fix confirmed. The hazard is closed.')}
                  className="btn-primary flex-1"
                >
                  Confirm fix
                </button>
                <button onClick={() => setAction('reopen')} className="btn-secondary flex-1">
                  Not fixed
                </button>
                {!r.inspectionId && (
                  <button onClick={() => setAction('inspect')} className="btn-secondary w-full">
                    Send someone to inspect it
                  </button>
                )}
              </>
            )}
            {r.status === 'FIXED' && !canCheck && <p className="text-sm text-zinc-500">Waiting for someone above {r.fixedByName} to check the fix.</p>}
          </div>
        )}

        {(action === 'fixed' || action === 'reopen') && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              action === 'fixed'
                ? run(() => api.markHazardFixed(r.id, note.trim()), 'Marked fixed. The Overman has been asked to check it.')
                : run(async () => (await api.verifyHazardFix(r.id, 'REOPEN', note.trim())).report, 'Sent back to be fixed.');
            }}
            className="space-y-3 border-t border-white/[0.06] pt-4"
          >
            <Field label={action === 'fixed' ? 'What was done?' : 'What is still wrong?'}>
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="input resize-none" autoFocus />
            </Field>
            <div className="flex gap-2">
              <button type="button" onClick={() => setAction(null)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button type="submit" disabled={busy || note.trim().length < 3} className="btn-primary flex-1">
                {busy ? 'Saving…' : action === 'fixed' ? 'Mark fixed' : 'Send back'}
              </button>
            </div>
          </form>
        )}

        {action === 'inspect' && (
          <SendInspection
            report={r}
            onCancel={() => setAction(null)}
            onDone={(updated) => {
              setAction(null);
              setMessage('Inspection assigned. The hazard closes when it is approved.');
              onChanged(updated);
            }}
          />
        )}
      </div>
    </Modal>
  );
};

const SendInspection: React.FC<{ report: SafetyReport; onCancel: () => void; onDone: (r: SafetyReport) => void }> = ({ report, onCancel, onDone }) => {
  const { user } = useAuth();
  const [people, setPeople] = useState<StaffMember[] | null>(null);
  const [assignedToId, setAssignedToId] = useState('');
  const [dueDate, setDueDate] = useState(inDays(1));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getMine(report.mineId)
      .then((m) =>
        setPeople((m.users || []).filter((p) => p.role && p.role !== 'WORKER' && p.id !== user?.id && p.id !== report.fixedById))
      )
      .catch(() => setPeople([]));
  }, [report.mineId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignedToId) return setError('Choose who will inspect it.');
    setBusy(true);
    setError(null);
    try {
      onDone(await api.sendHazardInspection(report.id, { assignedToId, dueDate: new Date(`${dueDate}T23:59:00`).toISOString(), note: note.trim() || undefined }));
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 border-t border-white/[0.06] pt-4">
      <p className="text-sm text-zinc-400">They go and check the fix, and submit photos. When their inspection is approved, this hazard closes.</p>
      <Field label="Who">
        <select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} className="input" disabled={!people}>
          <option value="">{people === null ? 'Loading…' : 'Choose a person'}</option>
          {people?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {describeRole({ ...p, isAdmin: false })}
            </option>
          ))}
        </select>
      </Field>
      <Field label="By">
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input" required />
      </Field>
      <input value={note} onChange={(e) => setNote(e.target.value)} className="input" placeholder="Anything to look at in particular (optional)" />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">
          Cancel
        </button>
        <button type="submit" disabled={busy} className="btn-primary flex-1">
          {busy ? 'Assigning…' : 'Assign inspection'}
        </button>
      </div>
    </form>
  );
};
