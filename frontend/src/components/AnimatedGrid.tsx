'use client';

import React from "react";
import { motion } from "framer-motion";

const seeded = (index: number, salt: number) => {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
};

export const AnimatedGrid = () => {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
      <div 
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
          maskImage: 'linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)'
        }}
      >
        <motion.div
          animate={{
            translateY: [0, 40],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "linear",
          }}
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(to bottom, rgba(16, 185, 129, 0.1) 1px, transparent 1px)
            `,
            backgroundSize: '100% 40px',
          }}
        />
      </div>
      {/* Floating particles mimicking TEK energy */}
      {Array.from({ length: 20 }).map((_, i) => {
        const x = seeded(i, 1) * 100;
        const y = seeded(i, 2) * 100;
        const opacity = seeded(i, 3) * 0.5 + 0.1;
        const scale = seeded(i, 4) * 1.5 + 0.5;
        const destinationY = seeded(i, 5) * -100;
        const duration = seeded(i, 6) * 10 + 10;
        return <motion.div
          key={i}
          className="absolute w-1 h-1 bg-iris-cyan rounded-full shadow-[0_0_10px_rgba(16,185,129,0.8)]"
          initial={{
            x: `${x}vw`,
            y: `${y}vh`,
            opacity,
            scale,
          }}
          animate={{
            y: [null, `${destinationY}vh`],
            opacity: [null, 0]
          }}
          transition={{
            duration,
            repeat: Infinity,
            ease: "linear"
          }}
        />;
      })}
    </div>
  );
};
