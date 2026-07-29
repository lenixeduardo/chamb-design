'use client';

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The editor's own UI kit.
 *
 * Small and unapologetically specific — these are chrome controls, not a
 * general-purpose library. The general-purpose library is
 * `@opendesign/components`, and it produces documents rather than React.
 */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-soft active:scale-[0.98]',
  secondary:
    'bg-panel-raised text-ink border border-hairline hover:border-hairline-strong hover:bg-[#1d1d21]',
  ghost: 'text-ink-muted hover:text-ink hover:bg-panel-raised',
  danger: 'bg-critical/12 text-critical border border-critical/25 hover:bg-critical/20',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-[12px] gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-[13px] gap-2 rounded-lg',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'inline-flex items-center justify-center font-medium whitespace-nowrap',
        'transition-[background-color,border-color,color,transform] duration-150',
        'disabled:pointer-events-none disabled:opacity-40',
        BUTTON_SIZES[size],
        BUTTON_VARIANTS[variant],
        className,
      )}
    />
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  /** Native tooltip; the label is also used for the accessible name. */
  label: string;
}

export function IconButton({ active, label, className, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      {...props}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-150',
        'disabled:pointer-events-none disabled:opacity-35',
        active
          ? 'bg-brand/16 text-brand-soft'
          : 'text-ink-muted hover:bg-panel-raised hover:text-ink',
        className,
      )}
    />
  );
}

export function Panel({
  title,
  actions,
  children,
  className,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex h-full min-h-0 flex-col', className)}>
      {title && (
        <header className="flex h-9 shrink-0 items-center justify-between px-3">
          <h2 className="text-[10px] font-medium tracking-[0.14em] text-ink-faint uppercase">
            {title}
          </h2>
          {actions}
        </header>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-[12px]">
      <span className="w-16 shrink-0 truncate text-ink-faint" title={hint ?? label}>
        {label}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'h-7 w-full rounded-md border border-hairline bg-shell px-2 text-[12px] text-ink',
        'placeholder:text-ink-faint',
        'focus:border-brand focus:outline-none',
        'transition-colors duration-150',
        className,
      )}
    />
  );
}

export function Select({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        'h-7 w-full rounded-md border border-hairline bg-shell px-1.5 text-[12px] text-ink',
        'focus:border-brand focus:outline-none',
        className,
      )}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { label: ReactNode; value: T; title?: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-hairline bg-shell p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          onClick={() => onChange(option.value)}
          className={cn(
            'inline-flex h-6 min-w-7 items-center justify-center rounded-md px-2 text-[11px] font-medium',
            'transition-colors duration-150',
            value === option.value
              ? 'bg-panel-raised text-ink'
              : 'text-ink-faint hover:text-ink-muted',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'brand' | 'positive' | 'caution' | 'critical';
}) {
  const tones = {
    neutral: 'bg-panel-raised text-ink-muted border-hairline',
    brand: 'bg-brand/14 text-brand-soft border-brand/25',
    positive: 'bg-positive/14 text-positive border-positive/25',
    caution: 'bg-caution/14 text-caution border-caution/25',
    critical: 'bg-critical/14 text-critical border-critical/25',
  } as const;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      {icon && <div className="text-ink-faint">{icon}</div>}
      <div className="space-y-1">
        <p className="text-[13px] font-medium text-ink">{title}</p>
        {description && (
          <p className="max-w-[36ch] text-[12px] leading-relaxed text-ink-faint">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
