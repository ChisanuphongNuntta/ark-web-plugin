import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const url = new URL(process.env.DATABASE_URL || '');
if (url.hostname !== 'sandbox-postgres' || url.pathname !== '/iris_sandbox') throw new Error('This script only supports the isolated iris-sandbox database');
const db = new PrismaClient();
try {
  const packs = [
    { slug: 'sandbox-100', name: 'Explorer', priceThb: '35', points: 100n, bonusPoints: 0n },
    { slug: 'sandbox-310', name: 'Voyager', priceThb: '99', points: 300n, bonusPoints: 10n },
    { slug: 'sandbox-525', name: 'Pathfinder', priceThb: '159', points: 500n, bonusPoints: 25n },
    { slug: 'sandbox-1100', name: 'Vanguard', priceThb: '299', points: 1000n, bonusPoints: 100n },
    { slug: 'sandbox-2850', name: 'Ascendant', priceThb: '699', points: 2500n, bonusPoints: 350n },
    { slug: 'sandbox-6000', name: 'Sovereign', priceThb: '1299', points: 5000n, bonusPoints: 1000n },
  ];
  for (const [index, pack] of packs.entries()) await db.paymentPackage.upsert({ where: { slug: pack.slug }, create: { ...pack, sortOrder: index }, update: {} });
  const user = await db.user.upsert({ where: { discordId: 'iris-local-sandbox-test' }, create: { discordId: 'iris-local-sandbox-test', discordUsername: 'IRIS Sandbox Tester', role: 'user' }, update: {} });
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '2h', jwtid: crypto.randomUUID() });
  await db.userSession.create({ data: { userId: user.id, token: crypto.createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 7200000), userAgent: 'isolated-sandbox-test' } });
  // Caller must capture this token securely, never publish it in documentation.
  console.log(JSON.stringify({ userId: user.id, token, packages: packs.length }));
} finally { await db.$disconnect(); }
