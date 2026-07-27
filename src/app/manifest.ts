import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mezzi',
    short_name: 'Mezzi',
    description: 'Chi ha consumato quanto, chi deve mettere benzina.',
    start_url: '/',
    display: 'standalone',
    background_color: '#14171a',
    theme_color: '#14171a',
    orientation: 'portrait',
    lang: 'it',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Saldi', url: '/saldi' },
      { name: 'Reclami', url: '/reclami' },
    ],
  };
}
