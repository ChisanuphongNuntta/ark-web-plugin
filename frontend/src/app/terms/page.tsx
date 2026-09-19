'use client';

import { useQuery } from '@tanstack/react-query';
import { pdpaApi } from '@/lib/api';
import { Loader2, FileText, CheckCircle2 } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/Badge';
import Link from 'next/link';

export default function TermsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['terms-of-service'],
    queryFn: () => pdpaApi.getPolicy('terms_of_service').then((res) => res.data),
  });

  if (isLoading) {
    return (
      <div className="page-shell flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-iris-cyan" />
      </div>
    );
  }

  return (
    <div className="page-shell max-w-4xl mx-auto py-8 sm:py-12 space-y-8 animate-slide-up">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-iris-cyan animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-widest text-iris-cyan">
            LEGAL TERMS & GOVERNANCE
          </span>
        </div>
        <h1 className="mt-2 text-3xl font-black text-iris-pearl sm:text-4xl">
          ข้อกำหนดการใช้บริการ (Terms of Service)
        </h1>
        <p className="mt-2 text-sm text-iris-muted">
          กฎระเบียบ ข้อตกลง และเงื่อนไขการใช้งานบริการเครือข่ายเซิร์ฟเวอร์ IRIS ARK Expedition
        </p>
      </div>

      <GlassCard variant="default" className="p-6 sm:p-10 space-y-6">
        <div className="flex items-center gap-3 border-b border-white/5 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-iris-cyan/10 border border-iris-cyan/30 text-iris-cyan">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-iris-pearl">ข้อกำหนดและเงื่อนไขการใช้บริการ</h2>
            <p className="text-xs text-iris-muted">
              ปรับปรุงล่าสุด: {new Date().toLocaleDateString('th-TH')}
            </p>
          </div>
        </div>

        {error || !data?.policy ? (
          <div className="prose prose-invert max-w-none text-sm text-iris-muted space-y-6 leading-relaxed">
            <div>
              <h3 className="text-base font-bold text-iris-pearl mb-2">1. การยอมรับข้อกำหนด</h3>
              <p>
                การเข้าถึงหรือใช้บริการระบบร้านค้า Heart Shop และเครือข่ายเซิร์ฟเวอร์ IRIS ถือว่าท่านยอมรับข้อกำหนดและเงื่อนไขนี้ทั้งหมด หากท่านไม่ยอมรับข้อกำหนดเหล่านี้ กรุณาระงับการใช้งานระบบ
              </p>
            </div>

            <div>
              <h3 className="text-base font-bold text-iris-pearl mb-2">2. คำจำกัดความ</h3>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li><strong className="text-iris-pearl">&quot;บริการ&quot;</strong> หมายถึง ระบบเว็บช็อป Heart Shop และเซิร์ฟเวอร์เกม ARK ของ IRIS</li>
                <li><strong className="text-iris-pearl">&quot;Iris Coin (IC)&quot;</strong> หมายถึง คะแนนหน่วยเงินเสมือนภายในระบบ ใช้สำหรับแลกรับสัตว์และไอเทมในเกม</li>
                <li><strong className="text-iris-pearl">&quot;สินค้าเสมือน&quot;</strong> หมายถึง สัตว์เลี้ยง ไดโนเสาร์ พิมพ์เขียว และไอเทมดิจิทัลภายในเกม ARK</li>
                <li><strong className="text-iris-pearl">&quot;ผู้ใช้&quot;</strong> หมายถึง บุคคลที่ลงทะเบียนและใช้งานระบบ</li>
              </ul>
            </div>

            <div>
              <h3 className="text-base font-bold text-iris-pearl mb-2">3. บัญชีผู้ใช้และความรับผิดชอบ</h3>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>ผู้ใช้ต้องเชื่อมต่อบัญชี Discord เพื่อยืนยันตัวตน และเชื่อมต่อบัญชี Steam เพื่อรับสินค้าในเซิร์ฟเวอร์เกม</li>
                <li>ผู้ใช้ต้องรับผิดชอบต่อความปลอดภัยของบัญชีตนเอง ห้ามแบ่งปันบัญชีให้ผู้อื่น</li>
                <li>การตรวจพบการใช้งานโปรแกรมโกง หรือการเอาเปรียบระบบ (Exploits) จะส่งผลให้บัญชีถูกระงับสิทธิ์ถาวร</li>
              </ul>
            </div>

            <div>
              <h3 className="text-base font-bold text-iris-pearl mb-2">4. การเติมเงินและนโยบายการคืนเงิน</h3>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>การเติมเหรียญ Iris Coin ผ่านการโอนเงินจะได้รับการตรวจสอบและอนุมัติโดยเจ้าหน้าที่</li>
                <li>เหรียญ Iris Coin และสินค้าเสมือนที่จัดส่งสำเร็จในเกมแล้ว ไม่สามารถขอคืนเป็นเงินสดได้ เว้นแต่กรณีเกิดข้อผิดพลาดทางเทคนิคจากระบบที่พิสูจน์ได้</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="prose prose-invert max-w-none text-sm text-iris-muted">
            <div className="mb-4">
              <Badge variant="cyan">Version {data.policy.version}</Badge>
            </div>
            <div
              className="mt-4 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: data.policy.content }}
            />
          </div>
        )}
      </GlassCard>
    </div>
  );
}
