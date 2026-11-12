// 全部 GLSL ES 3.00 着色器。颜色在整个场景阶段保持线性 HDR，
// 直到后处理阶段才做 ACES 色调映射转回 sRGB。

const COMMON_HEADER = `#version 300 es
precision highp float;
`;

/* ---------------- 普通不透明物体（地面 / 台阶 / 布景 / 灯具外壳） ---------------- */

export const BASIC_VS = COMMON_HEADER + `
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUV;
uniform mat4 uMVP;
uniform mat4 uModel;
out vec3 vNormal;
out vec2 vUV;
void main() {
  gl_Position = uMVP * vec4(aPos, 1.0);
  vNormal = mat3(uModel) * aNormal;
  vUV = aUV;
}`;

export const BASIC_FS = COMMON_HEADER + `
in vec3 vNormal;
in vec2 vUV;
uniform vec3 uColor;        // 线性 sRGB 基色
uniform float uEmissive;    // 自发光系数（灯具发光面用）
out vec4 frag;
void main() {
  vec3 n = normalize(vNormal);
  // 固定三点布光，保证不透明物体有基本体积感
  vec3 L1 = normalize(vec3(0.4, 0.9, 0.3));
  vec3 L2 = normalize(vec3(-0.5, 0.3, -0.4));
  float diff = max(dot(n, L1), 0.0) * 0.75 + max(dot(n, L2), 0.0) * 0.25;
  float amb = 0.22;
  vec3 col = uColor * (amb + diff) + uColor * uEmissive * 1.6;
  frag = vec4(col, 1.0);
}`;

/* ---------------- 网格地面（吸附参考线） ---------------- */

export const GRID_VS = COMMON_HEADER + `
layout(location = 0) in vec3 aPos;
uniform mat4 uMVP;
out vec3 vWorld;
void main() {
  gl_Position = uMVP * vec4(aPos, 1.0);
  vWorld = aPos;
}`;

export const GRID_FS = COMMON_HEADER + `
in vec3 vWorld;
uniform vec3 uColor;
uniform float uSpacing;
out vec4 frag;
void main() {
  vec2 g = abs(fract(vWorld.xz / uSpacing - 0.5) - 0.5) / fwidth(vWorld.xz / uSpacing);
  float line = min(g.x, g.y);
  float a = 1.0 - min(line, 1.0);
  // 每 5 格一条主线
  vec2 g5 = abs(fract(vWorld.xz / (uSpacing * 5.0) - 0.5) - 0.5) / fwidth(vWorld.xz / (uSpacing * 5.0));
  float a5 = 1.0 - min(min(g5.x, g5.y), 1.0);
  frag = vec4(uColor, clamp(a * 0.35 + a5 * 0.75, 0.0, 1.0) * 0.5);
}`;

/* ---------------- 体积光束（开口圆锥，双面，加色混合） ---------------- */

export const BEAM_VS = COMMON_HEADER + `
layout(location = 0) in vec3 aPos;
uniform mat4 uMVP;
uniform mat4 uModel;
out vec3 vLocal;
out vec3 vWorld;
void main() {
  vLocal = aPos;
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorld = w.xyz;
  gl_Position = uMVP * w;
}`;

export const BEAM_FS = COMMON_HEADER + `
in vec3 vLocal;
in vec3 vWorld;
uniform vec3 uColor;      // 线性灯光颜色
uniform float uIntensity; // 亮度 0..1
uniform float uHaze;      // 烟雾浓度 0..1
uniform vec3 uCamPos;
out vec4 frag;
void main() {
  // 径向：中心最浓，边缘快速衰减 -> 光束有芯
  float radial = clamp(1.0 - length(vLocal.xz), 0.0, 1.0);
  float core = pow(radial, 2.2);
  // 轴向：从灯口到远端略微变淡
  float axial = 0.55 + 0.45 * (1.0 - clamp(-vLocal.y, 0.0, 1.0));
  // Fresnel：斜视时锥壁更明显，正视时看穿 -> 体积感
  vec3 V = normalize(uCamPos - vWorld);
  vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  float fres = pow(1.0 - abs(dot(N, V)), 1.6);
  float alpha = (core * 0.7 + fres * 0.9) * axial * uHaze * uIntensity;
  alpha = clamp(alpha, 0.0, 0.9);
  // HDR 线性加色：多束光重叠只在该波长上累加，交给 ACES 压缩，不会爆白
  vec3 col = uColor * (0.45 + core) * uIntensity * (0.35 + uHaze * 1.6);
  frag = vec4(col, alpha);
}`;

/* ---------------- 光斑（地面/布景上的径向衰减贴片，加色混合） ---------------- */

export const POOL_VS = COMMON_HEADER + `
layout(location = 0) in vec3 aPos;
layout(location = 2) in vec2 aUV;
uniform mat4 uMVP;
uniform mat4 uModel;
out vec2 vUV;
out vec3 vWorld;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorld = w.xyz;
  vUV = aUV;
  gl_Position = uMVP * w;
}`;

export const POOL_FS = COMMON_HEADER + `
in vec2 vUV;
uniform vec3 uColor;
uniform float uIntensity;
uniform float uSoft;   // 边缘柔化
out vec4 frag;
void main() {
  float d = length(vUV - 0.5) * 2.0;          // 0 中心 -> 1 边缘
  // 中心亮、向边缘平滑衰减的光斑；gaussian 决定芯的集中度，edge 硬截止防止外溢
  float core = exp(-d * d * 5.5);
  float edge = 1.0 - smoothstep(1.0 - uSoft, 1.0, d);
  float fall = core * edge;
  // alpha 与颜色同曲线，杜绝"颜色没了透明度还在"的均匀罩层
  float a = clamp(pow(fall, 1.1) * uIntensity, 0.0, 0.9);
  // HDR 线性加色：重叠处在线性空间累加，由 ACES 收敛高光
  frag = vec4(uColor * fall * uIntensity * 1.35, a);
}`;

/* ---------------- 后处理：HDR -> ACES -> sRGB ---------------- */

export const POST_VS = COMMON_HEADER + `
layout(location = 0) in vec3 aPos;
out vec2 vUV;
void main() {
  vUV = aPos.xy * 0.5 + 0.5;
  gl_Position = vec4(aPos.xy, 0.0, 1.0);
}`;

export const POST_FS = COMMON_HEADER + `
in vec2 vUV;
uniform sampler2D uScene;
uniform float uExposure;
out vec4 frag;

vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
void main() {
  vec3 hdr = texture(uScene, vUV).rgb * uExposure;
  vec3 mapped = aces(hdr);
  // 线性 -> sRGB
  vec3 srgb = pow(mapped, vec3(1.0 / 2.2));
  frag = vec4(srgb, 1.0);
}`;

/* ---------------- 纯颜色线条（桁架 / 选中框） ---------------- */

export const LINE_VS = COMMON_HEADER + `
layout(location = 0) in vec3 aPos;
uniform mat4 uMVP;
void main() {
  gl_Position = uMVP * vec4(aPos, 1.0);
}`;

export const LINE_FS = COMMON_HEADER + `
uniform vec3 uColor;
out vec4 frag;
void main() { frag = vec4(uColor, 1.0); }`;
