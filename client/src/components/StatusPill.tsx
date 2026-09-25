import React from 'react';

interface StatusPillProps {
  status: string;
  size?: 'sm' | 'md';
  label?: string; // overrides the text derived from status
}

const GREEN = ['SAFE', 'RESOLVED', 'COMPLETED', 'VERIFIED', 'OPERATIONAL', 'LOW', 'CLOSED', 'APPROVED'];
const RED = ['UNSAFE', 'CRITICAL', 'ALERT_TRIGGERED', 'OVERDUE', 'FATALITY', 'HIGH', 'AUDIT_REQUIRED', 'REJECTED', 'MISSED'];
const AMBER = ['RESTRICTED', 'MEDIUM', 'ASSIGNED', 'INVESTIGATION_IN_PROGRESS', 'ACTION_REQUIRED', 'ESCALATED', 'CAUTION', 'RESPONDING', 'TEAM_ASSIGNED', 'PENDING', 'FOLLOW_UP_REQUIRED', 'SERIOUS', 'RETURNED'];
const BLUE = ['FIXED', 'SUBMITTED', 'UNDER_REVIEW', 'ACKNOWLEDGED', 'SCHEDULED', 'IN_PROGRESS', 'INVESTIGATING'];

export const StatusPill: React.FC<StatusPillProps> = ({ status, size = 'sm', label: labelOverride }) => {
  const norm = status.toUpperCase();
  const dot = GREEN.includes(norm)
    ? 'bg-emerald-400'
    : RED.includes(norm)
    ? 'bg-red-400'
    : AMBER.includes(norm)
    ? 'bg-amber-400'
    : BLUE.includes(norm)
    ? 'bg-sky-400'
    : 'bg-zinc-500';

  const label = labelOverride || status.replace(/_/g, ' ').toLowerCase();

  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-zinc-300 ${size === 'md' ? 'text-sm' : 'text-xs'}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      <span className="first-letter:uppercase">{label}</span>
    </span>
  );
};
