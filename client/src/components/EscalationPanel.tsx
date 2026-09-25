import React, { useEffect, useState } from 'react';
import { ChevronsUp, Check, PhoneCall } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Escalation, EscalationRecipient, EscalationTarget } from '../types';
import { ROLE_LEVEL, ROLE_LABELS, OFFICER_TYPES, levelOf, describeRole } from '../roles';
import { ContactButtons } from './ContactButtons';
import { formatTime } from '../attendance';
import { Field } from './ui';

const TARGETS: EscalationTarget[] = ['OVERMAN', 'OFFICER', 'ASSISTANT_MANAGER', 'MINE_MANAGER', 'OWNER', 'DGMS'];

export const escalationTarget = (e: Pick<Escalation, 'toRole' | 'toOfficerType'>) =>
  e.toRole === 'OFFICER' && e.toOfficerType ? `${OFFICER_TYPES[e.toOfficerType] || e.toOfficerType} officer` : ROLE_LABELS[e.toRole];

export const CALL_NOTE: Record<Escalation['callStatus'], string | null> = {
  NONE: null,
  NOT_CONFIGURED: 'Automatic calls are not connected yet. Call them directly.',
  PLACED: 'Automatic voice calls placed.',
  FAILED: 'Automatic calls failed. Call them directly.',
};

const smsText = (summary: string, reason: string, from: string) => `Khanan Rakshak: ${summary}. ${reason} (${from})`;

/** Escalation history for an incident or SOS, plus the form to push it up the hierarchy. */
export const EscalationPanel: React.FC<{
  recordType: 'INCIDENT' | 'SOS';
  recordId: string;
  mineId: string;
  summary: string;
  severe: boolean;
  startOpen?: boolean;
}> = ({ recordType, recordId, mineId, summary, severe, startOpen = false }) => {
  const { user } = useAuth();
  const targets = TARGETS.filter((t) => user?.isAdmin || ROLE_LEVEL[t] > levelOf(user?.role));
  const canEscalate = !!user && (user.isAdmin || levelOf(user.role) >= ROLE_LEVEL.SIRDAR) && targets.length > 0;

  const [history, setHistory] = useState<Escalation[]>([]);
  const [isOpen, setIsOpen] = useState(startOpen && canEscalate);
  const [toRole, setToRole] = useState<EscalationTarget>(targets[0] || 'OFFICER');
  const [officerType, setOfficerType] = useState('');
  const [recipients, setRecipients] = useState<EscalationRecipient[] | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ recipients: EscalationRecipient[]; callStatus: Escalation['callStatus']; reason: string } | null>(null);

  const loadHistory = () => api.getEscalations(recordType, recordId).then(setHistory).catch(() => setHistory([]));

  useEffect(() => {
    loadHistory();
  }, [recordType, recordId]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setRecipients(null);
    api
      .getEscalationRecipients({ mineId, toRole, officerType: toRole === 'OFFICER' ? officerType || undefined : undefined })
      .then((r) => !cancelled && setRecipients(r))
      .catch((e) => !cancelled && (setRecipients([]), setError(e.message)));
    return () => {
      cancelled = true;
    };
  }, [isOpen, mineId, toRole, officerType]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.escalate({
        recordType,
        recordId,
        toRole,
        toOfficerType: toRole === 'OFFICER' ? officerType || undefined : undefined,
        reason,
      });
      setSent({ recipients: res.recipients, callStatus: res.callStatus, reason });
      setIsOpen(false);
      setReason('');
      loadHistory();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">Escalation</p>
        {canEscalate && !isOpen && (
          <button onClick={() => (setSent(null), setError(null), setIsOpen(true))} className={severe ? 'btn-danger h-8' : 'btn-secondary h-8'}>
            <ChevronsUp className="w-4 h-4" />
            Escalate
          </button>
        )}
      </div>

      {sent && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-3 space-y-3">
          <p className="text-sm text-emerald-300 flex items-center gap-2">
            <Check className="w-4 h-4" />
            {sent.recipients.length === 1 ? `${sent.recipients[0].name} has been notified.` : `${sent.recipients.length} people notified.`}
          </p>
          {CALL_NOTE[sent.callStatus] && (
            <p className="text-xs text-zinc-400 flex items-center gap-1.5">
              <PhoneCall className="w-3.5 h-3.5" />
              {CALL_NOTE[sent.callStatus]}
            </p>
          )}
          <RecipientList people={sent.recipients} sms={smsText(summary, sent.reason, user?.name || '')} />
        </div>
      )}

      {isOpen && (
        <form onSubmit={submit} className="rounded-lg border border-white/10 p-3 space-y-3">
          <Field label="Send to">
            <div className="grid grid-cols-2 gap-1.5">
              {targets.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setToRole(t)}
                  className={`h-9 rounded-lg border text-sm transition-colors ${
                    toRole === t ? 'border-white/30 bg-white/[0.06] text-zinc-100' : 'border-white/10 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {ROLE_LABELS[t]}
                </button>
              ))}
            </div>
          </Field>

          {toRole === 'OFFICER' && (
            <Field label="Officer">
              <select value={officerType} onChange={(e) => setOfficerType(e.target.value)} className="input">
                <option value="">All officers</option>
                {Object.entries(OFFICER_TYPES).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l} officer
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div>
            <p className="label">Will be notified</p>
            {recipients === null ? (
              <p className="text-sm text-zinc-500">Loading…</p>
            ) : recipients.length === 0 ? (
              <p className="text-sm text-amber-400">Nobody at this level is registered for this mine.</p>
            ) : (
              <RecipientList people={recipients} sms={smsText(summary, reason || 'Needs your attention.', user?.name || '')} />
            )}
          </div>

          <Field label="Why does this need them?">
            <textarea
              rows={2}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Two workers injured, need rescue team and ambulance"
              className="input resize-none"
            />
          </Field>

          {severe && (
            <p className="text-xs text-zinc-500">
              Critical: they will also get an automatic call once a call provider is connected.
            </p>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={busy || !recipients?.length} className={severe ? 'btn-danger' : 'btn-primary'}>
              {busy ? 'Sending…' : `Escalate${recipients?.length ? ` to ${recipients.length}` : ''}`}
            </button>
          </div>
        </form>
      )}

      {history.length > 0 ? (
        <ol className="space-y-2">
          {history.map((e) => (
            <li key={e.id} className="rounded-lg border border-white/[0.06] px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-zinc-200">
                  To {escalationTarget(e)}
                  <span className="text-zinc-500"> · by {e.fromUser.name}</span>
                </p>
                <span className="text-xs text-zinc-500 shrink-0 tabular-nums">{formatTime(e.createdAt)}</span>
              </div>
              <p className="mt-1 text-xs text-zinc-400">{e.reason}</p>
              <p className={`mt-1.5 text-xs ${e.status === 'ACKNOWLEDGED' ? 'text-emerald-400' : 'text-amber-400'}`}>
                {e.status === 'ACKNOWLEDGED'
                  ? `Acknowledged by ${e.acknowledgedByName} at ${formatTime(e.acknowledgedAt!)}`
                  : e.recipientCount
                    ? 'Waiting for acknowledgement'
                    : 'Nobody was registered to receive this'}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        !isOpen && !sent && <p className="text-sm text-zinc-500">Not escalated.</p>
      )}
    </div>
  );
};

const RecipientList: React.FC<{ people: EscalationRecipient[]; sms: string }> = ({ people, sms }) => (
  <ul className="divide-y divide-white/[0.05]">
    {people.map((p) => (
      <li key={p.id} className="flex items-center gap-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-zinc-200 truncate">{p.name}</p>
          <p className="text-xs text-zinc-500 truncate">
            {describeRole({ ...p, isAdmin: false })}
            {p.phone && ` · ${p.phone}`}
          </p>
        </div>
        <ContactButtons name={p.name} phone={p.phone} sms={sms} />
      </li>
    ))}
  </ul>
);
