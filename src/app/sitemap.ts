import { MetadataRoute } from 'next';

import { envConfigs } from '@/config';
import { getLocalPostsAndCategories } from '@/shared/models/post';

/**
 * Dynamic sitemap for Detect AI Watermarks.
 *
 * Lists:
 *  - Home page `/`
 *  - All blog posts under `/blog/<slug>` (sourced from `content/posts/*.mdx`)
 *  - About and Contact static pages
 *
 * Excludes: settings, admin, activity, api, sign-in/up, oauth callback,
 * and noindex legal pages (privacy-policy, terms-of-service, disclaimer, dmca).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const appUrl = envConfigs.app_url.replace(/\/$/, '');
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: `${appUrl}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${appUrl}/blog`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${appUrl}/about`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${appUrl}/contact`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.5,
    },
  ];

  // Append all blog posts sourced from local mdx files (content/posts/*.mdx).
  let posts: Array<{ slug?: string; created_at?: string; title?: string }> = [];
  try {
    const localPosts = await getLocalPostsAndCategories({ locale: 'en' });
    posts = localPosts.posts as any;
  } catch {
    // Fail gracefully — sitemap will still include the static pages.
    posts = [];
  }

  const postPages: MetadataRoute.Sitemap = posts
    .filter((p) => p.slug)
    .map((p) => ({
      url: `${appUrl}/blog/${p.slug}`,
      lastModified: p.created_at ? new Date(p.created_at) : now,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    }));

  return [...staticPages, ...postPages];
}
