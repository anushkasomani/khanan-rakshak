import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin, LogOut, CloudOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, GpsReading } from '../services/api';
import { MyAttendance } from '../types';
import {
  getPosition,
  distanceMeters,
  formatDistance,
  formatTime,
  formatDuration,
  enqueue,
  flushQueue,
  pendingFor,
  isOfflineError,
} from '../attendance';
import { MinesMap, LatLng } from './MineMap';
import { AnimatePresence, motion } from 'framer-motion';
import { quick, smooth } from '../motion';

type Phase = 'idle' | 'locating' | 'sending';

const todayLabel = () => new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/** Today's GPS check-in / check-out for the signed-in user. */
export const AttendanceCard: React.FC<{ onData?: (d: MyAttendance) => void }> = ({ onData }) => {
  const { user } = useAuth();
  const userId = user?.id || '';
  const [data, setData] = useState<MyAttendance | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [outside, setOutside] = useState<LatLng | null>(null);
  const [pending, setPending] = useState(() => pendingFor(userId));
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  const load = useCallback(async () => {
    try {
      const d = await api.getMyAttendance();
      setData(d);
      setLoadError(false);
      onDataRef.current?.(d);
    } catch {
      setLoadError(true);
    }
  }, []);

  const sync = useCallback(async () => {
    if (pendingFor(userId).length) {
      const { rejected } = await flushQueue(userId);
      if (rejected.length) setError(rejected[0]);
      setPending(pendingFor(userId));
    }
    await load();
  }, [userId, load]);

  useEffect(() => {
    sync();
    window.addEventListener('online', sync);
    return () => window.removeEventListener('online', sync);
  }, [sync]);

  const act = async (kind: 'in' | 'out') => {
    setError(null);
    setOutside(null);
    setPhase('locating');
    let reading: GpsReading;
    try {
      const pos = await getPosition();
      reading = { latitude: pos.lat, longitude: pos.lng, accuracy: Math.round(pos.accuracy), capturedAt: new Date().toISOString() };
      const mine = data?.mine;
      if (kind === 'in' && mine?.latitude != null && mine?.longitude != null) {
        const d = distanceMeters(pos, { lat: mine.latitude, lng: mine.longitude });
        if (d > mine.radiusMeters) {
          setOutside(pos);
          setError(`You are ${formatDistance(d)} from ${mine.name}. Check in from inside the mine area.`);
          return;
        }
      }
    } catch (e) {
      setError((e as Error).message);
      setPhase('idle');
      return;
    } finally {
      setPhase((p) => (p === 'locating' ? 'idle' : p));
    }

    setPhase('sending');
    try {
      await (kind === 'in' ? api.checkIn(reading) : api.checkOut(reading));
      await load();
    } catch (e) {
      if (isOfflineError(e)) {
        enqueue({ userId, kind, reading });
        setPending(pendingFor(userId));
      } else {
        setError((e as Error).message);
      }
    } finally {
      setPhase('idle');
    }
  };

  const mine = data?.mine;
  const today = data?.today;
  const pendingIn = pending.find((a) => a.kind === 'in');
  const pendingOut = pending.find((a) => a.kind === 'out');
  const busy = phase !== 'idle';
  const busyLabel = phase === 'locating' ? 'Finding your location…' : 'Saving…';

  let status: React.ReactNode;
  let action: React.ReactNode = null;

  if (!data) {
    status = loadError ? (
      <p className="text-sm text-zinc-500">Attendance is unavailable offline.</p>
    ) : (
      <div className="space-y-2 py-0.5" aria-label="Loading">
        <div className="skeleton h-4 w-36" />
        <div className="skeleton h-3 w-52 max-w-full" />
      </div>
    );
  } else if (!mine) {
    status = <p className="text-sm text-zinc-500">You are not assigned to a mine yet.</p>;
  } else if (mine.latitude == null) {
    status = <p className="text-sm text-zinc-500">{mine.name} has no location yet. Ask the admin to place it on the map.</p>;
  } else if (!today && pendingIn) {
    status = (
      <StatusLine
        dot="bg-amber-400"
        title={`Checked in at ${formatTime(pendingIn.reading.capturedAt!)}`}
        detail="Saved offline. It uploads when you're back online."
        icon={<CloudOff className="w-3.5 h-3.5" />}
      />
    );
  } else if (!today) {
    status = <StatusLine dot="bg-zinc-600" title="Not checked in" detail={`${mine.name} · within ${formatDistance(mine.radiusMeters)}`} />;
    action = (
      <button onClick={() => act('in')} disabled={busy} className="btn-primary w-full sm:w-auto h-11 sm:h-9">
        <MapPin className="w-4 h-4" />
        {busy ? busyLabel : 'Check in'}
      </button>
    );
  } else if (!today.checkOutAt) {
    const manual = today.source === 'MANUAL';
    status = (
      <StatusLine
        dot="bg-emerald-400"
        title={`${manual ? 'Marked present' : 'Checked in'} at ${formatTime(today.checkInAt)}`}
        detail={
          pendingOut
            ? `Check-out at ${formatTime(pendingOut.reading.capturedAt!)} saved offline`
            : manual
              ? `By ${today.markedByName}${today.note ? ` · ${today.note}` : ''}`
              : `${formatDistance(today.checkInDistance ?? 0)} from the mine centre${today.syncedLate ? ' · uploaded later' : ''}`
        }
      />
    );
    if (!pendingOut) {
      action = (
        <button onClick={() => act('out')} disabled={busy} className="btn-secondary w-full sm:w-auto h-11 sm:h-9">
          <LogOut className="w-4 h-4" />
          {busy ? busyLabel : 'Check out'}
        </button>
      );
    }
  } else {
    status = (
      <StatusLine
        dot="bg-zinc-500"
        title={`${formatTime(today.checkInAt)} – ${formatTime(today.checkOutAt)}`}
        detail={`${formatDuration(today.checkInAt, today.checkOutAt)} on site`}
      />
    );
  }

  const statusKey = !data ? 'loading' : today?.checkOutAt ? 'done' : today ? 'in' : pendingIn ? 'pending' : 'idle';

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-medium">Attendance</h2>
        <span className="text-xs text-zinc-500">{todayLabel()}</span>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={statusKey}
            className="flex-1 min-w-0"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={quick}
          >
            {status}
          </motion.div>
        </AnimatePresence>
        {action}
      </div>
      <AnimatePresence initial={false}>
        {error && (
          <motion.p
            key="error"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={smooth}
            className="text-sm text-red-400 overflow-hidden"
          >
            <span className="block pt-3">{error}</span>
          </motion.p>
        )}
        {outside && mine && (
          <motion.div key="map" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={smooth} className="mt-3">
            <MinesMap mines={[mine]} you={outside} height="h-48" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const StatusLine: React.FC<{ dot: string; title: string; detail?: string; icon?: React.ReactNode }> = ({ dot, title, detail, icon }) => (
  <div className="flex items-start gap-3 min-w-0">
    <span className="relative mt-2 w-2 h-2 shrink-0">
      <span className={`absolute inset-0 rounded-full ${dot}`} />
      {dot === 'bg-emerald-400' && (
        // One soft ring when you become checked in; not a looping pulse.
        <motion.span
          className={`absolute inset-0 rounded-full ${dot}`}
          initial={{ scale: 1, opacity: 0.6 }}
          animate={{ scale: 3, opacity: 0 }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
        />
      )}
    </span>
    <div className="min-w-0">
      <p className="text-base font-medium text-zinc-100">{title}</p>
      {detail && (
        <p className="mt-0.5 text-xs text-zinc-500 flex items-center gap-1.5">
          {icon}
          <span className="truncate">{detail}</span>
        </p>
      )}
    </div>
  </div>
);
