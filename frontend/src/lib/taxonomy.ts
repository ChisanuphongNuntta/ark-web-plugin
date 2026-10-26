export interface TaxonomyOption {
  id: string;
  labelTh: string;
  labelEn: string;
  iconName?: string;
  keywords?: string[];
}

export const DINO_MAP_OPTIONS: TaxonomyOption[] = [
  { id: 'all', labelTh: 'ทุกแมพ', labelEn: 'All Maps' },
  { id: 'island', labelTh: 'The Island', labelEn: 'The Island', keywords: ['Island', 'Rex', 'Allosaurus', 'Spino', 'Raptor', 'Trike', 'Stego', 'Argentavis', 'Pteranodon', 'Bronto', 'Ankylo', 'Megalodon'] },
  { id: 'scorched', labelTh: 'Scorched Earth', labelEn: 'Scorched Earth', keywords: ['Scorched', 'Wyvern', 'Thorny', 'Mantis', 'Morellatops', 'Rock Elemental', 'Jerboa', 'Vulture', 'Phoenix', 'Deathworm'] },
  { id: 'aberration', labelTh: 'Aberration', labelEn: 'Aberration', keywords: ['Aberrant', 'Rock Drake', 'Reaper', 'Ravager', 'Basilisk', 'Karkinos', 'Featherlight', 'Glowtail', 'Shinehorn', 'Bulbdog', 'Roll Rat'] },
  { id: 'extinction', labelTh: 'Extinction', labelEn: 'Extinction', keywords: ['Extinction', 'Managarmr', 'Snow Owl', 'Velonasaur', 'Gacha', 'Gasbags', 'Enforcer', 'Stryder', 'Titan', 'Scout'] },
  { id: 'genesis1', labelTh: 'Genesis Pt. 1', labelEn: 'Genesis Pt. 1', keywords: ['Ferox', 'Bloodstalker', 'Magmasaur', 'Megachelon', 'Astrocetus', 'X-Rex', 'X-Spino', 'X-Allosaurus', 'X-'] },
  { id: 'genesis2', labelTh: 'Genesis Pt. 2', labelEn: 'Genesis Pt. 2', keywords: ['Shadowmane', 'Noglin', 'Maewing', 'Voidwyrm', 'Astrodelphis', 'Exo-Mek', 'R-Thylacoleo', 'R-Giganotosaurus', 'R-'] },
  { id: 'fjordur', labelTh: 'Fjordur', labelEn: 'Fjordur', keywords: ['Andrewsarchus', 'Desmodus', 'Fjordhawk', 'Fenrir'] },
  { id: 'lost_island', labelTh: 'Lost Island', labelEn: 'Lost Island', keywords: ['Amargasaurus', 'Sinomacrops', 'Dinopithecus'] },
  { id: 'crystal_isles', labelTh: 'Crystal Isles', labelEn: 'Crystal Isles', keywords: ['Crystal Wyvern', 'Tropeognathus'] },
];

export const DINO_ROLE_OPTIONS: TaxonomyOption[] = [
  { id: 'all', labelTh: 'ทุกสายการเล่น', labelEn: 'All Roles' },
  { id: 'carnivore', labelTh: 'นักล่าดุร้าย', labelEn: 'Carnivore / Predator', keywords: ['Rex', 'Giga', 'Spino', 'Allosaurus', 'Carno', 'Raptor', 'Yutyrannus', 'Direwolf', 'Sabertooth', 'Thylacoleo', 'Wyvern', 'Megalodon', 'Reaper', 'Baryonyx'] },
  { id: 'herbivore', labelTh: 'สายกินพืช & เก็บเกี่ยว', labelEn: 'Herbivore / Harvester', keywords: ['Stego', 'Trike', 'Bronto', 'Ankylo', 'Doedicurus', 'Therizino', 'Mammoth', 'Paracer', 'Diplodocus', 'Morellatops', 'Castoroides'] },
  { id: 'flyer', labelTh: 'สัตว์บินเวหา', labelEn: 'Aerial / Flyer', keywords: ['Wyvern', 'Argentavis', 'Pteranodon', 'Quetzal', 'Tapejara', 'Desmodus', 'Snow Owl', 'Griffin', 'Pelagornis', 'Sinomacrops', 'Tropeognathus', 'Voidwyrm'] },
  { id: 'aquatic', labelTh: 'สัตว์ใต้สมุทร', labelEn: 'Deep Sea / Aquatic', keywords: ['Mosasaur', 'Plesiosaur', 'Basilosaurus', 'Megalodon', 'Tusoteuthis', 'Dunkleosteus', 'Ichthyosaur', 'Liopleurodon', 'Manta', 'Aquatic'] },
  { id: 'amphibious', labelTh: 'สะเทินน้ำสะเทินบก', labelEn: 'Amphibious', keywords: ['Spino', 'Baryonyx', 'Sarco', 'Kaprosuchus', 'Diplocaulus', 'Carbonemys', 'Karkinos', 'Tiktaalik'] },
  { id: 'tek', labelTh: 'ไซบอร์ก Tek', labelEn: 'Tek Cybernetic', keywords: ['Tek Rex', 'Tek Parasaur', 'Tek Stego', 'Tek Raptor', 'Tek Quetzal', 'Tek Stryder', 'Tek'] },
  { id: 'aberrant', labelTh: 'สายพันธุ์กลาย Aberrant', labelEn: 'Mutated Aberrant', keywords: ['Aberrant'] },
  { id: 'apex', labelTh: 'สัตว์เทพ & สัตว์บอส', labelEn: 'Apex & Mythical', keywords: ['Giganotosaurus', 'Carcharodontosaurus', 'Reaper', 'Rock Drake', 'Wyvern', 'Titan', 'Phoenix', 'Magmasaur'] },
];

export const DINO_STANCE_OPTIONS: TaxonomyOption[] = [
  { id: 'all', labelTh: 'ทุกลักษณะขา', labelEn: 'All Stances' },
  { id: '2_legs', labelTh: 'ยืน 2 ขา (Bipedal)', labelEn: '2 Legs (Bipedal)', keywords: ['Rex', 'Giganotosaurus', 'Carno', 'Raptor', 'Allosaurus', 'Therizinosaurus', 'Yutyrannus', 'Baryonyx', 'Troodon', 'Terror Bird', 'Deinonychus', 'Megalosaurus', 'Iguanodon', 'Spino'] },
  { id: '4_legs', labelTh: 'ยืน 4 ขา (Quadrupedal)', labelEn: '4 Legs (Quadrupedal)', keywords: ['Stegosaurus', 'Triceratops', 'Ankylosaurus', 'Brontosaurus', 'Diplodocus', 'Mammoth', 'Direbear', 'Thylacoleo', 'Daeodon', 'Doedicurus', 'Andrewsarchus', 'Sabertooth', 'Megatherium', 'Trike', 'Paracer', 'Stego'] },
  { id: 'winged', labelTh: 'มีปีก / บินได้', labelEn: 'Winged / Flyers', keywords: ['Wyvern', 'Argentavis', 'Pteranodon', 'Quetzal', 'Tapejara', 'Desmodus', 'Griffin', 'Snow Owl', 'Pelagornis', 'Sinomacrops', 'Dimorphodon', 'Phoenix'] },
  { id: 'finned', labelTh: 'สัตว์น้ำ / มีครีบ', labelEn: 'Finned / Swimmer', keywords: ['Mosasaur', 'Plesiosaur', 'Basilosaurus', 'Megalodon', 'Tusoteuthis', 'Dunkleosteus', 'Ichthyosaur', 'Liopleurodon', 'Manta'] },
  { id: 'serpentine', labelTh: 'เลื้อย / ไร้ขา', labelEn: 'Serpentine / Legless', keywords: ['Titanoboa', 'Basilisk', 'Arthropluera', 'Bloodstalker'] },
];

export const ITEM_CLASS_OPTIONS: TaxonomyOption[] = [
  { id: 'all', labelTh: 'ทุกหมวดหมู่ไอเทม', labelEn: 'All Item Categories' },
  { id: 'structures', labelTh: 'สิ่งก่อสร้าง & ฐานทัพ', labelEn: 'Structures & Base', keywords: ['Foundation', 'Wall', 'Ceiling', 'Door', 'Gate', 'Generator', 'Replicator', 'Teleporter', 'Transmitter', 'Vault', 'Turret', 'Bed', 'Industrial', 'Tek Foundation', 'Tek Wall', 'Tek Ceiling', 'Tek Generator'] },
  { id: 'saddles', labelTh: 'อานสัตว์ & แท่นขี่', labelEn: 'Saddles & Platforms', keywords: ['Saddle', 'Platform Saddle'] },
  { id: 'weapons', labelTh: 'อาวุธ & กระสุน', labelEn: 'Weapons & Ammunition', keywords: ['Rifle', 'Shotgun', 'Pistol', 'Bow', 'Crossbow', 'Bullet', 'Ammo', 'Grenade', 'Rocket', 'Cannon', 'Sword', 'Pike', 'Longneck', 'Fabricated Sniper', 'Tek Rifle', 'Phase Pistol'] },
  { id: 'armor', labelTh: 'ชุดเกราะ & เครื่องแต่งกาย', labelEn: 'Armor & Defense Suits', keywords: ['Helmet', 'Chestpiece', 'Leggings', 'Boots', 'Gauntlets', 'Flak', 'Riot', 'Tek Helmet', 'Tek Chestpiece', 'Tek Leggings', 'Tek Boots', 'Hazard', 'Ghillie', 'Scuba', 'Fur'] },
  { id: 'potions', labelTh: 'ยา & บัฟเพิ่มพลัง', labelEn: 'Potions, Tonics & Buffs', keywords: ['Brew', 'Tonic', 'Potion', 'Elixir', 'Buff', 'Antidote', 'Stimulant', 'Medical Brew', 'Energy Brew', 'Mindwipe'] },
  { id: 'food', labelTh: 'อาหาร & เค้ก/เบอร์รี่', labelEn: 'Food, Kibble & Feed', keywords: ['Kibble', 'Jerky', 'Meat', 'Berry', 'Sweet Vegetable Cake', 'Soup', 'Chili', 'Curry', 'Cooked Meat'] },
  { id: 'resources', labelTh: 'วัตถุดิบ & แร่ธาตุ', labelEn: 'Resources & Crafting', keywords: ['Ingot', 'Metal', 'Polymer', 'Paste', 'Pearl', 'Element', 'Obsidian', 'Crystal', 'Oil', 'Wood', 'Stone', 'Flint', 'Fiber', 'Hide', 'Chitin', 'Black Pearl', 'Element Shard'] },
  { id: 'tools', labelTh: 'เครื่องมือ & ชิบิ/จิปาถะ', labelEn: 'Tools, Chibi & Utility', keywords: ['Pick', 'Hatchet', 'Sickle', 'Spyglass', 'GPS', 'Cryopod', 'Chibi', 'Coloring', 'Dye', 'Hoversail'] },
  { id: 'skins', labelTh: 'สกินตกแต่งความงาม', labelEn: 'Skins & Cosmetics', keywords: ['Skin', 'Costume', 'Swim'] },
];

export const POPULAR_SEARCH_SUGGESTIONS = [
  { query: 'Rex', label: 'Tyrannosaurus Rex', tag: 'Dino' },
  { query: 'Wyvern', label: 'Wyvern All Species', tag: 'Flyer' },
  { query: 'Giga', label: 'Giganotosaurus (Lv.400)', tag: 'Apex' },
  { query: 'Tek', label: 'Tek Technology & Dinos', tag: 'Tek Tier' },
  { query: 'Saddle', label: 'Ascendant Saddles', tag: 'Gear' },
  { query: 'Flak', label: 'Ascendant Flak Armor Set', tag: 'Armor' },
  { query: 'Longneck', label: 'Ascendant Longneck Rifle', tag: 'Weapon' },
  { query: 'Polymer', label: 'Hard Polymer (Bulk)', tag: 'Resource' },
  { query: 'Kibble', label: 'Exceptional & Extraordinary Kibble', tag: 'Food' },
  { query: 'Element', label: 'Pure Element & Shards', tag: 'Energy' },
  { query: 'Aberrant', label: 'Aberrant Mutations', tag: 'Aberration' },
  { query: 'Chibi', label: 'Rare Collector Chibi', tag: 'Collectible' },
];
