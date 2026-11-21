import * as THREE from 'three';
import { DistanceTextureManager, TextureLodTier } from './textureManager';

export const EARTH_RADIUS = 110;

// Verified CORS-enabled NASA Visible Earth / Blue Marble archives + bundled local fallbacks
const LOCAL_BLUE_MARBLE_URL = '/src/assets/images/earth_bluemarble_map_1795252551304.jpg';
const LOCAL_CLOUDS_URL = '/src/assets/images/earth_clouds_map_1795252551603.jpg';

const NASA_EARTH_DAY_4K =
  'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_day_4096.jpg';
const NASA_EARTH_ATMOS_2K =
  'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_atmos_2048.jpg';
const NASA_EARTH_NORMAL_2K =
  'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_normal_2048.jpg';
const NASA_EARTH_SPECULAR_2K =
  'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_specular_2048.jpg';
const NASA_EARTH_LIGHTS_2K =
  'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_lights_2048.png';
const NASA_EARTH_CLOUDS_1K =
  'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_clouds_1024.png';

export function latLonToVector3(latDeg: number, lonDeg: number, radius: number): THREE.Vector3 {
  const phi = (90 - latDeg) * (Math.PI / 180);
  const theta = (lonDeg + 180) * (Math.PI / 180);
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

/**
 * Converts NASA ocean specular mask (white = water, black = land) into a PBR roughness map
 * (glossy ocean sun-glint ~0.24, matte continents ~0.90).
 */
function buildRoughnessFromSpecular(
  img: HTMLImageElement,
  w: number,
  h: number,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const spec = d[i] / 255; // 1 = ocean, 0 = land
    const rough = Math.round(230 - spec * 168); // 230 (~0.90) land -> 62 (~0.24) ocean
    d[i] = rough;
    d[i + 1] = rough;
    d[i + 2] = rough;
    d[i + 3] = 255;
  }
  ctx.putImageData(id, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Composites RGBA or grayscale satellite cloud map onto a black canvas so Three.js
 * alphaMap reads crisp cloud opacity consistently for both PNG and JPG sources.
 */
function buildCloudAlphaTexture(
  img: HTMLImageElement,
  w: number,
  h: number,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
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

export function createEarthSystem(
  textureManager: DistanceTextureManager,
  sunDir: THREE.Vector3
): EarthSystem {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  // Earth Surface Material with night-side Black Marble city lights attenuation
  const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS, 96, 64);
  const sunDirUniform = { value: sunDir.clone().normalize() };

  const earthMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ffffff'),
    roughness: 0.9,
    metalness: 0.04,
    normalScale: new THREE.Vector2(0.85, 0.85),
    emissive: new THREE.Color('#ffd38a'),
    emissiveIntensity: 0.0,
  });

  earthMat.onBeforeCompile = (shader) => {
    shader.uniforms.uSunDir = sunDirUniform;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vEarthWorldNormal;`
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
vEarthWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uSunDir;
varying vec3 vEarthWorldNormal;`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
float earthNightMask = smoothstep(0.14, -0.22, dot(normalize(vEarthWorldNormal), normalize(uSunDir)));
totalEmissiveRadiance *= earthNightMask;`
      );
  };
  earthMat.customProgramCacheKey = () => 'earth-day-night-v1';
  disposables.push(earthGeo, earthMat);

  const earthMesh = new THREE.Mesh(earthGeo, earthMat);
  earthMesh.receiveShadow = true;
  group.add(earthMesh);

  // Satellite Global Cloud Layer
  const cloudsGeo = new THREE.SphereGeometry(EARTH_RADIUS + 0.72, 72, 48);
  const cloudsMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.84,
    depthWrite: false,
    roughness: 0.94,
    metalness: 0.0,
  });
  disposables.push(cloudsGeo, cloudsMat);
  const cloudsMesh = new THREE.Mesh(cloudsGeo, cloudsMat);
  group.add(cloudsMesh);

  // Register Earth Surface Multi-Tier LOD Slot
  textureManager.registerSlot(
    {
      id: 'earth-surface',
      thresholds: { high: 48, medium: 84, hysteresis: 6 },
      getDistance: (cameraPos, tempVec) => {
        earthMesh.getWorldPosition(tempVec);
        return Math.max(0, cameraPos.distanceTo(tempVec) - EARTH_RADIUS);
      },
      loadTier: async (tier: TextureLodTier, ctx) => {
        if (tier === 'low') {
          const dayImg = await ctx.loadImage(LOCAL_BLUE_MARBLE_URL);
          const dayTex = ctx.createTextureFromImage(dayImg, {
            targetWidth: 512,
            targetHeight: 256,
            colorSpace: THREE.SRGBColorSpace,
            wrapS: THREE.RepeatWrapping,
          });
          return {
            textures: [dayTex],
            apply: () => {
              earthMat.map = dayTex;
              earthMat.roughnessMap = null;
              earthMat.normalMap = null;
              earthMat.emissiveMap = null;
              earthMat.emissiveIntensity = 0.0;
              earthMat.needsUpdate = true;
            },
          };
        }

        if (tier === 'medium') {
          const [dayImg, specImg] = await Promise.all([
            ctx.loadImage(NASA_EARTH_ATMOS_2K, LOCAL_BLUE_MARBLE_URL),
            ctx.loadImage(NASA_EARTH_SPECULAR_2K).catch(() => null),
          ]);
          const dayTex = ctx.createTextureFromImage(dayImg, {
            targetWidth: 1024,
            targetHeight: 512,
            colorSpace: THREE.SRGBColorSpace,
            wrapS: THREE.RepeatWrapping,
          });
          const textures: THREE.Texture[] = [dayTex];
          const roughTex = specImg
            ? buildRoughnessFromSpecular(specImg, 512, 256, ctx.maxAnisotropy)
            : null;
          if (roughTex) textures.push(roughTex);

          return {
            textures,
            apply: () => {
              earthMat.map = dayTex;
              earthMat.roughnessMap = roughTex;
              earthMat.normalMap = null;
              earthMat.emissiveMap = null;
              earthMat.emissiveIntensity = 0.0;
              earthMat.needsUpdate = true;
            },
          };
        }

        // High LOD: Full 4K NASA Blue Marble + 2K Normal + 2K Specular Roughness + 2K Night Lights
        const [dayImg, normImg, specImg, lightsImg] = await Promise.all([
          ctx.loadImage(NASA_EARTH_DAY_4K, LOCAL_BLUE_MARBLE_URL),
          ctx.loadImage(NASA_EARTH_NORMAL_2K).catch(() => null),
          ctx.loadImage(NASA_EARTH_SPECULAR_2K).catch(() => null),
          ctx.loadImage(NASA_EARTH_LIGHTS_2K).catch(() => null),
        ]);

        const dayTex = ctx.createTextureFromImage(dayImg, {
          colorSpace: THREE.SRGBColorSpace,
          wrapS: THREE.RepeatWrapping,
        });
        const textures: THREE.Texture[] = [dayTex];

        const normTex = normImg
          ? ctx.createTextureFromImage(normImg, {
              colorSpace: THREE.NoColorSpace,
              wrapS: THREE.RepeatWrapping,
            })
          : null;
        if (normTex) textures.push(normTex);

        const roughTex = specImg
          ? buildRoughnessFromSpecular(specImg, 1024, 512, ctx.maxAnisotropy)
          : null;
        if (roughTex) textures.push(roughTex);

        const lightsTex = lightsImg
          ? ctx.createTextureFromImage(lightsImg, {
              targetWidth: 1024,
              targetHeight: 512,
              colorSpace: THREE.SRGBColorSpace,
              wrapS: THREE.RepeatWrapping,
            })
          : null;
        if (lightsTex) textures.push(lightsTex);

        return {
          textures,
          apply: () => {
            earthMat.map = dayTex;
            earthMat.normalMap = normTex;
            earthMat.roughnessMap = roughTex;
            earthMat.emissiveMap = lightsTex;
            earthMat.emissiveIntensity = lightsTex ? 0.9 : 0.0;
            earthMat.needsUpdate = true;
          },
        };
      },
    },
    'high'
  );

  // Register Earth Clouds Multi-Tier LOD Slot
  textureManager.registerSlot(
    {
      id: 'earth-clouds',
      thresholds: { high: 52, medium: 86, hysteresis: 6 },
      getDistance: (cameraPos, tempVec) => {
        cloudsMesh.getWorldPosition(tempVec);
        return Math.max(0, cameraPos.distanceTo(tempVec) - EARTH_RADIUS);
      },
      loadTier: async (tier: TextureLodTier, ctx) => {
        const useHighUrl = tier === 'high' || tier === 'medium';
        const img = await ctx.loadImage(
          useHighUrl ? NASA_EARTH_CLOUDS_1K : LOCAL_CLOUDS_URL,
          LOCAL_CLOUDS_URL
        );
        const w = tier === 'high' ? 1024 : tier === 'medium' ? 512 : 256;
        const h = tier === 'high' ? 512 : tier === 'medium' ? 256 : 128;
        const alphaTex = buildCloudAlphaTexture(img, w, h, ctx.maxAnisotropy);

        return {
          textures: [alphaTex],
          apply: () => {
            cloudsMat.alphaMap = alphaTex;
            cloudsMat.needsUpdate = true;
          },
        };
      },
    },
    'high'
  );

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
