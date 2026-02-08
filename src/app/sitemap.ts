import type { MetadataRoute } from 'next';

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://bingeitbro.com');

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticPages = [
    '/',
    '/signup',
    '/privacy',
    '/terms',
    '/cookies',
    '/disclaimer',
    '/copyright',
  ];

  return staticPages.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: path === '/' ? 1 : 0.6,
  }));
}
