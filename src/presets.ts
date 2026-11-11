import { aimAt, kelvinToHex } from './math';
import type {
  Cue,
  CurveName,
  FixtureObject,
  FixtureProfile,
  FixtureState,
  Project,
  RenderSettings,
  StageState,
  Venue,
} from './types';

export function newId(prefix = 'id'): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rnd}`;
}

export const DEFAULT_SETTINGS: RenderSettings = {
  quality: 'medium',
  renderScale: 1,
  shadowLights: 16,
  shadowMapSize: 512,
  volumetric: true,
  volScale: 0.5,
  volSteps: 28,
  volLights: 16,
  bloom: true,
  bloomStrength: 0.45,
  exposure: 0.6,
  autoExposure: true,
  smokeDensity: 0.22,
  showFps: true,
  benchmark: false,
};

export const PROFILES_SEED: FixtureProfile[] = [
  {
    id: 'profile-beam-380',
    name: 'BEAM 380',
    kind: 'beam',
    beamAngle: 2.4,
    zoomAngle: 9,
    colorTemp: 7800,
    output: 16000,
    gobo: 'none',
    goboRotation: 0,
    softness: 0.12,
    accent: '#7dd3fc',
    description: '超窄角光束，硬边，适合空中造型与观众席扫射。',
  },
  {
    id: 'profile-wash-19',
    name: 'WASH 19×15',
    kind: 'wash',
    beamAngle: 18,
    zoomAngle: 58,
    colorTemp: 5600,
    output: 12000,
    gobo: 'none',
    goboRotation: 0,
    softness: 0.82,
    accent: '#a78bfa',
    description: '19 颗 RGBW 灯珠，广角柔光，舞台基础染色。',
  },
  {
    id: 'profile-spot-750',
    name: 'PROFILE 750',
    kind: 'spot',
    beamAngle: 9,
    zoomAngle: 34,
    colorTemp: 6600,
    output: 20000,
    gobo: 'dots',
    goboRotation: 18,
    softness: 0.32,
    accent: '#fbbf24',
    description: '高显色图案灯，可变焦，内置可旋转图案片。',
  },
  {
    id: 'profile-beam-rgb',
    name: 'BEAM X RGBW',
    kind: 'beam',
    beamAngle: 3.2,
    zoomAngle: 12,
    colorTemp: 6200,
    output: 14500,
    gobo: 'breakup',
    goboRotation: 0,
    softness: 0.16,
    accent: '#f472b6',
    description: 'RGBW 光束，色温与图案可独立调节的客制型号。',
  },
];

export function defaultProfileColor(profile: FixtureProfile): string {
  return kelvinToHex(profile.colorTemp);
}

export function createDefaultState(profile: FixtureProfile, fixture?: FixtureObject): FixtureState {
  let pan = 0;
  let tilt = 35;
  if (fixture) {
    const aim = aimAt([fixture.x, fixture.y, fixture.z], [0, 1.1, -1.5]);
    pan = aim.pan;
    tilt = aim.tilt;
  }
  return {
    intensity: 0.6,
    color: defaultProfileColor(profile),
    pan,
    tilt,
    zoom: 0.35,
    goboRotation: profile.goboRotation,
  };
}

export function makeTruss(
  name: string,
  x: number,
  y: number,
  z: number,
  length: number,
  rotation = 0
) {
  return { id: newId('truss'), name, x, y, z, length, rotation };
}

export function createStarterStage(width: number, depth: number): StageState {
  const truss = makeTruss('FRONT TRUSS', 0, Math.min(8.5, 9), depth * 0.12, Math.min(14, width * 0.5));
  const profiles = ['profile-beam-380', 'profile-wash-19', 'profile-spot-750'];
  const fixtures: FixtureObject[] = [];
  for (let i = 0; i < 6; i++) {
    const x = -5 + i * 2;
    const profileId = profiles[i % 3];
    fixtures.push({
      id: newId('fx'),
      name: `${profileId.includes('beam') ? 'BEAM' : profileId.includes('wash') ? 'WASH' : 'SPOT'} ${String(
        i + 1
      ).padStart(2, '0')}`,
      profileId,
      x,
      y: truss.y - 0.55,
      z: truss.z,
      yaw: 0,
      mount: 'truss',
    });
  }
  return { trusses: [truss], risers: [], performers: [], fixtures };
}

export function createBlankVenue(
  name: string,
  width: number,
  depth: number,
  height: number,
  subtitle = '新建场馆'
): Venue {
  const now = new Date().toISOString();
  return {
    id: newId('venue'),
    name,
    width,
    depth,
    height,
    subtitle,
    accent: '#59e1ff',
    stage: createStarterStage(width, depth),
    cues: [],
    createdAt: now,
    updatedAt: now,
  };
}

interface FixtureSpec {
  profileId: string;
  x: number;
  y: number;
  z: number;
  index: number;
}

function cueState(
  fixture: FixtureObject,
  profile: FixtureProfile,
  color: string,
  intensity: number,
  panOffset: number,
  tiltOffset: number,
  zoom = 0.3,
  goboRotation = 0
): FixtureState {
  const aim = aimAt(
    [fixture.x, fixture.y, fixture.z],
    [-fixture.x * 0.38, 0.9, -1.8]
  );
  return {
    intensity,
    color,
    pan: (aim.pan + panOffset + 360) % 360,
    tilt: Math.max(0, Math.min(120, aim.tilt + tiltOffset)),
    zoom,
    goboRotation,
  };
}

export function createStressVenue(): Venue {
  const now = new Date().toISOString();
  const width = 46;
  const depth = 32;
  const height = 15;
  const trussSpecs = [
    { name: 'FRONT TRUSS', z: 4.2, y: 9.8, length: 21 },
    { name: 'MID TRUSS', z: -2.3, y: 10.4, length: 22 },
    { name: 'BACK TRUSS', z: -7.2, y: 9.7, length: 20 },
  ];
  const trusses = trussSpecs.map((t) => makeTruss(t.name, 0, t.y, t.z, t.length));

  const fixtures: FixtureObject[] = [];
  const profiles: FixtureProfile[] = PROFILES_SEED;
  const pick = (row: number, col: number): FixtureProfile => {
    const order: FixtureProfile[][] = [
      [profiles[1], profiles[0], profiles[1], profiles[3], profiles[0]],
      [profiles[0], profiles[2], profiles[0], profiles[2], profiles[0]],
      [profiles[2], profiles[0], profiles[2], profiles[0], profiles[3]],
    ];
    return order[row][col];
  };
  let count = 0;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 10; col++) {
      const truss = trusses[row];
      const x = -9.45 + col * 2.1;
      const profile = pick(row, col);
      count++;
      const label = profile.kind === 'beam' ? 'BEAM' : profile.kind === 'wash' ? 'WASH' : 'SPOT';
      fixtures.push({
        id: newId('fx'),
        name: `${label} ${String(count).padStart(2, '0')}`,
        profileId: profile.id,
        x,
        y: truss.y - 0.55,
        z: truss.z,
        yaw: 0,
        mount: 'truss',
      });
    }
  }

  const risers = [
    {
      id: newId('riser'),
      name: 'MAIN DECK',
      x: 0,
      y: 0,
      z: -5.6,
      width: 16,
      depth: 7,
      height: 0.85,
      rotation: 0,
      color: '#12161d',
    },
    {
      id: newId('riser'),
      name: 'BACK STEPS',
      x: 0,
      y: 0,
      z: -9.1,
      width: 11,
      depth: 1.2,
      height: 1.6,
      rotation: 0,
      color: '#0e1218',
    },
    {
      id: newId('riser'),
      name: 'SIDE STEP L',
      x: -5.8,
      y: 0,
      z: 0.9,
      width: 3,
      depth: 1.1,
      height: 0.45,
      rotation: 0,
      color: '#161b22',
    },
    {
      id: newId('riser'),
      name: 'SIDE STEP R',
      x: 5.8,
      y: 0,
      z: 0.9,
      width: 3,
      depth: 1.1,
      height: 0.45,
      rotation: 0,
      color: '#161b22',
    },
    {
      id: newId('riser'),
      name: 'LED WALL',
      x: 0,
      y: 0,
      z: -11.4,
      width: 18,
      depth: 0.35,
      height: 6.8,
      rotation: 0,
      color: '#080b12',
    },
  ];

  const performers = [
    {
      id: newId('perf'),
      name: 'VOCAL 01',
      x: -2.4,
      z: -1.1,
      height: 1.78,
      rotation: 8,
      color: '#1b1d25',
    },
    {
      id: newId('perf'),
      name: 'VOCAL 02',
      x: 0,
      z: -1.8,
      height: 1.72,
      rotation: -4,
      color: '#22252f',
    },
    {
      id: newId('perf'),
      name: 'GUITAR',
      x: 2.8,
      z: -0.7,
      height: 1.74,
      rotation: 15,
      color: '#191b22',
    },
    {
      id: newId('perf'),
      name: 'DANCER 01',
      x: -5.1,
      z: 0.2,
      height: 1.68,
      rotation: -18,
      color: '#24202a',
    },
    {
      id: newId('perf'),
      name: 'DANCER 02',
      x: 5.2,
      z: 0.2,
      height: 1.68,
      rotation: 18,
      color: '#211f2a',
    },
  ];

  const stage: StageState = { trusses, risers, performers, fixtures };
  const cues: Cue[] = [];

  const blueLook = ['#39c8ff', '#2f6bff', '#7b4dff', '#54e6ff', '#ffb15c'];
  const magentaLook = ['#ff3ca6', '#ff5e3a', '#b650ff', '#ff7a1a', '#ffd166'];
  const whiteLook = ['#eef7ff', '#dfeaff', '#fff4e6', '#cfe6ff', '#ffffff'];
  const amberLook = ['#ffb347', '#ff8a2b', '#ff5940', '#ffd08a', '#ff3d6e'];

  const buildCue = (
    index: number,
    name: string,
    time: number,
    fade: number,
    curve: CurveName,
    tag: string,
    palette: string[],
    intensity: number,
    panOffset: number,
    tiltOffset: number
  ) => {
    const states: Record<string, FixtureState> = {};
    fixtures.forEach((fx, i) => {
      const profile = profiles.find((p) => p.id === fx.profileId)!;
      const band = i % palette.length;
      const spread = Math.floor(i / 10);
      const alternate = i % 2 === 0 ? 1 : -1;
      states[fx.id] = cueState(
        fx,
        profile,
        palette[band],
        Math.min(1, intensity + ((i % 5) - 2) * 0.02),
        panOffset * alternate * (1 + spread * 0.18),
        tiltOffset * alternate,
        profile.kind === 'wash' ? 0.55 : profile.kind === 'beam' ? 0.1 : 0.4,
        index * 22 + i * 7
      );
    });
    return {
      id: newId('cue'),
      name,
      time,
      fade,
      curve,
      tag,
      note: '',
      states,
    } satisfies Cue;
  };

  cues.push(
    buildCue(0, 'OPEN — BLUE HAZE', 0, 2.5, 'smooth', '#39c8ff', blueLook, 0.82, 0, 0),
    buildCue(1, 'CROSS SWEEP', 6, 4.5, 'smooth', '#ff4da6', magentaLook, 0.7, 24, -8),
    buildCue(2, 'WHITE ACCENT', 12, 2, 'easeOut', '#ffffff', whiteLook, 0.48, -10, 6),
    buildCue(3, 'GOLD FINALE', 18, 3.5, 'smooth', '#ffb347', amberLook, 0.9, 34, -12),
    buildCue(4, 'BLACKOUT', 25, 2.5, 'easeIn', '#6b7280', blueLook, 0, 0, 0)
  );

  return {
    id: newId('venue'),
    name: 'NOVA ARENA',
    subtitle: '30 灯压力测试场 · 46 × 32 m',
    width,
    depth,
    height,
    accent: '#59e1ff',
    stage,
    cues,
    createdAt: now,
    updatedAt: now,
    stressTest: true,
  };
}

export function createTheatreVenue(): Venue {
  const now = new Date().toISOString();
  const width = 34;
  const depth = 26;
  const height = 12;
  const trusses = [
    makeTruss('HOUSE TRUSS', 0, 8.2, 5.2, 16),
    makeTruss('MID TRUSS', 0, 8.8, -2, 14),
  ];
  const fixtures: FixtureObject[] = [];
  for (let i = 0; i < 8; i++) {
    fixtures.push({
      id: newId('fx'),
      name: `${i < 4 ? 'WASH' : 'PROFILE'} ${String(i + 1).padStart(2, '0')}`,
      profileId: i < 4 ? 'profile-wash-19' : 'profile-spot-750',
      x: -7 + (i % 4) * 4.4 + (i < 4 ? 0 : 0.6),
      y: (i < 4 ? trusses[0].y : trusses[1].y) - 0.55,
      z: i < 4 ? trusses[0].z : trusses[1].z,
      yaw: 0,
      mount: 'truss',
    });
  }
  const stage: StageState = {
    trusses,
    risers: [
      {
        id: newId('riser'),
        name: 'ORCHESTRA RISER',
        x: 0,
        y: 0,
        z: -7.5,
        width: 12,
        depth: 3,
        height: 0.9,
        rotation: 0,
        color: '#151921',
      },
    ],
    performers: [
      { id: newId('perf'), name: 'PRINCIPAL', x: 0, z: -1, height: 1.75, rotation: 0, color: '#1c1f28' },
      { id: newId('perf'), name: 'ENSEMBLE', x: -3.2, z: 0.4, height: 1.7, rotation: 12, color: '#20232c' },
    ],
    fixtures,
  };
  const cueStates: Record<string, FixtureState> = {};
  fixtures.forEach((fx, i) => {
    const p = PROFILES_SEED.find((x) => x.id === fx.profileId)!;
    cueStates[fx.id] = {
      intensity: 0.72,
      color: i < 4 ? '#ffd3a1' : '#b9d6ff',
      pan: aimAt([fx.x, fx.y, fx.z], [fx.x * 0.2, 1, -1]).pan,
      tilt: aimAt([fx.x, fx.y, fx.z], [fx.x * 0.2, 1, -1]).tilt,
      zoom: p.kind === 'wash' ? 0.6 : 0.4,
      goboRotation: i * 15,
    };
  });
  return {
    id: newId('venue'),
    name: 'ORPHEUM THEATRE',
    subtitle: '经典镜框式舞台 · 34 × 26 m',
    width,
    depth,
    height,
    accent: '#f0b36b',
    stage,
    cues: [
      {
        id: newId('cue'),
        name: 'HOUSE PRESET',
        time: 0,
        fade: 2,
        curve: 'smooth',
        tag: '#f0b36b',
        note: '',
        states: cueStates,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

export function createClubVenue(): Venue {
  const now = new Date().toISOString();
  const width = 24;
  const depth = 18;
  const height = 9;
  const truss = makeTruss('CLUB TRUSS', 0, 7, 0, 14);
  const fixtures: FixtureObject[] = [];
  for (let i = 0; i < 8; i++) {
    fixtures.push({
      id: newId('fx'),
      name: `BEAM ${String(i + 1).padStart(2, '0')}`,
      profileId: i % 3 === 0 ? 'profile-beam-rgb' : 'profile-beam-380',
      x: -6.3 + i * 1.8,
      y: truss.y - 0.5,
      z: truss.z,
      yaw: 0,
      mount: 'truss',
    });
  }
  return {
    id: newId('venue'),
    name: 'SUB LEVEL',
    subtitle: '地下俱乐部 · 24 × 18 m',
    width,
    depth,
    height,
    accent: '#ff4d9d',
    stage: {
      trusses: [truss],
      risers: [
        {
          id: newId('riser'),
          name: 'DJ BOOTH',
          x: 0,
          y: 0,
          z: -4,
          width: 5,
          depth: 2,
          height: 1.1,
          rotation: 0,
          color: '#11131a',
        },
      ],
      performers: [],
      fixtures,
    },
    cues: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createSeedProject(): Project {
  const stress = createStressVenue();
  return {
    version: 1,
    name: 'Untitled Show',
    activeVenueId: stress.id,
    venues: [stress, createTheatreVenue(), createClubVenue()],
    profiles: PROFILES_SEED.map((p) => ({ ...p })),
    settings: { ...DEFAULT_SETTINGS },
    savedAt: new Date().toISOString(),
  };
}
