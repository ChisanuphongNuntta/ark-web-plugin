import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create categories sequentially to ensure correct autoincrement sequence and IDs
  const categoryData = [
    {
      id: 1,
      name: 'Weapons',
      description: 'Powerful weapons for your survival',
      icon: '⚔️',
      sortOrder: 1,
    },
    {
      id: 2,
      name: 'Armor',
      description: 'Protect yourself from dangers',
      icon: '🛡️',
      sortOrder: 2,
    },
    {
      id: 3,
      name: 'Resources',
      description: 'Building and crafting materials',
      icon: '📦',
      sortOrder: 3,
    },
    {
      id: 4,
      name: 'Creatures',
      description: 'Tamed creatures and eggs',
      icon: '🦖',
      sortOrder: 4,
    },
    {
      id: 5,
      name: 'Kits',
      description: 'Starter and special kits',
      icon: '🎁',
      sortOrder: 5,
    },
  ];

  const categories = [];
  for (const cat of categoryData) {
    const created = await prisma.category.upsert({
      where: { id: cat.id },
      update: {},
      create: cat,
    });
    categories.push(created);
  }

  console.log(`✅ Created ${categories.length} categories`);

  // Create sample products
  const products = await Promise.all([
    prisma.product.upsert({
      where: { id: 1 },
      update: {},
      create: {
        categoryId: 1,
        name: 'Ascendant Longneck Rifle',
        description: 'High quality longneck rifle with excellent damage',
        price: 500,
        itemBlueprint: 'Blueprint\'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItem_WeaponOneShotRifle.PrimalItem_WeaponOneShotRifle\'',
        quantity: 1,
        quality: 5,
        isBlueprint: false,
        isFeatured: true,
      },
    }),
    prisma.product.upsert({
      where: { id: 2 },
      update: {},
      create: {
        categoryId: 1,
        name: 'Ascendant Compound Bow',
        description: 'Silent and deadly compound bow',
        price: 400,
        itemBlueprint: 'Blueprint\'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItem_WeaponCompoundBow.PrimalItem_WeaponCompoundBow\'',
        quantity: 1,
        quality: 5,
        isBlueprint: false,
        isFeatured: true,
      },
    }),
    prisma.product.upsert({
      where: { id: 3 },
      update: {},
      create: {
        categoryId: 2,
        name: 'Ascendant Flak Armor Set',
        description: 'Complete flak armor set (5 pieces)',
        price: 800,
        itemBlueprint: 'Blueprint\'/Game/PrimalEarth/CoreBlueprints/Items/Armor/Metal/PrimalItemArmor_MetalChest.PrimalItemArmor_MetalChest\'',
        quantity: 5,
        quality: 5,
        isBlueprint: false,
        isFeatured: true,
      },
    }),
    prisma.product.upsert({
      where: { id: 4 },
      update: {},
      create: {
        categoryId: 3,
        name: 'Metal Ingot x1000',
        description: '1000 metal ingots for building',
        price: 100,
        itemBlueprint: 'Blueprint\'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_MetalIngot.PrimalItemResource_MetalIngot\'',
        quantity: 1000,
        quality: 0,
        isBlueprint: false,
      },
    }),
    prisma.product.upsert({
      where: { id: 5 },
      update: {},
      create: {
        categoryId: 3,
        name: 'Polymer x500',
        description: '500 polymer for advanced crafting',
        price: 150,
        itemBlueprint: 'Blueprint\'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Polymer.PrimalItemResource_Polymer\'',
        quantity: 500,
        quality: 0,
        isBlueprint: false,
      },
    }),
    prisma.product.upsert({
      where: { id: 6 },
      update: {},
      create: {
        categoryId: 5,
        name: 'Starter Kit',
        description: 'Basic tools and resources to get you started',
        price: 50,
        itemBlueprint: 'Blueprint\'/Game/PrimalEarth/CoreBlueprints/Items/Structures/Wooden/PrimalItemStructure_WoodWall.PrimalItemStructure_WoodWall\'',
        quantity: 1,
        quality: 0,
        isBlueprint: false,
        isFeatured: true,
      },
    }),
  ]);

  console.log(`✅ Created ${products.length} products`);

  // Create a test server
  const server = await prisma.server.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: 'ARK Server 1 - The Island',
      map: 'TheIsland',
      apiKey: 'test-api-key-12345678901234567890123456789012',
    },
  });

  console.log(`✅ Created server: ${server.name}`);
  console.log(`   API Key: ${server.apiKey}`);

  // Issue a signed-plugin credential {keyId, secret} for this server (M2 hardening).
  // keyId is the public identifier sent in X-Plugin-Key-Id; secret is the HMAC signing key.
  // The secret is stored ENCRYPTED; we print the plaintext here ONCE for the operator to copy
  // into the plugin configuration. It is never recoverable from the DB in plaintext again.
  const existingCredential = await prisma.serverCredential.findFirst({
    where: { serverId: server.id, status: 'active' },
  });
  if (!existingCredential) {
    const { default: pluginCredentialService } = await import('../src/services/pluginCredential.service.js');
    const issued = await pluginCredentialService.issue(server.id, 'seed-dev-credential');
    console.log('✅ Issued signed-plugin credential (store the secret in the plugin config):');
    console.log(`   X-Plugin-Key-Id (keyId): ${issued.keyId}`);
    console.log(`   HMAC secret (copy now):  ${issued.secret}`);
  } else {
    console.log('ℹ️  Active signed-plugin credential already exists for this server (skipping issue).');
  }

  console.log('\n🎉 Database seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
