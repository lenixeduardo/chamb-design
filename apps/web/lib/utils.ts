import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Conditional classes with Tailwind conflict resolution. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return 'agora mesmo';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;

  const days = Math.round(hours / 24);
  if (days < 30) return `há ${days} d`;

  // Pinned to pt-BR rather than the visitor's locale: the rest of the line is
  // Portuguese, and a date in another format inside it reads as a bug.
  return new Date(iso).toLocaleDateString('pt-BR');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
