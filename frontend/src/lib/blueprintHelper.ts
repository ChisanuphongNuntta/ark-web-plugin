/**
 * Helper utility for expanding short ARK blueprint notation into canonical
 * Unreal Engine blueprint paths and extracting short friendly names.
 */

export interface BlueprintPreset {
  label: string;
  category: string;
  shortPath: string;
  fullPath: string;
}

// Common popular presets for ARK items and dinos
export const COMMON_BLUEPRINT_PRESETS: BlueprintPreset[] = [
  {
    label: 'Polymer (โพลิเมอร์)',
    category: 'ทรัพยากร',
    shortPath: 'PrimalItemResource_Polymer',
    fullPath: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Polymer.PrimalItemResource_Polymer'",
  },
  {
    label: 'Metal Ingot (เหล็กหลอม)',
    category: 'ทรัพยากร',
    shortPath: 'PrimalItemResource_MetalIngot',
    fullPath: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_MetalIngot.PrimalItemResource_MetalIngot'",
  },
  {
    label: 'Element (เอเลเมนต์)',
    category: 'ทรัพยากร',
    shortPath: 'PrimalItemResource_Element',
    fullPath: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Element.PrimalItemResource_Element'",
  },
  {
    label: 'Longneck Rifle (ปืนยาวล่าสัตว์)',
    category: 'อาวุธ',
    shortPath: 'PrimalItem_WeaponOneShotRifle',
    fullPath: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItem_WeaponOneShotRifle.PrimalItem_WeaponOneShotRifle'",
  },
  {
    label: 'Compound Bow (ธนูคอมพาวด์)',
    category: 'อาวุธ',
    shortPath: 'PrimalItem_WeaponCompoundBow',
    fullPath: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItem_WeaponCompoundBow.PrimalItem_WeaponCompoundBow'",
  },
  {
    label: 'Flak Chest (เสื้อเกราะเหล็ก)',
    category: 'ชุดเกราะ',
    shortPath: 'PrimalItemArmor_MetalChest',
    fullPath: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Armor/Metal/PrimalItemArmor_MetalChest.PrimalItemArmor_MetalChest'",
  },
  {
    label: 'Birthday Cake (เค้กวันเกิด)',
    category: 'สิ่งก่อสร้าง/อีเวนต์',
    shortPath: 'PopOutCake/PrimalItemStructure_BirthdayCake',
    fullPath: "Blueprint'/Game/PrimalEarth/Structures/PopOutCake/PrimalItemStructure_BirthdayCake.PrimalItemStructure_BirthdayCake'",
  },
  {
    label: 'Wooden Wall (กำแพงไม้)',
    category: 'สิ่งก่อสร้าง',
    shortPath: 'Wooden/PrimalItemStructure_WoodWall',
    fullPath: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Structures/Wooden/PrimalItemStructure_WoodWall.PrimalItemStructure_WoodWall'",
  },
  {
    label: 'Rex (ทีเร็กซ์)',
    category: 'ไดโนเสาร์',
    shortPath: 'Rex_Character_BP',
    fullPath: "Blueprint'/Game/PrimalEarth/Dinos/Rex/Rex_Character_BP.Rex_Character_BP'",
  },
  {
    label: 'Giganotosaurus (กิกะ)',
    category: 'ไดโนเสาร์',
    shortPath: 'Gigant_Character_BP',
    fullPath: "Blueprint'/Game/PrimalEarth/Dinos/Giganotosaurus/Gigant_Character_BP.Gigant_Character_BP'",
  },
];

// Dictionary of known shortcuts to their canonical full paths
const DICTIONARY: Record<string, string> = {
  // Resources
  polymer: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Polymer.PrimalItemResource_Polymer'",
  metalingot: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_MetalIngot.PrimalItemResource_MetalIngot'",
  metal: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_MetalIngot.PrimalItemResource_MetalIngot'",
  element: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Element.PrimalItemResource_Element'",
  chitin: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Chitin.PrimalItemResource_Chitin'",
  keratin: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Keratin.PrimalItemResource_Keratin'",
  paste: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_ChitinPaste.PrimalItemResource_ChitinPaste'",
  cementingpaste: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_ChitinPaste.PrimalItemResource_ChitinPaste'",
  blackpearl: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_BlackPearl.PrimalItemResource_BlackPearl'",
  oil: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Oil.PrimalItemResource_Oil'",
  crystal: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Crystal.PrimalItemResource_Crystal'",
  flint: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Flint.PrimalItemResource_Flint'",
  stone: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Stone.PrimalItemResource_Stone'",
  wood: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Wood.PrimalItemResource_Wood'",
  thatch: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Thatch.PrimalItemResource_Thatch'",
  hide: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Hide.PrimalItemResource_Hide'",
  fiber: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Fiber.PrimalItemResource_Fiber'",

  // Weapons & Ammo
  longneck: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItem_WeaponOneShotRifle.PrimalItem_WeaponOneShotRifle'",
  rifle: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItem_WeaponOneShotRifle.PrimalItem_WeaponOneShotRifle'",
  shotgun: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItem_WeaponShotgun.PrimalItem_WeaponShotgun'",
  pumpshotgun: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItem_WeaponMachinedShotgun.PrimalItem_WeaponMachinedShotgun'",
  compoundbow: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItem_WeaponCompoundBow.PrimalItem_WeaponCompoundBow'",
  crossbow: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItem_WeaponCrossbow.PrimalItem_WeaponCrossbow'",
  fabrifle: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItem_WeaponMachinedSniper.PrimalItem_WeaponMachinedSniper'",
  fabpistol: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItem_WeaponMachinedPistol.PrimalItem_WeaponMachinedPistol'",
  simpleammo: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItemAmmo_SimpleRifleBullet.PrimalItemAmmo_SimpleRifleBullet'",
  shotgunshell: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItemAmmo_Shotgun.PrimalItemAmmo_Shotgun'",
  sniperammo: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItemAmmo_AdvancedSniperBullet.PrimalItemAmmo_AdvancedSniperBullet'",
  tranqdart: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItemAmmo_TranqDart.PrimalItemAmmo_TranqDart'",
  shockdart: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItemAmmo_RefinedTranqDart.PrimalItemAmmo_RefinedTranqDart'",

  // Dinos
  rex: "Blueprint'/Game/PrimalEarth/Dinos/Rex/Rex_Character_BP.Rex_Character_BP'",
  giga: "Blueprint'/Game/PrimalEarth/Dinos/Giganotosaurus/Gigant_Character_BP.Gigant_Character_BP'",
  spino: "Blueprint'/Game/PrimalEarth/Dinos/Spino/Spino_Character_BP.Spino_Character_BP'",
  carno: "Blueprint'/Game/PrimalEarth/Dinos/Carno/Carno_Character_BP.Carno_Character_BP'",
  argent: "Blueprint'/Game/PrimalEarth/Dinos/Argentavis/Argent_Character_BP.Argent_Character_BP'",
  argy: "Blueprint'/Game/PrimalEarth/Dinos/Argentavis/Argent_Character_BP.Argent_Character_BP'",
  quetzal: "Blueprint'/Game/PrimalEarth/Dinos/Quetzalcoatlus/Quetz_Character_BP.Quetz_Character_BP'",
  pteranodon: "Blueprint'/Game/PrimalEarth/Dinos/Ptero/Ptero_Character_BP.Ptero_Character_BP'",
  ptero: "Blueprint'/Game/PrimalEarth/Dinos/Ptero/Ptero_Character_BP.Ptero_Character_BP'",
  ankylo: "Blueprint'/Game/PrimalEarth/Dinos/Ankylo/Ankylo_Character_BP.Ankylo_Character_BP'",
  doedicurus: "Blueprint'/Game/PrimalEarth/Dinos/Doedicurus/Doed_Character_BP.Doed_Character_BP'",
  therizino: "Blueprint'/Game/PrimalEarth/Dinos/Therizinosaurus/Therizino_Character_BP.Therizino_Character_BP'",
  thyla: "Blueprint'/Game/PrimalEarth/Dinos/Thylacoleo/Thylacoleo_Character_BP.Thylacoleo_Character_BP'",
  yuty: "Blueprint'/Game/PrimalEarth/Dinos/Yutyrannus/Yutyrannus_Character_BP.Yutyrannus_Character_BP'",
};

/**
 * Expands a short blueprint string or partial path into a canonical
 * Unreal Engine Blueprint format:
 *   Blueprint'/Game/.../ClassName.ClassName'
 */
export function expandBlueprintPath(input: string): string {
  if (!input) return '';
  let trimmed = input.trim();
  if (!trimmed) return '';

  // If wrapped in double quotes, strip them
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    trimmed = trimmed.slice(1, -1).trim();
  }

  // 1. Check exact dictionary match (case-insensitive)
  const lower = trimmed.toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (DICTIONARY[lower]) {
    return DICTIONARY[lower];
  }

  // 2. Already full canonical Blueprint'...' format
  if (/^Blueprint'\/Game\/.+\.\w+'$/i.test(trimmed)) {
    return trimmed;
  }

  // 3. Starts with Blueprint'
  if (trimmed.toLowerCase().startsWith("blueprint'")) {
    const withoutWrapper = trimmed.replace(/^blueprint'/i, '').replace(/'$/i, '').trim();
    if (withoutWrapper.includes('.') && withoutWrapper.lastIndexOf('.') > withoutWrapper.lastIndexOf('/')) {
      return `Blueprint'${withoutWrapper}'`;
    }
    const lastSlash = withoutWrapper.lastIndexOf('/');
    const className = withoutWrapper.substring(lastSlash + 1);
    return `Blueprint'${withoutWrapper}.${className}'`;
  }

  // 4. Starts with /Game/...
  if (trimmed.startsWith('/Game/')) {
    const dotIndex = trimmed.lastIndexOf('.');
    if (dotIndex !== -1 && dotIndex > trimmed.lastIndexOf('/')) {
      // Already has .ClassName
      return `Blueprint'${trimmed}'`;
    }
    const lastSlash = trimmed.lastIndexOf('/');
    const className = trimmed.substring(lastSlash + 1);
    return `Blueprint'${trimmed}.${className}'`;
  }

  // 5. Dino shorthand (*_Character_BP)
  if (trimmed.endsWith('_Character_BP')) {
    const dinoName = trimmed.replace('_Character_BP', '');
    return `Blueprint'/Game/PrimalEarth/Dinos/${dinoName}/${trimmed}.${trimmed}'`;
  }

  // 6. Resources shorthand (PrimalItemResource_*)
  if (trimmed.startsWith('PrimalItemResource_')) {
    return `Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/${trimmed}.${trimmed}'`;
  }

  // 7. Weapons shorthand (PrimalItem_Weapon* or PrimalItemAmmo_*)
  if (trimmed.startsWith('PrimalItem_Weapon') || trimmed.startsWith('PrimalItemAmmo_')) {
    return `Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/${trimmed}.${trimmed}'`;
  }

  // 8. Armor shorthand (PrimalItemArmor_*)
  if (trimmed.startsWith('PrimalItemArmor_')) {
    let subfolder = 'Metal';
    if (trimmed.includes('Cloth')) subfolder = 'Cloth';
    else if (trimmed.includes('Hide')) subfolder = 'Hide';
    else if (trimmed.includes('Chitin')) subfolder = 'Chitin';
    else if (trimmed.includes('Flak')) subfolder = 'Metal';
    else if (trimmed.includes('Riot')) subfolder = 'Riot';
    else if (trimmed.includes('Tek')) subfolder = 'Tek';
    else if (trimmed.includes('Ghillie')) subfolder = 'Ghillie';
    else if (trimmed.includes('Scuba')) subfolder = 'Scuba';
    else if (trimmed.includes('Fur')) subfolder = 'Fur';
    return `Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Armor/${subfolder}/${trimmed}.${trimmed}'`;
  }

  // 9. Structures shorthand (e.g. PopOutCake/PrimalItemStructure_BirthdayCake or Wooden/PrimalItemStructure_WoodWall)
  if (trimmed.includes('/') && !trimmed.startsWith('/')) {
    const parts = trimmed.split('/');
    const className = parts[parts.length - 1];
    if (trimmed.toLowerCase().includes('popoutcake')) {
      return `Blueprint'/Game/PrimalEarth/Structures/${trimmed}.${className}'`;
    }
    return `Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Structures/${trimmed}.${className}'`;
  }

  // 10. Single class name starting with PrimalItemStructure_
  if (trimmed.startsWith('PrimalItemStructure_')) {
    return `Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Structures/${trimmed}.${trimmed}'`;
  }

  // 11. Single class name starting with PrimalItem*
  if (trimmed.startsWith('PrimalItem')) {
    return `Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/${trimmed}.${trimmed}'`;
  }

  // Fallback: wrap as a CoreBlueprint item
  return `Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/${trimmed}.${trimmed}'`;
}

/**
 * Extracts a concise, human-friendly short name from a long Unreal Engine blueprint path.
 * Example:
 *   "Blueprint'/Game/PrimalEarth/Structures/PopOutCake/PrimalItemStructure_BirthdayCake.PrimalItemStructure_BirthdayCake'"
 *   -> "PopOutCake/PrimalItemStructure_BirthdayCake"
 */
export function extractShortBlueprint(fullPath: string): string {
  if (!fullPath) return '';
  const clean = fullPath.replace(/^Blueprint'|'$/g, '').trim();

  // If path contains '.', take the segment before the dot or after the last slash
  const withoutDot = clean.split('.')[0];
  const segments = withoutDot.split('/');

  if (segments.length >= 2) {
    const last = segments[segments.length - 1];
    const secondLast = segments[segments.length - 2];
    // If second last is meaningful folder (not CoreBlueprints / Game / PrimalEarth / generic subfolders)
    if (!['coreblueprints', 'game', 'primalearth', 'items', 'resources', 'weapons', 'armor', 'dinos'].includes(secondLast.toLowerCase())) {
      return `${secondLast}/${last}`;
    }
    return last;
  }

  return segments[segments.length - 1] || clean;
}
