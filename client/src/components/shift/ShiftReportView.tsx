import React, { useState } from 'react';
import { Check, X } from 'lucide-react';
import { api } from '../../services/api';
import { CheckKey, DistrictStatus, ShiftReport } from '../../types';
import { formatTime } from '../../attendance';
import { Field, Segmented } from '../ui';
import { TamperProofBadge } from '../TamperProofBadge';

export const CHECKS: { key: CheckKey; label: string; question: string }[] = [
  { key: 'GAS', label: 'Gas', question: 'Methane and other gases within limits' },
  { key: 'ROOF', label: 'Roof and sides', question: 'Roof, sides and supports sound' },
  { key: 'VENTILATION', label: 'Ventilation', question: 'Air reaching every working place' },
  { key: 'EQUIPMENT', label: 'Machines and cables', question: 'Safe to switch on and use' },
];

export const STATUS_TEXT: Record<DistrictStatus, { label: string; meaning: string; dot: string; text: string }> = {
  SAFE: { label: 'Safe', meaning: 'Everyone can work normally.', dot: 'bg-emerald-400', text: 'text-emerald-400' },
  RESTRICTED: { label: 'Safe with restrictions', meaning: 'Work can go on, but some places are fenced off.', dot: 'bg-amber-400', text: 'text-amber-400' },
  UNSAFE: { label: 'Unsafe', meaning: 'Nobody goes in until it is fixed.', dot: 'bg-red-500', text: 'text-red-400' },
};

export const DistrictStatusLine: React.FC<{ status: DistrictStatus; size?: 'sm' | 'lg' }> = ({ status, size = 'sm' }) => (
  <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${size === 'lg' ? 'text-base font-medium' : 'text-xs'} ${STATUS_TEXT[status].text}`}>
    <span className={`w-2 h-2 rounded-full ${STATUS_TEXT[status].dot}`} />
    {STATUS_TEXT[status].label}
  </span>
);

const time = (d: string) => new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * One pre-shift report, and what the viewer may do with it:
 * the Overman (or above) marks it read, the Sirdar or anyone above changes the status mid-shift,
 * and the Sirdar writes the handover for the next shift.
 */
export const ShiftReportView: React.FC<{
  report: ShiftReport;
  canMarkRead?: boolean;
  canChangeStatus?: boolean;
  canHandover?: boolean;
  onChanged?: (r: ShiftReport) => void;
}> = ({ report: r, canMarkRead, canChangeStatus, canHandover, onChanged }) => {
  const [action, setAction] = useState<null | 'status' | 'handover'>(null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DistrictStatusLine status={r.status} size="lg" />
        <p className="text-xs text-zinc-500">
          {r.sirdar.name} · submitted {formatTime(r.submittedAt)}
        </p>
      </div>

      {r.status === 'RESTRICTED' && r.restrictions && (
        <div className="card-warning px-3 py-2.5">
          <p className="text-xs text-amber-300">Keep out of</p>
          <p className="mt-0.5 text-sm text-zinc-200">{r.restrictions}</p>
        </div>
      )}

      <ul className="space-y-2">
        {CHECKS.map((c) => {
          const v = r.checks[c.key];
          return (
            <li key={c.key} className="flex items-start gap-2.5 text-sm">
              {v?.ok ? <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> : <X className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />}
              <div className="min-w-0">
                <p className={v?.ok ? 'text-zinc-300' : 'text-zinc-100'}>{c.label}</p>
                {v?.note && <p className="mt-0.5 text-xs text-zinc-500">{v.note}</p>}
              </div>
            </li>
          );
        })}
        {r.methanePct != null && <li className="text-xs text-zinc-500 pl-6">Highest methane reading {r.methanePct}%</li>}
      </ul>

      {r.notes && <p className="text-sm text-zinc-300 leading-relaxed">{r.notes}</p>}

      {r.history.length > 0 && (
        <div>
          <p className="text-xs text-zinc-500 mb-2">Changes during the shift</p>
          <ol className="space-y-2 border-l border-white/10 pl-3">
            {r.history.map((h, i) => (
              <li key={i} className="text-sm">
                <p className="text-zinc-200">
                  <span className={STATUS_TEXT[h.status].text}>{STATUS_TEXT[h.status].label}</span>
                  <span className="text-zinc-500"> · {h.by} · {formatTime(h.at)}</span>
                </p>
                <p className="text-xs text-zinc-400">{h.note}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="text-sm">
        {r.seenByName ? (
          <span className="text-zinc-400">
            Read by {r.seenByName}
            {r.seenAt && ` at ${formatTime(r.seenAt)}`}
            {r.seenNote && <span className="block text-zinc-500">{r.seenNote}</span>}
          </span>
        ) : (
          <span className="text-zinc-500">Not read by the Overman yet.</span>
        )}
      </p>

      {r.handoverNote && (
        <div className="card px-3 py-2.5">
          <p className="text-xs text-zinc-500">Handover to the next shift{r.handoverAt && ` · ${time(r.handoverAt)}`}</p>
          <p className="mt-1 text-sm text-zinc-200">{r.handoverNote}</p>
        </div>
      )}

      {r.recordHash && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-zinc-500">Audit record</span>
          <TamperProofBadge hash={r.recordHash} recordId={r.id} />
        </div>
      )}

      {canMarkRead && !r.seenByName && <MarkRead report={r} onDone={onChanged} />}

      {(canChangeStatus || canHandover) && action === null && (
        <div className="flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
          {canChangeStatus && (
            <button onClick={() => setAction('status')} className={r.status === 'UNSAFE' ? 'btn-secondary' : 'btn-danger'}>
              {r.status === 'UNSAFE' ? 'Clear the district again' : 'Withdraw workers / change status'}
            </button>
          )}
          {canHandover && (
            <button onClick={() => setAction('handover')} className="btn-secondary">
              {r.handoverNote ? 'Edit handover' : 'Write handover for next shift'}
            </button>
          )}
        </div>
      )}
      {action === 'status' && <ChangeStatus report={r} onCancel={() => setAction(null)} onDone={(x) => (setAction(null), onChanged?.(x))} />}
      {action === 'handover' && <Handover report={r} onCancel={() => setAction(null)} onDone={(x) => (setAction(null), onChanged?.(x))} />}
    </div>
  );
};

const MarkRead: React.FC<{ report: ShiftReport; onDone?: (r: ShiftReport) => void }> = ({ report, onDone }) => {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      onDone?.(await api.markShiftReportSeen(report.id, note.trim() || undefined));
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2 border-t border-white/[0.06] pt-4">
      <input value={note} onChange={(e) => setNote(e.target.value)} className="input" placeholder="Instruction for the Sirdar (optional)" />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button onClick={submit} disabled={busy} className="btn-primary w-full">
        {busy ? 'Saving…' : 'Mark as read'}
      </button>
    </div>
  );
};

const ChangeStatus: React.FC<{ report: ShiftReport; onCancel: () => void; onDone: (r: ShiftReport) => void }> = ({ report, onCancel, onDone }) => {
  const [status, setStatus] = useState<DistrictStatus>(report.status === 'UNSAFE' ? 'SAFE' : 'UNSAFE');
  const [restrictions, setRestrictions] = useState(report.restrictions || '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await api.changeDistrictStatus(report.id, { status, note: note.trim(), restrictions: status === 'RESTRICTED' ? restrictions.trim() : undefined }));
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 border-t border-white/[0.06] pt-4">
      <Field label="New status">
        <Segmented
          value={status}
          onChange={setStatus}
          options={(['SAFE', 'RESTRICTED', 'UNSAFE'] as DistrictStatus[]).map((s) => ({ value: s, label: s === 'RESTRICTED' ? 'Restricted' : STATUS_TEXT[s].label }))}
        />
      </Field>
      <p className="text-xs text-zinc-500">
        {status === 'UNSAFE'
          ? 'Everyone in the district is told to leave now, and nobody else can check in.'
          : 'The crew is told the district is open again. Only do this after inspecting it again.'}
      </p>
      {status === 'RESTRICTED' && (
        <input value={restrictions} onChange={(e) => setRestrictions(e.target.value)} className="input" placeholder="Places fenced off" />
      )}
      <textarea
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="input resize-none"
        placeholder={status === 'UNSAFE' ? 'What happened, e.g. methane above the limit at face 3' : 'What was done'}
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">
          Cancel
        </button>
        <button type="submit" disabled={busy} className={`${status === 'UNSAFE' ? 'btn-danger' : 'btn-primary'} flex-1`}>
          {busy ? 'Saving…' : status === 'UNSAFE' ? 'Withdraw everyone' : 'Save'}
        </button>
      </div>
    </form>
  );
};

const Handover: React.FC<{ report: ShiftReport; onCancel: () => void; onDone: (r: ShiftReport) => void }> = ({ report, onCancel, onDone }) => {
  const [note, setNote] = useState(report.handoverNote || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await api.writeHandover(report.id, note.trim()));
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3 border-t border-white/[0.06] pt-4">
      <Field label="What does the next Sirdar need to know?">
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="input resize-none"
          placeholder="Work left unfinished, places still fenced off, anything that changed"
          autoFocus
        />
      </Field>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">
          Cancel
        </button>
        <button type="submit" disabled={busy} className="btn-primary flex-1">
          {busy ? 'Saving…' : 'Hand over'}
        </button>
      </div>
    </form>
  );
};
