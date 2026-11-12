// Cue 编排页：时间线列表、渐变播放/暂停、逐灯状态录制、实时预演
import type { AppCtx } from '../app';
import type { Cue, Fixture, FixtureState, Venue } from '../types';
import { Viewer } from '../render/viewer';
import { CuePlayer } from '../lib/cuePlayer';
import { initialStates, resolveFixtureState } from '../lib/state';
import { normalizeHex, uid } from '../lib/color';
import {
  button, clear, colorInput, h, labelRow, numberInput, rangeInput, sectionTitle, toast
} from '../lib/dom';

export function renderCuesPage(root: HTMLElement, venue: Venue, ctx: AppCtx): void {
  // live：播放/手动调整后的实时状态，渲染读它；初始取模板+实例覆盖
  let live: Record<string, FixtureState> = initialStates(venue);
  const player = new CuePlayer(venue);
  player.states = structuredClone(live);

  let selectedCueId: string | null = venue.cues[0]?.id ?? null;
  let selectedFxId: string | null = venue.fixtures[0]?.id ?? null;
  let gridOn = false;
  let lastPanelSync = 0;

  const fpsEl = h('div', { class: 'fps-badge' }, '-- FPS');
  const canvas = h('canvas', {}) as HTMLCanvasElement;
  const canvasWrap = h('div', { class: 'canvas-wrap' }, canvas, fpsEl,
    h('div', { class: 'hud-hint' }, '左侧为预演视图；在右侧选中灯具后可手动调整，点击「录制到 Cue」保存当前状态'));
  const sidePanel = h('div', { class: 'side-panel' });
  const timeline = h('div', { class: 'timeline-panel' });

  const selectedCue = (): Cue | undefined => venue.cues.find((c) => c.id === selectedCueId);
  const selectedFx = (): Fixture | undefined => venue.fixtures.find((f) => f.id === selectedFxId);

  /* ---------------- 右侧：灯具列表 + 手动控制 ---------------- */

  const buildSide = (): void => {
    clear(sidePanel);
    const listBox = h('div', {}, sectionTitle('灯具（' + venue.fixtures.length + '）'));
    const list = h('div', { class: 'list' });
    for (const fx of venue.fixtures) {
      const st = live[fx.id] ?? resolveFixtureState(venue, fx);
      list.append(h('div', {
        class: 'list-item' + (fx.id === selectedFxId ? ' selected' : ''),
        onClick: () => { selectedFxId = fx.id; buildSide(); }
      },
        h('span', { class: 'dot', style: `background:${st.color}` }),
        h('span', { class: 'grow' }, fx.name),
        h('span', { class: 'tag' }, fx.kind === 'beam' ? '光束' : '染色'),
        h('span', { class: 'tag' }, Math.round(st.intensity * 100) + '%')));
    }
    listBox.append(list);
    sidePanel.append(listBox, buildManualControl());
  };

  const buildManualControl = (): HTMLElement => {
    const box = h('div', {}, sectionTitle('手动控制（实时）'));
    const fx = selectedFx();
    if (!fx) {
      box.append(h('div', { class: 'muted' }, '当前工程还没有灯具，先到舞台编辑页布灯。'));
      return box;
    }
    const s = live[fx.id];
    if (!s) return box;
    const set = (patch: Partial<FixtureState>): void => {
      Object.assign(live[fx.id], patch);
      player.states[fx.id] = { ...live[fx.id] };
      buildSide();
      buildTimeline();
    };
    const cue = selectedCue();
    box.append(
      h('div', { class: 'muted' }, fx.name + '　当前状态将作为录制源'),
      labelRow('Pan 水平 (°)', rangeInput(s.pan, -180, 180, 1, (v) => set({ pan: v }))),
      labelRow('Tilt 俯仰 (°)', rangeInput(s.tilt, -90, 30, 1, (v) => set({ tilt: v }))),
      labelRow('光束角 (°)', rangeInput(s.beamAngle, 5, 60, 0.5, (v) => set({ beamAngle: v }))),
      labelRow('亮度：' + Math.round(s.intensity * 100) + '%',
        rangeInput(s.intensity, 0, 1, 0.01, (v) => set({ intensity: v }))),
      labelRow('颜色', colorInput(s.color, (c) => set({ color: normalizeHex(c) }))),
      h('div', { class: 'tool-group', style: 'margin-top:8px' },
        button('● 录制到' + (cue ? '「' + cue.name + '」' : ' Cue'), () => {
          if (!cue) {
            toast('请先在下方时间线新建或选择一个 Cue', 'error');
            return;
          }
          cue.states[fx.id] = { ...live[fx.id] };
          ctx.markDirty();
          toast('已录制 ' + fx.name + ' 的状态');
          buildTimeline();
        }, true),
        button('全部灯快照入 Cue', () => {
          if (!cue) {
            toast('请先新建一个 Cue', 'error');
            return;
          }
          for (const f of venue.fixtures) cue.states[f.id] = { ...live[f.id] };
          ctx.markDirty();
          toast('已把全部 ' + venue.fixtures.length + ' 台灯当前状态写入 Cue');
          buildTimeline();
        })
      ),
      h('hr', { style: 'border:0;border-top:1px solid var(--border);width:100%' }),
      buildCueStateEditor()
    );
    return box;
  };

  /** 直接表格化编辑当前 Cue 中选中灯具的数值 */
  const buildCueStateEditor = (): HTMLElement => {
    const box = h('div', {}, sectionTitle('Cue 内数值编辑'));
    const cue = selectedCue();
    const fx = selectedFx();
    if (!cue || !fx) {
      box.append(h('div', { class: 'muted' }, '选择 Cue 和灯具后可直接改数值'));
      return box;
    }
    if (!cue.states[fx.id]) {
      box.append(h('div', { class: 'muted' }, '该灯具尚未录入此 Cue'),
        button('录入当前状态', () => {
          cue.states[fx.id] = { ...live[fx.id] };
          ctx.markDirty();
          buildTimeline();
        }, true));
      return box;
    }
    const cs = cue.states[fx.id];
    const edit = (patch: Partial<FixtureState>): void => {
      Object.assign(cs, patch);
      ctx.markDirty();
    };
    box.append(
      labelRow('Pan (°)', numberInput(cs.pan, 1, (v) => edit({ pan: v }))),
      labelRow('Tilt (°)', numberInput(cs.tilt, 1, (v) => edit({ tilt: v }))),
      labelRow('光束角 (°)', numberInput(cs.beamAngle, 0.5, (v) => edit({ beamAngle: v }))),
      labelRow('亮度 0..1', numberInput(cs.intensity, 0.01, (v) => edit({ intensity: v }))),
      labelRow('颜色', colorInput(cs.color, (c) => edit({ color: normalizeHex(c) }))),
      button('从 Cue 移除该灯', () => {
        delete cue.states[fx.id];
        ctx.markDirty();
        buildTimeline();
      })
    );
    return box;
  };

  /* ---------------- 底部：时间线 + 走带控制 ---------------- */

  const buildTimeline = (): void => {
    clear(timeline);
    const progress = h('div', { class: 'progress-fill' }) as HTMLElement;
    const playBtn = button(player.playing ? '⏸ 暂停' : '▶ 播放', () => {
      player.togglePlay();
      buildTimeline();
    }, true);
    const stopBtn = button('⏹ 停止', () => { player.stop(); buildTimeline(); });
    const addCue = (): void => {
      const cue: Cue = {
        id: uid('cue'),
        name: 'Cue ' + (venue.cues.length + 1),
        fade: 2,
        states: {}
      };
      venue.cues.push(cue);
      selectedCueId = cue.id;
      ctx.markDirty();
      buildTimeline();
    };
    timeline.append(
      h('div', { class: 'transport' },
        playBtn, stopBtn,
        h('div', { class: 'progress-track' }, progress),
        h('span', { class: 'muted' },
          player.activeIndex >= 0 ? `Cue ${player.activeIndex + 1} · ${Math.round(player.progress * 100)}%` : '就绪'),
        button('＋ 新建 Cue', addCue),
        button('📤 导出工程', () => ctx.exportCurrent())
      ),
      h('div', { style: 'display:flex;gap:10px;align-items:center' },
        h('label', { class: 'checkbox-row' },
          (() => {
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = gridOn;
            cb.addEventListener('change', () => { gridOn = cb.checked; });
            return cb;
          })(),
          '显示网格'),
        h('span', { class: 'muted' }, '点击 Cue 行跳转并定位；播放时所有灯具按各自渐变时长平滑过渡')
      )
    );

    const rows = h('div', { style: 'display:flex;flex-direction:column;gap:6px;overflow-y:auto' });
    venue.cues.forEach((cue, i) => {
      const row = h('div', {
        class: 'cue-row' + (cue.id === selectedCueId ? ' active' : ''),
        onClick: () => {
          selectedCueId = cue.id;
          player.jumpTo(i);
          live = structuredClone(player.states);
          buildSide();
          buildTimeline();
        }
      },
        h('div', { class: 'idx' }, String(i + 1)),
        h('div', { class: 'grow' },
          h('input', {
            type: 'text', value: cue.name, style: 'background:transparent;border:none;color:inherit;width:180px',
            onChange: (e: Event) => {
              cue.name = (e.target as HTMLInputElement).value;
              ctx.markDirty();
            },
            onClick: (e: Event) => e.stopPropagation()
          }) as HTMLInputElement,
          h('div', { class: 'fade' }, '灯数 ' + Object.keys(cue.states).length)
        ),
        h('label', { class: 'muted', onClick: (e: Event) => e.stopPropagation() }, '渐变 (秒) ',
          (() => {
            const inp = numberInput(cue.fade, 0.1, (v) => { cue.fade = Math.max(0.05, v); ctx.markDirty(); });
            inp.style.width = '70px';
            return inp;
          })()),
        button('播放', (e: Event) => {
          e.stopPropagation();
          selectedCueId = cue.id;
          player.play(i);
          buildTimeline();
        }),
        h('button', {
          class: 'btn small danger',
          onClick: (e: Event) => {
            e.stopPropagation();
            if (!confirm('删除 Cue「' + cue.name + '」？')) return;
            venue.cues = venue.cues.filter((c) => c.id !== cue.id);
            if (selectedCueId === cue.id) selectedCueId = venue.cues[0]?.id ?? null;
            ctx.markDirty();
            buildTimeline();
          }
        }, '删除')
      );
      rows.append(row);
    });
    timeline.append(rows);
  };

  /* ---------------- Viewer + 循环 ---------------- */

  new Viewer(
    canvas,
    () => venue,
    () => player.states,
    () => null,
    () => gridOn,
    (dt) => {
      const wasPlaying = player.playing;
      player.update(dt);
      // 播放推进时节流同步手动面板与进度条（100ms 一次，避免每帧重建 DOM）
      if (wasPlaying && performance.now() - lastPanelSync > 100) {
        lastPanelSync = performance.now();
        live = structuredClone(player.states);
        buildSide();
        buildTimeline();
      } else if (wasPlaying && !player.playing) {
        // 渐变结束的最后一帧强制刷新到终态
        live = structuredClone(player.states);
        buildSide();
        buildTimeline();
      }
    },
    {},
    fpsEl
  );

  root.append(
    h('div', { class: 'topbar' },
      h('div', { class: 'title' }, venue.name + ' · Cue 编排'),
      h('div', { class: 'spacer' }),
      button('← 返回场馆', () => ctx.navigate({ page: 'venues' }))
    ),
    h('div', { class: 'page', style: 'flex-direction:column' },
      h('div', { style: 'flex:1;display:flex;min-height:0' }, canvasWrap, sidePanel),
      timeline
    )
  );

  buildSide();
  buildTimeline();
}
