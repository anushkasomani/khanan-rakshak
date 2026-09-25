import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Mine, User, UserStatus } from '../../types';
import { StatusPill } from '../../components/StatusPill';
import { PageHeader, Modal, Empty, Tabs, Field, shortDate, ListSkeleton } from '../../components/ui';
import { PersonFields, PersonValues, emptyPerson, personFromUser, personProblem, personPayload } from '../../components/PersonFields';
import { describeRole } from '../../roles';

type View = 'PENDING' | 'APPROVED' | 'REJECTED';

export const PersonEditor: React.FC<{
  person: User | null;
  mines: Mine[];
  defaults?: Partial<PersonValues>;
  onClose: () => void;
  onSaved: () => void;
}> = ({ person, mines, defaults, onClose, onSaved }) => {
  const { user: me } = useAuth();
  const [values, setValues] = useState<PersonValues>(() => (person ? personFromUser(person) : emptyPerson(defaults)));
  const [note, setNote] = useState(person?.reviewNote || '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isNew = !person;
  const isPending = person?.status === 'PENDING';

  const run = async (action: 'save' | 'approve' | 'reject') => {
    if (action !== 'reject') {
      const problem = personProblem(values, { requireEmail: isNew, allowNoRole: values.isAdmin });
      if (problem) {
        setError(problem);
        return;
      }
    } else if (!note.trim()) {
      setError('Add a note so they know what to fix.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (isNew) {
        await api.createUser({ ...personPayload(values), email: values.email.trim(), isAdmin: values.isAdmin });
      } else if (action === 'reject') {
        await api.updateUser(person!.id, { status: 'REJECTED', reviewNote: note.trim() });
      } else {
        await api.updateUser(person!.id, {
          ...personPayload(values),
          isAdmin: values.isAdmin,
          ...(action === 'approve' ? { status: 'APPROVED', reviewNote: '' } : {}),
        });
      }
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={isNew ? 'Add person' : person!.name} onClose={onClose} width="lg">
      <div className="p-5 space-y-5">
        {!isNew && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
            <StatusPill status={person!.status} />
            <span>{person!.email}</span>
            {person!.createdAt && <span>Registered {shortDate(person!.createdAt)}</span>}
          </div>
        )}

        <PersonFields
          value={values}
          onChange={setValues}
          mines={mines}
          showEmail={isNew}
          showAdmin={person?.id !== me?.id}
        />

        {isPending && (
          <Field label="Note to applicant (required to reject)">
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="input resize-none" placeholder="e.g. Wrong mine selected" />
          </Field>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          {isPending ? (
            <>
              <button disabled={busy} onClick={() => run('reject')} className="btn-secondary text-red-300">
                Reject
              </button>
              <button disabled={busy} onClick={() => run('approve')} className="btn-primary">
                Approve
              </button>
            </>
          ) : (
            <button disabled={busy} onClick={() => run('save')} className="btn-primary">
              {isNew ? 'Add' : 'Save'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};

export const AdminPeoplePage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const [people, setPeople] = useState<User[]>([]);
  const [mines, setMines] = useState<Mine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<View>((params.get('view') as View) || 'PENDING');
  const [mineFilter, setMineFilter] = useState(params.get('mineId') || '');
  const [editing, setEditing] = useState<User | null | 'new'>(null);

  const load = async () => {
    try {
      const [u, m] = await Promise.all([api.getUsers(), api.getMines()]);
      setPeople(u.filter((p) => p.status !== 'NEW'));
      setMines(m);
    } catch (e) {
      console.error('Error loading people:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setParams({ view, ...(mineFilter ? { mineId: mineFilter } : {}) }, { replace: true });
  }, [view, mineFilter]);

  const count = (s: UserStatus) => people.filter((p) => p.status === s).length;
  const visible = people.filter((p) => p.status === view && (!mineFilter || p.mineId === mineFilter));

  return (
    <div className="space-y-8">
      <PageHeader
        title="People"
        description={count('PENDING') > 0 ? `${count('PENDING')} waiting for review` : undefined}
        actions={
          <button onClick={() => setEditing('new')} className="btn-primary">
            <Plus className="w-4 h-4" />
            Add person
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={view}
          onChange={setView}
          options={[
            { value: 'PENDING', label: `Pending (${count('PENDING')})` },
            { value: 'APPROVED', label: `Approved (${count('APPROVED')})` },
            { value: 'REJECTED', label: `Rejected (${count('REJECTED')})` },
          ]}
        />
        <select value={mineFilter} onChange={(e) => setMineFilter(e.target.value)} className="input w-auto max-w-[16rem]">
          <option value="">All mines</option>
          {mines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <div className="card divide-y divide-white/[0.05] stagger">
        {isLoading ? (
          <ListSkeleton />
        ) : visible.length === 0 ? (
          <Empty>{view === 'PENDING' ? 'No one is waiting for review.' : 'No one here.'}</Empty>
        ) : (
          visible.map((p) => (
            <button
              key={p.id}
              onClick={() => setEditing(p)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-300 shrink-0">
                {p.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-zinc-200 truncate">
                  {p.name}
                  {p.isAdmin && <span className="ml-2 text-xs text-zinc-500">Admin</span>}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500 truncate">
                  {describeRole(p)}
                  {p.mine?.name ? ` · ${p.mine.name}` : ''} · {p.email}
                </p>
              </div>
              {view === 'PENDING' && <span className="text-xs text-zinc-400">Review</span>}
            </button>
          ))
        )}
      </div>

      {editing && (
        <PersonEditor
          person={editing === 'new' ? null : editing}
          mines={mines}
          defaults={mineFilter ? { mineId: mineFilter } : undefined}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
};
