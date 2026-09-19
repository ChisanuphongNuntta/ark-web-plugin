'use client';

import * as React from 'react';
import { Sparkles, EyeOff, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PrismaticRiverGate() {
  const [scrollProgress, setScrollProgress] = React.useState(0);
  const [motionDisabled, setMotionDisabled] = React.useState(false);

  // Sync scroll position to alter the gradient refraction mapping dynamically
  React.useEffect(() => {
    // Check if the user has system-level reduced motion active
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) {
      setMotionDisabled(true);
    }

    const handleScroll = () => {
      if (motionDisabled) return;
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (totalHeight > 0) {
        const progress = window.scrollY / totalHeight;
        setScrollProgress(progress);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [motionDisabled]);

  const toggleMotion = () => {
    setMotionDisabled((prev) => !prev);
  };

  // Compute shifting positions based on scroll
  const backgroundPositionX = motionDisabled ? '50%' : `${50 + scrollProgress * 15}%`;
  const backgroundPositionY = motionDisabled ? '50%' : `${50 + scrollProgress * 10}%`;
  const beamTransform = motionDisabled
    ? 'translateX(-50%) rotate(12deg)'
    : `translateX(-50%) rotate(${12 + scrollProgress * 10}deg) translateY(${scrollProgress * 20}px)`;

  return (
    <div 
      className="relative w-full h-[650px] md:h-[800px] overflow-hidden bg-iris-ink border-b border-white/5"
      role="banner"
      aria-label="IRIS Prismatic River Gate Hero"
    >
      {/* Siam River light gradient mesh */}
      <div
        className={cn(
          "absolute inset-0 opacity-80 transition-all ease-out duration-300",
          !motionDisabled && "animate-gradient-x"
        )}
        style={{
          backgroundImage: 'radial-gradient(circle at 50% 120%, rgb(var(--iris-river)) 0%, #05070D 70%)',
          backgroundPosition: `${backgroundPositionX} ${backgroundPositionY}`,
        }}
      />

      {/* Thai geometric linework & dot grid */}
      <div className="absolute inset-0 iris-grid opacity-30 pointer-events-none" />
      <div className="absolute inset-0 thai-lattice opacity-15 pointer-events-none" />

      {/* Dynamic light beam representing river reflection */}
      <div
        className={cn(
          "absolute left-1/2 top-[-20%] w-[150vw] h-[140%] -translate-x-1/2 opacity-[0.25] pointer-events-none blur-[100px] transition-transform duration-300 ease-out",
          !motionDisabled && "bg-gradient-to-r from-iris-cyan via-iris-orchid to-iris-gold"
        )}
        style={{
          transform: beamTransform,
        }}
      />

      {/* Ambient center golden gate glow */}
      <div className="absolute top-[35%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] md:w-[600px] md:h-[600px] rounded-full bg-iris-gold/5 blur-[90px] pointer-events-none" />

      {/* Hero content placeholder */}
      <div className="relative z-10 mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-10 h-full flex flex-col justify-center items-center text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-iris-cyan/20 bg-iris-cyan/5 text-xs font-bold text-iris-cyan uppercase tracking-[0.2em] mb-6 animate-pulse">
          <Sparkles className="h-3 w-3" />
          <span>Design System Visualizer</span>
        </div>

        <h1 className="font-display text-4xl sm:text-6xl md:text-8xl font-bold tracking-tight leading-[1.05] text-iris-pearl mb-6">
          IRIS PRISM <span className="bg-gradient-to-r from-iris-cyan via-iris-gold to-iris-orchid bg-clip-text text-transparent">PALACE</span>
        </h1>
        
        <p className="max-w-2xl text-sm sm:text-lg text-iris-muted leading-relaxed mb-8">
          ระบบดีไซน์ระดับองค์กรที่ผสานความอลังการของสถาปัตยกรรมไทยร่วมสมัย เข้ากับเทคโนโลยี e-commerce ยุคใหม่ 
          ขับเคลื่อนด้วยพลังแห่งสายน้ำทองคำและเกล็ดอัญมณีปริซึม
        </p>

        {/* Action controls */}
        <div className="flex flex-wrap gap-4 justify-center items-center">
          <a href="#visual-tokens" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-iris-pearl px-6 py-2.5 text-sm font-bold text-iris-ink transition hover:-translate-y-0.5 hover:bg-white">
            สำรวจโทเค็นการออกแบบ
          </a>
          
          <button
            type="button"
            onClick={toggleMotion}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-black/40 backdrop-blur-md px-5 py-2.5 text-xs font-bold text-iris-pearl hover:bg-white/5 transition"
            aria-label={motionDisabled ? "เปิดใช้งานเอฟเฟกต์การเคลื่อนไหว" : "ปิดเอฟเฟกต์การเคลื่อนไหว"}
          >
            {motionDisabled ? (
              <>
                <Eye className="h-4 w-4 text-iris-cyan" />
                <span>เปิดเอฟเฟกต์ (Motion ON)</span>
              </>
            ) : (
              <>
                <EyeOff className="h-4 w-4 text-iris-muted" />
                <span>ปิดเอฟเฟกต์ (Reduced Motion)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Decorative Siamese river curved bottom overlay */}
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-iris-ink to-transparent pointer-events-none" />
    </div>
  );
}
