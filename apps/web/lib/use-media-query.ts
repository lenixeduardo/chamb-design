'use client';

import { useEffect, useState } from 'react';

/**
 * Subscribe to a media query.
 *
 * The editor genuinely needs this in JS rather than CSS: the mobile layout puts
 * the panels inside a sheet and the desktop one docks them, and rendering both
 * would mean two `ChatSidebar`s — two conversations, two abort controllers, two
 * sets of provider state. Which one exists has to be a real branch.
 *
 * Starts `false` and corrects on mount. Server rendering has no viewport, so any
 * other default would be a guess that flashes the wrong layout on half of all
 * devices; `false` at least means the phone build never sees the desktop one.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);

    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** The breakpoint where the editor has room for docked panels. */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)');
}
