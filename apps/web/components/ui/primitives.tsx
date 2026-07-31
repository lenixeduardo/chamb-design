'use client';

import { createContext, useContext } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The editor's own UI kit.
 *
 * Small and unapologetically specific — these are chrome controls, not a
 * general-purpose library. The general-purpose library is
 * `@opendesign/components`, and it produces documents rather than React.
 */

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Rounded rectangles on a 16px radius, not pills.
 *
 * A full-radius control is only ever the right shape for a two-word label; give
 * it a sentence — "Começar um projeto em branco" — and the caps turn into
 * half-circles wide enough to read as decoration, and the label's optical
 * margins stop matching the padding you set. 16px keeps a wide button a
 * rectangle while still belonging to a system whose cards sit at 24 and whose
 * sheets sit at 32. The pill survives where the shape carries meaning: status
 * chips and filter tags.
 *
 * `outline` is the system's true secondary — a 1.5px brand rule on nothing,
 * for the second choice on a marketing surface. It is deliberately *not* the
 * `secondary` variant, which stays a neutral panel button: an editor toolbar
 * with eight red-outlined buttons in it has no hierarchy left to spend.
 */
const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-soft active:scale-[0.98]',
  secondary:
    'bg-panel text-ink border border-hairline hover:border-hairline-strong hover:bg-panel-raised',
  outline:
    'border-[1.5px] border-brand-soft/55 text-brand-soft bg-transparent hover:border-brand-soft hover:bg-brand/8',
  ghost: 'text-ink-muted hover:text-ink hover:bg-panel-raised',
  danger: 'bg-critical/10 text-critical border border-critical/25 hover:bg-critical/16',
};

// Controls grow on touch and shrink back at `sm`. Both sets of numbers are
// deliberate: 13px text in a 36px pill is right for a dense desktop toolbar and
// wrong for a thumb, and the reverse is true of the 44px version. Sizing by
// pointer rather than picking one compromise height is what keeps the editor
// chrome tight without making the phone build a game of darts.
const BUTTON_SIZES: Record<ButtonSize, string> = {
  // Small controls take a smaller radius: 16px on a 28px-tall button is a
  // pill by another name, and the scale has to stay proportional to read as
  // one system rather than as one number applied everywhere.
  sm: 'h-9 px-3.5 text-[12.5px] gap-1.5 rounded-chip sm:h-7 sm:px-3 sm:text-[12px]',
  md: 'h-11 px-5 text-[14px] gap-2 rounded-control sm:h-9 sm:px-4 sm:text-[13px]',
  // The marketing size, at the reference's proportions: generous horizontal
  // padding against a tall box, and type big enough to be the thing you read
  // after the headline.
  lg: 'h-13 px-8 text-[16px] gap-2.5 rounded-control sm:h-12 sm:text-[15px]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * Swaps the leading icon for a spinner and blocks input.
   *
   * Kept as a prop rather than left to each call site because the failure mode
   * is always the same one: a button that looks idle while its handler is in
   * flight invites a second click, and the second click is the one that creates
   * the duplicate project.
   */
  loading?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      {...props}
      className={cn(
        'inline-flex items-center justify-center font-medium whitespace-nowrap',
        'transition-[background-color,border-color,color,transform] duration-150',
        'disabled:pointer-events-none disabled:opacity-40',
        BUTTON_SIZES[size],
        BUTTON_VARIANTS[variant],
        className,
      )}
    >
      {loading && <Loader2 size={size === 'sm' ? 11 : 14} className="animate-spin" />}
      {children}
    </button>
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
        'tap-target relative inline-flex h-9 w-9 items-center justify-center rounded-chip',
        'transition-colors duration-150 sm:h-8 sm:w-8',
        'disabled:pointer-events-none disabled:opacity-35',
        active
          ? 'bg-brand/12 text-brand-soft'
          : 'text-ink-muted hover:bg-panel-raised hover:text-ink',
        className,
      )}
    />
  );
}

/** The one spinner. Sized to sit on a line of 12px text by default. */
export function Spinner({ size = 12, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} aria-hidden className={cn('animate-spin', className)} />;
}

/**
 * Where a panel is being rendered.
 *
 * On a phone the panels open inside a sheet that already carries their name in
 * its title bar, so the panel's own eyebrow heading would print the word twice,
 * one line apart. Rather than thread a `hideTitle` prop through four panel
 * components that never asked to know about layout, the shell declares the
 * chrome once and `Panel` reads it.
 */
type PanelChrome = 'docked' | 'sheet';

const PanelChromeContext = createContext<PanelChrome>('docked');

export function PanelChromeProvider({
  value,
  children,
}: {
  value: PanelChrome;
  children: ReactNode;
}) {
  return <PanelChromeContext.Provider value={value}>{children}</PanelChromeContext.Provider>;
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
  const chrome = useContext(PanelChromeContext);
  const showHeader = Boolean(title) && (chrome === 'docked' || Boolean(actions));

  return (
    <section className={cn('flex h-full min-h-0 flex-col', className)}>
      {showHeader && (
        <header className="flex h-9 shrink-0 items-center justify-between px-3">
          {chrome === 'docked' ? (
            <h2 className="text-[10px] font-medium tracking-[0.14em] text-ink-faint uppercase">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {actions}
        </header>
      )}
      <div className="touch-pane min-h-0 flex-1 overflow-y-auto">{children}</div>
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
        'h-9 w-full rounded-chip border border-hairline bg-panel-raised px-3.5 text-[16px] text-ink',
        // 16px on touch, 12px from `sm` up. Anything under 16px makes iOS Safari
        // zoom the viewport on focus and never zoom back out, which strands the
        // user in a scaled-up editor with no obvious way home.
        'sm:h-7 sm:px-3 sm:text-[12px]',
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
        // Tighter horizontal padding than the other pills on purpose: a native
        // select reserves room for its own arrow, and the provider names are
        // long enough that generous padding clips them.
        'h-9 w-full min-w-0 rounded-chip border border-hairline bg-panel-raised pr-1 pl-2.5 text-[16px] text-ink',
        'sm:h-7 sm:pl-2 sm:text-[12px]',
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
    <div className="inline-flex rounded-chip bg-panel-raised p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          onClick={() => onChange(option.value)}
          className={cn(
            'inline-flex h-8 min-w-9 items-center justify-center rounded-[8px] px-3 text-[12px] font-medium',
            'sm:h-6 sm:min-w-7 sm:px-2.5 sm:text-[11px]',
            'transition-colors duration-150',
            // The reference's segmented control inverts the active item to ink
            // rather than tinting it — the contrast is what makes it readable
            // at 11px on a cream track.
            value === option.value
              ? 'bg-ink text-shell shadow-sm'
              : 'text-ink-faint hover:text-ink',
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
        // Never wraps and never shrinks: a two-word badge breaking across two
        // lines inside a flex row is what turns a status chip into a smudge.
        'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap',
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
    <div className="animate-fade-up flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
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
