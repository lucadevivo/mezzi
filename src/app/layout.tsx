import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mezzi',
  description: 'Chi ha consumato quanto, chi deve mettere benzina.',
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
    <html lang="it" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
