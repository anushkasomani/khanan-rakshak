import React, { useRef, useState } from 'react';
import { Camera, Plus, X } from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { FieldReport, FieldReportType, Mine, ReportTable } from '../../types';
import { compressImage } from '../../image';
import { Modal, Field } from '../ui';
import { REPORT_TYPES, TABLE_TEMPLATES } from './templates';

const MAX_PHOTOS = 6;

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Editable grid: rename columns, add or remove rows and columns. Scrolls sideways on a phone. */
export const TableEditor: React.FC<{ value: ReportTable; onChange: (t: ReportTable) => void }> = ({ value, onChange }) => {
  const setCell = (r: number, c: number, v: string) => onChange({ ...value, rows: value.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) });
  const setColumn = (c: number, v: string) => onChange({ ...value, columns: value.columns.map((x, j) => (j === c ? v : x)) });
  const addRow = () => onChange({ ...value, rows: [...value.rows, value.columns.map(() => '')] });
  const removeRow = (r: number) => onChange({ ...value, rows: value.rows.filter((_, i) => i !== r) });
  const addColumn = () => onChange({ columns: [...value.columns, `Column ${value.columns.length + 1}`], rows: value.rows.map((row) => [...row, '']) });
  const removeColumn = (c: number) =>
    value.columns.length > 1 && onChange({ columns: value.columns.filter((_, j) => j !== c), rows: value.rows.map((row) => row.filter((_, j) => j !== c)) });

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-white/[0.03]">
              {value.columns.map((col, c) => (
                <th key={c} className="p-1 min-w-[8rem] border-b border-white/10">
                  <div className="flex items-center gap-1">
                    <input
                      value={col}
                      onChange={(e) => setColumn(c, e.target.value)}
                      className="w-full bg-transparent px-2 py-1 text-xs font-medium text-zinc-300 rounded focus:outline-none focus:bg-white/[0.05]"
                      aria-label={`Column ${c + 1} name`}
                    />
                    {value.columns.length > 1 && (
                      <button type="button" onClick={() => removeColumn(c)} className="p-1 text-zinc-600 hover:text-zinc-300" aria-label={`Remove column ${col}`}>
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </th>
              ))}
              <th className="w-8 border-b border-white/10" />
            </tr>
          </thead>
          <tbody>
            {value.rows.map((row, r) => (
              <tr key={r} className="border-b border-white/[0.05] last:border-0">
                {row.map((cell, c) => (
                  <td key={c} className="p-1">
                    <input
                      value={cell}
                      onChange={(e) => setCell(r, c, e.target.value)}
                      className="w-full bg-white/[0.03] px-2 py-1.5 text-zinc-200 rounded focus:outline-none focus:bg-white/[0.07]"
                      aria-label={`${value.columns[c] || `Column ${c + 1}`}, row ${r + 1}`}
                    />
                  </td>
                ))}
                <td className="w-8 text-center">
                  <button type="button" onClick={() => removeRow(r)} className="p-1 text-zinc-600 hover:text-zinc-300" aria-label={`Remove row ${r + 1}`}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={addRow} className="btn-secondary h-8 px-3">
          <Plus className="w-4 h-4" />
          Row
        </button>
        <button type="button" onClick={addColumn} className="btn-secondary h-8 px-3" disabled={value.columns.length >= 12}>
          <Plus className="w-4 h-4" />
          Column
        </button>
      </div>
    </div>
  );
};

/** Write or edit a report. Text, a table and photos are each optional; at least one is needed. */
export const ReportEditor: React.FC<{ report?: FieldReport | null; mines: Mine[]; onClose: () => void; onSaved: (r: FieldReport) => void }> = ({
  report,
  mines,
  onClose,
  onSaved,
}) => {
  const { user } = useAuth();
  const [reportType, setReportType] = useState<FieldReportType>(report?.reportType || (user?.specialistType === 'SURVEYOR' ? 'SURVEY' : 'BLAST'));
  const [title, setTitle] = useState(report?.title || '');
  const [workDate, setWorkDate] = useState(report?.workDate || today());
  const [districtId, setDistrictId] = useState(report?.districtId || user?.districtId || '');
  const [body, setBody] = useState(report?.body || '');
  const [table, setTable] = useState<ReportTable | null>(report?.table || null);
  const [photos, setPhotos] = useState<string[]>(report?.photos || []);
  const [phase, setPhase] = useState<'idle' | 'photos' | 'sending'>('idle');
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const districts = mines.find((m) => m.id === (report?.mineId || user?.mineId))?.districts || [];
  const templates = TABLE_TEMPLATES.filter((t) => t.forTypes === 'ALL' || t.forTypes.includes(reportType));

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    setPhase('photos');
    try {
      const room = MAX_PHOTOS - photos.length;
      const compressed = await Promise.all([...files].slice(0, room).map((f) => compressImage(f)));
      setPhotos((p) => [...p, ...compressed]);
      if (files.length > room) setError(`Only ${MAX_PHOTOS} photos can be attached.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPhase('idle');
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3) return setError('Give the report a title.');
    const filled = table && table.rows.some((r) => r.some((c) => c.trim()));
    if (!body.trim() && !filled && !photos.length) return setError('Add some text, a table or a photo.');
    setError(null);
    setPhase('sending');
    const data = { reportType, title, workDate, districtId: districtId || null, body, table: filled ? table : null, photos };
    try {
      onSaved(report ? await api.updateFieldReport(report.id, data) : await api.submitFieldReport(data));
    } catch (err: any) {
      setError(err.message);
      setPhase('idle');
    }
  };

  return (
    <Modal title={report ? `Edit ${report.id}` : 'New report'} onClose={onClose} width="lg">
      <form onSubmit={submit} className="p-5 space-y-5">
        {report?.status === 'RETURNED' && report.reviewNote && (
          <div className="card-warning px-3 py-2.5">
            <p className="text-xs text-amber-300">Sent back by {report.reviewedByName}</p>
            <p className="mt-1 text-sm text-zinc-200">{report.reviewNote}</p>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Kind of report">
            <select value={reportType} onChange={(e) => setReportType(e.target.value as FieldReportType)} className="input">
              {(Object.keys(REPORT_TYPES) as FieldReportType[]).map((t) => (
                <option key={t} value={t}>
                  {REPORT_TYPES[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date of the work">
            <input type="date" value={workDate} max={today()} onChange={(e) => setWorkDate(e.target.value)} className="input" />
          </Field>
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="e.g. Blast report, VII OB bench" />
          </Field>
          <Field label="Where">
            <select value={districtId} onChange={(e) => setDistrictId(e.target.value)} className="input">
              <option value="">Whole mine / not one district</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Notes (optional)">
          <textarea
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="input resize-y"
            placeholder="What was done, anything unusual, misfires, follow-up needed"
          />
        </Field>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="label !mb-0">Table (optional)</p>
            {table && (
              <button type="button" onClick={() => setTable(null)} className="text-xs text-zinc-500 hover:text-zinc-200">
                Remove table
              </button>
            )}
          </div>
          {table ? (
            <TableEditor value={table} onChange={setTable} />
          ) : (
            <div className="flex flex-wrap gap-2">
              {templates.map((t) => (
                <button key={t.key} type="button" onClick={() => setTable(t.make())} className="btn-secondary h-8 px-3">
                  <Plus className="w-4 h-4" />
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="label">Photos (optional)</p>
          <p className="-mt-0.5 mb-2 text-xs text-zinc-500">A photo of the paper form works too.</p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {photos.map((src, i) => (
              <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-white/10">
                <img src={src} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 flex items-center justify-center"
                  aria-label={`Remove photo ${i + 1}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={phase !== 'idle'}
                className="aspect-square rounded-lg border border-dashed border-white/15 flex flex-col items-center justify-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 hover:border-white/30 transition-colors"
              >
                <Camera className="w-5 h-5" />
                {phase === 'photos' ? 'Processing…' : 'Add'}
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addPhotos(e.target.files)} />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={phase !== 'idle'} className="btn-primary">
            {phase === 'sending' ? 'Submitting…' : report ? 'Save and resubmit' : 'Submit for review'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
