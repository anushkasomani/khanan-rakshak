import React, { useState, useEffect } from 'react';
import { Trophy, ShieldCheck, AlertTriangle, Award, CheckCircle2, LucideIcon } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, Section, Stat, Empty, shortDate, ListSkeleton } from '../components/ui';

const BADGE_ICONS: Record<string, LucideIcon> = {
  SAFETY_CHAMPION: Trophy,
  HAZARD_HUNTER: ShieldCheck,
  EARLY_RISK_REPORTER: AlertTriangle,
  COMPLIANCE_LEADER: Award,
  ZERO_PENDING_ACTIONS: CheckCircle2,
};

const EARNING_RULES: [string, string][] = [
  ['Verified hazard report', '+10'],
  ['Early critical risk', '+20'],
  ['Safety suggestion adopted', '+15'],
  ['Team checklist target met', '+25'],
  ['30 days without violations', '+50'],
];

export const RecognitionPage: React.FC = () => {
  const { user } = useAuth();
  const [leaderboard, setLeaderboard] = useState<any>(null);
  const [mine, setMine] = useState<any>(null);

  useEffect(() => {
    Promise.all([api.getLeaderboard(), api.getMyPoints().catch(() => null)])
      .then(([lb, mp]) => {
        setLeaderboard(lb);
        setMine(mp && !mp.error ? mp : null);
      })
      .catch((e) => console.error('Error fetching recognition:', e));
  }, [user?.id]);

  const points = mine?.totalPoints ?? user?.points ?? 0;
  const earned = new Set<string>((mine?.badges || []).map((b: any) => b.badgeCode));
  const toNext = mine?.nextMilestone ? Math.max(mine.nextMilestone - points, 0) : undefined;
  const workers: any[] = leaderboard?.topWorkers || [];
  const history: any[] = mine?.history || [];

  return (
    <div className="space-y-8">
      <PageHeader title="Leaderboard" />

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Your points" value={points} />
        <Stat label="Tier" value={<span className="text-lg">{mine?.tier || '–'}</span>} />
        <Stat label="To next tier" value={toNext ?? '–'} />
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <Section title="Top workers" className="lg:col-span-2">
          <div className="card divide-y divide-white/[0.05] stagger">
            {!leaderboard ? (
              <ListSkeleton />
            ) : workers.length === 0 ? (
              <Empty>No points awarded yet.</Empty>
            ) : (
              workers.map((w, idx) => (
                <div key={w.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-5 shrink-0 text-sm text-zinc-500 tabular-nums">{idx + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm truncate ${w.id === user?.id ? 'text-zinc-50 font-medium' : 'text-zinc-200'}`}>
                      {w.name}
                      {w.id === user?.id && <span className="ml-2 text-xs text-zinc-500">You</span>}
                    </p>
                    {w.mine?.name && <p className="mt-0.5 text-xs text-zinc-500 truncate">{w.mine.name}</p>}
                  </div>
                  <span className="text-sm text-zinc-300 tabular-nums">{w.points}</span>
                </div>
              ))
            )}
          </div>
        </Section>

        <div className="space-y-8 min-w-0">
          <Section title="Badges">
            <div className="card divide-y divide-white/[0.05] stagger">
              {(leaderboard?.availableBadges || []).map((b: any) => {
                const Icon = BADGE_ICONS[b.code] || Award;
                const has = earned.has(b.code);
                return (
                  <div key={b.code} className={`flex items-center gap-3 px-4 py-3 ${has ? '' : 'opacity-40'}`}>
                    <Icon className="w-4 h-4 shrink-0 text-zinc-300" />
                    <div className="min-w-0">
                      <p className="text-sm text-zinc-200">{b.title}</p>
                      <p className="text-xs text-zinc-500 line-clamp-1">{has ? 'Earned' : b.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title="How to earn">
            <dl className="card divide-y divide-white/[0.05] stagger">
              {EARNING_RULES.map(([label, pts]) => (
                <div key={label} className="flex items-center justify-between gap-4 px-4 py-2.5">
                  <dt className="text-sm text-zinc-400">{label}</dt>
                  <dd className="text-sm text-zinc-200 tabular-nums">{pts}</dd>
                </div>
              ))}
            </dl>
          </Section>
        </div>
      </div>

      <Section title="Your points history">
        <div className="card divide-y divide-white/[0.05] stagger">
          {history.length === 0 ? (
            <Empty>No points yet. Report a verified hazard to earn your first.</Empty>
          ) : (
            history.map((h) => (
              <div key={h.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-200 truncate">{h.reason}</p>
                  <p className="mt-0.5 text-xs text-zinc-500 truncate">
                    Verified by {h.verifiedBy} · {shortDate(h.createdAt)}
                  </p>
                </div>
                <span className="text-sm text-emerald-400 tabular-nums">+{h.pointsAwarded}</span>
              </div>
            ))
          )}
        </div>
      </Section>
    </div>
  );
};
