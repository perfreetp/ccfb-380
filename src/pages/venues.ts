// 场馆列表页：新建 / 复制 / 删除 / 导入 / 导出，数据自动存浏览器
import type { AppCtx } from '../app';
import type { Venue } from '../types';
import { createSeedVenue, exportVenue } from '../lib/store';
import { button, clear, h, toast } from '../lib/dom';
import { uid } from '../lib/color';

export function renderVenuesPage(root: HTMLElement, ctx: AppCtx): void {
  const refresh = (): void => {
    clear(root);
    root.append(buildTopbar(), buildGrid());
  };

  const buildTopbar = (): HTMLElement => {
    const file = h('input', {
      type: 'file', accept: '.json,application/json', style: 'display:none'
    }) as HTMLInputElement;
    file.addEventListener('change', () => {
      if (file.files?.[0]) void ctx.importFromFile(file.files[0]);
      file.value = '';
    });
    return h('div', { class: 'topbar' },
      h('div', { class: 'title' }, '场馆列表'),
      h('div', { class: 'spacer' }),
      button('＋ 新建空场馆', () => {
        ctx.venues.push(createEmptyVenue());
        ctx.markDirty();
        refresh();
      }, true),
      button('生成 12 灯测试场馆', () => {
        ctx.venues.push(createSeedVenue());
        ctx.markDirty();
        refresh();
      }),
      button('📥 导入工程', () => file.click()),
      h('span', { style: 'display:none' }, file)
    );
  };

  const buildGrid = (): HTMLElement => {
    const grid = h('div', { class: 'venue-grid' });
    if (ctx.venues.length === 0) {
      grid.append(h('div', { class: 'empty-tip' }, '还没有场馆，点击右上角新建或导入一个工程'));
      return grid;
    }
    for (const v of ctx.venues) grid.append(venueCard(v));
    return grid;
  };

  const venueCard = (v: Venue): HTMLElement => {
    const date = new Date(v.updatedAt).toLocaleString('zh-CN', { hour12: false });
    const open = (): void => ctx.navigate({ page: 'stage', venueId: v.id });
    return h('div', { class: 'venue-card', onDblclick: open },
      h('div', { class: 'name' }, v.name),
      h('div', { class: 'meta' },
        `场地 ${v.width}×${v.depth}m · 灯具 ${v.fixtures.length} 台 · Cue ${v.cues.length} 个`),
      h('div', { class: 'meta' }, '最近保存：' + date),
      h('div', { class: 'actions' },
        button('打开', open, true),
        button('复制', () => {
          const copy = ctx.duplicateVenue(v.id);
          if (copy) {
            toast('已复制：' + copy.name);
            refresh();
          }
        }),
        button('导出', () => {
          exportVenue(v);
          toast('已导出 ' + v.name);
        }),
        h('button', {
          class: 'btn danger',
          onClick: () => {
            if (confirm(`确定删除「${v.name}」？此操作不可恢复。`)) {
              ctx.deleteVenue(v.id);
              refresh();
            }
          }
        }, '删除')
      )
    );
  };

  refresh();
}

function createEmptyVenue(): Venue {
  const v = createSeedVenue();
  v.id = uid('venue');
  v.name = '新场馆 ' + new Date().toLocaleDateString('zh-CN');
  v.fixtures = [];
  v.trusses = [];
  v.blocks = [];
  v.cues = [];
  v.updatedAt = Date.now();
  return v;
}
