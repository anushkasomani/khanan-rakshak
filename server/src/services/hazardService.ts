import { prisma } from '../db';
import { AuditService } from './auditService';

/** Closes a hazard once someone above the fixer has confirmed the fix, and credits the reporter once. */
export async function resolveHazard(id: string, by: { name: string; role: string }, note: string | null) {
  const existing = await prisma.safetyReport.findUnique({ where: { id } });
  if (!existing || existing.status === 'RESOLVED') return { updated: existing, awardedPoints: 0 };

  const updated = await prisma.safetyReport.update({
    where: { id },
    data: { status: 'RESOLVED', verifiedByName: by.name, verifiedAt: new Date(), verifyNote: note },
  });

  let awardedPoints = 0;
  if (existing.reporterId && !existing.rewardPointsAwarded) {
    awardedPoints = existing.severity === 'CRITICAL' ? 30 : existing.severity === 'HIGH' ? 20 : 10;
    await prisma.$transaction([
      prisma.user.update({ where: { id: existing.reporterId }, data: { points: { increment: awardedPoints } } }),
      prisma.recognitionPoint.create({
        data: {
          userId: existing.reporterId,
          pointsAwarded: awardedPoints,
          reason: `Verified ${existing.severity} hazard report: ${existing.id} (${existing.category})`,
          verifiedBy: by.name,
        },
      }),
      prisma.safetyReport.update({ where: { id }, data: { rewardPointsAwarded: true } }),
      prisma.notification.create({
        data: {
          userId: existing.reporterId,
          title: `Your hazard report was fixed (+${awardedPoints} points)`,
          message: `${existing.id} was fixed and checked by ${by.name}.`,
          type: 'RECOGNITION',
        },
      }),
    ]);
  }

  await AuditService.recordEvent({
    recordType: 'SAFETY_REPORT',
    recordId: id,
    action: 'RESOLVED',
    performedByRole: by.role,
    data: { id, fixedBy: existing.fixedByName, verifiedBy: by.name, note, pointsGranted: awardedPoints },
  });
  return { updated, awardedPoints };
}
