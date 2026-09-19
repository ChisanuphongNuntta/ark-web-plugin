import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import pluginCredentialService from '../dist/services/pluginCredential.service.js';
import prisma from '../dist/config/database.js';

async function main() {
  const serverId = Number(process.env.SERVER_ID);
  const configPath = process.env.PLUGIN_CONFIG_PATH;
  const apiUrl = process.env.PLUGIN_API_URL;
  if (!Number.isSafeInteger(serverId) || serverId <= 0 || !configPath || !apiUrl) {
    throw new Error('SERVER_ID, PLUGIN_CONFIG_PATH, and PLUGIN_API_URL are required');
  }

  let server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server && process.env.CREATE_SERVER_IF_MISSING === 'true') {
    const serverName = process.env.SERVER_NAME;
    const serverMap = process.env.SERVER_MAP;
    if (!serverName || !serverMap) throw new Error('SERVER_NAME and SERVER_MAP are required for a new server');
    server = await prisma.server.create({
      data: {
        id: serverId,
        name: serverName,
        map: serverMap,
        // This legacy column is retained for schema compatibility only. Plugin
        // authentication uses the separately encrypted ServerCredential below.
        apiKey: `disabled_${crypto.randomBytes(32).toString('hex')}`,
        isActive: true,
        drainMode: true,
      },
    });
  }
  if (!server) throw new Error(`Server ID ${serverId} not found`);

  const clusterKey = process.env.CLUSTER_KEY;
  if (clusterKey) {
    const cluster = await prisma.cluster.upsert({
      where: { key: clusterKey },
      create: { key: clusterKey, name: process.env.CLUSTER_NAME || clusterKey },
      update: { isActive: true },
    });
    await prisma.server.updateMany({
      where: { id: { in: [1, serverId] } },
      data: { clusterId: cluster.id },
    });
  }

  const parsedUrl = new URL(apiUrl);
  if (parsedUrl.protocol !== 'https:') throw new Error('PLUGIN_API_URL must use HTTPS');
  const allowLocalhostSelfSigned =
    process.env.ALLOW_LOCALHOST_SELF_SIGNED === 'true' &&
    ['localhost', '127.0.0.1', '::1'].includes(parsedUrl.hostname);

  const config = JSON.parse(await readFile(configPath, 'utf8'));
  if (!config.HeartShop || typeof config.HeartShop !== 'object') {
    throw new Error('Plugin config is missing the HeartShop object');
  }

  const issued = await pluginCredentialService.issue(serverId, 'cluster-plugin-rollout');
  const temporaryPath = `${configPath}.tmp-${process.pid}`;
  try {
    config.HeartShop.ApiUrl = apiUrl.replace(/\/+$/, '');
    config.HeartShop.ApiKey = issued.secret;
    config.HeartShop.KeyId = issued.keyId;
    config.HeartShop.ServerId = serverId;
    config.HeartShop.Security = {
      ...(config.HeartShop.Security || {}),
      AllowInvalidCertificates: allowLocalhostSelfSigned,
    };

    await writeFile(temporaryPath, `${JSON.stringify(config, null, 4)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    await rename(temporaryPath, configPath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    await pluginCredentialService.revoke(issued.keyId).catch(() => undefined);
    throw error;
  }

  console.log(JSON.stringify({ success: true, serverId, keyId: issued.keyId }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
