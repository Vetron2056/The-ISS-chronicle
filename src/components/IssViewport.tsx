import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CameraPresetId, ISS_MODULES } from '../data/issTimeline';
import { createEarthSystem } from '../three/earthBuilder';
import { createISSSystem } from '../three/issBuilder';
import { createReentrySystem } from '../three/reentryEffects';

interface IssViewportProps {
  year: number;
  cameraPreset: CameraPresetId;
  selectedModuleId: string | null;
  focusTrigger: number;
  onSelectModule: (moduleId: string | null) => void;
  onHoverModule: (moduleId: string | null) => void;
}

const PRESET_VIEWS: Record<CameraPresetId, { pos: [number, number, number]; target: [number, number, number] }> = {
  orbital: { pos: [26, 12, 24], target: [0, -1.5, 0] },
  truss: { pos: [2, 34, 10], target: [0, 0, 0] },
  cupola: { pos: [-9.5, -5.2, -5.5], target: [-2.4, -1.0, -1.6] },
  deorbit: { pos: [22, 6, 26], target: [0, -2.0, 2.0] },
};

function smoothStep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function IssViewport({
  year,
  cameraPreset,
  selectedModuleId,
  focusTrigger,
  onSelectModule,
  onHoverModule,
}: IssViewportProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [contextLost, setContextLost] = useState(false);

  // Refs synced from React props so WebGL never tears down on UI updates
  const yearRef = useRef(year);
  yearRef.current = year;

  const selectedModuleRef = useRef(selectedModuleId);
  selectedModuleRef.current = selectedModuleId;

  const onSelectRef = useRef(onSelectModule);
  onSelectRef.current = onSelectModule;

  const onHoverRef = useRef(onHoverModule);
  onHoverRef.current = onHoverModule;

  // Camera transition targets
  const camTransitionRef = useRef<{
    active: boolean;
    targetPos: THREE.Vector3;
    targetLook: THREE.Vector3;
  }>({
    active: false,
    targetPos: new THREE.Vector3(...PRESET_VIEWS.orbital.pos),
    targetLook: new THREE.Vector3(...PRESET_VIEWS.orbital.target),
  });

  // Trigger camera glide when preset changes
  useEffect(() => {
    const view = PRESET_VIEWS[cameraPreset];
    camTransitionRef.current.targetPos.set(...view.pos);
    camTransitionRef.current.targetLook.set(...view.target);
    camTransitionRef.current.active = true;
  }, [cameraPreset]);

  // Trigger camera glide toward selected module when focusTrigger increments
  useEffect(() => {
    if (!selectedModuleId || focusTrigger === 0) return;
    const mod = ISS_MODULES[selectedModuleId];
    if (!mod) return;
    const [mx, my, mz] = mod.focusOffset;
    camTransitionRef.current.targetLook.set(mx, my, mz);
    camTransitionRef.current.targetPos.set(mx + 8.5, my + 4.5, mz + 9.5);
    camTransitionRef.current.active = true;
  }, [selectedModuleId, focusTrigger]);

  // Sync selected module highlight to 3D scene
  const issSystemRef = useRef<ReturnType<typeof createISSSystem> | null>(null);
  useEffect(() => {
    issSystemRef.current?.setSelectedModule(selectedModuleId);
  }, [selectedModuleId]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Software WebGL Guard
    const isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    // 2. Renderer & Scene
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const handleContextRestored = () => {
      setContextLost(false);
    };
    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#060911');
    scene.fog = new THREE.FogExp2('#060911', 0.00075);

    const camera = new THREE.PerspectiveCamera(
      44,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.2,
      1200
    );
    camera.position.set(...PRESET_VIEWS.orbital.pos);

    // 3. Mandatory Studio Environment Map for metallic Kapton foil & anodized aluminum
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    // 4. Orbital 3-Point Lighting Rig
    const sunDir = new THREE.Vector3(65, 42, 48).normalize();
    const sunLight = new THREE.DirectionalLight(0xfff5e4, 2.75);
    sunLight.position.copy(sunDir).multiplyScalar(120);
    sunLight.castShadow = !isSoftwareGl;
    sunLight.shadow.mapSize.set(1024, 1024);
    sunLight.shadow.camera.near = 20;
    sunLight.shadow.camera.far = 220;
    const d = 32;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.02;
    scene.add(sunLight);

    // Earth-albedo blue fill from below + deep space zenith
    const hemiLight = new THREE.HemisphereLight(0x1e293b, 0x38bdf8, 0.72);
    scene.add(hemiLight);

    // Subtle cool rim backlight to separate truss silhouette against deep space
    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.55);
    rimLight.position.set(-45, 25, -55);
    scene.add(rimLight);

    // 5. Build 3D Subsystems
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    const earthSystem = createEarthSystem(maxAnisotropy);
    scene.add(earthSystem.starfield);
    scene.add(earthSystem.group);

    const issSystem = createISSSystem(maxAnisotropy, isSoftwareGl);
    issSystemRef.current = issSystem;
    scene.add(issSystem.root);

    const reentrySystem = createReentrySystem();
    issSystem.stationGroup.add(reentrySystem.group);

    // 6. OrbitControls
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 4.5;
    controls.maxDistance = 85;
    controls.enablePan = true;
    controls.target.set(...PRESET_VIEWS.orbital.target);

    const cancelTransition = () => {
      camTransitionRef.current.active = false;
    };
    controls.addEventListener('start', cancelTransition);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // 7. Raycasting for Hover & Click Inspection
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    const pointerNdc = new THREE.Vector2();
    let lastHoverCheck = 0;
    let pointerDownPos = { x: 0, y: 0 };

    const updateNdc = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    };

    const pickModule = (): string | null => {
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(issSystem.clickableObjects, false);
      for (const hit of hits) {
        let obj: THREE.Object3D | null = hit.object;
        let visible = true;
        while (obj) {
          if (!obj.visible) {
            visible = false;
            break;
          }
          obj = obj.parent;
        }
        if (visible && hit.object.userData.moduleId) {
          return hit.object.userData.moduleId as string;
        }
      }
      return null;
    };

    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverCheck < 36) return;
      lastHoverCheck = now;
      updateNdc(e.clientX, e.clientY);
      const hitId = pickModule();
      issSystem.setHoveredModule(hitId);
      canvas.style.cursor = hitId ? 'pointer' : 'grab';
      onHoverRef.current(hitId);
    };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      const dx = e.clientX - pointerDownPos.x;
      const dy = e.clientY - pointerDownPos.y;
      if (Math.hypot(dx, dy) > 6) return; // Dragged camera, not a click
      updateNdc(e.clientX, e.clientY);
      const hitId = pickModule();
      onSelectRef.current(hitId);
    };

    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);

    // 8. Resize Handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // 9. Animation Loop with Software-WebGL Pacing
    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (disposed) return;
      const rawDelta = clock.getDelta();
      const delta = Math.min(rawDelta, 0.1);
      const elapsed = clock.getElapsedTime();
      const currentYear = yearRef.current;

      // Update Earth & ISS
      earthSystem.update(delta, currentYear);
      issSystem.update(currentYear, elapsed, delta, sunDir);

      // Update 2031 Re-entry plasma & debris wake
      const reentryIntensity =
        currentYear >= 2031.14 && currentYear < 2031.42
          ? smoothStep(2031.14, 2031.24, currentYear) * (1 - smoothStep(2031.38, 2031.43, currentYear))
          : 0;
      const breakupProgress = currentYear >= 2031.26 ? smoothStep(2031.26, 2031.4, currentYear) : 0;
      reentrySystem.update(delta, reentryIntensity, breakupProgress);

      // Follow ISS descent during 2031 atmospheric re-entry
      if (currentYear >= 2031.1 && currentYear < 2031.44 && !camTransitionRef.current.active) {
        const stationY = issSystem.stationGroup.position.y;
        controls.target.y = THREE.MathUtils.damp(controls.target.y, stationY, 3.2, delta);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, stationY + 7.5, 2.2, delta);
      }

      // Smooth damped camera preset / module focus transitions
      if (camTransitionRef.current.active) {
        const { targetPos, targetLook } = camTransitionRef.current;
        camera.position.x = THREE.MathUtils.damp(camera.position.x, targetPos.x, 4.5, delta);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, targetPos.y, 4.5, delta);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, targetPos.z, 4.5, delta);

        controls.target.x = THREE.MathUtils.damp(controls.target.x, targetLook.x, 4.5, delta);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, targetLook.y, 4.5, delta);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, targetLook.z, 4.5, delta);

        if (
          camera.position.distanceToSquared(targetPos) < 0.02 &&
          controls.target.distanceToSquared(targetLook) < 0.02
        ) {
          camTransitionRef.current.active = false;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      controls.removeEventListener('start', cancelTransition);
      controls.dispose();
      earthSystem.dispose();
      issSystem.dispose();
      reentrySystem.dispose();
      envTex.dispose();
      renderer.dispose();
      if (canvas.parentNode === container) {
        container.removeChild(canvas);
      }
      issSystemRef.current = null;
    };
  }, []);

  if (contextLost) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#060911] text-slate-300">
        <div className="text-center space-y-2 px-6">
          <p className="text-base font-semibold text-white">3D Viewport Context Suspended</p>
          <p className="text-sm text-slate-400">
            WebGL rendering was interrupted. Reload the page to restore the orbital visualization.
          </p>
        </div>
      </div>
    );
  }

  return <div ref={mountRef} className="w-full h-full relative" />;
}
