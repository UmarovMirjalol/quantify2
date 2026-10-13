import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';

const MINT = 0x4fd6a0;

/**
 * Restrained WebGL backdrop for the hero product stage.
 * Paused off-screen / when tab hidden / reduced-motion.
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
    camera.position.set(0.1, 0.12, 3.8);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    Object.assign(renderer.domElement.style, {
      width: '100%',
      height: '100%',
      display: 'block',
    });

    const origin = new THREE.Vector3(0.4, 0.05, 0);

    const haze = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 24, 24),
      new THREE.MeshBasicMaterial({
        color: MINT,
        transparent: true,
        opacity: 0.06,
        depthWrite: false,
      }),
    );
    haze.position.copy(origin);
    scene.add(haze);

    const knot = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.95, 0.24, 180, 24, 2, 3),
      new THREE.MeshBasicMaterial({
        color: MINT,
        wireframe: true,
        transparent: true,
        opacity: 0.62,
      }),
    );
    knot.position.copy(origin);
    scene.add(knot);

    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.58, 1),
      new THREE.MeshBasicMaterial({
        color: MINT,
        transparent: true,
        opacity: 0.12,
        wireframe: true,
      }),
    );
    core.position.copy(origin);
    scene.add(core);

    const rings: THREE.Mesh[] = [];
    const ringSpecs = [
      { r: 1.6, tube: 0.01, rx: 1.1, ry: 0.2, speed: 0.22, opacity: 0.38 },
      { r: 2.0, tube: 0.007, rx: -0.7, ry: 0.9, speed: -0.16, opacity: 0.28 },
      { r: 2.35, tube: 0.005, rx: 0.4, ry: -1.1, speed: 0.12, opacity: 0.2 },
    ];
    for (const spec of ringSpecs) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(spec.r, spec.tube, 10, 96),
        new THREE.MeshBasicMaterial({
          color: MINT,
          transparent: true,
          opacity: spec.opacity,
        }),
      );
      ring.rotation.x = spec.rx;
      ring.rotation.y = spec.ry;
      ring.userData.speed = spec.speed;
      ring.position.copy(origin);
      scene.add(ring);
      rings.push(ring);
    }

    const COUNT = 420;
    const positions = new Float32Array(COUNT * 3);
    const phases = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      const r = 1.1 + Math.random() * 2.4;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta) + origin.x;
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.7;
      positions[i * 3 + 2] = r * Math.cos(phi);
      phases[i] = Math.random() * Math.PI * 2;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(
      pGeo,
      new THREE.PointsMaterial({
        color: MINT,
        size: 0.03,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    scene.add(points);

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
      if (!document.hidden) {
        running = true;
        raf = requestAnimationFrame(tick);
      } else {
        running = false;
      }
    };

    let t0 = performance.now();
    const tick = (now: number) => {
      if (disposed || !running) return;
      const t = (now - t0) * 0.001;
      pointer.x += (pointer.tx - pointer.x) * 0.06;
      pointer.y += (pointer.ty - pointer.y) * 0.06;

      knot.rotation.x = t * 0.28 + pointer.y * 0.25;
      knot.rotation.y = t * 0.42 + pointer.x * 0.3;
      core.rotation.x = -t * 0.35;
      core.rotation.y = t * 0.55;
      haze.scale.setScalar(1 + Math.sin(t * 0.7) * 0.03);

      for (const ring of rings) {
        ring.rotation.z += ring.userData.speed * 0.01;
        ring.rotation.x += 0.0012;
      }

      const pos = pGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < COUNT; i++) {
        pos.array[i * 3 + 1] += Math.sin(t * 1.2 + phases[i]) * 0.001;
      }
      pos.needsUpdate = true;
      points.rotation.y = t * 0.06 + pointer.x * 0.08;

      camera.position.x = 0.1 + pointer.x * 0.25;
      camera.position.y = 0.12 + pointer.y * 0.15;
      camera.lookAt(origin.x, origin.y, 0);

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };

    resize();
    window.addEventListener('resize', resize);
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
        if (
          obj instanceof THREE.Mesh ||
          obj instanceof THREE.Points ||
          obj instanceof THREE.LineSegments
        ) {
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
