import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ShiftBoard } from '../../types';
import { atLeast } from '../../roles';
import { Modal, Empty } from '../ui';
import { ContactButtons } from '../ContactButtons';
import { DistrictStatusLine, ShiftReportView } from './ShiftReportView';

type Row = ShiftBoard['districts'][number];

/** Is this shift running now or already over? A report that's missing then is a problem, not just "not yet". */
const hasStarted = (board: ShiftBoard) =>
  board.date < board.current.date || (board.date === board.current.date && 'ABC'.indexOf(board.shift) <= 'ABC'.indexOf(board.current.shift));

/** Every district of the mine for one shift: the Sirdar's report, crew present and open hazards. */
export const DistrictBoard: React.FC<{ board: ShiftBoard; onChanged?: () => void }> = ({ board, onChanged }) => {
  const { user } = useAuth();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = board.districts.find((d) => d.id === openId) || null;
  const started = hasStarted(board);
  // DGMS reads the board but doesn't run the shift.
  const canAct = atLeast(user, 'OVERMAN') && user?.role !== 'DGMS';

  return (
    <>
      <div className="card divide-y divide-white/[0.05] stagger">
        {board.districts.length === 0 ? (
          <Empty>This mine has no districts yet. The admin adds them on the Mines page.</Empty>
        ) : (
          board.districts.map((d) => (
            <button
              key={d.id}
              onClick={() => setOpenId(d.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="text-sm text-zinc-200">{d.name}</p>
                  {d.report ? (
                    <DistrictStatusLine status={d.report.status} />
                  ) : (
                    <span className={`text-xs ${started ? 'text-amber-400' : 'text-zinc-500'}`}>Not inspected yet</span>
                  )}
                  {d.report && !d.report.seenByName && <span className="text-xs text-sky-400">Unread</span>}
                </div>
                <p className="mt-0.5 text-xs text-zinc-500 truncate">
                  {d.sirdars.length ? d.sirdars.map((s) => s.name).join(', ') : <span className="text-amber-400">No Sirdar on this shift</span>}
                  {' · '}
                  {d.crew.present}/{d.crew.total} checked in
                  {d.openHazards > 0 && ` · ${d.openHazards} open hazard${d.openHazards > 1 ? 's' : ''}`}
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-500 shrink-0" />
            </button>
          ))
        )}
      </div>

      {open && (
        <DistrictModal
          row={open}
          shiftLabel={board.shiftLabel}
          canAct={canAct}
          myId={user?.id}
          onClose={() => setOpenId(null)}
          onChanged={() => onChanged?.()}
        />
      )}
    </>
  );
};

const DistrictModal: React.FC<{
  row: Row;
  shiftLabel: string;
  canAct: boolean;
  myId?: string;
  onClose: () => void;
  onChanged: () => void;
}> = ({ row, shiftLabel, canAct, myId, onClose, onChanged }) => (
  <Modal title={`${row.name} · ${shiftLabel}`} onClose={onClose}>
    <div className="p-5 space-y-5">
      {row.location && <p className="text-sm text-zinc-500 -mt-1">{row.location}</p>}

      {row.report ? (
        <ShiftReportView
          report={row.report}
          canMarkRead={canAct && row.report.sirdarId !== myId}
          canChangeStatus={canAct}
          onChanged={onChanged}
        />
      ) : (
        <p className="text-sm text-zinc-400">The Sirdar has not submitted the pre-shift inspection. Nobody in this district can check in until they do.</p>
      )}

      <div className="space-y-2 border-t border-white/[0.06] pt-4">
        {row.sirdars.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3">
            <p className="text-sm text-zinc-300">
              {s.name} <span className="text-zinc-500">· Sirdar</span>
            </p>
            {s.phone && <ContactButtons name={s.name} phone={s.phone} sms={`About ${row.name}:`} />}
          </div>
        ))}
        <p className="text-sm text-zinc-400">
          {row.crew.present} of {row.crew.total} workers checked in
        </p>
        <Link to={`/safety-reports?district=${row.id}`} className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-100">
          {row.openHazards} open hazard{row.openHazards === 1 ? '' : 's'} in this district <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  </Modal>
);
