"use client";

import Image from "next/image";
import { useRef } from "react";

/**
 * The landing page's 3D bag display: three real bag photos stacked in depth
 * that tilt toward the pointer (or finger) and float gently, with rice grains
 * drifting at different depths. Pure CSS 3D transforms; motion is switched off
 * for people who ask their device to reduce motion.
 */
const GRAINS = [
  { x: 8, y: 18, z: 120, r: 24, d: 0 }, { x: 86, y: 12, z: 160, r: -30, d: 1.2 }, { x: 92, y: 62, z: 90, r: 60, d: 2.1 },
  { x: 4, y: 70, z: 140, r: -15, d: 0.6 }, { x: 70, y: 88, z: 180, r: 35, d: 1.7 }, { x: 22, y: 92, z: 70, r: -50, d: 2.6 },
  { x: 50, y: 4, z: 110, r: 80, d: 0.9 }, { x: 98, y: 36, z: 60, r: 10, d: 3 }, { x: 14, y: 44, z: 200, r: -70, d: 1.4 },
];

export function Hero3D({ images }: { images: { src: string; label: string }[] }) {
  const stage = useRef<HTMLDivElement>(null);

  const tilt = (clientX: number, clientY: number) => {
    const el = stage.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (clientX - r.left) / r.width - 0.5;
    const y = (clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--ry", `${x * 26}deg`);
    el.style.setProperty("--rx", `${-y * 18}deg`);
  };
  const reset = () => {
    stage.current?.style.setProperty("--ry", "-14deg");
    stage.current?.style.setProperty("--rx", "6deg");
  };
  const [back, middle, front] = images;

  return (
    <div
      ref={stage}
      className="hero-stage relative mx-auto aspect-square w-full max-w-[26rem] select-none"
      onPointerMove={(e) => tilt(e.clientX, e.clientY)}
      onPointerLeave={reset}
      aria-hidden="true"
    >
      <div className="hero-scene absolute inset-0">
        <div className="hero-glow" />
        {back && (
          <figure className="hero-bag" style={{ "--tx": "-24%", "--ty": "-12%", "--tz": "-140px", "--rot": "-9deg", "--s": "0.7" } as React.CSSProperties}>
            <Image src={back.src} alt="" fill sizes="260px" className="object-contain p-[7%]" />
            <figcaption>{back.label}</figcaption>
          </figure>
        )}
        {middle && (
          <figure className="hero-bag" style={{ "--tx": "26%", "--ty": "-4%", "--tz": "-60px", "--rot": "8deg", "--s": "0.72" } as React.CSSProperties}>
            <Image src={middle.src} alt="" fill sizes="260px" className="object-contain p-[7%]" />
            <figcaption>{middle.label}</figcaption>
          </figure>
        )}
        {front && (
          <figure className="hero-bag hero-bag-front" style={{ "--tx": "0%", "--ty": "10%", "--tz": "60px", "--rot": "-2deg", "--s": "0.82" } as React.CSSProperties}>
            <Image src={front.src} alt="" fill priority sizes="(min-width: 768px) 340px, 70vw" className="object-contain p-[6%]" />
            <figcaption>{front.label}</figcaption>
          </figure>
        )}
        {GRAINS.map((g, i) => (
          <span
            key={i}
            className="hero-grain"
            style={{ left: `${g.x}%`, top: `${g.y}%`, "--gz": `${g.z}px`, "--gr": `${g.r}deg`, animationDelay: `${g.d}s` } as React.CSSProperties}
          />
        ))}
      </div>
    </div>
  );
}
