// ---------------------------------------------------------------------------
// Core project model for LUX / PREVIS
// Everything is plain, serializable JSON so a venue can be saved to a file and
// handed to another operator.
// ---------------------------------------------------------------------------

export type Vec3 = [number, number, number];

export type FixtureKind = 'beam' | 'wash' | 'spot';

export type GoboId = 'none' | 'breakup' | 'dots' | 'star' | 'lines' | 'rings';

export interface FixtureProfile {
  id: string;
  name: string;
  kind: FixtureKind;
  /** Full beam angle at the narrow end, degrees. */
  beamAngle: number;
  /** Full beam angle at the wide end, degrees. */
  zoomAngle: number;
  colorTemp: number;
  /** Relative output level used by the renderer. */
  output: number;
  gobo: GoboId;
  goboRotation: number;
  /** 0 = hard edge, 1 = very soft. */
  softness: number;
  accent: string;
  description: string;
  custom?: boolean;
}

export type MountType = 'truss' | 'floor' | 'riser';

export interface FixtureObject {
  id: string;
  name: string;
  profileId: string;
  /** Stage-space metres. Y is the lens height. */
  x: number;
  y: number;
  z: number;
  /** Physical fixture yaw (degrees), independent of pan/tilt. */
  yaw: number;
  mount: MountType;
}

export interface TrussObject {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  /** Length in metres along local X. */
  length: number;
  /** Y rotation in degrees. */
  rotation: number;
}

export interface RiserObject {
  id: string;
  name: string;
  x: number;
  /** Base height. */
  y: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  rotation: number;
  color: string;
}

export interface PerformerObject {
  id: string;
  name: string;
  x: number;
  z: number;
  /** Total height in metres. */
  height: number;
  rotation: number;
  color: string;
}

export interface StageState {
  trusses: TrussObject[];
  risers: RiserObject[];
  performers: PerformerObject[];
  fixtures: FixtureObject[];
}

export type CurveName =
  | 'linear'
  | 'smooth'
  | 'easeIn'
  | 'easeOut'
  | 'snap'
  | 'back';

export interface FixtureState {
  /** 0..1 dimmer. */
  intensity: number;
  /** sRGB hex. */
  color: string;
  /** Absolute pan, degrees. 0 = downstage (+Z). */
  pan: number;
  /** Absolute tilt from straight down, degrees. */
  tilt: number;
  /** 0..1 zoom within the profile's beam range. */
  zoom: number;
  /** Gobo rotation offset in degrees. */
  goboRotation: number;
}

export interface Cue {
  id: string;
  name: string;
  /** Seconds on the timeline. */
  time: number;
  /** Fade duration in seconds. */
  fade: number;
  curve: CurveName;
  /** Colour used for the cue marker in the UI. */
  tag: string;
  note: string;
  states: Record<string, FixtureState>;
}

export interface Venue {
  id: string;
  name: string;
  width: number;
  depth: number;
  height: number;
  /** Short venue / room description. */
  subtitle: string;
  accent: string;
  stage: StageState;
  cues: Cue[];
  createdAt: string;
  updatedAt: string;
  stressTest?: boolean;
}

export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra' | 'custom';

export interface RenderSettings {
  quality: QualityLevel;
  /** Internal scene render scale. 1 = native. */
  renderScale: number;
  shadowLights: number;
  shadowMapSize: 256 | 384 | 512 | 768 | 1024;
  volumetric: boolean;
  volScale: number;
  volSteps: number;
  volLights: number;
  bloom: boolean;
  bloomStrength: number;
  exposure: number;
  autoExposure: boolean;
  smokeDensity: number;
  showFps: boolean;
  /** Render at a fixed 1920x1080 for honest performance comparisons. */
  benchmark: boolean;
}

export interface Project {
  version: 1;
  name: string;
  activeVenueId: string;
  venues: Venue[];
  profiles: FixtureProfile[];
  settings: RenderSettings;
  savedAt: string;
}

export interface LiveState {
  fixtureId: string;
  state: FixtureState;
}

export interface ToastMessage {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'error';
}

export const MAX_FIXTURES = 48;
export const GRID_SIZE = 0.5;
