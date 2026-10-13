"use client";

import { useEffect, useRef } from "react";

/* Matches the CSS: precise hovering pointer, no reduced-motion preference. */
const POINTER_QUERY = "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";
const WIDE_QUERY = "(min-width: 1024px)";

/** Points per thread. More points give a longer, smoother tail. */
const POINTS = 26;
/** How strongly each point is pulled toward the one ahead of it, per 60fps frame. */
const FOLLOW = 0.45;

/* Palette: cyan at the cursor, teal through the body, violet toward the tails. */
type RGB = readonly [number, number, number];
const CYAN: RGB = [103, 232, 249]; // cyan-300
const TEAL: RGB = [45, 212, 191]; // teal-400
const VIOLET: RGB = [167, 139, 250]; // violet-400

/**
 * Three thin threads that meet at the cursor and drift apart along the tail.
 * The lead thread is pinned to the pointer so the effect never lags behind it;
 * the other two ease in slightly behind for a layered, flowing feel.
 */
const THREADS = [
  { lead: 1, sway: 0, width: 1.5, alpha: 0.8 },
  { lead: 0.55, sway: 6, width: 1.1, alpha: 0.6 },
  { lead: 0.4, sway: -6, width: 0.9, alpha: 0.5 },
];

/** Particle budget; spawning scales with pointer speed up to this cap. */
const MAX_PARTICLES = 70;

type Point = { x: number; y: number };
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // seconds remaining
  maxLife: number;
  size: number;
  rgb: RGB;
};

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Colour along a thread: 0 = cursor (cyan), 0.5 = teal, 1 = tail (violet). */
function threadColor(progress: number): RGB {
  return progress < 0.5 ? mix(CYAN, TEAL, progress * 2) : mix(TEAL, VIOLET, (progress - 0.5) * 2);
}

function rgba([r, g, b]: RGB, alpha: number) {
  return `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${alpha})`;
}

/**
 * Cursor light: a small teal core, thin flowing threads and a fine particle
 * trail, all drawn on one fixed canvas behind the (unchanged) system cursor.
 *
 * Animation runs in requestAnimationFrame with frame-rate independent easing,
 * and stops itself once everything has settled, so an idle page does no work.
 * Nothing here touches React state, and the server renders the same empty
 * <canvas>, so there is no hydration mismatch. The same pointer listener also
 * positions `.spotlight` card highlights via CSS variables.
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
    const particles: Particle[] = [];
    const mouse = { x: 0, y: 0 };
    let travelled = 0; // pointer distance since the last frame, drives particle spawning
    let frame = 0;
    let lastTime = 0;
    let placed = false;
    let present = false; // pointer is inside the window
    let fade = 0; // 0-1 overall opacity, eases toward `present`

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.round(window.innerWidth * dpr);
      canvas!.height = Math.round(window.innerHeight * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /** Per-frame easing factor `k` (tuned at 60fps) adjusted for the real frame time. */
    function ease(k: number, dt: number) {
      return k >= 1 ? 1 : 1 - Math.pow(1 - k, dt * 60);
    }

    function spawnParticles() {
      const count = Math.min(4, Math.floor(travelled / 9));
      travelled -= count * 9;
      for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 6 + Math.random() * 14;
        const maxLife = 0.55 + Math.random() * 0.5;
        particles.push({
          x: mouse.x + (Math.random() - 0.5) * 6,
          y: mouse.y + (Math.random() - 0.5) * 6,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 4, // slight upward drift, like warm air
          life: maxLife,
          maxLife,
          size: 0.6 + Math.random() * 1.1,
          rgb: Math.random() < 0.25 ? VIOLET : Math.random() < 0.5 ? CYAN : TEAL,
        });
      }
    }

    function step(time: number) {
      // Clamp so a background tab returning doesn't make everything jump.
      const dt = Math.min((time - (lastTime || time)) / 1000 || 1 / 60, 1 / 20);
      lastTime = time;
      let moving = false;

      const follow = ease(FOLLOW, dt);
      threads.forEach((points, t) => {
        const lead = ease(THREADS[t].lead, dt);
        const head = points[0];
        head.x += (mouse.x - head.x) * lead;
        head.y += (mouse.y - head.y) * lead;
        for (let i = 1; i < POINTS; i++) {
          points[i].x += (points[i - 1].x - points[i].x) * follow;
          points[i].y += (points[i - 1].y - points[i].y) * follow;
        }
        const tail = points[POINTS - 1];
        if (Math.abs(tail.x - mouse.x) > 0.4 || Math.abs(tail.y - mouse.y) > 0.4) {
          moving = true;
        }
      });

      if (present) spawnParticles();
      else travelled = 0;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 1 - 2.2 * dt;
        p.vy *= 1 - 2.2 * dt;
      }

      fade += ((present ? 1 : 0) - fade) * ease(0.14, dt);

      ctx!.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (fade > 0.01) {
        drawParticles();
        for (let t = THREADS.length - 1; t >= 0; t--) {
          drawThread(threads[t], THREADS[t], time);
        }
        drawCore();
      }

      // Go idle once threads have collapsed, particles are gone and the fade
      // has settled. The last frame (the resting core) stays on the canvas.
      const fading = Math.abs((present ? 1 : 0) - fade) > 0.01;
      if (moving || fading || particles.length) {
        frame = requestAnimationFrame(step);
      } else {
        frame = 0;
        lastTime = 0;
      }
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
          Math.sin(time * 0.0035 + i * 0.42) * style.sway * (i / POINTS) * Math.min(1, len / 6);
        return { x: p.x - (dy / len) * amount, y: p.y + (dx / len) * amount };
      });

      ctx!.lineCap = "round";
      for (let i = 1; i < POINTS - 1; i++) {
        const a = drawn[i - 1];
        const b = drawn[i];
        const c = drawn[i + 1];
        const progress = i / POINTS; // 0 at the cursor, 1 at the tail
        // Ease-out fade so the tail dissolves gradually rather than linearly.
        const alpha = style.alpha * (1 - progress) * (1 - progress * 0.4) * fade;
        if (alpha < 0.01) continue;
        ctx!.beginPath();
        ctx!.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2);
        ctx!.quadraticCurveTo(b.x, b.y, (b.x + c.x) / 2, (b.y + c.y) / 2);
        ctx!.lineWidth = style.width * (1 - progress * 0.7);
        ctx!.strokeStyle = rgba(threadColor(progress), alpha);
        ctx!.stroke();
      }
    }

    function drawParticles() {
      for (const p of particles) {
        const t = p.life / p.maxLife; // 1 when born, 0 when gone
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.size * (0.5 + t * 0.5), 0, Math.PI * 2);
        ctx!.fillStyle = rgba(p.rgb, 0.7 * t * fade);
        ctx!.fill();
      }
    }

    /** Small, tight light at the exact pointer position - not a background wash. */
    function drawCore() {
      const { x, y } = mouse;
      const halo = ctx!.createRadialGradient(x, y, 0, x, y, 16);
      halo.addColorStop(0, rgba(TEAL, 0.32 * fade));
      halo.addColorStop(0.55, rgba(VIOLET, 0.1 * fade));
      halo.addColorStop(1, rgba(VIOLET, 0));
      ctx!.fillStyle = halo;
      ctx!.beginPath();
      ctx!.arc(x, y, 16, 0, Math.PI * 2);
      ctx!.fill();

      ctx!.beginPath();
      ctx!.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx!.fillStyle = rgba(CYAN, 0.9 * fade);
      ctx!.fill();
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
      if (!placed) {
        // Start collapsed on the cursor instead of sweeping in from the corner.
        for (const points of threads) {
          for (const p of points) {
            p.x = event.clientX;
            p.y = event.clientY;
          }
        }
        placed = true;
      } else {
        travelled += Math.hypot(event.clientX - mouse.x, event.clientY - mouse.y);
      }
      mouse.x = event.clientX;
      mouse.y = event.clientY;
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
      lastTime = 0;
      present = false;
      placed = false;
      fade = 0;
      travelled = 0;
      particles.length = 0;
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
