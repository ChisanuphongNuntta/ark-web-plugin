import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // IRIS brand palette — "Iconic Siam Ultra View"
        // tokens defined in src/app/globals.css :root
        iris: {
          ink: 'rgb(var(--iris-ink) / <alpha-value>)',        // Obsidian Navy  #05070D
          midnight: 'rgb(var(--iris-midnight) / <alpha-value>)',
          river: 'rgb(var(--iris-river) / <alpha-value>)',     // Deep River     #071A24
          cyan: 'rgb(var(--iris-cyan) / <alpha-value>)',       // Iris Cyan      #37E5D2
          orchid: 'rgb(var(--iris-orchid) / <alpha-value>)',   // Royal Orchid   #A77BFF
          gold: 'rgb(var(--iris-gold) / <alpha-value>)',       // Champagne Gold #DDBB72
          pearl: 'rgb(var(--iris-pearl) / <alpha-value>)',
          muted: 'rgb(var(--iris-muted) / <alpha-value>)',
          slate: 'rgb(var(--iris-slate) / <alpha-value>)',                                   // Iris Slate     #151226
          violet: 'rgb(var(--iris-violet) / <alpha-value>)',                                  // Frozen Midnight Violet #0D091A
          magenta: 'rgb(var(--iris-magenta) / <alpha-value>)',                                 // Glowing Magenta #E83D84
          // Canonical brand-name aliases (same tokens, descriptive names)
          obsidian: 'rgb(var(--iris-ink) / <alpha-value>)',
          'deep-river': 'rgb(var(--iris-river) / <alpha-value>)',
          champagne: 'rgb(var(--iris-gold) / <alpha-value>)',
        },
        'iris-slate': 'rgb(var(--iris-slate) / <alpha-value>)',
        primary: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
        },
        background: "#040816",
        foreground: "#FAFAFA",
        ark: {
          darker: '#02040b',
          dark: '#040816',
          panel: '#07111F',
          surface: 'rgba(7, 17, 31, 0.6)',
          card: 'rgba(7, 17, 31, 0.4)',
          border: 'rgba(255, 255, 255, 0.05)',
          primary: '#00E5A8',
          primaryGlow: 'rgba(0, 229, 168, 0.4)',
          accent: '#00F3FF',
          gold: '#F6C453',
          goldGlow: 'rgba(246, 196, 83, 0.4)'
        }
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'glass-gradient': 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.01) 100%)',
      },
      fontFamily: {
        sans: ['var(--font-iris-sans)', 'sans-serif'],
        display: ['var(--font-iris-display)', 'serif'],
      },
      animation: {
        'gradient-x': 'gradient-x 15s ease infinite',
        'float': 'float 6s ease-in-out infinite',
        'float-gentle': 'float-gentle 4s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up': 'slide-up 0.5s ease-out forwards',
        'spin-slow': 'spin 8s linear infinite',
        'shimmer': 'shimmer 2.5s linear infinite',
        'neon-pulse': 'neon-pulse 2s ease-in-out infinite',
        'scan-line': 'scan-line 4s linear infinite',
        'border-glow': 'border-glow 3s ease-in-out infinite',
        'prism-drift': 'prism-drift 14s ease-in-out infinite alternate',
        'river-shine': 'river-shine 8s linear infinite',
      },
      keyframes: {
        'gradient-x': {
          '0%, 100%': {
            'background-size': '200% 200%',
            'background-position': 'left center'
          },
          '50%': {
            'background-size': '200% 200%',
            'background-position': 'right center'
          },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'float-gentle': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 20px rgba(16, 185, 129, 0.2)' },
          '50%': { opacity: '.5', boxShadow: '0 0 40px rgba(16, 185, 129, 0.5)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'shimmer': {
          '0%': { 'background-position': '-200% center' },
          '100%': { 'background-position': '200% center' },
        },
        'neon-pulse': {
          '0%, 100%': { opacity: '1', filter: 'brightness(1)' },
          '50%': { opacity: '0.8', filter: 'brightness(1.4)' },
        },
        'scan-line': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        'border-glow': {
          '0%, 100%': { 'border-color': 'rgba(0, 229, 168, 0.2)' },
          '50%': { 'border-color': 'rgba(0, 229, 168, 0.6)' },
        },
        'prism-drift': {
          '0%': { transform: 'translate3d(-3%, -2%, 0) rotate(-2deg)', opacity: '0.45' },
          '100%': { transform: 'translate3d(4%, 3%, 0) rotate(3deg)', opacity: '0.8' },
        },
        'river-shine': {
          '0%': { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '200% 50%' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
