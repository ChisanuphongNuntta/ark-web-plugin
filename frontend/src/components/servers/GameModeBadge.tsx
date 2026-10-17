import type { GameMode } from '@/lib/contracts/types';
import { Badge } from '@/components/ui/Badge';
import { GAME_MODE_DESCRIPTION, GAME_MODE_LABEL } from './serverMeta';

const TONE: Record<GameMode, 'neutral' | 'info' | 'warning'> = {
  PVE: 'neutral',
  PVE_MOD: 'info',
  PVPVE: 'warning',
};

/** PvE / PvE Mod / PvPvE label. Outline, restrained. */
export function GameModeBadge({ mode, className }: { mode: GameMode; className?: string }) {
  return (
    <Badge tone={TONE[mode]} outline className={className} title={GAME_MODE_DESCRIPTION[mode]}>
      {GAME_MODE_LABEL[mode]}
    </Badge>
  );
}

export default GameModeBadge;
