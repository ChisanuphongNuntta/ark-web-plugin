import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import walletService from './wallet.service.js';

export const legacySteamHash = (steamId: string) =>
  crypto.createHash('sha256').update(`steam:${steamId}`).digest('hex');

export async function claimLegacySteamBalance(
  tx: Prisma.TransactionClient,
  userId: string,
  steamId: string,
): Promise<bigint> {
  const claim = await tx.legacyBalanceClaim.findUnique({
    where: {
      provider_externalIdHash: {
        provider: 'arkshop-steam',
        externalIdHash: legacySteamHash(steamId),
      },
    },
  });
  if (!claim || claim.status !== 'pending' || claim.amount <= 0n) return 0n;

  const reserved = await tx.legacyBalanceClaim.updateMany({
    where: { id: claim.id, status: 'pending', claimedByUserId: null },
    data: { status: 'claimed', claimedByUserId: userId, claimedAt: new Date() },
  });
  if (reserved.count !== 1) return 0n;

  await walletService.creditUser(
    userId,
    claim.amount,
    `legacy-balance-claim:${claim.id}`,
    'legacy_balance_claim',
    claim.id,
    tx,
    // Replay-safe: the claim row is reserved pending -> claimed above in the same transaction.
    { referenceType: 'legacy_balance_claim', description: 'Legacy ArkShop balance claim' },
  );
  return claim.amount;
}
