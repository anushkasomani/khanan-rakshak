import { PrismaClient } from '@prisma/client';

/** One shared client for the whole server. SQLite allows only one writer at a time, so separate clients per file just add lock contention. */
export const prisma = new PrismaClient();
