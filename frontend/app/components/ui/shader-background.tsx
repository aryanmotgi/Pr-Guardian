"use client";

// Source: aliimam/shader-animation — https://21st.dev/community/components/aliimam/shader-animation/default
// Adapted: violet palette, transparent alpha channel, fixed full-screen position,
// slowed animation speed for ambient feel, proper cleanup.
import { useEffect, useRef } from "react";
import * as THREE from "three";

export function ShaderBackground({ opacity = 0.55 }: { opacity?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    // ── Vertex shader ──────────────────────────────────────────────
    const vertexShader = `
      void main() {
        gl_Position = vec4(position, 1.0);
      }
    `;

    // ── Fragment shader — violet ring pulses ───────────────────────
    // Original by aliimam. Palette shifted: green channel suppressed,
    // red/blue kept — produces violet/indigo interference rings.
    // Alpha varies with brightness so dark areas stay transparent.
    const fragmentShader = `
      precision highp float;
      uniform vec2  resolution;
      uniform float time;

      void main(void) {
        vec2  uv        = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);
        float t         = time * 0.018;   // slowed from original 0.05 → ambient feel
        float lineWidth = 0.003;

        vec3 raw = vec3(0.0);
        for (int j = 0; j < 3; j++) {
          for (int i = 0; i < 5; i++) {
            raw[j] += lineWidth * float(i * i) /
              abs(
                fract(t - 0.01 * float(j) + float(i) * 0.01) * 5.0
                - length(uv)
                + mod(uv.x + uv.y, 0.2)
              );
          }
        }

        // Violet tint: keep red + blue, suppress green
        vec3 color = vec3(raw[0] * 0.85, raw[1] * 0.08, raw[2] * 1.0);

        // Alpha: transparent in dark zones, visible at bright ring edges
        float alpha = clamp(length(color) * 2.2, 0.0, 1.0);

        gl_FragColor = vec4(color, alpha);
      }
    `;

    // ── Scene ──────────────────────────────────────────────────────
    const camera   = new THREE.Camera();
    camera.position.z = 1;

    const scene    = new THREE.Scene();
    const geometry = new THREE.PlaneGeometry(2, 2);
    const uniforms = {
      time:       { value: 1.0 },
      resolution: { value: new THREE.Vector2() },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,   // needed so alpha channel works
      depthWrite:  false,
    });

    scene.add(new THREE.Mesh(geometry, material));

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0); // transparent clear
    container.appendChild(renderer.domElement);

    // ── Resize ─────────────────────────────────────────────────────
    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      uniforms.resolution.value.set(renderer.domElement.width, renderer.domElement.height);
    };
    resize();
    window.addEventListener("resize", resize, false);

    // ── Animation loop ─────────────────────────────────────────────
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      uniforms.time.value += 0.04;
      renderer.render(scene, camera);
    };
    animate();

    // ── Cleanup ────────────────────────────────────────────────────
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: 0, opacity }}
    />
  );
}
