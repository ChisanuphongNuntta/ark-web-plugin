/**
 * READ-ONLY export of every product_type='dino' row (plus categories) for
 * offline plan generation. Only SELECTs; safe against production.
 *
 *   npx tsx scripts/dino-catalog/export-products.ts > /tmp/dino-products.json
 */
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const products = await prisma.product.findMany({
      where: { productType: 'dino' },
      include: { category: { select: { id: true, name: true } } },
      orderBy: { id: 'asc' },
    });
    const categories = await prisma.category.findMany({ orderBy: { id: 'asc' } });
    process.stdout.write(JSON.stringify({ exportedAt: new Date().toISOString(), products, categories }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
