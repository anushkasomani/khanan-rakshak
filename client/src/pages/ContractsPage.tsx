import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Contract, ContractDetail, ContractStatus, Contractor, Mine, TrainingState, WorkType } from '../types';
import { atLeast, minesFor, shiftLabel, TRADES } from '../roles';
import { StatusPill } from '../components/StatusPill';
import { ContactButtons } from '../components/ContactButtons';
import { PageHeader, Modal, Empty, Field, Tabs, DetailRows, Section, titleCase, shortDate, ListSkeleton } from '../components/ui';
import { formatTime } from '../attendance';

export const WORK_TYPES: Record<WorkType, string> = {
  MDO: 'Mine developer and operator (MDO)',
  OB_REMOVAL: 'Overburden removal',
  COAL_TRANSPORT: 'Coal transport',
  SUPPORT_WORK: 'Roof support work',
  MACHINERY_HIRE: 'Machinery hire',
  CIVIL: 'Civil work',
  ELECTRICAL: 'Electrical work',
  OTHER: 'Other',
};

const STATUS_LABEL: Record<ContractStatus, string> = { ACTIVE: 'Active', SUSPENDED: 'Suspended', ENDED: 'Ended' };
const STATUS_PILL: Record<ContractStatus, string> = { ACTIVE: 'APPROVED', SUSPENDED: 'CRITICAL', ENDED: 'CLOSED' };

const TRAINING: Record<TrainingState, { label: string; cls: string }> = {
  OK: { label: 'Training valid', cls: 'text-zinc-500' },
  EXPIRING: { label: 'Training expires soon', cls: 'text-amber-400' },
  EXPIRED: { label: 'Training expired', cls: 'text-red-400' },
  MISSING: { label: 'No training on record', cls: 'text-red-400' },
};

const DAY = 86400000;
const daysLeft = (end: string) => Math.ceil((new Date(end).getTime() + DAY - Date.now()) / DAY);
/** YYYY-MM-DD in the viewer's own time zone, for date inputs. */
const toInput = (d: string | Date) => {
  const t = new Date(d);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

/** "ends in 10 days" in amber when close, and the plain date otherwise. */
const EndsLine: React.FC<{ c: Contract }> = ({ c }) => {
  if (c.status !== 'ACTIVE') return <>ended {shortDate(c.endDate)}</>;
  const left = daysLeft(c.endDate);
  if (left < 0) return <span className="text-red-400">past its end date ({shortDate(c.endDate)})</span>;
  if (left <= 14) return <span className="text-amber-400">ends in {left} day{left === 1 ? '' : 's'}</span>;
  return <>until {shortDate(c.endDate)}</>;
};

/** Contractors working at the mine, what they're doing, and whether their people are fit to work. */
export const ContractsPage: React.FC<{ mines: Mine[] }> = ({ mines }) => {
  const { user } = useAuth();
  const choices = minesFor(user, mines);
  const [mineId, setMineId] = useState(user?.mineId || '');
  const [view, setView] = useState<'ACTIVE' | 'ALL'>('ACTIVE');
  const [contracts, setContracts] = useState<Contract[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Contract | 'new' | null>(null);
  const canManage = atLeast(user, 'ASSISTANT_MANAGER') && user?.role !== 'DGMS';

  useEffect(() => {
    if (!mineId && choices.length) setMineId(choices[0].id);
  }, [choices.length, mineId]);

  const load = () => {
    if (!mineId) return;
    api
      .getContracts({ mineId })
      .then(setContracts)
      .catch(() => setContracts([]));
  };
  useEffect(() => {
    setContracts(null);
    load();
  }, [mineId]);

  const active = contracts?.filter((c) => c.status === 'ACTIVE') || [];
  const list = view === 'ACTIVE' ? active : contracts || [];
  const mine = mines.find((m) => m.id === mineId);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Contracts"
        description="Contractors working at the mine. Their workers can check in only while the contract is active and their training is valid."
        actions={
          <>
            {choices.length > 1 && (
              <select value={mineId} onChange={(e) => setMineId(e.target.value)} className="input w-auto max-w-[16rem]">
                {choices.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}
            {canManage && (
              <button onClick={() => setEditing('new')} className="btn-primary">
                <Plus className="w-4 h-4" />
                New contract
              </button>
            )}
          </>
        }
      />

      <Tabs
        value={view}
        onChange={setView}
        options={[
          { value: 'ACTIVE', label: `Active ${active.length}` },
          { value: 'ALL', label: 'All' },
        ]}
      />

      <div className="card divide-y divide-white/[0.05] stagger">
        {contracts === null ? (
          <ListSkeleton />
        ) : list.length === 0 ? (
          <Empty>{view === 'ACTIVE' ? 'No contractors are working here right now.' : 'No contracts yet.'}</Empty>
        ) : (
          list.map((c) => {
            const s = c.stats;
            const trainingIssues = s ? s.trainingExpired + s.trainingExpiring : 0;
            return (
              <button
                key={c.id}
                onClick={() => setOpenId(c.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-200 truncate">{c.title}</p>
                  <p className="mt-0.5 text-xs text-zinc-500 truncate">
                    {c.contractor.name} · {WORK_TYPES[c.workType]} · <EndsLine c={c} />
                  </p>
                  {s && c.status === 'ACTIVE' && (
                    <p className="mt-0.5 text-xs text-zinc-500 truncate">
                      {s.workers} worker{s.workers === 1 ? '' : 's'} · {s.presentNow} on site
                      {trainingIssues > 0 && (
                        <span className={s.trainingExpired ? 'text-red-400' : 'text-amber-400'}>
                          {' · '}
                          {s.trainingExpired > 0 && `${s.trainingExpired} can't work (training)`}
                          {s.trainingExpired > 0 && s.trainingExpiring > 0 && ', '}
                          {s.trainingExpiring > 0 && `${s.trainingExpiring} training expiring`}
                        </span>
                      )}
                      {s.openIncidents > 0 && <span className="text-orange-400"> · {s.openIncidents} open incident{s.openIncidents === 1 ? '' : 's'}</span>}
                    </p>
                  )}
                </div>
                <StatusPill status={STATUS_PILL[c.status]} label={STATUS_LABEL[c.status]} />
              </button>
            );
          })
        )}
      </div>

      {openId && (
        <ContractModal
          id={openId}
          shiftStartHour={mine?.shiftStartHour}
          onClose={() => setOpenId(null)}
          onEdit={(c) => {
            setOpenId(null);
            setEditing(c);
          }}
          onChanged={load}
        />
      )}
      {editing && mine && (
        <ContractEditor
          contract={editing === 'new' ? null : editing}
          mine={mine}
          onClose={() => setEditing(null)}
          onSaved={(c) => {
            setEditing(null);
            load();
            setOpenId(c.id);
          }}
        />
      )}
    </div>
  );
};

const ContractModal: React.FC<{
  id: string;
  shiftStartHour?: number;
  onClose: () => void;
  onEdit: (c: Contract) => void;
  onChanged: () => void;
}> = ({ id, shiftStartHour, onClose, onEdit, onChanged }) => {
  const [c, setC] = useState<ContractDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stopping, setStopping] = useState<null | 'SUSPENDED' | 'ENDED'>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .getContract(id)
      .then(setC)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [id]);

  const setStatus = async (status: ContractStatus) => {
    setBusy(true);
    setError(null);
    try {
      await api.updateContract(id, { status, statusNote: note.trim() || undefined });
      setStopping(null);
      setNote('');
      await load();
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={c ? c.title : 'Contract'} onClose={onClose} width="lg">
      <div className="p-5 space-y-6">
        {!c ? (
          error ? <p className="text-sm text-red-400">{error}</p> : <ListSkeleton rows={3} />
        ) : (
          <>
            {c.status !== 'ACTIVE' && (
              <div className={`${c.status === 'SUSPENDED' ? 'card-danger' : 'card'} px-3 py-2.5`}>
                <p className="text-sm text-zinc-200">
                  {c.status === 'SUSPENDED' ? 'Suspended. Its workers cannot check in.' : 'Ended.'}
                </p>
                {c.statusNote && <p className="mt-0.5 text-xs text-zinc-400">{c.statusNote}</p>}
              </div>
            )}
            <DetailRows
              rows={[
                ['Contractor', c.contractor.name],
                [
                  'Contact',
                  c.contractor.phone ? (
                    <span className="inline-flex items-center gap-2">
                      {c.contractor.contactName}
                      <ContactButtons name={c.contractor.contactName || c.contractor.name} phone={c.contractor.phone} />
                    </span>
                  ) : (
                    c.contractor.contactName
                  ),
                ],
                ['Work', WORK_TYPES[c.workType]],
                ['Where', c.district?.name || 'Whole mine'],
                ['Period', `${shortDate(c.startDate)} – ${shortDate(c.endDate)}`],
                ['Work order / LoA', c.reference],
                ['Issued by', c.createdByName],
                ['ID', c.id],
              ]}
            />

            <Section title={`Workers · ${c.workers.length}`}>
              <div className="card divide-y divide-white/[0.05]">
                {c.workers.length === 0 ? (
                  <Empty>Nobody is enrolled under this contract yet. Add them on the People page and choose this contract under "Employed by".</Empty>
                ) : (
                  c.workers.map((w) => (
                    <div key={w.id} className="flex items-center gap-3 px-4 py-3">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${w.today ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-zinc-200 truncate">
                          {w.name}
                          {w.trade && <span className="text-zinc-500"> · {TRADES[w.trade] || w.trade}</span>}
                        </p>
                        <p className="mt-0.5 text-xs text-zinc-500 truncate">
                          {[w.district?.name, w.shift && shiftLabel(w.shift, shiftStartHour)].filter(Boolean).join(' · ')}
                          {' · '}
                          <span className={TRAINING[w.training].cls}>
                            {TRAINING[w.training].label}
                            {w.trainingValidUntil && ` (${shortDate(w.trainingValidUntil)})`}
                          </span>
                        </p>
                      </div>
                      <span className="text-xs text-zinc-500 shrink-0">{w.today ? `In ${formatTime(w.today.checkInAt)}` : 'Not in'}</span>
                    </div>
                  ))
                )}
              </div>
            </Section>

            {c.incidents.length > 0 && (
              <Section title="Incidents involving this contractor">
                <div className="card divide-y divide-white/[0.05]">
                  {c.incidents.map((i) => (
                    <Link key={i.id} to={`/incidents?open=${encodeURIComponent(i.id)}`} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02]">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-zinc-200 truncate">{titleCase(i.incidentType)}</p>
                        <p className="mt-0.5 text-xs text-zinc-500 truncate">
                          {i.location} · {titleCase(i.severity)} · {shortDate(i.createdAt)}
                        </p>
                      </div>
                      <StatusPill status={i.status} />
                    </Link>
                  ))}
                </div>
              </Section>
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}

            {c.canManage && !stopping && (
              <div className="flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
                <button onClick={() => onEdit(c)} className="btn-secondary">
                  Edit
                </button>
                {c.status === 'ACTIVE' ? (
                  <>
                    <button onClick={() => setStopping('SUSPENDED')} className="btn-danger">
                      Suspend work
                    </button>
                    <button onClick={() => setStopping('ENDED')} className="btn-secondary">
                      End contract
                    </button>
                  </>
                ) : (
                  <button onClick={() => setStatus('ACTIVE')} disabled={busy} className="btn-primary">
                    Make active again
                  </button>
                )}
              </div>
            )}
            {stopping && (
              <div className="space-y-3 border-t border-white/[0.06] pt-4">
                <p className="text-sm text-zinc-400">
                  {stopping === 'SUSPENDED'
                    ? 'Its workers are told to stop, and none of them can check in until you make it active again.'
                    : 'The work is finished. Its workers can no longer check in under it.'}
                </p>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="input resize-none"
                  placeholder={stopping === 'SUSPENDED' ? 'Why, e.g. workers found without PPE' : 'e.g. Work order completed'}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button onClick={() => setStopping(null)} className="btn-secondary flex-1">
                    Cancel
                  </button>
                  <button
                    onClick={() => setStatus(stopping)}
                    disabled={busy || note.trim().length < 3}
                    className={`${stopping === 'SUSPENDED' ? 'btn-danger' : 'btn-primary'} flex-1`}
                  >
                    {busy ? 'Saving…' : stopping === 'SUSPENDED' ? 'Suspend' : 'End contract'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};

const ContractEditor: React.FC<{ contract: Contract | null; mine: Mine; onClose: () => void; onSaved: (c: Contract) => void }> = ({
  contract,
  mine,
  onClose,
  onSaved,
}) => {
  const [contractors, setContractors] = useState<Contractor[] | null>(null);
  const [contractorId, setContractorId] = useState(contract?.contractorId || '');
  const [fresh, setFresh] = useState({ name: '', contactName: '', phone: '' });
  const [title, setTitle] = useState(contract?.title || '');
  const [workType, setWorkType] = useState<WorkType>(contract?.workType || 'OB_REMOVAL');
  const [reference, setReference] = useState(contract?.reference || '');
  const [districtId, setDistrictId] = useState(contract?.districtId || '');
  const [startDate, setStartDate] = useState(contract ? toInput(contract.startDate) : toInput(new Date()));
  const [endDate, setEndDate] = useState(contract ? toInput(contract.endDate) : toInput(new Date(Date.now() + 365 * DAY)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isNewContractor = !contract && contractorId === 'NEW';

  useEffect(() => {
    api
      .getContractors()
      .then((list) => {
        setContractors(list);
        if (!contract && !list.length) setContractorId('NEW');
      })
      .catch(() => setContractors([]));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      title,
      workType,
      reference,
      districtId: districtId || null,
      startDate: new Date(`${startDate}T00:00:00`).toISOString(),
      endDate: new Date(`${endDate}T00:00:00`).toISOString(),
    };
    try {
      const saved = contract
        ? await api.updateContract(contract.id, body)
        : await api.createContract({
            ...body,
            mineId: mine.id,
            ...(isNewContractor ? { newContractor: fresh } : { contractorId }),
          });
      onSaved(saved);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal title={contract ? 'Edit contract' : `New contract · ${mine.name}`} onClose={onClose}>
      <form onSubmit={save} className="p-5 space-y-4">
        {!contract && (
          <Field label="Contractor">
            <select value={contractorId} onChange={(e) => setContractorId(e.target.value)} className="input" disabled={!contractors}>
              <option value="">{contractors ? 'Choose' : 'Loading…'}</option>
              {contractors?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="NEW">New contractor…</option>
            </select>
          </Field>
        )}
        {isNewContractor && (
          <div className="grid sm:grid-cols-3 gap-2">
            <input value={fresh.name} onChange={(e) => setFresh({ ...fresh, name: e.target.value })} className="input" placeholder="Company name" />
            <input value={fresh.contactName} onChange={(e) => setFresh({ ...fresh, contactName: e.target.value })} className="input" placeholder="Contact person" />
            <input value={fresh.phone} onChange={(e) => setFresh({ ...fresh, phone: e.target.value })} className="input" placeholder="Phone" type="tel" />
          </div>
        )}
        <Field label="What is the work?">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="e.g. Overburden removal, benches 3 to 6" />
        </Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Type of work">
            <select value={workType} onChange={(e) => setWorkType(e.target.value as WorkType)} className="input">
              {(Object.keys(WORK_TYPES) as WorkType[]).map((k) => (
                <option key={k} value={k}>
                  {WORK_TYPES[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Where">
            <select value={districtId} onChange={(e) => setDistrictId(e.target.value)} className="input">
              <option value="">Whole mine</option>
              {mine.districts?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Starts">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input" required />
          </Field>
          <Field label="Ends">
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input" required />
          </Field>
        </div>
        <Field label="Work order or LoA number (optional)">
          <input value={reference} onChange={(e) => setReference(e.target.value)} className="input" placeholder="e.g. BCCL/DHN/WO/2026/118" />
        </Field>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'Saving…' : contract ? 'Save' : 'Issue contract'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
