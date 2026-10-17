'use client';

import { useQuery } from '@tanstack/react-query';
import { pdpaApi } from '@/lib/api';
import { Loader2, Shield, Lock, FileText } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/Badge';
import Link from 'next/link';

export default function PrivacyPolicyPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['privacy-policy'],
    queryFn: () => pdpaApi.getPolicy('privacy_policy').then((res) => res.data),
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
            DATA PRIVACY & COMPLIANCE
          </span>
        </div>
        <h1 className="mt-2 text-3xl font-black text-iris-pearl sm:text-4xl">
          นโยบายความเป็นส่วนตัว (Privacy Policy)
        </h1>
        <p className="mt-2 text-sm text-iris-muted">
          การคุ้มครองข้อมูลส่วนบุคคลตามมาตรฐาน PDPA และความปลอดภัยของระบบ IRIS Expedition
        </p>
      </div>

      {/* TL;DR Summary Card */}
      <div className="rounded-3xl border border-iris-cyan/30 bg-gradient-to-r from-iris-cyan/10 via-black/40 to-iris-cyan/5 p-5 sm:p-6 backdrop-blur-md space-y-3">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-iris-cyan">
          <Shield className="h-4 w-4" />
          <span>สรุปใจความสำคัญใน 30 วินาที (TL;DR Summary)</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 text-xs text-slate-300">
          <div className="flex items-start gap-2 bg-black/30 p-2.5 rounded-xl border border-white/5">
            <span className="text-iris-cyan font-bold">1.</span>
            <span>เก็บเฉพาะ Discord & Steam ID เพื่อยืนยันตัวตนและส่งของขวัญในเกม</span>
          </div>
          <div className="flex items-start gap-2 bg-black/30 p-2.5 rounded-xl border border-white/5">
            <span className="text-iris-cyan font-bold">2.</span>
            <span>ไม่มีการจำหน่าย หรือเปิดเผยข้อมูลผู้เล่นแก่บุคคลภายนอก 100%</span>
          </div>
          <div className="flex items-start gap-2 bg-black/30 p-2.5 rounded-xl border border-white/5">
            <span className="text-iris-cyan font-bold">3.</span>
            <span>ธุรกรรมเหรียญ IC บันทึกผ่าน Double-Entry Ledger มี Audit Trail ย้อนหลัง</span>
          </div>
          <div className="flex items-start gap-2 bg-black/30 p-2.5 rounded-xl border border-white/5">
            <span className="text-iris-cyan font-bold">4.</span>
            <span>ขอดาวน์โหลดสำเนาหรือขอลบข้อมูลถาวรได้ตลอด 24 ชม. ผ่าน Data Portal</span>
          </div>
        </div>
      </div>

      <GlassCard variant="default" className="p-6 sm:p-10 space-y-6">
        <div className="flex items-center gap-3 border-b border-white/5 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-iris-cyan/10 border border-iris-cyan/30 text-iris-cyan">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-iris-pearl">ประกาศนโยบายความเป็นส่วนตัว</h2>
            <p className="text-xs text-iris-muted">
              ปรับปรุงล่าสุด: {new Date().toLocaleDateString('th-TH')}
            </p>
          </div>
        </div>

        {error || !data?.policy ? (
          <div className="prose prose-invert max-w-none text-sm text-iris-muted space-y-6 leading-relaxed">
            <div>
              <h3 className="text-base font-bold text-iris-pearl mb-2">1. ข้อมูลที่เราเก็บรวบรวม</h3>
              <p>เราเก็บรวบรวมข้อมูลส่วนบุคคลของท่านเพื่อประโยชน์ในการให้บริการเกม ดังต่อไปนี้:</p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li><strong className="text-iris-pearl">ข้อมูล Discord:</strong> Discord ID, ชื่อผู้ใช้ Discord, รูปโปรไฟล์</li>
                <li><strong className="text-iris-pearl">ข้อมูล Steam:</strong> Steam ID (เมื่อเชื่อมต่อบัญชี)</li>
                <li><strong className="text-iris-pearl">ข้อมูลการใช้งาน:</strong> ประวัติการสั่งซื้อ, ประวัติการเติมเงิน, ยอด Iris Coin, เวลาเล่นเกม</li>
                <li><strong className="text-iris-pearl">ข้อมูลทางเทคนิค:</strong> IP Address, User Agent, เซสชันการเข้าสู่ระบบ</li>
              </ul>
            </div>

            <div>
              <h3 className="text-base font-bold text-iris-pearl mb-2">2. วัตถุประสงค์ในการใช้ข้อมูล</h3>
              <p>เราใช้ข้อมูลของท่านเพื่อ:</p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>ยืนยันตัวตนและจัดการความปลอดภัยของบัญชีผู้ใช้</li>
                <li>ให้บริการร้านค้า ส่งมอบสัตว์ ไดโนเสาร์ และไอเทมในเกม ARK โดยอัตโนมัติ</li>
                <li>คำนวณและจัดการยอดเหรียญ Iris Coin ในกระเป๋าเงินดิจิทัล</li>
                <li>แจ้งเตือนสถานะคำสั่งซื้อและบริการช่วยเหลือผู้เล่น</li>
                <li>ปรับปรุงและพัฒนาระบบความเสถียรของคลัสเตอร์เซิร์ฟเวอร์</li>
              </ul>
            </div>

            <div>
              <h3 className="text-base font-bold text-iris-pearl mb-2">3. สิทธิของเจ้าของข้อมูล (PDPA Rights)</h3>
              <p>ตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล ท่านมีสิทธิดังต่อไปนี้:</p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>สิทธิในการเข้าถึงและขอรับสำเนาข้อมูลส่วนบุคคล</li>
                <li>สิทธิในการขอแก้ไขข้อมูลให้ถูกต้องและเป็นปัจจุบัน</li>
                <li>สิทธิในการขอลบหรือทำลายข้อมูลส่วนบุคคล (Right to Erasure)</li>
                <li>สิทธิในการขอโอนย้ายข้อมูล (Data Portability)</li>
                <li>สิทธิในการเพิกถอนความยินยอม</li>
              </ul>
            </div>

            <div className="rounded-xl border border-iris-cyan/20 bg-iris-cyan/5 p-4 text-xs">
              <p className="text-iris-pearl font-semibold mb-1">ต้องการส่งคำร้องขอข้อมูลหรือลบบัญชี?</p>
              <p className="text-iris-muted">
                ท่านสามารถส่งคำร้องขอดาวน์โหลดข้อมูลหรือลบข้อมูลส่วนบุคคลได้ที่เมนู{' '}
                <Link href="/profile/data" className="text-iris-cyan hover:underline font-bold">
                  จัดการข้อมูลส่วนบุคคล (Data Privacy Portal)
                </Link>
              </p>
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
