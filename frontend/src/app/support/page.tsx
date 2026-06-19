'use client';

import { useState } from 'react';
import { HelpCircle, Mail, MessageSquare, AlertTriangle, Shield, CheckCircle, ChevronDown } from 'lucide-react';
import LaserCard from '@/components/LaserCard';
import LaserButton from '@/components/LaserButton';
import LaserModal from '@/components/LaserModal';

// Mock FAQ database
const faqList = [
  {
    question: 'เติมเงินแล้วไม่ได้รับ Iris Coins (IC) ต้องทำอย่างไร?',
    answer: 'หากทำรายการชำระเงินสำเร็จเรียบร้อยแต่ไม่ได้รับ IC กรุณาเตรียมสลิปหรือหลักฐานการชำระเงิน แล้วส่งคำร้องแจ้งทีมงานผ่านระบบตั๋วชำระเงินด้านล่าง ทีมงานจะตรวจสอบและสปอนเซอร์ยอดให้ทันทีภายใน 15-30 นาที',
  },
  {
    question: 'ซื้อพิมพ์เขียว (Blueprint) หรือไอเทมแล้ว ดรอปลงตัวละครอย่างไร?',
    answer: 'หลังจากกดยืนยันการสั่งซื้อในหน้าร้านค้า ระบบจะส่งข้อมูลไปยังคิวอิงเจกชัน คุณต้องเข้าสู่ระบบสมาชิกและระบุ Steam ID ของตัวละคร จากนั้นพิมพ์คำสั่ง /claim ในช่องแชทภายในเกมเพื่อรับไอเทมได้ทันที',
  },
  {
    question: 'สิทธิพิเศษของระบบ New Player Protection ป้องกันอะไรบ้าง?',
    answer: 'ระบบป้องกันผู้เล่นใหม่จะช่วยคุ้มครองตัวผู้เล่น สิ่งก่อสร้าง (Structure) และไดโนเสาร์ส่วนตัวของคุณจากความเสียหายทุกรูปแบบที่เกิดจากผู้เล่นคนอื่น (PVP) เป็นเวลา 7 วัน ช่วยให้คุณตั้งตัวได้อย่างมั่นใจ',
  },
  {
    question: 'หากซื้อสินค้าผิดชนิดหรือซื้อผิดเซิร์ฟเวอร์ สามารถขอเงินคืนได้ไหม?',
    answer: 'ตามข้อกำหนดการใช้บริการของบริษัท สินค้าประเภทดิจิทัลและเหรียญรางวัล IC ไม่สามารถทำการยกเลิก หรือคืนเงินเป็นเงินสดได้ในทุกกรณี โปรดตรวจสอบชนิดของไอเทม เซิร์ฟเวอร์ และจำนวนให้ถูกต้องก่อนยืนยันรายการ',
  },
];

export default function SupportPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  
  // Form states
  const [discordUsername, setDiscordUsername] = useState('');
  const [steamId, setSteamId] = useState('');
  const [ticketCategory, setTicketCategory] = useState('recharge');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    content: React.ReactNode;
    confirmText?: string;
    variant?: 'default' | 'danger' | 'warning' | 'success';
    singleButton?: boolean;
  }>({
    isOpen: false,
    title: '',
    content: null,
  });

  const toggleFaq = (idx: number) => {
    setOpenFaq(openFaq === idx ? null : idx);
  };

  const handleSubmitTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!discordUsername || !message) {
      setModalConfig({
        isOpen: true,
        title: 'ระบบตรวจสอบ',
        content: <p className="text-xs text-gray-400">กรุณากรอกข้อมูลชื่อผู้ใช้งานและรายละเอียดปัญหาก่อนกดส่งตั๋วคำร้อง</p>,
        variant: 'warning',
        singleButton: true,
        confirmText: 'รับทราบ',
      });
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setModalConfig({
        isOpen: true,
        title: 'TICKET CREATED SUCCESSFULLY',
        content: (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">ส่งข้อมูลคำร้องแจ้งปัญหาไปยังฝ่ายสนับสนุนเรียบร้อย:</p>
            <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 space-y-1.5 text-xs text-left">
              <p><span className="text-gray-500 uppercase tracking-widest">CATEGORY:</span> <span className="text-ark-primary font-black uppercase">{ticketCategory}</span></p>
              <p><span className="text-gray-500 uppercase tracking-widest">SURVIVOR:</span> <span className="text-white font-black">{discordUsername}</span></p>
              <p><span className="text-gray-500 uppercase tracking-widest">STATUS:</span> <span className="text-ark-accent font-black">PENDING OPERATOR</span></p>
            </div>
            <p className="text-[10px] text-gray-500 font-bold uppercase mt-2">ทีมงานฝ่ายวิเคราะห์จะรีบตรวจสอบปัญหานี้และติดต่อกลับคุณผ่าน Discord</p>
          </div>
        ),
        variant: 'success',
        singleButton: true,
        confirmText: 'ตกลง',
      });

      // Clear form
      setDiscordUsername('');
      setSteamId('');
      setTicketCategory('recharge');
      setMessage('');
    }, 1500);
  };

  return (
    <div className="space-y-8 py-6 relative">
      
      {/* Title */}
      <div className="relative inline-block">
        <div className="absolute inset-0 bg-ark-primary/10 rounded-2xl blur-2xl"></div>
        <h1 className="text-3xl font-black bg-gradient-to-r from-ark-primary via-ark-accent to-ark-primary bg-clip-text text-transparent relative flex items-center gap-3 tracking-widest uppercase">
          <div className="relative">
            <div className="absolute inset-0 bg-ark-primary/25 rounded-full blur-md animate-pulse"></div>
            <HelpCircle className="h-8 w-8 text-ark-primary relative" />
          </div>
          SUPPORT DESK
        </h1>
      </div>

      {/* 2-Column FAQs and Ticket Submission */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        
        {/* FAQs accordion (Left 3 Cols) */}
        <div className="lg:col-span-3 space-y-6">
          <div className="flex items-center gap-2 px-1">
            <HelpCircle className="w-4.5 h-4.5 text-ark-primary" />
            <h2 className="text-sm font-black text-white uppercase tracking-widest">FREQUENTLY ASKED QUESTIONS</h2>
          </div>

          <div className="space-y-4">
            {faqList.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <LaserCard key={idx} className="border-white/5" glowOnHover={!isOpen}>
                  <div className="bg-gradient-to-b from-ark-panel/60 to-ark-dark/40 overflow-hidden">
                    <button
                      onClick={() => toggleFaq(idx)}
                      className="w-full flex items-center justify-between p-5 text-left text-xs font-black text-white tracking-wide uppercase transition-colors hover:text-ark-primary"
                    >
                      <span>{faq.question}</span>
                      <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform duration-300 ${isOpen ? 'rotate-180 text-ark-primary' : ''}`} />
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-5 pt-1 text-xs text-gray-400 leading-relaxed border-t border-white/5 bg-black/10">
                        {faq.answer}
                      </div>
                    )}
                  </div>
                </LaserCard>
              );
            })}
          </div>
        </div>

        {/* Support Ticket Submission Console (Right 2 Cols) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center gap-2 px-1">
            <MessageSquare className="w-4.5 h-4.5 text-ark-accent" />
            <h3 className="text-sm font-black text-white uppercase tracking-widest">SUBMIT A TICKET</h3>
          </div>

          <LaserCard variant="cyan">
            <form onSubmit={handleSubmitTicket} className="p-6 space-y-4 bg-gradient-to-b from-ark-panel/85 to-[#07111F]">
              
              {/* Category Picker */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">CATEGORY</label>
                <select
                  value={ticketCategory}
                  onChange={(e) => setTicketCategory(e.target.value)}
                  className="input text-xs font-bold uppercase tracking-wider bg-black/60 border-white/5"
                >
                  <option value="recharge">RECHARGE / PAYMENT ISSUE (ปัญหาเติมเงิน)</option>
                  <option value="item">ITEM DELIVERY ISSUE (ปัญหารับไอเทม)</option>
                  <option value="bug">SERVER GLITCH & BUG (แจ้งพบบั๊ก)</option>
                  <option value="PDPA">PDPA DATA REMOVAL (ลบข้อมูล PDPA)</option>
                </select>
              </div>

              {/* Discord Username */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">DISCORD USERNAME</label>
                <input
                  type="text"
                  placeholder="Survivor#1234"
                  value={discordUsername}
                  onChange={(e) => setDiscordUsername(e.target.value)}
                  className="input text-xs font-bold bg-black/60 border-white/5"
                />
              </div>

              {/* Steam ID */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">STEAM ID (OPTIONAL)</label>
                <input
                  type="text"
                  placeholder="76561198xxxxxxxx"
                  value={steamId}
                  onChange={(e) => setSteamId(e.target.value)}
                  className="input text-xs font-bold bg-black/60 border-white/5"
                />
              </div>

              {/* Message Details */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">ISSUE DETAILED DESCRIPTION</label>
                <textarea
                  placeholder="อธิบายรายละเอียดปัญหาที่คุณพบบนเซิร์ฟเวอร์ หรือรหัสสลิปที่เติมเงิน..."
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="input text-xs font-medium bg-black/60 border-white/5 resize-none leading-relaxed"
                />
              </div>

              {/* Security confirmation */}
              <div className="flex items-center gap-2 p-3 rounded-xl bg-white/2 border border-white/5 text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                <Shield className="w-4 h-4 text-ark-primary flex-shrink-0" />
                <span>การเชื่อมต่อส่งคำร้องได้รับการเข้ารหัสความปลอดภัย SSL</span>
              </div>

              {/* Action Submit */}
              <LaserButton
                type="submit"
                variant="primary"
                className="w-full tracking-widest font-black uppercase text-xs"
                loading={isSubmitting}
              >
                SUBMIT PROTOCOL
              </LaserButton>

            </form>
          </LaserCard>
        </div>

      </div>

      {/* Laser dialog box */}
      <LaserModal
        isOpen={modalConfig.isOpen}
        onClose={() => setModalConfig((prev) => ({ ...prev, isOpen: false }))}
        title={modalConfig.title}
        variant={modalConfig.variant}
        confirmText={modalConfig.confirmText}
        singleButton={modalConfig.singleButton}
      >
        {modalConfig.content}
      </LaserModal>

    </div>
  );
}
