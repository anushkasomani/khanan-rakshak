import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { SosAlert } from '../types';
import { StatusPill } from '../components/StatusPill';
import { TamperProofBadge } from '../components/TamperProofBadge';
import { EscalationPanel } from '../components/EscalationPanel';
import { ContactButtons } from '../components/ContactButtons';
import { PageHeader, Section, Modal, Empty, Field, DetailRows, titleCase, ListSkeleton } from '../components/ui';

interface SosControlRoomPageProps {
  onOpenSos: () => void;
}

const LIFECYCLE = ['ALERT_TRIGGERED', 'ACKNOWLEDGED', 'TEAM_ASSIGNED', 'RESPONDING', 'RESOLVED'];

const NEXT_ACTION: Record<string, { status: string; label: string }> = {
  ALERT_TRIGGERED: { status: 'ACKNOWLEDGED', label: 'Acknowledge' },
  ACKNOWLEDGED: { status: 'TEAM_ASSIGNED', label: 'Assign team' },
  TEAM_ASSIGNED: { status: 'RESPONDING', label: 'Mark responding' },
  RESPONDING: { status: 'RESOLVED', label: 'Resolve' },
};

const time = (d: string) => new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

export const SosControlRoomPage: React.FC<SosControlRoomPageProps> = ({ onOpenSos }) => {
  const [active, setActive] = useState<SosAlert[]>([]);
  const [history, setHistory] = useState<SosAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<SosAlert | null>(null);
  const [teams, setTeams] = useState('');
  const [notes, setNotes] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const pendingOpen = useRef(params.get('open')); // deep link from the escalation inbox, consumed once

  const loadAlerts = async () => {
    try {
      const [a, h] = await Promise.all([api.getActiveSos(), api.getSosHistory()]);
      setActive(Array.isArray(a) ? a : []);
      setHistory(Array.isArray(h) ? h : []);
      if (pendingOpen.current) {
        const match = [...a, ...h].find((x) => x.id === pendingOpen.current);
        pendingOpen.current = null;
        if (match) setSelected(match);
      }
    } catch (e) {
      console.error('Error fetching SOS alerts:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
    const interval = setInterval(loadAlerts, 5000);
    return () => clearInterval(interval);
  }, []);

  const openDetail = (a: SosAlert) => {
    setTeams('');
    setNotes('');
    setError(null);
    setSelected(a);
  };

  const updateStatus = async (id: string, status: string) => {
    setIsUpdating(true);
    setError(null);
    try {
      const res = await api.updateSosStatus(id, {
        status,
        assignedTeams: teams || undefined,
        responderNotes: notes || undefined,
      });
      await loadAlerts();
      setSelected(res.updated);
      setTeams('');
      setNotes('');
    } catch (err: any) {
      setError(err.message || 'Could not update this alert.');
    } finally {
      setIsUpdating(false);
    }
  };

  const resolved = history.filter((h) => h.status === 'RESOLVED').slice(0, 10);

  const row = (a: SosAlert, live: boolean) => (
    <button
      key={a.id}
      onClick={() => openDetail(a)}
      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${live ? 'bg-red-500' : 'bg-zinc-600'}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-zinc-200 truncate">{titleCase(a.emergencyType)}</p>
        <p className="mt-0.5 text-xs text-zinc-500 truncate">
          {a.mine?.name}
          {a.district?.name ? ` · ${a.district.name}` : ''} · {time(a.triggeredAt)}
        </p>
      </div>
      <StatusPill status={a.status} />
    </button>
  );

  const next = selected ? NEXT_ACTION[selected.status] : undefined;
  const step = selected ? LIFECYCLE.indexOf(selected.status) : -1;

  return (
    <div className="space-y-8">
      <PageHeader
        title="SOS control"
        description="Live · refreshes every 5 seconds"
        actions={
          <button onClick={onOpenSos} className="btn-danger">
            Send SOS
          </button>
        }
      />

      <Section title={`Active (${active.length})`}>
        <div className={`${active.length > 0 ? 'card-danger' : 'card'} divide-y divide-white/[0.05] stagger`}>
          {isLoading ? <ListSkeleton /> : active.length === 0 ? <Empty>No active emergencies.</Empty> : active.map((a) => row(a, true))}
        </div>
      </Section>

      <Section title="Recently resolved">
        <div className="card divide-y divide-white/[0.05] stagger">
          {resolved.length === 0 ? <Empty>Nothing resolved yet.</Empty> : resolved.map((a) => row(a, false))}
        </div>
      </Section>

      {selected && (
        <Modal
          title={titleCase(selected.emergencyType)}
          onClose={() => {
            setSelected(null);
            if (params.has('open')) setParams({}, { replace: true });
          }}
        >
          <div className="p-5 space-y-5">
            <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              {LIFECYCLE.map((s, i) => (
                <li key={s} className="flex items-center gap-2">
                  <span className={i === step ? 'text-zinc-100 font-medium' : i < step ? 'text-zinc-400' : 'text-zinc-600'}>
                    {titleCase(s === 'ALERT_TRIGGERED' ? 'TRIGGERED' : s)}
                  </span>
                  {i < LIFECYCLE.length - 1 && <span className="text-zinc-700">→</span>}
                </li>
              ))}
            </ol>

            <DetailRows
              rows={[
                ['Mine', selected.mine?.name],
                ['District', selected.district ? `${selected.district.name}${selected.district.location ? ` · ${selected.district.location}` : ''}` : 'Not given'],
                [
                  'Reported by',
                  <span className="inline-flex items-center gap-2">
                    {selected.reporter?.name || selected.workerIdentifier}
                    {selected.reporter?.phone && (
                      <ContactButtons
                        name={selected.reporter.name}
                        phone={selected.reporter.phone}
                        sms={`Khanan Rakshak: we received your SOS (${titleCase(selected.emergencyType)}). Help is coming.`}
                      />
                    )}
                  </span>,
                ],
                ['Triggered', new Date(selected.triggeredAt).toLocaleString()],
                ['Teams', selected.assignedTeams],
                ['Notes', selected.responderNotes],
                ['Audit record', <TamperProofBadge recordId={selected.id} />],
              ]}
            />

            <EscalationPanel
              key={selected.id}
              recordType="SOS"
              recordId={selected.id}
              mineId={selected.mineId}
              summary={`SOS: ${titleCase(selected.emergencyType)}${selected.district ? ` · ${selected.district.name}` : ''}`}
              severe={selected.status !== 'RESOLVED'}
            />

            {selected.status !== 'RESOLVED' && (
              <div className="space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Response teams">
                    <input value={teams} onChange={(e) => setTeams(e.target.value)} placeholder="e.g. Rescue team A" className="input" />
                  </Field>
                  <Field label="Notes">
                    <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Descending shaft 2" className="input" />
                  </Field>
                </div>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <div className="flex gap-2">
                  {next && next.status !== 'RESOLVED' && (
                    <button disabled={isUpdating} onClick={() => updateStatus(selected.id, 'RESOLVED')} className="btn-secondary flex-1">
                      Resolve
                    </button>
                  )}
                  {next && (
                    <button disabled={isUpdating} onClick={() => updateStatus(selected.id, next.status)} className="btn-primary flex-1">
                      {next.label}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
