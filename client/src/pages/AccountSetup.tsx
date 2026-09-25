import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Logo } from '../components/Logo';
import { DetailRows } from '../components/ui';
import { PersonFields, PersonValues, personFromUser, personProblem, personPayload } from '../components/PersonFields';
import { describeRole, shiftLabel, hasShift } from '../roles';
import { Mine } from '../types';

const POLL_MS = 20000;

export const AccountSetup: React.FC = () => {
  const { user, setUser, refreshUser, logout } = useAuth();
  const [editing, setEditing] = useState(user?.status !== 'PENDING');
  const [mines, setMines] = useState<Pick<Mine, 'id' | 'name' | 'districts' | 'contracts' | 'shiftStartHour'>[]>([]);
  const [values, setValues] = useState<PersonValues>(() => personFromUser(user || {}));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    api.getOnboardingMines().then(setMines).catch(() => setMines([]));
  }, []);

  useEffect(() => {
    if (user?.status !== 'PENDING' || editing) return;
    const t = setInterval(refreshUser, POLL_MS);
    return () => clearInterval(t);
  }, [user?.status, editing, refreshUser]);

  if (!user) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = personProblem(values, { requirePhone: true });
    if (problem) {
      setError(problem);
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const updated = await api.submitOnboarding(personPayload(values) as any);
      setUser(updated);
      setEditing(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const mine = mines.find((m) => m.id === user.mineId);
  const mineName = mine?.name || user.mine?.name;
  const districtName = mine?.districts?.find((d) => d.id === user.districtId)?.name || user.district?.name;

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-12 sm:py-20">
      <div className="w-full max-w-md mx-auto">
        <Logo size="lg" />

        {editing ? (
          <>
            <h1 className="mt-6 text-xl font-semibold tracking-tight">
              {user.status === 'REJECTED' ? 'Update your details' : 'Set up your account'}
            </h1>
            <p className="mt-1.5 text-sm text-zinc-500">An admin will review this before you get access.</p>

            {user.status === 'REJECTED' && user.reviewNote && (
              <div className="mt-6 card-danger px-4 py-3">
                <p className="text-xs text-zinc-500">Note from admin</p>
                <p className="mt-0.5 text-sm text-zinc-200">{user.reviewNote}</p>
              </div>
            )}

            <form onSubmit={submit} className="mt-8 space-y-6">
              <PersonFields value={values} onChange={setValues} mines={mines} />
              {error && <p className="text-sm text-red-400">{error}</p>}
              <div className="flex items-center justify-between gap-3">
                <button type="button" onClick={logout} className="text-sm text-zinc-500 hover:text-zinc-200">
                  Sign out
                </button>
                <div className="flex gap-2">
                  {user.status === 'PENDING' && (
                    <button type="button" onClick={() => setEditing(false)} className="btn-secondary">
                      Cancel
                    </button>
                  )}
                  <button type="submit" disabled={isSubmitting} className="btn-primary">
                    {isSubmitting ? 'Sending…' : 'Send for review'}
                  </button>
                </div>
              </div>
            </form>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-xl font-semibold tracking-tight">Waiting for approval</h1>
            <p className="mt-1.5 text-sm text-zinc-500">
              An admin is reviewing your details. This page updates on its own once you're approved.
            </p>

            <div className="mt-8 card px-4">
              <DetailRows
                rows={[
                  ['Name', user.name],
                  ['Email', user.email],
                  ['Role', describeRole(user)],
                  ...(user.role !== 'DGMS' ? ([['Mine', mineName]] as [string, string | undefined][]) : []),
                  ...(districtName ? ([['District', districtName]] as [string, string][]) : []),
                  ...(hasShift(user.role) && user.shift ? ([['Shift', shiftLabel(user.shift, mine?.shiftStartHour ?? user.mine?.shiftStartHour)]] as [string, string][]) : []),
                  ['Phone', user.phone],
                ]}
              />
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <button onClick={logout} className="text-sm text-zinc-500 hover:text-zinc-200">
                Sign out
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setValues(personFromUser(user));
                    setEditing(true);
                  }}
                  className="btn-secondary"
                >
                  Edit details
                </button>
                <button onClick={refreshUser} className="btn-primary">
                  Check again
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
