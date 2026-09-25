import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { FieldReport, Mine } from '../types';
import { describeRole } from '../roles';
import { Section } from '../components/ui';
import { Greeting } from '../components/DashboardKit';
import { AttendanceCard } from '../components/AttendanceCard';
import { InspectionNudge } from '../components/InspectionNudge';
import { ReportEditor } from '../components/reports/ReportEditor';
import { ReportDetail, ReportRows } from './FieldReportsPage';

/** Blasters, shot-firers, surveyors: check in, write reports, see what came back. */
export const SpecialistDashboard: React.FC<{ mines: Mine[] }> = ({ mines }) => {
  const { user } = useAuth();
  const [reports, setReports] = useState<FieldReport[] | null>(null);
  const [writing, setWriting] = useState<FieldReport | 'new' | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = () =>
    api
      .getFieldReports({ mine: '1' })
      .then(setReports)
      .catch(() => setReports([]));
  useEffect(() => {
    load();
  }, []);

  const returned = reports?.filter((r) => r.status === 'RETURNED') || [];
  const waiting = reports?.filter((r) => r.status === 'SUBMITTED').length || 0;

  return (
    <div className="space-y-8">
      <Greeting
        subtitle={`${user ? describeRole(user) : ''}${user?.contract ? ` · ${user.contract.contractor.name}` : ''} · ${user?.mine?.name || ''}`}
        action={
          <button onClick={() => setWriting('new')} className="btn-primary">
            <Plus className="w-4 h-4" />
            New report
          </button>
        }
      />

      {returned.map((r) => (
        <button key={r.id} onClick={() => setOpenId(r.id)} className="card-warning w-full text-left px-4 py-3">
          <p className="text-sm text-zinc-100">Sent back: {r.title}</p>
          <p className="mt-0.5 text-sm text-zinc-400">
            {r.reviewedByName}: {r.reviewNote}
          </p>
        </button>
      ))}

      {user?.mineId && <AttendanceCard />}
      <InspectionNudge />

      <Section
        title="My reports"
        action={
          <Link to="/field-reports" className="text-sm text-zinc-500 hover:text-zinc-200 inline-flex items-center gap-1">
            All <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        }
      >
        {waiting > 0 && <p className="mb-2 text-xs text-zinc-500">{waiting} waiting for the Overman or manager to review.</p>}
        <ReportRows items={reports && reports.slice(0, 8)} empty="No reports yet. After a blast or a survey, write it up here." onOpen={(r) => setOpenId(r.id)} />
      </Section>

      {openId && (
        <ReportDetail
          id={openId}
          onClose={() => setOpenId(null)}
          onEdit={(r) => {
            setOpenId(null);
            setWriting(r);
          }}
          onChanged={load}
        />
      )}
      {writing && (
        <ReportEditor
          report={writing === 'new' ? null : writing}
          mines={mines}
          onClose={() => setWriting(null)}
          onSaved={(r) => {
            setWriting(null);
            load();
            setOpenId(r.id);
          }}
        />
      )}
    </div>
  );
};
