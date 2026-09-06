import type { NextConfig } from 'next';

/**
 * L'app è esposta su internet: gli header vanno messi anche se davanti c'è
 * un tunnel Cloudflare. La CSP è stretta perché non carichiamo niente da fuori:
 * font, script e stili sono tutti serviti da qui.
 */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next inietta gli script di idratazione inline con un hash che cambia a ogni build.
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      'upgrade-insecure-requests',
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  // Immagine finale slim: Next copia solo il codice e le dipendenze davvero usate.
  output: 'standalone',
  // Modulo nativo: va caricato da Node, non impacchettato dal bundler.
  serverExternalPackages: ['better-sqlite3'],
  experimental: {
    /*
     * Le pagine sono tutte dinamiche, e di suo Next non tiene in cache niente di
     * dinamico (`dynamic: 0`): tornare su una sezione appena vista rifaceva il giro
     * completo fino al server di casa, che dal telefono sono qualche centinaio di
     * millisecondi. Venti secondi di cache rendono immediato l'avanti-e-indietro tra
     * le schede; una modifica fatta dall'app invalida comunque subito, perché le
     * azioni chiamano `revalidatePath`.
     */
    staleTimes: { dynamic: 20 },
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
