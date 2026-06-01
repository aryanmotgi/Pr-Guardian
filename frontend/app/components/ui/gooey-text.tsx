"use client";

// Gooey text morphing — adapted from victorwelander/gooey-text-morphing
// (https://21st.dev/community/components/victorwelander/gooey-text-morphing/default)
// Two stacked text spans cross-blur into each other; an SVG threshold filter
// (feColorMatrix cranking alpha contrast) fuses the blur into a liquid "goo".
import React from "react";
import { cn } from "@/app/lib/utils";

interface GooeyTextProps {
  texts: string[];
  morphTime?: number;
  cooldownTime?: number;
  className?: string;
  textClassName?: string;
}

export function GooeyText({
  texts,
  morphTime = 1,
  cooldownTime = 0.4,
  className,
  textClassName,
}: GooeyTextProps) {
  const text1Ref = React.useRef<HTMLSpanElement>(null);
  const text2Ref = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    if (texts.length === 0) return;
    let textIndex = texts.length - 1;
    let morph = 0;
    let cooldown = cooldownTime;
    let lastTime = performance.now();
    let raf = 0;

    const setMorph = (fraction: number) => {
      const t1 = text1Ref.current;
      const t2 = text2Ref.current;
      if (!t1 || !t2) return;

      t2.style.filter = `blur(${Math.min(8 / fraction - 8, 100)}px)`;
      t2.style.opacity = `${Math.pow(fraction, 0.4) * 100}%`;

      const inv = 1 - fraction;
      t1.style.filter = `blur(${Math.min(8 / inv - 8, 100)}px)`;
      t1.style.opacity = `${Math.pow(inv, 0.4) * 100}%`;
    };

    const setText = () => {
      const t1 = text1Ref.current;
      const t2 = text2Ref.current;
      if (!t1 || !t2) return;
      const current = textIndex % texts.length;
      const next = (textIndex + 1) % texts.length;
      t1.textContent = texts[current];
      t2.textContent = texts[next];
    };

    const doCooldown = () => {
      morph = 0;
      const t1 = text1Ref.current;
      const t2 = text2Ref.current;
      if (t1 && t2) {
        t2.style.filter = "";
        t2.style.opacity = "100%";
        t1.style.filter = "";
        t1.style.opacity = "0%";
      }
    };

    const doMorph = () => {
      morph -= cooldown;
      cooldown = 0;
      let fraction = morph / morphTime;
      if (fraction > 1) {
        cooldown = cooldownTime;
        fraction = 1;
      }
      setMorph(fraction);
    };

    setText();

    const animate = (now: number) => {
      raf = requestAnimationFrame(animate);
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      const wasCoolingDown = cooldown > 0;
      cooldown -= dt;

      if (cooldown <= 0) {
        if (wasCoolingDown) {
          textIndex = (textIndex + 1) % texts.length;
          setText();
        }
        morph += dt;
        doMorph();
      } else {
        doCooldown();
      }
    };
    raf = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(raf);
  }, [texts, morphTime, cooldownTime]);

  return (
    <div className={cn("relative", className)}>
      {/* SVG threshold filter — fuses the two blurred spans into liquid goo */}
      <svg className="absolute h-0 w-0" aria-hidden>
        <defs>
          <filter id="gooey-threshold">
            <feColorMatrix
              in="SourceGraphic"
              type="matrix"
              values="1 0 0 0 0
                      0 1 0 0 0
                      0 0 1 0 0
                      0 0 0 255 -140"
            />
          </filter>
        </defs>
      </svg>

      <span
        className="absolute inset-0 flex items-center justify-center"
        style={{ filter: "url(#gooey-threshold)" }}
      >
        <span
          ref={text1Ref}
          className={cn(
            "absolute inline-block select-none text-center",
            textClassName,
          )}
        />
        <span
          ref={text2Ref}
          className={cn(
            "absolute inline-block select-none text-center",
            textClassName,
          )}
        />
      </span>
    </div>
  );
}
