'use client';
import { IrisCoin } from '@/components/ui/IrisCoin';
import { T, useLanguage } from '@/components/i18n/LanguageProvider';


import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight,  Crosshair, Gift, Info, Lock, RotateCcw, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { ArrowLeft, ArrowRight, ArrowUpRight } from '@/components/tek/arrows';
import { Button } from '@/components/ui/Button';
import { INITIAL_QUESTS, PASS_TIERS, type PassTier, type QuestItem } from '@/lib/passPreview';

const INITIAL = { level: 6, xp: 1850, premium: false, tiers: [] as number[], quests: [] as string[] };
const PREVIEW_KEY = 'iris-pass-preview-v2';
const ITEM_ROOT = '/images/catalog/ark/items/';
const FREE_ART = ['primalitemresource_elementrefined', 'primalitemresource_elementdust', 'primalitemresource_elementrefined', 'primalitemresource_corruptedpolymer', 'primalitemresource_elementrefined', 'primalitemconsumable_kibble_rexegg', 'primalitemresource_elementrefined', 'primalitemresource_elementrefined', 'primalitemresource_elementrefined', 'primalitemarmor_tekhelmet'];
const PREMIUM_ART = ['primalitemarmor_tekhelmet_gen2', 'primalitem_tekrifle', 'primalitemarmor_metalhelmet', 'primalitemresource_elementshard', 'primalitemskin_chibidino_sinomacrops', 'primalitem_tekrifle', 'primalitemarmor_tekshirt', 'primalitemstructure_tekreplicator', 'primalitemarmor_rexsaddle_tek', 'primalitemconsumable_egg_wyvern_fertilized_tek'];

export function TekPassExperience() {
  const { t, language } = useLanguage();
  const [preview, setPreview] = useState(INITIAL);
  const [ready, setReady] = useState(false);
  const [questTab, setQuestTab] = useState<'daily' | 'season'>('daily');
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const track = useRef<HTMLOListElement>(null);

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(PREVIEW_KEY) || 'null');
      if (raw && typeof raw === 'object') {
        setPreview({
          level: Number.isInteger(raw.level) ? Math.max(1, Math.min(10, raw.level)) : 6,
          xp: Number.isFinite(raw.xp) ? Math.max(0, Math.min(1999, raw.xp)) : 1850,
          premium: raw.premium === true,
          tiers: Array.isArray(raw.tiers) ? raw.tiers.filter((id: unknown) => typeof id === 'number' && ((id >= 1 && id <= 10) || (id >= 1001 && id <= 1010))) : [],
          quests: Array.isArray(raw.quests) ? raw.quests.filter((id: unknown) => typeof id === 'string' && INITIAL_QUESTS.some((q) => q.id === id)) : [],
        });
      }
    } catch { /* Unavailable storage leaves the local preview usable. */ }
    setReady(true);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(PREVIEW_KEY, JSON.stringify(preview)); } catch { /* Optional persistence. */ }
  }, [preview, ready]);

  const announce = (text: string) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(text);
    timer.current = setTimeout(() => setToast(null), 3500);
  };

  const claimTier = (tier: PassTier, premium: boolean) => {
    const id = tier.tier + (premium ? 1000 : 0);
    if (!ready || preview.level < tier.tier || (premium && !preview.premium) || preview.tiers.includes(id)) return;
    setPreview((state) => ({ ...state, tiers: [...state.tiers, id] }));
    announce(`บันทึกตัวอย่างรางวัลระดับ ${tier.tier} แล้ว — ไม่มีการส่งของหรือเพิ่มเหรียญจริง`);
  };

  const claimQuest = (quest: QuestItem) => {
    if (!ready || quest.progress < quest.total || preview.quests.includes(quest.id)) return;
    setPreview((state) => {
      const xp = state.xp + quest.rewardExp;
      return { ...state, level: Math.min(10, state.level + Math.floor(xp / 2000)), xp: xp % 2000, quests: [...state.quests, quest.id] };
    });
    announce(`อัปเดตตัวอย่างความคืบหน้า +${quest.rewardExp} XP แล้ว`);
  };

  const scrollTrack = (direction: number) => {
    track.current?.scrollBy({ left: direction * 404, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };

  const renderReward = (tier: PassTier, premium: boolean) => {
    const claimed = preview.tiers.includes(tier.tier + (premium ? 1000 : 0));
    const locked = tier.tier > preview.level || (premium && !preview.premium);
    const coinReward = !premium && tier.freeIcon === 'coins';
    const title = premium ? tier.premiumRewardTh : tier.freeRewardTh;
    return (
      <div className="tek-panel pass-reward" data-premium={premium}>
        <div className="pass-reward-label"><span>{premium ? 'PREMIUM' : 'FREE ACCESS'}</span>{premium ? <Sparkles size={12} /> : <Gift size={12} />}</div>
        {coinReward ? <div className="pass-reward-art grid place-items-center text-iris-gold"><IrisCoin size={48} /></div> : <Image src={`${ITEM_ROOT}${(premium ? PREMIUM_ART : FREE_ART)[tier.tier - 1]}.webp`} alt="ภาพประกอบรางวัล" width={100} height={86} className="pass-reward-art" />}
        <p className="pass-reward-name"><T text={title} /></p>
        <Button size="sm" variant={premium ? 'gold' : 'secondary'} disabled={!ready || locked || claimed} onClick={() => claimTier(tier, premium)} aria-label={`ทดลองรับรางวัล ${premium ? 'Premium' : 'Free'} ระดับ ${tier.tier}`}>
          {claimed ? <><Check size={13} className="mr-1" /><T text={" ทดลองรับแล้ว"} /></> : locked ? <><Lock size={12} className="mr-1" /> {premium && !preview.premium ? 'Premium' : `ระดับ ${tier.tier}`}</> : 'ทดลองรับรางวัล'}
        </Button>
      </div>
    );
  };

  return (
    <div className="page-shell pass-page">
      <section className="tek-panel pass-hero" aria-labelledby="pass-title">
        <div className="pass-hero-copy">
          <span className="tek-label"><Crosshair size={14} /> SEASON 01 / TEK EXPEDITION</span>
          <h1 id="pass-title" className="pass-heading">IRIS <span>PASS</span></h1>
          <p><T text={"ทุกภารกิจ คือก้าวต่อไปของผู้รอดชีวิต"} /><br /><T text={"สำรวจเส้นทางรางวัล และปลดขีดจำกัดการผจญภัยของคุณ"} /></p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button variant={preview.premium ? 'secondary' : 'cyan'} disabled={!ready} onClick={() => { setPreview((state) => ({ ...state, premium: !state.premium })); announce('เปลี่ยนมุมมองตัวอย่างแล้ว ไม่มีการหักเหรียญ'); }} leftIcon={<Sparkles size={15} />}>
              <T text={preview.premium ? 'กำลังดู Premium' : 'ดูตัวอย่าง Premium'} />
            </Button>
            <Link href="#pass-rewards" className="inline-flex min-h-11 items-center gap-2 px-3 text-xs text-cyan-100"><T text={"สำรวจรางวัล "} /><ArrowUpRight size={15} /></Link>
          </div>
          <p className="pass-preview-note"><Info size={15} className="mt-1 shrink-0" /><span><T text={"SEASON PREVIEW · ความคืบหน้าและรางวัลเป็นตัวอย่าง"} /><br /><T text={"ยังไม่เชื่อมการรับของจริงหรือการชำระเงิน"} /></span></p>
        </div>
        <div className="pass-visual" aria-hidden="true">
          <div className="pass-orbit" />
          <Image src={`${ITEM_ROOT}primalitemarmor_tekhelmet.webp`} alt="" width={280} height={280} priority className="pass-helmet" />
          <span className="pass-visual-id">ELEMENT CORE / IRIS-01<br />SURVIVOR INTERFACE</span>
        </div>
      </section>

      <section className="pass-status-grid" aria-label="ตัวอย่างสถานะพาส">
        <div className="tek-panel pass-level"><span className="pass-level-number">{String(preview.level).padStart(2, '0')}</span><div><span className="tek-label">PASS LEVEL</span><small><T text={"ระดับผู้รอดชีวิต"} /></small></div></div>
        <div className="tek-panel pass-xp">
          <div className="pass-xp-head"><span className="inline-flex items-center gap-2"><Zap size={14} className="text-iris-cyan" />{preview.level < 10 ? (language === 'en' ? `Next level ${preview.level + 1}` : `สู่ระดับ ${preview.level + 1}`) : t('ระดับสูงสุด', 'Maximum level')}</span><span className="font-mono text-iris-cyan">{preview.xp.toLocaleString()} / 2,000 XP</span></div>
          <div className="pass-meter" role="progressbar" aria-label="ตัวอย่างประสบการณ์พาส" aria-valuemin={0} aria-valuemax={2000} aria-valuenow={preview.xp}><span style={{ width: `${preview.xp / 20}%` }} /></div>
        </div>
        <div className="tek-panel pass-summary"><ShieldCheck size={28} strokeWidth={1} className="text-iris-cyan" /><div><strong>{preview.quests.length}<span className="text-sm text-iris-muted"> / {INITIAL_QUESTS.length}</span></strong><small><T text={"ภารกิจที่ทดลองรับแล้ว"} /></small></div></div>
      </section>

      <section id="pass-rewards" className="min-w-0 scroll-mt-28" aria-labelledby="reward-title">
        <div className="pass-section-heading"><div><span className="tek-label">SUPPLY PROTOCOL / 10 LEVELS</span><h2 id="reward-title"><T text={"เส้นทางรางวัล"} /></h2></div><div className="pass-track-controls"><button type="button" onClick={() => scrollTrack(-1)} aria-label="เลื่อนรางวัลไปทางซ้าย"><ArrowLeft size={17} /></button><button type="button" onClick={() => scrollTrack(1)} aria-label="เลื่อนรางวัลไปทางขวา"><ArrowRight size={17} /></button></div></div>
        <ol ref={track} className="pass-reward-track" tabIndex={0} aria-label="รางวัล Free และ Premium ระดับ 1 ถึง 10">
          {PASS_TIERS.map((tier) => <li key={tier.tier} className="pass-tier" data-unlocked={preview.level >= tier.tier}><div className="pass-tier-header"><span>LEVEL {String(tier.tier).padStart(2, '0')}</span>{preview.level >= tier.tier ? <Check size={14} /> : <Lock size={12} />}</div>{renderReward(tier, false)}{renderReward(tier, true)}</li>)}
        </ol>
        <p className="mt-2 text-[11px] text-iris-muted"><T text={"เลื่อนดูรางวัลทั้ง 10 ระดับ · ภาพใช้ประกอบตัวอย่างรางวัล"} /></p>
      </section>

      <section className="tek-panel pass-missions" aria-labelledby="mission-title">
        <div className="pass-section-heading"><div><span className="tek-label"><Crosshair size={13} /> MISSION CONTROL</span><h2 id="mission-title"><T text={"ภารกิจของผู้รอดชีวิต"} /></h2></div><div className="pass-quest-tabs" role="group" aria-label="ประเภทภารกิจ"><button type="button" aria-pressed={questTab === 'daily'} onClick={() => setQuestTab('daily')}><T text={"รายวัน"} /></button><button type="button" aria-pressed={questTab === 'season'} onClick={() => setQuestTab('season')}><T text={"ประจำซีซัน"} /></button></div></div>
        <div className="pass-quest-grid">
          {INITIAL_QUESTS.filter((quest) => quest.category === questTab).map((quest, index) => {
            const claimed = preview.quests.includes(quest.id), completed = quest.progress >= quest.total;
            return <article key={quest.id} className="tek-panel pass-quest"><div className="pass-quest-head"><span className="pass-quest-number">{String(index + 1).padStart(2, '0')}</span><div className="min-w-0"><h3><T text={quest.titleTh} /></h3><small>{quest.titleEn}</small></div></div><div className="flex items-center gap-3"><div className="pass-meter flex-1" role="progressbar" aria-label={t(quest.titleTh, quest.titleEn)} aria-valuemin={0} aria-valuemax={quest.total} aria-valuenow={Math.min(quest.progress, quest.total)}><span style={{ width: `${Math.min(100, quest.progress / quest.total * 100)}%` }} /></div><span className="text-[10px] font-mono text-iris-muted">{quest.progress}/{quest.total}</span></div><div className="pass-quest-footer"><p>+{quest.rewardCoins} IC<span>+{quest.rewardExp} XP</span></p><Button size="sm" variant={claimed || !completed ? 'secondary' : 'cyan'} disabled={!ready || claimed || !completed} onClick={() => claimQuest(quest)}><T text={claimed ? 'ทดลองรับแล้ว' : completed ? 'ทดลองรับรางวัล' : 'กำลังดำเนินการ'} /></Button></div></article>;
          })}
        </div>
      </section>

      <div className="pass-preview-footer"><span><T text={"IRIS PASS / TEK EXPEDITION · ตัวอย่างในอุปกรณ์นี้"} /></span><button type="button" disabled={!ready} onClick={() => { setPreview(INITIAL); announce('รีเซ็ตข้อมูลตัวอย่างแล้ว'); }} className="inline-flex min-h-11 items-center gap-2 text-iris-cyan"><RotateCcw size={12} /><T text={" รีเซ็ตตัวอย่าง"} /></button><Link href="/servers" className="inline-flex min-h-11 items-center gap-1"><T text={"สำรวจเซิร์ฟเวอร์ "} /><ChevronRight size={13} /></Link></div>
      {toast && <div className="pass-toast" role="status">{toast}</div>}
    </div>
  );
}
