/**
 * Ranking model + SAMPLE data for local development only.
 *
 * There is no ranking endpoint yet (requested from Backend: GET /rankings).
 * The page renders these rows only when NEXT_PUBLIC_USE_FIXTURES=always in a
 * non-production build, and labels them "ข้อมูลตัวอย่าง". Production shows an
 * honest "not open yet" state instead of invented names and prizes.
 */

export type RankingCategory = 'playtime' | 'taming' | 'tribes';

export interface RankingEntry {
  rank: number;
  name: string;
  tribe: string | null;
  server: string;
  score: number;
}

export const RANKING_CATEGORIES: Array<{
  value: RankingCategory;
  label: string;
  description: string;
  scoreLabel: string;
  unit: string;
}> = [
  {
    value: 'playtime',
    label: 'เวลาเล่น',
    description: 'ชั่วโมงที่อยู่ในเซิร์ฟเวอร์ IRIS นับจากต้นฤดูกาล',
    scoreLabel: 'เวลาเล่น',
    unit: 'ชม.',
  },
  {
    value: 'taming',
    label: 'การฝึกสัตว์',
    description: 'จำนวนสัตว์ที่ฝึกสำเร็จในฤดูกาลนี้',
    scoreLabel: 'ฝึกสำเร็จ',
    unit: 'ตัว',
  },
  {
    value: 'tribes',
    label: 'ชนเผ่า',
    description: 'คะแนนรวมของสมาชิกในชนเผ่า',
    scoreLabel: 'คะแนนรวม',
    unit: 'คะแนน',
  },
];

const row = (rank: number, name: string, tribe: string | null, server: string, score: number): RankingEntry => ({
  rank,
  name,
  tribe,
  server,
  score,
});

export const SAMPLE_RANKINGS: Record<RankingCategory, RankingEntry[]> = {
  playtime: [
    row(1, 'Valkyrie_Ice', 'FROST', 'The Island', 1420),
    row(2, 'Kratos_Glacier', 'TITAN', 'Ragnarok', 1285),
    row(3, 'WinterFox_99', 'ARCTIC', 'Fjordur', 1150),
    row(4, 'ShadowRanger', 'NIGHT', 'The Island', 980),
    row(5, 'GlacierQueen', 'FROST', 'Extinction', 920),
    row(6, 'ArkArchitect', 'BUILD', 'Genesis Part 2', 875),
    row(7, 'IronWolf_TH', 'WOLF', 'The Island', 810),
    row(8, 'Phoenix_Snow', null, 'Aberration', 780),
  ],
  taming: [
    row(1, 'Tamer_Xeno', 'BEAST', 'Ragnarok', 412),
    row(2, 'DinoWhisperer', 'WILD', 'The Island', 388),
    row(3, 'RexRider_TH', 'TITAN', 'Fjordur', 356),
    row(4, 'Kibble_Master', null, 'Valguero', 301),
    row(5, 'WyvernQueen', 'SKY', 'Ragnarok', 287),
    row(6, 'AlphaHunter', 'NIGHT', 'Crystal Isles', 260),
  ],
  tribes: [
    row(1, 'FROST', null, 'The Island', 18240),
    row(2, 'TITAN', null, 'Ragnarok', 16610),
    row(3, 'NIGHT', null, 'Fjordur', 14980),
    row(4, 'WILD', null, 'Extinction', 12100),
    row(5, 'BUILD', null, 'Genesis Part 2', 9870),
  ],
};
