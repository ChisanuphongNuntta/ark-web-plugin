/**
 * Issue / rotate / revoke a signed-plugin credential ({ keyId, secret }) for a server.
 *
 * Usage (run from backend/):
 *   tsx scripts/issue-plugin-credential.ts issue   <serverId> [label]
 *   tsx scripts/issue-plugin-credential.ts rotate  <serverId> <oldKeyId> [label]
 *   tsx scripts/issue-plugin-credential.ts revoke  <keyId>
 *
 * The plaintext HMAC secret is printed ONCE at issuance. Copy it into the plugin config; it is
 * stored encrypted-at-rest and is not recoverable in plaintext afterwards. The keyId travels on
 * the wire (X-Plugin-Key-Id) and is safe to log.
 */
import prisma from '../src/config/database.js';
import pluginCredentialService from '../src/services/pluginCredential.service.js';

async function main() {
  const [action, ...rest] = process.argv.slice(2);

  try {
    if (action === 'issue') {
      const serverId = Number(rest[0]);
      if (!serverId) throw new Error('serverId is required');
      const issued = await pluginCredentialService.issue(serverId, rest[1]);
      console.log('Issued signed-plugin credential:');
      console.log(`  serverId:         ${issued.serverId}`);
      console.log(`  X-Plugin-Key-Id:  ${issued.keyId}`);
      console.log(`  HMAC secret:      ${issued.secret}   <-- copy now, not shown again`);
    } else if (action === 'rotate') {
      const serverId = Number(rest[0]);
      const oldKeyId = rest[1];
      if (!serverId || !oldKeyId) throw new Error('serverId and oldKeyId are required');
      const issued = await pluginCredentialService.rotate(serverId, oldKeyId, rest[2]);
      console.log('Rotated. New credential (old keyId revoked):');
      console.log(`  X-Plugin-Key-Id:  ${issued.keyId}`);
      console.log(`  HMAC secret:      ${issued.secret}   <-- copy now, not shown again`);
    } else if (action === 'revoke') {
      const keyId = rest[0];
      if (!keyId) throw new Error('keyId is required');
      await pluginCredentialService.revoke(keyId);
      console.log(`Revoked keyId: ${keyId}`);
    } else {
      console.log('Usage: issue <serverId> [label] | rotate <serverId> <oldKeyId> [label] | revoke <keyId>');
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
