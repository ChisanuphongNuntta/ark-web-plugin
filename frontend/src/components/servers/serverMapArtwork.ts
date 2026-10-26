// Map images retained from the matching sections of the original IRIS directory.
const maps: Record<string, string> = {
  theisland: 'the-island', island: 'the-island',
  thecenter: 'the-center', center: 'the-center',
  ragnarok: 'ragnarok', aberration: 'aberration', extinction: 'extinction',
  scorchedearth: 'scorched-earth', valguero: 'valguero',
  genesis: 'genesis', genesis1: 'genesis', genesispart1: 'genesis',
  gen2: 'genesis-2', genesis2: 'genesis-2', genesispart2: 'genesis-2',
  crystalisles: 'crystal-isles', lostisland: 'lost-island',
  fjordur: 'fjordur', aquatica: 'aquatica',
};

export function serverMapArtwork(map: string | null | undefined): string | null {
  const key = (map ?? '').trim().replace(/_(?:WP|P)$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const asset = maps[key];
  return asset ? `/images/servers/${asset}.webp` : null;
}
