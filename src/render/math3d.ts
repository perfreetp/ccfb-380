// 最小 3D 数学库（列主序 Mat4，与 WebGL 一致），不引入任何依赖

export type Vec3 = [number, number, number];
export type Mat4 = Float32Array;

export const v3 = (x = 0, y = 0, z = 0): Vec3 => [x, y, z];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];

export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);

export const normalize = (a: Vec3): Vec3 => {
  const l = length(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const clamp = (x: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, x));

/** 角度走最短路径插值（处理 359° -> 1° 这类情况，避免反向转一整圈） */
export function lerpAngle(aDeg: number, bDeg: number, t: number): number {
  let d = (bDeg - aDeg) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return aDeg + d * t;
}

export const deg2rad = (d: number): number => (d * Math.PI) / 180;

export function mat4Identity(): Mat4 {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

export function mat4Perspective(fovyRad: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovyRad / 2);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

export function mat4LookAt(eye: Vec3, center: Vec3, up: Vec3): Mat4 {
  const z = normalize(sub(eye, center));
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  const m = mat4Identity();
  m[0] = x[0]; m[4] = x[1]; m[8] = x[2];
  m[1] = y[0]; m[5] = y[1]; m[9] = y[2];
  m[2] = z[0]; m[6] = z[1]; m[10] = z[2];
  m[12] = -dot(x, eye);
  m[13] = -dot(y, eye);
  m[14] = -dot(z, eye);
  return m;
}

export function mat4Translate(x: number, y: number, z: number): Mat4 {
  const m = mat4Identity();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

export function mat4Scale(x: number, y: number, z: number): Mat4 {
  const m = mat4Identity();
  m[0] = x;
  m[5] = y;
  m[10] = z;
  return m;
}

/** 绕 Y 轴旋转 */
export function mat4RotY(rad: number): Mat4 {
  const c = Math.cos(rad), s = Math.sin(rad);
  const m = mat4Identity();
  m[0] = c; m[8] = s;
  m[2] = -s; m[10] = c;
  return m;
}

/** 绕 X 轴旋转 */
export function mat4RotX(rad: number): Mat4 {
  const c = Math.cos(rad), s = Math.sin(rad);
  const m = mat4Identity();
  m[5] = c; m[10] = c;
  m[6] = -s; m[9] = s;
  return m;
}

export function mat4Compose(pos: Vec3, rotY: number, rotX: number, scl: Vec3): Mat4 {
  return mat4Multiply(
    mat4Translate(pos[0], pos[1], pos[2]),
    mat4Multiply(mat4RotY(rotY), mat4Multiply(mat4RotX(rotX), mat4Scale(scl[0], scl[1], scl[2])))
  );
}

/** 射线（世界空间） */
export interface Ray {
  origin: Vec3;
  dir: Vec3;
}

/** 射线与轴对齐包围盒求交，返回最近正距离或 null */
export function rayAABB(ray: Ray, min: Vec3, max: Vec3): number | null {
  let tmin = 0;
  let tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    const inv = 1 / ray.dir[i];
    let t1 = (min[i] - ray.origin[i]) * inv;
    let t2 = (max[i] - ray.origin[i]) * inv;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmax < tmin) return null;
  }
  return tmin >= 0 ? tmin : tmax >= 0 ? 0 : null;
}

/** 射线与 y=常数 水平面求交，返回交点或 null */
export function rayPlaneY(ray: Ray, y: number): Vec3 | null {
  if (Math.abs(ray.dir[1]) < 1e-6) return null;
  const t = (y - ray.origin[1]) / ray.dir[1];
  if (t < 0) return null;
  return add(ray.origin, scale(ray.dir, t));
}

/** 射线与 z=常数 竖直平面（后布景）求交 */
export function rayPlaneZ(ray: Ray, z: number): Vec3 | null {
  if (Math.abs(ray.dir[2]) < 1e-6) return null;
  const t = (z - ray.origin[2]) / ray.dir[2];
  if (t < 0) return null;
  return add(ray.origin, scale(ray.dir, t));
}
