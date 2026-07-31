import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Charm-Design — design com velocidade e charme',
  description:
    'O app de design que une velocidade e charme. Crie marcas que as pessoas amam — com IA que entende seu estilo: canvas visual, design system real e código limpo na exportação.',
  // The mascot is the mark. Even at favicon size it still reads as a red dino
  // silhouette, which is the point of having a character rather than a glyph.
  icons: { icon: '/brand/charm-dino.png', apple: '/brand/charm-dino.png' },
};

export const viewport: Viewport = {
  themeColor: '#fffcf5',
  width: 'device-width',
  initialScale: 1,
  // The editor pins a toolbar to the bottom edge, so the layout has to reach
  // under the home indicator and pad itself back out with `env(safe-area-inset-*)`.
  // Those insets read as zero unless the viewport covers the whole display.
  viewportFit: 'cover',
  // Pinch-zoom stays available — capping it would fail WCAG 1.4.4, and the
  // canvas has its own zoom precisely so the *page* never needs to be zoomed.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        {/* Preconnect first: the font stylesheet lives on one host and the font
            files on another, so without this the browser pays two DNS + TLS
            handshakes in series before any type can render. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Fraunces is requested as a variable font across its optical-size
            axis — one file that covers the 64px hero and the 24px dialog
            heading, rather than two static cuts that only look right at one
            size each. Yellowtail is the wordmark and is used nowhere else. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..700;1,9..144,400..700&family=Inter:wght@300;400;500;600;700&family=Yellowtail&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
