"use client";

import { useEffect, useRef } from "react";

/* Matches the CSS: precise hovering pointer, no reduced-motion preference. */
const POINTER_QUERY = "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";
const WIDE_QUERY = "(min-width: 1024px)";

/** Points per thread. More points give a longer, smoother tail. */
const POINTS = 28;
/** How strongly each point is pulled toward the one ahead of it (0-1). */
const FOLLOW = 0.42;

/**
 * Three thin threads that converge at the cursor and drift apart along the
 * tail. Each has its own colour, lag and sideways sway, so they read as
 * separate strands rather than one thick line.
 */
const THREADS = [
  { rgb: "34, 211, 238", lead: 0.5, sway: 0, width: 1.6, alpha: 0.75 }, // cyan-400
  { rgb: "59, 130, 246", lead: 0.36, sway: 7, width: 1.3, alpha: 0.65 }, // blue-500
  { rgb: "99, 102, 241", lead: 0.26, sway: -7, width: 1.1, alpha: 0.6 }, // indigo-500
];

type Point = { x: number; y: number };

/**
 * Thin, flowing line trails that follow the mouse, drawn on one fixed canvas.
 *
 * Animation runs in requestAnimationFrame and stops itself once the trails
 * have settled, so an idle page does no work. Nothing here touches React state,
 * and the server renders the same empty <canvas>, so there is no hydration
 * mismatch. The same pointer listener also positions `.spotlight` card
 * highlights via CSS variables.
 */
export function CursorTrail() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const pointerQuery = window.matchMedia(POINTER_QUERY);
    const wideQuery = window.matchMedia(WIDE_QUERY);

    const threads = THREADS.map(() =>
      Array.from({ length: POINTS }, (): Point => ({ x: 0, y: 0 })),
    );
    const mouse = { x: 0, y: 0 };
    let frame = 0;
    let placed = false;
    let present = false; // pointer is inside the window
    let fade = 0; // 0-1 overall opacity, eases toward `present`

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.round(window.innerWidth * dpr);
      canvas!.height = Math.round(window.innerHeight * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function step(time: number) {
      let moving = false;

      threads.forEach((points, t) => {
        const head = points[0];
        head.x += (mouse.x - head.x) * THREADS[t].lead;
        head.y += (mouse.y - head.y) * THREADS[t].lead;
        for (let i = 1; i < POINTS; i++) {
          points[i].x += (points[i - 1].x - points[i].x) * FOLLOW;
          points[i].y += (points[i - 1].y - points[i].y) * FOLLOW;
        }
        const tail = points[POINTS - 1];
        if (Math.abs(tail.x - mouse.x) > 0.5 || Math.abs(tail.y - mouse.y) > 0.5) {
          moving = true;
        }
      });

      fade += ((present ? 1 : 0) - fade) * 0.12;

      ctx!.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (fade > 0.01) {
        threads.forEach((points, t) => drawThread(points, THREADS[t], time));
      }

      // Go idle once every thread has collapsed onto the cursor (or faded out).
      const fading = Math.abs((present ? 1 : 0) - fade) > 0.01;
      frame = moving || fading ? requestAnimationFrame(step) : 0;
    }

    function drawThread(
      points: Point[],
      style: (typeof THREADS)[number],
      time: number,
    ) {
      // Sway each point sideways, scaled by how stretched that segment is, so a
      // resting trail collapses cleanly instead of wriggling in place.
      const drawn = points.map((p, i) => {
        if (i === 0 || !style.sway) return p;
        const prev = points[i - 1];
        const dx = p.x - prev.x;
        const dy = p.y - prev.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.01) return p;
        const amount =
          Math.sin(time * 0.004 + i * 0.45) * style.sway * (i / POINTS) * Math.min(1, len / 6);
        return { x: p.x - (dy / len) * amount, y: p.y + (dx / len) * amount };
      });

      ctx!.lineCap = "round";
      for (let i = 1; i < POINTS - 1; i++) {
        const a = drawn[i - 1];
        const b = drawn[i];
        const c = drawn[i + 1];
        const progress = i / POINTS; // 0 at the cursor, 1 at the tail
        ctx!.beginPath();
        ctx!.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2);
        ctx!.quadraticCurveTo(b.x, b.y, (b.x + c.x) / 2, (b.y + c.y) / 2);
        ctx!.lineWidth = style.width * (1 - progress * 0.75);
        ctx!.strokeStyle = `rgba(${style.rgb}, ${style.alpha * (1 - progress) * fade})`;
        ctx!.stroke();
      }
    }

    function wake() {
      if (!frame) frame = requestAnimationFrame(step);
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
      mouse.x = event.clientX;
      mouse.y = event.clientY;
      if (!placed) {
        // Start collapsed on the cursor instead of sweeping in from the corner.
        for (const points of threads) {
          for (const p of points) {
            p.x = mouse.x;
            p.y = mouse.y;
          }
        }
        placed = true;
      }
      present = true;
      wake();
    }

    function onLeave() {
      present = false;
      placed = false;
      wake();
    }

    function enable() {
      resize();
      document.addEventListener("pointermove", onPointerMove, { passive: true });
      document.documentElement.addEventListener("mouseleave", onLeave);
      window.addEventListener("blur", onLeave);
      window.addEventListener("resize", resize);
    }

    function disable() {
      document.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("blur", onLeave);
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frame);
      frame = 0;
      present = false;
      placed = false;
      fade = 0;
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
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

  return <canvas ref={canvasRef} aria-hidden className="cursor-trail" />;
}
