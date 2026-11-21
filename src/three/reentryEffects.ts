import * as THREE from 'three';

function createGlowSpriteTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.28, 'rgba(255, 210, 120, 0.85)');
  grad.addColorStop(0.65, 'rgba(249, 115, 22, 0.35)');
  grad.addColorStop(1, 'rgba(239, 68, 68, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface ReentrySystem {
  group: THREE.Group;
  update: (delta: number, intensity: number, breakupProgress: number) => void;
  dispose: () => void;
}

export function createReentrySystem(): ReentrySystem {
  const group = new THREE.Group();
  const spriteTex = createGlowSpriteTexture();

  // 1. Plasma bow-shock cone around leading face (+Z direction of travel)
  const shockGeo = new THREE.SphereGeometry(7.2, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const shockMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uIntensity;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float flicker = 0.82 + 0.18 * sin(uTime * 28.0 + vUv.x * 18.0) * cos(uTime * 19.0 + vUv.y * 14.0);
        float rim = 1.0 - abs(dot(normalize(vNormal), normalize(vView)));
        float core = pow(1.0 - vUv.y, 1.8);
        vec3 hot = mix(vec3(1.0, 0.38, 0.08), vec3(1.0, 0.92, 0.72), core * 0.75);
        float alpha = clamp((core * 0.65 + rim * 0.45) * uIntensity * flicker, 0.0, 0.92);
        gl_FragColor = vec4(hot, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const shockMesh = new THREE.Mesh(shockGeo, shockMat);
  shockMesh.rotation.x = Math.PI / 2;
  shockMesh.position.set(0, -1.2, 3.8);
  shockMesh.scale.set(1.5, 1.0, 1.0);
  group.add(shockMesh);

  // 2. Incandescent plasma & burning debris particle wake (800 particles)
  const count = 800;
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const ages = new Float32Array(count);
  const lifetimes = new Float32Array(count);
  const colors = new Float32Array(count * 3);

  const resetParticle = (i: number, spread: number) => {
    positions[i * 3] = (Math.random() - 0.5) * (9.0 + spread * 10);
    positions[i * 3 + 1] = (Math.random() - 0.5) * (3.5 + spread * 4);
    positions[i * 3 + 2] = 4.0 + (Math.random() - 0.5) * 6.0;

    velocities[i * 3] = (Math.random() - 0.5) * (2.5 + spread * 5);
    velocities[i * 3 + 1] = 3.2 + Math.random() * 5.0; // streaks upward/aft away from Earth
    velocities[i * 3 + 2] = -(12.0 + Math.random() * 16.0); // wake trailing behind

    ages[i] = Math.random() * 0.8;
    lifetimes[i] = 0.5 + Math.random() * 0.9;

    // Hot white-gold -> plasma orange -> crimson embers
    const heat = Math.random();
    if (heat > 0.7) {
      colors[i * 3] = 1.0;
      colors[i * 3 + 1] = 0.94;
      colors[i * 3 + 2] = 0.78;
    } else if (heat > 0.3) {
      colors[i * 3] = 1.0;
      colors[i * 3 + 1] = 0.52;
      colors[i * 3 + 2] = 0.12;
    } else {
      colors[i * 3] = 0.95;
      colors[i * 3 + 1] = 0.24;
      colors[i * 3 + 2] = 0.08;
    }
  };

  for (let i = 0; i < count; i++) {
    resetParticle(i, 0);
  }

  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const pMat = new THREE.PointsMaterial({
    size: 1.55,
    map: spriteTex,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const particles = new THREE.Points(pGeo, pMat);
  particles.frustumCulled = false;
  group.add(particles);

  let elapsed = 0;

  function update(delta: number, intensity: number, breakupProgress: number): void {
    elapsed += delta;
    if (intensity <= 0.005) {
      group.visible = false;
      return;
    }
    group.visible = true;
    shockMat.uniforms.uTime.value = elapsed;
    shockMat.uniforms.uIntensity.value = intensity;
    pMat.opacity = Math.min(0.95, intensity * 1.1);
    pMat.size = 1.2 + breakupProgress * 1.4;

    const posAttr = pGeo.attributes.position as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;

    for (let i = 0; i < count; i++) {
      ages[i] += delta;
      if (ages[i] >= lifetimes[i]) {
        resetParticle(i, breakupProgress);
      } else {
        arr[i * 3] += velocities[i * 3] * delta;
        arr[i * 3 + 1] += velocities[i * 3 + 1] * delta;
        arr[i * 3 + 2] += velocities[i * 3 + 2] * delta;
      }
    }
    posAttr.needsUpdate = true;
  }

  function dispose(): void {
    shockGeo.dispose();
    shockMat.dispose();
    pGeo.dispose();
    pMat.dispose();
    spriteTex.dispose();
  }

  return { group, update, dispose };
}
