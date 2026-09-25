import React from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { describeRole, shiftLabel } from '../roles';

export const ProfilePage: React.FC = () => {
  const { user, logout } = useAuth();
  if (!user) return null;

  const rows: [string, string | null | undefined][] = [
    ['Role', describeRole(user)],
    ['Mine', user.mine?.name],
    ...(user.district ? ([['District', user.district.name]] as [string, string][]) : []),
    ...(user.shift ? ([['Shift', shiftLabel(user.shift, user.mine?.shiftStartHour)]] as [string, string][]) : []),
    ...(user.contract ? ([['Employed by', `${user.contract.contractor.name} (contract)`]] as [string, string][]) : []),
    ...(user.trainingValidUntil
      ? ([['Training valid until', new Date(user.trainingValidUntil).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })]] as [string, string][])
      : []),
    ['Phone', user.phone],
    ['Employee ID', user.badgeNumber],
    ['Safety points', String(user.points ?? 0)],
    ...(user.isAdmin ? ([['Access', 'Admin']] as [string, string][]) : []),
  ];

  return (
    <div className="max-w-xl space-y-8">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-lg font-medium text-zinc-200 shrink-0">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight truncate">{user.name}</h1>
          <p className="text-sm text-zinc-500 truncate">{user.email}</p>
        </div>
      </div>

      <dl className="card divide-y divide-white/[0.05] stagger">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-zinc-500">{label}</dt>
            <dd className={`text-sm ${value ? 'text-zinc-200' : 'text-zinc-600'}`}>{value || 'Not set'}</dd>
          </div>
        ))}
      </dl>

      <p className="text-xs text-zinc-600">To change your role, mine, district or shift, ask an admin.</p>

      <button onClick={logout} className="btn-secondary">
        <LogOut className="w-4 h-4" />
        Sign out
      </button>
    </div>
  );
};
