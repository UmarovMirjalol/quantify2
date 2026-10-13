import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';

const MINT = 0x4fd6a0;

/**
 * Signature WebGL hero moment — wire torus + rings + particle cloud.
 * Lazy, DPR-capped, paused off-screen / when tab hidden / reduced-motion.
 */
export function HeroScene3D() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || reduced) return;
    if (!window.WebGLRenderingContext) return;

    let disposed = false;
    let raf = 0;
    let running = true;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0.15, 0.2, 4.6);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    Object.assign(renderer.domElement.style, {
      width: '100%',
      height: '100%',
      display: 'block',
    });

    // Soft mint haze
    const hazeGeo = new THREE.SphereGeometry(2.4, 32, 32);
    const hazeMat = new THREE.MeshBasicMaterial({
      color: MINT,
      transparent: true,
      opacity: 0.045,
      depthWrite: false,
    });
    const haze = new THREE.Mesh(hazeGeo, hazeMat);
    scene.add(haze);

    // Core wire torus knot — the 3D signature
    const knotGeo = new THREE.TorusKnotGeometry(0.85, 0.22, 180, 24, 2, 3);
    const knotMat = new THREE.MeshBasicMaterial({
      color: MINT,
      wireframe: true,
      transparent: true,
      opacity: 0.55,
    });
    const knot = new THREE.Mesh(knotGeo, knotMat);
    knot.position.set(0.35, 0.05, 0);
    scene.add(knot);

    // Solid ghost core for volume
    const coreGeo = new THREE.IcosahedronGeometry(0.55, 1);
    const coreMat = new THREE.MeshBasicMaterial({
      color: MINT,
      transparent: true,
      opacity: 0.08,
      wireframe: true,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.copy(knot.position);
    scene.add(core);

    // Orbit rings
    const rings: THREE.Mesh[] = [];
    const ringSpecs = [
      { r: 1.55, tube: 0.008, rx: 1.1, ry: 0.2, speed: 0.22, opacity: 0.35 },
      { r: 1.85, tube: 0.006, rx: -0.7, ry: 0.9, speed: -0.16, opacity: 0.28 },
      { r: 2.15, tube: 0.005, rx: 0.4, ry: -1.2, speed: 0.12, opacity: 0.2 },
    ];
    for (const spec of ringSpecs) {
      const geo = new THREE.TorusGeometry(spec.r, spec.tube, 12, 100);
      const mat = new THREE.MeshBasicMaterial({
        color: MINT,
        transparent: true,
        opacity: spec.opacity,
      });
      const ring = new THREE.Mesh(geo, mat);
      ring.rotation.x = spec.rx;
      ring.rotation.y = spec.ry;
      ring.userData.speed = spec.speed;
      ring.position.copy(knot.position);
      scene.add(ring);
      rings.push(ring);
    }

    // Particle field
    const COUNT = 420;
    const positions = new Float32Array(COUNT * 3);
    const phases = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      const r = 1.2 + Math.random() * 2.4;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta) + 0.35;
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.7;
      positions[i * 3 + 2] = r * Math.cos(phi);
      phases[i] = Math.random() * Math.PI * 2;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const pMat = new THREE.PointsMaterial({
      color: MINT,
      size: 0.028,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(pGeo, pMat);
    scene.add(points);

    // Floating mini planes (abstract "data cards" — geometric only)
    const planes: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i++) {
      const g = new THREE.PlaneGeometry(0.35 + Math.random() * 0.25, 0.22 + Math.random() * 0.12);
      const m = new THREE.MeshBasicMaterial({
        color: MINT,
        transparent: true,
        opacity: 0.08 + Math.random() * 0.06,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(g, m);
      // wireframe edge helper via edges
      const edges = new THREE.EdgesGeometry(g);
      const line = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: MINT, transparent: true, opacity: 0.45 }),
      );
      mesh.add(line);
      const ang = (i / 5) * Math.PI * 2;
      mesh.position.set(
        Math.cos(ang) * 1.9 + 0.35,
        Math.sin(ang * 1.3) * 0.9,
        Math.sin(ang) * 1.1,
      );
      mesh.rotation.set(Math.random() * 0.6, Math.random() * 1.2, Math.random() * 0.4);
      mesh.userData = { ang, radius: 1.7 + (i % 3) * 0.2, speed: 0.15 + i * 0.03, bob: Math.random() * 4 };
      scene.add(mesh);
      planes.push(mesh);
    }

    const resize = () => {
      if (disposed) return;
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };

    const onPointer = (e: PointerEvent) => {
      const rect = mount.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      pointer.tx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.ty = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        running = Boolean(entry?.isIntersecting) && !document.hidden;
        if (running) raf = requestAnimationFrame(tick);
      },
      { threshold: 0.05 },
    );
    io.observe(mount);

    const onVis = () => {
      running = !document.hidden;
      if (running) raf = requestAnimationFrame(tick);
    };

    let t0 = performance.now();
    const tick = (now: number) => {
      if (disposed || !running) return;
      const t = (now - t0) * 0.001;
      pointer.x += (pointer.tx - pointer.x) * 0.06;
      pointer.y += (pointer.ty - pointer.y) * 0.06;

      knot.rotation.x = t * 0.35 + pointer.y * 0.35;
      knot.rotation.y = t * 0.55 + pointer.x * 0.45;
      core.rotation.x = -t * 0.4;
      core.rotation.y = t * 0.7;
      haze.scale.setScalar(1 + Math.sin(t * 0.8) * 0.04);

      for (const ring of rings) {
        ring.rotation.z += ring.userData.speed * 0.01;
        ring.rotation.x += 0.0015;
      }

      const pos = pGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < COUNT; i++) {
        const iy = i * 3 + 1;
        pos.array[iy] += Math.sin(t * 1.4 + phases[i]) * 0.0012;
      }
      pos.needsUpdate = true;
      points.rotation.y = t * 0.08 + pointer.x * 0.1;

      for (const plane of planes) {
        const { ang, radius, speed, bob } = plane.userData as {
          ang: number;
          radius: number;
          speed: number;
          bob: number;
        };
        const a = ang + t * speed;
        plane.position.x = Math.cos(a) * radius + 0.35;
        plane.position.z = Math.sin(a) * radius * 0.85;
        plane.position.y = Math.sin(t * 1.2 + bob) * 0.35 + Math.cos(a) * 0.15;
        plane.rotation.y = a + 0.5;
        plane.rotation.x = 0.35 + Math.sin(t + bob) * 0.15;
      }

      camera.position.x = 0.15 + pointer.x * 0.35;
      camera.position.y = 0.2 + pointer.y * 0.2;
      camera.lookAt(0.35, 0, 0);

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };

    resize();
    window.addEventListener('resize', resize);
    // mount has pointer-events:none — listen on window, project into mount rect
    window.addEventListener('pointermove', onPointer, { passive: true });
    document.addEventListener('visibilitychange', onVis);
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      running = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', onVis);
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.LineSegments) {
          obj.geometry?.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat?.dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [reduced]);

  if (reduced) return null;
  return <div className="hero-scene-3d" ref={mountRef} aria-hidden="true" />;
}
