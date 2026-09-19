/**
 * Helper utility for expanding short ARK blueprint notation into canonical
 * Unreal Engine blueprint paths.
 */

const DICTIONARY: Record<string, string> = {
  polymer: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Polymer.PrimalItemResource_Polymer'",
  metalingot: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_MetalIngot.PrimalItemResource_MetalIngot'",
  metal: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_MetalIngot.PrimalItemResource_MetalIngot'",
  element: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Element.PrimalItemResource_Element'",
  chitin: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Chitin.PrimalItemResource_Chitin'",
  longneck: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItem_WeaponOneShotRifle.PrimalItem_WeaponOneShotRifle'",
  rifle: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItem_WeaponOneShotRifle.PrimalItem_WeaponOneShotRifle'",
  rex: "Blueprint'/Game/PrimalEarth/Dinos/Rex/Rex_Character_BP.Rex_Character_BP'",
  giga: "Blueprint'/Game/PrimalEarth/Dinos/Giganotosaurus/Gigant_Character_BP.Gigant_Character_BP'",
};

export function normalizeBlueprintPath(input: string | null | undefined): string | null {
  if (!input) return null;
  let trimmed = String(input).trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    trimmed = trimmed.slice(1, -1).trim();
  }

  // 1. Check exact dictionary match
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
    return `Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Armor/${subfolder}/${trimmed}.${trimmed}'`;
  }

  // 9. Structures shorthand (e.g. PopOutCake/PrimalItemStructure_BirthdayCake)
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

  return `Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/${trimmed}.${trimmed}'`;
}
