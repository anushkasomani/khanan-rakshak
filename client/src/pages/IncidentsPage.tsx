import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Incident, Mine } from '../types';
import { StatusPill } from '../components/StatusPill';
import { EscalationPanel } from '../components/EscalationPanel';
import { PageHeader, Modal, Empty, Field, Segmented, DetailRows, titleCase, shortDate, ListSkeleton } from '../components/ui';

interface IncidentsPageProps {
  mines: Mine[];
}

const SEVERITY_DOT: Record<string, string> = {
  FATALITY: 'bg-red-500',
  CRITICAL: 'bg-red-400',
  SERIOUS: 'bg-orange-400',
  MINOR: 'bg-zinc-500',
};

const TYPES = ['ROOF_FALL', 'METHANE_SPIKE', 'FIRE', 'INUNDATION', 'ELECTRICAL_SHORT', 'EQUIPMENT_JAM', 'MINOR_INJURY', 'OTHER'];
const SEVERITIES = ['MINOR', 'SERIOUS', 'CRITICAL', 'FATALITY'] as const;
const isSevere = (s: string) => s === 'CRITICAL' || s === 'FATALITY';

const EMPTY_FORM = {
  mineId: '',
  incidentType: 'ROOF_FALL',
  severity: 'SERIOUS' as (typeof SEVERITIES)[number],
  location: '',
  description: '',
  peopleAffected: '0',
  immediateResponse: '',
  contractId: '',
};

export const IncidentsPage: React.FC<IncidentsPageProps> = ({ mines }) => {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [escalateNow, setEscalateNow] = useState(false);

  const [isLogging, setIsLogging] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api
      .getIncidents()
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setIncidents(list);
        return list;
      })
      .catch((e) => {
        console.error('Error fetching incidents:', e);
        return [] as Incident[];
      })
      .finally(() => setIsLoading(false));

  useEffect(() => {
    load().then((list) => {
      const id = params.get('open');
      const match = id && list.find((i) => i.id === id);
      if (match) setSelected(match);
    });
  }, []);

  const open = (inc: Incident, escalate = false) => {
    setEscalateNow(escalate);
    setSelected(inc);
  };

  const close = () => {
    setSelected(null);
    if (params.has('open')) setParams({}, { replace: true });
  };

  const startLogging = () => {
    setForm({ ...EMPTY_FORM, mineId: user?.mineId || mines[0]?.id || '' });
    setError(null);
    setIsLogging(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.mineId) return setError('Choose a mine.');
    setBusy(true);
    setError(null);
    try {
      const { incident } = await api.logIncident({
        ...form,
        peopleAffected: Number(form.peopleAffected) || 0,
        immediateResponse: form.immediateResponse || undefined,
        contractId: form.contractId || undefined,
      });
      setIsLogging(false);
      await load();
      open(incident, isSevere(incident.severity));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Incidents"
        description={isLoading ? undefined : `${incidents.length} recorded`}
        actions={
          <button onClick={startLogging} className="btn-primary">
            <Plus className="w-4 h-4" />
            Log incident
          </button>
        }
      />

      <div className="card divide-y divide-white/[0.05] stagger">
        {isLoading ? (
          <ListSkeleton />
        ) : incidents.length === 0 ? (
          <Empty>No incidents recorded.</Empty>
        ) : (
          incidents.map((inc) => (
            <button
              key={inc.id}
              onClick={() => open(inc)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${SEVERITY_DOT[inc.severity] || 'bg-zinc-500'}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-zinc-200 truncate">{inc.description}</p>
                <p className="mt-0.5 text-xs text-zinc-500 truncate">
                  {titleCase(inc.incidentType)} · {inc.mine?.name}
                  {inc.contract && ` · ${inc.contract.contractor.name}`} · {shortDate(inc.createdAt)}
                </p>
              </div>
              <StatusPill status={inc.status} />
            </button>
          ))
        )}
      </div>

      {isLogging && (
        <Modal title="Log incident" onClose={() => setIsLogging(false)}>
          <form onSubmit={submit} className="p-5 space-y-4">
            {(!user?.mineId || user.isAdmin) && (
              <Field label="Mine">
                <select value={form.mineId} onChange={(e) => setForm({ ...form, mineId: e.target.value, contractId: '' })} className="input">
                  {mines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Type">
              <select value={form.incidentType} onChange={(e) => setForm({ ...form, incidentType: e.target.value })} className="input">
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {titleCase(t)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Severity">
              <Segmented
                value={form.severity}
                onChange={(v) => setForm({ ...form, severity: v })}
                options={SEVERITIES.map((s) => ({ value: s, label: titleCase(s) }))}
              />
            </Field>
            <div className="grid grid-cols-[1fr_7rem] gap-3">
              <Field label="Location">
                <input
                  required
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="e.g. Section B-12, Shaft 2"
                  className="input"
                />
              </Field>
              <Field label="People hurt">
                <input
                  type="number"
                  min={0}
                  value={form.peopleAffected}
                  onChange={(e) => setForm({ ...form, peopleAffected: e.target.value })}
                  className="input"
                />
              </Field>
            </div>
            {(mines.find((m) => m.id === form.mineId)?.contracts || []).length > 0 && (
              <Field label="Contractor involved (optional)">
                <select value={form.contractId} onChange={(e) => setForm({ ...form, contractId: e.target.value })} className="input">
                  <option value="">None, the mine's own staff</option>
                  {mines
                    .find((m) => m.id === form.mineId)
                    ?.contracts?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.contractor.name} · {c.title}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            <Field label="What happened?">
              <textarea
                required
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="input resize-none"
              />
            </Field>
            <Field label="Action taken so far (optional)">
              <input
                value={form.immediateResponse}
                onChange={(e) => setForm({ ...form, immediateResponse: e.target.value })}
                placeholder="e.g. Area evacuated, power isolated"
                className="input"
              />
            </Field>
            {isSevere(form.severity) && <p className="text-xs text-red-400">You will be asked to escalate this right after saving.</p>}
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setIsLogging(false)} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={busy} className={isSevere(form.severity) ? 'btn-danger' : 'btn-primary'}>
                {busy ? 'Saving…' : 'Log incident'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {selected && (
        <Modal title={selected.id} onClose={close}>
          <div className="p-5 space-y-5">
            <p className="text-sm text-zinc-200 leading-relaxed">{selected.description}</p>
            <DetailRows
              rows={[
                ['Status', <StatusPill status={selected.status} />],
                ['Type', titleCase(selected.incidentType)],
                ['Severity', titleCase(selected.severity)],
                ['Mine', selected.mine?.name],
                ['Location', selected.location],
                ['People affected', String(selected.peopleAffected)],
                ['Response', selected.immediateResponse],
                ['Logged by', selected.reportedByName],
                ['Contractor', selected.contract ? `${selected.contract.contractor.name} · ${selected.contract.title}` : null],
                ['Date', shortDate(selected.createdAt)],
              ]}
            />
            {selected.rootCause && (
              <div>
                <p className="text-xs text-zinc-500 mb-1.5">Root cause</p>
                <p className="text-sm text-zinc-300 leading-relaxed">{selected.rootCause}</p>
              </div>
            )}
            <EscalationPanel
              key={selected.id}
              recordType="INCIDENT"
              recordId={selected.id}
              mineId={selected.mineId}
              summary={`${titleCase(selected.incidentType)} · ${selected.location}`}
              severe={isSevere(selected.severity)}
              startOpen={escalateNow}
            />
          </div>
        </Modal>
      )}
    </div>
  );
};
