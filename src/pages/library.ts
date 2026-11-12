// 灯具库页：维护摇头光束 / 染色灯模板，参数即改即预览
import type { AppCtx } from '../app';
import type { FixtureState, FixtureTemplate, Venue } from '../types';
import { Viewer } from '../render/viewer';
import { resolveFixtureState } from '../lib/state';
import { normalizeHex, uid } from '../lib/color';
import {
  button, clear, colorInput, h, labelRow, rangeInput, sectionTitle, toast
} from '../lib/dom';

export function renderLibraryPage(root: HTMLElement, venue: Venue, ctx: AppCtx): void {
  let selectedTplId: string | null = venue.templates[0]?.id ?? null;

  const fpsEl = h('div', { class: 'fps-badge' }, '-- FPS');
  const canvas = h('canvas', {}) as HTMLCanvasElement;
  const canvasWrap = h('div', { class: 'canvas-wrap' }, canvas, fpsEl,
    h('div', { class: 'hud-hint' }, '左侧实时预览模板效果（含体积光束与地面光斑）'));
  const panel = h('div', { class: 'side-panel' });

  // 预览只渲染一台引用所选模板的虚拟灯
  const previewVenue = (): Venue => {
    const tpl = venue.templates.find((t) => t.id === selectedTplId);
    const clone: Venue = structuredClone(venue);
    clone.fixtures = tpl ? [{
      id: 'preview_fx',
      name: '预览',
      templateId: tpl.id,
      kind: tpl.kind,
      position: [0, 6, 0],
      // 预览灯近乎垂直向下、满亮度，光斑落在画面中心，便于观察光束角/颜色
      state: { pan: 0, tilt: -68, intensity: 1 }
    }] : [];
    clone.trusses = [{ id: 'preview_truss', position: [0, 6.2, 0], length: 4 }];
    clone.blocks = [];
    clone.cues = [];
    return clone;
  };
  const previewStates = (): Record<string, FixtureState> => {
    const pv = previewVenue();
    const out: Record<string, FixtureState> = {};
    for (const fx of pv.fixtures) out[fx.id] = resolveFixtureState(pv, fx);
    return out;
  };

  const previewViewer = new Viewer(
    canvas, previewVenue, previewStates,
    () => null, () => true, () => undefined, {}, fpsEl
  );
  // 单灯预览：拉近相机、聚焦灯口下方，让光束与地面光斑占画面主体
  const cam = previewViewer.renderer.camera;
  cam.distance = 13;
  cam.target = [0, 2.2, 0];
  cam.pitch = 0.32;

  const refresh = (): void => {
    clear(panel);
    panel.append(buildList(), buildEditor());
  };

  const buildList = (): HTMLElement => {
    const box = h('div', {}, sectionTitle('灯具模板（' + venue.templates.length + '）'));
    const list = h('div', { class: 'list' });
    for (const t of venue.templates) {
      list.append(h('div', {
        class: 'list-item' + (t.id === selectedTplId ? ' selected' : ''),
        onClick: () => { selectedTplId = t.id; refresh(); }
      },
        h('span', { class: 'dot', style: `background:${t.color}` }),
        h('span', { class: 'grow' }, t.name),
        h('span', { class: 'tag' }, t.kind === 'beam' ? '光束' : '染色')));
    }
    box.append(list,
      h('div', { class: 'tool-group', style: 'margin-top:10px' },
        button('＋ 光束灯模板', () => addTemplate('beam')),
        button('＋ 染色灯模板', () => addTemplate('wash'))
      ));
    return box;
  };

  const addTemplate = (kind: FixtureTemplate['kind']): void => {
    const t: FixtureTemplate = {
      id: uid('tpl'),
      name: (kind === 'beam' ? '新光束灯 ' : '新染色灯 ') + (venue.templates.filter((x) => x.kind === kind).length + 1),
      kind,
      pan: 0,
      tilt: kind === 'beam' ? -55 : -60,
      color: kind === 'beam' ? '#ffd9a0' : '#4da6ff',
      intensity: 0.85,
      beamAngle: kind === 'beam' ? 12 : 38
    };
    venue.templates.push(t);
    selectedTplId = t.id;
    ctx.markDirty();
    refresh();
  };

  const buildEditor = (): HTMLElement => {
    const tpl = venue.templates.find((t) => t.id === selectedTplId);
    const box = h('div', {}, sectionTitle('模板参数'));
    if (!tpl) {
      box.append(h('div', { class: 'muted' }, '选择或新建一个模板开始编辑'));
      return box;
    }
    const edit = (patch: Partial<FixtureTemplate>): void => {
      Object.assign(tpl, patch);
      ctx.markDirty();
      refresh();
    };
    box.append(
      labelRow('模板名称', h('input', {
        type: 'text', value: tpl.name,
        onChange: (e: Event) => edit({ name: (e.target as HTMLInputElement).value })
      }) as HTMLInputElement),
      h('div', { class: 'muted' }, '类型：' + (tpl.kind === 'beam' ? '摇头光束灯（窄光束、远射程）' : '染色灯（宽光束、大面积铺色）')),
      labelRow('默认水平 Pan (°)', rangeInput(tpl.pan, -180, 180, 1, (v) => edit({ pan: v }))),
      labelRow('默认俯仰 Tilt (°)', rangeInput(tpl.tilt, -90, 30, 1, (v) => edit({ tilt: v }))),
      labelRow('光束角 (°) ' + (tpl.kind === 'beam' ? '建议 8~30' : '建议 25~60'),
        rangeInput(tpl.beamAngle, 5, 60, 0.5, (v) => edit({ beamAngle: v }))),
      labelRow('默认亮度：' + Math.round(tpl.intensity * 100) + '%',
        rangeInput(tpl.intensity, 0, 1, 0.01, (v) => edit({ intensity: v }))),
      labelRow('默认颜色', colorInput(tpl.color, (c) => edit({ color: normalizeHex(c) }))),
      labelRow('颜色十六进制', h('input', {
        type: 'text', value: tpl.color,
        onChange: (e: Event) => {
          const val = (e.target as HTMLInputElement).value;
          if (/^#?[0-9a-fA-F]{6}$/.test(val.trim())) edit({ color: normalizeHex(val) });
          else toast('颜色格式应为 #RRGGBB', 'error');
        }
      }) as HTMLInputElement),
      h('div', { class: 'field-row' },
        labelRow('引用此模板的灯具', h('input', {
          type: 'text', value: String(venue.fixtures.filter((f) => f.templateId === tpl.id).length),
          disabled: true
        }) as HTMLInputElement),
        labelRow('模板 ID', h('input', { type: 'text', value: tpl.id.slice(0, 14) + '…', disabled: true }) as HTMLInputElement)
      ),
      h('button', {
        class: 'btn danger', style: 'margin-top:8px',
        onClick: () => {
          const used = venue.fixtures.filter((f) => f.templateId === tpl.id).length;
          if (used > 0) {
            toast(`还有 ${used} 台灯引用此模板，无法删除`, 'error');
            return;
          }
          if (!confirm('删除模板「' + tpl.name + '」？')) return;
          venue.templates = venue.templates.filter((t) => t.id !== tpl.id);
          selectedTplId = venue.templates[0]?.id ?? null;
          ctx.markDirty();
          refresh();
        }
      }, '🗑 删除模板')
    );
    return box;
  };

  root.append(
    h('div', { class: 'topbar' },
      h('div', { class: 'title' }, venue.name + ' · 灯具库'),
      h('div', { class: 'spacer' }),
      button('← 返回场馆', () => ctx.navigate({ page: 'venues' }))
    ),
    h('div', { class: 'page' }, canvasWrap, panel)
  );

  refresh();
}
