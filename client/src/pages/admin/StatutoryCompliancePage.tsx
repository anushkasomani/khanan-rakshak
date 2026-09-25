import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, FilePlus2, RefreshCw, Scale } from 'lucide-react';
import { api, ComplianceCheck, ComplianceRule, StatutoryComplianceDashboard } from '../../services/api';
import { Mine } from '../../types';
import { Field, Modal, PageHeader, Section, Stat } from '../../components/ui';

type Props = { mines: Mine[] };
type Draft = {
  code: string; title: string; description: string; category: string; frequency: string; severity: string;
  evaluationType: string; minimumCount: number; sourceReference: string; applicableMineIds: string[];
};
const initialDraft: Draft = { code: '', title: '', description: '', category: 'INSPECTION', frequency: 'MONTHLY', severity: 'HIGH', evaluationType: 'INSPECTION_COUNT', minimumCount: 1, sourceReference: 'DEMO / CONFIGURED — not a verified statutory citation', applicableMineIds: [] };
const statusClass = (status: string) => ({ COMPLIANT: 'text-emerald-300 bg-emerald-500/10', PARTIALLY_COMPLIANT: 'text-amber-300 bg-amber-500/10', NON_COMPLIANT: 'text-orange-300 bg-orange-500/10', OVERDUE: 'text-red-300 bg-red-500/10', NOT_APPLICABLE: 'text-zinc-400 bg-zinc-500/10', INSUFFICIENT_DATA: 'text-sky-300 bg-sky-500/10' }[status] || 'text-zinc-400 bg-zinc-500/10');
const statusLabel = (status: string) => status.replace(/_/g, ' ');
const dateLabel = (value?: string | Date | null) => value ? new Date(value).toLocaleDateString() : '—';
const displayValue = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : value && typeof value === 'object' ? JSON.stringify(value) : '—';
const recordHref = (recordType: string, id: string) => {
  const encoded = encodeURIComponent(id);
  if (recordType === 'SAFETY_REPORT' || id.startsWith('SAFE-')) return `/safety-reports?open=${encoded}`;
  if (recordType === 'INCIDENT' || id.startsWith('INC-')) return `/incidents?open=${encoded}`;
  if (recordType === 'INSPECTION' || id.startsWith('INS-')) return `/inspections?open=${encoded}`;
  if (recordType === 'CORRECTIVE_ACTION' || id.startsWith('ACT-')) return `/corrective-actions?open=${encoded}`;
  return null;
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => <span className={`inline-flex rounded-md px-2 py-1 text-[10px] font-medium tracking-wide ${statusClass(status)}`}>{statusLabel(status)}</span>;

const RuleEditor: React.FC<{ mines: Mine[]; onClose: () => void; onSave: (draft: Draft) => Promise<void> }> = ({ mines, onClose, onSave }) => {
  const [draft, setDraft] = useState(initialDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await onSave(draft); }
    catch (e: any) { setError(e.message || 'Could not save the configured rule.'); }
    finally { setBusy(false); }
  };
  const set = (field: keyof Draft, value: string | number | string[]) => setDraft((current) => ({ ...current, [field]: value }));
  return <Modal title="Configure compliance requirement" onClose={onClose} width="lg">
    <form onSubmit={submit} className="space-y-4 p-5">
      <p className="text-xs text-amber-300">Configured requirement only. Add a verified source reference before treating a rule as legally authoritative.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Rule code"><input required maxLength={80} className="input" value={draft.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="CONFIG-INSPECTION-01" /></Field>
        <Field label="Title"><input required maxLength={160} className="input" value={draft.title} onChange={(e) => set('title', e.target.value)} /></Field>
        <Field label="Category"><select className="input" value={draft.category} onChange={(e) => { set('category', e.target.value); set('evaluationType', e.target.value === 'INSPECTION' ? 'INSPECTION_COUNT' : 'CORRECTIVE_ACTION_DEADLINE'); }}><option value="INSPECTION">Inspection</option><option value="CORRECTIVE_ACTION">Corrective action</option></select></Field>
        <Field label="Evaluator"><select className="input" value={draft.evaluationType} onChange={(e) => set('evaluationType', e.target.value)}><option value="INSPECTION_COUNT">Completed inspection count</option><option value="CORRECTIVE_ACTION_DEADLINE">Corrective action deadlines</option></select></Field>
        <Field label="Frequency"><select className="input" value={draft.frequency} onChange={(e) => set('frequency', e.target.value)}><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option><option value="ANNUAL">Annual</option></select></Field>
        <Field label="Severity"><select className="input" value={draft.severity} onChange={(e) => set('severity', e.target.value)}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></Field>
        {draft.evaluationType === 'INSPECTION_COUNT' && <Field label="Minimum completed inspections per period"><input type="number" min={1} max={50} className="input" value={draft.minimumCount} onChange={(e) => set('minimumCount', Number(e.target.value))} /></Field>}
      </div>
      <Field label="Description"><textarea required maxLength={1000} rows={3} className="input w-full" value={draft.description} onChange={(e) => set('description', e.target.value)} /></Field>
      <Field label="Source reference"><input required maxLength={240} className="input" value={draft.sourceReference} onChange={(e) => set('sourceReference', e.target.value)} /></Field>
      <Field label="Applicable mines"><select multiple className="input min-h-28" value={draft.applicableMineIds} onChange={(e) => set('applicableMineIds', Array.from(e.target.selectedOptions, (option) => option.value))}><option value="">All mines (leave no selections)</option>{mines.map((mine) => <option key={mine.id} value={mine.id}>{mine.name}</option>)}</select></Field>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save configured rule'}</button></div>
    </form>
  </Modal>;
};

export const StatutoryCompliancePage: React.FC<Props> = ({ mines }) => {
  const [data, setData] = useState<StatutoryComplianceDashboard | null>(null);
  const [mineId, setMineId] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [periodDays, setPeriodDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showEditor, setShowEditor] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await api.getStatutoryCompliance({ mineId: mineId || undefined, status: status || undefined, category: category || undefined, periodDays })); }
    catch (e: any) { setError(e.message || 'Could not load compliance data.'); }
    finally { setLoading(false); }
  }, [mineId, status, category, periodDays]);
  useEffect(() => { void load(); }, [load]);

  const evaluate = async () => {
    setEvaluating(true); setError(''); setMessage('');
    try {
      const result = await api.evaluateCompliance(mineId || undefined);
      setMessage(`Evaluated ${result.checks.length} configured checks. ${result.statusChanges} status changes recorded.`);
      await load();
    } catch (e: any) { setError(e.message || 'Compliance evaluation failed.'); }
    finally { setEvaluating(false); }
  };
  const saveRule = async (draft: Draft) => {
    await api.createComplianceRule({
      code: draft.code, title: draft.title, description: draft.description, category: draft.category, frequency: draft.frequency,
      severity: draft.severity, evaluationType: draft.evaluationType, configuration: { minimumCount: draft.minimumCount },
      sourceReference: draft.sourceReference, applicableMineIds: draft.applicableMineIds,
    });
    setShowEditor(false); setMessage('Configured rule saved. Run an evaluation to create its first check.'); await load();
  };
  const toggleRule = async (rule: ComplianceRule) => {
    try { await api.setComplianceRuleActive(rule.id, !rule.active); await load(); }
    catch (e: any) { setError(e.message || 'Could not update the rule.'); }
  };
  const summary = data?.summary || { minesMonitored: 0, totalChecks: 0, compliant: 0, nonCompliant: 0, overdue: 0, insufficientData: 0 };
  const issueChecks = (data?.checks || []).filter((check) => ['NON_COMPLIANT', 'OVERDUE', 'PARTIALLY_COMPLIANT'].includes(check.status));
  const visibleRules = data?.rules || [];

  return <div className="space-y-7">
    <PageHeader title="Statutory Compliance" description="Monitor configured statutory and governance requirements across mines." actions={<div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={() => setShowEditor(true)}><FilePlus2 className="h-4 w-4"/>Configure rule</button><button className="btn-secondary" disabled={loading} onClick={() => void load()}><RefreshCw className="h-4 w-4"/>Refresh</button><button className="btn-primary" disabled={evaluating} onClick={() => void evaluate()}><ClipboardCheck className="h-4 w-4"/>{evaluating ? 'Evaluating…' : 'Evaluate requirements'}</button></div>} />
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-3 text-xs text-amber-200/80"><Scale className="mr-2 inline h-4 w-4"/>Checks evaluate administrator-configured rules. Demo rules are not verified legal advice or an authoritative statement of statutory requirements.</div>
    <div className="card grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
      <label className="text-xs text-zinc-500">Mine<select className="input mt-1" value={mineId} onChange={(e) => setMineId(e.target.value)}><option value="">All Mines</option>{mines.map((mine) => <option key={mine.id} value={mine.id}>{mine.name}</option>)}</select></label>
      <label className="text-xs text-zinc-500">Status<select className="input mt-1" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{['COMPLIANT','PARTIALLY_COMPLIANT','NON_COMPLIANT','OVERDUE','NOT_APPLICABLE','INSUFFICIENT_DATA'].map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></label>
      <label className="text-xs text-zinc-500">Category<select className="input mt-1" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option><option value="INSPECTION">Inspection</option><option value="CORRECTIVE_ACTION">Corrective action</option><option value="SAFETY">Safety</option><option value="INCIDENT">Incident</option><option value="OTHER">Other</option></select></label>
      <label className="text-xs text-zinc-500">Evaluation history<select className="input mt-1" value={periodDays} onChange={(e) => setPeriodDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label>
    </div>
    {error && <div className="card-danger p-3 text-sm">{error}</div>}{message && <div className="card p-3 text-sm text-emerald-300">{message}</div>}
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-6"><Stat label="Mines monitored" value={summary.minesMonitored}/><Stat label="Current checks" value={summary.totalChecks}/><Stat label="Compliant" value={summary.compliant}/><Stat label="Non-compliant" value={summary.nonCompliant} tone={summary.nonCompliant ? 'danger' : 'default'}/><Stat label="Overdue" value={summary.overdue} tone={summary.overdue ? 'danger' : 'default'}/><Stat label="Insufficient data" value={summary.insufficientData}/></div>

    <Section title="Mine compliance overview"><div className="card overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b border-white/[0.06] text-xs text-zinc-500"><tr>{['Mine','Checks','Compliant','Non-compliant','Overdue','Compliance %'].map((label) => <th key={label} className="px-4 py-3 font-normal">{label}</th>)}</tr></thead><tbody className="divide-y divide-white/[0.05]">{data?.mineMetrics.map((row) => <tr key={row.mineId}><td className="px-4 py-3 text-zinc-200">{row.mineName}</td><td className="px-4 py-3">{row.checks}</td><td className="px-4 py-3 text-emerald-300">{row.compliant}</td><td className="px-4 py-3">{row.nonCompliant}</td><td className="px-4 py-3 text-red-300">{row.overdue}</td><td className="px-4 py-3">{row.compliancePercent === null ? '—' : `${row.compliancePercent}%`}</td></tr>)}{!data?.mineMetrics.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-500">No evaluated mine checks in this period. Run an evaluation after configuring rules.</td></tr>}</tbody></table></div></Section>

    <Section title="Configured requirements"><div className="card overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-white/[0.06] text-xs text-zinc-500"><tr>{['Requirement','Code','Category','Frequency','Applicable mines','Status','Last evaluation','Next due',''].map((label) => <th key={label} className="px-3 py-3 font-normal">{label}</th>)}</tr></thead><tbody className="divide-y divide-white/[0.05]">{visibleRules.map((rule) => <tr key={rule.id} className={!rule.active ? 'opacity-50' : ''}><td className="px-3 py-3"><p className="text-zinc-200">{rule.title}</p><p className="mt-1 max-w-xs text-xs text-zinc-500">{rule.description}</p><p className="mt-1 text-[10px] text-amber-300/70">{rule.sourceReference}</p></td><td className="px-3 py-3 font-mono text-xs">{rule.code}</td><td className="px-3 py-3">{rule.category}</td><td className="px-3 py-3">{rule.frequency}</td><td className="px-3 py-3">{rule.applicableMines.length ? rule.applicableMines.map((mine) => mine.name).join(', ') : 'All mines'}</td><td className="px-3 py-3">{rule.active ? <StatusBadge status={rule.status || 'INSUFFICIENT_DATA'}/> : <span className="text-xs text-zinc-500">Inactive</span>}</td><td className="px-3 py-3 text-xs text-zinc-400">{dateLabel(rule.lastEvaluatedAt)}</td><td className="px-3 py-3 text-xs text-zinc-400">{dateLabel(rule.nextDue)}</td><td className="px-3 py-3"><button className="text-xs text-sky-400 hover:underline" onClick={() => void toggleRule(rule)}>{rule.active ? 'Deactivate' : 'Activate'}</button></td></tr>)}{!visibleRules.length && <tr><td colSpan={9} className="px-4 py-8 text-center text-zinc-500">No configured rules match these filters.</td></tr>}</tbody></table></div></Section>

    <Section title="Configured requirements needing review"><div className="card divide-y divide-white/[0.05]">{issueChecks.length ? issueChecks.map((check) => <ComplianceIssue key={check.id} check={check}/>) : <p className="p-5 text-sm text-zinc-500">No non-compliant, partially compliant, or overdue checks in the selected evaluation history.</p>}</div></Section>
    {loading && <p className="text-xs text-zinc-500">Loading configured compliance data…</p>}
    {showEditor && <RuleEditor mines={mines} onClose={() => setShowEditor(false)} onSave={saveRule}/>}
  </div>;
};

const ComplianceIssue: React.FC<{ check: ComplianceCheck }> = ({ check }) => {
  const actual = Object.entries(check.actualValue || {}).map(([key, value]) => `${key.replace(/([A-Z])/g, ' $1')}: ${displayValue(value)}`).join(' · ');
  return <article className="grid gap-3 p-4 xl:grid-cols-[1.1fr_1.2fr_.65fr_.7fr_1.3fr_1fr] xl:items-start">
    <div><p className="text-sm text-zinc-200">{check.mine.name}</p><p className="mt-1 text-xs text-zinc-500">{check.rule.title}</p></div>
    <div className="flex flex-wrap items-center gap-2"><StatusBadge status={check.status}/><span className="text-xs text-zinc-400">{check.rule.severity}</span><p className="basis-full text-xs text-zinc-500">{check.violationSummary || actual}</p></div>
    <div className="text-xs text-zinc-400">Due {dateLabel(check.dueDate)}</div>
    <div className="flex flex-wrap gap-2 text-xs">{check.evidenceRefs.length ? check.evidenceRefs.map((ref, index) => { const href = recordHref(ref.recordType, ref.recordId); return href ? <Link key={`${ref.recordId}-${index}`} to={href} className="text-sky-400 hover:underline" title={ref.summary}>{ref.recordId}</Link> : <span key={`${ref.recordId}-${index}`} className="font-mono text-zinc-400" title={ref.summary}>{ref.recordId}</span>; }) : <span className="text-zinc-500">No evidence records</span>}</div>
    <div className="text-xs text-zinc-400">{check.correctiveActionIds.length ? <>{check.correctiveActionIds.map((id) => <Link key={id} to={`/corrective-actions?open=${encodeURIComponent(id)}`} className="mr-2 text-sky-400 hover:underline">{id}</Link>)}<span>{displayValue(check.actualValue.overdue)} overdue</span></> : <Link to="/corrective-actions" className="text-sky-400 hover:underline">Open existing corrective-action workflow</Link>}</div>
    <div className="text-xs text-zinc-500">Period {dateLabel(check.periodStart)} – {dateLabel(check.periodEnd)} · checked {dateLabel(check.checkedAt)}</div>
  </article>;
};
