import React, { useState } from 'react';
import { Phone, Undo2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { RosterPerson, User } from '../types';
import { describeRole, levelOf } from '../roles';
import { formatTime } from '../attendance';
import { Empty, Modal, Field } from './ui';

const REASONS = ['Phone battery dead', 'No GPS signal', 'Left phone at home'];

/** Same rule as the server: only someone above the person (or an admin), never yourself. */
const canMark = (me: User | null, p: RosterPerson) =>
  !!me && me.id !== p.id && (me.isAdmin || levelOf(me.role) > levelOf(p.role));

/** People at a mine with their check-in state for one day. */
export const RosterList: React.FC<{
  people: RosterPerson[];
  isToday: boolean;
  empty: string;
  onChanged?: () => void;
}> = ({ people, isToday, empty, onChanged }) => {
  const { user } = useAuth();
  const [marking, setMarking] = useState<RosterPerson | null>(null);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const undo = async (recordId: string) => {
    setUndoing(recordId);
    setError(null);
    try {
      await api.undoMark(recordId);
      onChanged?.();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUndoing(null);
    }
  };

  return (
    <>
      {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
      <div className="card divide-y divide-white/[0.05] stagger">
        {people.length === 0 ? (
          <Empty>{empty}</Empty>
        ) : (
          people.map((p) => {
            const a = p.attendance;
            const editable = isToday && !!onChanged && canMark(user, p);
            return (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${a ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-200 truncate">{p.name}</p>
                  <p className="mt-0.5 text-xs text-zinc-500 truncate">
                    {describeRole({ ...p, isAdmin: false })}
                    {p.contract && ` · ${p.contract.contractor.name}`}
                    {p.badgeNumber && ` · ${p.badgeNumber}`}
                    {p.contract && (!p.trainingValidUntil || new Date(p.trainingValidUntil).getTime() < Date.now()) && (
                      <span className="text-red-400"> · training expired</span>
                    )}
                  </p>
                </div>
                {a ? (
                  <>
                    <div className="text-right shrink-0 min-w-0">
                      <p className="text-sm tabular-nums text-zinc-200">
                        {formatTime(a.checkInAt)}
                        {a.checkOutAt && <span className="text-zinc-500"> – {formatTime(a.checkOutAt)}</span>}
                      </p>
                      {a.source === 'MANUAL' ? (
                        <p className="text-[11px] text-amber-400/90 truncate max-w-[11rem]" title={a.note || undefined}>
                          Marked by {a.markedByName}
                        </p>
                      ) : (
                        a.syncedLate && <p className="text-[11px] text-zinc-500">uploaded later</p>
                      )}
                    </div>
                    {a.source === 'MANUAL' && editable && (
                      <button
                        onClick={() => undo(a.id)}
                        disabled={undoing === a.id}
                        className="btn-ghost shrink-0 -mr-2"
                        aria-label={`Undo mark for ${p.name}`}
                        title="Undo manual mark"
                      >
                        <Undo2 className="w-4 h-4" />
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    {editable ? (
                      <button onClick={() => setMarking(p)} className="btn-secondary h-8 px-2.5 text-xs shrink-0">
                        Mark present
                      </button>
                    ) : (
                      <span className="text-xs text-zinc-500 shrink-0">{isToday ? 'Not checked in' : 'Absent'}</span>
                    )}
                    {p.phone && (
                      <a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`} className="btn-ghost shrink-0 -mr-2" aria-label={`Call ${p.name}`} title={p.phone}>
                        <Phone className="w-4 h-4" />
                      </a>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
      {marking && (
        <MarkPresentModal
          person={marking}
          onClose={() => setMarking(null)}
          onDone={() => {
            setMarking(null);
            onChanged?.();
          }}
        />
      )}
    </>
  );
};

const MarkPresentModal: React.FC<{ person: RosterPerson; onClose: () => void; onDone: () => void }> = ({ person, onClose, onDone }) => {
  const [reason, setReason] = useState(REASONS[0]);
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const note = reason === 'OTHER' ? other.trim() : reason;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.markPresent(person.id, note);
      onDone();
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal title={`Mark ${person.name} present`} onClose={onClose}>
      <form onSubmit={submit} className="p-5 space-y-4">
        <p className="text-sm text-zinc-400">
          Only do this if you have seen them on site. The record will show it was marked by you, not by GPS.
        </p>
        <Field label="Why no GPS check-in?">
          <div className="space-y-1.5">
            {[...REASONS, 'OTHER'].map((r) => (
              <label key={r} className="flex items-center gap-2.5 h-9 px-3 rounded-lg border border-white/10 text-sm text-zinc-200 cursor-pointer has-[:checked]:border-white/30 has-[:checked]:bg-white/[0.04]">
                <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} className="accent-zinc-100" />
                {r === 'OTHER' ? 'Other' : r}
              </label>
            ))}
          </div>
        </Field>
        {reason === 'OTHER' && (
          <input value={other} onChange={(e) => setOther(e.target.value)} placeholder="Reason" className="input" autoFocus />
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={busy || note.length < 3} className="btn-primary">
            {busy ? 'Saving…' : 'Mark present'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const dayLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
const fullLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });

/** Present count for the last 7 days; click a bar to open that day. */
export const TrendBars: React.FC<{
  trend: { date: string; present: number }[];
  total: number;
  selected: string;
  onSelect?: (date: string) => void;
}> = ({ trend, total, selected, onSelect }) => {
  const max = Math.max(total, ...trend.map((t) => t.present), 1);
  return (
    <div className="card p-4">
      <p className="text-xs text-zinc-500 mb-3">Present, last 7 days</p>
      <div className="grid grid-cols-7 gap-2 h-32">
        {trend.map((t) => {
          const active = t.date === selected;
          return (
            <button
              key={t.date}
              type="button"
              onClick={() => onSelect?.(t.date)}
              title={`${fullLabel(t.date)}: ${t.present} present`}
              className="group flex flex-col items-center justify-end gap-1 min-w-0 rounded-md hover:bg-white/[0.03] transition-colors"
            >
              <span className={`text-xs tabular-nums ${active ? 'text-zinc-100' : 'text-zinc-400'}`}>{t.present}</span>
              <span
                className="w-full max-w-[2rem] rounded-t bg-[#3987e5] transition-opacity"
                style={{ height: `${Math.max((t.present / max) * 72, t.present ? 4 : 1)}px`, opacity: active ? 1 : 0.45 }}
              />
              <span className={`text-[11px] ${active ? 'text-zinc-200' : 'text-zinc-500'}`}>{dayLabel(t.date)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
