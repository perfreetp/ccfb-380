// Cue 播放器：rAF 时间戳驱动，角度走最短路径，缓动保证摇头灯平滑无抖动
import type { Cue, FixtureState, Venue } from '../types';
import { initialStates } from './state';
import { clamp, lerp, lerpAngle } from '../render/math3d';

const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export class CuePlayer {
  private venue: Venue;
  /** 当前每台灯的实际状态（每帧推进，渲染直接读它） */
  states: Record<string, FixtureState>;
  playing = false;
  /** 当前播放到的 Cue 序号（-1 表示尚未触发任何 Cue） */
  activeIndex = -1;
  /** 当前渐变进度 0..1，UI 时间线用 */
  progress = 0;

  private from: Record<string, FixtureState> = {};
  private to: Record<string, FixtureState> = {};
  private elapsed = 0;
  private duration = 1;
  private onTick?: () => void;

  constructor(venue: Venue, onTick?: () => void) {
    this.venue = venue;
    this.states = initialStates(venue);
    this.onTick = onTick;
  }

  /** 切换工程后重新同步：保留同 id 灯具的状态，补齐新增、移除删除 */
  resync(venue: Venue): void {
    this.venue = venue;
    const fresh = initialStates(venue);
    const merged: Record<string, FixtureState> = {};
    for (const id of Object.keys(fresh)) merged[id] = this.states[id] ?? fresh[id];
    this.states = merged;
    if (!this.playing) this.activeIndex = -1;
  }

  /** 立即跳到某个 Cue 的目标状态（时间线点击/编辑时用） */
  jumpTo(index: number): void {
    const cue = this.venue.cues[index];
    if (!cue) return;
    this.activeIndex = index;
    for (const [id, target] of Object.entries(cue.states)) {
      if (this.states[id]) this.states[id] = { ...target };
    }
    this.playing = false;
    this.progress = 1;
    this.onTick?.();
  }

  /** 播放某个 Cue（从当前状态渐变过去） */
  play(index: number): void {
    const cue = this.venue.cues[index];
    if (!cue) return;
    this.activeIndex = index;
    this.from = {};
    this.to = {};
    for (const [id, target] of Object.entries(cue.states)) {
      const cur = this.states[id];
      if (!cur) continue;
      this.from[id] = { ...cur };
      this.to[id] = { ...target };
    }
    this.duration = Math.max(0.05, cue.fade);
    this.elapsed = 0;
    this.playing = true;
    this.progress = 0;
    this.onTick?.();
  }

  pause(): void {
    this.playing = false;
    this.onTick?.();
  }

  togglePlay(): void {
    if (this.playing) {
      this.pause();
    } else if (this.activeIndex >= 0) {
      // 暂停后继续：重建 from/to，从当前进度剩余时间接着走
      const cue = this.venue.cues[this.activeIndex];
      if (!cue) return;
      this.play(this.activeIndex);
    } else if (this.venue.cues.length > 0) {
      this.play(0);
    }
  }

  stop(): void {
    this.playing = false;
    this.activeIndex = -1;
    this.progress = 0;
    this.onTick?.();
  }

  /** 每帧调用，dt 秒；内部用缓动 + 最短角度插值，输出连续状态 */
  update(dt: number): void {
    if (!this.playing) return;
    this.elapsed += dt;
    const raw = clamp(this.elapsed / this.duration, 0, 1);
    this.progress = raw;
    const k = easeInOutCubic(raw);
    for (const id of Object.keys(this.to)) {
      const a = this.from[id];
      const b = this.to[id];
      const s = this.states[id];
      if (!a || !b || !s) continue;
      s.pan = lerpAngle(a.pan, b.pan, k);
      s.tilt = lerpAngle(a.tilt, b.tilt, k);
      s.intensity = lerp(a.intensity, b.intensity, k);
      s.beamAngle = lerp(a.beamAngle, b.beamAngle, k);
      // 颜色在线性空间插值更自然，但状态里存 hex，直接对 RGB 数值过渡
      s.color = lerpHexColor(a.color, b.color, k);
    }
    this.onTick?.();
    if (raw >= 1) {
      this.playing = false;
      this.progress = 1;
    }
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) =>
    Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** sRGB 数值通道插值（Cue 过渡中的颜色渐变） */
export function lerpHexColor(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex(
    ca[0] + (cb[0] - ca[0]) * t,
    ca[1] + (cb[1] - ca[1]) * t,
    ca[2] + (cb[2] - ca[2]) * t
  );
}
