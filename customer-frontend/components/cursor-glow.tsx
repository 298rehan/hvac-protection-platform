"use client";

import { useEffect, useRef } from "react";

/* Matches the CSS: precise hovering pointer, no reduced-motion preference. */
const POINTER_QUERY = "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";
const WIDE_QUERY = "(min-width: 1024px)";

/** How far the glow closes on the pointer each frame (0-1). Lower is smoother. */
const EASE = 0.18;

/**
 * Soft glow that trails the mouse, plus the pointer coordinates for any
 * `.spotlight` element under it.
 *
 * Everything is written straight to the DOM (a transform and CSS variables)
 * inside requestAnimationFrame, so mouse movement never re-renders React.
 * The server renders the same empty <div>, so there is no hydration mismatch.
 */
export function CursorGlow() {
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const glow = glowRef.current;
    if (!glow) return;

    const pointerQuery = window.matchMedia(POINTER_QUERY);
    const wideQuery = window.matchMedia(WIDE_QUERY);

    let frame = 0;
    let x = 0;
    let y = 0;
    let targetX = 0;
    let targetY = 0;
    let placed = false;

    function tick() {
      x += (targetX - x) * EASE;
      y += (targetY - y) * EASE;
      glow!.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      // Keep animating until the glow has caught up, then go idle.
      frame =
        Math.abs(targetX - x) > 0.3 || Math.abs(targetY - y) > 0.3
          ? requestAnimationFrame(tick)
          : 0;
    }

    function onPointerMove(event: PointerEvent) {
      if (event.pointerType !== "mouse") return;

      const spot = (event.target as Element | null)?.closest?.<HTMLElement>(".spotlight");
      if (spot) {
        const rect = spot.getBoundingClientRect();
        spot.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
        spot.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
      }

      if (!wideQuery.matches) return;
      targetX = event.clientX;
      targetY = event.clientY;
      if (!placed) {
        // Jump to the first position instead of sweeping in from the corner.
        x = targetX;
        y = targetY;
        placed = true;
      }
      glow!.dataset.visible = "true";
      if (!frame) frame = requestAnimationFrame(tick);
    }

    function hide() {
      glow!.dataset.visible = "false";
      placed = false;
    }

    function enable() {
      document.addEventListener("pointermove", onPointerMove, { passive: true });
      document.documentElement.addEventListener("mouseleave", hide);
      window.addEventListener("blur", hide);
    }

    function disable() {
      document.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("mouseleave", hide);
      window.removeEventListener("blur", hide);
      cancelAnimationFrame(frame);
      frame = 0;
      hide();
    }

    function sync() {
      disable();
      if (pointerQuery.matches) enable();
    }

    sync();
    pointerQuery.addEventListener("change", sync);
    wideQuery.addEventListener("change", sync);
    return () => {
      pointerQuery.removeEventListener("change", sync);
      wideQuery.removeEventListener("change", sync);
      disable();
    };
  }, []);

  return <div ref={glowRef} aria-hidden className="cursor-glow" />;
}
