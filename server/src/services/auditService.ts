import crypto from 'crypto';
import { prisma } from '../db';


export interface AuditPayload {
  recordType: 'SAFETY_REPORT' | 'SHIFT_REPORT' | 'CONTRACT' | 'FIELD_REPORT' | 'GRIEVANCE' | 'INSPECTION' | 'CORRECTIVE_ACTION' | 'SOS_ALERT' | 'INCIDENT' | 'AI_ANALYSIS' | 'COMPLIANCE_EVALUATION' | 'COMPLIANCE_STATUS_CHANGED' | 'COMPLIANCE_RULE_CREATED' | 'COMPLIANCE_RULE_UPDATED';
  recordId: string;
  action: 'CREATED' | 'ESCALATED' | 'STATUS_CHANGED' | 'RESOLVED' | 'VERIFIED' | 'UPDATED';
  performedByRole: string;
  data: Record<string, any>;
}

export class AuditService {
  /**
   * Compute deterministic SHA-256 hash of object/string
   */
  static computeHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Append a new tamper-evident block to the audit hash chain
   */
  static async recordEvent(payload: AuditPayload) {
    try {
      // Find the most recent audit block
      const lastBlock = await prisma.auditBlock.findFirst({
        orderBy: { blockIndex: 'desc' },
      });

      const previousHash = lastBlock ? lastBlock.currentHash : '0000000000000000000000000000000000000000000000000000000000000000';
      const blockIndex = lastBlock ? lastBlock.blockIndex + 1 : 1;
      const timestamp = new Date();

      // Deterministic string representation of data payload
      const sortedDataString = JSON.stringify(payload.data, Object.keys(payload.data).sort());
      const payloadHash = this.computeHash(sortedDataString);

      // Block Hash = SHA-256(previousHash + timestamp + recordType + recordId + action + payloadHash)
      const blockContent = `${previousHash}|${timestamp.toISOString()}|${payload.recordType}|${payload.recordId}|${payload.action}|${payloadHash}`;
      const currentHash = this.computeHash(blockContent);

      const summary = `${payload.action} on ${payload.recordType} [${payload.recordId}] by ${payload.performedByRole}`;

      const block = await prisma.auditBlock.create({
        data: {
          blockIndex,
          previousHash,
          currentHash,
          timestamp,
          recordType: payload.recordType,
          recordId: payload.recordId,
          action: payload.action,
          performedByRole: payload.performedByRole,
          payloadHash,
          payloadSummary: summary,
        },
      });

      return block;
    } catch (err) {
      console.error('AuditService recordEvent error:', err);
      return null;
    }
  }

  /**
   * Verify integrity of a specific record by ID
   */
  static async verifyRecord(recordId: string) {
    // Fetch all audit blocks matching this record
    const blocks = await prisma.auditBlock.findMany({
      where: { recordId },
      orderBy: { blockIndex: 'asc' },
    });

    if (blocks.length === 0) {
      return {
        verified: false,
        reason: 'Record not found in cryptographic audit ledger',
        blocks: [],
      };
    }

    // Also verify the chain integrity up to the latest block
    const allBlocks = await prisma.auditBlock.findMany({
      orderBy: { blockIndex: 'asc' },
    });

    let chainIntact = true;
    let corruptedIndex = -1;

    for (let i = 1; i < allBlocks.length; i++) {
      const prev = allBlocks[i - 1];
      const curr = allBlocks[i];

      if (curr.previousHash !== prev.currentHash) {
        chainIntact = false;
        corruptedIndex = curr.blockIndex;
        break;
      }
    }

    const latestBlockForRecord = blocks[blocks.length - 1];

    return {
      verified: chainIntact,
      recordId,
      recordType: latestBlockForRecord.recordType,
      currentHash: latestBlockForRecord.currentHash,
      previousHash: latestBlockForRecord.previousHash,
      timestamp: latestBlockForRecord.timestamp,
      totalRecordEvents: blocks.length,
      chainLength: allBlocks.length,
      chainIntact,
      corruptedIndex: chainIntact ? null : corruptedIndex,
      blocks,
      architectureNote: 'Tamper-Evident SHA-256 Chained Hash Ledger (Blockchain-Ready Architecture)',
    };
  }

  /**
   * Get the complete chain or recent blocks
   */
  static async getChain(limit = 50) {
    return prisma.auditBlock.findMany({
      orderBy: { blockIndex: 'desc' },
      take: limit,
    });
  }
}
