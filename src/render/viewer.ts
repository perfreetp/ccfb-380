// Viewer：把 Renderer、相机交互、渲染循环和 FPS 统计组装成可挂载的视图组件
import type { FixtureState, Venue } from '../types';
import { Renderer } from './renderer';
import type { PickedObject } from './renderer';
import type { Vec3 } from './math3d';

export interface ViewerCallbacks {
  onPick?: (obj: PickedObject | null) => void;
  /** 拖拽移动物体时持续回调（已吸附网格的世界坐标） */
  onDragMove?: (pos: Vec3) => void;
  onDragEnd?: () => void;
}

export class Viewer {
  readonly renderer: Renderer;
  private raf = 0;
  private lastT = 0;
  private frames = 0;
  private fpsAccum = 0;
  private disposed = false;
  private drag: {
    mode: 'orbit' | 'pan' | 'object';
    lastX: number;
    lastY: number;
  } | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private getVenue: () => Venue,
    private getStates: () => Record<string, FixtureState>,
    private getSelected: () => string | null,
    private getGridOn: () => boolean,
    private update: (dt: number) => void,
    private cb: ViewerCallbacks = {},
    private fpsEl?: HTMLElement
  ) {
    this.renderer = new Renderer(canvas);
    this.bindInput();
    this.lastT = performance.now();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  private bindInput(): void {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      if (e.button === 2 || e.shiftKey) {
        this.drag = { mode: 'pan', lastX: e.clientX, lastY: e.clientY };
        return;
      }
      const ndc = this.ndc(e);
      const hit = this.renderer.pick(this.getVenue(), ndc[0], ndc[1]);
      this.cb.onPick?.(hit);
      if (hit && (hit.type === 'fixture' || hit.type === 'truss' || hit.type === 'block')) {
        this.drag = { mode: 'object', lastX: e.clientX, lastY: e.clientY };
      } else {
        this.drag = { mode: 'orbit', lastX: e.clientX, lastY: e.clientY };
      }
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.lastX;
      const dy = e.clientY - this.drag.lastY;
      this.drag.lastX = e.clientX;
      this.drag.lastY = e.clientY;
      if (this.drag.mode === 'orbit') {
        this.renderer.camera.rotate(dx, dy);
      } else if (this.drag.mode === 'pan') {
        this.renderer.camera.pan(dx, dy);
      } else {
        const g = this.renderer.pickGround(...this.ndc(e));
        if (g) this.cb.onDragMove?.(g);
      }
    });
    const end = () => {
      if (this.drag?.mode === 'object') this.cb.onDragEnd?.();
      this.drag = null;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.renderer.camera.zoom(e.deltaY);
    }, { passive: false });
  }

  private ndc(e: MouseEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1
    ];
  }

  private loop(now: number): void {
    if (this.disposed) return;
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    this.update(dt);
    this.renderer.render(this.getVenue(), this.getStates(), this.getSelected(), this.getGridOn());

    // FPS：每 0.5 秒结算一次，显示瞬时帧率
    this.frames++;
    this.fpsAccum += dt;
    if (this.fpsAccum >= 0.5) {
      this.renderer.fps = Math.round(this.frames / this.fpsAccum);
      this.frames = 0;
      this.fpsAccum = 0;
      if (this.fpsEl) {
        const fps = this.renderer.fps;
        this.fpsEl.textContent = `${fps} FPS`;
        this.fpsEl.className = 'fps-badge' + (fps >= 30 ? ' ok' : ' low');
      }
    }
    this.raf = requestAnimationFrame(this.loop);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    const ext = this.renderer.gl.getExtension('WEBGL_lose_context');
    ext?.loseContext();
  }
}
