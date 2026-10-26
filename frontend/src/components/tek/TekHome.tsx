'use client';
import './tek-home.css';
import Link from 'next/link';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Crown, Gift, MessageCircle, Store, Target, Trophy, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { T, useLanguage } from '@/components/i18n/LanguageProvider';
import { useServerDirectoryQuery, useServerStatusQuery, useServersRoom } from '@/components/servers/useServerDirectory';
import { modeOfGroup, toServerView, type ModeTab } from '@/components/servers/serverFormat';
import { TekCountdown } from '@/components/tek/TekCountdown';
import { TekProductCard, type TekProduct } from '@/components/tek/TekProductCard';
import { useReveal, useTilt } from '@/components/tek/useTek';

const CHRISTMAS = '2026-12-25T00:00:00+07:00';
const ADVENT_OPENS = '2026-12-01T00:00:00+07:00';
const MODE_LABEL: Record<ModeTab, { name: string; cls: string }> = {
  pve: { name: 'PvE', cls: 'mode-pve' },
  'pve-mod': { name: 'PvE Mod', cls: 'mode-mod' },
  pvpve: { name: 'PvPvE', cls: 'mode-pvp' },
  other: { name: 'Other', cls: 'mode-other' },
};

function useHomeData() {
  useServersRoom(true);
  const directory = useServerDirectoryQuery();
  const status = useServerStatusQuery();
  const featured = useQuery<{ products: TekProduct[] }>({
    queryKey: ['featured-products'],
    queryFn: () => api.get('/products/featured').then((r) => r.data),
  });
  const catalogTotal = useQuery<number>({
    queryKey: ['catalog-total'],
    queryFn: () => api.get('/products', { params: { limit: 1 } }).then((r) => Number(r.data?.pagination?.total) || 0),
    staleTime: 5 * 60_000,
  });

  const clusters = useMemo(() => {
    const groups = directory.data?.groups ?? [];
    return groups
      .map((group) => {
        const views = group.servers.map((s) => toServerView(s, group, status.data?.byId?.[s.id]));
        const busy = [...views].sort((a, b) => b.players - a.players).slice(0, 4);
        return {
          key: group.key,
          name: group.name,
          mode: modeOfGroup(group),
          rates: group.rates,
          players: views.reduce((n, v) => n + v.players, 0),
          online: views.filter((v) => v.online).length,
          total: views.length,
          busy,
        };
      })
      .filter((c) => c.total > 0);
  }, [directory.data, status.data]);

  const totals = useMemo(
    () => ({
      players: clusters.reduce((n, c) => n + c.players, 0),
      online: clusters.reduce((n, c) => n + c.online, 0),
      servers: clusters.reduce((n, c) => n + c.total, 0),
    }),
    [clusters],
  );

  return { directory, featured, catalogTotal, clusters, totals };
}

function Advent() {
  // Read-only teaser until 1 Dec: there is no claim logic on the backend yet.
  const rows = [7, 6, 7, 5];
  let day = 0;
  return (
    <div className="tk-advent" aria-hidden="true">
      {rows.map((count, ri) => (
        <div className="tk-hrow" key={ri}>
          {Array.from({ length: count }, () => {
            day += 1;
            const big = day === 6 || day === 12 || day === 18 || day === 24 || day === 25;
            return (
              <span key={day} className={`tk-day${big ? ' big' : ''}`}>
                <b className="tk-mono">{String(day).padStart(2, '0')}</b>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function TekHome() {
  const { t } = useLanguage();
  const tilt = useTilt();
  const { directory, featured, catalogTotal, clusters, totals } = useHomeData();
  useReveal();

  const products = featured.data?.products ?? [];

  return (
    <div className="tk-home">
      <section className="tk-hero">
        <div className="tk-wrap tk-hero-in">
          <div className="tk-hero-copy">
            <span className="tk-season"><b>EVENT</b>WINTER WONDERLAND / IRIS TEK</span>
            <h1 className="tk-display">
              <T text="คริสต์มาสนี้" />
              <span className="tk-shine"><T text="เปิดประตู Tek" /></span>
            </h1>
            <p className="tk-lead">
              <T text="ซื้อของส่งเข้าเกมอัตโนมัติ แลกเปลี่ยนไดโนกับผู้เล่นจริง และติดตามเซิร์ฟเวอร์ IRIS ได้สดๆ ในที่เดียว เทศกาลคริสต์มาสเปิด 1 ธันวาคม" />
            </p>
            <div className="tk-cta">
              <Link href="/shop" className="tk-btn festive"><Store className="tk-i" aria-hidden="true" /><T text="เข้าสู่คลังสินค้า" /></Link>
              <Link href="/market" className="tk-btn ghost"><MessageCircle className="tk-i" aria-hidden="true" /><T text="ตลาดผู้เล่น" /></Link>
            </div>
            <TekCountdown target={CHRISTMAS} label={t('นับถอยหลังคริสต์มาส', 'Countdown to Christmas')} />
            <div className="tk-telemetry" aria-label={t('สถานะเครือข่าย', 'Network status')}>
              <div className="live"><b className="tk-mono">{totals.players}</b><small><T text="ผู้เล่นออนไลน์" /></small></div>
              <div><b className="tk-mono">{totals.servers ? `${totals.online}/${totals.servers}` : '-'}</b><small><T text="เซิร์ฟเวอร์ทำงาน" /></small></div>
              <div><b className="tk-mono">{catalogTotal.data ? catalogTotal.data.toLocaleString() : '-'}</b><small><T text="ไอเทมและไดโน" /></small></div>
              <div><b className="tk-mono">{clusters.length || '-'}</b><small><T text="คลัสเตอร์" /></small></div>
            </div>
          </div>
        </div>
      </section>

      <div className="tk-wrap">
        <nav className="tk-dock" aria-label={t('ทางลัด', 'Shortcuts')}>
          <Link href="/shop" className="tk-panel tk-tilt" {...tilt}><span className="ico tk-hex"><Store aria-hidden="true" /></span><b><T text="ร้านค้าทางการ" /></b><small><T text="ส่งเข้าเกมอัตโนมัติ" /></small></Link>
          <Link href="/market" className="tk-panel tk-tilt" {...tilt}><span className="ico tk-hex"><Users aria-hidden="true" /></span><b><T text="ตลาดผู้เล่น" /></b><small><T text="ลงขายไดโนผ่านเว็บ" /></small></Link>
          <Link href="/pass" className="tk-panel tk-tilt red" {...tilt}><span className="ico tk-hex"><Target aria-hidden="true" /></span><b><T text="เควสและไอริสพาส" /></b><small><T text="ภารกิจและรางวัล" /></small></Link>
          <Link href="/vip" className="tk-panel tk-tilt gold" {...tilt}><span className="ico tk-hex"><Crown aria-hidden="true" /></span><b><T text="สมาชิก VIP" /></b><small><T text="สิทธิ์พิเศษในเกม" /></small></Link>
        </nav>

        <section className="tk-block tk-rv" aria-labelledby="tk-winter">
          <div className="tk-head">
            <div>
              <span className="tk-kicker red">Winter Wonderland</span>
              <h2 id="tk-winter" className="tk-h2"><T text="ปฏิทินของขวัญ 25 วัน" /></h2>
              <p className="tk-muted"><T text="เทศกาลคริสต์มาสของ IRIS เปิดวันที่ 1 ธันวาคม ปฏิทินและของขวัญ VIP กำลังเตรียมพร้อม รายละเอียดของรางวัลจะประกาศก่อนเปิดงาน" /></p>
            </div>
          </div>
          <div className="tk-winter">
            <div className="tk-panel tk-brackets tk-advent-wrap tk-snowcap"><span className="tk-cap" />
              <header><h3><T text="ธันวาคม 2026" /></h3><span className="tk-tag red"><T text="เร็วๆ นี้" /></span></header>
              <Advent />
              <p className="tk-muted tk-note"><T text="ช่องทั้งหมดล็อกอยู่จนถึง 1 ธันวาคม ช่องสีทองคือรางวัลใหญ่" /></p>
              <TekCountdown target={ADVENT_OPENS} label={t('เปิดปฏิทินใน', 'Calendar opens in')} />
            </div>
            <div className="tk-panel tk-halo tk-snowcap tk-gift"><span className="tk-cap" />
              <header><h3>VIP Supply Drop</h3><span className="tk-tag gold"><T text="สำหรับ VIP" /></span></header>
              <div className="tk-crate"><img src="/images/tek/gift-crate.webp" alt={t('กล่องของขวัญ Tek ทรงหกเหลี่ยมวางบนแท่นฉาย', 'Hexagonal Tek gift crate on a projector pad')} width={900} height={900} loading="lazy" /></div>
              <p className="tk-muted"><T text="กล่องของขวัญสำหรับสมาชิก VIP แจกฟรีตามสิทธิ์ ไม่มีการขายกล่องด้วยเงินหรือ IC อัตราการออกของรางวัลจะแสดงให้ตรวจสอบได้ก่อนเปิดใช้งาน" /></p>
              <Link href="/vip" className="tk-btn gold"><Crown className="tk-i" aria-hidden="true" /><T text="ดูสิทธิ์ VIP" /></Link>
            </div>
          </div>
        </section>

        <section className="tk-block tk-rv" aria-labelledby="tk-servers">
          <div className="tk-head">
            <div>
              <span className="tk-kicker">Server telemetry</span>
              <h2 id="tk-servers" className="tk-h2"><T text="เลือกเซิร์ฟเวอร์ที่ใช่" /></h2>
              <p className="tk-muted"><T text="สถานะอัปเดตสดจากเซิร์ฟเวอร์จริง เปิดหน้าเซิร์ฟเวอร์เพื่อเข้าเล่นผ่าน Steam หรือ Epic" /></p>
            </div>
            <Link href="/servers" className="tk-more"><T text="ดูทุกเซิร์ฟเวอร์" /></Link>
          </div>
          {directory.isError ? (
            <p className="tk-muted"><T text="โหลดสถานะเซิร์ฟเวอร์ไม่ได้ในขณะนี้ ลองใหม่อีกครั้งในอีกสักครู่" /></p>
          ) : (
            <div className="tk-clusters">
              {(directory.isLoading ? Array.from({ length: 3 }) : clusters).map((c, i) => {
                if (!c) return <div key={i} className="tk-panel tk-cluster tk-skel" aria-hidden="true" />;
                const cl = c as (typeof clusters)[number];
                const meta = MODE_LABEL[cl.mode];
                const max = Math.max(1, ...cl.busy.map((v) => v.players));
                return (
                  <article key={cl.key} className={`tk-panel tk-cluster tk-tilt ${meta.cls}`} {...tilt}>
                    <header><span className="tk-tag">{meta.name}</span>{cl.rates ? <span className="tk-mono tk-muted">{cl.rates}</span> : null}</header>
                    <h3>{cl.name}</h3>
                    <div className="tk-gauge">
                      <div className="tk-hexnum"><b className="tk-mono">{cl.players}</b></div>
                      <div><b className="tk-mono">{cl.online}/{cl.total}</b><small><T text="แมพทำงาน" /></small></div>
                    </div>
                    <ul className="tk-maps">
                      {cl.busy.map((v) => (
                        <li key={v.server.id}>
                          <span>{v.server.displayName}</span>
                          <span className="meter"><span style={{ width: `${(v.players / max) * 100}%` }} /></span>
                          <b className="tk-mono">{v.players}</b>
                        </li>
                      ))}
                    </ul>
                    <Link href={`/servers?mode=${cl.mode}`} className="tk-btn ghost sm"><T text="ดูและเข้าเล่น" /></Link>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="tk-block tk-rv" aria-labelledby="tk-armory">
          <div className="tk-head">
            <div>
              <span className="tk-kicker gold">Featured</span>
              <h2 id="tk-armory" className="tk-h2"><T text="สินค้าแนะนำ" /></h2>
              <p className="tk-muted"><T text="สีกรอบบอกหมวดสินค้า กดเพื่อเลือกเซิร์ฟเวอร์ปลายทางและสั่งซื้อ" /></p>
            </div>
            <Link href="/shop" className="tk-more"><T text="เปิดคลังสินค้าทั้งหมด" /></Link>
          </div>
          {featured.isError ? (
            <p className="tk-muted"><T text="โหลดสินค้าไม่ได้ในขณะนี้ ลองใหม่อีกครั้งในอีกสักครู่" /></p>
          ) : (
            <div className="tk-armory">
              {featured.isLoading
                ? Array.from({ length: 6 }, (_, i) => <div key={i} className="tk-panel tk-card tk-skel" aria-hidden="true" />)
                : products.slice(0, 6).map((p) => <TekProductCard key={p.id} product={p} />)}
            </div>
          )}
        </section>

        <section className="tk-block tk-rv" aria-labelledby="tk-comms">
          <div className="tk-head">
            <div>
              <span className="tk-kicker">Community</span>
              <h2 id="tk-comms" className="tk-h2"><T text="ห้องนั่งเล่นของชาว IRIS" /></h2>
              <p className="tk-muted"><T text="คุยกัน แลกของ และอัปเดตข่าวสารร่วมกัน" /></p>
            </div>
          </div>
          <div className="tk-comms">
            <ol className="tk-panel tk-brackets tk-steps">
              <li><b><T text="ส่งไดโนขึ้นเว็บจากในเกม" /></b><span className="tk-muted"><T text="มองไดโนแล้วพิมพ์" /> <code>/market upload</code> <T text="หรือ" /> <code>/market upload group</code></span></li>
              <li><b><T text="ตั้งราคาบนเว็บ" /></b><span className="tk-muted"><T text="ไดโนจะอยู่ในร่าง ตั้งราคา IC แล้วกดเผยแพร่ในหน้ารายการขายของฉัน" /></span></li>
              <li><b><T text="รับของเมื่อซื้อสำเร็จ" /></b><span className="tk-muted"><T text="ผู้ซื้อรับไดโนด้วย" /> <code>/claimdino</code> <T text="ระบบโอน IC ให้ผู้ขายหลังส่งของสำเร็จ" /></span></li>
            </ol>
            <div className="tk-links">
              <a href="https://discord.gg/iris-thailand" target="_blank" rel="noopener noreferrer" className="tk-panel tk-tilt" {...tilt}><span className="ico tk-hex"><MessageCircle aria-hidden="true" /></span><b>Discord</b><small><T text="พูดคุยและรับข่าวสาร" /></small></a>
              <Link href="/ranking" className="tk-panel tk-tilt" {...tilt}><span className="ico tk-hex"><Trophy aria-hidden="true" /></span><b><T text="อันดับผู้เล่น" /></b><small><T text="ตารางคะแนนและชนเผ่า" /></small></Link>
              <Link href="/event" className="tk-panel tk-tilt red" {...tilt}><span className="ico tk-hex"><Gift aria-hidden="true" /></span><b><T text="กิจกรรม" /></b><small><T text="ปฏิทินกิจกรรม IRIS" /></small></Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default TekHome;
