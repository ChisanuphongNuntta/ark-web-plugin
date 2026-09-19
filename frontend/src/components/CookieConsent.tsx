'use client';

import { useState, useEffect } from 'react';
import { Cookie, X, Settings } from 'lucide-react';
import Link from 'next/link';

const COOKIE_CONSENT_KEY = 'cookie-consent';

interface CookiePreferences {
  necessary: boolean; // Always true
  analytics: boolean;
  marketing: boolean;
}

export function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>({
    necessary: true,
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    // Check if consent has been given
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!consent) {
      setShowBanner(true);
    } else {
      try {
        const saved = JSON.parse(consent);
        setPreferences(saved);
      } catch {
        setShowBanner(true);
      }
    }
  }, []);

  const handleAcceptAll = () => {
    const allAccepted: CookiePreferences = {
      necessary: true,
      analytics: true,
      marketing: true,
    };
    savePreferences(allAccepted);
  };

  const handleAcceptNecessary = () => {
    const necessaryOnly: CookiePreferences = {
      necessary: true,
      analytics: false,
      marketing: false,
    };
    savePreferences(necessaryOnly);
  };

  const handleSavePreferences = () => {
    savePreferences(preferences);
  };

  const savePreferences = (prefs: CookiePreferences) => {
    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(prefs));
    setPreferences(prefs);
    setShowBanner(false);
    setShowSettings(false);

    // Dispatch event for other components to react to consent changes
    window.dispatchEvent(new CustomEvent('cookie-consent-changed', { detail: prefs }));
  };

  if (!showBanner) return null;

  return (
    <>
      {/* Main Banner */}
      {!showSettings && (
        <div className="fixed bottom-4 left-4 z-40 max-w-md p-3.5 sm:p-4 bg-[#081523]/95 backdrop-blur-xl border border-cyan-500/30 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.85)] text-slate-200 animate-slide-up">
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-300">
                <Cookie className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-white mb-0.5">การใช้งานคุกกี้ (Cookie Policy)</h3>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  เว็บไซต์นี้ใช้คุกกี้เพื่อปรับปรุงประสบการณ์การใช้งานของคุณ{' '}
                  <Link href="/privacy" className="text-cyan-300 underline underline-offset-2 hover:text-white">
                    อ่านเพิ่มเติม
                  </Link>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-white/5">
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="h-8 px-3 text-xs font-semibold rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 flex items-center gap-1.5 transition"
              >
                <Settings className="h-3.5 w-3.5" />
                ตั้งค่า
              </button>
              <button
                type="button"
                onClick={handleAcceptNecessary}
                className="h-8 px-3 text-xs font-semibold rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 transition"
              >
                เฉพาะที่จำเป็น
              </button>
              <button
                type="button"
                onClick={handleAcceptAll}
                className="h-8 px-3 text-xs font-bold rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-black shadow-[0_0_12px_rgba(55,229,210,0.4)] transition"
              >
                ยอมรับทั้งหมด
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Cookie className="h-6 w-6 text-iris-gold" />
                  ตั้งค่าคุกกี้
                </h2>
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="p-2 hover:bg-gray-700 rounded"
                  aria-label="ปิดหน้าต่างตั้งค่า"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Necessary Cookies */}
                <div className="p-4 bg-black/40 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">คุกกี้ที่จำเป็น</h3>
                    <span className="text-xs text-green-400 bg-green-500/20 px-2 py-1 rounded">
                      เปิดใช้งานเสมอ
                    </span>
                  </div>
                  <p className="text-sm text-gray-400">
                    คุกกี้เหล่านี้จำเป็นสำหรับการทำงานของเว็บไซต์ เช่น การเข้าสู่ระบบ และการรักษาความปลอดภัย
                    ไม่สามารถปิดการใช้งานได้
                  </p>
                </div>

                {/* Analytics Cookies */}
                <div className="p-4 bg-black/40 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">คุกกี้วิเคราะห์</h3>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={preferences.analytics}
                        onChange={(e) =>
                          setPreferences({ ...preferences, analytics: e.target.checked })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-iris-cyan"></div>
                    </label>
                  </div>
                  <p className="text-sm text-gray-400">
                    ช่วยให้เราเข้าใจว่าผู้เยี่ยมชมใช้งานเว็บไซต์อย่างไร เพื่อปรับปรุงประสบการณ์การใช้งาน
                  </p>
                </div>

                {/* Marketing Cookies */}
                <div className="p-4 bg-black/40 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">คุกกี้การตลาด</h3>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={preferences.marketing}
                        onChange={(e) =>
                          setPreferences({ ...preferences, marketing: e.target.checked })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-iris-cyan"></div>
                    </label>
                  </div>
                  <p className="text-sm text-gray-400">
                    ใช้เพื่อแสดงโฆษณาและโปรโมชันที่เกี่ยวข้องกับคุณ
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={handleSavePreferences}
                  className="btn btn-primary flex-1"
                >
                  บันทึกการตั้งค่า
                </button>
                <button
                  type="button"
                  onClick={handleAcceptAll}
                  className="btn btn-secondary"
                >
                  ยอมรับทั้งหมด
                </button>
              </div>

              <p className="text-xs text-gray-500 mt-4 text-center">
                <Link href="/privacy" className="hover:underline">
                  นโยบายความเป็นส่วนตัว
                </Link>
                {' | '}
                <Link href="/terms" className="hover:underline">
                  ข้อกำหนดการใช้บริการ
                </Link>
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
