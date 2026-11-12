// 灯具状态解析：模板默认值 <- 实例覆盖 <- Cue 目标
import type { Fixture, FixtureState, FixtureTemplate, Venue } from '../types';

export function templateById(venue: Venue, templateId: string): FixtureTemplate | undefined {
  return venue.templates.find((t) => t.id === templateId);
}

/** 灯具在手动编辑/初始状态下的有效状态（模板 + 实例覆盖合并） */
export function resolveFixtureState(venue: Venue, fx: Fixture): FixtureState {
  const tpl = templateById(venue, fx.templateId);
  const base: FixtureState = {
    pan: tpl?.pan ?? 0,
    tilt: tpl?.tilt ?? -45,
    color: tpl?.color ?? '#ffffff',
    intensity: tpl?.intensity ?? 0.8,
    beamAngle: tpl?.beamAngle ?? (fx.kind === 'beam' ? 14 : 35)
  };
  return { ...base, ...fx.state };
}

/** 场地内全部灯具的初始状态表 */
export function initialStates(venue: Venue): Record<string, FixtureState> {
  const out: Record<string, FixtureState> = {};
  for (const fx of venue.fixtures) out[fx.id] = resolveFixtureState(venue, fx);
  return out;
}

/** 灯具安装高度处的灯口世界坐标（外壳模型顶端偏移后） */
export function lampHeadPosition(fx: Fixture): [number, number, number] {
  return [fx.position[0], fx.position[1] - 0.28, fx.position[2]];
}
