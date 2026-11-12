// 轨道相机：左键旋转、右键平移、滚轮缩放；提供屏幕坐标 -> 世界射线
import { Mat4, Vec3, mat4LookAt, mat4Multiply, mat4Perspective, normalize, sub, v3 } from './math3d';

export class OrbitCamera {
  target: Vec3 = [0, 1.5, 0];
  yaw = 0.7;
  pitch = 0.42;
  distance = 26;
  fov = 50;
  aspect = 16 / 9;
  private readonly near = 0.1;
  private readonly far = 200;

  eye(): Vec3 {
    const cp = Math.cos(this.pitch);
    return [
      this.target[0] + this.distance * cp * Math.sin(this.yaw),
      this.target[1] + this.distance * Math.sin(this.pitch),
      this.target[2] + this.distance * cp * Math.cos(this.yaw)
    ];
  }

  view(): Mat4 {
    return mat4LookAt(this.eye(), this.target, [0, 1, 0]);
  }

  projection(): Mat4 {
    return mat4Perspective((this.fov * Math.PI) / 180, this.aspect, this.near, this.far);
  }

  viewProj(): Mat4 {
    return mat4Multiply(this.projection(), this.view());
  }

  rotate(dx: number, dy: number): void {
    this.yaw -= dx * 0.005;
    this.pitch = Math.min(1.45, Math.max(-0.1, this.pitch + dy * 0.005));
  }

  zoom(delta: number): void {
    this.distance = Math.min(80, Math.max(4, this.distance * (1 + delta * 0.0012)));
  }

  /** 屏幕空间平移（dx/dy 为像素差），沿相机右/上方向移动目标点 */
  pan(dx: number, dy: number): void {
    const eye = this.eye();
    const fwd = normalize(sub(this.target, eye));
    const right = normalize([fwd[2], 0, -fwd[0]]);
    const up: Vec3 = [
      right[2] * fwd[0] - right[0] * fwd[2],
      right[0] * fwd[2] - right[2] * fwd[0],
      right[1] * fwd[0] - right[0] * fwd[1]
    ];
    const k = this.distance * 0.0016;
    this.target = [
      this.target[0] + (-dx * right[0] + dy * up[0]) * k,
      this.target[1] + (-dx * right[1] + dy * up[1]) * k,
      this.target[2] + (-dx * right[2] + dy * up[2]) * k
    ];
  }

  /** NDC 坐标 -> 世界空间拾取射线 */
  ray(ndcX: number, ndcY: number): { origin: Vec3; dir: Vec3 } {
    const inv = invertMat4(this.viewProj());
    const near4 = transformVec4(inv, [ndcX, ndcY, -1, 1]);
    const far4 = transformVec4(inv, [ndcX, ndcY, 1, 1]);
    const near: Vec3 = [near4[0] / near4[3], near4[1] / near4[3], near4[2] / near4[3]];
    const far: Vec3 = [far4[0] / far4[3], far4[1] / far4[3], far4[2] / far4[3]];
    return { origin: this.eye(), dir: normalize(sub(far, near)) };
  }
}

function invertMat4(m: Mat4): Mat4 {
  const o = new Float32Array(16);
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return mat4IdentityLocal();
  det = 1 / det;
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  o[7] = (a20 * b02 - a22 * b01 + a23 * b01) * det;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  o[11] = (a21 * b00 - a20 * b04 - a23 * b00) * det;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return o;
}

function mat4IdentityLocal(): Mat4 {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

function transformVec4(m: Mat4, v: [number, number, number, number]): [number, number, number, number] {
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * v[3],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * v[3],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * v[3],
    m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15] * v[3]
  ];
}
