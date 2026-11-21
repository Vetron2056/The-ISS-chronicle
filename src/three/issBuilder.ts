import * as THREE from 'three';

export interface ISSModuleNode {
  id: string;
  group: THREE.Group;
  hitMeshes: THREE.Mesh[];
  materials: THREE.MeshStandardMaterial[];
}

export interface ISSSystem {
  root: THREE.Group;
  stationGroup: THREE.Group;
  orbitPathLine: THREE.Line;
  clickableObjects: THREE.Object3D[];
  moduleNodes: Map<string, ISSModuleNode>;
  update: (year: number, elapsed: number, delta: number, sunDir: THREE.Vector3) => void;
  setHoveredModule: (moduleId: string | null) => void;
  setSelectedModule: (moduleId: string | null) => void;
  getModuleWorldPosition: (moduleId: string, out: THREE.Vector3) => boolean;
  dispose: () => void;
}

function smoothStep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function createSolarArrayTexture(maxAnisotropy: number, copperGold: boolean): THREE.CanvasTexture {
  const w = 512;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = copperGold ? '#5c3312' : '#162844';
  ctx.fillRect(0, 0, w, h);

  const cols = 8;
  const rows = 24;
  const cellW = w / cols;
  const cellH = h / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const shade = ((r * 7 + c * 13) % 5) * 4;
      if (copperGold) {
        ctx.fillStyle = `rgb(${152 + shade}, ${96 + shade}, ${38 + Math.floor(shade * 0.5)})`;
      } else {
        ctx.fillStyle = `rgb(${26 + shade}, ${54 + shade}, ${106 + shade * 2})`;
      }
      ctx.fillRect(c * cellW + 2, r * cellH + 2, cellW - 4, cellH - 4);

      // Subtle busbar trace
      ctx.fillStyle = copperGold ? 'rgba(255, 224, 165, 0.25)' : 'rgba(186, 220, 255, 0.28)';
      ctx.fillRect(c * cellW + cellW * 0.48, r * cellH + 2, 1.5, cellH - 4);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createMLIBlanketTexture(maxAnisotropy: number, baseHex: string, ribHex: string): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);

  // Subtle foil seams & thermal panel tiling
  ctx.strokeStyle = ribHex;
  ctx.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    const p = (i / 8) * size;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  // Fine foil micro-wrinkle noise
  for (let i = 0; i < 1600; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect(x, y, 3, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createAgingCrackTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  // Thermal scorch / micrometeoroid pitting & hairline stress cracks
  for (let i = 0; i < 45; i++) {
    const sx = Math.random() * size;
    const sy = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    let cx = sx;
    let cy = sy;
    const steps = 4 + Math.floor(Math.random() * 6);
    for (let s = 0; s < steps; s++) {
      cx += (Math.random() - 0.5) * 34;
      cy += (Math.random() - 0.5) * 34;
      ctx.lineTo(cx, cy);
    }
    ctx.strokeStyle = 'rgba(28, 22, 18, 0.85)';
    ctx.lineWidth = 1.1 + Math.random() * 1.4;
    ctx.stroke();

    // Faint amber oxidation rim around stress fracture
    ctx.strokeStyle = 'rgba(217, 119, 6, 0.38)';
    ctx.lineWidth = 2.6;
    ctx.stroke();
  }

  // Subtle thermal discoloration patches
  for (let i = 0; i < 18; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 14 + Math.random() * 28;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(65, 48, 34, 0.36)');
    grad.addColorStop(1, 'rgba(65, 48, 34, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createISSSystem(maxAnisotropy: number, isSoftwareGl: boolean): ISSSystem {
  const root = new THREE.Group();
  const stationGroup = new THREE.Group();
  root.add(stationGroup);

  const disposables: Array<{ dispose: () => void }> = [];
  const moduleNodes = new Map<string, ISSModuleNode>();
  const clickableObjects: THREE.Object3D[] = [];

  // Load photorealistic ISS hardware textures (with seamless tiling & bump derivation)
  const texLoader = new THREE.TextureLoader();

  const deriveBumpFromImage = (img: HTMLImageElement, repeatX: number, repeatY: number): THREE.CanvasTexture => {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, size, size);
    const id = ctx.getImageData(0, 0, size, size);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = Math.floor(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
      d[i] = lum;
      d[i + 1] = lum;
      d[i + 2] = lum;
    }
    ctx.putImageData(id, 0, 0);
    const bump = new THREE.CanvasTexture(c);
    bump.anisotropy = maxAnisotropy;
    bump.wrapS = THREE.RepeatWrapping;
    bump.wrapT = THREE.RepeatWrapping;
    bump.repeat.set(repeatX, repeatY);
    disposables.push(bump);
    return bump;
  };

  // Fallback procedural textures active immediately before async decode completes
  const solarGoldFallback = createSolarArrayTexture(maxAnisotropy, true);
  const solarBlueTex = createSolarArrayTexture(maxAnisotropy, false);
  const whiteMliFallback = createMLIBlanketTexture(maxAnisotropy, '#e4e8ee', '#b7c0cc');
  const crackTex = createAgingCrackTexture(maxAnisotropy);
  disposables.push(solarGoldFallback, solarBlueTex, whiteMliFallback, crackTex);

  const hullPhotoTex = texLoader.load(
    '/src/assets/images/iss_hull_phototex_1795252551840.jpg',
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAnisotropy;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(2, 2);
      tex.needsUpdate = true;

      const img = tex.image as HTMLImageElement | undefined;
      if (img) {
        const hullBump = deriveBumpFromImage(img, 2, 2);
        brushedAlumMat.map = tex;
        brushedAlumMat.bumpMap = hullBump;
        brushedAlumMat.bumpScale = 0.04;
        brushedAlumMat.needsUpdate = true;

        russianCreamMat.map = tex;
        russianCreamMat.bumpMap = hullBump;
        russianCreamMat.bumpScale = 0.045;
        russianCreamMat.needsUpdate = true;
      }
    }
  );
  disposables.push(hullPhotoTex);

  const solarPhotoTex = texLoader.load(
    '/src/assets/images/iss_solar_phototex_1795252551889.jpg',
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAnisotropy;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(1, 5);
      tex.needsUpdate = true;

      const img = tex.image as HTMLImageElement | undefined;
      if (img) {
        const solarBump = deriveBumpFromImage(img, 1, 5);
        solarGoldMat.map = tex;
        solarGoldMat.bumpMap = solarBump;
        solarGoldMat.bumpScale = 0.025;
        solarGoldMat.needsUpdate = true;
      }
    }
  );
  disposables.push(solarPhotoTex);

  // Calibrated PBR Material Palette (distinct roughness & metalness variation)
  const makeMat = (opts: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial(opts);
    disposables.push(m);
    return m;
  };

  const brushedAlumMat = makeMat({
    color: 0xf1f5f9,
    map: whiteMliFallback,
    roughness: 0.36,
    metalness: 0.65,
  });
  const russianCreamMat = makeMat({
    color: 0xeee5d5,
    map: whiteMliFallback,
    roughness: 0.52,
    metalness: 0.34,
  });
  const goldFoilMat = makeMat({
    color: 0xd99b26,
    roughness: 0.24,
    metalness: 0.92,
  });
  const darkMetalMat = makeMat({
    color: 0x334155,
    roughness: 0.45,
    metalness: 0.82,
  });
  const trussMetalMat = makeMat({
    color: 0x94a3b8,
    roughness: 0.42,
    metalness: 0.78,
  });
  const radiatorMat = makeMat({
    color: 0xf4f7fb,
    roughness: 0.62,
    metalness: 0.14,
  });
  const esaStripeMat = makeMat({
    color: 0x2563eb,
    roughness: 0.38,
    metalness: 0.45,
  });
  const solarGoldMat = makeMat({
    map: solarGoldFallback,
    roughness: 0.22,
    metalness: 0.68,
    side: THREE.DoubleSide,
  });
  const solarBlueMat = makeMat({
    map: solarBlueTex,
    roughness: 0.24,
    metalness: 0.65,
    side: THREE.DoubleSide,
  });
  const cupolaGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0f172a,
    roughness: 0.08,
    metalness: 0.15,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    transparent: true,
    opacity: isSoftwareGl ? 0.55 : 0.72,
  });
  disposables.push(cupolaGlassMat);

  const portholeEmissiveMat = makeMat({
    color: 0x1e293b,
    emissive: new THREE.Color('#fbbf24'),
    emissiveIntensity: 0.0,
    roughness: 0.2,
    metalness: 0.1,
  });

  const beaconMat = makeMat({
    color: 0x22c55e,
    emissive: new THREE.Color('#22c55e'),
    emissiveIntensity: 0.0,
    roughness: 0.2,
    metalness: 0.0,
  });

  const crackOverlayMat = makeMat({
    map: crackTex,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    roughness: 0.85,
    metalness: 0.1,
  });

  const registerModule = (id: string, group: THREE.Group): ISSModuleNode => {
    group.userData.moduleId = id;
    const hitMeshes: THREE.Mesh[] = [];
    const mats: THREE.MeshStandardMaterial[] = [];
    group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.userData.moduleId = id;
        mesh.layers.enable(1); // Raycast layer
        hitMeshes.push(mesh);
        clickableObjects.push(mesh);
        if (mesh.material instanceof THREE.MeshStandardMaterial) {
          mats.push(mesh.material);
        }
      }
    });
    const node: ISSModuleNode = { id, group, hitMeshes, materials: mats };
    moduleNodes.set(id, node);
    return node;
  };

  // Helper to create cylindrical pressurized module aligned along Z by default
  const makeCylinder = (
    rTop: number,
    rBot: number,
    len: number,
    mat: THREE.Material,
    radialSegs = 24
  ): THREE.Mesh => {
    const geo = new THREE.CylinderGeometry(rTop, rBot, len, radialSegs);
    geo.rotateX(Math.PI / 2);
    disposables.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  // Helper for docking ring collar
  const makeCollar = (r: number, z: number, mat: THREE.Material): THREE.Mesh => {
    const geo = new THREE.TorusGeometry(r, 0.09, 10, 24);
    disposables.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.z = z;
    return m;
  };

  // ============================================================
  // 1. ZARYA (FGB) — Nov 20, 1998
  // ============================================================
  const zaryaGroup = new THREE.Group();
  zaryaGroup.position.set(0, 0, -5.5);
  zaryaGroup.add(makeCylinder(0.86, 0.86, 2.5, russianCreamMat));
  const zaryaMid = makeCylinder(0.74, 0.86, 0.9, russianCreamMat);
  zaryaMid.position.z = -1.6;
  zaryaGroup.add(zaryaMid);
  const zaryaFwdSphereGeo = new THREE.SphereGeometry(0.76, 20, 16);
  disposables.push(zaryaFwdSphereGeo);
  const zaryaFwdSphere = new THREE.Mesh(zaryaFwdSphereGeo, brushedAlumMat);
  zaryaFwdSphere.position.z = 1.45;
  zaryaGroup.add(zaryaFwdSphere);
  zaryaGroup.add(makeCollar(0.88, 0.6, goldFoilMat));
  zaryaGroup.add(makeCollar(0.88, -0.6, darkMetalMat));

  // External propellant tanks on Zarya
  for (const side of [-1, 1]) {
    const tank = makeCylinder(0.18, 0.18, 2.1, goldFoilMat, 12);
    tank.position.set(side * 0.92, 0.25, -0.1);
    zaryaGroup.add(tank);
  }

  // Zarya crack/aging overlay shell
  const zaryaCrackMesh = makeCylinder(0.885, 0.885, 2.45, crackOverlayMat, 20);
  zaryaGroup.add(zaryaCrackMesh);

  // Zarya unfurling solar wings
  const zaryaWings: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const wingPivot = new THREE.Group();
    wingPivot.position.set(side * 0.9, 0.15, -0.35);
    const panelGeo = new THREE.BoxGeometry(3.4, 0.03, 0.95);
    panelGeo.translate(side * 1.75, 0, 0);
    disposables.push(panelGeo);
    const panelMesh = new THREE.Mesh(panelGeo, solarBlueMat);
    wingPivot.add(panelMesh);
    zaryaGroup.add(wingPivot);
    zaryaWings.push(wingPivot);
  }
  stationGroup.add(zaryaGroup);
  registerModule('zarya', zaryaGroup);

  // ============================================================
  // 2. UNITY (Node 1) + PMA-1 — Dec 1998
  // ============================================================
  const unityGroup = new THREE.Group();
  unityGroup.position.set(0, 0, -1.6);
  unityGroup.add(makeCylinder(0.95, 0.95, 2.3, brushedAlumMat));
  unityGroup.add(makeCollar(0.97, 0.95, darkMetalMat));
  unityGroup.add(makeCollar(0.97, -0.95, darkMetalMat));
  // PMA-1 connecting Unity to Zarya
  const pma1 = makeCylinder(0.9, 0.58, 1.4, darkMetalMat);
  pma1.position.z = -1.75;
  unityGroup.add(pma1);
  // Radial CBM ports (top, bottom, port, starboard)
  const portGeo = new THREE.CylinderGeometry(0.55, 0.58, 0.4, 18);
  disposables.push(portGeo);
  const topPort = new THREE.Mesh(portGeo, darkMetalMat);
  topPort.position.set(0, 1.0, 0);
  unityGroup.add(topPort);
  const botPort = new THREE.Mesh(portGeo, darkMetalMat);
  botPort.position.set(0, -1.0, 0);
  unityGroup.add(botPort);
  const unityCrack = makeCylinder(0.975, 0.975, 2.2, crackOverlayMat, 20);
  unityGroup.add(unityCrack);
  stationGroup.add(unityGroup);
  registerModule('unity', unityGroup);

  // ============================================================
  // 3. SPACE SHUTTLE ENDEAVOUR (STS-88) — Dec 1998 Mating
  // ============================================================
  const endeavourGroup = new THREE.Group();
  endeavourGroup.position.set(0, 3.8, -1.6);

  // Orbiter fuselage (extruded rounded hull + nose)
  const shuttleFuselage = makeCylinder(0.85, 0.95, 5.8, brushedAlumMat, 16);
  endeavourGroup.add(shuttleFuselage);
  const shuttleNose = makeCylinder(0.18, 0.85, 1.6, darkMetalMat, 16);
  shuttleNose.position.z = 3.6;
  endeavourGroup.add(shuttleNose);

  // Delta Wings via ExtrudeGeometry
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 2.2);
  wingShape.lineTo(3.8, -2.5);
  wingShape.lineTo(3.8, -3.1);
  wingShape.lineTo(0, -2.9);
  wingShape.lineTo(-3.8, -3.1);
  wingShape.lineTo(-3.8, -2.5);
  wingShape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
    depth: 0.14,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.05,
    bevelSegments: 2,
  });
  wingGeo.rotateX(Math.PI / 2);
  disposables.push(wingGeo);
  const shuttleWings = new THREE.Mesh(wingGeo, brushedAlumMat);
  shuttleWings.position.set(0, -0.45, -0.2);
  endeavourGroup.add(shuttleWings);

  // Vertical Tail Fin
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0, 0);
  tailShape.lineTo(-1.3, 0);
  tailShape.lineTo(-1.7, 2.1);
  tailShape.lineTo(-0.8, 2.1);
  tailShape.closePath();
  const tailGeo = new THREE.ExtrudeGeometry(tailShape, { depth: 0.12, bevelEnabled: false });
  tailGeo.rotateY(Math.PI / 2);
  disposables.push(tailGeo);
  const tailMesh = new THREE.Mesh(tailGeo, brushedAlumMat);
  tailMesh.position.set(-0.06, 0.75, -1.6);
  endeavourGroup.add(tailMesh);

  // Open Payload Bay Doors & Canadarm SRMS
  for (const side of [-1, 1]) {
    const bayDoorGeo = new THREE.BoxGeometry(0.75, 0.06, 3.6);
    disposables.push(bayDoorGeo);
    const door = new THREE.Mesh(bayDoorGeo, radiatorMat);
    door.position.set(side * 0.95, 0.85, 0.1);
    door.rotation.z = side * 0.85;
    endeavourGroup.add(door);
  }
  const srmsArmGeo = new THREE.CylinderGeometry(0.05, 0.05, 3.0, 8);
  disposables.push(srmsArmGeo);
  const srmsArm = new THREE.Mesh(srmsArmGeo, goldFoilMat);
  srmsArm.position.set(-0.7, -1.2, 0.2);
  srmsArm.rotation.z = -0.35;
  endeavourGroup.add(srmsArm);

  // 3 SSME Engine Nozzles
  for (const [ex, ey] of [[0, 0.25], [-0.35, -0.25], [0.35, -0.25]]) {
    const noz = makeCylinder(0.24, 0.14, 0.65, darkMetalMat, 12);
    noz.position.set(ex, ey, -3.1);
    endeavourGroup.add(noz);
  }
  stationGroup.add(endeavourGroup);
  registerModule('endeavour', endeavourGroup);

  // ============================================================
  // 4. ZVEZDA (Service Module) — Jul 2000 + Soyuz Crew Vehicle
  // ============================================================
  const zvezdaGroup = new THREE.Group();
  zvezdaGroup.position.set(0, 0, -9.8);
  zvezdaGroup.add(makeCylinder(0.88, 0.88, 2.8, russianCreamMat));
  const zvezdaStep = makeCylinder(0.64, 0.88, 1.3, russianCreamMat);
  zvezdaStep.position.z = 1.9;
  zvezdaGroup.add(zvezdaStep);
  const zvezdaAft = makeCylinder(0.58, 0.88, 1.0, darkMetalMat);
  zvezdaAft.position.z = -1.8;
  zvezdaGroup.add(zvezdaAft);
  zvezdaGroup.add(makeCollar(0.9, 0.2, darkMetalMat));
  zvezdaGroup.add(makeCollar(0.9, -0.9, goldFoilMat));

  // Zvezda twin solar wings
  for (const side of [-1, 1]) {
    const zWingGeo = new THREE.BoxGeometry(3.8, 0.03, 1.05);
    disposables.push(zWingGeo);
    const zWing = new THREE.Mesh(zWingGeo, solarBlueMat);
    zWing.position.set(side * 2.85, 0.1, 0.4);
    zvezdaGroup.add(zWing);
  }

  // Crewed indicator portholes & nav beacon on Zvezda
  const portholeGeo = new THREE.CircleGeometry(0.14, 12);
  disposables.push(portholeGeo);
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(portholeGeo, portholeEmissiveMat);
    p.position.set(side * 0.9, 0.18, 0.2);
    p.rotation.y = side * (Math.PI / 2);
    zvezdaGroup.add(p);
  }
  const beaconGeo = new THREE.SphereGeometry(0.12, 10, 10);
  disposables.push(beaconGeo);
  const zBeacon = new THREE.Mesh(beaconGeo, beaconMat);
  zBeacon.position.set(0, 1.05, 0);
  zvezdaGroup.add(zBeacon);

  // Zvezda structural aging/crack shell (2021-2028)
  const zvezdaCrack = makeCylinder(0.905, 0.905, 2.7, crackOverlayMat, 20);
  zvezdaGroup.add(zvezdaCrack);

  // Soyuz Crew Spacecraft docked aft (visible when permanently crewed)
  const soyuzGroup = new THREE.Group();
  soyuzGroup.position.set(0, 0, -3.4);
  soyuzGroup.add(makeCylinder(0.45, 0.55, 1.7, darkMetalMat, 14));
  const soyuzOrbGeo = new THREE.SphereGeometry(0.48, 14, 12);
  disposables.push(soyuzOrbGeo);
  const soyuzOrb = new THREE.Mesh(soyuzOrbGeo, brushedAlumMat);
  soyuzOrb.position.z = 0.95;
  soyuzGroup.add(soyuzOrb);
  for (const side of [-1, 1]) {
    const sWingGeo = new THREE.BoxGeometry(1.7, 0.025, 0.48);
    disposables.push(sWingGeo);
    const sWing = new THREE.Mesh(sWingGeo, solarBlueMat);
    sWing.position.set(side * 1.3, 0, -0.2);
    soyuzGroup.add(sWing);
  }
  zvezdaGroup.add(soyuzGroup);

  stationGroup.add(zvezdaGroup);
  registerModule('zvezda', zvezdaGroup);

  // ============================================================
  // 5. DESTINY LABORATORY — Feb 2001
  // ============================================================
  const destinyGroup = new THREE.Group();
  destinyGroup.position.set(0, 0, 2.0);
  destinyGroup.add(makeCylinder(0.95, 0.95, 3.6, brushedAlumMat));
  destinyGroup.add(makeCollar(0.97, 1.4, darkMetalMat));
  destinyGroup.add(makeCollar(0.97, -1.4, darkMetalMat));
  // Longitudinal Whipple shield rails
  for (const angle of [0.4, -0.4, Math.PI - 0.4, Math.PI + 0.4]) {
    const railGeo = new THREE.BoxGeometry(0.08, 0.08, 3.2);
    disposables.push(railGeo);
    const rail = new THREE.Mesh(railGeo, darkMetalMat);
    rail.position.set(Math.cos(angle) * 0.97, Math.sin(angle) * 0.97, 0);
    destinyGroup.add(rail);
  }
  // Nadir optical window
  const destinyWin = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.14, 16), cupolaGlassMat);
  disposables.push(destinyWin.geometry);
  destinyWin.position.set(0, -0.96, 0);
  destinyGroup.add(destinyWin);

  stationGroup.add(destinyGroup);
  registerModule('destiny', destinyGroup);

  // ============================================================
  // 6. QUEST JOINT AIRLOCK — Jul 2001
  // ============================================================
  const questGroup = new THREE.Group();
  questGroup.position.set(2.3, 0, -1.6);
  const questCyl1 = makeCylinder(0.7, 0.7, 1.8, brushedAlumMat);
  questCyl1.rotation.y = Math.PI / 2;
  questGroup.add(questCyl1);
  const questCyl2 = makeCylinder(0.55, 0.7, 1.1, darkMetalMat);
  questCyl2.rotation.y = Math.PI / 2;
  questCyl2.position.x = 1.25;
  questGroup.add(questCyl2);
  // 4 spherical EVA gas tanks
  const tankGeo = new THREE.SphereGeometry(0.32, 14, 12);
  disposables.push(tankGeo);
  for (const [ty, tz] of [[0.72, 0.42], [-0.72, 0.42], [0.72, -0.42], [-0.72, -0.42]]) {
    const tMesh = new THREE.Mesh(tankGeo, goldFoilMat);
    tMesh.position.set(0.2, ty, tz);
    questGroup.add(tMesh);
  }
  stationGroup.add(questGroup);
  registerModule('quest', questGroup);

  // ============================================================
  // 7. HARMONY (Node 2) — Oct 2007
  // ============================================================
  const harmonyGroup = new THREE.Group();
  harmonyGroup.position.set(0, 0, 5.4);
  harmonyGroup.add(makeCylinder(0.95, 0.95, 3.0, brushedAlumMat));
  harmonyGroup.add(makeCollar(0.97, 1.2, darkMetalMat));
  harmonyGroup.add(makeCollar(0.97, -1.2, darkMetalMat));
  // Forward PMA-2 / IDA docking cone
  const pma2 = makeCylinder(0.55, 0.9, 1.35, darkMetalMat);
  pma2.position.z = 2.05;
  harmonyGroup.add(pma2);
  stationGroup.add(harmonyGroup);
  registerModule('harmony', harmonyGroup);

  // ============================================================
  // 8. COLUMBUS (ESA) — Feb 2008
  // ============================================================
  const columbusGroup = new THREE.Group();
  columbusGroup.position.set(2.85, 0, 5.4);
  const colBody = makeCylinder(0.92, 0.92, 3.1, brushedAlumMat);
  colBody.rotation.y = Math.PI / 2;
  columbusGroup.add(colBody);
  const colStripe = makeCylinder(0.94, 0.94, 0.45, esaStripeMat);
  colStripe.rotation.y = Math.PI / 2;
  colStripe.position.x = 0.65;
  columbusGroup.add(colStripe);
  const colEnd = makeCylinder(0.55, 0.92, 0.65, darkMetalMat);
  colEnd.rotation.y = Math.PI / 2;
  colEnd.position.x = 1.8;
  columbusGroup.add(colEnd);
  stationGroup.add(columbusGroup);
  registerModule('columbus', columbusGroup);

  // ============================================================
  // 9. KIBO (JAXA JEM + ELM-PS + Exposed Facility) — Mar/May 2008
  // ============================================================
  const kiboGroup = new THREE.Group();
  kiboGroup.position.set(-3.3, 0, 5.4);
  const kiboPM = makeCylinder(0.94, 0.94, 4.3, brushedAlumMat);
  kiboPM.rotation.y = Math.PI / 2;
  kiboGroup.add(kiboPM);
  // Experiment Logistics Module (ELM-PS) perched atop Kibo
  const elmGeo = new THREE.CylinderGeometry(0.75, 0.78, 1.85, 20);
  disposables.push(elmGeo);
  const elmMesh = new THREE.Mesh(elmGeo, brushedAlumMat);
  elmMesh.position.set(-0.2, 1.65, 0);
  kiboGroup.add(elmMesh);
  // Exposed Facility ("porch") extending port
  const porchGeo = new THREE.BoxGeometry(2.4, 0.25, 1.9);
  disposables.push(porchGeo);
  const porchMesh = new THREE.Mesh(porchGeo, darkMetalMat);
  porchMesh.position.set(-3.3, -0.35, 0);
  kiboGroup.add(porchMesh);
  const payloadBoxGeo = new THREE.BoxGeometry(0.65, 0.55, 0.65);
  disposables.push(payloadBoxGeo);
  for (const pz of [-0.55, 0.55]) {
    const pBox = new THREE.Mesh(payloadBoxGeo, goldFoilMat);
    pBox.position.set(-3.4, 0.05, pz);
    kiboGroup.add(pBox);
  }
  stationGroup.add(kiboGroup);
  registerModule('kibo', kiboGroup);

  // ============================================================
  // 10. TRANQUILITY (Node 3) & CUPOLA — Feb 2010
  // ============================================================
  const tranquilityGroup = new THREE.Group();
  tranquilityGroup.position.set(-2.6, -0.35, -1.6);
  const tranqBody = makeCylinder(0.92, 0.92, 2.9, brushedAlumMat);
  tranqBody.rotation.y = Math.PI / 2;
  tranquilityGroup.add(tranqBody);

  // Iconic 7-Window Cupola Observatory Dome facing nadir (-Y)
  const cupolaFrameGeo = new THREE.CylinderGeometry(0.65, 0.84, 0.65, 6);
  disposables.push(cupolaFrameGeo);
  const cupolaFrame = new THREE.Mesh(cupolaFrameGeo, darkMetalMat);
  cupolaFrame.position.set(-0.35, -1.12, 0);
  tranquilityGroup.add(cupolaFrame);

  const cupolaDomeGlassGeo = new THREE.CylinderGeometry(0.58, 0.76, 0.55, 6);
  disposables.push(cupolaDomeGlassGeo);
  const cupolaGlass = new THREE.Mesh(cupolaDomeGlassGeo, cupolaGlassMat);
  cupolaGlass.position.set(-0.35, -1.2, 0);
  tranquilityGroup.add(cupolaGlass);

  // Glowing interior warmth inside Cupola when crewed
  const cupolaGlowGeo = new THREE.SphereGeometry(0.42, 12, 10);
  disposables.push(cupolaGlowGeo);
  const cupolaGlow = new THREE.Mesh(cupolaGlowGeo, portholeEmissiveMat);
  cupolaGlow.position.set(-0.35, -1.05, 0);
  tranquilityGroup.add(cupolaGlow);

  stationGroup.add(tranquilityGroup);
  registerModule('tranquility', tranquilityGroup);

  // ============================================================
  // 11. INTEGRATED TRUSS STRUCTURE, RADIATORS & 8 SOLAR WINGS
  //     (Using InstancedMesh for high-performance truss & panels)
  // ============================================================
  const trussGroup = new THREE.Group();
  trussGroup.position.set(0, 1.55, 0.25);

  // Z1 Truss dome atop Unity
  const z1Geo = new THREE.BoxGeometry(1.75, 1.35, 1.75);
  disposables.push(z1Geo);
  const z1Mesh = new THREE.Mesh(z1Geo, trussMetalMat);
  z1Mesh.position.set(0, -0.35, -1.85);
  trussGroup.add(z1Mesh);

  // Early P6 Solar Wing (mounted on Z1 2000.9–2007.8 before relocation)
  const earlyP6Group = new THREE.Group();
  earlyP6Group.position.set(0, 1.15, -1.85);
  const earlyMast = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.8, 0.25), darkMetalMat);
  disposables.push(earlyMast.geometry);
  earlyP6Group.add(earlyMast);
  for (const side of [-1, 1]) {
    const epGeo = new THREE.BoxGeometry(7.2, 0.04, 1.5);
    disposables.push(epGeo);
    const ep = new THREE.Mesh(epGeo, solarGoldMat);
    ep.position.set(side * 4.1, 0.7, 0);
    earlyP6Group.add(ep);
  }
  trussGroup.add(earlyP6Group);

  // Main Spine Rail (S0 + port/starboard)
  const spineLeftGroup = new THREE.Group();
  const spineRightGroup = new THREE.Group();
  trussGroup.add(spineLeftGroup, spineRightGroup);

  // InstancedMesh for truss lattice cross-struts (44 bays across 49 units)
  const strutGeo = new THREE.BoxGeometry(0.11, 1.35, 1.35);
  disposables.push(strutGeo);
  const totalBays = 36;
  const trussInstanced = new THREE.InstancedMesh(strutGeo, trussMetalMat, totalBays);
  const dummy = new THREE.Object3D();
  const bayHalfSpan = 23.0;
  for (let i = 0; i < totalBays; i++) {
    const t = i / (totalBays - 1);
    const x = -bayHalfSpan + t * (bayHalfSpan * 2);
    dummy.position.set(x, 0, 0);
    dummy.rotation.set(i % 2 === 0 ? 0.25 : -0.25, 0, 0.785);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    trussInstanced.setMatrixAt(i, dummy.matrix);
  }
  trussInstanced.instanceMatrix.needsUpdate = true;
  trussInstanced.computeBoundingSphere();
  trussGroup.add(trussInstanced);

  // Central S0 continuous rail beam
  const s0BeamGeo = new THREE.BoxGeometry(10.0, 0.95, 1.05);
  disposables.push(s0BeamGeo);
  const s0Beam = new THREE.Mesh(s0BeamGeo, trussMetalMat);
  trussGroup.add(s0Beam);

  // Canadarm2 (SSRMS) perched on S0 Mobile Base
  const canadarmGroup = new THREE.Group();
  canadarmGroup.position.set(0.6, 0.65, 0.45);
  const armSegGeo = new THREE.CylinderGeometry(0.08, 0.08, 3.1, 10);
  disposables.push(armSegGeo);
  const armSeg1 = new THREE.Mesh(armSegGeo, brushedAlumMat);
  armSeg1.position.set(0.6, 0.85, 0);
  armSeg1.rotation.z = -0.65;
  canadarmGroup.add(armSeg1);
  const armSeg2 = new THREE.Mesh(armSegGeo, brushedAlumMat);
  armSeg2.position.set(2.1, 0.95, 0.5);
  armSeg2.rotation.z = 0.85;
  armSeg2.rotation.x = 0.4;
  canadarmGroup.add(armSeg2);
  trussGroup.add(canadarmGroup);

  // 6 Thermal Control Radiator Wings extending aft (-Z)
  const radGeo = new THREE.BoxGeometry(1.15, 0.04, 5.4);
  disposables.push(radGeo);
  const radPositions = [-14.2, -9.2, -5.8, 5.8, 9.2, 14.2];
  const radiatorMeshes: THREE.Mesh[] = [];
  radPositions.forEach((rx) => {
    const rMesh = new THREE.Mesh(radGeo, radiatorMat);
    rMesh.position.set(rx, 0.25, -3.35);
    trussGroup.add(rMesh);
    radiatorMeshes.push(rMesh);
  });

  // 8 Massive Copper-Gold Solar Array Wings (4 Port, 4 Starboard, each with upper +Z/-Z double blanket)
  // Using InstancedMesh for the 16 blanket leaves (8 pairs × 2 blankets) or individual pivotable wings for sun-tracking & breakup!
  // Wait: let's combine InstancedMesh for the 128 individual solar sub-panels OR use individual gimbal groups for independent 2006-2009 deployment + 2031 breakup!
  // Let's use InstancedMesh inside each wing OR 8 wing groups with an InstancedMesh for the 64 structural ribs across the 8 wings so we get BOTH InstancedMesh optimization AND independent deployment/breakup!
  interface SolarWingRig {
    group: THREE.Group;
    upperLeaf: THREE.Mesh;
    lowerLeaf: THREE.Mesh;
    deployYear: number;
    baseX: number;
    side: number;
  }

  const sawConfigs = [
    { x: -16.2, side: -1, deployYear: 2006.7 }, // P4 2A
    { x: -18.2, side: -1, deployYear: 2006.7 }, // P4 4A
    { x: -22.2, side: -1, deployYear: 2007.8 }, // P6 2B
    { x: -24.2, side: -1, deployYear: 2007.8 }, // P6 4B
    { x: 16.2, side: 1, deployYear: 2007.45 }, // S4 1A
    { x: 18.2, side: 1, deployYear: 2007.45 }, // S4 3A
    { x: 22.2, side: 1, deployYear: 2009.2 }, // S6 1B
    { x: 24.2, side: 1, deployYear: 2009.2 }, // S6 3B
  ];

  const leafGeo = new THREE.BoxGeometry(1.55, 0.035, 11.4);
  disposables.push(leafGeo);
  const mastCanisterGeo = new THREE.CylinderGeometry(0.28, 0.28, 1.3, 12);
  disposables.push(mastCanisterGeo);

  const solarWingRigs: SolarWingRig[] = sawConfigs.map((cfg) => {
    const wg = new THREE.Group();
    wg.position.set(cfg.x, 0, 0);

    const canister = new THREE.Mesh(mastCanisterGeo, darkMetalMat);
    canister.rotation.z = Math.PI / 2;
    wg.add(canister);

    const upperLeaf = new THREE.Mesh(leafGeo, solarGoldMat);
    upperLeaf.position.set(0, 0, 6.4);
    wg.add(upperLeaf);

    const lowerLeaf = new THREE.Mesh(leafGeo, solarGoldMat);
    lowerLeaf.position.set(0, 0, -6.4);
    wg.add(lowerLeaf);

    trussGroup.add(wg);
    return {
      group: wg,
      upperLeaf,
      lowerLeaf,
      deployYear: cfg.deployYear,
      baseX: cfg.x,
      side: cfg.side,
    };
  });

  // InstancedMesh for 128 gold tension-rib crossbars across all 8 solar wings
  const sawRibGeo = new THREE.BoxGeometry(1.62, 0.055, 0.06);
  disposables.push(sawRibGeo);
  const sawRibsInstanced = new THREE.InstancedMesh(sawRibGeo, darkMetalMat, sawConfigs.length * 16);
  let ribIdx = 0;
  sawConfigs.forEach((cfg) => {
    for (let r = 0; r < 8; r++) {
      const zOff = 1.6 + r * 1.38;
      dummy.position.set(cfg.x, 0, zOff);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      sawRibsInstanced.setMatrixAt(ribIdx++, dummy.matrix);

      dummy.position.set(cfg.x, 0, -zOff);
      dummy.updateMatrix();
      sawRibsInstanced.setMatrixAt(ribIdx++, dummy.matrix);
    }
  });
  sawRibsInstanced.instanceMatrix.needsUpdate = true;
  sawRibsInstanced.computeBoundingSphere();
  trussGroup.add(sawRibsInstanced);

  stationGroup.add(trussGroup);
  registerModule('truss', trussGroup);

  // ============================================================
  // 12. SPACEX US DEORBIT VEHICLE (USDV) — 2029–2031
  // ============================================================
  const usdvGroup = new THREE.Group();
  usdvGroup.position.set(0, 0, 9.2);

  // Dragon-derived nosecone capsule
  const usdvCone = makeCylinder(0.88, 0.42, 1.35, brushedAlumMat, 20);
  usdvCone.position.z = -1.2;
  usdvGroup.add(usdvCone);
  // High-capacity propulsion trunk
  const usdvTrunk = makeCylinder(0.92, 0.92, 3.2, darkMetalMat, 20);
  usdvTrunk.position.z = 1.0;
  usdvGroup.add(usdvTrunk);
  // White radiator fins & thruster pods
  for (const angle of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    const finGeo = new THREE.BoxGeometry(0.1, 0.55, 2.4);
    disposables.push(finGeo);
    const fin = new THREE.Mesh(finGeo, radiatorMat);
    fin.position.set(Math.cos(angle) * 1.0, Math.sin(angle) * 1.0, 1.0);
    fin.rotation.z = angle + Math.PI / 2;
    usdvGroup.add(fin);
  }
  // Retrograde deorbit thruster plumes (active in 2031)
  const plumeMat = new THREE.MeshBasicMaterial({
    color: 0x60a5fa,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  disposables.push(plumeMat);
  const plumeGeo = new THREE.ConeGeometry(0.32, 2.2, 12);
  plumeGeo.rotateX(Math.PI / 2);
  disposables.push(plumeGeo);
  const plumeMesh = new THREE.Mesh(plumeGeo, plumeMat);
  plumeMesh.position.z = 3.7;
  usdvGroup.add(plumeMesh);

  stationGroup.add(usdvGroup);
  registerModule('usdv', usdvGroup);

  // ============================================================
  // 13. ORBITAL TRAJECTORY ARC (Remains quietly after End of Mission)
  // ============================================================
  const orbitPoints: THREE.Vector3[] = [];
  const orbitRadius = 130;
  const orbitCenterY = -130;
  for (let i = -40; i <= 40; i++) {
    const a = (i / 40) * 0.48;
    orbitPoints.push(new THREE.Vector3(Math.sin(a) * orbitRadius * 0.12, orbitCenterY + Math.cos(a) * orbitRadius, Math.sin(a) * orbitRadius));
  }
  const orbitGeo = new THREE.BufferGeometry().setFromPoints(orbitPoints);
  disposables.push(orbitGeo);
  const orbitMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.28,
  });
  disposables.push(orbitMat);
  const orbitPathLine = new THREE.Line(orbitGeo, orbitMat);
  root.add(orbitPathLine);

  // Hover & Selection State
  let hoveredId: string | null = null;
  let selectedId: string | null = null;

  const updateHighlights = () => {
    moduleNodes.forEach((node, id) => {
      const isSelected = id === selectedId;
      const isHovered = id === hoveredId;
      node.materials.forEach((m) => {
        if (m === portholeEmissiveMat || m === beaconMat || m === crackOverlayMat) return;
        if (isSelected) {
          m.emissive.setHex(0x0ea5e9);
          m.emissiveIntensity = 0.35;
        } else if (isHovered) {
          m.emissive.setHex(0x38bdf8);
          m.emissiveIntensity = 0.2;
        } else {
          m.emissive.setHex(0x000000);
          m.emissiveIntensity = 0.0;
        }
      });
    });
  };

  function setHoveredModule(moduleId: string | null): void {
    if (hoveredId !== moduleId) {
      hoveredId = moduleId;
      updateHighlights();
    }
  }

  function setSelectedModule(moduleId: string | null): void {
    if (selectedId !== moduleId) {
      selectedId = moduleId;
      updateHighlights();
    }
  }

  const _tempVec = new THREE.Vector3();

  function getModuleWorldPosition(moduleId: string, out: THREE.Vector3): boolean {
    const node = moduleNodes.get(moduleId);
    if (!node || !node.group.visible) return false;
    node.group.getWorldPosition(out);
    return true;
  }

  function update(year: number, elapsed: number, delta: number, sunDir: THREE.Vector3): void {
    void delta;
    // 1. Module chronological visibility & unfurling
    zaryaGroup.visible = year >= 1998.88 && year < 2031.42;
    const zaryaUnfurl = smoothStep(1998.885, 1998.915, year);
    zaryaWings.forEach((w) => {
      w.scale.set(Math.max(0.05, zaryaUnfurl), 1, 1);
    });

    // Unity + STS-88 Endeavour
    unityGroup.visible = year >= 1998.93 && year < 2031.42;
    const endeavourWindow = year >= 1998.92 && year <= 1999.06;
    endeavourGroup.visible = endeavourWindow;
    if (endeavourWindow) {
      const matingT = smoothStep(1998.92, 1998.95, year) * (1 - smoothStep(1999.02, 1999.06, year));
      endeavourGroup.position.set(0, THREE.MathUtils.lerp(7.5, 2.35, matingT), -1.6);
      endeavourGroup.rotation.set(0, 0, Math.sin(elapsed * 0.4) * 0.02);
    }

    // Zvezda & Soyuz
    zvezdaGroup.visible = year >= 2000.568 && year < 2031.42;
    const isCrewed = year >= 2000.838 && year < 2030.7;
    soyuzGroup.visible = isCrewed;

    // Crewed indicator lights (cabin window warmth + orbital green strobe)
    if (isCrewed) {
      portholeEmissiveMat.emissiveIntensity = 1.65;
      const strobe = Math.pow(Math.max(0, Math.sin(elapsed * 3.2)), 6);
      beaconMat.emissiveIntensity = 0.35 + strobe * 2.4;
    } else {
      portholeEmissiveMat.emissiveIntensity = 0.0;
      beaconMat.emissiveIntensity = 0.0;
    }

    // Destiny & Quest
    destinyGroup.visible = year >= 2001.104 && year < 2031.42;
    questGroup.visible = year >= 2001.537 && year < 2031.42;

    // Truss expansion (2000.9 – 2009.5)
    const trussActive = year >= 2000.9 && year < 2031.42;
    trussGroup.visible = trussActive;
    if (trussActive) {
      // Early P6 on Z1 from late 2000 until relocation to port tip in late 2007
      earlyP6Group.visible = year >= 2000.9 && year < 2007.82;

      // Progressive truss span scale along X
      const spanScale = 0.14 + 0.86 * smoothStep(2002.2, 2007.9, year);
      trussInstanced.scale.set(spanScale, 1, 1);

      // Radiators extend progressively (2005–2008)
      const radDeploy = smoothStep(2005.5, 2008.2, year);
      radiatorMeshes.forEach((rm, idx) => {
        const threshold = Math.abs(radPositions[idx]) > 11 ? 2007.0 : 2005.8;
        const rLocal = smoothStep(threshold, threshold + 0.8, year);
        rm.visible = rLocal > 0.02;
        rm.scale.set(1, 1, Math.max(0.05, rLocal * radDeploy + 0.05));
      });

      // Solar Array Wings deployment & sun-tracking alpha gimbal
      const sunAngle = Math.atan2(sunDir.y, sunDir.z) * 0.45;
      const breakupT = year >= 2031.26 ? smoothStep(2031.26, 2031.39, year) : 0;

      solarWingRigs.forEach((rig, idx) => {
        const dep = smoothStep(rig.deployYear - 0.1, rig.deployYear + 0.25, year);
        rig.group.visible = dep > 0.02 && breakupT < 0.92;
        if (rig.group.visible) {
          rig.upperLeaf.scale.set(1, 1, Math.max(0.04, dep));
          rig.lowerLeaf.scale.set(1, 1, Math.max(0.04, dep));
          if (breakupT > 0) {
            // Shear & tumble solar wings outward during re-entry breakup
            rig.group.position.x = rig.baseX + rig.side * breakupT * (4.0 + idx * 1.4);
            rig.group.position.y = breakupT * (2.5 + (idx % 3) * 1.8);
            rig.group.rotation.x = sunAngle + breakupT * (idx % 2 === 0 ? 2.4 : -2.1);
            rig.group.rotation.z = breakupT * rig.side * 1.3;
          } else {
            rig.group.position.set(rig.baseX, 0, 0);
            rig.group.rotation.set(sunAngle, 0, 0);
          }
        }
      });

      sawRibsInstanced.visible = year >= 2006.7 && breakupT < 0.35;
    }

    // Harmony, Columbus, Kibo, Tranquility
    harmonyGroup.visible = year >= 2007.819 && year < 2031.42;
    columbusGroup.visible = year >= 2008.112 && year < 2031.42;
    kiboGroup.visible = year >= 2008.194 && year < 2031.42;
    tranquilityGroup.visible = year >= 2010.126 && year < 2031.42;

    // Aging / stress micro-fracture overlay (2021-2028+)
    const aging = smoothStep(2021.0, 2028.5, year);
    crackOverlayMat.opacity = aging * 0.72;

    // SpaceX USDV (2029.6 – 2031.42)
    const usdvDocked = year >= 2029.6 && year < 2031.42;
    usdvGroup.visible = usdvDocked;
    if (usdvDocked) {
      const approach = smoothStep(2029.6, 2029.85, year);
      usdvGroup.position.z = THREE.MathUtils.lerp(16.0, 9.2, approach);
      const burnActive = year >= 2031.08 && year <= 2031.26;
      plumeMat.opacity = burnActive ? 0.55 + Math.sin(elapsed * 24) * 0.2 : 0.0;
    }

    // 2028-2031 Altitude lowering, Re-entry tumble, and End-of-Mission fade
    let altitudeOffsetY = 0;
    if (year >= 2028.0 && year < 2031.1) {
      altitudeOffsetY = -2.8 * smoothStep(2028.0, 2031.1, year);
    } else if (year >= 2031.1) {
      altitudeOffsetY = -2.8 - 10.5 * smoothStep(2031.1, 2031.42, year);
    }

    stationGroup.position.y = altitudeOffsetY;

    if (year >= 2031.12 && year < 2031.42) {
      const tumbleT = smoothStep(2031.12, 2031.42, year);
      stationGroup.rotation.x = tumbleT * 0.65 + Math.sin(elapsed * 2.2) * 0.08 * tumbleT;
      stationGroup.rotation.z = tumbleT * 0.45 + Math.cos(elapsed * 1.7) * 0.1 * tumbleT;
      stationGroup.rotation.y = Math.sin(tumbleT * Math.PI) * 0.35;
      // Subtle fade scale at final disintegration
      const disintegrate = smoothStep(2031.34, 2031.42, year);
      const sc = Math.max(0.01, 1 - disintegrate * 0.92);
      stationGroup.scale.setScalar(sc);
      stationGroup.visible = disintegrate < 0.98;
    } else if (year >= 2031.42) {
      stationGroup.visible = false;
    } else {
      // Gentle orbital attitude micro-stabilization
      stationGroup.visible = true;
      stationGroup.scale.setScalar(1);
      stationGroup.rotation.set(
        Math.sin(elapsed * 0.25) * 0.012,
        Math.cos(elapsed * 0.18) * 0.015,
        Math.sin(elapsed * 0.21) * 0.01
      );
    }

    // Subtle orbit arc fades softly after mission ends
    orbitMat.opacity = year >= 2031.42 ? 0.18 : 0.28;
    void _tempVec;
  }

  function dispose(): void {
    disposables.forEach((d) => d.dispose());
  }

  return {
    root,
    stationGroup,
    orbitPathLine,
    clickableObjects,
    moduleNodes,
    update,
    setHoveredModule,
    setSelectedModule,
    getModuleWorldPosition,
    dispose,
  };
}
