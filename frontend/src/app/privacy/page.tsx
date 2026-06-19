'use client';

import { useQuery } from '@tanstack/react-query';
import { pdpaApi } from '@/lib/api';
import { Loader2, Shield } from 'lucide-react';
import Link from 'next/link';

export default function PrivacyPolicyPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['privacy-policy'],
    queryFn: () => pdpaApi.getPolicy('privacy_policy').then(res => res.data),
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
          <Shield className="h-8 w-8 text-ark-accent" />
          <h1 className="text-3xl font-bold">นโยบายความเป็นส่วนตัว</h1>
        </div>

        {error || !data?.policy ? (
          <div className="prose prose-invert max-w-none">
            <h2>นโยบายความเป็นส่วนตัว (Privacy Policy)</h2>
            <p className="text-gray-400">
              ปรับปรุงล่าสุด: {new Date().toLocaleDateString('th-TH')}
            </p>

            <h3>1. ข้อมูลที่เราเก็บรวบรวม</h3>
            <p>เราเก็บรวบรวมข้อมูลส่วนบุคคลของท่านดังต่อไปนี้:</p>
            <ul>
              <li><strong>ข้อมูล Discord:</strong> Discord ID, ชื่อผู้ใช้ Discord, รูปโปรไฟล์</li>
              <li><strong>ข้อมูล Steam:</strong> Steam ID (เมื่อเชื่อมต่อ)</li>
              <li><strong>ข้อมูลการใช้งาน:</strong> ประวัติการซื้อ, ยอด Iris Coin, เวลาเล่นเกม</li>
              <li><strong>ข้อมูลทางเทคนิค:</strong> IP Address, User Agent, Cookies</li>
            </ul>

            <h3>2. วัตถุประสงค์ในการใช้ข้อมูล</h3>
            <p>เราใช้ข้อมูลของท่านเพื่อ:</p>
            <ul>
              <li>ยืนยันตัวตนและจัดการบัญชีผู้ใช้</li>
              <li>ให้บริการร้านค้าและส่งมอบสินค้าในเกม</li>
              <li>คำนวณและจัดการ Iris Coin</li>
              <li>ติดต่อสื่อสารเกี่ยวกับบริการ</li>
              <li>ปรับปรุงบริการของเรา</li>
            </ul>

            <h3>3. การเปิดเผยข้อมูล</h3>
            <p>เราไม่ขายข้อมูลส่วนบุคคลของท่าน แต่อาจเปิดเผยข้อมูลในกรณีต่อไปนี้:</p>
            <ul>
              <li>เมื่อได้รับความยินยอมจากท่าน</li>
              <li>เพื่อปฏิบัติตามกฎหมาย</li>
              <li>เพื่อป้องกันการฉ้อโกงหรือการใช้งานที่ผิดกฎ</li>
            </ul>

            <h3>4. สิทธิของเจ้าของข้อมูล</h3>
            <p>ตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA) ท่านมีสิทธิ:</p>
            <ul>
              <li><strong>สิทธิในการเข้าถึง:</strong> ขอสำเนาข้อมูลส่วนบุคคลของท่าน</li>
              <li><strong>สิทธิในการแก้ไข:</strong> ขอแก้ไขข้อมูลที่ไม่ถูกต้อง</li>
              <li><strong>สิทธิในการลบ:</strong> ขอให้ลบข้อมูลส่วนบุคคลของท่าน</li>
              <li><strong>สิทธิในการโอนย้าย:</strong> ขอรับข้อมูลในรูปแบบที่อ่านได้ด้วยเครื่อง</li>
              <li><strong>สิทธิในการคัดค้าน:</strong> คัดค้านการประมวลผลข้อมูล</li>
              <li><strong>สิทธิในการถอนความยินยอม:</strong> ถอนความยินยอมที่เคยให้ไว้</li>
            </ul>

            <h3>5. การรักษาความปลอดภัย</h3>
            <p>
              เราใช้มาตรการรักษาความปลอดภัยตามมาตรฐาน ISO 27001 เพื่อปกป้องข้อมูลของท่าน
              รวมถึงการเข้ารหัสข้อมูล, การควบคุมการเข้าถึง, และการตรวจสอบความปลอดภัยอย่างสม่ำเสมอ
            </p>

            <h3>6. ระยะเวลาในการเก็บข้อมูล</h3>
            <p>
              เราเก็บข้อมูลของท่านตราบเท่าที่จำเป็นสำหรับวัตถุประสงค์ที่ระบุไว้
              หรือตามที่กฎหมายกำหนด หลังจากนั้นข้อมูลจะถูกลบหรือทำให้ไม่สามารถระบุตัวตนได้
            </p>

            <h3>7. การติดต่อ</h3>
            <p>
              หากท่านมีคำถามเกี่ยวกับนโยบายนี้ หรือต้องการใช้สิทธิตาม PDPA
              กรุณาติดต่อเราผ่าน Discord Server หรือหน้า{' '}
              <Link href="/profile" className="text-ark-accent hover:underline">
                โปรไฟล์
              </Link>
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
          <h3 className="text-lg font-semibold mb-4">จัดการข้อมูลของคุณ</h3>
          <div className="flex flex-wrap gap-4">
            <Link href="/profile/data" className="btn btn-secondary">
              ขอสำเนาข้อมูล / ลบข้อมูล
            </Link>
            <Link href="/profile" className="btn btn-secondary">
              จัดการความยินยอม
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
