import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface TamperProofBadgeProps {
  hash?: string | null;
  recordId?: string;
  truncate?: boolean;
}

export const TamperProofBadge: React.FC<TamperProofBadgeProps> = ({ hash, recordId, truncate = true }) => {
  const navigate = useNavigate();
  const display = hash ? (truncate ? hash.substring(0, 8) : hash) : 'Verify';

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigate(recordId ? `/audit-verification?recordId=${encodeURIComponent(recordId)}` : '/audit-verification');
      }}
      title={hash ? `SHA-256 ${hash} — verify in audit log` : 'Verify in audit log'}
      className="inline-flex items-center gap-1 font-mono text-[11px] text-zinc-500 hover:text-zinc-200 transition-colors"
    >
      <ShieldCheck className="w-3 h-3 shrink-0" />
      <span className="truncate">{display}</span>
    </button>
  );
};
