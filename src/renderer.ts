import { Engine } from "./engine.js";
import type { CycleModel } from "./engine.js";
function setup(canvas: HTMLCanvasElement) {
  const w = canvas.clientWidth,
    h = canvas.clientHeight,
    dpr = Math.min(devicePixelRatio || 1, 2);
  if (
    canvas.width !== Math.round(w * dpr) ||
    canvas.height !== Math.round(h * dpr)
  ) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable.");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}
function pv(canvas: HTMLCanvasElement, model: CycleModel, phase: number) {
  const { ctx, w, h } = setup(canvas),
    left = 44,
    right = w - 10,
    top = 27,
    bottom = h - 38;
  const maxP = Math.ceil(model.peak / 1e6) * 10,
    maxV =
      Math.ceil((Engine.volume(180, model.cfg.compression) * 1e6) / 100) * 100;
  const x = (v: number) => left + ((v * 1e6) / maxV) * (right - left),
    y = (p: number) => bottom - (p / 1e5 / maxP) * (bottom - top);
  ctx.font = "10px Consolas,monospace";
  ctx.textAlign = "left";
  ctx.fillStyle = "#596d7b";
  ctx.fillText("Pressure / bar", 0, 11);
  ctx.lineWidth = 0.6;
  ctx.setLineDash([2, 3]);
  for (let i = 0; i <= 5; i++) {
    const py = bottom - (i / 5) * (bottom - top);
    ctx.strokeStyle = "#dce4e9";
    ctx.beginPath();
    ctx.moveTo(left, py);
    ctx.lineTo(right, py);
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(((maxP * i) / 5).toFixed(0), left - 8, py + 3);
    const px = left + (i / 5) * (right - left);
    ctx.beginPath();
    ctx.moveTo(px, top);
    ctx.lineTo(px, bottom);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillText(((maxV * i) / 5).toFixed(0), px, bottom + 16);
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = "#8d9faa";
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, bottom);
  ctx.lineTo(right, bottom);
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillText("Volume / cm³", (left + right) / 2, h - 4);
  ctx.beginPath();
  model.path.forEach((p, i) =>
    i ? ctx.lineTo(x(p.v), y(p.p)) : ctx.moveTo(x(p.v), y(p.p)),
  );
  ctx.closePath();
  ctx.fillStyle = "#d797291c";
  ctx.fill();
  ctx.strokeStyle = "#aa6d2699";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  let first = true;
  for (const p of model.path) {
    if (p.deg > phase) break;
    if (first) {
      ctx.moveTo(x(p.v), y(p.p));
      first = false;
    } else ctx.lineTo(x(p.v), y(p.p));
  }
  const s = Engine.sampleAt(model, phase);
  ctx.lineTo(x(s.v), y(s.p));
  ctx.strokeStyle = "#ae701d";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x(s.v), y(s.p), 4.8, 0, Math.PI * 2);
  ctx.fillStyle = "#278e9e";
  ctx.fill();
}
export const Renderer = { pv };
