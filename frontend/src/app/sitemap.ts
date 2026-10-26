import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// Static public routes only: the build has no backend, so dynamic pages (/p/*, /shop/[id], /market/[id]) are left out.
const PUBLIC_ROUTES = [
  '/',
  '/shop',
  '/packs',
  '/market',
  '/servers',
  '/vip',
  '/perks',
  '/pass',
  '/rewards',
  '/ranking',
  '/event',
  '/promotion',
  '/topup',
  '/support',
  '/privacy',
  '/terms',
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((path) => ({
    url: new URL(path, SITE_URL).toString(),
    changeFrequency: path === '/' ? 'daily' : 'weekly',
    priority: path === '/' ? 1 : 0.7,
  }));
}
