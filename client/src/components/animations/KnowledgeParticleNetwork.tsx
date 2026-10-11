"use client";

import React, { useEffect, useRef, useCallback, useState } from "react";
import { useTheme } from "next-themes";

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface KnowledgeParticleNetworkProps {
  /** Number of floating legal/tech symbols. Default: 115 (scaled down on mobile) */
  particleCount?: number;
  /** Custom particle color override for dark mode (defaults to #94A3B8) */
  darkParticleColor?: string;
  /** Custom accent color override for dark mode (defaults to #60A5FA) */
  darkAccentColor?: string;
  /** Custom particle color override for light mode (defaults to #475569) */
  lightParticleColor?: string;
  /** Custom accent color override for light mode (defaults to #2563EB) */
  lightAccentColor?: string;
  /** Maximum distance in px for drawing knowledge graph edges. Default: 125 */
  connectionDistance?: number;
  /** Influence radius of mouse interaction in px. Default: 165 */
  mouseRadius?: number;
  /** Repulsion strength away from mouse. Default: 38 */
  interactionStrength?: number;
  /** Base drift animation speed multiplier. Default: 1 */
  animationSpeed?: number;
  /** Additional CSS class names for the outer container */
  className?: string;
}

interface Particle {
  // Base 3D coordinates relative to center
  bx: number;
  by: number;
  bz: number;

  // Real-time animated coordinates
  x: number;
  y: number;
  z: number;

  // Spring physics displacement from mouse repulsion
  dispX: number;
  dispY: number;
  vx: number;
  vy: number;

  // Visual attributes
  symbol: string;
  baseSize: number;
  darkOpacity: number;
  lightOpacity: number;
  isAccent: boolean;

  // Independent oscillation phase offsets
  driftPhaseX: number;
  driftPhaseY: number;
  driftPhaseZ: number;
  driftFreqX: number;
  driftFreqY: number;

  // Real-time interpolated opacity & proximity highlight
  currentOpacity: number;
  proximityGlow: number;
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

// ============================================================================
// Color Palettes & Helpers
// ============================================================================

// Dark Mode Palette:
// - Slate-gray particles: #94A3B8
// - Blue accents: #60A5FA
// - Subtle blue connections: #64748B (normal) / #60A5FA (accent)
const DEFAULT_DARK_PARTICLE: RGB = { r: 148, g: 163, b: 184 };
const DEFAULT_DARK_ACCENT: RGB = { r: 96, g: 165, b: 250 };
const DEFAULT_DARK_LINE_NORMAL: RGB = { r: 100, g: 116, b: 139 };
const DEFAULT_DARK_LINE_ACCENT: RGB = { r: 96, g: 165, b: 250 };

// Light Mode Palette:
// - Slate-gray particles: #475569
// - Royal-blue accents: #2563EB
// - Muted blue-gray connections: #94A3B8 (normal) / #2563EB (accent)
const DEFAULT_LIGHT_PARTICLE: RGB = { r: 71, g: 85, b: 105 };
const DEFAULT_LIGHT_ACCENT: RGB = { r: 37, g: 99, b: 235 };
const DEFAULT_LIGHT_LINE_NORMAL: RGB = { r: 148, g: 163, b: 184 };
const DEFAULT_LIGHT_LINE_ACCENT: RGB = { r: 37, g: 99, b: 235 };

const parseColorToRGB = (colorStr?: string, defaultRGB: RGB = { r: 0, g: 0, b: 0 }): RGB => {
  if (!colorStr) return defaultRGB;
  if (colorStr.startsWith("#")) {
    let c = colorStr.substring(1);
    if (c.length === 3) c = c.split("").map((ch) => ch + ch).join("");
    const num = parseInt(c, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255,
    };
  }
  const rgbMatch = colorStr.match(/\d+/g);
  if (rgbMatch && rgbMatch.length >= 3) {
    return {
      r: parseInt(rgbMatch[0], 10),
      g: parseInt(rgbMatch[1], 10),
      b: parseInt(rgbMatch[2], 10),
    };
  }
  return defaultRGB;
};

const lerpRGB = (c1: RGB, c2: RGB, t: number): RGB => ({
  r: Math.round(c1.r + (c2.r - c1.r) * t),
  g: Math.round(c1.g + (c2.g - c1.g) * t),
  b: Math.round(c1.b + (c2.b - c1.b) * t),
});

const toRGBA = (c: RGB, a: number): string =>
  `rgba(${c.r}, ${c.g}, ${c.b}, ${Math.max(0, Math.min(1, a)).toFixed(3)})`;

// Legal & Code/Graph symbols representing regulations, clauses, logic, and data
const SYMBOL_POOL = ["§", "{}", "<>", "01", "//", "=", "*", "+", "%", ":", "-"];

export default function KnowledgeParticleNetwork({
  particleCount = 115,
  darkParticleColor,
  darkAccentColor,
  lightParticleColor,
  lightAccentColor,
  connectionDistance = 125,
  mouseRadius = 165,
  interactionStrength = 38,
  animationSpeed = 1,
  className = "",
}: KnowledgeParticleNetworkProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Application Theme Detection via next-themes and document class observer
  const { resolvedTheme } = useTheme();
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return true;
  });

  // Theme transition progress: 0.0 (light) -> 1.0 (dark) with smooth interpolation
  const themeProgressRef = useRef<number>(isDarkMode ? 1.0 : 0.0);

  // Sync theme changes immediately via both next-themes and DOM mutation
  useEffect(() => {
    const updateThemeState = () => {
      const isDark = document.documentElement.classList.contains("dark");
      setIsDarkMode(isDark);
    };

    updateThemeState();

    const observer = new MutationObserver(updateThemeState);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  // Also react when resolvedTheme changes from useTheme()
  useEffect(() => {
    if (resolvedTheme) {
      setIsDarkMode(resolvedTheme === "dark");
    }
  }, [resolvedTheme]);

  // Mouse state
  const mouseRef = useRef({
    x: -9999,
    y: -9999,
    targetX: -9999,
    targetY: -9999,
    isHovering: false,
  });

  // RAF and sizing
  const animationFrameRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const dimensionsRef = useRef({ width: 0, height: 0, dpr: 1 });

  // Initialize particles organically across the ENTIRE hero width and height
  const initParticles = useCallback(
    (width: number, height: number) => {
      // Scale count down on mobile / small screens
      const isMobile = width < 768;
      const effectiveCount = Math.round(isMobile ? particleCount * 0.55 : particleCount);
      const rz = 240;

      const newParticles: Particle[] = [];

      for (let i = 0; i < effectiveCount; i++) {
        let bx = 0;
        let by = 0;
        const bz = (Math.random() - 0.5) * rz * 2;

        // Partition distribution across 3 organic spatial zones:
        // - Zone 1: Left Flank (42% of particles) in empty left hero gutter
        // - Zone 2: Right Flank (42% of particles) in empty right hero gutter
        // - Zone 3: Upper Perimeter Halo (16% of particles) above headline/badge
        const zone = i % 100;

        if (zone < 42) {
          // Left Flank: spanning from -48% width to -16% width from center
          const t = Math.random();
          bx = -width * (0.16 + t * 0.32);
          by = (Math.random() - 0.5) * height * 0.88;
        } else if (zone < 84) {
          // Right Flank: spanning from +16% width to +48% width from center
          const t = Math.random();
          bx = width * (0.16 + t * 0.32);
          by = (Math.random() - 0.5) * height * 0.88;
        } else {
          // Upper & Perimeter Halo: distributed across width, concentrated above headline
          bx = (Math.random() - 0.5) * width * 0.82;
          by = -height * (0.18 + Math.random() * 0.28);
        }

        // Add soft organic jitter to eliminate any artificial boundary lines
        bx += (Math.random() - 0.5) * 40;
        by += (Math.random() - 0.5) * 35;

        // Symbol selection: legal section (§) and data ({}, <>) prominent
        const symbolIdx =
          i % 4 === 0
            ? 0 // "§"
            : i % 4 === 1
            ? 1 // "{}"
            : Math.floor(Math.random() * SYMBOL_POOL.length);
        const symbol = SYMBOL_POOL[symbolIdx];

        // 14-16% of particles are active knowledge graph nodes
        const isAccent = Math.random() < 0.16;

        // Independent opacity per theme based on depth & contrast requirements:
        // - In Light Mode: contrast against #F8FAFC/white needs crisp presence without visual noise
        // - In Dark Mode: contrast against #09090B needs cinematic, glowing presence
        const depthRatio = (bz + rz) / (rz * 2); // 0 (far) to 1 (near)

        const darkOpacity = isAccent
          ? 0.40 + depthRatio * 0.28
          : 0.18 + depthRatio * 0.24;

        const lightOpacity = isAccent
          ? 0.56 + depthRatio * 0.26
          : 0.24 + depthRatio * 0.24;

        // Size: 10.5px - 15px based on depth
        const baseSize = 10.5 + depthRatio * 4.5;

        newParticles.push({
          bx,
          by,
          bz,
          x: bx,
          y: by,
          z: bz,
          dispX: 0,
          dispY: 0,
          vx: 0,
          vy: 0,
          symbol,
          baseSize,
          darkOpacity,
          lightOpacity,
          isAccent,
          driftPhaseX: Math.random() * Math.PI * 2,
          driftPhaseY: Math.random() * Math.PI * 2,
          driftPhaseZ: Math.random() * Math.PI * 2,
          driftFreqX: 0.6 + Math.random() * 0.8,
          driftFreqY: 0.5 + Math.random() * 0.7,
          currentOpacity: darkOpacity,
          proximityGlow: 0,
        });
      }

      particlesRef.current = newParticles;
    },
    [particleCount]
  );

  // Setup Canvas and Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Track mouse events across the full hero section
    const trackingElement = container.closest("section") || container;

    // Reduced motion preference
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let prefersReducedMotion = mediaQuery.matches;

    const handleMotionPreference = (e: MediaQueryListEvent) => {
      prefersReducedMotion = e.matches;
    };
    mediaQuery.addEventListener("change", handleMotionPreference);

    // Resize Handler
    const updateDimensions = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(rect.width, 320);
      const height = Math.max(rect.height, 240);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      dimensionsRef.current = { width, height, dpr };

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      initParticles(width, height);
    };

    updateDimensions();

    const resizeObserver = new ResizeObserver(() => {
      updateDimensions();
    });
    resizeObserver.observe(container);

    // Mouse & Touch Listeners across full hero section
    const handlePointerMove = (clientX: number, clientY: number) => {
      const rect = container.getBoundingClientRect();
      mouseRef.current.targetX = clientX - rect.left;
      mouseRef.current.targetY = clientY - rect.top;
      mouseRef.current.isHovering = true;
    };

    const onMouseMove = (e: MouseEvent) => {
      handlePointerMove(e.clientX, e.clientY);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const onMouseLeave = () => {
      mouseRef.current.isHovering = false;
      mouseRef.current.targetX = -9999;
      mouseRef.current.targetY = -9999;
    };

    trackingElement.addEventListener("mousemove", onMouseMove as EventListener, { passive: true });
    trackingElement.addEventListener("touchmove", onTouchMove as EventListener, { passive: true });
    trackingElement.addEventListener("mouseleave", onMouseLeave as EventListener, { passive: true });
    trackingElement.addEventListener("touchend", onMouseLeave as EventListener, { passive: true });

    // Color definitions
    const darkParticleRGB = parseColorToRGB(darkParticleColor, DEFAULT_DARK_PARTICLE);
    const darkAccentRGB = parseColorToRGB(darkAccentColor, DEFAULT_DARK_ACCENT);
    const lightParticleRGB = parseColorToRGB(lightParticleColor, DEFAULT_LIGHT_PARTICLE);
    const lightAccentRGB = parseColorToRGB(lightAccentColor, DEFAULT_LIGHT_ACCENT);

    // Main Animation Loop
    let lastTime = performance.now();

    const render = (currentTime: number) => {
      const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;

      const { width, height, dpr } = dimensionsRef.current;
      if (width === 0 || height === 0) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      // ======================================================================
      // 1. Smooth Theme Interpolation (0.0 = Light Mode, 1.0 = Dark Mode)
      // ======================================================================
      const targetTheme = isDarkMode ? 1.0 : 0.0;
      // Smooth interpolation transition over ~300ms without abrupt color jumps
      const themeInterpolationSpeed = dt * 3.8;
      if (Math.abs(themeProgressRef.current - targetTheme) > 0.001) {
        themeProgressRef.current +=
          (targetTheme - themeProgressRef.current) * Math.min(themeInterpolationSpeed, 0.25);
      } else {
        themeProgressRef.current = targetTheme;
      }
      const tp = themeProgressRef.current;

      // Interpolate real-time palette based on theme progress
      const currentParticleRGB = lerpRGB(lightParticleRGB, darkParticleRGB, tp);
      const currentAccentRGB = lerpRGB(lightAccentRGB, darkAccentRGB, tp);
      const currentLineNormalRGB = lerpRGB(DEFAULT_LIGHT_LINE_NORMAL, DEFAULT_DARK_LINE_NORMAL, tp);
      const currentLineAccentRGB = lerpRGB(DEFAULT_LIGHT_LINE_ACCENT, DEFAULT_DARK_LINE_ACCENT, tp);

      // Glow setting: in light mode remove excessive glow (clean & crisp enterprise-grade);
      // in dark mode retain subtle neon ambient aura
      const maxGlowBlur = Math.round(8 * tp);

      // Smooth mouse easing (Lerp)
      const mouse = mouseRef.current;
      if (mouse.isHovering) {
        mouse.x += (mouse.targetX - mouse.x) * 0.12;
        mouse.y += (mouse.targetY - mouse.y) * 0.12;
      } else {
        mouse.x += (mouse.targetX - mouse.x) * 0.05;
        mouse.y += (mouse.targetY - mouse.y) * 0.05;
      }

      // Parallax center offset
      const centerX = width / 2;
      const centerY = height / 2;
      const parallaxFactor = prefersReducedMotion ? 0 : 0.022;
      const currentCenterX =
        centerX + (mouse.isHovering ? (mouse.x - centerX) * parallaxFactor : 0);
      const currentCenterY =
        centerY + (mouse.isHovering ? (mouse.y - centerY) * parallaxFactor : 0);

      // Subtle 3D tilt sway and breathing (keeps flanks in position without rotating 360°)
      const speedMult = prefersReducedMotion ? 0.08 : animationSpeed;
      const swayAngle = Math.sin(currentTime * 0.00035 * speedMult) * 0.07;
      const breathing = 1 + Math.sin(currentTime * 0.00065 * speedMult) * 0.03;

      const cosA = Math.cos(swayAngle);
      const sinA = Math.sin(swayAngle);
      const fov = 520;

      // Text block geometry for central readability mask
      const textCenterX = currentCenterX;
      // Vertically centered around H1/subhead in the upper-mid hero
      const textCenterY = Math.min(height * 0.32, 280);
      const textRadiusX = Math.min(width * 0.36, 520);
      const textRadiusY = Math.min(height * 0.28, 220);

      // Spring physics
      const springK = 0.08;
      const damping = 0.86;

      interface ProjectedNode {
        px: number;
        py: number;
        scale: number;
        opacity: number;
        symbol: string;
        fontSize: number;
        isAccent: boolean;
        proximityGlow: number;
        readability: number;
        vFade: number;
      }

      const projectedNodes: ProjectedNode[] = [];
      const particles = particlesRef.current;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // 1. Sinusoidal multi-frequency drift
        const t = currentTime * 0.001 * speedMult;
        const driftX = Math.sin(t * p.driftFreqX + p.driftPhaseX) * 11;
        const driftY = Math.cos(t * p.driftFreqY + p.driftPhaseY) * 9;
        const driftZ = Math.sin(t * 0.4 + p.driftPhaseZ) * 8;

        const rawX = (p.bx + driftX) * breathing;
        const rawY = (p.by + driftY) * breathing;
        const rawZ = (p.bz + driftZ) * breathing;

        // 2. Subtle 3D sway tilt
        const rotX = rawX * cosA - rawZ * sinA;
        const rotZ = rawX * sinA + rawZ * cosA;
        const rotY = rawY;

        // 3. Perspective projection
        const scale = fov / (fov + rotZ + 240);
        const screenX = currentCenterX + rotX * scale;
        const screenY = currentCenterY + rotY * scale;

        // 4. Mouse repulsion & magnetic spring physics across full hero width
        let targetDispX = 0;
        let targetDispY = 0;
        let distToMouse = 9999;

        if (mouse.isHovering && !prefersReducedMotion) {
          const dx = screenX + p.dispX - mouse.x;
          const dy = screenY + p.dispY - mouse.y;
          distToMouse = Math.hypot(dx, dy);

          if (distToMouse < mouseRadius && distToMouse > 0.001) {
            // Smooth inverse-falloff magnetic push
            const factor = Math.pow(1 - distToMouse / mouseRadius, 1.8);
            const force = factor * interactionStrength;
            targetDispX = (dx / distToMouse) * force;
            targetDispY = (dy / distToMouse) * force;

            // Proximity glow & brightness boost
            p.proximityGlow = Math.min(p.proximityGlow + factor * 0.3, 1);
          } else {
            p.proximityGlow *= 0.94;
          }
        } else {
          p.proximityGlow *= 0.92;
        }

        // Spring integration
        p.vx = (p.vx + (targetDispX - p.dispX) * springK) * damping;
        p.vy = (p.vy + (targetDispY - p.dispY) * springK) * damping;
        p.dispX += p.vx;
        p.dispY += p.vy;

        const finalX = screenX + p.dispX;
        const finalY = screenY + p.dispY;

        // ====================================================================
        // Spatial Masking & Opacity Modulation
        // ====================================================================

        // A. Central Readability Mask:
        // Attenuates particles directly behind the badge, H1, description, and CTAs
        const ndx = (finalX - textCenterX) / textRadiusX;
        const ndy = (finalY - textCenterY) / textRadiusY;
        const textDist = Math.sqrt(ndx * ndx + ndy * ndy);

        let readabilityFactor = 1.0;
        if (textDist < 1.0) {
          // Inside central text zone, drops smoothly to ~0.07 (subtle ghost)
          readabilityFactor = 0.07 + 0.93 * Math.pow(textDist, 1.8);
        }

        // B. Outer Edge Boost:
        // Increase particle visibility toward the outer flanks of the hero
        const flankDist = Math.abs(finalX - currentCenterX) / (width * 0.5);
        const edgeBoost = 1.0 + Math.min(flankDist, 1.0) * 0.40;

        // C. Bottom & Top Vertical Fade:
        // Gradually fade out particles toward the bottom where the Knowledge Graph section begins
        const yRatio = finalY / height;
        let vFade = 1.0;
        if (yRatio > 0.55) {
          // Dissolves smoothly before reaching the Connected Knowledge Graph mockup
          vFade = Math.max(0, 1 - (yRatio - 0.55) / 0.30);
        }
        if (yRatio < 0.06) {
          // Subtle top fade to keep navbar transition crisp
          vFade = Math.min(vFade, Math.max(0, yRatio / 0.06));
        }

        // Theme-interpolated base opacity (light mode tuned independently from dark mode)
        const baseThemeOpacity = p.lightOpacity + (p.darkOpacity - p.lightOpacity) * tp;
        const depthOpacity = baseThemeOpacity * scale;
        const ambientOpacity = depthOpacity * readabilityFactor * edgeBoost * vFade;

        // Mouse proximity temporarily illuminates particles even in the central region
        const proximityBoost = p.proximityGlow * 0.55;
        const targetOpacity = Math.min(
          Math.max(ambientOpacity, 0) + proximityBoost,
          0.95
        );
        p.currentOpacity += (targetOpacity - p.currentOpacity) * 0.18;

        projectedNodes.push({
          px: finalX,
          py: finalY,
          scale,
          opacity: p.currentOpacity,
          symbol: p.symbol,
          fontSize: Math.round(p.baseSize * scale),
          isAccent: p.isAccent,
          proximityGlow: p.proximityGlow,
          readability: readabilityFactor,
          vFade,
        });
      }

      // ======================================================================
      // 5. Draw Knowledge Graph Connections
      // ======================================================================
      const maxDist = connectionDistance;
      const maxConnectionsPerNode = 3;
      const connectionCounts = new Uint8Array(projectedNodes.length);

      for (let i = 0; i < projectedNodes.length; i++) {
        if (connectionCounts[i] >= maxConnectionsPerNode) continue;
        const n1 = projectedNodes[i];
        if (n1.opacity < 0.02) continue;

        for (let j = i + 1; j < projectedNodes.length; j++) {
          if (connectionCounts[j] >= maxConnectionsPerNode) continue;
          const n2 = projectedNodes[j];
          if (n2.opacity < 0.02) continue;

          const dx = n1.px - n2.px;
          const dy = n1.py - n2.py;
          const dist = Math.hypot(dx, dy);

          if (dist < maxDist) {
            connectionCounts[i]++;
            connectionCounts[j]++;

            const distanceFactor = 1 - dist / maxDist;

            // Proximity to mouse reveals lines with soft accent glow
            let mouseInfluence = 0;
            if (mouse.isHovering) {
              const midX = (n1.px + n2.px) * 0.5;
              const midY = (n1.py + n2.py) * 0.5;
              const dMouse = Math.hypot(midX - mouse.x, midY - mouse.y);
              if (dMouse < mouseRadius) {
                mouseInfluence = Math.pow(1 - dMouse / mouseRadius, 1.5);
              }
            }

            // Connection lines also respect central readability & bottom fade
            const lineSpatialFactor = Math.min(n1.readability, n2.readability) * Math.min(n1.vFade, n2.vFade);
            const isEitherAccent = n1.isAccent || n2.isAccent;

            // In light mode lines are crisp and slightly higher alpha for contrast against light slate;
            // in dark mode lines are subtle and cinematic
            const baseLineAlphaLight = isEitherAccent ? 0.12 : 0.06;
            const baseLineAlphaDark = isEitherAccent ? 0.09 : 0.045;
            const interpolatedBaseAlpha = baseLineAlphaLight + (baseLineAlphaDark - baseLineAlphaLight) * tp;

            const lineAlpha = Math.min(
              interpolatedBaseAlpha * distanceFactor * lineSpatialFactor +
                mouseInfluence * 0.40 * Math.min(n1.vFade, n2.vFade),
              0.55
            );

            if (lineAlpha > 0.015) {
              ctx.beginPath();
              ctx.moveTo(n1.px, n1.py);
              ctx.lineTo(n2.px, n2.py);

              if (mouseInfluence > 0.1 || isEitherAccent) {
                ctx.strokeStyle = toRGBA(currentLineAccentRGB, lineAlpha);
                // Crisp thin line in light mode (0.65px), subtle aura in dark mode (0.85px)
                ctx.lineWidth = tp > 0.5 ? (mouseInfluence > 0.2 ? 0.9 : 0.7) : (mouseInfluence > 0.2 ? 0.75 : 0.55);
              } else {
                ctx.strokeStyle = toRGBA(currentLineNormalRGB, lineAlpha);
                ctx.lineWidth = 0.5;
              }
              ctx.stroke();
            }
          }
        }
      }

      // ======================================================================
      // 6. Draw Symbols (Nodes)
      // ======================================================================
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (let i = 0; i < projectedNodes.length; i++) {
        const node = projectedNodes[i];
        if (node.opacity < 0.015) continue;

        ctx.font = `${node.fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;

        if (node.isAccent) {
          // Accent node: royal-blue in light mode (#2563EB), soft blue in dark mode (#60A5FA)
          ctx.fillStyle = toRGBA(currentAccentRGB, node.opacity);

          if (node.proximityGlow > 0.1 && maxGlowBlur > 0) {
            // Subtle glow in dark mode, crisp in light mode
            ctx.shadowColor = toRGBA(currentAccentRGB, 0.8);
            ctx.shadowBlur = Math.round(node.proximityGlow * maxGlowBlur);
          } else {
            ctx.shadowBlur = 0;
          }
        } else {
          // Muted slate symbol: #475569 in light mode, #94A3B8 in dark mode
          ctx.fillStyle = toRGBA(currentParticleRGB, node.opacity);
          ctx.shadowBlur = 0;
        }

        ctx.fillText(node.symbol, node.px, node.py);
      }

      ctx.restore();
      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);

    // Cleanup
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      resizeObserver.disconnect();
      mediaQuery.removeEventListener("change", handleMotionPreference);
      trackingElement.removeEventListener("mousemove", onMouseMove as EventListener);
      trackingElement.removeEventListener("touchmove", onTouchMove as EventListener);
      trackingElement.removeEventListener("mouseleave", onMouseLeave as EventListener);
      trackingElement.removeEventListener("touchend", onMouseLeave as EventListener);
    };
  }, [
    initParticles,
    animationSpeed,
    interactionStrength,
    mouseRadius,
    connectionDistance,
    darkParticleColor,
    darkAccentColor,
    lightParticleColor,
    lightAccentColor,
    isDarkMode,
  ]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden select-none pointer-events-none ${className}`}
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className="block w-full h-full pointer-events-none"
      />
      {/* Theme-aware soft bottom dissolve where the Connected Knowledge Graph section begins */}
      <div
        className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none bg-gradient-to-b from-transparent via-slate-50/70 to-slate-50 dark:via-[#09090B]/70 dark:to-[#09090B] transition-colors duration-300"
        aria-hidden="true"
      />
    </div>
  );
}
