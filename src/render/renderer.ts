// WebGL2 场景渲染器：HDR 浮点管线 + 不透明场景 + 透明光束/光斑 + ACES 后处理
import type { Fixture, FixtureState, StageBlock, Truss, Venue } from '../types';
import { createGL, createProgram, createVBO, drawVBO, Program, supportsHDR, VBO } from './gl';
import { OrbitCamera } from './camera';
import {
  Mat4, Ray, Vec3, clamp, deg2rad, mat4Compose, mat4Multiply,
  mat4Scale, mat4Translate, normalize, rayAABB, rayPlaneY, rayPlaneZ, sub, v3
} from './math3d';
import { hexToLinear } from '../lib/color';
import {
  BASIC_FS, BASIC_VS, BEAM_FS, BEAM_VS, GRID_FS, GRID_VS, LINE_FS, LINE_VS,
  POOL_FS, POOL_VS, POST_FS, POST_VS
} from './shaders';
import {
  boxLinesGeo, coneGeo, cubeGeo, cylinderGeo, fullscreenGeo, groundGeo, planeGeo, trussLinesGeo
} from './geometry';
import { lampHeadPosition } from '../lib/state';

export interface PickedObject {
  type: 'fixture' | 'truss' | 'block';
  id: string;
}

interface BeamJob {
  origin: Vec3;
  dir: Vec3;
  length: number;
  radius: number;
  color: [number, number, number];
  intensity: number;
}

interface PoolJob {
  center: Vec3;
  radius: number;
  color: [number, number, number];
  intensity: number;
  onBackdrop: boolean;
  soft: number;
}

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  readonly camera = new OrbitCamera();
  fps = 0;

  private hdr: boolean;
  private fbo!: WebGLFramebuffer;
  private fboTex!: WebGLTexture;
  private depthRb!: WebGLRenderbuffer;
  private bufW = 0;
  private bufH = 0;

  private pBasic!: Program;
  private pGrid!: Program;
  private pBeam!: Program;
  private pPool!: Program;
  private pPost!: Program;
  private pLine!: Program;

  private vCube!: VBO;
  private vGround!: VBO;
  private vPlane!: VBO;
  private vCone!: VBO;
  private vCylinder!: VBO;
  private vFull!: VBO;
  private vBoxLines!: VBO;
  private trussCache = new Map<number, VBO>();

  constructor(private canvas: HTMLCanvasElement) {
    this.gl = createGL(canvas);
    this.hdr = supportsHDR(this.gl);
    this.initPrograms();
    this.initGeometry();
    this.resize();
  }

  private initPrograms(): void {
    const gl = this.gl;
    this.pBasic = createProgram(gl, BASIC_VS, BASIC_FS, ['uMVP', 'uModel', 'uColor', 'uEmissive']);
    this.pGrid = createProgram(gl, GRID_VS, GRID_FS, ['uMVP', 'uColor', 'uSpacing']);
    this.pBeam = createProgram(gl, BEAM_VS, BEAM_FS,
      ['uMVP', 'uModel', 'uColor', 'uIntensity', 'uHaze', 'uCamPos']);
    this.pPool = createProgram(gl, POOL_VS, POOL_FS, ['uMVP', 'uModel', 'uColor', 'uIntensity', 'uSoft']);
    this.pPost = createProgram(gl, POST_VS, POST_FS, ['uScene', 'uExposure']);
    this.pLine = createProgram(gl, LINE_VS, LINE_FS, ['uMVP', 'uColor']);
  }

  private initGeometry(): void {
    const gl = this.gl;
    const layout: Array<[number, number]> = [[0, 3], [1, 3], [2, 2]];
    this.vCube = createVBO(gl, cubeGeo().data, layout, gl.TRIANGLES);
    this.vGround = createVBO(gl, groundGeo().data, layout, gl.TRIANGLES);
    this.vPlane = createVBO(gl, planeGeo().data, layout, gl.TRIANGLES);
    this.vCone = createVBO(gl, coneGeo(24).data, layout, gl.TRIANGLES);
    this.vCylinder = createVBO(gl, cylinderGeo(16).data, layout, gl.TRIANGLES);
    this.vFull = createVBO(gl, fullscreenGeo().data, layout, gl.TRIANGLES);
    this.vBoxLines = createVBO(gl, boxLinesGeo().data, layout, gl.LINES);
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(2, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(2, Math.floor(this.canvas.clientHeight * dpr));
    if (w === this.bufW && h === this.bufH) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.camera.aspect = w / h;
    this.bufW = w;
    this.bufH = h;
    this.buildFBO(w, h);
  }

  private buildFBO(w: number, h: number): void {
    const gl = this.gl;
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    if (this.fboTex) gl.deleteTexture(this.fboTex);
    if (this.depthRb) gl.deleteRenderbuffer(this.depthRb);

    this.fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    this.fboTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
    const internal = this.hdr ? gl.RGBA16F : gl.RGBA8;
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fboTex, 0);

    this.depthRb = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthRb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depthRb);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** NDC 拾取：返回点中的最近物体 */
  pick(venue: Venue, ndcX: number, ndcY: number): PickedObject | null {
    const ray = this.camera.ray(ndcX, ndcY);
    let best: { t: number; obj: PickedObject } | null = null;
    const consider = (t: number | null, obj: PickedObject) => {
      if (t !== null && (!best || t < best.t)) best = { t, obj };
    };
    for (const fx of venue.fixtures) {
      const p = fx.position;
      const t = rayAABB(ray, [p[0] - 0.3, p[1] - 0.55, p[2] - 0.3], [p[0] + 0.3, p[1] + 0.15, p[2] + 0.3]);
      consider(t, { type: 'fixture', id: fx.id });
    }
    for (const tr of venue.trusses) {
      const p = tr.position;
      const t = rayAABB(ray,
        [p[0] - tr.length / 2, p[1] - 0.2, p[2] - 0.2],
        [p[0] + tr.length / 2, p[1] + 0.2, p[2] + 0.2]);
      consider(t, { type: 'truss', id: tr.id });
    }
    for (const b of venue.blocks) {
      const p = b.position, s = b.size;
      const t = rayAABB(ray,
        [p[0] - s[0] / 2, p[1] - s[1] / 2, p[2] - s[2] / 2],
        [p[0] + s[0] / 2, p[1] + s[1] / 2, p[2] + s[2] / 2]);
      consider(t, { type: 'block', id: b.id });
    }
    return best ? (best as { t: number; obj: PickedObject }).obj : null;
  }

  /** 地面（y=0）拾取，返回世界坐标，用于拖拽摆放 */
  pickGround(ndcX: number, ndcY: number): Vec3 | null {
    return rayPlaneY(this.camera.ray(ndcX, ndcY), 0);
  }

  /** 渲染一帧。states 为每台灯当前有效状态（Cue 播放器或手动编辑输出） */
  render(
    venue: Venue,
    states: Record<string, FixtureState>,
    selectedId: string | null,
    showGrid: boolean
  ): void {
    const gl = this.gl;
    this.resize();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.bufW, this.bufH);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);
    gl.clearColor(0.022, 0.025, 0.035, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const vp = this.camera.viewProj();
    this.drawStatic(venue, vp, showGrid);
    this.drawFixtures(venue, states, vp, selectedId);

    const { beams, pools } = this.buildLightJobs(venue, states);
    this.drawBeams(beams, venue.haze, vp);
    this.drawPools(pools, vp);

    // 后处理回默认帧缓冲
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.pPost.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
    gl.uniform1i(this.pPost.uniforms.uScene, 0);
    gl.uniform1f(this.pPost.uniforms.uExposure, this.hdr ? 1.15 : 1.0);
    drawVBO(gl, this.vFull);
  }

  private drawStatic(venue: Venue, vp: Mat4, showGrid: boolean): void {
    const gl = this.gl;
    gl.useProgram(this.pBasic.program);
    const setMVP = (model: Mat4) =>
      gl.uniformMatrix4fv(this.pBasic.uniforms.uMVP, false, mat4Multiply(vp, model));

    // 地面
    const groundModel = mat4Compose([0, -0.01, 0], 0, 0, [venue.width, 1, venue.depth]);
    setMVP(groundModel);
    gl.uniformMatrix4fv(this.pBasic.uniforms.uModel, false, groundModel);
    gl.uniform3fv(this.pBasic.uniforms.uColor, hexToLinear('#10131a'));
    gl.uniform1f(this.pBasic.uniforms.uEmissive, 0);
    drawVBO(gl, this.vGround);

    if (showGrid) {
      gl.useProgram(this.pGrid.program);
      const model = mat4Compose([0, 0.005, 0], 0, 0, [venue.width, 1, venue.depth]);
      gl.uniformMatrix4fv(this.pGrid.uniforms.uMVP, false, mat4Multiply(vp, model));
      gl.uniform3fv(this.pGrid.uniforms.uColor, hexToLinear('#5a7fa8'));
      gl.uniform1f(this.pGrid.uniforms.uSpacing, 1);
      // 网格 fragment 输出的是带 alpha 的线色，必须开 alpha 混合，
      // 否则 alpha 被丢弃、整块地面会被线色不透明铺满
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      drawVBO(gl, this.vGround);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.useProgram(this.pBasic.program);
    }

    // 后布景（舞台后侧竖直平面）
    const backZ = -venue.depth / 2 + 0.5;
    const backdropModel = mat4Compose(
      [0, venue.backdropHeight / 2, backZ], 0, 0,
      [venue.width, venue.backdropHeight, 1]
    );
    gl.uniformMatrix4fv(this.pBasic.uniforms.uMVP, false, mat4Multiply(vp, backdropModel));
    gl.uniformMatrix4fv(this.pBasic.uniforms.uModel, false, backdropModel);
    gl.uniform3fv(this.pBasic.uniforms.uColor, hexToLinear('#171a22'));
    gl.uniform1f(this.pBasic.uniforms.uEmissive, 0);
    drawVBO(gl, this.vPlane);

    // 台阶/平台
    for (const b of venue.blocks) this.drawBlock(b, vp);

    // 桁架（线框）
    gl.useProgram(this.pLine.program);
    gl.uniformMatrix4fv(this.pLine.uniforms.uMVP, false, vp);
    gl.uniform3fv(this.pLine.uniforms.uColor, hexToLinear('#8fa3bd'));
    for (const tr of venue.trusses) {
      const v = this.getTrussVBO(tr.length);
      const model = mat4Translate(tr.position[0], tr.position[1], tr.position[2]);
      gl.uniformMatrix4fv(this.pLine.uniforms.uMVP, false, mat4Multiply(vp, model));
      drawVBO(gl, v);
    }
  }

  private drawBlock(b: StageBlock, vp: Mat4): void {
    const gl = this.gl;
    gl.useProgram(this.pBasic.program);
    const model = mat4Compose(b.position, 0, 0, b.size);
    gl.uniformMatrix4fv(this.pBasic.uniforms.uMVP, false, mat4Multiply(vp, model));
    gl.uniformMatrix4fv(this.pBasic.uniforms.uModel, false, model);
    gl.uniform3fv(this.pBasic.uniforms.uColor, hexToLinear(b.color));
    gl.uniform1f(this.pBasic.uniforms.uEmissive, 0);
    drawVBO(gl, this.vCube);
  }

  private getTrussVBO(length: number): VBO {
    const key = Math.round(length * 10);
    let v = this.trussCache.get(key);
    if (!v) {
      v = createVBO(this.gl, trussLinesGeo(length, Math.max(2, Math.round(length))).data,
        [[0, 3], [1, 3], [2, 2]], this.gl.LINES);
      this.trussCache.set(key, v);
    }
    return v;
  }

  private drawFixtures(
    venue: Venue,
    states: Record<string, FixtureState>,
    vp: Mat4,
    selectedId: string | null
  ): void {
    const gl = this.gl;
    for (const fx of venue.fixtures) {
      const s = states[fx.id];
      const modelBase = mat4Translate(fx.position[0], fx.position[1], fx.position[2]);
      // 底座（小立方体）
      gl.useProgram(this.pBasic.program);
      const base = mat4Multiply(modelBase, mat4Scale(0.28, 0.18, 0.28));
      gl.uniformMatrix4fv(this.pBasic.uniforms.uMVP, false, mat4Multiply(vp, base));
      gl.uniformMatrix4fv(this.pBasic.uniforms.uModel, false, base);
      gl.uniform3fv(this.pBasic.uniforms.uColor, hexToLinear('#2b2f3a'));
      gl.uniform1f(this.pBasic.uniforms.uEmissive, 0);
      drawVBO(gl, this.vCube);

      // 灯头（圆柱）：pan 绕 Y，tilt 绕 X，整体下移让转轴位于底座下沿
      const head = mat4Multiply(
        modelBase,
        mat4Multiply(
          mat4Compose([0, -0.28, 0], deg2rad(s?.pan ?? 0), 0, [1, 1, 1]),
          mat4Compose([0, 0, 0], 0, deg2rad(s?.tilt ?? 0), [0.22, 0.34, 0.22])
        )
      );
      gl.uniformMatrix4fv(this.pBasic.uniforms.uMVP, false, mat4Multiply(vp, head));
      gl.uniformMatrix4fv(this.pBasic.uniforms.uModel, false, head);
      gl.uniform3fv(this.pBasic.uniforms.uColor, hexToLinear('#11141b'));
      gl.uniform1f(this.pBasic.uniforms.uEmissive, 0);
      drawVBO(gl, this.vCylinder);

      // 发光面：灯头下端口小圆片，颜色与灯光一致（亮度直观可见）
      const lensColor = s ? hexToLinear(s.color) : ([1, 1, 1] as [number, number, number]);
      const lens = mat4Multiply(head, mat4Compose([0, -0.52, 0], 0, 0, [0.85, 0.06, 0.85]));
      gl.uniformMatrix4fv(this.pBasic.uniforms.uMVP, false, mat4Multiply(vp, lens));
      gl.uniformMatrix4fv(this.pBasic.uniforms.uModel, false, lens);
      gl.uniform3fv(this.pBasic.uniforms.uColor, lensColor);
      gl.uniform1f(this.pBasic.uniforms.uEmissive, (s?.intensity ?? 0) * 1.2);
      drawVBO(gl, this.vCylinder);

      if (fx.id === selectedId) this.drawSelectionBox(fx, vp);
    }
  }

  private drawSelectionBox(fx: Fixture, vp: Mat4): void {
    const gl = this.gl;
    const p = fx.position;
    gl.useProgram(this.pLine.program);
    const model = mat4Compose([p[0], p[1] - 0.2, p[2]], 0, 0, [0.75, 0.9, 0.75]);
    gl.uniformMatrix4fv(this.pLine.uniforms.uMVP, false, mat4Multiply(vp, model));
    gl.uniform3fv(this.pLine.uniforms.uColor, [0.35, 0.85, 1.0]);
    drawVBO(gl, this.vBoxLines);
  }

  /** 由灯具状态生成光束体和光斑任务，并计算与地面/布景/台阶的交点 */
  private buildLightJobs(
    venue: Venue,
    states: Record<string, FixtureState>
  ): { beams: BeamJob[]; pools: PoolJob[] } {
    const beams: BeamJob[] = [];
    const pools: PoolJob[] = [];
    const backZ = -venue.depth / 2 + 0.5;
    const limit = 30;

    for (const fx of venue.fixtures) {
      const s = states[fx.id];
      if (!s || s.intensity <= 0.01) continue;
      const dir = beamDirection(s.pan, s.tilt);
      const origin = lampHeadPosition(fx);
      const ray: Ray = { origin, dir };
      const color = hexToLinear(s.color);

      // 求最近命中面：地面、布景、台阶顶面
      let t: number | null = null;
      const ground = rayPlaneY(ray, 0);
      if (ground) t = lengthOf(ray, ground);
      const back = rayPlaneZ(ray, backZ);
      if (back) {
        const tb = lengthOf(ray, back);
        if (t === null || tb < t) t = tb;
      }
      let onBackdrop = false;
      for (const b of venue.blocks) {
        const hit = rayAABB(ray,
          [b.position[0] - b.size[0] / 2, b.position[1] - b.size[1] / 2, b.position[2] - b.size[2] / 2],
          [b.position[0] + b.size[0] / 2, b.position[1] + b.size[1] / 2, b.position[2] + b.size[2] / 2]);
        if (hit !== null && (t === null || hit < t)) t = hit;
      }
      const beamLen = clamp(t ?? limit, 0.5, limit);
      const hitPoint: Vec3 = [
        origin[0] + dir[0] * beamLen,
        origin[1] + dir[1] * beamLen,
        origin[2] + dir[2] * beamLen
      ];
      if (back && Math.abs(lengthOf(ray, back) - beamLen) < 0.01) onBackdrop = true;

      const halfAngle = deg2rad(s.beamAngle / 2);
      const radius = Math.tan(halfAngle) * beamLen;
      beams.push({ origin, dir, length: beamLen, radius, color, intensity: s.intensity });

      // 光斑视觉半径小于几何投射圆（真实灯具中心照度高、外圈衰减快），
      // 避免多台灯的外圈在地面无缝拼接成整片色块
      const poolR = radius * 0.62;
      // 染色灯光斑更柔，光束灯光斑边缘更实
      const soft = fx.kind === 'wash' ? 0.8 : 0.4;
      if (onBackdrop) {
        pools.push({
          center: hitPoint, radius: poolR * 1.05, color, intensity: s.intensity,
          onBackdrop: true, soft
        });
      } else {
        const cosI = Math.abs(dir[1]);
        // 斜射时椭圆拉伸，但限制上限，防止低角度光铺出长条
        const stretch = Math.min(1.6, 1 / Math.max(0.55, cosI));
        pools.push({
          center: hitPoint, radius: poolR * stretch, color, intensity: s.intensity,
          onBackdrop: false, soft
        });
      }
    }
    return { beams, pools };
  }

  private drawBeams(beams: BeamJob[], haze: number, vp: Mat4): void {
    const gl = this.gl;
    if (haze <= 0.01 || beams.length === 0) return;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // 加色混合：线性 HDR 累加
    gl.depthMask(false);
    gl.useProgram(this.pBeam.program);
    gl.uniform1f(this.pBeam.uniforms.uHaze, haze);
    const eye = this.camera.eye();
    gl.uniform3fv(this.pBeam.uniforms.uCamPos, eye);

    for (const job of beams) {
      // 圆锥本地 -Y 轴对灯光方向：先绕 Y(pan) 再绕 X(tilt)
      const yaw = Math.atan2(-job.dir[0], -job.dir[2]);
      const pitch = Math.asin(clamp(job.dir[1], -1, 1));
      const model = mat4Compose(
        job.origin, yaw, pitch,
        [job.radius, job.length, job.radius]
      );
      gl.uniformMatrix4fv(this.pBeam.uniforms.uMVP, false, mat4Multiply(vp, model));
      gl.uniformMatrix4fv(this.pBeam.uniforms.uModel, false, model);
      gl.uniform3fv(this.pBeam.uniforms.uColor, job.color);
      gl.uniform1f(this.pBeam.uniforms.uIntensity, job.intensity);
      drawVBO(gl, this.vCone);
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  private drawPools(pools: PoolJob[], vp: Mat4): void {
    const gl = this.gl;
    if (pools.length === 0) return;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    gl.useProgram(this.pPool.program);
    for (const p of pools) {
      // 地面光斑用 XZ 平面（vGround 几何），布景光斑用 XY 平面（vPlane）
      const geo = p.onBackdrop ? this.vPlane : this.vGround;
      const model = mat4Compose(
        [p.center[0], p.onBackdrop ? p.center[1] : p.center[1] + 0.02, p.center[2]],
        0, 0, [p.radius * 2, 1, p.radius * 2]
      );
      gl.uniformMatrix4fv(this.pPool.uniforms.uMVP, false, mat4Multiply(vp, model));
      gl.uniformMatrix4fv(this.pPool.uniforms.uModel, false, model);
      gl.uniform3fv(this.pPool.uniforms.uColor, p.color);
      gl.uniform1f(this.pPool.uniforms.uIntensity, p.intensity);
      gl.uniform1f(this.pPool.uniforms.uSoft, p.soft);
      drawVBO(gl, geo);
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
}

/** pan/tilt（度）-> 世界方向单位向量 */
export function beamDirection(panDeg: number, tiltDeg: number): Vec3 {
  const pan = deg2rad(panDeg);
  const tilt = deg2rad(tiltDeg);
  // tilt=0 水平指向 -Z；tilt=-90 垂直向下
  const ct = Math.cos(tilt);
  return normalize(v3(
    -Math.sin(pan) * ct,
    Math.sin(tilt),
    -Math.cos(pan) * ct
  ));
}

function lengthOf(ray: Ray, point: Vec3): number {
  const d = sub(point, ray.origin);
  return Math.hypot(d[0], d[1], d[2]);
}
