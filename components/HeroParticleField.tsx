"use client";

import { useEffect, useRef } from "react";

export function HeroParticleField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasElement = canvas;

    const context = canvasElement.getContext("2d");
    if (!context) return;
    const canvasContext = context;

    let animationFrame = 0;
    let width = 0;
    let height = 0;
    let devicePixelRatio = 1;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function resize() {
      const rect = canvasElement.getBoundingClientRect();
      devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvasElement.width = Math.floor(width * devicePixelRatio);
      canvasElement.height = Math.floor(height * devicePixelRatio);
      canvasContext.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }

    function draw(timeMs: number) {
      const time = timeMs * 0.001;
      canvasContext.clearRect(0, 0, width, height);

      const centerX = width * 0.58;
      const centerY = height * 0.5;
      const columns = Math.max(46, Math.floor(width / 24));
      const rows = Math.max(34, Math.floor(height / 22));
      const maxRadius = Math.min(width, height) * 0.62;

      const glow = canvasContext.createRadialGradient(centerX, centerY, 0, centerX, centerY, maxRadius);
      glow.addColorStop(0, "rgba(125, 211, 252, 0.18)");
      glow.addColorStop(0.34, "rgba(14, 118, 253, 0.08)");
      glow.addColorStop(1, "rgba(2, 6, 23, 0)");
      canvasContext.fillStyle = glow;
      canvasContext.fillRect(0, 0, width, height);

      for (let row = 0; row < rows; row += 1) {
        const v = row / (rows - 1);
        const yBase = (v - 0.5) * height * 1.08;

        for (let column = 0; column < columns; column += 1) {
          const u = column / (columns - 1);
          const xBase = (u - 0.5) * width * 1.2;
          const depth = 0.2 + u * 1.1;
          const wave =
            Math.sin(u * 9.2 + time * 1.1) * 54 +
            Math.cos(v * 10.5 - time * 1.55) * 34 +
            Math.sin((u + v) * 12 + time * 0.85) * 20;
          const pinch = Math.sin(u * Math.PI) ** 2;
          const twist = Math.sin(time * 0.55 + u * 6.6) * pinch * 170;
          const tunnel = 1 / (0.72 + depth * 0.72);
          const x = centerX + xBase * tunnel + twist * (v - 0.5);
          const y = centerY + (yBase + wave * pinch) * tunnel;

          const edgeFade = Math.max(0, 1 - Math.abs(v - 0.5) * 1.65);
          const depthFade = 0.24 + u * 0.88;
          const highlight = Math.max(0, Math.sin(u * Math.PI * 2.2 + time * 1.8));
          const alpha = Math.min(0.9, edgeFade * depthFade * (0.34 + highlight * 0.46));
          if (alpha <= 0.04) continue;

          const radius = (0.7 + u * 1.4 + highlight * 0.75) * tunnel;
          canvasContext.beginPath();
          canvasContext.fillStyle = `rgba(205, 245, 255, ${alpha})`;
          canvasContext.arc(x, y, radius, 0, Math.PI * 2);
          canvasContext.fill();
        }
      }

      const ringX = centerX + Math.sin(time * 0.55) * width * 0.08;
      const ringGradient = canvasContext.createRadialGradient(ringX, centerY, maxRadius * 0.18, ringX, centerY, maxRadius * 0.72);
      ringGradient.addColorStop(0, "rgba(255,255,255,0)");
      ringGradient.addColorStop(0.46, "rgba(186, 230, 253,0.03)");
      ringGradient.addColorStop(0.5, "rgba(186, 230, 253,0.24)");
      ringGradient.addColorStop(0.56, "rgba(14, 118, 253,0.08)");
      ringGradient.addColorStop(1, "rgba(255,255,255,0)");
      canvasContext.fillStyle = ringGradient;
      canvasContext.fillRect(0, 0, width, height);

      if (!reduceMotion) {
        animationFrame = requestAnimationFrame(draw);
      }
    }

    resize();
    if (reduceMotion) {
      draw(0);
    } else {
      animationFrame = requestAnimationFrame(draw);
    }
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="questora-particle-canvas" aria-hidden="true" />;
}
