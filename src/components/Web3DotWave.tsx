import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Web3DotWave
 * ───────────────────────────────────────────────────────────────
 * A full-screen uniform dot lattice rendered with Three.js. Every
 * dot is the same size; the grid is never broken up. A single small
 * gaussian "bump" drifts slowly across the surface, gently lifting
 * the dots beneath it — those dots read a bit darker, creating a
 * living, breathing focal point on an otherwise calm pattern.
 *
 * White background, NormalBlending, face-on view (no perspective).
 */

// ── Vertex shader ─────────────────────────────────────────────
const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uAmplitude;
  uniform float uPointSize;
  varying float vElevation;
  varying float vGentle;

  void main() {
    vec3 pos = position;

    // Global gentle ripple — slow, large-wavelength. Shown via
    // darkness/size modulation so the whole field breathes visibly.
    float g1 = sin(pos.x * 0.35 + uTime * 0.90);
    float g2 = sin(pos.y * 0.28 + uTime * 0.70);
    float g3 = sin((pos.x + pos.y) * 0.22 - uTime * 0.60);
    float gentle = (g1 * 0.5 + g2 * 0.4 + g3 * 0.35);   // -1.25..1.25 ish

    // One small gaussian bump that slowly roams across the plane.
    vec2 bumpCenter = vec2(
      sin(uTime * 0.45) * 6.0 - 2.0,
      cos(uTime * 0.38) * 4.0 + 0.5
    );
    float bd = length(pos.xy - bumpCenter);
    float bump = exp(-bd * bd / 10.0);                   // 0..1 peak

    // Z position (not strictly needed for the look, but keeps the
    // surface nominally 3D and influences depthWrite-free blending).
    pos.z += (gentle * 0.12 + bump * 0.7) * uAmplitude;

    vElevation = bump;         // 0..1 — drives visible bump
    vGentle    = gentle;       // -1.25..1.25 — drives breathing

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPos;

    // Dots enlarge under the bump and subtly with gentle crests.
    float sizeBoost = bump * 0.9 + smoothstep(-0.2, 1.0, gentle) * 0.2;
    gl_PointSize = uPointSize * (1.0 + sizeBoost);
  }
`;

// ── Fragment shader ────────────────────────────────────────────
const FRAG = /* glsl */ `
  varying float vElevation;   // 0..1, gaussian bump
  varying float vGentle;      // -1.25..1.25, global ripple

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    if (length(uv) > 0.5) discard;

    // Uniform baseline.
    float baseAlpha = 0.20;

    // Ripple: crests gently darken, troughs gently fade. This is the
    // motion you see across the whole field between bump visits.
    float rippleMod = smoothstep(-0.3, 1.0, vGentle) * 0.14
                    - smoothstep(0.0, -1.0, vGentle) * 0.10;

    // Bump: strong local darkening where the travelling bump is.
    float bumpBoost = smoothstep(0.05, 0.85, vElevation) * 0.55;

    float alpha = clamp(baseAlpha + rippleMod + bumpBoost, 0.0, 0.80);

    // Warm neutral gray instead of pure black → softer on white bg.
    gl_FragColor = vec4(vec3(0.28, 0.30, 0.34), alpha);
  }
`;

type Props = {
  className?: string;
};

const Web3DotWave: React.FC<Props> = ({ className }) => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ── Renderer ────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0); // transparent; parent controls bg
    Object.assign(renderer.domElement.style, {
      display: 'block',
      position: 'absolute',
      inset: '0',
    });
    mount.appendChild(renderer.domElement);

    // ── Scene / Camera ──────────────────────────────────────────
    // Face-on, no floor perspective.
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
    camera.position.set(0, 0, 14);
    camera.lookAt(0, 0, 0);

    // ── Geometry ────────────────────────────────────────────────
    // Dense, uniform grid. No vertex is ever discarded.
    const geo = new THREE.PlaneGeometry(30, 20, 200, 130);

    const uniforms = {
      uTime:      { value: 0 },
      uAmplitude: { value: prefersReduced ? 0 : 1.0 },
      uPointSize: { value: 1.6 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader:   VERT,
      fragmentShader: FRAG,
      transparent:    true,
      blending:       THREE.NormalBlending,
      depthWrite:     false,
      depthTest:      false,
    });

    const points = new THREE.Points(geo, mat);
    points.rotation.y = -0.10;   // ~6° — very subtle tilt
    points.rotation.x =  0.05;
    scene.add(points);

    // ── Resize ──────────────────────────────────────────────────
    const handleResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(mount);
    handleResize();

    // ── Animation loop ──────────────────────────────────────────
    const clock = new THREE.Clock();
    let rafId = 0;

    const tick = () => {
      uniforms.uTime.value = clock.getElapsedTime();
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(tick);
    };

    // Pause when off-screen
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting && !rafId) {
          rafId = requestAnimationFrame(tick);
        } else if (!e.isIntersecting && rafId) {
          cancelAnimationFrame(rafId);
          rafId = 0;
        }
      }
    }, { threshold: 0 });
    io.observe(mount);

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      } else if (!rafId) {
        rafId = requestAnimationFrame(tick);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.dispose();
      mat.dispose();
      geo.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={mountRef}
      aria-hidden
      className={className ?? 'absolute inset-0 pointer-events-none'}
      style={{ overflow: 'hidden' }}
    />
  );
};

export default Web3DotWave;
