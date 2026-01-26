import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://promptomize.app'

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/dashboard/',
          '/profile/',
          '/settings/',
          '/analytics/',
          '/batch/',
          '/collections/',
          '/templates/',
          '/history/',
          '/upgrade/',
        ],
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: [
          '/api/',
          '/dashboard/',
          '/profile/',
          '/settings/',
          '/analytics/',
          '/batch/',
          '/collections/',
          '/templates/',
          '/history/',
          '/upgrade/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  }
}
