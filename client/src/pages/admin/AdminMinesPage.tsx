import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import { api } from '../../services/api';
import { Mine } from '../../types';
import { PageHeader, Modal, Empty, Field, ListSkeleton } from '../../components/ui';
import { MinePicker, MinesMap, LatLng } from '../../components/MineMap';
import { SHIFTS, shiftLabel, clockHour } from '../../roles';

const headcount = (m: Mine) => Object.values(m.staff || {}).reduce((a, b) => a + (b || 0), 0);

export const MineEditor: React.FC<{ mine: Mine | null; onClose: () => void; onSaved: (m: Mine) => void }> = ({
  mine,
  onClose,
  onSaved,
}) => {
  const [name, setName] = useState(mine?.name || '');
  const [company, setCompany] = useState(mine?.company || '');
  const [shiftStart, setShiftStart] = useState(mine?.shiftStartHour ?? 6);
  // Rows keep a local key so typing in one doesn't reset another when rows are added or removed.
  const [districts, setDistricts] = useState<{ key: string; id?: string; name: string; location: string }[]>(() =>
    mine?.districts?.length
      ? mine.districts.map((d) => ({ key: d.id, id: d.id, name: d.name, location: d.location || '' }))
      : [1, 2, 3].map((n) => ({ key: `new-${n}`, name: `District ${n}`, location: '' }))
  );
  const setDistrict = (key: string, patch: Partial<{ name: string; location: string }>) =>
    setDistricts((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const addDistrict = () =>
    setDistricts((list) => [...list, { key: `new-${Date.now()}`, name: `District ${list.length + 1}`, location: '' }]);
  const [code, setCode] = useState(mine?.code || '');
  const [locality, setLocality] = useState(mine?.locality || '');
  const [state, setState] = useState(mine?.state || '');
  const [point, setPoint] = useState<LatLng | null>(
    mine?.latitude != null && mine?.longitude != null ? { lat: mine.latitude, lng: mine.longitude } : null
  );
  const [radius, setRadius] = useState(mine?.radiusMeters || 500);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !state.trim()) {
      setError('Enter the mine name and state.');
      return;
    }
    if (!point) {
      setError('Place the mine on the map.');
      return;
    }
    const rows = districts.filter((d) => d.name.trim() || d.location.trim());
    if (rows.some((d) => !d.name.trim())) {
      setError('Give every district a name.');
      return;
    }
    setBusy(true);
    setError(null);
    const body = {
      name,
      company,
      shiftStartHour: shiftStart,
      districts: rows.map((d) => ({ id: d.id, name: d.name.trim(), location: d.location.trim() })),
      code: code || undefined,
      locality,
      state,
      region: state,
      latitude: point.lat,
      longitude: point.lng,
      radiusMeters: radius,
    };
    try {
      onSaved(mine ? await api.updateMine(mine.id, body) : await api.createMine(body));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={mine ? `Edit ${mine.name}` : 'Add mine'} onClose={onClose} width="lg">
      <form onSubmit={save} className="p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Mine name">
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
          </Field>
          <Field label="Code (optional)">
            <input value={code} onChange={(e) => setCode(e.target.value)} className="input uppercase placeholder:normal-case" placeholder="Generated if empty" disabled={!!mine} />
          </Field>
          <Field label="Owner company">
            <input value={company} onChange={(e) => setCompany(e.target.value)} className="input" placeholder="e.g. Bharat Coking Coal Ltd" />
          </Field>
          <Field label="Locality">
            <input value={locality} onChange={(e) => setLocality(e.target.value)} className="input" placeholder="Town or area" />
          </Field>
          <Field label="State">
            <input value={state} onChange={(e) => setState(e.target.value)} className="input" />
          </Field>
        </div>

        <Field label="Location">
          <MinePicker value={point} radius={radius} onChange={setPoint} onPlaceFound={(n) => !locality && setLocality(n)} />
        </Field>

        <Field label={`Attendance radius: ${radius >= 1000 ? `${(radius / 1000).toFixed(1)} km` : `${radius} m`}`}>
          <input
            type="range"
            min={100}
            max={5000}
            step={50}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="w-full accent-zinc-100"
          />
          <p className="mt-1 text-xs text-zinc-500">Workers can mark attendance only inside this circle.</p>
        </Field>

        <Field label="Shift A starts at">
          <div className="flex flex-wrap items-center gap-3">
            <select value={shiftStart} onChange={(e) => setShiftStart(Number(e.target.value))} className="input w-auto">
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {clockHour(h)}
                </option>
              ))}
            </select>
            <p className="text-xs text-zinc-500">{SHIFTS.map((x) => shiftLabel(x, shiftStart)).join('  ·  ')}</p>
          </div>
        </Field>

        <div>
          <p className="label">Districts</p>
          <p className="-mt-0.5 mb-2 text-xs text-zinc-500">
            The working sections of the mine. Each district has its own Sirdar on every shift. In an opencast mine, list the sections or pits.
          </p>
          <div className="space-y-2">
            {districts.map((d) => (
              <div key={d.key} className="flex items-start gap-2">
                <div className="flex-1 grid sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2">
                  <input
                    value={d.name}
                    onChange={(e) => setDistrict(d.key, { name: e.target.value })}
                    className="input"
                    placeholder="Name, e.g. District 2"
                    aria-label="District name"
                  />
                  <input
                    value={d.location}
                    onChange={(e) => setDistrict(d.key, { location: e.target.value })}
                    className="input"
                    placeholder="Where: seam, side, depth"
                    aria-label={`Where ${d.name || 'this district'} is`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setDistricts((list) => list.filter((x) => x.key !== d.key))}
                  className="btn-ghost shrink-0"
                  aria-label={`Remove ${d.name || 'district'}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addDistrict} className="btn-secondary h-8 px-3 mt-2">
            <Plus className="w-4 h-4" />
            Add district
          </button>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'Saving…' : mine ? 'Save' : 'Add mine'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export const AdminMinesPage: React.FC = () => {
  const navigate = useNavigate();
  const [mines, setMines] = useState<Mine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);

  const load = () =>
    api
      .getMines()
      .then(setMines)
      .catch((e) => console.error('Error loading mines:', e))
      .finally(() => setIsLoading(false));

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Mines"
        description={isLoading ? undefined : `${mines.length} enrolled`}
        actions={
          <button onClick={() => setIsAdding(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            Add mine
          </button>
        }
      />

      {!isLoading && mines.length > 0 && <MinesMap mines={mines} onSelect={(id) => navigate(`/admin/mines/${id}`)} />}

      <div className="card divide-y divide-white/[0.05] stagger">
        {isLoading ? (
          <ListSkeleton />
        ) : mines.length === 0 ? (
          <Empty>No mines yet. Add the first one.</Empty>
        ) : (
          mines.map((m) => (
            <button
              key={m.id}
              onClick={() => navigate(`/admin/mines/${m.id}`)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-zinc-200 truncate">{m.name}</p>
                <p className="mt-0.5 text-xs text-zinc-500 truncate">
                  {[m.company, m.locality, m.state].filter(Boolean).join(', ')} · {m.districts?.length || 0} districts · {headcount(m)}{' '}
                  {headcount(m) === 1 ? 'person' : 'people'}
                </p>
              </div>
              {m.latitude == null && <span className="text-xs text-amber-400">No location</span>}
            </button>
          ))
        )}
      </div>

      {isAdding && (
        <MineEditor
          mine={null}
          onClose={() => setIsAdding(false)}
          onSaved={(m) => {
            setIsAdding(false);
            navigate(`/admin/mines/${m.id}`);
          }}
        />
      )}
    </div>
  );
};
