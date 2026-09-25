import 'dotenv/config';
import './asyncErrors';
import path from 'path';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes';
import mineRoutes from './routes/mineRoutes';
import safetyReportRoutes from './routes/safetyReportRoutes';
import grievanceRoutes from './routes/grievanceRoutes';
import sosRoutes from './routes/sosRoutes';
import inspectionRoutes from './routes/inspectionRoutes';
import correctiveActionRoutes from './routes/correctiveActionRoutes';
import incidentRoutes from './routes/incidentRoutes';
import complianceRoutes from './routes/complianceRoutes';
import auditRoutes from './routes/auditRoutes';
import recognitionRoutes from './routes/recognitionRoutes';
import notificationRoutes from './routes/notificationRoutes';
import adminRoutes from './routes/adminRoutes';
import attendanceRoutes from './routes/attendanceRoutes';
import escalationRoutes from './routes/escalationRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import shiftRoutes from './routes/shiftRoutes';
import contractRoutes from './routes/contractRoutes';
import fieldReportRoutes from './routes/fieldReportRoutes';
import governanceRoutes from './routes/governanceRoutes';
import statutoryComplianceRoutes from './routes/statutoryComplianceRoutes';
import { authenticate, requireApproved, requireAdmin } from './middleware/auth';
import { servePhoto } from './services/photoStorage';


const app = express();
const PORT = process.env.PORT || 5002;
// Hosts put a proxy in front; this makes req.ip and https detection correct.
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health Check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ONLINE',
    service: 'MineSafe AI Enterprise Safety & Compliance Engine',
    version: '2.4.0',
    cryptoVerification: 'SHA-256 Chained Ledger Active',
    timestamp: new Date().toISOString()
  });
});

// Mount Routes. Everything except auth requires a signed-in, admin-approved account.
const approved = [authenticate, requireApproved];
// Uploaded photos. Ids are random UUIDs; <img> tags can't send the auth header, so these are served without it.
app.get('/api/uploads/:id', servePhoto);
app.use('/api/auth', authRoutes);
app.use('/api/admin/compliance', ...approved, requireAdmin, statutoryComplianceRoutes);
app.use('/api/admin', ...approved, requireAdmin, adminRoutes);
app.use('/api/admin/governance', ...approved, requireAdmin, governanceRoutes);
app.use('/api/mines', ...approved, mineRoutes);
app.use('/api/safety-reports', ...approved, safetyReportRoutes);
app.use('/api/grievances', ...approved, grievanceRoutes);
app.use('/api/sos', ...approved, sosRoutes);
app.use('/api/inspections', ...approved, inspectionRoutes);
app.use('/api/corrective-actions', ...approved, correctiveActionRoutes);
app.use('/api/incidents', ...approved, incidentRoutes);
app.use('/api/compliance', ...approved, complianceRoutes);
app.use('/api/audit', ...approved, auditRoutes);
app.use('/api/recognition', ...approved, recognitionRoutes);
app.use('/api/notifications', ...approved, notificationRoutes);
app.use('/api/attendance', ...approved, attendanceRoutes);
app.use('/api/escalations', ...approved, escalationRoutes);
app.use('/api/dashboard', ...approved, dashboardRoutes);
app.use('/api/shifts', ...approved, shiftRoutes);
app.use('/api/contracts', ...approved, contractRoutes);
app.use('/api/field-reports', ...approved, fieldReportRoutes);

// Global Error Handler
// Details go to the server log, never to the browser (they can include file paths and query text).
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(`Error on ${req.method} ${req.originalUrl}:`, err);
  if (res.headersSent) return;
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'That upload is too large.' });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request was not valid JSON.' });
  if (['P1001', 'P1002', 'P1008', 'P1017', 'P2024'].includes(err?.code)) {
    return res.status(503).json({ error: 'The database is busy. Try again in a moment.' });
  }
  return res.status(500).json({ error: 'Something went wrong on the server. Try again.' });
});

// In production the same server hosts the built web app (client/dist), so the whole thing is one service.
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(path.join(CLIENT_DIST, 'index.html'))) {
  app.use(express.static(CLIENT_DIST, { index: false, maxAge: '1h' }));
  // Any other non-API path is a page of the single-page app.
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🛡️  MineSafe AI Backend API running on port ${PORT}`);
  console.log(`⚡  Tamper-Evident SHA-256 Audit Chain Active`);
  console.log(`====================================================`);
});
