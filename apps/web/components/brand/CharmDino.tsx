import { cn } from '@/lib/utils';

/**
 * Charm's mascot.
 *
 * The design file uses one image at four scales, and the difference between
 * them is not size but *role* — so the roles live here rather than as a pile of
 * class strings repeated at each call site. Getting this wrong is how a mascot
 * turns into clutter: the same dino, dropped in at the same weight everywhere,
 * stops being a character and becomes wallpaper.
 *
 *   logo      — a round white chip with a hairline, the way the brand's nav
 *               carries it. Bounces on hover.
 *   float     — the hero character: large, drifting, with a red-tinted drop
 *               shadow. One per screen, and only where there is room for it.
 *   mark      — inline with text, at the size of the line it sits on.
 *   watermark — huge, rotated, at 3–8% opacity, behind content. Never
 *               interactive, never announced to a screen reader.
 *
 * The image is decorative in every role except `logo`, so `alt` defaults to
 * empty: a mascot repeated in a watermark and a heading would otherwise be read
 * out twice for no information.
 */

const SRC = '/brand/charm-dino.png';

type Role = 'logo' | 'float' | 'mark' | 'watermark';

const ROLES: Record<Role, string> = {
  // `scale-125` because the source render carries its own margin: without it the
  // dino sits as a small stamp in the middle of the chip rather than filling it.
  logo: 'rounded-full border border-hairline bg-panel object-contain scale-125 shadow-sm dino-bounce',
  float:
    'object-contain drop-shadow-[0_10px_24px_rgba(232,61,61,0.16)] animate-float dino-bounce select-none',
  mark: 'object-contain dino-bounce inline-block align-middle',
  watermark: 'pointer-events-none select-none object-contain',
};

export function CharmDino({
  role = 'mark',
  size = 20,
  className,
  alt,
}: {
  role?: Role;
  /** Rendered size in px. The source is 1600², so any of these downscale cleanly. */
  size?: number;
  className?: string;
  /** Only meaningful for `logo`; every other role is decoration. */
  alt?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a fixed local asset;
    // next/image would add a loader and a layout wrapper for no benefit here.
    <img
      src={SRC}
      alt={alt ?? ''}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      aria-hidden={alt ? undefined : true}
      className={cn(ROLES[role], className)}
    />
  );
}
