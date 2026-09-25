import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, X, Plus, Camera, MapPin } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Inspection, Mine, StaffMember, User } from '../types';
import { atLeast, describeRole } from '../roles';
import { getPosition, formatDistance } from '../attendance';
import { compressImage } from '../image';
import { StatusPill } from '../components/StatusPill';
import { TamperProofBadge } from '../components/TamperProofBadge';
import { PageHeader, Modal, Empty, Field, Tabs, Segmented, DetailRows, titleCase, shortDate, ListSkeleton } from '../components/ui';

const TYPES = ['ROUTINE', 'ROOF_SUPPORT_CHECK', 'VENTILATION_AUDIT', 'ELECTRICAL_SAFETY', 'MACHINERY_CHECK', 'FIRE_SAFETY', 'STATUTORY_QUARTERLY'];
const MAX_PHOTOS = 4;

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: 'Due',
  SUBMITTED: 'Awaiting approval',
  RETURNED: 'Sent back',
  COMPLETED: 'Approved',
  MISSED: 'Not done',
};

const isOpenTask = (i: Inspection) => i.status === 'SCHEDULED' || i.status === 'RETURNED';
export const isOverdue = (i: Inspection) => isOpenTask(i) && !!i.deadline && new Date(i.deadline).getTime() < Date.now();
const titleOf = (i: Inspection) => i.title || titleCase(i.inspectionType);
const dateTime = (d: string) => new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

type Box = 'mine' | 'approve' | 'all';

export const InspectionsPage: React.FC<{ mines: Mine[] }> = ({ mines }) => {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<Inspection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(params.get('open'));
  const [isAssigning, setIsAssigning] = useState(false);

  const canSeeAll = atLeast(user, 'SIRDAR');
  const canAssign = atLeast(user, 'OVERMAN');
  const hasTasks = !!user?.role;
  const [box, setBox] = useState<Box>(user?.isAdmin && !user.role ? 'all' : 'mine');

  const load = () =>
    api
      .getInspections()
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch((e) => console.error('Error fetching inspections:', e))
      .finally(() => setIsLoading(false));

  useEffect(() => {
    load();
  }, []);

  const mineTasks = items.filter((i) => i.assignedToId === user?.id);
  const toApprove = items.filter((i) => i.canReview);
  const list = box === 'mine' ? mineTasks : box === 'approve' ? toApprove : items;
  const openMine = mineTasks.filter(isOpenTask).length;
  const selected = items.find((i) => i.id === selectedId) || null;

  const tabs = [
    ...(hasTasks ? [{ value: 'mine' as Box, label: `My tasks${openMine ? ` ${openMine}` : ''}` }] : []),
    ...(canSeeAll ? [{ value: 'approve' as Box, label: `To approve${toApprove.length ? ` ${toApprove.length}` : ''}` }] : []),
    ...(canSeeAll ? [{ value: 'all' as Box, label: 'All' }] : []),
  ];

  const close = () => {
    setSelectedId(null);
    if (params.has('open')) setParams({}, { replace: true });
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Inspections"
        actions={
          canAssign && (
            <button onClick={() => setIsAssigning(true)} className="btn-primary">
              <Plus className="w-4 h-4" />
              Assign
            </button>
          )
        }
      />

      {tabs.length > 1 && <Tabs<Box> value={box} onChange={setBox} options={tabs} />}

      <div className="card divide-y divide-white/[0.05] stagger">
        {isLoading ? (
          <ListSkeleton />
        ) : list.length === 0 ? (
          <Empty>{box === 'mine' ? 'Nothing assigned to you.' : box === 'approve' ? 'Nothing waiting for your approval.' : 'No inspections yet.'}</Empty>
        ) : (
          list.map((i) => {
            const overdue = isOverdue(i);
            return (
              <button
                key={i.id}
                onClick={() => setSelectedId(i.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-200 truncate">{titleOf(i)}</p>
                  <p className="mt-0.5 text-xs text-zinc-500 truncate">
                    {box !== 'mine' && `${i.assignedTo?.name || i.inspectorName} · `}
                    {i.mine?.name}
                    {i.deadline && (
                      <span className={overdue ? 'text-red-400' : ''}>
                        {' · '}
                        {overdue ? 'overdue since' : 'due'} {shortDate(i.deadline)}
                      </span>
                    )}
                  </p>
                </div>
                <StatusPill status={overdue ? 'OVERDUE' : i.status} label={overdue ? 'Overdue' : STATUS_LABEL[i.status]} />
              </button>
            );
          })
        )}
      </div>

      {selected && user && (
        <InspectionDetail
          inspection={selected}
          me={user}
          onClose={close}
          onChanged={(updated) => {
            setItems((cur) => cur.map((x) => (x.id === updated.id ? { ...updated, canReview: false } : x)));
            load();
          }}
        />
      )}

      {isAssigning && (
        <AssignModal
          mines={user?.isAdmin || user?.role === 'DGMS' ? mines : mines.filter((m) => m.id === user?.mineId)}
          onClose={() => setIsAssigning(false)}
          onDone={(created) => {
            setIsAssigning(false);
            setBox('all');
            load().then(() => setSelectedId(created.id));
          }}
        />
      )}
    </div>
  );
};

const InspectionDetail: React.FC<{
  inspection: Inspection;
  me: User;
  onClose: () => void;
  onChanged: (i: Inspection) => void;
}> = ({ inspection: i, me, onClose, onChanged }) => {
  const isAssignee = i.assignedToId === me.id;
  const overdue = isOverdue(i);

  return (
    <Modal title={titleOf(i)} onClose={onClose}>
      <div className="p-5 space-y-6">
        {i.status === 'RETURNED' && i.reviewNote && (
          <div className="card-warning px-3 py-2.5">
            <p className="text-xs text-amber-300">Sent back by {i.reviewedByName}</p>
            <p className="mt-1 text-sm text-zinc-200">{i.reviewNote}</p>
          </div>
        )}

        <DetailRows
          rows={[
            ['Status', <StatusPill status={overdue ? 'OVERDUE' : i.status} label={overdue ? 'Overdue' : STATUS_LABEL[i.status]} />],
            ['Type', titleCase(i.inspectionType)],
            ['Mine', i.mine?.name],
            ['Assigned to', i.assignedTo ? `${i.assignedTo.name} · ${describeRole({ ...i.assignedTo, isAdmin: false })}` : i.inspectorName],
            ['Assigned by', i.assignedByName],
            ['Due', i.deadline ? shortDate(i.deadline) : null],
            ...(i.hazardId
              ? [['Checks the fix of', <Link to={`/safety-reports?open=${encodeURIComponent(i.hazardId)}`} className="underline">{i.hazardId}</Link>] as [string, React.ReactNode]]
              : []),
            ...(i.recordHash ? [['Audit record', <TamperProofBadge hash={i.recordHash} recordId={i.id} />] as [string, React.ReactNode]] : []),
          ]}
        />

        {i.checklist?.length > 0 && <LegacyChecklist inspection={i} />}

        {i.submittedAt && i.status !== 'RETURNED' && <Submission inspection={i} />}

        {(i.status === 'COMPLETED' || i.status === 'MISSED') && i.reviewedByName && (
          <p className="text-sm text-emerald-400">
            {i.status === 'COMPLETED' ? 'Approved' : 'Accepted as not done'} by {i.reviewedByName}
            {i.reviewedAt && <span className="text-zinc-500"> · {dateTime(i.reviewedAt)}</span>}
            {i.reviewNote && <span className="block mt-1 text-zinc-400">{i.reviewNote}</span>}
          </p>
        )}

        {isAssignee && isOpenTask(i) && <SubmitForm inspection={i} onDone={onChanged} />}
        {i.canReview && <ReviewForm inspection={i} onDone={onChanged} />}
        {i.status === 'SUBMITTED' && !i.canReview && (
          <p className="text-sm text-zinc-500">Waiting for someone above {isAssignee ? 'you' : i.assignedTo?.name} to approve.</p>
        )}
      </div>
    </Modal>
  );
};

const Submission: React.FC<{ inspection: Inspection }> = ({ inspection: i }) => (
  <div className="space-y-3">
    <p className="text-xs text-zinc-500">Submitted {i.submittedAt && dateTime(i.submittedAt)}</p>
    <p className={`text-sm font-medium ${i.outcome === 'DONE' ? 'text-emerald-400' : 'text-amber-400'}`}>
      {i.outcome === 'DONE' ? 'Marked done' : 'Marked not done'}
    </p>
    {i.submissionNote && <p className="text-sm text-zinc-300 leading-relaxed">{i.submissionNote}</p>}
    {i.photos.length > 0 && (
      <div className="grid grid-cols-2 gap-2">
        {i.photos.map((src) => (
          <a key={src} href={src} target="_blank" rel="noreferrer" className="block aspect-[4/3] rounded-lg overflow-hidden border border-white/10">
            <img src={src} alt="Inspection proof" className="w-full h-full object-cover" loading="lazy" />
          </a>
        ))}
      </div>
    )}
    <p className="text-xs text-zinc-500 flex items-center gap-1.5">
      <MapPin className="w-3.5 h-3.5" />
      {i.submitDistance != null ? `Submitted ${formatDistance(i.submitDistance)} from the mine centre` : 'Location was not shared'}
    </p>
  </div>
);

const LegacyChecklist: React.FC<{ inspection: Inspection }> = ({ inspection: i }) => (
  <div className="space-y-4">
    {i.findings && <p className="text-sm text-zinc-300 leading-relaxed">{i.findings}</p>}
    <ul className="space-y-2">
      {i.checklist.map((chk, idx) => (
        <li key={idx} className="flex items-start gap-2.5 text-sm">
          {chk.passed ? <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> : <X className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />}
          <div className="min-w-0">
            <p className={chk.passed ? 'text-zinc-300' : 'text-zinc-100'}>{chk.item}</p>
            {chk.note && <p className="mt-0.5 text-xs text-zinc-500">{chk.note}</p>}
          </div>
        </li>
      ))}
    </ul>
  </div>
);

/** Location is extra proof but never blocks a submission (it may be unavailable inside the mine). */
const tryPosition = () =>
  Promise.race([getPosition(), new Promise<null>((r) => setTimeout(() => r(null), 8000))]).catch(() => null);

const SubmitForm: React.FC<{ inspection: Inspection; onDone: (i: Inspection) => void }> = ({ inspection, onDone }) => {
  const [outcome, setOutcome] = useState<'DONE' | 'NOT_DONE'>('DONE');
  const [photos, setPhotos] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [phase, setPhase] = useState<'idle' | 'photos' | 'sending'>('idle');
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    setPhase('photos');
    try {
      const room = MAX_PHOTOS - photos.length;
      const picked = [...files].slice(0, room);
      const compressed = await Promise.all(picked.map((f) => compressImage(f)));
      setPhotos((p) => [...p, ...compressed]);
      if (files.length > room) setError(`Only ${MAX_PHOTOS} photos can be attached.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPhase('idle');
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (outcome === 'DONE' && photos.length === 0) return setError('Add at least one photo as proof.');
    if (outcome === 'NOT_DONE' && note.trim().length < 3) return setError("Say why it couldn't be done.");
    setError(null);
    setPhase('sending');
    try {
      const pos = await tryPosition();
      const updated = await api.submitInspection(inspection.id, {
        outcome,
        note: note.trim() || undefined,
        photos,
        ...(pos ? { latitude: pos.lat, longitude: pos.lng } : {}),
      });
      onDone(updated);
    } catch (err: any) {
      setError(err.message);
      setPhase('idle');
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 border-t border-white/[0.06] pt-5">
      <Field label="Result">
        <Segmented
          value={outcome}
          onChange={setOutcome}
          options={[
            { value: 'DONE', label: 'Done' },
            { value: 'NOT_DONE', label: 'Not done' },
          ]}
        />
      </Field>

      <div>
        <p className="label">Photos {outcome === 'DONE' ? '' : '(optional)'}</p>
        <div className="grid grid-cols-4 gap-2">
          {photos.map((src, idx) => (
            <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-white/10">
              <img src={src} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => setPhotos((p) => p.filter((_, j) => j !== idx))}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 flex items-center justify-center"
                aria-label={`Remove photo ${idx + 1}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={phase !== 'idle'}
              className="aspect-square rounded-lg border border-dashed border-white/15 flex flex-col items-center justify-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 hover:border-white/30 transition-colors"
            >
              <Camera className="w-5 h-5" />
              {phase === 'photos' ? 'Processing…' : 'Add'}
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          hidden
          onChange={(e) => addPhotos(e.target.files)}
        />
      </div>

      <Field label={outcome === 'DONE' ? 'Notes (optional)' : "Why couldn't it be done?"}>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="input resize-none" />
      </Field>

      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={phase !== 'idle'} className="btn-primary w-full h-11 sm:h-9">
        {phase === 'sending' ? 'Submitting…' : 'Submit for approval'}
      </button>
    </form>
  );
};

const ReviewForm: React.FC<{ inspection: Inspection; onDone: (i: Inspection) => void }> = ({ inspection, onDone }) => {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'APPROVE' | 'RETURN' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: 'APPROVE' | 'RETURN') => {
    if (decision === 'RETURN' && note.trim().length < 3) return setError('Say what needs to be redone.');
    setBusy(decision);
    setError(null);
    try {
      onDone(await api.reviewInspection(inspection.id, { decision, note: note.trim() || undefined }));
    } catch (err: any) {
      setError(err.message);
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3 border-t border-white/[0.06] pt-5">
      <Field label="Comment (needed to send back)">
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="input resize-none" />
      </Field>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button onClick={() => decide('RETURN')} disabled={!!busy} className="btn-secondary flex-1">
          {busy === 'RETURN' ? 'Sending…' : 'Send back'}
        </button>
        <button onClick={() => decide('APPROVE')} disabled={!!busy} className="btn-primary flex-1">
          {busy === 'APPROVE' ? 'Saving…' : inspection.outcome === 'DONE' ? 'Approve' : 'Accept as not done'}
        </button>
      </div>
    </div>
  );
};

const tomorrow = () => {
  const d = new Date(Date.now() + 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const AssignModal: React.FC<{ mines: Mine[]; onClose: () => void; onDone: (i: Inspection) => void }> = ({ mines, onClose, onDone }) => {
  const { user: me } = useAuth();
  const [mineId, setMineId] = useState(mines[0]?.id || '');
  const [people, setPeople] = useState<StaffMember[] | null>(null);
  const [assignedToId, setAssignedToId] = useState('');
  const [inspectionType, setInspectionType] = useState(TYPES[0]);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(tomorrow());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mineId) return;
    setPeople(null);
    setAssignedToId('');
    api
      .getMine(mineId)
      .then((m) => setPeople((m.users || []).filter((u) => u.role && u.id !== me?.id)))
      .catch(() => setPeople([]));
  }, [mineId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignedToId) return setError('Choose who will do it.');
    setBusy(true);
    setError(null);
    try {
      // Due at the end of the chosen day, local time.
      onDone(await api.assignInspection({ mineId, assignedToId, inspectionType, title, dueDate: new Date(`${dueDate}T23:59:00`).toISOString() }));
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal title="Assign inspection" onClose={onClose}>
      <form onSubmit={submit} className="p-5 space-y-4">
        <Field label="Mine">
          <select value={mineId} onChange={(e) => setMineId(e.target.value)} className="input">
            {mines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Who">
          <select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} className="input" disabled={!people}>
            <option value="">{people === null ? 'Loading…' : people.length ? 'Choose a person' : 'Nobody at this mine yet'}</option>
            {people?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {describeRole({ ...p, isAdmin: false })}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Type">
          <select value={inspectionType} onChange={(e) => setInspectionType(e.target.value)} className="input">
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {titleCase(t)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="What to inspect (optional)">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Roof bolts, District 2" className="input" />
        </Field>
        <Field label="Due">
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input" required />
        </Field>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'Assigning…' : 'Assign'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
