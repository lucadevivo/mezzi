import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Immagine finale slim: Next copia solo il codice e le dipendenze davvero usate.
  output: 'standalone',
  // Modulo nativo: va caricato da Node, non impacchettato dal bundler.
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
