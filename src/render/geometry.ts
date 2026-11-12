// 程序化几何：全部以顶点缓冲直接生成，不加载任何模型资源
// 交错布局统一为 [px, py, pz, nx, ny, nz, u, v]

export interface Geometry {
  data: Float32Array;
}

type Vec3Arr = [number, number, number];

function pushTri(
  out: number[],
  a: number[], b: number[], c: number[],
  uva = [0, 0], uvb = [1, 0], uvc = [0, 1]
): void {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l; ny /= l; nz /= l;
  for (const [p, uv] of [[a, uva], [b, uvb], [c, uvc]] as Array<[number[], number[]]>) {
    out.push(p[0], p[1], p[2], nx, ny, nz, uv[0], uv[1]);
  }
}

/** 单位立方体，中心在原点，边长 1 */
export function cubeGeo(): Geometry {
  const out: number[] = [];
  const q = 0.5;
  const corners: Vec3Arr[] = [
    [-q, -q, -q], [q, -q, -q], [q, q, -q], [-q, q, -q],
    [-q, -q, q], [q, -q, q], [q, q, q], [-q, q, q]
  ];
  const faces: Array<[number, number, number, number]> = [
    [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
    [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]
  ];
  for (const [i0, i1, i2, i3] of faces) {
    pushTri(out, corners[i0], corners[i1], corners[i2]);
    pushTri(out, corners[i0], corners[i2], corners[i3], [0, 0], [0, 1], [1, 1]);
  }
  return { data: Float32Array.from(out) };
}

/** XY 平面单位方块（z=0，法线 +Z） */
export function planeGeo(): Geometry {
  const out: number[] = [];
  const q = 0.5;
  const a: Vec3Arr = [-q, -q, 0], b: Vec3Arr = [q, -q, 0], c: Vec3Arr = [q, q, 0], d: Vec3Arr = [-q, q, 0];
  pushTri(out, a, b, c);
  pushTri(out, a, c, d, [0, 0], [1, 1], [0, 1]);
  return { data: Float32Array.from(out) };
}

/** XZ 平面单位方块（y=0，法线 +Y），用于地面 */
export function groundGeo(): Geometry {
  const out: number[] = [];
  const q = 0.5;
  const a: Vec3Arr = [-q, 0, -q], b: Vec3Arr = [q, 0, -q], c: Vec3Arr = [q, 0, q], d: Vec3Arr = [-q, 0, q];
  pushTri(out, a, b, c);
  pushTri(out, a, c, d, [0, 0], [1, 1], [0, 1]);
  return { data: Float32Array.from(out) };
}

/**
 * 开口圆锥（光束体）：顶点在原点，沿 -Y 方向，高度 1，底面半径 1。
 * 侧壁双面渲染，底面开口。segments 控制圆滑度。
 */
export function coneGeo(segments = 24): Geometry {
  const out: number[] = [];
  const apex: Vec3Arr = [0, 0, 0];
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const p0: Vec3Arr = [Math.cos(a0), -1, Math.sin(a0)];
    const p1: Vec3Arr = [Math.cos(a1), -1, Math.sin(a1)];
    pushTri(out, apex, p0, p1);
  }
  return { data: Float32Array.from(out) };
}

/** 圆柱（灯具头外壳），中心在原点，高 1 沿 Y，半径 1 */
export function cylinderGeo(segments = 16): Geometry {
  const out: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const b0: Vec3Arr = [c0, -0.5, s0], t0: Vec3Arr = [c0, 0.5, s0];
    const b1: Vec3Arr = [c1, -0.5, s1], t1: Vec3Arr = [c1, 0.5, s1];
    // 侧壁
    pushTri(out, b0, b1, t1);
    pushTri(out, b0, t1, t0, [0, 0], [1, 1], [0, 1]);
    // 顶盖
    const tc: Vec3Arr = [0, 0.5, 0];
    pushTri(out, tc, t0, t1);
    // 底盖
    const bc: Vec3Arr = [0, -0.5, 0];
    pushTri(out, bc, b1, b0);
  }
  return { data: Float32Array.from(out) };
}

/** 全屏三角形（后处理用） */
export function fullscreenGeo(): Geometry {
  // 只需要 position，布局仍补 8 分量保持 VAO 一致
  const data = new Float32Array([
    -1, -1, 0, 0, 0, 1, 0, 0,
     3, -1, 0, 0, 0, 1, 2, 0,
    -1,  3, 0, 0, 0, 1, 0, 2
  ]);
  return { data };
}

/** 桁架线框：返回 LINES 模式的顶点（每顶点仍 8 分量，法线/UV 填 0） */
export function trussLinesGeo(length: number, seg: number): Geometry {
  const out: number[] = [];
  const r = 0.15; // 三角桁架外接半径
  const ring = (x: number): Vec3Arr[] => {
    const pts: Vec3Arr[] = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 - Math.PI / 2;
      pts.push([x, Math.cos(a) * r, Math.sin(a) * r]);
    }
    return pts;
  };
  const line = (a: Vec3Arr, b: Vec3Arr) => out.push(...a, 0, 0, 0, 0, 0, ...b, 0, 0, 0, 0, 0);
  let prev = ring(-length / 2);
  for (let i = 1; i <= seg; i++) {
    const cur = ring(-length / 2 + (length * i) / seg);
    for (let k = 0; k < 3; k++) {
      line(prev[k], cur[k]);                       // 纵向弦杆
      line(cur[k], cur[(k + 1) % 3]);              // 三角横档
      line(prev[k], cur[(k + 1) % 3]);             // 斜腹杆
    }
    prev = cur;
  }
  return { data: Float32Array.from(out) };
}

/** 选中高亮框：单位立方体的 12 条边 */
export function boxLinesGeo(): Geometry {
  const q = 0.5;
  const c: Vec3Arr[] = [
    [-q, -q, -q], [q, -q, -q], [q, q, -q], [-q, q, -q],
    [-q, -q, q], [q, -q, q], [q, q, q], [-q, q, q]
  ];
  const edges: Array<[number, number]> = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7]
  ];
  const out: number[] = [];
  for (const [i, j] of edges) out.push(...c[i], 0, 0, 0, 0, 0, ...c[j], 0, 0, 0, 0, 0);
  return { data: Float32Array.from(out) };
}
