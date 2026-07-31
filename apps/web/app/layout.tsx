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
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
