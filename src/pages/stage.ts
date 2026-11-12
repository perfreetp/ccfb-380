// 舞台编辑页：桁架 + 台阶拼搭、灯具摆放、网格吸附、场景参数
import type { AppCtx } from '../app';
import type { Fixture, FixtureState, StageBlock, Truss, Venue } from '../types';
import { Viewer } from '../render/viewer';
import type { PickedObject } from '../render/renderer';
import type { Vec3 } from '../render/math3d';
import { clamp } from '../render/math3d';
import { resolveFixtureState } from '../lib/state';
import { isValidHex, normalizeHex, uid } from '../lib/color';
import {
  button, clear, colorInput, h, labelRow, numberInput, rangeInput, sectionTitle, toast
} from '../lib/dom';

const GRID = 0.5;
const snap = (v: number): number => Math.round(v / GRID) * GRID;

export function renderStagePage(root: HTMLElement, venue: Venue, ctx: AppCtx): void {
  let selectedId: string | null = null;
  let gridOn = true;
  let viewer: Viewer | null = null;

  const states = (): Record<string, FixtureState> => {
    const out: Record<string, FixtureState> = {};
    for (const fx of venue.fixtures) out[fx.id] = resolveFixtureState(venue, fx);
    return out;
  };

  const topbar = h('div', { class: 'topbar' },
    h('div', { class: 'title' }, venue.name + ' · 舞台编辑'),
    h('div', { class: 'spacer' }),
    h('label', { class: 'checkbox-row' },
      Object.assign(document.createElement('input'), { type: 'checkbox', checked: true }) as HTMLInputElement,
      '网格吸附'),
    button('📤 导出工程', () => ctx.exportCurrent()),
    button('← 返回场馆', () => ctx.navigate({ page: 'venues' }))
  );
  // 网格开关绑定
  const gridCheckbox = topbar.querySelector('input') as HTMLInputElement;
  gridCheckbox.addEventListener('change', () => { gridOn = gridCheckbox.checked; });

  const fpsEl = h('div', { class: 'fps-badge' }, '-- FPS');
  const canvas = h('canvas', {}) as HTMLCanvasElement;
  const canvasWrap = h('div', { class: 'canvas-wrap' },
    canvas,
    fpsEl,
    h('div', { class: 'hud-hint' },
      '左键拖拽：旋转视角 / 移动物体　右键或 Shift+拖拽：平移　滚轮：缩放',
      h('br'), '双击灯具可快速选中，物体自动吸附 0.5m 网格')
  );
  const panel = h('div', { class: 'side-panel' });

  const refreshPanel = (): void => {
    clear(panel);
    panel.append(buildAddPanel(), buildScenePanel(), buildInspector());
  };

  const buildAddPanel = (): HTMLElement => {
    const addTruss = (): void => {
      const tr: Truss = { id: uid('truss'), position: [0, 7, -3], length: 6 };
      venue.trusses.push(tr);
      selectedId = tr.id;
      ctx.markDirty();
      refreshPanel();
    };
    const addBlock = (): void => {
      const b: StageBlock = {
        id: uid('blk'), position: [0, 0.3, 2], size: [4, 0.6, 3], color: '#454b59'
      };
      venue.blocks.push(b);
      selectedId = b.id;
      ctx.markDirty();
      refreshPanel();
    };
    const addFixture = (kind: Fixture['kind']): void => {
      const tpl = venue.templates.find((t) => t.kind === kind);
      if (!tpl) {
        toast('灯具库里还没有该类型模板，请先到灯具库新建', 'error');
        return;
      }
      const fx: Fixture = {
        id: uid('fx'),
        name: (kind === 'beam' ? '光束灯 ' : '染色灯 ') + (venue.fixtures.filter((f) => f.kind === kind).length + 1),
        templateId: tpl.id,
        kind,
        position: [snap(0), 6.5, snap(0)],
        state: {}
      };
      venue.fixtures.push(fx);
      selectedId = fx.id;
      ctx.markDirty();
      refreshPanel();
    };
    return h('div', {},
      sectionTitle('添加物体'),
      h('div', { class: 'tool-group' },
        button('＋ 桁架', addTruss),
        button('＋ 台阶', addBlock),
        button('＋ 摇头光束灯', () => addFixture('beam'), true),
        button('＋ 染色灯', () => addFixture('wash'), true)
      )
    );
  };

  const buildScenePanel = (): HTMLElement => {
    const hazeLabel = h('span', {}, '烟雾浓度：' + Math.round(venue.haze * 100) + '%');
    return h('div', {},
      sectionTitle('场馆与烟雾'),
      labelRow('场地宽度 (m)', numberInput(venue.width, 1, (v) => { venue.width = Math.max(6, v); ctx.markDirty(); })),
      labelRow('场地纵深 (m)', numberInput(venue.depth, 1, (v) => { venue.depth = Math.max(6, v); ctx.markDirty(); })),
      labelRow('布景高度 (m)', numberInput(venue.backdropHeight, 0.5,
        (v) => { venue.backdropHeight = clamp(v, 1, 30); ctx.markDirty(); })),
      h('label', { class: 'field' }, hazeLabel,
        rangeInput(venue.haze, 0, 1, 0.01, (v) => {
          venue.haze = v;
          ctx.markDirty();
          hazeLabel.textContent = '烟雾浓度：' + Math.round(v * 100) + '%';
        }))
    );
  };

  const buildInspector = (): HTMLElement => {
    const wrap = h('div', {}, sectionTitle('属性检查器'));
    const fx = venue.fixtures.find((f) => f.id === selectedId);
    const tr = venue.trusses.find((t) => t.id === selectedId);
    const blk = venue.blocks.find((b) => b.id === selectedId);
    if (!fx && !tr && !blk) {
      wrap.append(h('div', { class: 'muted' }, '未选中物体。在 3D 视图中点选灯具、桁架或台阶。'));
      return wrap;
    }

    const posEditors = (pos: Vec3, yMin: number): HTMLElement =>
      h('div', { class: 'field-row' },
        labelRow('X (m)', numberInput(pos[0], GRID, (v) => { pos[0] = snap(v); ctx.markDirty(); })),
        labelRow('Z (m)', numberInput(pos[2], GRID, (v) => { pos[2] = snap(v); ctx.markDirty(); })),
        labelRow('Y 高度 (m)', numberInput(pos[1], GRID, (v) => {
          pos[1] = Math.max(yMin, snap(v)); ctx.markDirty();
        }))
      );

    const removeBtn = (label: string, fn: () => void): HTMLElement =>
      h('button', {
        class: 'btn danger', style: 'margin-top:8px',
        onClick: () => { fn(); selectedId = null; ctx.markDirty(); refreshPanel(); }
      }, '🗑 删除' + label);

    if (tr) {
      wrap.append(
        h('div', { class: 'list-item' }, h('span', { class: 'tag' }, '桁架')),
        posEditors(tr.position, 1),
        labelRow('长度 (m)', numberInput(tr.length, GRID, (v) => {
          tr.length = Math.max(1, snap(v)); ctx.markDirty();
        })),
        removeBtn('桁架', () => { venue.trusses = venue.trusses.filter((t) => t.id !== tr.id); })
      );
    } else if (blk) {
      wrap.append(
        h('div', { class: 'list-item' }, h('span', { class: 'tag' }, '台阶')),
        posEditors(blk.position, blk.size[1] / 2),
        h('div', { class: 'field-row' },
          labelRow('宽 (m)', numberInput(blk.size[0], GRID, (v) => { blk.size[0] = Math.max(0.5, v); ctx.markDirty(); })),
          labelRow('高 (m)', numberInput(blk.size[1], GRID, (v) => { blk.size[1] = Math.max(0.1, v); ctx.markDirty(); })),
          labelRow('深 (m)', numberInput(blk.size[2], GRID, (v) => { blk.size[2] = Math.max(0.5, v); ctx.markDirty(); }))
        ),
        labelRow('颜色', colorInput(blk.color, (c) => { blk.color = c; ctx.markDirty(); })),
        removeBtn('台阶', () => { venue.blocks = venue.blocks.filter((b) => b.id !== blk.id); })
      );
    } else if (fx) {
      const s = resolveFixtureState(venue, fx);
      const tpl = venue.templates.find((t) => t.id === fx.templateId);
      const update = (patch: Partial<FixtureState>): void => {
        fx.state = { ...fx.state, ...patch };
        ctx.markDirty();
        refreshPanel();
      };
      wrap.append(
        h('div', { class: 'list-item' },
          h('span', { class: 'tag' }, fx.kind === 'beam' ? '光束灯' : '染色灯'),
          h('span', { class: 'grow' }, fx.name)),
        labelRow('灯具名称', h('input', {
          type: 'text', value: fx.name,
          onChange: (e: Event) => { fx.name = (e.target as HTMLInputElement).value; ctx.markDirty(); }
        }) as HTMLInputElement),
        labelRow('引用模板', (() => {
          const sel = h('select', {},
            ...venue.templates.filter((t) => t.kind === fx.kind).map((t) =>
              h('option', { value: t.id, selected: t.id === fx.templateId }, t.name))) as HTMLSelectElement;
          sel.addEventListener('change', () => { fx.templateId = sel.value; fx.state = {}; ctx.markDirty(); refreshPanel(); });
          return sel;
        })()),
        posEditors(fx.position, 0.5),
        h('hr', { style: 'border:0;border-top:1px solid var(--border);width:100%' }),
        h('div', { class: 'muted' }, '实例覆盖（模板：' + (tpl?.name ?? '?') + '）'),
        labelRow('水平 Pan (°)', rangeInput(s.pan, -180, 180, 1, (v) => update({ pan: v }))),
        labelRow('俯仰 Tilt (°)', rangeInput(s.tilt, -90, 30, 1, (v) => update({ tilt: v }))),
        labelRow('光束角 (°)', rangeInput(s.beamAngle, 5, 60, 0.5, (v) => update({ beamAngle: v }))),
        labelRow('亮度：' + Math.round(s.intensity * 100) + '%',
          rangeInput(s.intensity, 0, 1, 0.01, (v) => update({ intensity: v }))),
        labelRow('颜色', colorInput(s.color, (c) => update({ color: normalizeHex(c) }))),
        h('label', { class: 'field' }, '十六进制颜色',
          h('input', {
            type: 'text', value: s.color,
            onChange: (e: Event) => {
              const val = (e.target as HTMLInputElement).value;
              if (isValidHex(val)) update({ color: normalizeHex(val) });
              else toast('颜色格式应为 #RRGGBB', 'error');
            }
          }) as HTMLInputElement),
        button('清除实例覆盖，恢复模板值', () => { fx.state = {}; ctx.markDirty(); refreshPanel(); }),
        removeBtn('灯具', () => { venue.fixtures = venue.fixtures.filter((f) => f.id !== fx.id); })
      );
    }
    return wrap;
  };

  // 拖拽：把点中物体在地面投影位置（吸附后）赋回去；保持各自的 Y 高度
  const onPick = (hit: PickedObject | null): void => {
    if (hit) {
      selectedId = hit.id;
      refreshPanel();
    } else {
      selectedId = null;
      refreshPanel();
    }
  };
  const onDragMove = (ground: Vec3): void => {
    if (!selectedId) return;
    const x = clamp(snap(ground[0]), -venue.width / 2 + 0.5, venue.width / 2 - 0.5);
    const z = clamp(snap(ground[2]), -venue.depth / 2 + 0.5, venue.depth / 2 - 0.5);
    const fx = venue.fixtures.find((f) => f.id === selectedId);
    const tr = venue.trusses.find((t) => t.id === selectedId);
    const blk = venue.blocks.find((b) => b.id === selectedId);
    if (fx) fx.position = [x, fx.position[1], z];
    if (tr) tr.position = [x, tr.position[1], z];
    if (blk) blk.position = [x, blk.position[1], z];
  };
  const onDragEnd = (): void => { if (selectedId) { ctx.markDirty(); refreshPanel(); } };

  viewer = new Viewer(
    canvas,
    () => venue,
    states,
    () => selectedId,
    () => gridOn,
    () => undefined,
    { onPick, onDragMove, onDragEnd },
    fpsEl
  );

  root.append(topbar, h('div', { class: 'page' }, canvasWrap, panel));
  refreshPanel();
}
