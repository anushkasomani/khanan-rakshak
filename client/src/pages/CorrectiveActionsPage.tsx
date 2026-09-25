import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { CorrectiveAction } from '../types';
import { StatusPill } from '../components/StatusPill';
import { PageHeader, Modal, Empty, Field, Tabs, DetailRows, titleCase, shortDate, ListSkeleton } from '../components/ui';

type View = 'open' | 'done';

export const CorrectiveActionsPage: React.FC = () => {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [actions, setActions] = useState<CorrectiveAction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<View>('open');
  const [selected, setSelected] = useState<CorrectiveAction | null>(null);
  const [evidence, setEvidence] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadActions = async () => {
    try {
      const data = await api.getCorrectiveActions();
      const rows = Array.isArray(data) ? data : [];
      setActions(rows);
      const openId = params.get('open');
      const match = openId && rows.find((action) => action.id === openId);
      if (match) setSelected(match);
    } catch (e) {
      console.error('Error fetching corrective actions:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const closeSelected = () => {
    setSelected(null);
    if (params.has('open')) setParams({}, { replace: true });
  };

  useEffect(() => {
    loadActions();
  }, []);

  const isOverdue = (a: CorrectiveAction) => a.isOverdue || a.status === 'OVERDUE';
  const open = actions.filter((a) => a.status !== 'COMPLETED');
  const done = actions.filter((a) => a.status === 'COMPLETED');
  const visible = view === 'open' ? open : done;
  const overdueCount = open.filter(isOverdue).length;

  const openDetail = (a: CorrectiveAction) => {
    setEvidence('');
    setError(null);
    setSelected(a);
  };

  const handleUpdate = async (id: string, status: string) => {
    setIsUpdating(true);
    setError(null);
    try {
      const res = await api.updateCorrectiveAction(id, {
        status,
        evidence: evidence || undefined,
        verifiedBy: user?.name,
      });
      if (res?.error) throw new Error(res.error);
      await loadActions();
      setSelected(res.updated);
      setEvidence('');
    } catch (err: any) {
      setError(err.message || 'Could not update this action.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Corrective actions"
        description={
          isLoading ? undefined : `${open.length} open${overdueCount > 0 ? ` · ${overdueCount} overdue` : ''}`
        }
      />

      <Tabs
        value={view}
        onChange={setView}
        options={[
          { value: 'open', label: `Open (${open.length})` },
          { value: 'done', label: `Completed (${done.length})` },
        ]}
      />

      <div className="card divide-y divide-white/[0.05] stagger">
        {isLoading ? (
          <ListSkeleton />
        ) : visible.length === 0 ? (
          <Empty>{view === 'open' ? 'Nothing open. Nice work.' : 'Nothing completed yet.'}</Empty>
        ) : (
          visible.map((a) => (
            <button
              key={a.id}
              onClick={() => openDetail(a)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-zinc-200 truncate">{a.actionRequired}</p>
                <p className="mt-0.5 text-xs text-zinc-500 truncate">
                  {a.responsiblePerson} ·{' '}
                  <span className={isOverdue(a) && a.status !== 'COMPLETED' ? 'text-red-400' : ''}>
                    due {shortDate(a.deadline)}
                  </span>
                </p>
              </div>
              <StatusPill status={isOverdue(a) && a.status !== 'COMPLETED' ? 'OVERDUE' : a.status} />
            </button>
          ))
        )}
      </div>

      {selected && (
        <Modal title={selected.id} onClose={closeSelected}>
          <div className="p-5 space-y-5">
            <p className="text-sm text-zinc-200 leading-relaxed">{selected.actionRequired}</p>
            <DetailRows
              rows={[
                ['Status', <StatusPill status={selected.status} />],
                ['Priority', titleCase(selected.priority)],
                ['Source', `${titleCase(selected.issueType)} · ${selected.issueId}`],
                ['Responsible', selected.responsiblePerson],
                ['Deadline', shortDate(selected.deadline)],
                ['Verified by', selected.verifiedBy],
              ]}
            />

            {selected.evidence && (
              <div>
                <p className="text-xs text-zinc-500 mb-1.5">Evidence</p>
                <p className="text-sm text-zinc-300 leading-relaxed">{selected.evidence}</p>
              </div>
            )}

            {selected.status !== 'COMPLETED' && (
              <div className="space-y-3 pt-1">
                <Field label="Evidence (optional)">
                  <textarea
                    rows={2}
                    value={evidence}
                    onChange={(e) => setEvidence(e.target.value)}
                    placeholder="e.g. Work order WO-891 done, parts replaced"
                    className="input resize-none"
                  />
                </Field>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <div className="flex gap-2">
                  {selected.status !== 'IN_PROGRESS' && (
                    <button
                      disabled={isUpdating}
                      onClick={() => handleUpdate(selected.id, 'IN_PROGRESS')}
                      className="btn-secondary flex-1"
                    >
                      Start
                    </button>
                  )}
                  <button
                    disabled={isUpdating}
                    onClick={() => handleUpdate(selected.id, 'COMPLETED')}
                    className="btn-primary flex-1"
                  >
                    Mark complete
                  </button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
