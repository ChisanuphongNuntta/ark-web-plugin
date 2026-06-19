'use client';

import { useQuery } from '@tanstack/react-query';
import { pdpaApi } from '@/lib/api';
import { Loader2, FileText } from 'lucide-react';
import Link from 'next/link';

export default function TermsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['terms-of-service'],
    queryFn: () => pdpaApi.getPolicy('terms_of_service').then(res => res.data),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-ark-accent" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="card p-8">
        <div className="flex items-center gap-3 mb-6">
          <FileText className="h-8 w-8 text-ark-accent" />
          <h1 className="text-3xl font-bold">ข้อกำหนดการใช้บริการ</h1>
        </div>

        {error || !data?.policy ? (
          <div className="prose prose-invert max-w-none">
            <h2>ข้อกำหนดและเงื่อนไขการใช้บริการ</h2>
            <p className="text-gray-400">
              ปรับปรุงล่าสุด: {new Date().toLocaleDateString('th-TH')}
            </p>

            <h3>1. การยอมรับข้อกำหนด</h3>
            <p>
              การใช้บริการ Heart Shop ถือว่าท่านยอมรับข้อกำหนดและเงื่อนไขนี้ทั้งหมด
              หากท่านไม่ยอมรับข้อกำหนดเหล่านี้ กรุณาหยุดใช้บริการ
            </p>

            <h3>2. คำจำกัดความ</h3>
            <ul>
              <li><strong>&quot;บริการ&quot;</strong> หมายถึง ระบบร้านค้า Heart Shop สำหรับเกม ARK</li>
              <li><strong>&quot;Iris Coin&quot;</strong> หมายถึง หน่วยเงินในระบบที่ใช้ซื้อสินค้า</li>
              <li><strong>&quot;สินค้า&quot;</strong> หมายถึง ไอเทมเสมือนในเกม ARK</li>
              <li><strong>&quot;ผู้ใช้&quot;</strong> หมายถึง บุคคลที่ใช้บริการนี้</li>
            </ul>

            <h3>3. บัญชีผู้ใช้</h3>
            <ul>
              <li>ท่านต้องเชื่อมต่อบัญชี Discord เพื่อใช้บริการ</li>
              <li>ท่านต้องเชื่อมต่อบัญชี Steam เพื่อรับสินค้าในเกม</li>
              <li>ท่านต้องรับผิดชอบต่อกิจกรรมทั้งหมดที่เกิดขึ้นในบัญชีของท่าน</li>
              <li>ห้ามแบ่งปันหรือโอนบัญชีให้ผู้อื่น</li>
            </ul>

            <h3>4. Iris Coin และการซื้อสินค้า</h3>
            <ul>
              <li>Iris Coin ได้มาจากการเติมเงิน หรือกิจกรรมพิเศษ</li>
              <li>Iris Coin ไม่สามารถแลกเปลี่ยนเป็นเงินจริงได้</li>
              <li>การซื้อสินค้าถือเป็นที่สิ้นสุด ไม่สามารถคืนเงินได้ ยกเว้นกรณีที่ระบบผิดพลาด</li>
              <li>สินค้าจะถูกส่งไปยังเซิร์ฟเวอร์ที่เลือกโดยอัตโนมัติ</li>
            </ul>

            <h3>5. พฤติกรรมที่ห้าม</h3>
            <p>ห้ามผู้ใช้:</p>
            <ul>
              <li>ใช้ช่องโหว่หรือบั๊กเพื่อหาประโยชน์</li>
              <li>พยายามแฮ็กหรือเจาะระบบ</li>
              <li>สร้างหลายบัญชีเพื่อหลีกเลี่ยงการแบน</li>
              <li>ซื้อขาย Iris Coin หรือบัญชีกับผู้อื่น</li>
              <li>ใช้โปรแกรมโกง (Cheats) ในเกม</li>
            </ul>

            <h3>6. การระงับบัญชี</h3>
            <p>
              เราสงวนสิทธิ์ในการระงับหรือยกเลิกบัญชีของท่านหากท่านละเมิดข้อกำหนดเหล่านี้
              Iris Coin และสินค้าอาจถูกริบคืนโดยไม่ต้องแจ้งล่วงหน้า
            </p>

            <h3>7. การเปลี่ยนแปลงข้อกำหนด</h3>
            <p>
              เราอาจเปลี่ยนแปลงข้อกำหนดเหล่านี้ได้ตลอดเวลา
              การใช้บริการต่อหลังจากการเปลี่ยนแปลงถือว่าท่านยอมรับข้อกำหนดใหม่
            </p>

            <h3>8. ข้อจำกัดความรับผิดชอบ</h3>
            <p>
              บริการนี้ให้บริการ &quot;ตามสภาพ&quot; เราไม่รับประกันว่าบริการจะไม่มีข้อผิดพลาด
              หรือพร้อมใช้งานตลอดเวลา เราไม่รับผิดชอบต่อความเสียหายใดๆ
              ที่เกิดจากการใช้บริการนี้
            </p>

            <h3>9. กฎหมายที่ใช้บังคับ</h3>
            <p>
              ข้อกำหนดเหล่านี้อยู่ภายใต้กฎหมายแห่งราชอาณาจักรไทย
            </p>

            <h3>10. การติดต่อ</h3>
            <p>
              หากท่านมีคำถามเกี่ยวกับข้อกำหนดเหล่านี้ กรุณาติดต่อเราผ่าน Discord Server
            </p>
          </div>
        ) : (
          <div className="prose prose-invert max-w-none">
            <p className="text-gray-400 mb-4">
              เวอร์ชัน: {data.policy.version} |
              มีผลบังคับใช้: {new Date(data.policy.effectiveAt).toLocaleDateString('th-TH')}
            </p>
            <div dangerouslySetInnerHTML={{ __html: data.policy.contentTh || data.policy.content }} />
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-gray-700">
          <div className="flex gap-4">
            <Link href="/privacy" className="text-ark-accent hover:underline">
              นโยบายความเป็นส่วนตัว
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
