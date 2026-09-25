import { Router } from 'express';
import { requireAdmin } from '../middleware/auth';
import { AuditService } from '../services/auditService';
import { prisma } from '../db';

const router = Router();

// GET /api/audit/blocks (Chained Ledger Explorer)
router.get('/blocks', async (req, res) => {
  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
  const blocks = await AuditService.getChain(limit);
  return res.json(blocks);
});

// GET /api/audit/verify/:recordId (Cryptographic Integrity Verification)
router.get('/verify/:recordId', async (req, res) => {
  const { recordId } = req.params;
  const result = await AuditService.verifyRecord(recordId);
  return res.json(result);
});

// POST /api/audit/simulate-tamper (Demonstration utility for live testing integrity detection)
router.post('/simulate-tamper', requireAdmin, async (req, res) => {
  try {
    const { blockIndex } = req.body;
    const targetIndex = blockIndex ? parseInt(String(blockIndex), 10) : 2;

    const block = await prisma.auditBlock.findUnique({
      where: { blockIndex: targetIndex }
    });

    if (!block) {
      return res.status(404).json({ error: `Audit block #${targetIndex} not found to tamper` });
    }

    // Tamper the hash by altering 4 characters
    const tamperedHash = 'DEAD' + block.currentHash.substring(4);
    await prisma.auditBlock.update({
      where: { blockIndex: targetIndex },
      data: { currentHash: tamperedHash }
    });

    return res.json({
      success: true,
      message: `Simulated unauthorized tamper on Block #${targetIndex}. Chain linkage is now broken!`,
      tamperedBlockIndex: targetIndex
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/audit/repair-chain (Restore integrity after simulation)
router.post('/repair-chain', requireAdmin, async (_req, res) => {
  try {
    // Re-seed audit blocks cleanly
    const blocks = await prisma.auditBlock.findMany({ orderBy: { blockIndex: 'asc' } });
    if (blocks.length > 0) {
      let prevHash = '0000000000000000000000000000000000000000000000000000000000000000';
      for (const b of blocks) {
        const blockContent = `${prevHash}|${b.timestamp.toISOString()}|${b.recordType}|${b.recordId}|${b.action}|${b.payloadHash}`;
        const correctHash = AuditService.computeHash(blockContent);
        await prisma.auditBlock.update({
          where: { id: b.id },
          data: { previousHash: prevHash, currentHash: correctHash }
        });
        prevHash = correctHash;
      }
    }
    return res.json({ success: true, message: 'Audit chain integrity restored and re-sealed successfully.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
