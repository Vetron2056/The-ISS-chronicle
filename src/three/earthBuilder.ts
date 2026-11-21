import * as THREE from 'three';

export const EARTH_RADIUS = 110;

const BLUE_MARBLE_URL = '/src/assets/images/earth_bluemarble_map_1795252551304.jpg';
const CLOUDS_MAP_URL = '/src/assets/images/earth_clouds_map_1795252551603.jpg';

export function latLonToVector3(latDeg: number, lonDeg: number, radius: number): THREE.Vector3 {
  const phi = (90 - latDeg) * (Math.PI / 180);
  const theta = (lonDeg + 180) * (Math.PI / 180);
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

/**
 * Derives pixel-aligned ocean specular roughness map and topographic bump map
 * directly from the loaded Blue Marble satellite image.
 */
function deriveEarthSurfaceMaps(
  img: HTMLImageElement,
  maxAnisotropy: number
): { roughnessMap: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const w = 1024;
  const h = 512;

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = w;
  srcCanvas.height = h;
  const srcCtx = srcCanvas.getContext('2d')!;
  srcCtx.drawImage(img, 0, 0, w, h);
  const pixels = srcCtx.getImageData(0, 0, w, h).data;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = w;
  roughCanvas.height = h;
  const roughCtx = roughCanvas.getContext('2d')!;
  const roughImg = roughCtx.createImageData(w, h);

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = w;
  bumpCanvas.height = h;
  const bumpCtx = bumpCanvas.getContext('2d')!;
  const bumpImg = bumpCtx.createImageData(w, h);

  for (let i = 0; i < w * h; i++) {
    const off = i * 4;
    const r = pixels[off];
    const g = pixels[off + 1];
    const b = pixels[off + 2];

    // Identify ocean vs land/ice from blue dominance & low red channel
    const isOcean = b > r + 14 && b > g + 4 && r < 68;
    const lum = (r * 0.299 + g * 0.587 + b * 0.114);

    // Glossy oceans (~0.24 roughness) for orbital sun-glint; matte continents (~0.88)
    const roughVal = isOcean ? 62 : 224;
    roughImg.data[off] = roughVal;
    roughImg.data[off + 1] = roughVal;
    roughImg.data[off + 2] = roughVal;
    roughImg.data[off + 3] = 255;

    // Elevation relief: flat oceans (0), raised continents/mountains scaled by brightness
    const elev = isOcean ? 8 : Math.min(255, Math.floor(60 + lum * 0.78));
    bumpImg.data[off] = elev;
    bumpImg.data[off + 1] = elev;
    bumpImg.data[off + 2] = elev;
    bumpImg.data[off + 3] = 255;
  }

  roughCtx.putImageData(roughImg, 0, 0);
  bumpCtx.putImageData(bumpImg, 0, 0);

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.anisotropy = maxAnisotropy;
  roughnessMap.wrapS = THREE.RepeatWrapping;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.anisotropy = maxAnisotropy;
  bumpMap.wrapS = THREE.RepeatWrapping;

  return { roughnessMap, bumpMap };
}

export interface EarthSystem {
  group: THREE.Group;
  earthMesh: THREE.Mesh;
  cloudsMesh: THREE.Mesh;
  atmosphereMat: THREE.ShaderMaterial;
  pointNemoMarker: THREE.Group;
  starfield: THREE.Points;
  update: (delta: number, year: number) => void;
  dispose: () => void;
}

export function createEarthSystem(maxAnisotropy: number): EarthSystem {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];
  const loader = new THREE.TextureLoader();

  // Earth Surface Material
  const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS, 96, 64);
  const earthMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ffffff'),
    roughness: 0.92,
    metalness: 0.05,
    bumpScale: 0.55,
  });
  disposables.push(earthGeo, earthMat);

  // Load Blue Marble photorealistic satellite map & derive ocean specular + mountain bump maps
  const blueMarbleTex = loader.load(BLUE_MARBLE_URL, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;
    tex.wrapS = THREE.RepeatWrapping;
    tex.needsUpdate = true;

    const img = tex.image as HTMLImageElement | undefined;
    if (img) {
      const { roughnessMap, bumpMap } = deriveEarthSurfaceMaps(img, maxAnisotropy);
      earthMat.roughnessMap = roughnessMap;
      earthMat.bumpMap = bumpMap;
      earthMat.needsUpdate = true;
      disposables.push(roughnessMap, bumpMap);
    }
  });
  blueMarbleTex.colorSpace = THREE.SRGBColorSpace;
  blueMarbleTex.anisotropy = maxAnisotropy;
  blueMarbleTex.wrapS = THREE.RepeatWrapping;
  earthMat.map = blueMarbleTex;
  disposables.push(blueMarbleTex);

  const earthMesh = new THREE.Mesh(earthGeo, earthMat);
  earthMesh.receiveShadow = true;
  group.add(earthMesh);

  // Satellite Global Cloud Layer
  const cloudsGeo = new THREE.SphereGeometry(EARTH_RADIUS + 0.72, 72, 48);
  const cloudsAlphaTex = loader.load(CLOUDS_MAP_URL, (tex) => {
    tex.anisotropy = maxAnisotropy;
    tex.wrapS = THREE.RepeatWrapping;
    tex.needsUpdate = true;
  });
  cloudsAlphaTex.anisotropy = maxAnisotropy;
  cloudsAlphaTex.wrapS = THREE.RepeatWrapping;

  const cloudsMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    alphaMap: cloudsAlphaTex,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    roughness: 0.95,
    metalness: 0.0,
  });
  disposables.push(cloudsGeo, cloudsMat, cloudsAlphaTex);
  const cloudsMesh = new THREE.Mesh(cloudsGeo, cloudsMat);
  group.add(cloudsMesh);

  // Atmospheric Rayleigh Scattering Fresnel Halo
  const atmosGeo = new THREE.SphereGeometry(EARTH_RADIUS + 3.4, 72, 48);
  const atmosphereMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color('#38bdf8') },
      uReentryGlow: { value: 0.0 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uReentryGlow;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vec3 viewDir = normalize(vViewPosition);
        float rim = clamp(1.0 - max(0.0, dot(vNormal, viewDir)), 0.0, 1.0);
        float intensity = pow(rim, 3.1) * 0.78;
        vec3 finalColor = mix(uColor, vec3(1.0, 0.45, 0.14), uReentryGlow * 0.6);
        gl_FragColor = vec4(finalColor, intensity);
      }
    `,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  disposables.push(atmosGeo, atmosphereMat);
  const atmosMesh = new THREE.Mesh(atmosGeo, atmosphereMat);
  group.add(atmosMesh);

  // Point Nemo Marker (48°52.6′S, 123°23.6′W) attached to earthMesh
  const pointNemoMarker = new THREE.Group();
  const nemoPos = latLonToVector3(-48.876, -123.393, EARTH_RADIUS + 0.35);
  pointNemoMarker.position.copy(nemoPos);
  pointNemoMarker.lookAt(nemoPos.clone().multiplyScalar(2));

  const ringGeo = new THREE.RingGeometry(1.4, 2.0, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xf59e0b,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  pointNemoMarker.add(ringMesh);

  const outerRingGeo = new THREE.RingGeometry(2.8, 3.1, 32);
  const outerRingMat = ringMat.clone();
  const outerRingMesh = new THREE.Mesh(outerRingGeo, outerRingMat);
  pointNemoMarker.add(outerRingMesh);
  disposables.push(ringGeo, ringMat, outerRingGeo, outerRingMat);

  earthMesh.add(pointNemoMarker);

  // Orient Earth so sunlit continents & Pacific/Atlantic oceans sit below the ISS
  group.position.set(0, -(EARTH_RADIUS + 20), 0);
  earthMesh.rotation.set(0.35, 2.15, 0.08);

  // Spectral Starfield
  const starCount = 3200;
  const starPositions = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);
  const palette = [
    new THREE.Color('#cbd5e1'),
    new THREE.Color('#93c5fd'),
    new THREE.Color('#fef3c7'),
    new THREE.Color('#fde68a'),
    new THREE.Color('#e2e8f0'),
  ];
  for (let i = 0; i < starCount; i++) {
    const r = 420 + Math.random() * 280;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = r * Math.cos(phi);
    starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

    const col = palette[Math.floor(Math.random() * palette.length)];
    const brightness = 0.55 + Math.random() * 0.45;
    starColors[i * 3] = col.r * brightness;
    starColors[i * 3 + 1] = col.g * brightness;
    starColors[i * 3 + 2] = col.b * brightness;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
  const starMat = new THREE.PointsMaterial({
    size: 1.45,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });
  disposables.push(starGeo, starMat);
  const starfield = new THREE.Points(starGeo, starMat);

  function update(delta: number, year: number): void {
    earthMesh.rotation.y += delta * 0.0085;
    cloudsMesh.rotation.y += delta * 0.011;
    cloudsMesh.rotation.x = earthMesh.rotation.x;
    cloudsMesh.rotation.z = earthMesh.rotation.z;

    if (year >= 2028) {
      const prepFactor = Math.min(1, (year - 2028) / 3.0);
      ringMat.opacity = prepFactor * 0.78;
      outerRingMat.opacity = prepFactor * 0.45;
      if (year >= 2030.5) {
        const alignT = Math.min(1, (year - 2030.5) / 0.7);
        earthMesh.rotation.x = THREE.MathUtils.lerp(earthMesh.rotation.x, 1.32, delta * 0.9 * alignT);
        earthMesh.rotation.y = THREE.MathUtils.lerp(earthMesh.rotation.y, 1.15, delta * 0.9 * alignT);
      }
      const reentryGlow = year >= 2031.1 ? Math.min(1, (year - 2031.1) / 0.28) : 0;
      atmosphereMat.uniforms.uReentryGlow.value = reentryGlow;
    } else {
      ringMat.opacity = 0;
      outerRingMat.opacity = 0;
      atmosphereMat.uniforms.uReentryGlow.value = 0;
    }
  }

  function dispose(): void {
    disposables.forEach((d) => d.dispose());
  }

  return {
    group,
    earthMesh,
    cloudsMesh,
    atmosphereMat,
    pointNemoMarker,
    starfield,
    update,
    dispose,
  };
}
