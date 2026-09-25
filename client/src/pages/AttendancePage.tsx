import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { AttendanceRecord, Mine, MineAttendance } from '../types';
import { atLeast, SHIFTS, minesFor } from '../roles';
import { formatTime, formatDuration } from '../attendance';
import { PageHeader, Section, Stat, Empty, Tabs, ListSkeleton } from '../components/ui';
import { AttendanceCard } from '../components/AttendanceCard';
import { RosterList, TrendBars } from '../components/AttendanceRoster';

const addDays = (date: string, n: number) => {
  const t = new Date(`${date}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

const longDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

export const AttendancePage: React.FC<{ mines: Mine[] }> = ({ mines }) => {
  const { user } = useAuth();
  return atLeast(user, 'SIRDAR') ? <MineAttendanceView mines={mines} /> : <MyAttendanceView />;
};

const MyAttendanceView: React.FC = () => {
  const [history, setHistory] = useState<AttendanceRecord[] | null>(null);

  return (
    <div className="space-y-8">
      <PageHeader title="Attendance" />
      <AttendanceCard onData={(d) => setHistory(d.history)} />
      <Section title="History">
        <div className="card divide-y divide-white/[0.05] stagger">
          {history === null ? (
            <ListSkeleton />
          ) : history.length === 0 ? (
            <Empty>No check-ins yet.</Empty>
          ) : (
            history.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <p className="text-sm text-zinc-200">{longDate(r.date)}</p>
                <div className="text-right">
                  <p className="text-sm tabular-nums text-zinc-200">
                    {formatTime(r.checkInAt)}
                    {r.checkOutAt && <span className="text-zinc-500"> – {formatTime(r.checkOutAt)}</span>}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {r.source === 'MANUAL'
                      ? `Marked by ${r.markedByName}`
                      : r.checkOutAt
                        ? formatDuration(r.checkInAt, r.checkOutAt)
                        : 'No check-out'}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </Section>
    </div>
  );
};

type Filter = 'absent' | 'present' | 'all';

const MineAttendanceView: React.FC<{ mines: Mine[] }> = ({ mines }) => {
  const { user } = useAuth();
  const choices = minesFor(user, mines);
  const canPickMine = choices.length > 1;
  const [mineId, setMineId] = useState(user?.mineId || '');
  const [date, setDate] = useState<string | undefined>(undefined);
  // A Sirdar starts on their own crew, an Overman on their own shift; both can widen the view.
  const [shift, setShift] = useState(user?.role === 'SIRDAR' || user?.role === 'OVERMAN' ? user.shift || '' : '');
  const [districtId, setDistrictId] = useState(user?.role === 'SIRDAR' ? user.districtId || '' : '');
  const districts = mines.find((m) => m.id === mineId)?.districts || [];
  const [data, setData] = useState<MineAttendance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('absent');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!mineId && mines.length) setMineId(mines[0].id);
  }, [mines, mineId]);

  useEffect(() => {
    if (!mineId) return;
    let cancelled = false;
    setError(null);
    api
      .getMineAttendance(mineId, { date, shift: shift || undefined, districtId: districtId || undefined })
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [mineId, date, shift, districtId, reloadKey]);

  const shown = data && data.mine.id === mineId ? data : null;
  const isToday = !!shown && shown.date === shown.today;
  const present = shown?.people.filter((p) => p.attendance) || [];
  const absent = shown?.people.filter((p) => !p.attendance) || [];
  const list = filter === 'absent' ? absent : filter === 'present' ? present : shown?.people || [];
  const absentLabel = isToday ? 'Not checked in' : 'Absent';

  return (
    <div className="space-y-8">
      <PageHeader
        title="Attendance"
        description={shown?.mine.name}
        actions={
          canPickMine && (
            <select
              value={mineId}
              onChange={(e) => {
                setMineId(e.target.value);
                setDistrictId('');
              }}
              className="input w-auto max-w-[16rem]"
            >
              {choices.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )
        }
      />

      <div className="flex flex-wrap gap-2">
        <select value={districtId} onChange={(e) => setDistrictId(e.target.value)} className="input w-auto" aria-label="District">
          <option value="">All districts</option>
          {districts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select value={shift} onChange={(e) => setShift(e.target.value)} className="input w-auto" aria-label="Shift">
          <option value="">All shifts and staff</option>
          {SHIFTS.map((s) => (
            <option key={s} value={s}>
              Shift {s}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {shown && (
        <>
          <div className="flex items-center gap-2">
            <button onClick={() => setDate(addDays(shown.date, -1))} className="btn-ghost border border-white/10" aria-label="Previous day">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="date"
              value={shown.date}
              max={shown.today}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="input w-auto"
            />
            <button
              onClick={() => setDate(addDays(shown.date, 1))}
              disabled={isToday}
              className="btn-ghost border border-white/10 disabled:opacity-40 disabled:pointer-events-none"
              aria-label="Next day"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            {!isToday && (
              <button onClick={() => setDate(shown.today)} className="btn-secondary">
                Today
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Stat label="Present" value={`${shown.summary.present}/${shown.summary.total}`} />
            <Stat label={absentLabel} value={shown.summary.total - shown.summary.present} />
            <Stat
              label="Rate"
              value={shown.summary.total ? `${Math.round((shown.summary.present / shown.summary.total) * 100)}%` : '–'}
            />
          </div>

          <TrendBars trend={shown.trend} total={shown.summary.total} selected={shown.date} onSelect={setDate} />

          <div className="space-y-3">
            <Tabs<Filter>
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'absent', label: `${absentLabel} ${absent.length}` },
                { value: 'present', label: `Present ${present.length}` },
                { value: 'all', label: 'All' },
              ]}
            />
            <RosterList
              people={list}
              isToday={isToday}
              onChanged={() => setReloadKey((k) => k + 1)}
              empty={filter === 'absent' ? 'Everyone is checked in.' : filter === 'present' ? 'Nobody has checked in.' : 'No staff at this mine.'}
            />
          </div>
        </>
      )}

      {!shown && !error && <Empty>{mineId || mines.length ? 'Loading…' : 'No mines yet.'}</Empty>}
    </div>
  );
};
