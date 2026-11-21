import * as THREE from 'three';

export type TextureLodTier = 'low' | 'medium' | 'high';

export interface TextureLodThresholds {
  /** Upgrade to 'high' when distance < high */
  high: number;
  /** Upgrade to 'medium' when distance < medium (otherwise 'low') */
  medium: number;
  /** Distance buffer before downgrading to prevent boundary thrashing */
  hysteresis?: number;
}

export interface ManagedTextureBundle {
  /** GPU textures created exclusively for this tier (auto-disposed when replaced) */
  textures: THREE.Texture[];
  /** Apply these textures onto target material(s) synchronously */
  apply: () => void;
}

export interface TextureLoadContext {
  maxAnisotropy: number;
  loadImage: (url: string, fallbackUrl?: string) => Promise<HTMLImageElement>;
  createTextureFromImage: (
    img: HTMLImageElement,
    options: CreateTextureOptions
  ) => THREE.Texture;
}

export interface CreateTextureOptions {
  targetWidth?: number;
  targetHeight?: number;
  colorSpace?: THREE.ColorSpace;
  wrapS?: THREE.Wrapping;
  wrapT?: THREE.Wrapping;
  repeatX?: number;
  repeatY?: number;
  flipY?: boolean;
  anisotropy?: number;
}

export interface ManagedTextureSlotConfig {
  id: string;
  thresholds: TextureLodThresholds;
  getDistance: (cameraPos: THREE.Vector3, tempVec: THREE.Vector3) => number;
  loadTier: (
    tier: TextureLodTier,
    ctx: TextureLoadContext
  ) => Promise<ManagedTextureBundle>;
  onTierChanged?: (tier: TextureLodTier) => void;
}

interface InternalSlotState {
  config: ManagedTextureSlotConfig;
  activeTier: TextureLodTier | null;
  pendingTier: TextureLodTier | null;
  requestSerial: number;
  activeTextures: THREE.Texture[];
}

export interface TextureManagerStats {
  activeGpuTextures: number;
  cachedSourceImages: number;
  slotTiers: Record<string, TextureLodTier | 'loading'>;
}

/**
 * Dynamically streams and downsamples/evicts multi-resolution textures based on
 * real-time camera distance to each 3D target (Earth & ISS subsystems).
 */
export class DistanceTextureManager {
  private readonly loadingManager: THREE.LoadingManager;
  private readonly imageLoader: THREE.ImageLoader;
  private readonly maxAnisotropy: number;
  private readonly slots = new Map<string, InternalSlotState>();
  private readonly imageCache = new Map<string, Promise<HTMLImageElement>>();
  private readonly tempVec = new THREE.Vector3();
  private lastCheckTime = -1;
  private readonly checkIntervalSec = 0.16;
  private disposed = false;

  constructor(maxAnisotropy: number) {
    this.maxAnisotropy = Math.max(1, maxAnisotropy);
    this.loadingManager = new THREE.LoadingManager();
    this.imageLoader = new THREE.ImageLoader(this.loadingManager);
    this.imageLoader.setCrossOrigin('anonymous');
  }

  public registerSlot(config: ManagedTextureSlotConfig, initialTier: TextureLodTier = 'low'): void {
    if (this.disposed) return;

    const existing = this.slots.get(config.id);
    if (existing) {
      this.disposeTextures(existing.activeTextures);
    }

    const state: InternalSlotState = {
      config,
      activeTier: null,
      pendingTier: null,
      requestSerial: 0,
      activeTextures: [],
    };
    this.slots.set(config.id, state);
    this.requestTier(state, initialTier);
  }

  /**
   * Evaluates camera distance to each registered target and transitions LOD tiers
   * with hysteresis to avoid boundary thrashing. Throttled to keep frame budget clean.
   */
  public update(cameraPosition: THREE.Vector3, elapsedSec: number, force = false): void {
    if (this.disposed) return;
    if (!force && this.lastCheckTime >= 0 && elapsedSec - this.lastCheckTime < this.checkIntervalSec) {
      return;
    }
    this.lastCheckTime = elapsedSec;

    this.slots.forEach((state) => {
      const dist = state.config.getDistance(cameraPosition, this.tempVec);
      const desiredTier = this.computeDesiredTier(state, dist);
      const effectiveCurrent = state.pendingTier ?? state.activeTier;
      if (desiredTier !== effectiveCurrent) {
        this.requestTier(state, desiredTier);
      }
    });
  }

  public getStats(): TextureManagerStats {
    let activeGpuTextures = 0;
    const slotTiers: Record<string, TextureLodTier | 'loading'> = {};
    this.slots.forEach((slot, id) => {
      activeGpuTextures += slot.activeTextures.length;
      slotTiers[id] = slot.activeTier ?? 'loading';
    });
    return {
      activeGpuTextures,
      cachedSourceImages: this.imageCache.size,
      slotTiers,
    };
  }

  public dispose(): void {
    this.disposed = true;
    this.slots.forEach((slot) => {
      slot.requestSerial += 1;
      this.disposeTextures(slot.activeTextures);
      slot.activeTextures = [];
    });
    this.slots.clear();
    this.imageCache.clear();
  }

  private computeDesiredTier(state: InternalSlotState, distance: number): TextureLodTier {
    const { high, medium, hysteresis = 4.0 } = state.config.thresholds;
    const current = state.activeTier;

    if (current === 'high') {
      if (distance <= high + hysteresis) return 'high';
      if (distance <= medium + hysteresis) return 'medium';
      return 'low';
    }

    if (current === 'medium') {
      if (distance < high) return 'high';
      if (distance <= medium + hysteresis) return 'medium';
      return 'low';
    }

    if (distance < high) return 'high';
    if (distance < medium) return 'medium';
    return 'low';
  }

  private requestTier(state: InternalSlotState, tier: TextureLodTier): void {
    const serial = ++state.requestSerial;
    state.pendingTier = tier;

    const ctx: TextureLoadContext = {
      maxAnisotropy: this.maxAnisotropy,
      loadImage: (url, fallbackUrl) => this.loadImageCached(url, fallbackUrl),
      createTextureFromImage: (img, options) => this.createTextureFromImage(img, options),
    };

    state.config
      .loadTier(tier, ctx)
      .then((bundle) => {
        // Guard against stale async resolutions or manager disposal
        if (this.disposed || state.requestSerial !== serial) {
          this.disposeTextures(bundle.textures);
          return;
        }

        const previousTextures = state.activeTextures;
        bundle.apply();
        state.activeTextures = bundle.textures;
        state.activeTier = tier;
        state.pendingTier = null;

        // Release replaced GPU textures only if not reused in the new bundle
        for (const oldTex of previousTextures) {
          if (!bundle.textures.includes(oldTex)) {
            oldTex.dispose();
          }
        }

        state.config.onTierChanged?.(tier);
      })
      .catch(() => {
        if (state.requestSerial === serial) {
          state.pendingTier = null;
        }
      });
  }

  private loadImageCached(url: string, fallbackUrl?: string): Promise<HTMLImageElement> {
    const cached = this.imageCache.get(url);
    if (cached) return cached;

    const loadPromise = this.fetchImageElement(url).catch((err) => {
      if (fallbackUrl && fallbackUrl !== url) {
        return this.loadImageCached(fallbackUrl);
      }
      throw err;
    });

    this.imageCache.set(url, loadPromise);
    return loadPromise;
  }

  private fetchImageElement(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      this.imageLoader.load(
        url,
        (image) => resolve(image),
        undefined,
        (error) => reject(error)
      );
    });
  }

  private createTextureFromImage(
    img: HTMLImageElement,
    options: CreateTextureOptions
  ): THREE.Texture {
    const srcW = img.naturalWidth || img.width || 1024;
    const srcH = img.naturalHeight || img.height || 1024;
    const targetW = options.targetWidth ? Math.min(srcW, options.targetWidth) : srcW;
    const targetH = options.targetHeight ? Math.min(srcH, options.targetHeight) : srcH;

    let texture: THREE.Texture;
    if (targetW < srcW || targetH < srcH) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, targetW);
      canvas.height = Math.max(1, targetH);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }
      texture = new THREE.CanvasTexture(canvas);
    } else {
      texture = new THREE.Texture(img);
    }

    texture.colorSpace = options.colorSpace ?? THREE.NoColorSpace;
    texture.wrapS = options.wrapS ?? THREE.ClampToEdgeWrapping;
    texture.wrapT = options.wrapT ?? THREE.ClampToEdgeWrapping;
    if (options.repeatX !== undefined || options.repeatY !== undefined) {
      texture.repeat.set(options.repeatX ?? 1, options.repeatY ?? 1);
    }
    if (options.flipY !== undefined) {
      texture.flipY = options.flipY;
    }
    texture.anisotropy = options.anisotropy ?? this.maxAnisotropy;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;

    return texture;
  }

  private disposeTextures(textures: THREE.Texture[]): void {
    for (const tex of textures) {
      tex.dispose();
    }
  }
}
