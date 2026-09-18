import type { NexusEngine, Palette } from "./engine";

function hexPoint(r: number, i: number, rot: number): [number, number] {
  const a = (i * Math.PI) / 3 + rot;
  return [Math.cos(a) * r, Math.sin(a) * r];
}

function noise(t: number): number {
  return Math.sin(t * 17.13) * Math.cos(t * 9.21);
}

function drawHex(ctx: CanvasRenderingContext2D, r: number, rot: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const [x, y] = hexPoint(r, i, rot);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function wallQuad(
  ctx: CanvasRenderingContext2D,
  inner: number,
  outer: number,
  side: number,
  rot: number,
): void {
  const [x0, y0] = hexPoint(inner, side, rot);
  const [x1, y1] = hexPoint(inner, side + 1, rot);
  const [x2, y2] = hexPoint(outer, side + 1, rot);
  const [x3, y3] = hexPoint(outer, side, rot);
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.closePath();
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  engine: NexusEngine,
  w: number,
  h: number,
  reducedMotion: boolean,
): void {
  const pal: Palette = engine.palette;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, w, h);

  const viewR = 390;
  const scale = (Math.min(w, h) * 0.5) / viewR;
  const trauma = reducedMotion || engine.reduceShake ? engine.trauma * 0.2 : engine.trauma;
  const shake = trauma * trauma;
  const now = engine.time;
  const rotCam = -engine.angle - Math.PI / 2;

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(rotCam);
  ctx.translate(noise(now * 8) * shake * 14 * scale, noise(now * 8 + 4) * shake * 14 * scale);
  ctx.scale(scale * engine.pulse, scale * engine.pulse);

  drawWedges(ctx, pal, 0);
  drawWalls(ctx, engine, pal);
  drawCore(ctx, engine, pal);
  drawPlayer(ctx, engine, pal);
  drawParticles(ctx, engine);
  drawFloaters(ctx, engine, pal);

  ctx.restore();

  // vignette
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.min(w, h) * 0.72);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  if (engine.flash > 0) {
    ctx.fillStyle = `rgba(232,238,245,${engine.flash * 0.22})`;
    ctx.fillRect(0, 0, w, h);
  }

  if (engine.mode === "dead") {
    ctx.fillStyle = `rgba(7,8,12,${Math.min(0.45, engine.deathAge * 0.9)})`;
    ctx.fillRect(0, 0, w, h);
  }
}

function drawWedges(ctx: CanvasRenderingContext2D, pal: Palette, rot: number): void {
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    const [x0, y0] = hexPoint(420, i, rot);
    const [x1, y1] = hexPoint(420, i + 1, rot);
    ctx.lineTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? pal.wedgeA : pal.wedgeB;
    ctx.fill();
  }
}

function drawWalls(ctx: CanvasRenderingContext2D, engine: NexusEngine, pal: Palette): void {
  ctx.lineJoin = "miter";
  for (const wall of engine.walls) {
    const inner = wall.radius;
    const outer = wall.radius + wall.thickness;
    if (outer < engine.coreR - 4) continue;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      if ((wall.mask & (1 << i)) === 0) continue;
      wallQuad(ctx, inner, outer, i, wall.rot);
    }
    ctx.fillStyle = pal.ink;
    ctx.shadowColor = pal.ink;
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function drawCore(ctx: CanvasRenderingContext2D, engine: NexusEngine, pal: Palette): void {
  const r = engine.coreR;
  drawHex(ctx, r, 0);
  ctx.fillStyle = pal.bg;
  ctx.fill();
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = pal.ink;
  ctx.shadowColor = pal.ink;
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.shadowBlur = 0;

  drawHex(ctx, r * 0.55, 0);
  ctx.strokeStyle = pal.ink;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // orbit guide
  ctx.beginPath();
  ctx.arc(0, 0, engine.playerR, 0, Math.PI * 2);
  ctx.strokeStyle = pal.ink;
  ctx.globalAlpha = 0.12;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawPlayer(ctx: CanvasRenderingContext2D, engine: NexusEngine, pal: Palette): void {
  const r = engine.playerR;
  const a = engine.angle;
  const px = Math.cos(a) * r;
  const py = Math.sin(a) * r;
  const tangent = a + (engine.dir === 1 ? Math.PI / 2 : -Math.PI / 2);

  // trail
  for (let i = 0; i < engine.trail.length; i++) {
    const ta = engine.trail[i]!;
    const k = (i + 1) / engine.trail.length;
    ctx.beginPath();
    ctx.arc(Math.cos(ta) * r, Math.sin(ta) * r, 2.2 * k, 0, Math.PI * 2);
    ctx.fillStyle = pal.player;
    ctx.globalAlpha = 0.15 * k;
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (engine.mode === "dead" && engine.deathAge > 0.08) return;

  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(tangent);
  ctx.beginPath();
  ctx.moveTo(11, 0);
  ctx.lineTo(-7, 6.5);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-7, -6.5);
  ctx.closePath();
  ctx.fillStyle = pal.player;
  ctx.shadowColor = pal.player;
  ctx.shadowBlur = 14;
  ctx.fill();
  ctx.restore();
  ctx.shadowBlur = 0;
}

function drawParticles(ctx: CanvasRenderingContext2D, engine: NexusEngine): void {
  for (const p of engine.particles) {
    const a = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.6 + a * 0.6), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawFloaters(ctx: CanvasRenderingContext2D, engine: NexusEngine, pal: Palette): void {
  ctx.font = "600 11px Sora, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const f of engine.floaters) {
    const a = f.life / f.maxLife;
    ctx.globalAlpha = a;
    ctx.fillStyle = pal.player;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}
