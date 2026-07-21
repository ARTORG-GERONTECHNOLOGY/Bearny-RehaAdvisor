import { useCallback, useEffect, useRef } from 'react';

interface ToggleMetadata {
  originalEvent?: { target?: EventTarget | null } | null;
}

/**
 * react-bootstrap's Dropdown closes itself ("rootClose") on any click whose
 * target isn't a DOM descendant of the menu/toggle. A Radix control (Select,
 * Popover, ...) nested inside the menu defeats that check in two ways:
 *
 * 1. Radix renders its open content into a document.body portal, so
 *    clicking an option is a DOM descendant of <body>, not of the menu —
 *    it looks like an outside click.
 * 2. Opening the Radix control calls `event.preventDefault()` on
 *    `pointerdown`, which suppresses the compat `mousedown` event Bootstrap
 *    listens for to know an interaction started inside the menu, and Radix
 *    briefly disables `pointer-events` on `document.body` while opening —
 *    which can make that same click's native target resolve to `<html>`,
 *    again indistinguishable from a real outside click.
 *
 * A blanket "ignore closes while document.body.style.pointerEvents is
 * 'none'" check is too broad: that flag stays set for as long as *any*
 * Radix layer is open anywhere on the page (e.g. an unrelated modal opened
 * by clicking something else), which would wrongly keep this dropdown open
 * too. Instead, track pointerdown targets directly (pointerdown isn't
 * suppressed) so onToggle can tell "this interaction started inside our own
 * menu/toggle" apart from a genuine outside click, however its target ends
 * up looking once Radix has done its thing.
 *
 * That fallback must only kick in for the specific "target resolved to
 * <html>/<body>" case it exists for — not for every close request whose
 * target happens to sit inside the container. A real toggle-button click or
 * an Escape keypress also has a target inside the container (the toggle
 * itself, or the last-focused element in the menu), and those targets
 * resolve correctly, so they must be allowed to close normally.
 */
export function useDismissableDropdown(setOpen: (next: boolean) => void) {
  const containerRef = useRef<HTMLElement | null>(null);
  const pointerDownInsideRef = useRef(false);

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      pointerDownInsideRef.current = !!containerRef.current?.contains(e.target as Node);
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, []);

  const onToggle = useCallback(
    (next: boolean, meta?: ToggleMetadata) => {
      const pointerDownWasInside = pointerDownInsideRef.current;
      pointerDownInsideRef.current = false;

      if (!next) {
        const target = meta?.originalEvent?.target as HTMLElement | null;
        const insideRadixPortal = !!target?.closest?.('[data-radix-popper-content-wrapper]');
        const targetEscapedToRoot =
          !target || target === document.body || target === document.documentElement;
        if (insideRadixPortal || (targetEscapedToRoot && pointerDownWasInside)) {
          return;
        }
      }
      setOpen(next);
    },
    [setOpen]
  );

  return { containerRef, onToggle };
}
