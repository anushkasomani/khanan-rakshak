import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { FieldReport, FieldReportType, Mine } from '../types';
import { atLeast, describeRole, minesFor } from '../roles';
import { StatusPill } from '../components/StatusPill';
import { TamperProofBadge } from '../components/TamperProofBadge';
import { PageHeader, Modal, Empty, Field, Tabs, DetailRows, shortDate, ListSkeleton } from '../components/ui';
import { ReportEditor } from '../components/reports/ReportEditor';
import { REPORT_TYPES } from '../components/reports/templates';

export const REPORT_STATUS: Record<FieldReport['status'], { label: string; pill: string }> = {
  SUBMITTED: { label: 'Waiting for review', pill: 'SUBMITTED' },
  REVIEWED: { label: 'Reviewed', pill: 'COMPLETED' },
  RETURNED: { label: 'Sent back', pill: 'RETURNED' },
};

const longDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export const ReportRows: React.FC<{ items: FieldReport[] | null; empty: string; showAuthor?: boolean; onOpen: (r: FieldReport) => void }> = ({
  items,
  empty,
  showAuthor,
  onOpen,
}) => (
  <div className="card divide-y divide-white/[0.05] stagger">
    {items === null ? (
      <ListSkeleton />
    ) : items.length === 0 ? (
      <Empty>{empty}</Empty>
    ) : (
      items.map((r) => (
        <button key={r.id} onClick={() => onOpen(r)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-zinc-200 truncate">{r.title}</p>
            <p className="mt-0.5 text-xs text-zinc-500 truncate">
              {REPORT_TYPES[r.reportType]}
              {showAuthor && ` · ${r.author.name}`}
              {r.district && ` · ${r.district.name}`} · {longDate(r.workDate)}
            </p>
          </div>
          <StatusPill status={REPORT_STATUS[r.status].pill} label={REPORT_STATUS[r.status].label} />
        </button>
      ))
    )}
  </div>
);

/** Technical reports from blasters, shot-firers, surveyors and other specialists, and their review. */
export const FieldReportsPage: React.FC<{ mines: Mine[] }> = ({ mines }) => {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const canSeeAll = atLeast(user, 'SIRDAR');
  const canWrite = !!user?.role && user.role !== 'WORKER' && user.role !== 'DGMS' && !!user.mineId;
  const choices = minesFor(user, mines);
  const [mineId, setMineId] = useState('');
  const [view, setView] = useState<'review' | 'all' | 'mine'>(canSeeAll ? 'all' : 'mine');
  const [type, setType] = useState('');
  const [items, setItems] = useState<FieldReport[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(params.get('open'));
  const [editing, setEditing] = useState<FieldReport | 'new' | null>(params.get('new') === '1' ? 'new' : null);

  const load = () =>
    api
      .getFieldReports({ mineId: mineId || undefined, type: type || undefined, ...(view === 'mine' ? { mine: '1' as const } : {}) })
      .then(setItems)
      .catch(() => setItems([]));
  useEffect(() => {
    setItems(null);
    load();
  }, [mineId, type, view]);

  const toReview = items?.filter((r) => r.canReview) || [];
  const shown = view === 'review' ? toReview : items;
  const closeDetail = () => {
    setOpenId(null);
    if (params.has('open')) setParams({}, { replace: true });
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Field reports"
        description="Blast reports, surveys and other technical reports. The Overman or someone above reviews each one."
        actions={
          canWrite && (
            <button onClick={() => setEditing('new')} className="btn-primary">
              <Plus className="w-4 h-4" />
              New report
            </button>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {canSeeAll && (
          <Tabs
            value={view}
            onChange={setView}
            options={[
              { value: 'all', label: 'All' },
              { value: 'review', label: `To review${view !== 'review' && toReview.length ? ` ${toReview.length}` : ''}` },
              ...(canWrite ? [{ value: 'mine' as const, label: 'Mine' }] : []),
            ]}
          />
        )}
        <select value={type} onChange={(e) => setType(e.target.value)} className="input w-auto">
          <option value="">Every kind</option>
          {(Object.keys(REPORT_TYPES) as FieldReportType[]).map((t) => (
            <option key={t} value={t}>
              {REPORT_TYPES[t]}
            </option>
          ))}
        </select>
        {choices.length > 1 && (
          <select value={mineId} onChange={(e) => setMineId(e.target.value)} className="input w-auto max-w-[16rem]">
            <option value="">All mines</option>
            {choices.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <ReportRows
        items={shown}
        showAuthor={view !== 'mine'}
        empty={view === 'review' ? 'Nothing waiting for your review.' : view === 'mine' ? "You haven't submitted any reports yet." : 'No reports yet.'}
        onOpen={(r) => setOpenId(r.id)}
      />

      {openId && (
        <ReportDetail
          id={openId}
          onClose={closeDetail}
          onEdit={(r) => {
            closeDetail();
            setEditing(r);
          }}
          onChanged={load}
        />
      )}
      {editing && (
        <ReportEditor
          report={editing === 'new' ? null : editing}
          mines={mines}
          onClose={() => {
            setEditing(null);
            if (params.has('new')) setParams({}, { replace: true });
          }}
          onSaved={(r) => {
            setEditing(null);
            load();
            setOpenId(r.id);
          }}
        />
      )}
    </div>
  );
};

export const ReportDetail: React.FC<{ id: string; onClose: () => void; onEdit: (r: FieldReport) => void; onChanged: () => void }> = ({
  id,
  onClose,
  onEdit,
  onChanged,
}) => {
  const { user } = useAuth();
  const [r, setR] = useState<FieldReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<null | 'REVIEWED' | 'RETURNED'>(null);

  useEffect(() => {
    api
      .getFieldReport(id)
      .then(setR)
      .catch((e) => setError(e.message));
  }, [id]);

  const review = async (decision: 'REVIEWED' | 'RETURNED') => {
    if (decision === 'RETURNED' && note.trim().length < 3) return setError('Say what needs to change.');
    setBusy(decision);
    setError(null);
    try {
      setR(await api.reviewFieldReport(id, decision, note.trim() || undefined));
      setNote('');
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal title={r ? r.title : 'Report'} onClose={onClose} width="lg">
      <div className="p-5 space-y-6">
        {!r ? (
          error ? <p className="text-sm text-red-400">{error}</p> : <ListSkeleton rows={3} />
        ) : (
          <>
            {r.status === 'RETURNED' && r.reviewNote && (
              <div className="card-warning px-3 py-2.5">
                <p className="text-xs text-amber-300">Sent back by {r.reviewedByName}</p>
                <p className="mt-1 text-sm text-zinc-200">{r.reviewNote}</p>
              </div>
            )}
            <DetailRows
              rows={[
                ['Status', <StatusPill status={REPORT_STATUS[r.status].pill} label={REPORT_STATUS[r.status].label} />],
                ['Kind', REPORT_TYPES[r.reportType]],
                ['By', `${r.author.name} · ${describeRole({ ...r.author, isAdmin: false })}${r.author.contract ? ` · ${r.author.contract.contractor.name}` : ''}`],
                ['Work done on', longDate(r.workDate)],
                ['Where', r.district ? `${r.district.name}, ${r.mine.name}` : r.mine.name],
                ['Submitted', shortDate(r.createdAt)],
                ['Audit record', <TamperProofBadge hash={r.recordHash} recordId={r.id} />],
              ]}
            />

            {r.body && <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">{r.body}</p>}

            {r.table && (
              <div className="overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/[0.03] text-left">
                      {r.table.columns.map((c, i) => (
                        <th key={i} className="px-3 py-2 text-xs font-medium text-zinc-400 border-b border-white/10 whitespace-nowrap">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {r.table.rows.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j} className={`px-3 py-2 ${j === 0 ? 'text-zinc-400' : 'text-zinc-100 tabular-nums'}`}>
                            {cell || <span className="text-zinc-700">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {r.photos.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {r.photos.map((src) => (
                  <a key={src} href={src} target="_blank" rel="noreferrer" className="block aspect-[4/3] rounded-lg overflow-hidden border border-white/10">
                    <img src={src} alt="Report photo" className="w-full h-full object-cover" loading="lazy" />
                  </a>
                ))}
              </div>
            )}

            {r.status === 'REVIEWED' && (
              <p className="text-sm text-emerald-400">
                Reviewed by {r.reviewedByName}
                {r.reviewedAt && <span className="text-zinc-500"> · {shortDate(r.reviewedAt)}</span>}
                {r.reviewNote && <span className="block mt-1 text-zinc-400">{r.reviewNote}</span>}
              </p>
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}

            {r.canReview && (
              <div className="space-y-3 border-t border-white/[0.06] pt-4">
                <Field label="Comment (needed to send back)">
                  <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="input resize-none" />
                </Field>
                <div className="flex gap-2">
                  <button onClick={() => review('RETURNED')} disabled={!!busy} className="btn-secondary flex-1">
                    {busy === 'RETURNED' ? 'Sending…' : 'Send back'}
                  </button>
                  <button onClick={() => review('REVIEWED')} disabled={!!busy} className="btn-primary flex-1">
                    {busy === 'REVIEWED' ? 'Saving…' : 'Mark reviewed'}
                  </button>
                </div>
              </div>
            )}
            {r.authorId === user?.id && r.status !== 'REVIEWED' && (
              <button onClick={() => onEdit(r)} className="btn-secondary w-full">
                {r.status === 'RETURNED' ? 'Make changes and resubmit' : 'Edit'}
              </button>
            )}
            {r.status === 'SUBMITTED' && !r.canReview && r.authorId !== user?.id && (
              <p className="text-sm text-zinc-500">Waiting for the Overman or someone above to review it.</p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};
