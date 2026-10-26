import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin',
        '/account',
        '/profile',
        '/orders',
        '/cart',
        '/auth',
        '/login',
        '/design-system',
        '/market/my-listings',
        '/market/my-purchases',
      ],
    },
    sitemap: new URL('/sitemap.xml', SITE_URL).toString(),
  };
}
