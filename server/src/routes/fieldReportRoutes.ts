import { Router, Response } from 'express';
import { AuthenticatedRequest, AuthUser, canSeeMine, mineFilter, actorRole } from '../middleware/auth';
import { roleLevel, ROLE_LEVEL } from '../roles';
import { isDateString, indiaDate } from '../geo';
import { currentShift } from '../shifts';
import { savePhoto, isStoredPhoto, PhotoError } from '../services/photoStorage';
import { AuditService } from '../services/auditService';
import { prisma } from '../db';

const router = Router();

export const REPORT_TYPES = ['BLAST', 'SURVEY', 'WINDING', 'ELECTRICAL', 'MAGAZINE', 'OTHER'];
const MAX_PHOTOS = 6;
const MAX_ROWS = 200;
const MAX_COLUMNS = 12;

const INCLUDE = {
  mine: { select: { id: true, name: true } },
  district: { select: { id: true, name: true } },
  author: { select: { id: true, name: true, role: true, specialistType: true, phone: true, contract: { select: { contractor: { select: { name: true } } } } } },
} as const;

const parse = <T>(s: string | null | undefined, fallback: T): T => {
  try {
    return s ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
};

type Row = NonNullable<Awaited<ReturnType<typeof load>>>;
const load = (id: string) => prisma.fieldReport.findUnique({ where: { id }, include: INCLUDE });
const present = ({ tableData, photos, ...r }: Row, u?: AuthUser) => ({
  ...r,
  table: parse<{ columns: string[]; rows: string[][] } | null>(tableData, null),
  photos: parse<string[]>(photos, []),
  ...(u ? { canReview: canReview(u, r) } : {}),
});

/** Anyone at the mine except workers writes reports; DGMS reads them. */
const canWrite = (u: AuthUser) => !!u.role && u.role !== 'WORKER' && u.role !== 'DGMS' && !!u.mineId;
/** The Overman or anyone above in the mine's chain signs a report off; never its author. */
const canReview = (u: AuthUser, r: { authorId: string; status: string }) =>
  r.status === 'SUBMITTED' && u.id !== r.authorId && u.role !== 'DGMS' && (u.isAdmin || roleLevel(u.role) >= ROLE_LEVEL.OVERMAN);

async function notify(userIds: string[], title: string, message: string, type = 'INFO') {
  const ids = [...new Set(userIds)];
  if (ids.length) await prisma.notification.createMany({ data: ids.map((userId) => ({ userId, title, message, type })) });
}

/** Cleans the text / table / photos part of a report. At least one of them must be filled in. */
async function parseContent(body: any): Promise<{ data?: { body: string | null; tableData: string | null; photos: string[] }; error?: string }> {
  const text = String(body?.body || '').trim();
  if (text.length > 10000) return { error: 'Keep the text under 10,000 characters.' };

  let tableData: string | null = null;
  if (body?.table) {
    const columns = Array.isArray(body.table.columns) ? body.table.columns.map((c: unknown) => String(c ?? '').trim().slice(0, 80)) : [];
    const rows = Array.isArray(body.table.rows) ? body.table.rows : [];
    if (!columns.length || columns.length > MAX_COLUMNS) return { error: `A table needs between 1 and ${MAX_COLUMNS} columns.` };
    if (rows.length > MAX_ROWS) return { error: `A table can have at most ${MAX_ROWS} rows.` };
    const clean = rows
      .map((r: unknown) => columns.map((_: string, i: number) => String((Array.isArray(r) ? r[i] : '') ?? '').trim().slice(0, 200)))
      .filter((r: string[]) => r.some(Boolean));
    if (clean.length) tableData = JSON.stringify({ columns, rows: clean });
  }

  const incoming = Array.isArray(body?.photos) ? body.photos : [];
  if (incoming.length > MAX_PHOTOS) return { error: `Add at most ${MAX_PHOTOS} photos.` };
  const photos: string[] = [];
  try {
    // Photos already uploaded (when editing) are kept as they are; new ones arrive as data URLs.
    for (const p of incoming) photos.push(isStoredPhoto(p) ? p : await savePhoto(p, 'reports'));
  } catch (e) {
    if (e instanceof PhotoError) return { error: e.message };
    throw e;
  }

  if (!text && !tableData && !photos.length) return { error: 'Add some text, a table or a photo.' };
  return { data: { body: text || null, tableData, photos } };
}

// GET /api/field-reports?mineId=&type=&status=&mine=1  (authors see their own; Sirdar and above see the mine's)
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const u = req.user!;
  const own = req.query.mine === '1' || roleLevel(u.role) < ROLE_LEVEL.SIRDAR;
  if (!u.isAdmin && !u.role) return res.json([]);
  const scope = mineFilter(req, req.query.mineId);
  const rows = await prisma.fieldReport.findMany({
    where: {
      ...(own ? { authorId: u.id } : scope ? { mineId: scope } : {}),
      ...(REPORT_TYPES.includes(String(req.query.type)) ? { reportType: String(req.query.type) } : {}),
      ...(['SUBMITTED', 'REVIEWED', 'RETURNED'].includes(String(req.query.status)) ? { status: String(req.query.status) } : {}),
    },
    include: INCLUDE,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return res.json(rows.map((r) => present(r, u)));
});

// GET /api/field-reports/:id
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const u = req.user!;
  const r = await load(String(req.params.id));
  if (!r || !canSeeMine(req, r.mineId) || (roleLevel(u.role) < ROLE_LEVEL.SIRDAR && r.authorId !== u.id && !u.isAdmin)) {
    return res.status(404).json({ error: 'Report not found.' });
  }
  return res.json(present(r, u));
});

async function parseHeader(req: AuthenticatedRequest, mineId: string) {
  const { reportType, title, workDate, districtId } = req.body || {};
  if (!REPORT_TYPES.includes(reportType)) return { error: 'Choose what kind of report this is.' };
  const t = String(title || '').trim();
  if (t.length < 3) return { error: 'Give the report a title.' };
  if (t.length > 120) return { error: 'Keep the title under 120 characters.' };
  const date = isDateString(workDate) ? workDate : indiaDate();
  if (districtId) {
    const d = await prisma.district.findUnique({ where: { id: String(districtId) } });
    if (!d || d.mineId !== mineId) return { error: 'That district is not part of your mine.' };
  }
  return { header: { reportType, title: t, workDate: date, districtId: districtId || null } };
}

// POST /api/field-reports  { reportType, title, workDate, districtId?, body?, table?, photos? }
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const u = req.user!;
  if (!canWrite(u)) return res.status(403).json({ error: 'Only mine staff can submit reports.' });
  const { header, error } = await parseHeader(req, u.mineId!);
  if (error) return res.status(400).json({ error });
  const content = await parseContent(req.body);
  if (content.error) return res.status(400).json({ error: content.error });

  const id = `RPT-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
  const created = await prisma.fieldReport.create({
    data: { id, mineId: u.mineId!, authorId: u.id, ...header!, ...content.data!, photos: JSON.stringify(content.data!.photos) },
    include: INCLUDE,
  });
  const block = await AuditService.recordEvent({
    recordType: 'FIELD_REPORT',
    recordId: id,
    action: 'CREATED',
    performedByRole: actorRole(req),
    data: { id, type: created.reportType, title: created.title, workDate: created.workDate, body: created.body, table: created.tableData, photos: content.data!.photos.length },
  });
  if (block) await prisma.fieldReport.update({ where: { id }, data: { recordHash: block.currentHash } });

  // The Overman on shift, and the officers and managers who look after this kind of work.
  const { shift } = currentShift(new Date(), u.shiftStartHour);
  const readers = await prisma.user.findMany({
    where: {
      mineId: u.mineId!,
      status: 'APPROVED',
      id: { not: u.id },
      OR: [
        { role: 'OVERMAN', shift },
        { role: { in: ['ASSISTANT_MANAGER', 'MINE_MANAGER'] } },
        { role: 'OFFICER', officerType: created.reportType === 'BLAST' || created.reportType === 'MAGAZINE' ? 'BLASTING' : created.reportType === 'SURVEY' ? 'SURVEY' : 'SAFETY' },
      ],
    },
    select: { id: true },
  });
  await notify(readers.map((r) => r.id), `New report to review: ${created.title}`, `${u.name}${created.district ? `, ${created.district.name}` : ''}`);
  return res.status(201).json(present({ ...created, recordHash: block?.currentHash ?? null }, u));
});

// PATCH /api/field-reports/:id  (the author edits it while it waits for review, or after it was sent back)
router.patch('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const u = req.user!;
  const existing = await load(String(req.params.id));
  if (!existing || existing.authorId !== u.id) return res.status(404).json({ error: 'Report not found.' });
  if (existing.status === 'REVIEWED') return res.status(409).json({ error: 'This report has been reviewed and can no longer be changed.' });
  const { header, error } = await parseHeader(req, existing.mineId);
  if (error) return res.status(400).json({ error });
  const content = await parseContent(req.body);
  if (content.error) return res.status(400).json({ error: content.error });

  const updated = await prisma.fieldReport.update({
    where: { id: existing.id },
    data: { ...header!, ...content.data!, photos: JSON.stringify(content.data!.photos), status: 'SUBMITTED' },
    include: INCLUDE,
  });
  await AuditService.recordEvent({
    recordType: 'FIELD_REPORT',
    recordId: existing.id,
    action: 'UPDATED',
    performedByRole: actorRole(req),
    data: { id: existing.id, resubmitted: existing.status === 'RETURNED', body: updated.body, table: updated.tableData, photos: content.data!.photos.length },
  });
  if (existing.status === 'RETURNED' && existing.reviewedByName) {
    const reviewer = await prisma.user.findFirst({ where: { name: existing.reviewedByName, mineId: existing.mineId }, select: { id: true } });
    if (reviewer) await notify([reviewer.id], `Report resubmitted: ${updated.title}`, `${u.name} made the changes you asked for.`);
  }
  return res.json(present(updated, u));
});

// POST /api/field-reports/:id/review  { decision: REVIEWED | RETURNED, note }
router.post('/:id/review', async (req: AuthenticatedRequest, res: Response) => {
  const u = req.user!;
  const existing = await load(String(req.params.id));
  if (!existing || !canSeeMine(req, existing.mineId)) return res.status(404).json({ error: 'Report not found.' });
  if (!canReview(u, existing)) return res.status(403).json({ error: 'Only the Overman or someone above can review this, and not its author.' });
  const { decision } = req.body || {};
  const note = String(req.body?.note || '').trim();
  if (decision !== 'REVIEWED' && decision !== 'RETURNED') return res.status(400).json({ error: 'Mark it reviewed or send it back.' });
  if (decision === 'RETURNED' && note.length < 3) return res.status(400).json({ error: 'Say what needs to change.' });

  const updated = await prisma.fieldReport.update({
    where: { id: existing.id },
    data: { status: decision, reviewedByName: u.name, reviewedAt: new Date(), reviewNote: note || null },
    include: INCLUDE,
  });
  await AuditService.recordEvent({
    recordType: 'FIELD_REPORT',
    recordId: existing.id,
    action: decision === 'REVIEWED' ? 'VERIFIED' : 'STATUS_CHANGED',
    performedByRole: actorRole(req),
    data: { id: existing.id, decision, by: u.name, note: note || null },
  });
  await notify(
    [existing.authorId],
    decision === 'REVIEWED' ? `Report reviewed: ${existing.title}` : `Report sent back: ${existing.title}`,
    decision === 'REVIEWED' ? `${u.name} reviewed it.${note ? ` ${note}` : ''}` : `${u.name}: ${note}`,
    decision === 'REVIEWED' ? 'INFO' : 'WARNING'
  );
  return res.json(present(updated, u));
});

export default router;
