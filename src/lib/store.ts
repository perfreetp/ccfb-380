// 场馆持久化：localStorage 自动保存 + JSON 文件导入导出
import type { ExportFile, FixtureTemplate, Venue } from '../types';
import { uid } from './color';
import { clamp } from '../render/math3d';

const STORAGE_KEY = 'lightprep.venues.v1';

export function loadVenues(): Venue[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as Venue[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveVenues(venues: Venue[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(venues));
  } catch (e) {
    // 配额超限时提示，但不影响当前会话
    console.error('自动保存失败', e);
  }
}

export function exportVenue(venue: Venue): void {
  const payload: ExportFile = {
    app: 'lightprep',
    version: 1,
    exportedAt: Date.now(),
    venue: structuredClone(venue)
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${venue.name.replace(/[\\/:*?"<>|\s]+/g, '_')}.lightprep.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** 导入文件；校验通过返回 Venue，失败抛错给 UI 展示 */
export async function importVenue(file: File): Promise<Venue> {
  const text = await file.text();
  let data: ExportFile;
  try {
    data = JSON.parse(text) as ExportFile;
  } catch {
    throw new Error('文件不是合法 JSON');
  }
  if (data.app !== 'lightprep' || !data.venue || !Array.isArray(data.venue.fixtures)) {
    throw new Error('文件格式不正确，缺少 LightPrep 工程标识');
  }
  // 重新分配 id，避免与本机已有工程冲突
  const v = data.venue;
  const idMap = new Map<string, string>();
  v.id = uid('venue');
  v.name = v.name + '（导入）';
  v.updatedAt = Date.now();
  for (const t of v.templates ?? []) {
    const newId = uid('tpl');
    idMap.set(t.id, newId);
    t.id = newId;
  }
  for (const fx of v.fixtures) {
    const old = fx.id;
    fx.id = uid('fx');
    fx.templateId = idMap.get(fx.templateId) ?? fx.templateId;
    // 同步重写 Cue 里的灯具 id 键
    for (const cue of v.cues ?? []) {
      if (cue.states[old]) {
        cue.states[fx.id] = cue.states[old];
        delete cue.states[old];
      }
    }
  }
  for (const tr of v.trusses ?? []) tr.id = uid('truss');
  for (const b of v.blocks ?? []) b.id = uid('blk');
  for (const c of v.cues ?? []) c.id = uid('cue');
  return v;
}

/* ---------------- 自带测试场馆：12 台灯 + 桁架 + 台阶 + 布景 ---------------- */

function tpl(
  name: string,
  kind: FixtureTemplate['kind'],
  color: string,
  beamAngle: number,
  tilt: number
): FixtureTemplate {
  return {
    id: uid('tpl'),
    name,
    kind,
    pan: 0,
    tilt,
    color,
    intensity: 0.85,
    beamAngle
  };
}

export function createSeedVenue(): Venue {
  const beamTpl = tpl('BWS-380 摇头光束灯', 'beam', '#ffd9a0', 10, -55);
  const washTpl = tpl('WLED-19 染色灯', 'wash', '#4da6ff', 20, -70);

  // 由灯位和地面目标点反解 pan/tilt，保证光斑落在舞台可见区域内
  // 方向约定：pan=0/tilt=0 指向 -Z，tilt 负值向下；dir=(-sin(pan)cos(tilt), sin(tilt), -cos(pan)cos(tilt))
  const aim = (pos: [number, number, number], target: [number, number]): { pan: number; tilt: number } => {
    const dx = target[0] - pos[0];
    const dz = target[1] - pos[2];
    const dy = -pos[1]; // 灯口近似在安装高度，目标 y=0
    const horiz = Math.hypot(dx, dz);
    const pan = (Math.atan2(dx, -dz) * 180) / Math.PI;
    const tilt = (-Math.atan2(-dy, horiz) * 180) / Math.PI;
    return { pan, tilt };
  };

  const fixtures = [];
  // 前排桁架 6 台光束灯，瞄准舞台前区台阶两侧的地面点（z=2..4）
  for (let i = 0; i < 6; i++) {
    const x = -7.5 + i * 3;
    const pos: [number, number, number] = [x, 7.0, -1.5];
    const target: [number, number] = [x * 0.7, 3 + (i % 2) * 1.5];
    fixtures.push({
      id: uid('fx'),
      name: `光束 ${i + 1}`,
      templateId: beamTpl.id,
      kind: 'beam' as const,
      position: pos,
      state: aim(pos, target)
    });
  }
  const washColors = ['#ff4d4d', '#ffb84d', '#fff24d', '#4dff88', '#4da6ff', '#b84dff'];
  // 后排桁架 6 台染色灯：基本垂直向下（光斑最圆最小），落点在舞台中区，留少量 pan 变化
  for (let i = 0; i < 6; i++) {
    const x = -7.5 + i * 3;
    const pos: [number, number, number] = [x, 8.2, -6.5];
    const target: [number, number] = [x * 0.9, -1.5];
    fixtures.push({
      id: uid('fx'),
      name: `染色 ${i + 1}`,
      templateId: washTpl.id,
      kind: 'wash' as const,
      position: pos,
      state: { color: washColors[i], ...aim(pos, target) }
    });
  }

  const venue: Venue = {
    id: uid('venue'),
    name: '测试场馆 · 12 台灯',
    updatedAt: Date.now(),
    width: 24,
    depth: 18,
    haze: 0.55,
    backdropHeight: 9,
    fixtures,
    trusses: [
      { id: uid('truss'), position: [0, 7.2, -1.5], length: 18 },
      { id: uid('truss'), position: [0, 8.4, -6.5], length: 18 }
    ],
    blocks: [
      { id: uid('blk'), position: [0, 0.4, 1.5], size: [16, 0.8, 6], color: '#3a3f4b' },
      { id: uid('blk'), position: [-4, 1.0, -1.5], size: [6, 0.4, 3], color: '#454b59' },
      { id: uid('blk'), position: [4, 1.0, -1.5], size: [6, 0.4, 3], color: '#454b59' }
    ],
    templates: [beamTpl, washTpl],
    cues: []
  };

  // 预置 4 个 Cue，方便直接看时间线效果
  const all = venue.fixtures;
  const snapshot = (): Record<string, Venue['cues'][number]['states'][string]> => {
    const out: Venue['cues'][number]['states'] = {};
    for (const fx of all) {
      const t = venue.templates.find((t) => t.id === fx.templateId)!;
      out[fx.id] = { ...t, ...fx.state };
    }
    return out;
  };
  const base = snapshot();

  const cue1: Venue['cues'][number] = {
    id: uid('cue'), name: '开场 · 全暗待命', fade: 2,
    states: Object.fromEntries(Object.entries(base).map(([id, s]) => [id, { ...s, intensity: 0.05 }]))
  };
  const cue2: Venue['cues'][number] = {
    id: uid('cue'), name: '暖场 · 光束汇聚', fade: 3,
    states: Object.fromEntries(all.filter((f) => f.kind === 'beam').map((f) => {
      const s = { ...base[f.id], intensity: 1, tilt: -78, color: '#ffd9a0' };
      return [f.id, s];
    }).concat(all.filter((f) => f.kind === 'wash').map((f) => [f.id, { ...base[f.id], intensity: 0.15 }])))
  };
  const cue3: Venue['cues'][number] = {
    id: uid('cue'), name: '副歌 · 六色染色', fade: 2.5,
    states: Object.fromEntries(all.map((f) => {
      // 灯位越靠边摆角越大，但收敛在 ±16° 内，保证光斑落在舞台地面上
      const s = {
        ...base[f.id],
        intensity: 1,
        pan: clamp(f.position[0] * -0.9, -16, 16),
        tilt: -58,
        beamAngle: f.kind === 'wash' ? 24 : 12
      };
      return [f.id, s];
    }))
  };
  const cue4: Venue['cues'][number] = {
    id: uid('cue'), name: '收尾 · 蓝光收束', fade: 4,
    states: Object.fromEntries(all.map((f) => [f.id, { ...base[f.id], intensity: 0.6, color: '#3377ff', pan: 0, tilt: -82, beamAngle: 10 }]))
  };
  venue.cues = [cue1, cue2, cue3, cue4];
  return venue;
}
