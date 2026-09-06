import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

// Gli stessi dell'app delle pizze. `next/font` li serve dal nostro dominio: nessuna
// chiamata a Google a runtime, e la PWA continua a funzionare senza rete.
const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Mezzi',
  description: 'Chi ha consumato quanto, chi deve mettere benzina.',
  // iOS l'icona della home la prende da qui, non dal manifest.
  icons: { apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  // Il tastierino numerico non deve zoomare la pagina quando si tocca un campo.
  maximumScale: 1,
  // Le luci d'ambiente e la barra in basso arrivano fino al bordo del telefono.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
