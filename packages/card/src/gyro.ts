import { clamp } from './util';

type OrientationCtor = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };

const FULL_TILT_DEG = 25;
const ALPHA = 0.15;

/**
 * Device-orientation tilt, relative to the pose when it started (wherever the phone
 * is held counts as neutral), low-pass filtered and normalized to −1…1 at ±25°.
 * enable() must be called from a user gesture on iOS Safari.
 */
export class Gyro {
  private base: { b: number; g: number } | null = null;
  private x = 0;
  private y = 0;
  private on = false;

  constructor(private readonly onTilt: (x: number, y: number) => void) {}

  get active(): boolean {
    return this.on;
  }

  async enable(): Promise<boolean> {
    if (this.on) return true;
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return false;
    const Ctor = DeviceOrientationEvent as OrientationCtor;
    try {
      if (typeof Ctor.requestPermission === 'function') {
        const r = await Ctor.requestPermission();
        if (r !== 'granted') return false;
      }
    } catch {
      return false;
    }
    this.base = null;
    window.addEventListener('deviceorientation', this.handle);
    this.on = true;
    return true;
  }

  disable(): void {
    if (!this.on) return;
    window.removeEventListener('deviceorientation', this.handle);
    this.on = false;
  }

  /** Makes the current pose neutral again. */
  recentre(): void {
    this.base = null;
  }

  private handle = (e: DeviceOrientationEvent): void => {
    if (e.beta == null || e.gamma == null) return;
    let beta = e.beta;
    let gamma = e.gamma;
    const angle = typeof screen !== 'undefined' && screen.orientation ? screen.orientation.angle : 0;
    if (angle === 90) [beta, gamma] = [-gamma, beta];
    else if (angle === 270 || angle === -90) [beta, gamma] = [gamma, -beta];
    if (!this.base) this.base = { b: beta, g: gamma };
    const tx = clamp((gamma - this.base.g) / FULL_TILT_DEG);
    const ty = clamp((beta - this.base.b) / FULL_TILT_DEG);
    this.x += (tx - this.x) * ALPHA;
    this.y += (ty - this.y) * ALPHA;
    this.onTilt(this.x, this.y);
  };
}
