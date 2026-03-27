import { useCallback, useEffect, useRef } from 'react';

/**
 * Returns a `ref` to attach to a scrollable container.
 *
 * The container will auto-scroll to the bottom whenever `deps` change,
 * **unless** the user has manually scrolled up (i.e. is not near the bottom).
 *
 * @param deps - Dependency array that triggers a scroll check (e.g.
 *               `[messages.length, streamingContent]`).
 * @param threshold - Pixel distance from the bottom within which the user is
 *                    considered "at the bottom". Defaults to 80.
 */
export function useAutoScroll<T extends HTMLElement = HTMLDivElement>(
  deps: unknown[],
  threshold = 80,
) {
  const containerRef = useRef<T>(null);
  const isAtBottomRef = useRef(true);

  // Track whether the user is near the bottom so we know if we should
  // auto-scroll after a content update.
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isAtBottomRef.current = distanceFromBottom <= threshold;
  }, [threshold]);

  // Attach the scroll listener imperatively so it stays in sync with the ref.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Scroll to bottom when deps change (if user is at the bottom).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !isAtBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, deps);

  return containerRef;
}
