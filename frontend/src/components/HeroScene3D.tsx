import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';

const MINT = 0x4fd6a0;
const MINT_DIM = 0x2a8f6a;

/**
 * Signature WebGL hero — dense wire mesh, orbit rings, satellites, bars, particles.
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
    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
    camera.position.set(0.05, 0.12, 3.15);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    Object.assign(renderer.domElement.style, {
      width: '100%',
      height: '100%',
      display: 'block',
    });

    const origin = new THREE.Vector3(0.48, 0.08, 0);

    // Soft mint haze volumes
    const hazeGeo = new THREE.SphereGeometry(2.6, 28, 28);
    const hazeMat = new THREE.MeshBasicMaterial({
      color: MINT,
      transparent: true,
      opacity: 0.11,
      depthWrite: false,
    });
    const haze = new THREE.Mesh(hazeGeo, hazeMat);
    haze.position.copy(origin);
    scene.add(haze);

    const haze2 = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 20, 20),
      new THREE.MeshBasicMaterial({
        color: MINT,
        transparent: true,
        opacity: 0.07,
        depthWrite: false,
      }),
    );
    haze2.position.copy(origin).add(new THREE.Vector3(0.3, -0.2, -0.4));
    scene.add(haze2);

    // Core wire torus knot — the 3D signature
    const knotGeo = new THREE.TorusKnotGeometry(1.12, 0.32, 260, 32, 2, 3);
    const knotMat = new THREE.MeshBasicMaterial({
      color: MINT,
      wireframe: true,
      transparent: true,
      opacity: 0.95,
    });
    const knot = new THREE.Mesh(knotGeo, knotMat);
    knot.position.copy(origin);
    scene.add(knot);

    // Secondary smaller knot offset for depth stack
    const knotB = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.55, 0.14, 140, 18, 3, 2),
      new THREE.MeshBasicMaterial({
        color: MINT_DIM,
        wireframe: true,
        transparent: true,
        opacity: 0.55,
      }),
    );
    knotB.position.copy(origin).add(new THREE.Vector3(-0.85, 0.55, -0.35));
    scene.add(knotB);

    // Ghost cores
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.78, 1),
      new THREE.MeshBasicMaterial({
        color: MINT,
        transparent: true,
        opacity: 0.2,
        wireframe: true,
      }),
    );
    core.position.copy(origin);
    scene.add(core);

    const octa = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.42, 0),
      new THREE.MeshBasicMaterial({
        color: MINT,
        wireframe: true,
        transparent: true,
        opacity: 0.65,
      }),
    );
    octa.position.copy(origin).add(new THREE.Vector3(1.15, -0.45, 0.2));
    scene.add(octa);

    // Orbit rings
    const rings: THREE.Mesh[] = [];
    const ringSpecs = [
      { r: 1.65, tube: 0.016, rx: 1.15, ry: 0.15, speed: 0.32, opacity: 0.62 },
      { r: 2.05, tube: 0.012, rx: -0.75, ry: 0.95, speed: -0.24, opacity: 0.48 },
      { r: 2.4, tube: 0.01, rx: 0.45, ry: -1.15, speed: 0.18, opacity: 0.38 },
      { r: 2.75, tube: 0.007, rx: -1.0, ry: 0.55, speed: -0.12, opacity: 0.28 },
      { r: 3.05, tube: 0.005, rx: 0.2, ry: 1.4, speed: 0.09, opacity: 0.2 },
    ];
    for (const spec of ringSpecs) {
      const geo = new THREE.TorusGeometry(spec.r, spec.tube, 10, 120);
      const mat = new THREE.MeshBasicMaterial({
        color: MINT,
        transparent: true,
        opacity: spec.opacity,
      });
      const ring = new THREE.Mesh(geo, mat);
      ring.rotation.x = spec.rx;
      ring.rotation.y = spec.ry;
      ring.userData.speed = spec.speed;
      ring.position.copy(origin);
      scene.add(ring);
      rings.push(ring);
    }

    // Satellite octahedrons on orbit
    const sats: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.09 + (i % 3) * 0.03, 0),
        new THREE.MeshBasicMaterial({
          color: MINT,
          wireframe: true,
          transparent: true,
          opacity: 0.75,
        }),
      );
      s.userData = {
        ang: (i / 6) * Math.PI * 2,
        radius: 1.7 + (i % 3) * 0.35,
        speed: 0.35 + i * 0.05,
        bob: i * 0.7,
      };
      scene.add(s);
      sats.push(s);
    }

    // Floating equity-style bars (volumetric 3D)
    const bars: THREE.Mesh[] = [];
    for (let i = 0; i < 10; i++) {
      const h = 0.25 + Math.random() * 0.85;
      const geo = new THREE.BoxGeometry(0.1, h, 0.1);
      const mat = new THREE.MeshBasicMaterial({
        color: MINT,
        transparent: true,
        opacity: 0.22 + Math.random() * 0.2,
        wireframe: i % 2 === 0,
      });
      const bar = new THREE.Mesh(geo, mat);
      const edges = new THREE.EdgesGeometry(geo);
      bar.add(
        new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({ color: MINT, transparent: true, opacity: 0.75 }),
        ),
      );
      bar.userData = {
        baseX: -1.35 + i * 0.28,
        baseZ: -0.9 - (i % 3) * 0.15,
        h,
        phase: Math.random() * Math.PI * 2,
        speed: 0.8 + Math.random() * 0.6,
      };
      bar.position.set(bar.userData.baseX, h * 0.5 - 0.6, bar.userData.baseZ);
      scene.add(bar);
      bars.push(bar);
    }

    // Particle field
    const COUNT = 980;
    const positions = new Float32Array(COUNT * 3);
    const phases = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      const r = 0.9 + Math.random() * 3.2;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta) + origin.x;
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.72;
      positions[i * 3 + 2] = r * Math.cos(phi);
      phases[i] = Math.random() * Math.PI * 2;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const pMat = new THREE.PointsMaterial({
      color: MINT,
      size: 0.042,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(pGeo, pMat);
    scene.add(points);

    // Constellation lines between nearby particles (static sample)
    const linePos: number[] = [];
    const sampleN = 48;
    const samples: THREE.Vector3[] = [];
    for (let i = 0; i < sampleN; i++) {
      const idx = Math.floor((i / sampleN) * COUNT);
      samples.push(
        new THREE.Vector3(positions[idx * 3], positions[idx * 3 + 1], positions[idx * 3 + 2]),
      );
    }
    for (let i = 0; i < samples.length; i++) {
      for (let j = i + 1; j < samples.length; j++) {
        if (samples[i].distanceTo(samples[j]) < 1.15) {
          linePos.push(samples[i].x, samples[i].y, samples[i].z, samples[j].x, samples[j].y, samples[j].z);
        }
      }
    }
    const cGeo = new THREE.BufferGeometry();
    cGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
    const constellation = new THREE.LineSegments(
      cGeo,
      new THREE.LineBasicMaterial({ color: MINT, transparent: true, opacity: 0.18 }),
    );
    scene.add(constellation);

    // Floating mini planes (abstract data cards)
    const planes: THREE.Mesh[] = [];
    for (let i = 0; i < 9; i++) {
      const g = new THREE.PlaneGeometry(0.48 + Math.random() * 0.35, 0.28 + Math.random() * 0.16);
      const m = new THREE.MeshBasicMaterial({
        color: MINT,
        transparent: true,
        opacity: 0.14 + Math.random() * 0.1,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(g, m);
      const edges = new THREE.EdgesGeometry(g);
      mesh.add(
        new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({ color: MINT, transparent: true, opacity: 0.8 }),
        ),
      );
      const ang = (i / 9) * Math.PI * 2;
      mesh.position.set(
        Math.cos(ang) * 2.25 + origin.x,
        Math.sin(ang * 1.3) * 1.15,
        Math.sin(ang) * 1.35,
      );
      mesh.rotation.set(Math.random() * 0.7, Math.random() * 1.3, Math.random() * 0.5);
      mesh.userData = {
        ang,
        radius: 2.0 + (i % 4) * 0.28,
        speed: 0.16 + i * 0.025,
        bob: Math.random() * 4,
      };
      scene.add(mesh);
      planes.push(mesh);
    }

    // Vertical light beams
    const beams: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.01, 0.04, 2.8, 6, 1, true),
        new THREE.MeshBasicMaterial({
          color: MINT,
          transparent: true,
          opacity: 0.12,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      beam.position.set(-0.4 + i * 0.55, 0.2, -1.2);
      beam.userData = { phase: i * 1.2, baseOp: 0.1 + i * 0.02 };
      scene.add(beam);
      beams.push(beam);
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
      running = !document.hidden && running;
      if (!document.hidden) {
        running = true;
        raf = requestAnimationFrame(tick);
      }
    };

    let t0 = performance.now();
    const tick = (now: number) => {
      if (disposed || !running) return;
      const t = (now - t0) * 0.001;
      pointer.x += (pointer.tx - pointer.x) * 0.07;
      pointer.y += (pointer.ty - pointer.y) * 0.07;

      knot.rotation.x = t * 0.38 + pointer.y * 0.4;
      knot.rotation.y = t * 0.58 + pointer.x * 0.5;
      knotB.rotation.x = -t * 0.55;
      knotB.rotation.z = t * 0.4;
      core.rotation.x = -t * 0.45;
      core.rotation.y = t * 0.75;
      octa.rotation.x = t * 0.9;
      octa.rotation.y = t * 1.1;
      octa.position.y = origin.y - 0.45 + Math.sin(t * 1.4) * 0.12;
      haze.scale.setScalar(1 + Math.sin(t * 0.8) * 0.05);
      haze2.scale.setScalar(1 + Math.cos(t * 0.6) * 0.08);

      for (const ring of rings) {
        ring.rotation.z += ring.userData.speed * 0.012;
        ring.rotation.x += 0.0018;
      }

      for (const s of sats) {
        const { ang, radius, speed, bob } = s.userData as {
          ang: number;
          radius: number;
          speed: number;
          bob: number;
        };
        const a = ang + t * speed;
        s.position.set(
          Math.cos(a) * radius + origin.x,
          Math.sin(t * 1.5 + bob) * 0.35 + origin.y,
          Math.sin(a) * radius * 0.75,
        );
        s.rotation.x = t + bob;
        s.rotation.y = a;
      }

      for (const bar of bars) {
        const { baseX, baseZ, h, phase, speed } = bar.userData as {
          baseX: number;
          baseZ: number;
          h: number;
          phase: number;
          speed: number;
        };
        const pulse = 0.65 + Math.sin(t * speed + phase) * 0.35;
        bar.scale.y = pulse;
        bar.position.set(baseX, (h * pulse) * 0.5 - 0.55, baseZ);
        bar.rotation.y = Math.sin(t * 0.3 + phase) * 0.08;
      }

      const pos = pGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < COUNT; i++) {
        const iy = i * 3 + 1;
        pos.array[iy] += Math.sin(t * 1.5 + phases[i]) * 0.0014;
      }
      pos.needsUpdate = true;
      points.rotation.y = t * 0.1 + pointer.x * 0.12;
      constellation.rotation.y = points.rotation.y * 0.6;

      for (const plane of planes) {
        const { ang, radius, speed, bob } = plane.userData as {
          ang: number;
          radius: number;
          speed: number;
          bob: number;
        };
        const a = ang + t * speed;
        plane.position.x = Math.cos(a) * radius + origin.x * 0.7;
        plane.position.z = Math.sin(a) * radius * 0.88;
        plane.position.y = Math.sin(t * 1.25 + bob) * 0.4 + Math.cos(a) * 0.18;
        plane.rotation.y = a + 0.55;
        plane.rotation.x = 0.4 + Math.sin(t + bob) * 0.18;
      }

      for (const beam of beams) {
        const { phase, baseOp } = beam.userData as { phase: number; baseOp: number };
        const mat = beam.material as THREE.MeshBasicMaterial;
        mat.opacity = baseOp + Math.sin(t * 2 + phase) * 0.06;
        beam.scale.y = 0.85 + Math.sin(t * 1.2 + phase) * 0.15;
      }

      camera.position.x = 0.08 + pointer.x * 0.42;
      camera.position.y = 0.15 + pointer.y * 0.25;
      camera.position.z = 3.15 + pointer.y * 0.15;
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
