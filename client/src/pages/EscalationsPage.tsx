import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { api } from '../services/api';
import { Escalation } from '../types';
import { describeRole } from '../roles';
import { formatTime } from '../attendance';
import { PageHeader, Empty, Tabs, shortDate, ListSkeleton } from '../components/ui';
import { ContactButtons } from '../components/ContactButtons';
import { escalationTarget } from '../components/EscalationPanel';

type Box = 'forMe' | 'sent';

export const recordLink = (e: Pick<Escalation, 'recordType' | 'recordId'>) =>
  `${e.recordType === 'SOS' ? '/sos-control' : '/incidents'}?open=${encodeURIComponent(e.recordId)}`;

const when = (d: string) => {
  const date = new Date(d);
  return date.toDateString() === new Date().toDateString() ? formatTime(date) : shortDate(date);
};

export const EscalationsPage: React.FC = () => {
  const [data, setData] = useState<{ forMe: Escalation[]; sent: Escalation[]; canReceive: boolean } | null>(null);
  const [box, setBox] = useState<Box>('forMe');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api
      .getEscalationInbox()
      .then((d) => {
        setData(d);
        if (!d.canReceive) setBox('sent');
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const acknowledge = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await api.acknowledgeEscalation(id);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const openForMe = data?.forMe.filter((e) => e.status === 'OPEN').length || 0;
  const list = data ? data[box] : [];

  return (
    <div className="space-y-8">
      <PageHeader title="Escalations" description={data?.canReceive && openForMe ? `${openForMe} waiting for you` : undefined} />

      {data?.canReceive && (
        <Tabs<Box>
          value={box}
          onChange={setBox}
          options={[
            { value: 'forMe', label: `For me${openForMe ? ` ${openForMe}` : ''}` },
            { value: 'sent', label: 'Sent' },
          ]}
        />
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="card divide-y divide-white/[0.05] stagger">
        {!data ? (
          <ListSkeleton />
        ) : list.length === 0 ? (
          <Empty>{box === 'forMe' ? 'Nothing has been escalated to you.' : 'You have not escalated anything.'}</Empty>
        ) : (
          list.map((e) => {
            const open = e.status === 'OPEN';
            return (
              <div key={e.id} className="px-4 py-4 space-y-2">
                <div className="flex items-start gap-3">
                  <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${open ? (e.severe ? 'bg-red-500' : 'bg-amber-400') : 'bg-zinc-600'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-100">{e.summary}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {box === 'forMe'
                        ? `${e.fromUser.name} · ${describeRole({ ...e.fromUser, isAdmin: false })}`
                        : `To ${escalationTarget(e)} · ${e.recipientCount} ${e.recipientCount === 1 ? 'person' : 'people'}`}
                      {' · '}
                      {e.mine.name} · {when(e.createdAt)}
                    </p>
                    <p className="mt-2 text-sm text-zinc-300">{e.reason}</p>
                    <p className={`mt-2 text-xs ${open ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {open ? 'Waiting for acknowledgement' : `Acknowledged by ${e.acknowledgedByName} · ${when(e.acknowledgedAt!)}`}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 pl-[18px]">
                  {box === 'forMe' && open && (
                    <button onClick={() => acknowledge(e.id)} disabled={busyId === e.id} className="btn-primary h-8">
                      {busyId === e.id ? 'Saving…' : 'Acknowledge'}
                    </button>
                  )}
                  {box === 'forMe' && (
                    <ContactButtons
                      name={e.fromUser.name}
                      phone={e.fromUser.phone}
                      sms={`Re: ${e.summary}. I'm on it.`}
                    />
                  )}
                  <Link to={recordLink(e)} className="ml-auto text-sm text-zinc-500 hover:text-zinc-200 inline-flex items-center gap-1">
                    Open {e.recordType === 'SOS' ? 'SOS' : 'incident'} <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

/** Dashboard nudge shown only when escalations are waiting for this user. */
export const EscalationBanner: React.FC = () => {
  const [open, setOpen] = useState<Escalation[]>([]);
  useEffect(() => {
    api
      .getEscalationInbox()
      .then((d) => setOpen(d.forMe.filter((e) => e.status === 'OPEN')))
      .catch(() => setOpen([]));
  }, []);
  if (!open.length) return null;
  const severe = open.some((e) => e.severe);
  return (
    <Link
      to="/escalations"
      className={`${severe ? 'card-danger' : 'card-warning'} flex items-center gap-3 px-4 py-3 hover:brightness-125 transition`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${severe ? 'bg-red-500' : 'bg-amber-400'}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-zinc-100">
          {open.length === 1 ? '1 escalation needs you' : `${open.length} escalations need you`}
        </p>
        <p className="mt-0.5 text-xs text-zinc-400 truncate">{open[0].summary}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-zinc-400 shrink-0" />
    </Link>
  );
};
