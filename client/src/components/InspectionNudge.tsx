import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { FieldReport, Inspection } from '../types';
import { atLeast } from '../roles';
import { isOverdue } from '../pages/InspectionsPage';
import { shortDate } from './ui';

/** Dashboard card: inspections this person must do, and ones waiting for their approval. Hidden when there are none. */
export const InspectionNudge: React.FC = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<Inspection[]>([]);
  const [reports, setReports] = useState<FieldReport[]>([]);

  useEffect(() => {
    api.getInspections().then(setItems).catch(() => setItems([]));
    if (atLeast(user, 'OVERMAN')) {
      api
        .getFieldReports({ status: 'SUBMITTED' })
        .then((list) => setReports(list.filter((r) => r.canReview)))
        .catch(() => setReports([]));
    }
  }, [user?.id]);

  const tasks = items
    .filter((i) => i.assignedToId === user?.id && (i.status === 'SCHEDULED' || i.status === 'RETURNED'))
    .sort((a, b) => new Date(a.deadline || 0).getTime() - new Date(b.deadline || 0).getTime());
  const toApprove = items.filter((i) => i.canReview).length;
  if (!tasks.length && !toApprove && !reports.length) return null;

  const next = tasks[0];
  const overdue = next && isOverdue(next);
  return (
    <div className="card divide-y divide-white/[0.05] stagger">
      {next && (
        <Link to={`/inspections?open=${encodeURIComponent(next.id)}`} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
          <ClipboardCheck className={`w-4 h-4 shrink-0 ${overdue ? 'text-red-400' : 'text-zinc-400'}`} />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-zinc-200 truncate">
              {next.status === 'RETURNED' ? 'Redo: ' : ''}
              {next.title || next.inspectionType.replace(/_/g, ' ').toLowerCase()}
            </p>
            <p className={`mt-0.5 text-xs truncate ${overdue ? 'text-red-400' : 'text-zinc-500'}`}>
              {overdue ? 'Overdue since' : 'Due'} {next.deadline ? shortDate(next.deadline) : 'soon'}
              {tasks.length > 1 && <span className="text-zinc-500"> · {tasks.length - 1} more</span>}
            </p>
          </div>
          <ArrowRight className="w-4 h-4 text-zinc-500 shrink-0" />
        </Link>
      )}
      {reports.length > 0 && (
        <Link to="/field-reports" className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
          <span className="w-4 h-4 shrink-0 flex items-center justify-center">
            <span className="w-2 h-2 rounded-full bg-sky-400" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-zinc-200">
              {reports.length} field report{reports.length > 1 ? 's' : ''} to review
            </p>
            <p className="mt-0.5 text-xs text-zinc-500 truncate">{reports[0].title} · {reports[0].author.name}</p>
          </div>
          <ArrowRight className="w-4 h-4 text-zinc-500 shrink-0" />
        </Link>
      )}
      {toApprove > 0 && (
        <Link to="/inspections" className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
          <span className="w-4 h-4 shrink-0 flex items-center justify-center">
            <span className="w-2 h-2 rounded-full bg-sky-400" />
          </span>
          <p className="flex-1 text-sm text-zinc-200">
            {toApprove} inspection{toApprove > 1 ? 's' : ''} waiting for your approval
          </p>
          <ArrowRight className="w-4 h-4 text-zinc-500 shrink-0" />
        </Link>
      )}
    </div>
  );
};
