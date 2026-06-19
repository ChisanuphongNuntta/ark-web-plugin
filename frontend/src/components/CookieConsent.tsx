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
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-ark-dark border-t border-gray-800 shadow-xl">
          <div className="container mx-auto max-w-6xl">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
              <div className="flex items-start gap-3 flex-1">
                <Cookie className="h-6 w-6 text-ark-gold flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold mb-1">เราใช้คุกกี้</h3>
                  <p className="text-sm text-gray-400">
                    เว็บไซต์นี้ใช้คุกกี้เพื่อปรับปรุงประสบการณ์การใช้งานของคุณ
                    คุกกี้ที่จำเป็นจะถูกใช้เสมอเพื่อให้บริการทำงานได้
                    คุณสามารถจัดการการตั้งค่าคุกกี้ได้{' '}
                    <Link href="/privacy" className="text-ark-accent hover:underline">
                      อ่านเพิ่มเติม
                    </Link>
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 w-full md:w-auto">
                <button
                  onClick={() => setShowSettings(true)}
                  className="btn btn-secondary flex items-center gap-2"
                >
                  <Settings className="h-4 w-4" />
                  ตั้งค่า
                </button>
                <button
                  onClick={handleAcceptNecessary}
                  className="btn btn-secondary"
                >
                  เฉพาะที่จำเป็น
                </button>
                <button
                  onClick={handleAcceptAll}
                  className="btn btn-primary"
                >
                  ยอมรับทั้งหมด
                </button>
              </div>
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
                  <Cookie className="h-6 w-6 text-ark-gold" />
                  ตั้งค่าคุกกี้
                </h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-2 hover:bg-gray-700 rounded"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Necessary Cookies */}
                <div className="p-4 bg-ark-darker rounded-lg">
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
                <div className="p-4 bg-ark-darker rounded-lg">
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
                      <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-ark-accent"></div>
                    </label>
                  </div>
                  <p className="text-sm text-gray-400">
                    ช่วยให้เราเข้าใจว่าผู้เยี่ยมชมใช้งานเว็บไซต์อย่างไร เพื่อปรับปรุงประสบการณ์การใช้งาน
                  </p>
                </div>

                {/* Marketing Cookies */}
                <div className="p-4 bg-ark-darker rounded-lg">
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
                      <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-ark-accent"></div>
                    </label>
                  </div>
                  <p className="text-sm text-gray-400">
                    ใช้เพื่อแสดงโฆษณาและโปรโมชันที่เกี่ยวข้องกับคุณ
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleSavePreferences}
                  className="btn btn-primary flex-1"
                >
                  บันทึกการตั้งค่า
                </button>
                <button
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
