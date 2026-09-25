import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Mine, Shift } from '../types';
import { SHIFTS, minesFor } from '../roles';
import { PageHeader, Segmented, ListSkeleton } from '../components/ui';
import { DistrictBoard } from '../components/shift/DistrictBoard';
import { useShiftBoard } from '../components/shift/useShift';

const ORDER: Shift[] = ['A', 'B', 'C'];

/** Steps one shift back or forward: C of one day is followed by A of the next. */
function step(date: string, shift: Shift, dir: 1 | -1): { date: string; shift: Shift } {
  const i = ORDER.indexOf(shift) + dir;
  if (i >= 0 && i < 3) return { date, shift: ORDER[i] };
  const t = new Date(`${date}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + dir);
  return { date: t.toISOString().slice(0, 10), shift: dir === 1 ? 'A' : 'C' };
}

/** Every district of a mine for any shift: who inspected it, what they found, who read it, and the handover. */
export const ShiftsPage: React.FC<{ mines: Mine[] }> = ({ mines }) => {
  const { user } = useAuth();
  const choices = minesFor(user, mines);
  const canPickMine = choices.length > 1;
  const [mineId, setMineId] = useState(user?.mineId || '');
  const [pick, setPick] = useState<{ date?: string; shift?: Shift }>({});

  useEffect(() => {
    if (!mineId && choices.length) setMineId(choices[0].id);
  }, [choices.length, mineId]);

  const { board, error, reload } = useShiftBoard({ mineId: mineId || undefined, ...pick }, !!mineId);
  const shown = board && board.mine.id === mineId ? board : null;
  const isNow = !!shown && shown.date === shown.current.date && shown.shift === shown.current.shift;
  const isFuture =
    !!shown && (shown.date > shown.current.date || (shown.date === shown.current.date && ORDER.indexOf(shown.shift) > ORDER.indexOf(shown.current.shift)));

  const inspected = shown?.districts.filter((d) => d.report).length ?? 0;
  const handedOver = shown?.districts.filter((d) => d.report?.handoverNote).length ?? 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Shift board"
        description={
          user?.role === 'DGMS'
            ? "Each district's pre-shift inspection for one shift, as the Sirdar submitted it."
            : "Each district's pre-shift inspection for one shift. Open a district to read the report, sign it off, or withdraw workers."
        }
        actions={
          canPickMine && (
            <select value={mineId} onChange={(e) => setMineId(e.target.value)} className="input w-auto max-w-[16rem]">
              {choices.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )
        }
      />

      {shown && (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setPick(step(shown.date, shown.shift, -1))} className="btn-ghost border border-white/10" aria-label="Previous shift">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input type="date" value={shown.date} onChange={(e) => e.target.value && setPick({ date: e.target.value, shift: shown.shift })} className="input w-auto" />
          <div className="w-44">
            <Segmented value={shown.shift} onChange={(s) => setPick({ date: shown.date, shift: s })} options={SHIFTS.map((s) => ({ value: s, label: `Shift ${s}` }))} />
          </div>
          <button
            onClick={() => setPick(step(shown.date, shown.shift, 1))}
            disabled={isNow || isFuture}
            className="btn-ghost border border-white/10 disabled:opacity-40 disabled:pointer-events-none"
            aria-label="Next shift"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {!isNow && (
            <button onClick={() => setPick(shown.current)} className="btn-secondary">
              Now
            </button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {shown ? (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500">
            {shown.shiftLabel}
            {isNow && ' · running now'}
            {' · '}
            {inspected} of {shown.districts.length} inspected
            {!isNow && !isFuture && ` · ${handedOver} handed over`}
            {shown.overmen.length > 0 && ` · Overman: ${shown.overmen.map((o) => o.name).join(', ')}`}
          </p>
          <DistrictBoard board={shown} onChanged={reload} />
        </div>
      ) : (
        !error && (
          <div className="card">
            <ListSkeleton rows={3} />
          </div>
        )
      )}
    </div>
  );
};
