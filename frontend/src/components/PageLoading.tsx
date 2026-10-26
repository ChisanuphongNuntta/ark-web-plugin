import { T } from '@/components/i18n/LanguageProvider';
import Image from 'next/image';

export function PageLoading() {
  return (
    <div className="iris-loading-content" role="status" aria-live="polite">
      <Image src="/images/brand/iris-emblem-v1.webp" alt="" width={92} height={92} priority className="iris-loading-mark" />
      <span className="iris-loading-brand">IRIS Thailand</span>
      <span className="iris-loading-caption"><T text={"กำลังเตรียมการเดินทางของคุณ"} /></span>
      <span className="iris-loading-track" aria-hidden="true"><span /></span>
      <span className="sr-only"><T text={"กำลังโหลด กรุณารอสักครู่"} /></span>
    </div>
  );
}
