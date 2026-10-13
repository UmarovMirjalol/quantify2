import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';

const MINT = 0x4fd6a0;

/**
 * Secondary WebGL ribbon for mid-page sections — orbiting wire forms + particle drift.
 */
export function SectionScene3D({ className = '' }: { className?: string }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || reduced) return;
    if (!window.WebGLRenderingContext) return;

    let disposed = false;
    let raf = 0;
    let running = true;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
    camera.position.set(0, 0.1, 4.2);

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

    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(1.35, 0.08, 16, 100),
      new THREE.MeshBasicMaterial({
        color: MINT,
        wireframe: true,
        transparent: true,
        opacity: 0.45,
      }),
    );
    torus.rotation.x = 1.1;
    scene.add(torus);

    const torusB = new THREE.Mesh(
      new THREE.TorusGeometry(1.75, 0.04, 12, 80),
      new THREE.MeshBasicMaterial({
        color: MINT,
        wireframe: true,
        transparent: true,
        opacity: 0.28,
      }),
    );
    torusB.rotation.x = 0.6;
    torusB.rotation.y = 0.8;
    scene.add(torusB);

    const ico = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.55, 1),
      new THREE.MeshBasicMaterial({
        color: MINT,
        wireframe: true,
        transparent: true,
        opacity: 0.55,
      }),
    );
    scene.add(ico);

    const COUNT = 220;
    const positions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.2 + Math.random() * 2.2;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 1.6;
      positions[i * 3 + 2] = Math.sin(a) * r;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(
      pGeo,
      new THREE.PointsMaterial({
        color: MINT,
        size: 0.035,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    scene.add(points);

    const cubes: THREE.Mesh[] = [];
    for (let i = 0; i < 8; i++) {
      const c = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.18, 0.18),
        new THREE.MeshBasicMaterial({
          color: MINT,
          wireframe: true,
          transparent: true,
          opacity: 0.4,
        }),
      );
      c.userData = { ang: (i / 8) * Math.PI * 2, r: 2.1, speed: 0.2 + i * 0.03 };
      scene.add(c);
      cubes.push(c);
    }

    const resize = () => {
      if (disposed) return;
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        running = Boolean(entry?.isIntersecting) && !document.hidden;
        if (running) raf = requestAnimationFrame(tick);
      },
      { threshold: 0.08 },
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
      torus.rotation.z = t * 0.35;
      torus.rotation.y = t * 0.12;
      torusB.rotation.z = -t * 0.22;
      ico.rotation.x = t * 0.5;
      ico.rotation.y = t * 0.7;
      points.rotation.y = t * 0.08;
      for (const c of cubes) {
        const { ang, r, speed } = c.userData as { ang: number; r: number; speed: number };
        const a = ang + t * speed;
        c.position.set(Math.cos(a) * r, Math.sin(t * 1.2 + ang) * 0.35, Math.sin(a) * r * 0.7);
        c.rotation.x = t + ang;
        c.rotation.y = a;
      }
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };

    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVis);
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      running = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener('resize', resize);
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
  return <div className={`section-scene-3d ${className}`.trim()} ref={mountRef} aria-hidden="true" />;
}
