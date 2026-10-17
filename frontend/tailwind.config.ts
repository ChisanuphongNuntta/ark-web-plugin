import type { Config } from 'tailwindcss';

/**
 * IRIS Private — Tailwind theme.
 *
 * Every colour resolves to a CSS variable declared in src/app/globals.css.
 * Variables hold space-separated RGB triplets so Tailwind's `/<alpha>`
 * modifier works (`bg-accent/10`). Seasons re-theme by swapping the variable
 * values under `html[data-season="..."]` — components never branch on season.
 *
 * Components must use ONLY the semantic names in `SEMANTIC` below.
 * See frontend/DESIGN.md for the full brief.
 */

const tok = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

/** Hairlines are white at a low, token-controlled opacity. */
const hairline = (alphaVar: string) => `rgb(var(--line) / calc(var(--${alphaVar}) * <alpha-value>))`;

const SEMANTIC = {
  canvas: tok('canvas'),
  surface: tok('surface'),
  'surface-2': tok('surface-2'),
  'surface-3': tok('surface-3'),
  line: hairline('line-a'),
  'line-strong': hairline('line-strong-a'),
  fg: tok('fg'),
  'fg-muted': tok('fg-muted'),
  'fg-subtle': tok('fg-subtle'),
  accent: tok('accent'),
  'accent-hover': tok('accent-hover'),
  'on-accent': tok('on-accent'),
  seasonal: tok('seasonal'),
  'seasonal-2': tok('seasonal-2'),
  success: tok('success'),
  warning: tok('warning'),
  danger: tok('danger'),
  info: tok('info'),
};

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: SEMANTIC,
      fontFamily: {
        sans: ['var(--font-plex-thai)', 'IBM Plex Sans Thai', 'system-ui', 'sans-serif'],
        mono: ['var(--font-plex-mono)', 'IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        // Thai-friendly scale; body copy uses a generous 1.7 line-height.
        '2xs': ['0.6875rem', { lineHeight: '1.5' }],
        xs: ['0.75rem', { lineHeight: '1.6' }],
        sm: ['0.875rem', { lineHeight: '1.7' }],
        base: ['1rem', { lineHeight: '1.7' }],
        lg: ['1.125rem', { lineHeight: '1.6' }],
        xl: ['1.25rem', { lineHeight: '1.45' }],
        '2xl': ['1.5rem', { lineHeight: '1.35' }],
        '3xl': ['1.875rem', { lineHeight: '1.3' }],
        '4xl': ['2.25rem', { lineHeight: '1.25' }],
        '5xl': ['3rem', { lineHeight: '1.2' }],
      },
      borderRadius: {
        control: '6px',
        card: '10px',
        dialog: '14px',
      },
      maxWidth: {
        content: '1240px',
        prose: '68ch',
      },
      boxShadow: {
        // The only shadow in the system — for floating overlays (menus, dialogs, toasts).
        overlay: '0 16px 48px -12px rgb(0 0 0 / 0.55)',
      },
      transitionDuration: {
        fast: '120ms',
        DEFAULT: '160ms',
        slow: '180ms',
      },
      zIndex: {
        header: '40',
        overlay: '60',
        toast: '70',
      },
      // Decorative keyframes (float, shimmer, pulse-glow, scan-line, prism-drift,
      // river-shine, neon-pulse, border-glow, gradient-x) are intentionally removed.
    },
  },
  plugins: [],
};

export default config;
