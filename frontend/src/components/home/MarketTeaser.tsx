import Image from 'next/image';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui';

const POINTS = [
  'ประกาศขายสัตว์และไอเทมจากตัวละครของคุณเอง',
  'เงินของผู้ซื้อถูกพักไว้ในระบบจนกว่าการส่งมอบจะสำเร็จ',
  'ของถูกล็อกไว้ระหว่างประกาศ ไม่มีใครเอาไปใช้ซ้ำได้',
] as const;

/** Player market teaser: framed art + three concrete facts + two actions. */
export function MarketTeaser() {
  return (
    <section aria-labelledby="market-title" className="page-shell">
      <div className="grid overflow-hidden rounded-card border border-line bg-surface lg:grid-cols-2">
        <div className="relative aspect-[16/10] border-b border-line lg:aspect-auto lg:min-h-[360px] lg:border-b-0 lg:border-r">
          <Image
            src="/images/marketplace_banner.png"
            alt="ท่าเรือค้าขายของผู้รอดชีวิต มีแผงขายอุปกรณ์และสัตว์"
            fill
            sizes="(min-width: 1024px) 620px, 100vw"
            className="object-cover brightness-[.85] saturate-[.65]"
          />
        </div>
        <div className="flex flex-col justify-center p-6 sm:p-10">
          <p className="eyebrow">ตลาดผู้เล่น</p>
          <h2 id="market-title" className="mt-2 text-2xl font-semibold tracking-[-0.015em] text-fg">
            ซื้อขายกับผู้เล่นคนอื่นได้อย่างวางใจ
          </h2>
          <ul className="mt-5 space-y-3">
            {POINTS.map((point) => (
              <li key={point} className="flex gap-3 text-sm text-fg-muted">
                <span className="mt-[0.7em] h-px w-3 shrink-0 bg-accent" aria-hidden="true" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/market" className={buttonVariants()}>
              เข้าตลาดผู้เล่น
            </Link>
            <Link href="/market/my-listings" className={buttonVariants({ variant: 'secondary' })}>
              ประกาศขายของฉัน
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export default MarketTeaser;
