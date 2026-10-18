import { PrismaClient } from '@prisma/client';
import { installAfterCommitHooks } from '../realtime/afterCommit.js';

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma = global.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Interactive transactions get a post-commit hook scope so realtime events (wallet/order/
// delivery) are emitted only after the surrounding transaction commits. Idempotent.
installAfterCommitHooks(prisma);

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export default prisma;
