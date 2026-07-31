import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'OpenDesign — design interfaces with AI, in the open',
  description:
    'Open source AI-first design platform: a visual canvas, a design system, clean code export and any model you want.',
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
