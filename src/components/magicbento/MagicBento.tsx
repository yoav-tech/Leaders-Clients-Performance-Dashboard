"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { gsap } from "gsap";
import "./magicbento.css";

// Default glow: a violet that reads well on the dark dashboard. RGB triplet (no rgba()).
export const DEFAULT_GLOW = "139, 92, 246";
const MOBILE_BREAKPOINT = 768;
const DEFAULT_SPOTLIGHT_RADIUS = 320;
const DEFAULT_PARTICLE_COUNT = 8;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

function makeParticle(x: number, y: number, glow: string) {
  const el = document.createElement("div");
  el.style.cssText = `position:absolute;width:4px;height:4px;border-radius:50%;background:rgba(${glow},1);box-shadow:0 0 6px rgba(${glow},0.6);pointer-events:none;z-index:100;left:${x}px;top:${y}px;`;
  return el;
}

interface ParticleCardProps {
  children: ReactNode;
  className?: string;
  glowColor?: string;
  particleCount?: number;
  enableStars?: boolean;
  enableTilt?: boolean;
  enableMagnetism?: boolean;
  clickEffect?: boolean;
}

export function ParticleCard({
  children,
  className = "",
  glowColor = DEFAULT_GLOW,
  particleCount = DEFAULT_PARTICLE_COUNT,
  enableStars = true,
  enableTilt = true,
  enableMagnetism = true,
  clickEffect = true,
}: ParticleCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<HTMLDivElement[]>([]);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const isHoveredRef = useRef(false);
  const magnetismRef = useRef<gsap.core.Tween | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isMobile) return;
    const el = cardRef.current;
    if (!el) return;

    const spawnParticles = () => {
      if (!enableStars || !isHoveredRef.current) return;
      const { width, height } = el.getBoundingClientRect();
      for (let i = 0; i < particleCount; i++) {
        const t = setTimeout(() => {
          if (!isHoveredRef.current) return;
          const p = makeParticle(Math.random() * width, Math.random() * height, glowColor);
          el.appendChild(p);
          particlesRef.current.push(p);
          gsap.fromTo(p, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(1.7)" });
          gsap.to(p, {
            x: (Math.random() - 0.5) * 80,
            y: (Math.random() - 0.5) * 80,
            rotation: Math.random() * 360,
            duration: 2 + Math.random() * 2,
            ease: "none",
            repeat: -1,
            yoyo: true,
          });
          gsap.to(p, { opacity: 0.3, duration: 1.5, ease: "power2.inOut", repeat: -1, yoyo: true });
        }, i * 90);
        timeoutsRef.current.push(t);
      }
    };

    const clearParticles = () => {
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
      magnetismRef.current?.kill();
      particlesRef.current.forEach((p) =>
        gsap.to(p, { scale: 0, opacity: 0, duration: 0.3, ease: "back.in(1.7)", onComplete: () => p.remove() }),
      );
      particlesRef.current = [];
    };

    const onEnter = () => {
      isHoveredRef.current = true;
      spawnParticles();
    };
    const onLeave = () => {
      isHoveredRef.current = false;
      clearParticles();
      if (enableTilt) gsap.to(el, { rotateX: 0, rotateY: 0, duration: 0.3, ease: "power2.out" });
      if (enableMagnetism) gsap.to(el, { x: 0, y: 0, duration: 0.3, ease: "power2.out" });
    };
    const onMove = (e: MouseEvent) => {
      if (!enableTilt && !enableMagnetism) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      if (enableTilt) {
        gsap.to(el, {
          rotateX: ((y - cy) / cy) * -6,
          rotateY: ((x - cx) / cx) * 6,
          duration: 0.1,
          ease: "power2.out",
          transformPerspective: 1000,
        });
      }
      if (enableMagnetism) {
        magnetismRef.current = gsap.to(el, {
          x: (x - cx) * 0.04,
          y: (y - cy) * 0.04,
          duration: 0.3,
          ease: "power2.out",
        });
      }
    };
    const onClick = (e: MouseEvent) => {
      if (!clickEffect) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const maxD = Math.max(
        Math.hypot(x, y),
        Math.hypot(x - rect.width, y),
        Math.hypot(x, y - rect.height),
        Math.hypot(x - rect.width, y - rect.height),
      );
      const ripple = document.createElement("div");
      ripple.style.cssText = `position:absolute;width:${maxD * 2}px;height:${maxD * 2}px;border-radius:50%;background:radial-gradient(circle,rgba(${glowColor},0.35) 0%,rgba(${glowColor},0.18) 30%,transparent 70%);left:${x - maxD}px;top:${y - maxD}px;pointer-events:none;z-index:1000;`;
      el.appendChild(ripple);
      gsap.fromTo(ripple, { scale: 0, opacity: 1 }, { scale: 1, opacity: 0, duration: 0.8, ease: "power2.out", onComplete: () => ripple.remove() });
    };

    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("mouseleave", onLeave);
    el.addEventListener("mousemove", onMove);
    el.addEventListener("click", onClick);
    return () => {
      isHoveredRef.current = false;
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("mouseleave", onLeave);
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("click", onClick);
      clearParticles();
    };
  }, [isMobile, enableStars, enableTilt, enableMagnetism, clickEffect, glowColor, particleCount]);

  return (
    <div
      ref={cardRef}
      className={`mb-card mb-card--glow ${className}`}
      style={{ ["--glow-color" as string]: glowColor }}
    >
      {children}
    </div>
  );
}

interface GridProps {
  children: ReactNode;
  className?: string;
  glowColor?: string;
  spotlightRadius?: number;
  enableSpotlight?: boolean;
}

export function MagicBentoGrid({
  children,
  className = "",
  glowColor = DEFAULT_GLOW,
  spotlightRadius = DEFAULT_SPOTLIGHT_RADIUS,
  enableSpotlight = true,
}: GridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!enableSpotlight || isMobile || !gridRef.current) return;
    const grid = gridRef.current;

    const spotlight = document.createElement("div");
    spotlight.className = "global-spotlight";
    spotlight.style.cssText = `position:fixed;width:800px;height:800px;border-radius:50%;pointer-events:none;background:radial-gradient(circle,rgba(${glowColor},0.12) 0%,rgba(${glowColor},0.06) 15%,rgba(${glowColor},0.03) 25%,rgba(${glowColor},0.015) 40%,transparent 65%);z-index:40;opacity:0;transform:translate(-50%,-50%);mix-blend-mode:screen;`;
    document.body.appendChild(spotlight);

    const proximity = spotlightRadius * 0.5;
    const fade = spotlightRadius * 0.75;

    const onMove = (e: MouseEvent) => {
      const rect = grid.getBoundingClientRect();
      const inside =
        e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      const cards = grid.querySelectorAll<HTMLElement>(".mb-card");
      if (!inside) {
        gsap.to(spotlight, { opacity: 0, duration: 0.3 });
        cards.forEach((c) => c.style.setProperty("--glow-intensity", "0"));
        return;
      }
      let minDist = Infinity;
      cards.forEach((card) => {
        const r = card.getBoundingClientRect();
        const cxp = r.left + r.width / 2;
        const cyp = r.top + r.height / 2;
        const dist = Math.max(0, Math.hypot(e.clientX - cxp, e.clientY - cyp) - Math.max(r.width, r.height) / 2);
        minDist = Math.min(minDist, dist);
        let intensity = 0;
        if (dist <= proximity) intensity = 1;
        else if (dist <= fade) intensity = (fade - dist) / (fade - proximity);
        const relX = ((e.clientX - r.left) / r.width) * 100;
        const relY = ((e.clientY - r.top) / r.height) * 100;
        card.style.setProperty("--glow-x", `${relX}%`);
        card.style.setProperty("--glow-y", `${relY}%`);
        card.style.setProperty("--glow-intensity", intensity.toString());
        card.style.setProperty("--glow-radius", `${spotlightRadius}px`);
      });
      gsap.to(spotlight, { left: e.clientX, top: e.clientY, duration: 0.1, ease: "power2.out" });
      const targetOpacity = minDist <= proximity ? 0.8 : minDist <= fade ? ((fade - minDist) / (fade - proximity)) * 0.8 : 0;
      gsap.to(spotlight, { opacity: targetOpacity, duration: targetOpacity > 0 ? 0.2 : 0.5, ease: "power2.out" });
    };

    const onLeave = () => {
      grid.querySelectorAll<HTMLElement>(".mb-card").forEach((c) => c.style.setProperty("--glow-intensity", "0"));
      gsap.to(spotlight, { opacity: 0, duration: 0.3 });
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseleave", onLeave);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      spotlight.remove();
    };
  }, [enableSpotlight, isMobile, glowColor, spotlightRadius]);

  return (
    <div ref={gridRef} className={`mb-section ${className}`}>
      {children}
    </div>
  );
}
