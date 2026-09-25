import React, { useState, useEffect } from 'react';
import { Plus, EyeOff, Lock, UserCheck } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Grievance, Mine } from '../types';
import { StatusPill } from '../components/StatusPill';
import { TamperProofBadge } from '../components/TamperProofBadge';
import { PageHeader, Modal, Empty, Field, Tabs, titleCase, shortDate, ListSkeleton } from '../components/ui';

interface GrievancesPageProps {
  mines: Mine[];
}

type Anonymity = 'ANONYMOUS' | 'CONFIDENTIAL' | 'IDENTIFIED';

const CATEGORIES = [
  { value: 'SUPERVISOR_PRESSURE', label: 'Pressure from Sirdar or Overman' },
  { value: 'SAFETY_VIOLATIONS', label: 'Forced unsafe work' },
  { value: 'IGNORED_HAZARDS', label: 'Hazards ignored' },
  { value: 'HARASSMENT', label: 'Harassment or discrimination' },
  { value: 'MISCONDUCT', label: 'Misconduct' },
  { value: 'EQUIPMENT_SAFETY', label: 'Faulty equipment' },
  { value: 'OTHER', label: 'Other' },
];

const PRIVACY: { value: Anonymity; label: string; hint: string; icon: typeof EyeOff }[] = [
  { value: 'ANONYMOUS', label: 'Anonymous', hint: 'Your name is never stored.', icon: EyeOff },
  { value: 'CONFIDENTIAL', label: 'Confidential', hint: 'Only the DGMS inspector sees your name.', icon: Lock },
  { value: 'IDENTIFIED', label: 'Identified', hint: 'Linked to your profile.', icon: UserCheck },
];

const TIERS = [
  { value: 'MINE_OFFICER', label: 'Safety officer' },
  { value: 'MINE_MANAGEMENT', label: 'Mine management' },
  { value: 'CORPORATE', label: 'Corporate' },
  { value: 'REGULATOR', label: 'DGMS' },
];

const tierLabel = (t?: string) => TIERS.find((x) => x.value === t)?.label || titleCase(t);

const GrievanceDetail: React.FC<{ record: any; onChanged: (updated: any) => void }> = ({ record, onChanged }) => {
  const [reason, setReason] = useState('');
  const [isEscalating, setIsEscalating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentTier = TIERS.findIndex((t) => t.value === record.escalationTier);
  const canEscalate = record.status !== 'RESOLVED' && record.escalationTier !== 'REGULATOR';

  const escalate = async () => {
    setIsEscalating(true);
    setError(null);
    try {
      await api.escalateGrievance(record.trackingCode, reason || undefined);
      const refreshed = await api.trackGrievance(record.trackingCode);
      setReason('');
      onChanged(refreshed);
    } catch (err: any) {
      setError(err.message || 'Could not escalate.');
    } finally {
      setIsEscalating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StatusPill status={record.status} />
        <span className="text-xs text-zinc-500">{titleCase(record.category)}</span>
        <span className="text-xs text-zinc-500">{record.mineName || record.mine?.name}</span>
        <TamperProofBadge hash={record.recordHash} recordId={record.trackingCode} />
      </div>

      <p className="text-sm text-zinc-200 leading-relaxed">{record.description}</p>

      <div>
        <p className="text-xs text-zinc-500 mb-2">Escalation</p>
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {TIERS.map((t, i) => (
            <li key={t.value} className="flex items-center gap-2">
              <span className={i === currentTier ? 'text-zinc-100 font-medium' : i < currentTier ? 'text-zinc-400' : 'text-zinc-600'}>
                {t.label}
              </span>
              {i < TIERS.length - 1 && <span className="text-zinc-700">→</span>}
            </li>
          ))}
        </ol>
      </div>

      {record.timeline?.length > 0 && (
        <div>
          <p className="text-xs text-zinc-500 mb-2">Timeline</p>
          <ol className="space-y-3 border-l border-white/[0.08] ml-1">
            {record.timeline.map((step: any, idx: number) => (
              <li key={idx} className="relative pl-4">
                <span className="absolute -left-[3px] top-1.5 w-1.5 h-1.5 rounded-full bg-zinc-500" />
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="text-sm text-zinc-200">{titleCase(step.step)}</p>
                  <p className="text-xs text-zinc-600">{shortDate(step.time)}</p>
                </div>
                {step.note && <p className="mt-0.5 text-xs text-zinc-500">{step.note}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}

      {canEscalate && (
        <div className="space-y-3 pt-1">
          <Field label={`Escalate to ${tierLabel(TIERS[currentTier + 1]?.value)}`}>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why does this need escalating?"
              className="input resize-none"
            />
          </Field>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button disabled={isEscalating} onClick={escalate} className="btn-secondary w-full">
            {isEscalating ? 'Escalating…' : 'Escalate'}
          </button>
        </div>
      )}
    </div>
  );
};

export const GrievancesPage: React.FC<GrievancesPageProps> = ({ mines }) => {
  const { user } = useAuth();
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<'all' | 'track'>('all');

  const [detail, setDetail] = useState<any>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [anonymity, setAnonymity] = useState<Anonymity>('ANONYMOUS');
  const [mineId, setMineId] = useState(user?.mineId || '');
  const [category, setCategory] = useState('SUPERVISOR_PRESSURE');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<any>(null);

  const [trackQuery, setTrackQuery] = useState('');
  const [tracked, setTracked] = useState<any>(null);
  const [trackError, setTrackError] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const loadGrievances = async () => {
    try {
      const data = await api.getGrievances();
      setGrievances(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Error fetching grievances:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadGrievances();
  }, [user?.id]);

  const openDetail = async (code: string) => {
    try {
      setDetail(await api.trackGrievance(code));
    } catch (e) {
      console.error('Error loading grievance:', e);
    }
  };

  const openCreate = () => {
    setSubmitted(null);
    setSubmitError(null);
    setDescription('');
    setIsCreateOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mineId) {
      setSubmitError('Select a mine.');
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await api.submitGrievance({ mineId, category, description, anonymityType: anonymity });
      setSubmitted(res);
      await loadGrievances();
    } catch (err: any) {
      setSubmitError(err.message || 'Could not submit.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackQuery.trim()) return;
    setIsSearching(true);
    setTrackError('');
    setTracked(null);
    try {
      setTracked(await api.trackGrievance(trackQuery.trim()));
    } catch (err: any) {
      setTrackError(err.message || 'No grievance found with that code.');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Grievances"
        description="Raise concerns anonymously. Track them with your code."
        actions={
          <button onClick={openCreate} className="btn-primary">
            <Plus className="w-4 h-4" />
            New grievance
          </button>
        }
      />

      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'all', label: 'All' },
          { value: 'track', label: 'Track a code' },
        ]}
      />

      {tab === 'all' && (
        <div className="card divide-y divide-white/[0.05] stagger">
          {isLoading ? (
            <ListSkeleton />
          ) : grievances.length === 0 ? (
            <Empty>No grievances yet.</Empty>
          ) : (
            grievances.map((g) => (
              <button
                key={g.id}
                onClick={() => openDetail(g.trackingCode)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-200 truncate">{titleCase(g.category)}</p>
                  <p className="mt-0.5 text-xs text-zinc-500 truncate">
                    <span className="font-mono">{g.trackingCode}</span> · {g.mine?.name} · {tierLabel(g.escalationTier)}
                  </p>
                </div>
                <StatusPill status={g.status} />
              </button>
            ))
          )}
        </div>
      )}

      {tab === 'track' && (
        <div className="max-w-xl space-y-6">
          <form onSubmit={handleTrack} className="flex gap-2">
            <input
              type="text"
              value={trackQuery}
              onChange={(e) => setTrackQuery(e.target.value)}
              placeholder="GRV-2026-XXXXXX"
              className="input font-mono uppercase placeholder:font-sans placeholder:normal-case"
            />
            <button type="submit" disabled={isSearching} className="btn-primary shrink-0">
              {isSearching ? 'Searching…' : 'Track'}
            </button>
          </form>
          {trackError && <p className="text-sm text-red-400">{trackError}</p>}
          {tracked && (
            <div className="card p-5">
              <p className="font-mono text-sm text-zinc-300 mb-4">{tracked.trackingCode}</p>
              <GrievanceDetail record={tracked} onChanged={(r) => { setTracked(r); loadGrievances(); }} />
            </div>
          )}
        </div>
      )}

      {detail && (
        <Modal title={detail.trackingCode} onClose={() => setDetail(null)}>
          <div className="p-5">
            <GrievanceDetail record={detail} onChanged={(r) => { setDetail(r); loadGrievances(); }} />
          </div>
        </Modal>
      )}

      {isCreateOpen && (
        <Modal title="New grievance" onClose={() => setIsCreateOpen(false)}>
          {submitted ? (
            <div className="p-6 text-center">
              <h3 className="text-base font-semibold">Grievance submitted</h3>
              <p className="mt-1 text-sm text-zinc-400">Save this code to check progress later.</p>
              <p className="mt-5 font-mono text-lg text-zinc-100 select-all">{submitted.trackingCode}</p>
              <div className="mt-6 flex gap-2">
                <button onClick={() => setIsCreateOpen(false)} className="btn-secondary flex-1">
                  Done
                </button>
                <button
                  onClick={() => {
                    setIsCreateOpen(false);
                    openDetail(submitted.trackingCode);
                  }}
                  className="btn-primary flex-1"
                >
                  View
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <Field label="Privacy">
                <div className="space-y-1.5">
                  {PRIVACY.map(({ value, label, hint, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setAnonymity(value)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                        anonymity === value ? 'border-white/25 bg-white/[0.04]' : 'border-white/[0.08] hover:border-white/15'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${anonymity === value ? 'text-zinc-100' : 'text-zinc-500'}`} />
                      <div className="min-w-0">
                        <p className={`text-sm ${anonymity === value ? 'text-zinc-100' : 'text-zinc-300'}`}>{label}</p>
                        <p className="text-xs text-zinc-500">{hint}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Mine">
                  <select required value={mineId} onChange={(e) => setMineId(e.target.value)} className="input">
                    <option value="" disabled>
                      Select
                    </option>
                    {mines.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Category">
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className="input">
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="What happened?">
                <textarea
                  rows={4}
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Facts, shift, location"
                  className="input resize-none"
                />
              </Field>
              {submitError && <p className="text-sm text-red-400">{submitError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setIsCreateOpen(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={isSubmitting} className="btn-primary">
                  {isSubmitting ? 'Submitting…' : 'Submit'}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
};
