import Link from 'next/link';
import { FileX } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <div className="page-shell max-w-2xl mx-auto py-24 text-center space-y-4 animate-slide-up">
      <GlassCard className="p-12 text-center">
        <FileX className="mx-auto h-12 w-12 text-rose-400 mb-3" />
        <h1 className="text-2xl font-bold text-iris-pearl">ไม่พบหน้าที่ต้องการ</h1>
        <p className="text-xs text-iris-muted mt-1">ลิงก์อาจไม่ถูกต้อง หรือหน้านี้ถูกย้ายหรือลบไปแล้ว</p>
        <div className="mt-6">
          <Link href="/">
            <Button variant="primary">กลับหน้าแรก</Button>
          </Link>
        </div>
      </GlassCard>
    </div>
  );
}
