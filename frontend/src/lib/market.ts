/** Marketplace metadata only. Native animal bytes must never reach the browser. */
export interface MarketAnimal {
  id: string; species: string; blueprintPath?: string; dinoName?: string | null; level: number; gender: string;
  status: string; price: number; description?: string | null; uploadBatchId?: string | null;
  originServerId?: number | null; originServer?: { name: string; map?: string | null } | null;
  baseHealth?: number; baseStamina?: number; baseOxygen?: number; baseFood?: number;
  baseWeight?: number; baseDamage?: number; baseSpeed?: number;
  addedHealth?: number; addedStamina?: number; addedOxygen?: number; addedFood?: number;
  addedWeight?: number; addedDamage?: number; addedSpeed?: number;
  imprintQuality?: number; imprinterName?: string | null;
  maternalMutations?: number; paternalMutations?: number;
  motherName?: string | null; fatherName?: string | null;
  colorRegion0?: number; colorRegion1?: number; colorRegion2?: number;
  colorRegion3?: number; colorRegion4?: number; colorRegion5?: number;
  createdAt?: string; expiresAt?: string | null;
}
export function marketGender(gender: string): string {
  return gender === 'Male' ? 'เพศผู้' : gender === 'Female' ? 'เพศเมีย' : 'ไม่ระบุเพศ';
}
export function marketPriceValid(value: string): boolean {
  return /^\d{1,10}$/.test(value) && Number(value) >= 1 && Number(value) <= 2_000_000_000;
}
