// Local design preview data; not an entitlement or reward-grant contract.
export interface PassTier {
  tier: number;
  freeRewardTh: string;
  freeRewardEn: string;
  freeIcon: string;
  premiumRewardTh: string;
  premiumRewardEn: string;
  premiumIcon: string;
  expRequired: number;
}

export const PASS_TIERS: PassTier[] = [
  { tier: 1, freeRewardTh: '50 Iris Coins', freeRewardEn: '50 IC', freeIcon: 'coins', premiumRewardTh: '150 IC + Arctic Hat Skin', premiumRewardEn: '150 IC + Arctic Hat Skin', premiumIcon: 'gift', expRequired: 500 },
  { tier: 2, freeRewardTh: 'Medical Brew (30x)', freeRewardEn: 'Medical Brew (30x)', freeIcon: 'potion', premiumRewardTh: 'Advanced Ammo Pack (500x)', premiumRewardEn: 'Advanced Ammo Pack (500x)', premiumIcon: 'ammo', expRequired: 1000 },
  { tier: 3, freeRewardTh: '100 Iris Coins', freeRewardEn: '100 IC', freeIcon: 'coins', premiumRewardTh: '250 IC + Flak Blueprint', premiumRewardEn: '250 IC + Flak Blueprint', premiumIcon: 'blueprint', expRequired: 1500 },
  { tier: 4, freeRewardTh: 'Hard Polymer (100x)', freeRewardEn: 'Hard Polymer (100x)', freeIcon: 'box', premiumRewardTh: 'Element Shard (500x)', premiumRewardEn: 'Element Shard (500x)', premiumIcon: 'zap', expRequired: 2000 },
  { tier: 5, freeRewardTh: '150 Iris Coins', freeRewardEn: '150 IC', freeIcon: 'coins', premiumRewardTh: 'Chibi-Sinomacrops Rare', premiumRewardEn: 'Chibi-Sinomacrops Rare', premiumIcon: 'gift', expRequired: 2500 },
  { tier: 6, freeRewardTh: 'Kibble Pack (20x)', freeRewardEn: 'Kibble Pack (20x)', freeIcon: 'food', premiumRewardTh: 'Ascendant Rifle Blueprint', premiumRewardEn: 'Ascendant Rifle Blueprint', premiumIcon: 'blueprint', expRequired: 3000 },
  { tier: 7, freeRewardTh: '200 Iris Coins', freeRewardEn: '200 IC', freeIcon: 'coins', premiumRewardTh: '500 IC + Glacial Armor Set', premiumRewardEn: '500 IC + Glacial Armor Set', premiumIcon: 'shield', expRequired: 3500 },
  { tier: 8, freeRewardTh: 'Element (25x)', freeRewardEn: 'Element (25x)', freeIcon: 'zap', premiumRewardTh: 'Tek Replicator Unlock Voucher', premiumRewardEn: 'Tek Replicator Unlock Voucher', premiumIcon: 'zap', expRequired: 4000 },
  { tier: 9, freeRewardTh: '250 Iris Coins', freeRewardEn: '250 IC', freeIcon: 'coins', premiumRewardTh: '750 IC + Mastercraft Saddle', premiumRewardEn: '750 IC + Mastercraft Saddle', premiumIcon: 'saddle', expRequired: 4500 },
  { tier: 10, freeRewardTh: 'Exclusive Title: Explorer', freeRewardEn: 'Title: Explorer', freeIcon: 'award', premiumRewardTh: 'Mythic Wyvern Egg Crate (Lv.380)', premiumRewardEn: 'Mythic Wyvern Egg Crate (Lv.380)', premiumIcon: 'gift', expRequired: 5000 },
];

export interface QuestItem {
  id: string;
  titleTh: string;
  titleEn: string;
  category: 'daily' | 'season';
  progress: number;
  total: number;
  rewardCoins: number;
  rewardExp: number;
}

export const INITIAL_QUESTS: QuestItem[] = [
  { id: 'q-1', titleTh: 'เข้าสู่ระบบเซิร์ฟเวอร์ประจำวัน', titleEn: 'Daily Login to IRIS Server', category: 'daily', progress: 1, total: 1, rewardCoins: 50, rewardExp: 150 },
  { id: 'q-2', titleTh: 'เอาชีวิตรอดในดินแดนหิมะครบ 60 นาที', titleEn: 'Survive in Arctic Zone for 60 Mins', category: 'daily', progress: 60, total: 60, rewardCoins: 100, rewardExp: 250 },
  { id: 'q-3', titleTh: 'สำรวจตลาดผู้เล่นหรือตรวจสเตตัสสัตว์', titleEn: 'Browse Player Market Listings', category: 'daily', progress: 1, total: 1, rewardCoins: 50, rewardExp: 100 },
  { id: 'q-4', titleTh: 'พิมพ์สนทนากับเพื่อนในเกม 5 ข้อความ', titleEn: 'Send 5 In-Game Chat Messages', category: 'daily', progress: 3, total: 5, rewardCoins: 80, rewardExp: 150 },
  { id: 'q-s1', titleTh: 'โค่นสัตว์ป่าระดับ Alpha บนแผนที่ 3 ตัว', titleEn: 'Defeat 3 Alpha Creatures on Any Map', category: 'season', progress: 3, total: 3, rewardCoins: 400, rewardExp: 800 },
  { id: 'q-s2', titleTh: 'เพาะพันธุ์สัตว์และได้สายเลือด Mutation 1 ครั้ง', titleEn: 'Breed a Mutated Dino Offspring', category: 'season', progress: 1, total: 1, rewardCoins: 350, rewardExp: 700 },
  { id: 'q-s3', titleTh: 'สร้างและติดตั้งโครงสร้าง Tek ครบ 10 ชิ้น', titleEn: 'Construct 10 Tek Base Structures', category: 'season', progress: 6, total: 10, rewardCoins: 500, rewardExp: 1000 },
];

