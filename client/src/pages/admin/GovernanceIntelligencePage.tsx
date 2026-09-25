import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BrainCircuit, FileText, RefreshCw, ShieldAlert } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, GovernanceAIAnalysis, GovernanceAnalytics, GovernanceSavedAnalysis } from '../../services/api';
import { PageHeader, Section, Stat } from '../../components/ui';
import { Mine } from '../../types';

type Props = { mines: Mine[] };
type Period = 7 | 30 | 90;

const defaultQuestion = 'Which mines and issues need administrative attention, and what records support that?';
const normalizeAnalytics = (value?: GovernanceAnalytics | null, scope = 'all_mines'): GovernanceAnalytics | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as GovernanceAnalytics & { dataWarnings?: GovernanceAnalytics['dataWarnings']; filters?: GovernanceAnalytics['filters'] };
  const period = raw.filters?.periodDays;
  return {
    ...raw,
    generatedAt: raw.generatedAt || new Date().toISOString(),
    filters: { mineId: raw.filters?.mineId ?? (scope !== 'all_mines' ? scope : null), periodDays: period === 7 || period === 90 ? period : 30 },
    coverage: Object.assign({ mines: 0, hazards: 0, openHazards: 0, inspections: 0, incidents: 0, sosAlerts: 0, correctiveActions: 0 }, raw.coverage || {}),
    metrics: Array.isArray(raw.metrics) ? raw.metrics : [],
    risks: Array.isArray(raw.risks) ? raw.risks : [],
    recurringIssues: Array.isArray(raw.recurringIssues) ? raw.recurringIssues : [],
    anomalies: Array.isArray(raw.anomalies) ? raw.anomalies : [],
    dataWarnings: Array.isArray(raw.dataWarnings) ? raw.dataWarnings : [],
    evidence: raw.evidence || { hazards: [], inspections: [], incidents: [], sos: [], correctiveActions: [] },
  };
};
const savedPeriod = (item: GovernanceSavedAnalysis): Period => {
  const period = item.analytics?.filters?.periodDays;
  return period === 7 || period === 90 ? period : 30;
};
const savedMineId = (item: GovernanceSavedAnalysis) => item.analytics?.filters?.mineId || (item.scope !== 'all_mines' ? item.scope : '');
const recordHref = (id: string) => {
  const encoded = encodeURIComponent(id);
  if (id.startsWith('SAFE-')) return `/safety-reports?open=${encoded}`;
  if (id.startsWith('INC-')) return `/incidents?open=${encoded}`;
  if (id.startsWith('INS-')) return `/inspections?open=${encoded}`;
  if (id.startsWith('ACT-')) return `/corrective-actions?open=${encoded}`;
  if (id.startsWith('SOS-')) return `/sos-control?open=${encoded}`;
  return null;
};
const nameFor = (id: string, mines: Mine[]) => mines.find((mine) => mine.id === id)?.name || 'Mine';

const EvidenceLinks: React.FC<{ ids: string[] }> = ({ ids }) => <span className="inline-flex flex-wrap gap-x-3 gap-y-1">{ids.map((id) => {
  const href = recordHref(id);
  return href ? <Link key={id} className="text-sky-400 hover:underline" to={href}>{id} →</Link> : <span key={id} className="font-mono text-xs text-zinc-400">{id}</span>;
})}</span>;

const evidenceQuality = (data: GovernanceAnalytics | null) => {
  if (!data?.metrics.length) return { level: 'LIMITED', reasons: ['No mine records are available for this selection.'] };
  const quality = data.metrics.map((row) => row.evidenceQuality);
  const level = quality.every((value) => value === 'HIGH') ? 'HIGH' : quality.some((value) => value !== 'LIMITED') ? 'MODERATE' : 'LIMITED';
  const reasons = (data.dataWarnings || []).flatMap((warning) => warning.warnings.map((message) => `${warning.mineName}: ${message}`));
  return { level, reasons: reasons.slice(0, 4) };
};

export const GovernanceIntelligencePage: React.FC<Props> = ({ mines }) => {
  const [data, setData] = useState<GovernanceAnalytics | null>(null);
  const [mineId, setMineId] = useState('');
  const [periodDays, setPeriodDays] = useState<Period>(30);
  const [question, setQuestion] = useState(defaultQuestion);
  const [analysis, setAnalysis] = useState<GovernanceAIAnalysis | null>(null);
  const [analysisContext, setAnalysisContext] = useState<{ scope: string; periodDays: number } | null>(null);
  const [history, setHistory] = useState<GovernanceSavedAnalysis[]>([]);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState('');
  const [reportVisible, setReportVisible] = useState(false);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setData(await api.getGovernanceAnalytics({ mineId: mineId || undefined, periodDays })); }
    catch (e: any) { setError(e.message || 'Could not load governance analytics.'); }
    finally { setLoading(false); }
  }, [mineId, periodDays]);

  useEffect(() => { void loadAnalytics(); }, [loadAnalytics]);
  useEffect(() => {
    Promise.allSettled([api.getGovernanceHistory()]).then(([historyResult]) => {
      if (historyResult.status !== 'fulfilled') return;
      const saved = historyResult.value;
      setHistory(saved);
      if (saved.length) {
        const latest = saved[0];
        setAnalysis(latest.analysis);
        setSelectedAnalysisId(latest.id);
        const period = savedPeriod(latest);
        setAnalysisContext({ scope: latest.scope || 'all_mines', periodDays: period });
        setMineId(savedMineId(latest));
        setPeriodDays(period);
        const savedAnalytics = normalizeAnalytics(latest.analytics, latest.scope);
        if (savedAnalytics) setData(savedAnalytics);
      }
    });
  }, []);

  const runAnalysis = async (prompt = question, scopeMineId = mineId) => {
    setAiLoading(true);
    setError('');
    try {
      const result = await api.analyzeGovernance(prompt, { mineId: scopeMineId || undefined, periodDays });
      setData(result.analytics);
      setAnalysis(result.analysis);
      setSelectedAnalysisId(result.requestId);
      setAnalysisContext({ scope: scopeMineId || 'all_mines', periodDays });
      setHistory(await api.getGovernanceHistory());
    } catch (e: any) {
      if (e?.analytics) setData(e.analytics);
      setError(e.message || 'AI analysis unavailable. The underlying analytics are still available.');
    } finally { setAiLoading(false); }
  };

  const summary = useMemo(() => ({
    mines: data?.metrics.length || 0,
    elevated: data?.risks.filter((row) => row.riskLevel !== 'NORMAL').length || 0,
    overdue: data?.metrics.reduce((sum, row) => sum + row.overdueActionCount, 0) || 0,
    violations: data?.metrics.reduce((sum, row) => sum + row.inspectionViolationCount, 0) || 0,
  }), [data]);
  const quality = evidenceQuality(data);
  const selectedMine = mines.find((mine) => mine.id === mineId);
  const riskChart = (data?.risks || []).slice().sort((a, b) => b.score - a.score).slice(0, mineId ? 1 : 8).map((row) => ({ mine: row.mineName, score: row.score }));
  const activityChart = (data?.metrics || []).slice().sort((a, b) => b.hazardCount + b.incidentCount + b.inspectionCount - (a.hazardCount + a.incidentCount + a.inspectionCount)).slice(0, mineId ? 1 : 8).map((row) => ({ mine: row.mineName, Hazards: row.hazardCount, Incidents: row.incidentCount, Inspections: row.inspectionCount }));
  const generatedActions = analysis?.recommendedAdministrativeReview || analysis?.recommendedActions || [];
  const generatedFacts = analysis?.observedFacts || (analysis?.keyFindings || []).map((finding) => ({ label: finding.title, value: finding.explanation, evidenceIds: finding.evidenceIds }));
  const suggestions = [
    'Which mines need attention?',
    'What are the recurring issues?',
    'Which corrective actions are overdue?',
    `Summarize incidents in the last ${periodDays} days`,
    ...(selectedMine ? [`Explain ${selectedMine.name}'s risk`] : []),
    'Compare mine risk',
  ];
  const chooseHistory = (item: GovernanceSavedAnalysis) => {
    setSelectedAnalysisId(item.id);
    setAnalysis(item.analysis);
    const savedAnalytics = normalizeAnalytics(item.analytics, item.scope);
    if (savedAnalytics) setData(savedAnalytics);
    const period = savedPeriod(item);
    setAnalysisContext({ scope: item.scope || 'all_mines', periodDays: period });
    setMineId(savedMineId(item));
    setPeriodDays(period);
  };

  return <div className="space-y-7">
    <PageHeader title="Governance intelligence" description="Evidence-backed mine governance analytics. Operational metrics are calculated from records; Groq interprets that evidence on request." actions={<button className="btn-secondary" disabled={loading} onClick={() => void loadAnalytics()}><RefreshCw className="w-4 h-4" /> Refresh</button>} />

    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Stat label="Mines in scope" value={summary.mines} />
      <Stat label="Elevated / high risk" value={summary.elevated} tone={summary.elevated ? 'danger' : 'default'} />
      <Stat label="Overdue actions" value={summary.overdue} tone={summary.overdue ? 'danger' : 'default'} />
      <Stat label="Inspection violations" value={summary.violations} tone={summary.violations ? 'danger' : 'default'} />
    </div>
    {data?.complianceSummary && <div className="card flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="text-xs tracking-wide text-zinc-500">CONFIGURED COMPLIANCE CHECKS</p>{data.complianceSummary.total ? <p className="mt-1 text-sm text-zinc-300">{data.complianceSummary.compliant} compliant · {data.complianceSummary.nonCompliant} non-compliant · {data.complianceSummary.overdue} overdue · {data.complianceSummary.insufficientData} insufficient data</p> : <p className="mt-1 text-sm text-zinc-500">No recent compliance evaluations are available.</p>}</div><Link className="text-xs text-sky-400 hover:underline" to="/admin/compliance">Open statutory compliance</Link></div>}

    <div className="card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-zinc-500">Mine
          <select className="input mt-1" value={mineId} onChange={(event) => setMineId(event.target.value)}>
            <option value="">All Mines</option>
            {mines.map((mine) => <option key={mine.id} value={mine.id}>{mine.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-zinc-500">Period
          <select className="input mt-1" value={periodDays} onChange={(event) => setPeriodDays(Number(event.target.value) as Period)}>
            <option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option>
          </select>
        </label>
      </div>
    </div>

    {error && <div className="card-danger p-4 text-sm"><p>AI analysis unavailable. The underlying analytics are still available.</p><p className="mt-1 text-red-300/80">{error}</p><button className="mt-2 text-xs underline" onClick={() => void runAnalysis()}>Try again</button></div>}
    {data && <p className="text-xs text-zinc-500">Calculated {new Date(data.generatedAt).toLocaleString()} · {data.filters.mineId ? selectedMine?.name || 'Selected mine' : 'All accessible mines'} · last {data.filters.periodDays} days · {data.coverage.openHazards} open hazards · {data.coverage.inspections} inspections</p>}

    <Section title="Analytics · calculated from recorded data">
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="card min-w-0 p-4"><h3 className="mb-1 text-sm font-medium">Mine risk score</h3><p className="mb-3 text-xs text-zinc-500">{mineId ? selectedMine?.name : 'Highest scores · all mines'} · current exposure; violations/missed inspections use selected period</p>{riskChart.length ? <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={riskChart} layout="vertical" margin={{ top: 4, right: 30, left: 8, bottom: 4 }}><CartesianGrid stroke="#27272a" horizontal={false}/><XAxis type="number" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false}/><YAxis type="category" dataKey="mine" width={142} tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false}/><Tooltip contentStyle={{ background: '#18181b', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, fontSize: 12 }}/><Bar dataKey="score" name="Risk score" fill="#f97316" radius={[0, 5, 5, 0]} maxBarSize={22}><LabelList dataKey="score" position="right" fill="#d4d4d8" fontSize={11}/></Bar></BarChart></ResponsiveContainer></div> : <p className="py-16 text-center text-sm text-zinc-500">No mine analytics available.</p>}</div>
        <div className="card min-w-0 p-4"><h3 className="mb-1 text-sm font-medium">Recorded activity · last {periodDays} days</h3><p className="mb-3 text-xs text-zinc-500">{mineId ? selectedMine?.name : 'Per mine · top 8 by recorded activity'}</p>{activityChart.length ? <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={activityChart} margin={{ top: 4, right: 8, left: -18, bottom: 12 }}><CartesianGrid stroke="#27272a" vertical={false}/><XAxis dataKey="mine" tick={{ fill: '#a1a1aa', fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={-18} textAnchor="end" height={54}/><YAxis allowDecimals={false} tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false}/><Tooltip contentStyle={{ background: '#18181b', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, fontSize: 12 }}/><Bar dataKey="Hazards" stackId="activity" fill="#f97316"/><Bar dataKey="Incidents" stackId="activity" fill="#ef4444"/><Bar dataKey="Inspections" stackId="activity" fill="#38bdf8" radius={[4, 4, 0, 0]}/></BarChart></ResponsiveContainer></div> : <p className="py-16 text-center text-sm text-zinc-500">No activity recorded for this period.</p>}<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500"><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-orange-500"/>Hazards</span><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-red-500"/>Incidents</span><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-sky-400"/>Inspections</span></div></div>
      </div>
    </Section>

    <Section title="Mine risk indicators">
      <div className="grid gap-3 xl:grid-cols-2">{data?.risks.map((mine) => <article key={mine.mineId} className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-medium text-zinc-100">{mine.mineName}</h3><p className="mt-1 text-xs text-zinc-500">Risk indicator score: <b className="text-zinc-300">{mine.score}</b></p></div><span className={`badge ${mine.riskLevel === 'HIGH' ? 'badge-danger' : mine.riskLevel === 'ELEVATED' ? 'badge-warning' : ''}`}>{mine.riskLevel}</span></div>
        {mine.indicators.length ? <ul className="mt-4 space-y-3">{mine.indicators.map((indicator) => <li key={indicator.type} className="text-sm"><p className="text-zinc-300">{indicator.count} · {indicator.description}</p><div className="mt-1 pl-3 text-xs"><EvidenceLinks ids={indicator.evidenceIds}/></div></li>)}</ul> : <p className="mt-4 text-sm text-zinc-500">No current risk indicators recorded.</p>}
        {mine.indicators.length > 0 && <button className="btn-secondary mt-4 w-full sm:w-auto" disabled={aiLoading} onClick={() => { const text = `Explain ${mine.mineName}'s governance risk for the selected ${periodDays}-day period. Use the recorded evidence and state any data limitations.`; setQuestion(text); void runAnalysis(text, mine.mineId); }}><BrainCircuit className="h-4 w-4"/>{aiLoading ? 'Analyzing…' : 'Explain with AI'}</button>}
      </article>)}</div>
      {data?.risks.length === 0 && <div className="card p-5 text-sm text-zinc-500">No mine records match this selection.</div>}
    </Section>

    <Section title="Recurring open hazards">
      <div className="card divide-y divide-white/[0.06]">{data?.recurringIssues.length ? data.recurringIssues.map((issue) => <div className="p-4" key={`${issue.mineId}-${issue.issue}-${issue.location}`}><p className="text-sm text-zinc-200">{issue.issue} · {issue.mineName} · {issue.location} <span className="text-zinc-500">({issue.count} open records)</span></p><p className="mt-1 text-xs text-zinc-500">Same mine, category and district during the selected period · {new Date(issue.firstSeen).toLocaleDateString()} – {new Date(issue.lastSeen).toLocaleDateString()}</p><div className="mt-2 text-xs"><EvidenceLinks ids={issue.evidenceIds}/></div></div>) : <p className="p-4 text-sm text-zinc-500">No repeated open hazard groups found in this period.</p>}</div>
    </Section>

    <div className="grid gap-4 xl:grid-cols-2">
      <Section title="Operational anomalies"><p className="mb-2 text-xs text-zinc-500">Flags use comparison rules: inspection creation drops of at least 50%, report counts at least twice the previous period, or closure time increases over 50%.</p><div className="card divide-y divide-white/[0.06]">{data?.anomalies.length ? data.anomalies.map((anomaly) => <div key={`${anomaly.mineId}-${anomaly.metric}`} className="flex gap-3 p-4"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"/><div className="min-w-0"><p className="text-sm text-zinc-200">{anomaly.mineName} · {anomaly.explanation}</p><p className="mt-1 text-xs text-zinc-500">{anomaly.metric.replace(/_/g, ' ')}: {anomaly.value} vs {anomaly.previousValue}</p><div className="mt-1 text-xs"><EvidenceLinks ids={anomaly.evidenceIds || []}/></div></div></div>) : <p className="p-4 text-sm text-zinc-500">No significant changes detected with the available comparison data.</p>}</div></Section>
      <Section title="Data quality / monitoring warnings"><div className="card divide-y divide-white/[0.06]">{data?.dataWarnings.length ? data.dataWarnings.map((warning) => <div key={warning.mineId} className="p-4"><p className="text-xs font-medium tracking-wide text-sky-300">{warning.mineName} · EVIDENCE QUALITY: {warning.evidenceQuality}</p><ul className="mt-2 space-y-1 text-sm text-zinc-400">{warning.warnings.map((message, index) => <li key={index}>ⓘ {message}</li>)}</ul></div>) : <p className="p-4 text-sm text-zinc-500">No monitoring warnings for this period.</p>}</div></Section>
    </div>

    <Section title="Data coverage"><div className="card flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs tracking-wide text-zinc-500">EVIDENCE QUALITY</p><p className={`mt-1 text-sm font-medium ${quality.level === 'HIGH' ? 'text-emerald-300' : quality.level === 'MODERATE' ? 'text-amber-300' : 'text-zinc-300'}`}>{quality.level}</p></div><div className="text-sm text-zinc-400 sm:max-w-[75%]">{quality.reasons.length ? quality.reasons.join(' ') : `Records are present across the selected and previous ${periodDays}-day periods.`}</div></div></Section>

    <Section title="Ask the AI analyst">
      <div className="card p-4"><p className="text-xs text-zinc-500">Analytics above are calculated from mine records. Groq interprets those metrics and evidence only after you request it. It receives mine names, categories, record IDs, and your question; keep personal details out.</p>
        <div className="mt-3 flex flex-wrap gap-2">{suggestions.map((suggestion) => <button key={suggestion} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-400 hover:border-white/20 hover:text-zinc-200" onClick={() => setQuestion(suggestion)}>{suggestion}</button>)}</div>
        <textarea className="input mt-3 min-h-20 w-full resize-y" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={500}/>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row"><button className="btn-primary" disabled={aiLoading || !question.trim()} onClick={() => void runAnalysis()}><BrainCircuit className="h-4 w-4"/>{aiLoading ? 'Analyzing…' : 'Generate AI analysis'}</button><button className="btn-secondary" disabled={!data} onClick={() => setReportVisible((visible) => !visible)}><FileText className="h-4 w-4"/>{reportVisible ? 'Hide governance report' : 'Generate governance report'}</button></div>
      </div>

      {history.length > 0 && <div className="mt-4"><h3 className="mb-2 text-sm font-medium">Recent AI analyses</h3><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{history.map((item) => <article key={item.id} className={`card p-3 ${selectedAnalysisId === item.id ? 'border-sky-400/40' : ''}`}><p className="text-xs text-zinc-300">{new Date(item.requestedAt).toLocaleString()}</p><p className="mt-1 text-xs text-zinc-500">Scope: {item.scope === 'all_mines' ? 'All Mines' : nameFor(item.scope, mines)} · {savedPeriod(item)} days</p><button className="mt-2 text-xs text-sky-400 hover:underline" onClick={() => chooseHistory(item)}>View analysis</button></article>)}</div></div>}

      {analysis && <article className="card mt-4 overflow-hidden">
        <div className="border-b border-white/[0.06] p-4"><p className="text-xs font-medium tracking-wide text-sky-300">AI GOVERNANCE INTERPRETATION</p><p className="mt-1 text-xs text-zinc-500">Scope: {analysisContext?.scope === 'all_mines' ? 'All Mines' : nameFor(analysisContext?.scope || '', mines)} · {analysisContext?.periodDays || periodDays} days · The analytics remain the source of the measures.</p><div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-xs text-zinc-500">Priority</span><span className={`badge ${analysis.priority === 'HIGH' ? 'badge-danger' : analysis.priority === 'ELEVATED' ? 'badge-warning' : ''}`}>{analysis.priority || 'REVIEW'}</span></div></div>
        <div className="space-y-5 p-4">
          <div><h3 className="text-xs font-medium tracking-wide text-zinc-500">WHY THIS SCOPE IS FLAGGED</h3><p className="mt-2 text-sm leading-relaxed text-zinc-200">{analysis.whyThisMineFlagged || analysis.summary}</p></div>
          {generatedFacts.length > 0 && <div><h3 className="text-xs font-medium tracking-wide text-zinc-500">OBSERVED FACTS & EVIDENCE</h3><div className="mt-2 space-y-2">{generatedFacts.map((fact, index) => <div key={`${fact.label}-${index}`} className="rounded-lg border border-white/[0.06] bg-black/10 p-3"><p className="text-sm text-zinc-200">{fact.label}: {fact.value}</p>{fact.evidenceIds?.length > 0 && <div className="mt-2 text-xs"><EvidenceLinks ids={fact.evidenceIds}/></div>}</div>)}</div></div>}
          {analysis.patterns?.length ? <div><h3 className="text-xs font-medium tracking-wide text-zinc-500">DETECTED PATTERNS</h3><ul className="mt-2 space-y-2">{analysis.patterns.map((item, index) => <li key={`${item.pattern}-${index}`} className="rounded-lg border border-white/[0.06] bg-black/10 p-3 text-sm text-zinc-300">{item.pattern}{item.evidenceIds.length > 0 && <div className="mt-2 text-xs"><EvidenceLinks ids={item.evidenceIds}/></div>}</li>)}</ul></div> : null}
          {analysis.interpretation && <div><h3 className="text-xs font-medium tracking-wide text-zinc-500">AI INTERPRETATION</h3><p className="mt-2 text-sm leading-relaxed text-zinc-300">{analysis.interpretation}</p></div>}
          {generatedActions.length > 0 && <div><h3 className="text-xs font-medium tracking-wide text-zinc-500">RECOMMENDED ADMINISTRATIVE REVIEW</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-300">{generatedActions.map((action, index) => <li key={index}>{action}</li>)}</ul></div>}
          {(analysis.dataLimitations?.length || quality.reasons.length) ? <div><h3 className="text-xs font-medium tracking-wide text-zinc-500">DATA LIMITATIONS</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-400">{[...(analysis.dataLimitations || []), ...quality.reasons].map((limitation, index) => <li key={index}>{limitation}</li>)}</ul></div> : null}
        </div>
      </article>}
    </Section>

    {reportVisible && data && <Section title="Governance report"><article className="card space-y-4 p-4"><p className="text-xs text-zinc-500">Structured snapshot · {data.filters.mineId ? selectedMine?.name : 'All Mines'} · Last {periodDays} days · Generated {new Date(data.generatedAt).toLocaleString()}</p><div><h3 className="text-sm font-medium">Risk overview</h3><ul className="mt-1 space-y-1 text-sm text-zinc-400">{data.risks.map((row) => <li key={row.mineId}>{row.mineName}: {row.riskLevel} · score {row.score} · {row.indicators.length} indicator types</li>)}</ul></div><div><h3 className="text-sm font-medium">Recurring issues</h3><p className="mt-1 text-sm text-zinc-400">{data.recurringIssues.length ? data.recurringIssues.map((row) => `${row.mineName}: ${row.issue} (${row.count})`).join(' · ') : 'None detected in the selected period.'}</p></div><div><h3 className="text-sm font-medium">Inspection trend</h3><p className="mt-1 text-sm text-zinc-400">{data.metrics.map((row) => `${row.mineName}: ${row.inspectionCount} current vs ${row.previousInspectionCount} previous-period inspections`).join(' · ')}</p></div><div><h3 className="text-sm font-medium">Corrective actions</h3><p className="mt-1 text-sm text-zinc-400">{summary.overdue} overdue · {data.metrics.reduce((sum, row) => sum + row.completedActionCount, 0)} completed in the selected period.</p></div><div><h3 className="text-sm font-medium">Anomalies and attention</h3><p className="mt-1 text-sm text-zinc-400">{data.anomalies.map((row) => `${row.mineName}: ${row.explanation}`).join(' · ') || 'No significant change detected.'}</p></div><div><h3 className="text-sm font-medium">Data limitations</h3><p className="mt-1 text-sm text-zinc-400">{quality.reasons.join(' ') || `Historical comparison uses the previous ${periodDays}-day period.`}</p></div></article></Section>}
    {loading && <p className="text-sm text-zinc-500">Loading recorded data…</p>}
  </div>;
};
