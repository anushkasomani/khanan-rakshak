import React, { useState } from 'react';
import { api } from '../../services/api';
import { CheckKey, DistrictStatus, ShiftReport } from '../../types';
import { Modal, Field, Segmented } from '../ui';
import { CHECKS, STATUS_TEXT } from './ShiftReportView';

type CheckState = { ok: boolean | null; note: string };

/** The Sirdar's pre-shift inspection. Nobody in the district can check in until this is submitted. */
export const ShiftReportForm: React.FC<{
  districtName: string;
  shiftLabel: string;
  onClose: () => void;
  onDone: (r: ShiftReport) => void;
}> = ({ districtName, shiftLabel, onClose, onDone }) => {
  const [checks, setChecks] = useState<Record<CheckKey, CheckState>>({
    GAS: { ok: null, note: '' },
    ROOF: { ok: null, note: '' },
    VENTILATION: { ok: null, note: '' },
    EQUIPMENT: { ok: null, note: '' },
  });
  const [methane, setMethane] = useState('');
  const [status, setStatus] = useState<DistrictStatus | null>(null);
  const [restrictions, setRestrictions] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answered = CHECKS.every((c) => checks[c.key].ok !== null);
  const anyProblem = CHECKS.some((c) => checks[c.key].ok === false);
  const setCheck = (key: CheckKey, patch: Partial<CheckState>) => {
    const next = { ...checks, [key]: { ...checks[key], ...patch } };
    setChecks(next);
    // A failed check rules out "fully safe"; move the choice on rather than letting it be submitted and rejected.
    if (status === 'SAFE' && CHECKS.some((c) => next[c.key].ok === false)) setStatus('RESTRICTED');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answered) return setError('Answer every check.');
    const missing = CHECKS.find((c) => checks[c.key].ok === false && checks[c.key].note.trim().length < 3);
    if (missing) return setError(`Say what is wrong with: ${missing.label.toLowerCase()}.`);
    if (!status) return setError('Say whether people can work in the district.');
    if (status === 'RESTRICTED' && restrictions.trim().length < 3) return setError('Say which places are fenced off.');
    if (status === 'UNSAFE' && notes.trim().length < 3) return setError('Say why nobody can go in.');
    setBusy(true);
    setError(null);
    try {
      const report = await api.submitShiftReport({
        checks: Object.fromEntries(CHECKS.map((c) => [c.key, { ok: !!checks[c.key].ok, note: checks[c.key].note.trim() || undefined }])) as Record<
          CheckKey,
          { ok: boolean; note?: string }
        >,
        methanePct: methane.trim() ? Number(methane) : undefined,
        status,
        restrictions: status === 'RESTRICTED' ? restrictions.trim() : undefined,
        notes: notes.trim() || undefined,
      });
      onDone(report);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal title={`Pre-shift inspection · ${districtName}`} onClose={onClose}>
      <form onSubmit={submit} className="p-5 space-y-5">
        <p className="text-sm text-zinc-400">
          {shiftLabel}. Walk every working place first. Your crew can check in only after you submit this.
        </p>

        <div className="space-y-4">
          {CHECKS.map((c) => {
            const v = checks[c.key];
            return (
              <div key={c.key}>
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <p className="text-sm text-zinc-200">{c.label}</p>
                  <p className="text-xs text-zinc-500 text-right">{c.question}</p>
                </div>
                <Segmented
                  value={v.ok === null ? '' : v.ok ? 'OK' : 'NOT_OK'}
                  onChange={(x) => setCheck(c.key, { ok: x === 'OK' })}
                  options={[
                    { value: 'OK', label: 'OK' },
                    { value: 'NOT_OK', label: 'Not OK' },
                  ]}
                />
                {v.ok === false && (
                  <input
                    value={v.note}
                    onChange={(e) => setCheck(c.key, { note: e.target.value })}
                    className="input mt-2"
                    placeholder="What is wrong, and where"
                    autoFocus
                  />
                )}
              </div>
            );
          })}
        </div>

        <Field label="Highest methane reading, % (optional)">
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            max="100"
            value={methane}
            onChange={(e) => setMethane(e.target.value)}
            className="input"
            placeholder="e.g. 0.3"
          />
        </Field>

        <Field label="Can people work in the district?">
          <div className="space-y-1.5">
            {(['SAFE', 'RESTRICTED', 'UNSAFE'] as DistrictStatus[]).map((s) => {
              const disabled = s === 'SAFE' && anyProblem;
              return (
                <label
                  key={s}
                  className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border text-sm cursor-pointer has-[:checked]:border-white/30 has-[:checked]:bg-white/[0.04] ${
                    disabled ? 'opacity-40 cursor-not-allowed border-white/5' : 'border-white/10'
                  }`}
                >
                  <input
                    type="radio"
                    name="status"
                    checked={status === s}
                    disabled={disabled}
                    onChange={() => setStatus(s)}
                    className="mt-1 accent-zinc-100"
                  />
                  <span>
                    <span className="block text-zinc-200">{STATUS_TEXT[s].label}</span>
                    <span className="block text-xs text-zinc-500">{STATUS_TEXT[s].meaning}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </Field>

        {status === 'RESTRICTED' && (
          <Field label="Places fenced off">
            <input value={restrictions} onChange={(e) => setRestrictions(e.target.value)} className="input" placeholder="e.g. Gallery 14, roof cracked" />
          </Field>
        )}

        <Field label={status === 'UNSAFE' ? 'Why nobody can go in' : 'Other notes (optional)'}>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="input resize-none" />
        </Field>

        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={busy} className={`${status === 'UNSAFE' ? 'btn-danger' : 'btn-primary'} w-full h-11 sm:h-9`}>
          {busy ? 'Submitting…' : status === 'UNSAFE' ? 'Submit: nobody goes in' : 'Submit and clear the district'}
        </button>
      </form>
    </Modal>
  );
};
