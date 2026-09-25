import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import { MyShift, Shift, ShiftBoard } from '../../types';

const REFRESH_MS = 60000;

/** The signed-in person's shift today, refreshed every minute so a Sirdar's report shows up without reloading. */
export function useMyShift() {
  const [data, setData] = useState<MyShift | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(
    () =>
      api
        .getMyShift()
        .then((d) => (setData(d), setError(null)))
        .catch((e) => setError(e.message)),
    []
  );
  useEffect(() => {
    reload();
    const t = setInterval(reload, REFRESH_MS);
    return () => clearInterval(t);
  }, [reload]);
  return { data, error, reload, setData };
}

/** Every district of a mine for one shift. Leave date and shift out for the default (your shift, or the one running now). */
export function useShiftBoard(params: { mineId?: string; date?: string; shift?: Shift }, enabled = true) {
  const [board, setBoard] = useState<ShiftBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { mineId, date, shift } = params;
  const reload = useCallback(
    () =>
      api
        .getShiftBoard({ mineId, date, shift })
        .then((b) => (setBoard(b), setError(null)))
        .catch((e) => setError(e.message)),
    [mineId, date, shift]
  );
  useEffect(() => {
    if (!enabled) return;
    reload();
    const t = setInterval(reload, REFRESH_MS);
    return () => clearInterval(t);
  }, [reload, enabled]);
  return { board, error, reload };
}
