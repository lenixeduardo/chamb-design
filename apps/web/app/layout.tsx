import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Charm-Design — the design app that pairs speed with charm',
  description:
    'Open source AI-first design platform: a visual canvas, a real design system, clean code export and any model you want.',
  // The mascot is the mark. Even at favicon size it still reads as a red dino
  // silhouette, which is the point of having a character rather than a glyph.
  icons: { icon: '/brand/charm-dino.png', apple: '/brand/charm-dino.png' },
};

export const viewport: Viewport = {
  themeColor: '#fffcf5',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
