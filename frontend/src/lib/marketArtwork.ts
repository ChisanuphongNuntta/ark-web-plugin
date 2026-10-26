import known from './marketArtwork.json';
import { getProductImageUrl, PRODUCT_ARTWORK_FALLBACK } from './productVisuals';

const entries: Record<string, { name: string; imageUrl: string }> = known;
function normalizedBlueprint(value: string): string {
  return value.trim().replace(/^(?:Blueprint|Class)'/i, '').replace(/'$/, '').replace(/_C$/i, '').toLowerCase();
}
/** Only an exact blueprint or class match may turn an internal ARK name into artwork. */
export function marketArtwork(animal: { blueprintPath?: string; species?: string }): { name: string; imageUrl: string } {
  const blueprint = normalizedBlueprint(animal.blueprintPath ?? '');
  if (entries[blueprint]) return entries[blueprint];
  const className = (blueprint.split('.').at(-1) || animal.species || '').replace(/_C$/i, '').toLowerCase();
  const matches = Object.entries(entries).filter(([path]) => path.split('.').at(-1) === className).map(([, entry]) => entry);
  if (matches.length === 1) return matches[0];
  const species = animal.species ?? '';
  // Human species names may use the curated catalog; unknown BP identifiers stay generic.
  return { name: species, imageUrl: /character|_bp|\/game\//i.test(species) ? PRODUCT_ARTWORK_FALLBACK : getProductImageUrl({ name: species }) };
}
