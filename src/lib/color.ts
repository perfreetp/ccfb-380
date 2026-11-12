// 颜色与 id 工具

let counter = 0;

/** 进程内唯一 id（时间戳 + 计数 + 随机后缀，足够工程文件使用） */
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

function srgbChannelToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** sRGB 十六进制颜色 -> 线性 RGB（0..1），渲染管线全程使用线性值 */
export function hexToLinear(hex: string): [number, number, number] {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return [1, 1, 1];
  const n = parseInt(m[1], 16);
  return [
    srgbChannelToLinear(((n >> 16) & 255) / 255),
    srgbChannelToLinear(((n >> 8) & 255) / 255),
    srgbChannelToLinear((n & 255) / 255)
  ];
}

export function isValidHex(hex: string): boolean {
  return /^#?[0-9a-fA-F]{6}$/.test(hex.trim());
}

export function normalizeHex(hex: string): string {
  const h = hex.trim().replace(/^#/, '');
  return '#' + h.toLowerCase();
}
