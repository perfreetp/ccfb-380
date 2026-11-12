// 全局应用状态：场馆列表、当前工程、自动保存、hash 路由
import type { Venue } from './types';
import { createSeedVenue, exportVenue, importVenue, loadVenues, saveVenues } from './lib/store';
import { clear, h, toast } from './lib/dom';
import { renderVenuesPage } from './pages/venues';
import { renderStagePage } from './pages/stage';
import { renderLibraryPage } from './pages/library';
import { renderCuesPage } from './pages/cues';

export type Route =
  | { page: 'venues' }
  | { page: 'stage'; venueId: string }
  | { page: 'library'; venueId: string }
  | { page: 'cues'; venueId: string };

export interface AppCtx {
  venues: Venue[];
  currentId: string | null;
  /** 标记当前工程有改动，触发防抖自动保存 */
  markDirty: () => void;
  current: () => Venue | undefined;
  replaceVenue: (v: Venue) => void;
  deleteVenue: (id: string) => void;
  duplicateVenue: (id: string) => Venue | undefined;
  exportCurrent: () => void;
  importFromFile: (file: File) => Promise<void>;
  navigate: (r: Route) => void;
}

const NAV_ITEMS: Array<{ route: 'stage' | 'library' | 'cues'; label: string; sub: string }> = [
  { route: 'stage', label: '舞台编辑', sub: '桁架 · 台阶 · 布灯' },
  { route: 'library', label: '灯具库', sub: '光束灯 · 染色灯' },
  { route: 'cues', label: 'Cue 编排', sub: '时间线 · 预演' }
];

export function boot(): void {
  let venues = loadVenues();
  if (venues.length === 0) {
    venues = [createSeedVenue()];
    saveVenues(venues);
  }
  let currentId: string | null = venues[0]?.id ?? null;
  let saveTimer = 0;

  const ctx: AppCtx = {
    venues,
    get currentId() {
      return currentId;
    },
    markDirty() {
      const v = ctx.current();
      if (v) v.updatedAt = Date.now();
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        saveVenues(ctx.venues);
      }, 400);
    },
    current() {
      return ctx.venues.find((v) => v.id === currentId);
    },
    replaceVenue(v) {
      const i = ctx.venues.findIndex((x) => x.id === v.id);
      if (i >= 0) ctx.venues[i] = v;
      else ctx.venues.push(v);
      ctx.markDirty();
    },
    deleteVenue(id) {
      ctx.venues = ctx.venues.filter((v) => v.id !== id);
      if (currentId === id) currentId = ctx.venues[0]?.id ?? null;
      saveVenues(ctx.venues);
      ctx.navigate({ page: 'venues' });
    },
    duplicateVenue(id) {
      const src = ctx.venues.find((v) => v.id === id);
      if (!src) return undefined;
      const copy: Venue = structuredClone(src);
      const remap = new Map<string, string>();
      copy.id = 'venue_' + Math.random().toString(36).slice(2, 10);
      copy.name = src.name + ' 副本';
      copy.updatedAt = Date.now();
      for (const t of copy.templates) {
        const n = 'tpl_' + Math.random().toString(36).slice(2, 10);
        remap.set(t.id, n);
        t.id = n;
      }
      for (const fx of copy.fixtures) {
        const old = fx.id;
        fx.id = 'fx_' + Math.random().toString(36).slice(2, 10);
        fx.templateId = remap.get(fx.templateId) ?? fx.templateId;
        for (const cue of copy.cues) {
          if (cue.states[old]) {
            cue.states[fx.id] = cue.states[old];
            delete cue.states[old];
          }
        }
      }
      for (const tr of copy.trusses) tr.id = 'truss_' + Math.random().toString(36).slice(2, 10);
      for (const b of copy.blocks) b.id = 'blk_' + Math.random().toString(36).slice(2, 10);
      for (const c of copy.cues) c.id = 'cue_' + Math.random().toString(36).slice(2, 10);
      ctx.venues.push(copy);
      saveVenues(ctx.venues);
      return copy;
    },
    exportCurrent() {
      const v = ctx.current();
      if (v) {
        exportVenue(v);
        toast('已导出工程 JSON，可发给同事导入');
      }
    },
    async importFromFile(file) {
      try {
        const v = await importVenue(file);
        ctx.venues.push(v);
        saveVenues(ctx.venues);
        currentId = v.id;
        toast('导入成功：' + v.name);
        ctx.navigate({ page: 'venues' });
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    },
    navigate(r) {
      if ('venueId' in r) currentId = r.venueId;
      location.hash = r.page === 'venues' ? '#/venues' : `#/${r.page}/${currentId ?? ''}`;
    }
  };

  function parseHash(): Route {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    const page = parts[0] || 'venues';
    if ((page === 'stage' || page === 'library' || page === 'cues') && parts[1]) {
      if (!ctx.venues.some((v) => v.id === parts[1])) return { page: 'venues' };
      return { page, venueId: parts[1] } as Route;
    }
    return { page: 'venues' };
  }

  function renderNav(route: Route): void {
    const nav = document.getElementById('nav')!;
    clear(nav);
    const allLink = h('a', {
      class: route.page === 'venues' ? 'active' : '',
      onClick: () => ctx.navigate({ page: 'venues' })
    }, '场馆列表', h('span', { class: 'sub' }, '工程管理 · 导入导出'));
    nav.append(allLink);
    if (route.page !== 'venues') {
      for (const item of NAV_ITEMS) {
        nav.append(h('a', {
          class: route.page === item.route ? 'active' : '',
          onClick: () => ctx.navigate({ page: item.route, venueId: currentId! })
        }, item.label, h('span', { class: 'sub' }, item.sub)));
      }
    }
  }

  function renderRoute(): void {
    const route = parseHash();
    renderNav(route);
    const view = document.getElementById('view')!;
    clear(view);
    if (route.page === 'venues') {
      renderVenuesPage(view, ctx);
    } else {
      const venue = ctx.venues.find((v) => v.id === route.venueId);
      if (!venue) {
        ctx.navigate({ page: 'venues' });
        return;
      }
      if (route.page === 'stage') renderStagePage(view, venue, ctx);
      if (route.page === 'library') renderLibraryPage(view, venue, ctx);
      if (route.page === 'cues') renderCuesPage(view, venue, ctx);
    }
  }

  window.addEventListener('hashchange', renderRoute);
  if (!location.hash) location.hash = '#/venues';
  renderRoute();
}
