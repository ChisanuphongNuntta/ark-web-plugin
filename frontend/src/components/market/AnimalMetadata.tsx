import { type MarketAnimal, marketGender } from '@/lib/market';

const STATS = [['Health', 'พลังชีวิต'], ['Stamina', 'สตามินา'], ['Oxygen', 'ออกซิเจน'], ['Food', 'อาหาร'], ['Weight', 'น้ำหนัก'], ['Damage', 'โจมตี'], ['Speed', 'ความเร็ว']] as const;
export function AnimalMetadata({ animal }: { animal: MarketAnimal }) {
  return <div className="space-y-4 text-sm">
    <p className="text-iris-muted">{animal.species} · Lv.{animal.level} · {marketGender(animal.gender)}</p>
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {STATS.map(([key, label]) => <div key={key} className="rounded-xl border border-white/10 p-3"><dt className="text-xs text-iris-muted">{label} (แต้ม)</dt><dd className="mt-1 font-mono">{animal[`base${key}` as keyof MarketAnimal] as number ?? '—'} <span className="text-iris-cyan">+ {animal[`added${key}` as keyof MarketAnimal] as number ?? '—'}</span></dd></div>)}
    </dl>
    <p className="text-xs leading-5 text-iris-muted">แสดงแต้มพื้นฐาน + แต้มที่อัปหลังเลี้ยง ไม่ใช่ HP จริงหรือเปอร์เซ็นต์โจมตี ระบบเก็บตัวสัตว์ด้วย native snapshot เดิม ส่วนค่าพลังที่คำนวณจริงอาจต่างตามตัวคูณและการตั้งค่าของเซิร์ฟเวอร์ปลายทาง</p>
    <dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-iris-muted">Imprint</dt><dd>{animal.imprintQuality == null ? '—' : `${Math.round(animal.imprintQuality * 100)}%`} · {animal.imprinterName ?? 'ไม่ระบุผู้ imprint'}</dd></div><div><dt className="text-iris-muted">Mutation แม่ / พ่อ</dt><dd>{animal.maternalMutations ?? '—'} / {animal.paternalMutations ?? '—'}</dd></div><div><dt className="text-iris-muted">สายแม่ / สายพ่อ</dt><dd>{animal.motherName ?? '—'} / {animal.fatherName ?? '—'}</dd></div><div><dt className="text-iris-muted">เซิร์ฟเวอร์ต้นทาง</dt><dd>{animal.originServer?.name ?? (animal.originServerId ? `Server ${animal.originServerId}` : '—')}</dd></div></dl>
    <div className="flex flex-wrap gap-2" aria-label="รหัสสีจริงตามส่วนร่างกาย">{[0, 1, 2, 3, 4, 5].map(region => <span key={region} className="rounded-lg border border-white/10 px-2 py-1 text-xs">Region {region}: ID {animal[`colorRegion${region}` as keyof MarketAnimal] as number ?? '—'}</span>)}</div>
  </div>;
}
