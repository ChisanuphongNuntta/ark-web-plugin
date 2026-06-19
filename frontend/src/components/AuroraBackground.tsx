'use client';
import { motion } from "framer-motion";
import React from "react";

export const AuroraBackground = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div className={`relative flex flex-col min-h-screen items-center justify-center bg-ark-dark text-slate-950 overflow-hidden ${className}`}>
      <div className="absolute inset-0 z-0">
        <motion.div
          animate={{
            backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "linear",
          }}
          className="absolute inset-0 opacity-40 will-change-transform"
          style={{
            backgroundImage: `
              radial-gradient(ellipse at 100% 0%, rgba(16, 185, 129, 0.4) 0%, transparent 50%),
              radial-gradient(ellipse at 0% 100%, rgba(6, 182, 212, 0.4) 0%, transparent 50%),
              radial-gradient(ellipse at 50% 50%, rgba(16, 185, 129, 0.2) 0%, transparent 50%)
            `,
            backgroundSize: "200% 200%",
            filter: "blur(60px)",
          }}
        />
        {/* Overlay to darken and add texture */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
        <div className="absolute inset-0 bg-ark-dark/80 backdrop-blur-[2px]"></div>
      </div>
      <div className="relative z-10 w-full">
        {children}
      </div>
    </div>
  );
};
