import type { Metadata, Viewport } from 'next';
import { Barlow, Barlow_Semi_Condensed } from 'next/font/google';
import './globals.css';

// Barlow: disegno da strumentazione, il sostituto libero del carattere del cruscotto.
// `next/font` lo serve dal nostro dominio: niente Google a runtime, la PWA va offline.
const barlow = Barlow({ variable: '--font-barlow', subsets: ['latin'], weight: ['300', '400', '500', '600'] });
const barlowSc = Barlow_Semi_Condensed({ variable: '--font-barlow-sc', subsets: ['latin'], weight: ['400', '500', '600'] });

export const metadata: Metadata = {
  title: 'Mezzi',
  description: 'Chi ha consumato quanto, chi deve mettere benzina.',
  // iOS l'icona della home la prende da qui, non dal manifest.
  icons: { apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  themeColor: '#000000',
  // Il tastierino numerico non deve zoomare la pagina quando si tocca un campo.
  maximumScale: 1,
  // Le luci d'ambiente e la barra in basso arrivano fino al bordo del telefono.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it" className={`${barlow.variable} ${barlowSc.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
