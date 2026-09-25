import React from 'react';
import { MyShift } from '../../types';
import { formatTime } from '../../attendance';
import { ContactButtons } from '../ContactButtons';

/** A worker's district for today and whether the Sirdar has cleared it. Check-in waits on this. */
export const ClearanceNotice: React.FC<{ shift: MyShift }> = ({ shift }) => {
  const { district, report } = shift;
  if (!district) return null;
  const sirdar = report?.sirdar || shift.sirdars?.[0];

  let tone = 'card';
  let dot = 'bg-zinc-500';
  let title: string;
  let detail: React.ReactNode = null;

  if (!report) {
    tone = 'card-warning';
    dot = 'bg-amber-400';
    title = `Waiting for ${sirdar ? sirdar.name : 'the Sirdar'} to inspect ${district.name}`;
    detail = 'You can check in once the district is cleared.';
  } else if (report.status === 'UNSAFE') {
    tone = 'card-danger';
    dot = 'bg-red-500';
    title = `Do not go in. ${district.name} is unsafe.`;
    detail = report.history.length ? report.history[report.history.length - 1].note : report.notes;
  } else if (report.status === 'RESTRICTED') {
    tone = 'card-warning';
    dot = 'bg-amber-400';
    title = `${district.name} cleared by ${report.sirdar.name}, with restrictions`;
    detail = <>Keep out of: {report.restrictions}</>;
  } else {
    dot = 'bg-emerald-400';
    title = `${district.name} cleared by ${report.sirdar.name} at ${formatTime(report.submittedAt)}`;
  }

  return (
    <div className={`${tone} px-4 py-3`}>
      <p className="text-xs text-zinc-500">
        {shift.shiftLabel}
        {district.location && ` · ${district.location}`}
      </p>
      <div className="mt-1.5 flex items-start gap-3">
        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${dot}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-zinc-100">{title}</p>
          {detail && <p className="mt-0.5 text-sm text-zinc-400">{detail}</p>}
        </div>
        {sirdar?.phone && <ContactButtons name={sirdar.name} phone={sirdar.phone} />}
      </div>
    </div>
  );
};
