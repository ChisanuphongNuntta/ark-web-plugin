/** @type {import('next').NextConfig} */
const nextConfig = {
  // The project lives on a Windows-mounted F: drive where readlink() reports EISDIR
  // for regular files. Disable tracing only for local Windows builds; production Linux
  // containers still produce the required standalone bundle.
  output: process.platform === 'win32' ? undefined : 'standalone',
  async rewrites() {
    return process.env.NODE_ENV === 'development' && process.env.IRIS_LOCAL_API_PROXY === '1'
      ? [{ source: '/api/:path*', destination: `${process.env.IRIS_LOCAL_API_ORIGIN || 'http://127.0.0.1:3201'}/api/:path*` }]
      : [];
  },
  // Legacy iris-th.cloud server-list URLs -> the /servers directory (308).
  // Explicit case variants: people type these by hand and old links vary.
  async redirects() {
    const legacy = [
      ['/Listserver-PVE', '/servers?mode=pve'],
      ['/list-server-pve-mod', '/servers?mode=pve-mod'],
      ['/Listserver-PVPVE', '/servers?mode=pvpve'],
      ['/list-server-pvpve-pre-aqua', '/servers?mode=pvpve'],
      ['/status-server', '/servers'],
    ];
    const variants = (path) => {
      const titled = path.replace(/^\/(\w)/, (_, c) => `/${c.toUpperCase()}`);
      return [path, path.toLowerCase(), path.toUpperCase(), titled, titled.replace(/server/i, 'Server')];
    };
    const seen = new Set();
    const rules = [];
    for (const [source, destination] of legacy) {
      for (const variant of variants(source)) {
        if (seen.has(variant)) continue;
        seen.add(variant);
        rules.push({ source: variant, destination, permanent: true });
      }
    }
    return rules;
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.discordapp.com',
      },
    ],
  },
  // Security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://cdn.discordapp.com",
              "media-src 'self' blob:",
              "connect-src 'self' http://localhost:* https://localhost:* http://127.0.0.1:* https://127.0.0.1:* https: wss: ws:",
              "font-src 'self' data:",
              "object-src 'none'",
              "base-uri 'self'",
              "frame-ancestors 'self'",
              "form-action 'self'",
              ...(process.env.NODE_ENV === 'production' ? ['upgrade-insecure-requests'] : []),
            ].join('; '),
          },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
