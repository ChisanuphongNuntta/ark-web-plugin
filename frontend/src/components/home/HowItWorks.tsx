import { CLAIM_COMMAND, withClaimCommand } from '@/components/ClaimCommand';

const STEPS = [
  {
    title: 'เลือกของ',
    body: 'เลือกไอเทม สัตว์ หรือแพ็กเกจจากร้านค้า ทุกรายการแสดงราคาเป็น Iris Coin (IC)',
  },
  {
    title: 'เลือกเซิร์ฟเวอร์',
    body: 'เลือกเซิร์ฟเวอร์ที่ตัวละครของคุณอยู่ ระบบให้เลือกได้เฉพาะเซิร์ฟเวอร์ที่เปิดรับของ',
  },
  {
    title: 'รับในเกม',
    body: `ระบบส่งของเข้าเซิร์ฟเวอร์ให้อัตโนมัติ ถ้ายังไม่ได้รับ พิมพ์ ${CLAIM_COMMAND} ในแชทเกม`,
  },
] as const;

/** Three-step explainer: เลือกของ → เลือกเซิร์ฟเวอร์ → รับในเกม. */
export function HowItWorks() {
  return (
    <section aria-labelledby="how-title" className="page-shell">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-16">
        <div>
          <p className="eyebrow">วิธีสั่งซื้อ</p>
          <h2 id="how-title" className="mt-2 text-2xl font-semibold tracking-[-0.015em] text-fg">
            ซื้อบนเว็บ รับในเกม
          </h2>
          <p className="mt-3 text-sm text-fg-muted">ทุกคำสั่งซื้อผูกกับ IRIS ID และติดตามสถานะได้ที่หน้าคำสั่งซื้อ</p>
        </div>
        <ol className="grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="bg-surface p-5 sm:p-6">
              <span className="font-mono text-xs text-accent">{String(index + 1).padStart(2, '0')}</span>
              <h3 className="mt-3 text-base font-semibold text-fg">{step.title}</h3>
              <p className="mt-2 text-sm text-fg-muted">{withClaimCommand(step.body)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export default HowItWorks;
