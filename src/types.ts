// 灯光预演工具的领域模型 —— 所有持久化数据都在这里定义

/** 灯具类型：摇头光束 / 染色灯 */
export type FixtureKind = 'beam' | 'wash';

/** 单个灯具的可控状态（也是 Cue 中记录的状态） */
export interface FixtureState {
  /** 水平角（度），0 = -Z 方向（朝向观众），顺时针为正 */
  pan: number;
  /** 俯仰角（度），0 = 水平，-90 = 垂直向下 */
  tilt: number;
  /** 颜色，sRGB 十六进制，如 "#ff8800" */
  color: string;
  /** 亮度 0..1 */
  intensity: number;
  /** 光束角（度），光束灯一般 8~30，染色灯 25~60 */
  beamAngle: number;
}

/** 灯具模板（灯具库中的条目，可被场馆内多个灯具引用） */
export interface FixtureTemplate extends FixtureState {
  id: string;
  name: string;
  kind: FixtureKind;
}

/** 场馆中的灯具实例 */
export interface Fixture {
  id: string;
  name: string;
  templateId: string;
  kind: FixtureKind;
  /** 位置（米），y 通常为安装高度 */
  position: [number, number, number];
  /** 相对模板的状态覆盖；未覆盖的属性取模板值 */
  state: Partial<FixtureState>;
}

/** 桁架（直线段，沿 X 轴） */
export interface Truss {
  id: string;
  position: [number, number, number];
  /** 长度（米），沿 X 轴 */
  length: number;
}

/** 舞台台阶/平台块 */
export interface StageBlock {
  id: string;
  position: [number, number, number];
  size: [number, number, number];
  color: string;
}

/** 一个 Cue：整组灯具的目标状态 + 过渡参数 */
export interface Cue {
  id: string;
  name: string;
  /** 渐变时长（秒） */
  fade: number;
  /** 每个灯具 id 对应的目标状态；未列出的灯具保持不变 */
  states: Record<string, FixtureState>;
}

/** 场馆（一个完整工程文件） */
export interface Venue {
  id: string;
  name: string;
  updatedAt: number;
  /** 场地尺寸（米） */
  width: number;
  depth: number;
  /** 烟雾浓度 0..1，驱动体积光束的可见度 */
  haze: number;
  /** 后布景（背景板）高度，厚度固定，位于舞台后侧 */
  backdropHeight: number;
  fixtures: Fixture[];
  trusses: Truss[];
  blocks: StageBlock[];
  /** 随工程一起保存的灯具模板快照 */
  templates: FixtureTemplate[];
  cues: Cue[];
}

/** 导出文件的封装格式（自包含，可发给同事） */
export interface ExportFile {
  app: 'lightprep';
  version: 1;
  exportedAt: number;
  venue: Venue;
}
