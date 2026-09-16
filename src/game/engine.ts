import { NexusAudio } from "./audio";
import { loadSave, writeSave, type SaveData } from "./save";

export type GameMode = "attract" | "playing" | "dead";

export type Palette = {
  bg: string;
  wedgeA: string;
  wedgeB: string;
  ink: string;
  player: string;
};

export const PALETTES: Palette[] = [
  { bg: "#07080c", wedgeA: "#0d121c", wedgeB: "#090c12", ink: "#d7e8e6", player: "#f4f7fb" },
  { bg: "#08070a", wedgeA: "#161218", wedgeB: "#100d12", ink: "#f0ddd0", player: "#fff6ee" },
  { bg: "#050907", wedgeA: "#0c1612", wedgeB: "#08110e", ink: "#cdeee0", player: "#f3fff8" },
  { bg: "#0b0707", wedgeA: "#1a1010", wedgeB: "#120b0b", ink: "#f0cfc8", player: "#fff1ee" },
  { bg: "#07080c", wedgeA: "#14161c", wedgeB: "#0b0c10", ink: "#e8eef5", player: "#ffffff" },
];

export type Wall = {
  radius: number;
  thickness: number;
  mask: number;
  rot: number;
  grazed: boolean;
};

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
};

export type Floater = {
  text: string;
  x: number;
  y: number;
  life: number;
  maxLife: number;
};

export type HudState = {
  mode: GameMode;
  time: number;
  score: number;
  bestTime: number;
  bestScore: number;
  games: number;
  stage: number;
  combo: number;
  newBest: boolean;
  muted: boolean;
  reduceShake: boolean;
  stageFlash: number;
};

const SIDES = 6;
const SIDE_ANGLE = (Math.PI * 2) / SIDES;
const PLAYER_R = 92;
const CORE_R = 40;
const SPAWN_R = 540;
const WALL_THICK = 16;
const PLAYER_HALF = 0.11; // radians of hitbox
const FIXED = 1 / 120;
const GRAZE_WINDOW = 0.2;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function oneGap(g: number): number {
  return 0b111111 ^ (1 << (((g % 6) + 6) % 6));
}

function twoOpp(g: number): number {
  return oneGap(g) & oneGap(g + 3);
}

function twoAdj(g: number): number {
  return oneGap(g) & oneGap(g + 1);
}

function threeAlt(g: number): number {
  return oneGap(g) & oneGap(g + 2) & oneGap(g + 4);
}

type Step = { mask: number; beats: number };

function pickPattern(stage: number, rng: () => number): Step[] {
  const g = Math.floor(rng() * 6);
  const pool: Step[][] = [
    [
      { mask: oneGap(g), beats: 1.1 },
      { mask: oneGap(g + 1), beats: 1.1 },
      { mask: oneGap(g + 2), beats: 1.2 },
    ],
    [
      { mask: twoOpp(g), beats: 0.9 },
      { mask: twoOpp(g + 1), beats: 0.9 },
      { mask: twoOpp(g), beats: 1.0 },
    ],
    [
      { mask: oneGap(g), beats: 0.85 },
      { mask: oneGap(g), beats: 0.85 },
      { mask: oneGap(g + 1), beats: 1.1 },
    ],
    [
      { mask: twoAdj(g), beats: 1.0 },
      { mask: twoAdj(g + 1), beats: 1.05 },
    ],
    [
      { mask: threeAlt(g), beats: 0.8 },
      { mask: threeAlt(g + 1), beats: 0.85 },
    ],
  ];

  if (stage >= 2) {
    pool.push([
      { mask: oneGap(g), beats: 0.7 },
      { mask: oneGap(g + 1), beats: 0.7 },
      { mask: oneGap(g + 2), beats: 0.7 },
      { mask: oneGap(g + 3), beats: 0.9 },
    ]);
  }
  if (stage >= 3) {
    pool.push([
      { mask: twoOpp(g), beats: 0.65 },
      { mask: twoOpp(g), beats: 0.65 },
      { mask: twoOpp(g + 1), beats: 0.9 },
    ]);
    pool.push([
      { mask: oneGap(g), beats: 0.6 },
      { mask: oneGap(g + 2), beats: 0.95 },
    ]);
  }
  if (stage >= 4) {
    pool.push([
      { mask: oneGap(g), beats: 0.55 },
      { mask: oneGap(g + 1), beats: 0.55 },
      { mask: oneGap(g + 2), beats: 0.55 },
      { mask: oneGap(g + 3), beats: 0.55 },
      { mask: oneGap(g + 4), beats: 0.8 },
    ]);
  }

  return pool[Math.floor(rng() * pool.length)] ?? pool[0]!;
}

function sideAt(angle: number, rot: number): number {
  let a = angle - rot;
  a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return Math.floor(a / SIDE_ANGLE) % SIDES;
}

function distToGapEdge(angle: number, rot: number, mask: number): number {
  let best = Math.PI;
  for (let i = 0; i < SIDES; i++) {
    if ((mask & (1 << i)) !== 0) continue;
    const start = rot + i * SIDE_ANGLE;
    const end = start + SIDE_ANGLE;
    best = Math.min(best, angularDist(angle, start), angularDist(angle, end));
  }
  return best;
}

function signedAngle(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function angularDist(a: number, b: number): number {
  return Math.abs(signedAngle(a, b));
}

export class NexusEngine {
  mode: GameMode = "attract";
  time = 0;
  score = 0;
  stage = 0;
  combo = 0;
  angle = 0;
  dir: 1 | -1 = 1;
  walls: Wall[] = [];
  particles: Particle[] = [];
  floaters: Floater[] = [];
  pulse = 1;
  beatPhase = 0;
  trauma = 0;
  hitstop = 0;
  flash = 0;
  stageFlash = 0;
  deathAge = 0;
  newBest = false;
  worldSpin = 0;
  trail: number[] = [];
  paletteIndex = 0;
  reduceShake = false;
  muted = false;

  readonly playerR = PLAYER_R;
  readonly coreR = CORE_R;
  readonly sides = SIDES;

  private acc = 0;
  private rng: () => number = Math.random;
  private nextSpawn = 0;
  private spawnQueue: { t: number; mask: number }[] = [];
  private beatClock = 0;
  private bpm = 128;
  private lastBeat = 0;
  private save: SaveData;
  private audio = new NexusAudio();
  private particleI = 0;
  private readonly particlePool: Particle[] = [];
  private hudListeners = new Set<() => void>();
  private hudDirty = false;
  private hudAcc = 0;

  constructor() {
    this.save = loadSave();
    this.muted = this.save.muted;
    this.reduceShake = this.save.reduceShake;
    this.audio.setMuted(this.muted);
    for (let i = 0; i < 280; i++) {
      this.particlePool.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 1, color: "#fff" });
    }
    this.resetAttract();
  }

  get hud(): HudState {
    return {
      mode: this.mode,
      time: this.time,
      score: this.score,
      bestTime: this.save.bestTime,
      bestScore: this.save.bestScore,
      games: this.save.games,
      stage: this.stage,
      combo: this.combo,
      newBest: this.newBest,
      muted: this.muted,
      reduceShake: this.reduceShake,
      stageFlash: this.stageFlash,
    };
  }

  onHud(fn: () => void): () => void {
    this.hudListeners.add(fn);
    return () => this.hudListeners.delete(fn);
  }

  notifyHud(): void {
    this.hudDirty = true;
  }

  flushHud(): void {
    if (!this.hudDirty) return;
    this.hudDirty = false;
    for (const fn of this.hudListeners) fn();
  }

  unlockAudio(): void {
    this.audio.unlock();
    this.audio.setMuted(this.muted);
  }

  resumeAudio(): void {
    this.audio.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.save.muted = muted;
    writeSave(this.save);
    this.audio.setMuted(muted);
    this.notifyHud();
  }

  setReduceShake(v: boolean): void {
    this.reduceShake = v;
    this.save.reduceShake = v;
    writeSave(this.save);
    this.notifyHud();
  }

  startRun(): void {
    this.unlockAudio();
    this.mode = "playing";
    this.time = 0;
    this.score = 0;
    this.stage = 0;
    this.combo = 0;
    this.angle = -Math.PI / 2;
    this.dir = Math.random() < 0.5 ? 1 : -1;
    this.walls = [];
    this.floaters = [];
    this.trail = [];
    this.pulse = 1;
    this.beatPhase = 0;
    this.trauma = 0;
    this.hitstop = 0;
    this.flash = 0.35;
    this.stageFlash = 0.8;
    this.deathAge = 0;
    this.newBest = false;
    this.worldSpin = 0;
    this.paletteIndex = 0;
    this.acc = 0;
    this.rng = mulberry32((Math.random() * 0xffffffff) | 0);
    this.nextSpawn = 0.55;
    this.spawnQueue = [];
    this.beatClock = 0;
    this.bpm = 128;
    this.lastBeat = 0;
    this.save.games += 1;
    writeSave(this.save);
    this.audio.beat(1.2);
    this.notifyHud();
  }

  resetAttract(): void {
    this.mode = "attract";
    this.time = 0;
    this.score = 0;
    this.stage = 0;
    this.combo = 0;
    this.angle = -Math.PI / 2;
    this.dir = 1;
    this.walls = [];
    this.floaters = [];
    this.trail = [];
    this.pulse = 1;
    this.trauma = 0;
    this.flash = 0;
    this.stageFlash = 0;
    this.deathAge = 0;
    this.paletteIndex = 0;
    this.rng = mulberry32(7);
    this.nextSpawn = 0.3;
    this.spawnQueue = [];
    this.bpm = 118;
    this.acc = 0;
    this.notifyHud();
  }

  reverse(): void {
    if (this.mode === "dead") {
      if (this.deathAge > 0.28) this.startRun();
      return;
    }
    if (this.mode === "attract") {
      this.startRun();
      return;
    }
    this.dir = this.dir === 1 ? -1 : 1;
    this.flash = Math.max(this.flash, 0.12);
    this.addTrauma(0.18);
    this.burst(PLAYER_R, this.angle, 8, this.palette.player, 90);
    this.audio.reverse();
  }

  setDir(dir: 1 | -1): void {
    if (this.mode === "attract") {
      this.startRun();
      this.dir = dir;
      return;
    }
    if (this.mode !== "playing") return;
    if (this.dir === dir) return;
    this.dir = dir;
    this.flash = Math.max(this.flash, 0.1);
    this.addTrauma(0.14);
    this.burst(PLAYER_R, this.angle, 6, this.palette.player, 70);
    this.audio.reverse();
  }

  get palette(): Palette {
    return PALETTES[this.paletteIndex % PALETTES.length]!;
  }

  private addTrauma(v: number): void {
    if (this.reduceShake) v *= 0.25;
    this.trauma = Math.min(1, this.trauma + v);
  }

  private burst(r: number, a: number, n: number, color: string, speed: number): void {
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    for (let i = 0; i < n; i++) {
      const p = this.particlePool[this.particleI % this.particlePool.length]!;
      this.particleI += 1;
      const t = (Math.PI * 2 * i) / n + Math.random() * 0.4;
      const s = speed * (0.45 + Math.random() * 0.7);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(t) * s;
      p.vy = Math.sin(t) * s;
      p.life = 0.28 + Math.random() * 0.28;
      p.maxLife = p.life;
      p.size = 1.4 + Math.random() * 2.4;
      p.color = color;
      if (!this.particles.includes(p)) this.particles.push(p);
    }
  }

  private floaterAt(text: string, r: number, a: number): void {
    this.floaters.push({
      text,
      x: Math.cos(a) * r,
      y: Math.sin(a) * r,
      life: 0.7,
      maxLife: 0.7,
    });
  }

  private playerSpeed(): number {
    return 2.35 + Math.min(1.7, this.time * 0.028 + this.stage * 0.12);
  }

  private wallSpeed(): number {
    return 210 + Math.min(260, this.time * 4.2 + this.stage * 18);
  }

  tick(dt: number): void {
    const capped = Math.min(dt, 0.1);
    if (this.hitstop > 0) {
      this.hitstop -= capped;
      this.flash = Math.max(this.flash - capped * 2, 0);
      this.updatePresentation(capped);
      return;
    }
    this.acc += capped;
    while (this.acc >= FIXED) {
      this.step(FIXED);
      this.acc -= FIXED;
    }
    this.updatePresentation(capped);
  }

  private step(dt: number): void {
    this.bpm = (this.mode === "attract" ? 118 : 128) + Math.min(52, this.time * 0.85);
    const beatDur = 60 / this.bpm;
    this.beatClock += dt;
    this.beatPhase = (this.beatClock % beatDur) / beatDur;
    const beatN = Math.floor(this.beatClock / beatDur);
    if (beatN !== this.lastBeat) {
      this.lastBeat = beatN;
      if (this.mode === "playing") this.audio.beat(0.55 + Math.min(0.5, this.stage * 0.08));
    }

    const pulseKick = this.beatPhase < 0.12 ? 1 - this.beatPhase / 0.12 : 0;
    this.pulse = 1 + pulseKick * 0.055;

    if (this.mode === "dead") {
      this.deathAge += dt;
      this.angle += this.dir * 0.35 * dt;
      this.advanceWalls(dt, false);
      return;
    }

    this.time += dt;
    this.angle += this.dir * this.playerSpeed() * dt;
    this.worldSpin += dt * (0.12 + this.stage * 0.02);
    this.trail.push(this.angle);
    if (this.trail.length > 10) this.trail.shift();

    if (this.mode === "attract") this.attractSteer();

    if (this.mode === "playing") {
      const nextStage = Math.floor(this.time / 12);
      if (nextStage > this.stage) {
        this.stage = nextStage;
        this.paletteIndex = this.stage % PALETTES.length;
        this.stageFlash = 1;
        this.flash = 0.4;
        this.addTrauma(0.35);
        this.audio.stageUp();
        this.notifyHud();
      }
      this.score = Math.floor(this.time * 100) + this.combo * 25;
      this.audio.setTension(this.stage, this.time);
    }

    this.spawnWalls();
    this.advanceWalls(dt, this.mode === "playing");

    this.hudAcc += dt;
    if (this.mode === "playing" && this.hudAcc >= 0.05) {
      this.hudAcc = 0;
      this.notifyHud();
    }
  }

  private attractSteer(): void {
    let nearest: Wall | null = null;
    for (const w of this.walls) {
      if (w.radius < PLAYER_R) continue;
      if (!nearest || w.radius < nearest.radius) nearest = w;
    }
    if (!nearest || nearest.radius > PLAYER_R + 140) return;
    const side = sideAt(this.angle, nearest.rot);
    if ((nearest.mask & (1 << side)) === 0) return;
    let best = 99;
    let bestDir: 1 | -1 = this.dir;
    for (let i = 0; i < SIDES; i++) {
      if ((nearest.mask & (1 << i)) !== 0) continue;
      const center = nearest.rot + i * SIDE_ANGLE + SIDE_ANGLE / 2;
      const d = signedAngle(this.angle, center);
      if (Math.abs(d) < best) {
        best = Math.abs(d);
        bestDir = d >= 0 ? 1 : -1;
      }
    }
    this.dir = bestDir;
  }

  private spawnWalls(): void {
    const beatDur = 60 / this.bpm;
    while (this.nextSpawn < this.time + 3.2) {
      const pattern = pickPattern(this.mode === "attract" ? 1 : this.stage, this.rng);
      for (const step of pattern) {
        this.spawnQueue.push({ t: this.nextSpawn, mask: step.mask });
        this.nextSpawn += step.beats * beatDur;
      }
    }
    const rest: { t: number; mask: number }[] = [];
    for (const item of this.spawnQueue) {
      if (item.t <= this.time) {
        this.walls.push({
          radius: SPAWN_R,
          thickness: WALL_THICK,
          mask: item.mask,
          rot: 0,
          grazed: false,
        });
      } else {
        rest.push(item);
      }
    }
    this.spawnQueue = rest;
  }

  private advanceWalls(dt: number, collide: boolean): void {
    const speed = this.wallSpeed();
    const keep: Wall[] = [];
    for (const wall of this.walls) {
      const prev = wall.radius;
      wall.radius -= speed * dt;
      if (collide && prev >= PLAYER_R && wall.radius <= PLAYER_R) {
        this.onCross(wall);
      }
      if (wall.radius + wall.thickness > this.coreR - 8) keep.push(wall);
      else if (this.mode === "playing") {
        this.score += 10;
      }
    }
    this.walls = keep;
  }

  private onCross(wall: Wall): void {
    const a = this.angle;
    const samples = [-PLAYER_HALF, 0, PLAYER_HALF];
    let hit = false;
    for (const off of samples) {
      const side = sideAt(a + off, wall.rot);
      if ((wall.mask & (1 << side)) !== 0) {
        hit = true;
        break;
      }
    }
    if (hit) {
      this.die();
      return;
    }

    this.audio.pass();
    const edge = distToGapEdge(a, wall.rot, wall.mask);
    if (edge < GRAZE_WINDOW && !wall.grazed) {
      wall.grazed = true;
      this.combo += 1;
      this.score += 50 + this.combo * 10;
      this.floaterAt(this.combo > 2 ? `${this.combo}x GRAZE` : "GRAZE", PLAYER_R + 18, a);
      this.flash = Math.max(this.flash, 0.18);
      this.addTrauma(0.22);
      this.burst(PLAYER_R, a, 14, this.palette.ink, 140);
      this.audio.graze();
      this.notifyHud();
    } else if (this.combo > 0) {
      this.combo = 0;
      this.notifyHud();
    }
  }

  private die(): void {
    this.mode = "dead";
    this.deathAge = 0;
    this.hitstop = 0.09;
    this.flash = 0.7;
    this.addTrauma(0.85);
    this.burst(PLAYER_R, this.angle, 28, this.palette.ink, 220);
    this.burst(PLAYER_R, this.angle, 12, this.palette.player, 140);
    this.audio.death();

    const t = this.time;
    const s = this.score;
    if (t > this.save.bestTime) {
      this.save.bestTime = t;
      this.newBest = true;
    }
    if (s > this.save.bestScore) {
      this.save.bestScore = s;
      this.newBest = true;
    }
    writeSave(this.save);
    this.notifyHud();
  }

  private updatePresentation(dt: number): void {
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    this.flash = Math.max(0, this.flash - dt * 2.4);
    this.stageFlash = Math.max(0, this.stageFlash - dt * 0.9);

    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const f of this.floaters) {
      f.life -= dt;
      f.y -= 28 * dt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
  }

  destroy(): void {
    this.audio.destroy();
    this.hudListeners.clear();
  }
}
