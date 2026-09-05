import { Engine } from "./engine.js";
import { DrivingLab } from "./drive-ui.js";
import { RecordingStudio } from "./recording.js";
import type { EngineConfig } from "./engine.js";
import { Renderer } from "./renderer.js";
import { Scene } from "./scene.js";
import { Assembly, isViewMode } from "./assembly.js";
import type { SelectedPart } from "./assembly.js";
import type { Camera, Label, AudioParameters } from "./types.js";
type AudioGraph = {
  context: AudioContext;
  node: AudioWorkletNode;
  gain: GainNode;
  analyser: AnalyserNode;
  capture: MediaStreamAudioDestinationNode;
  waveform: Float32Array<ArrayBuffer>;
};
type OrbitPointer = {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  time: number;
  moved: boolean;
};
function element<T extends HTMLElement>(id: string, type: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof type))
    throw new Error(`Missing or invalid UI element: ${id}`);
  return found;
}
const ui = {
  advance: element("advance", HTMLInputElement),
  "advance-value": element("advance-value", HTMLOutputElement),
  angle: element("angle", HTMLInputElement),
  "angle-value": element("angle-value", HTMLOutputElement),
  "audio-status": element("audio-status", HTMLParagraphElement),
  "clear-part": element("clear-part", HTMLButtonElement),
  "close-model": element("close-model", HTMLButtonElement),
  compression: element("compression", HTMLInputElement),
  "compression-value": element("compression-value", HTMLOutputElement),
  "cylinder-title": element("cylinder-title", HTMLSpanElement),
  cylinders: element("cylinders", HTMLDivElement),
  engine: element("engine", HTMLCanvasElement),
  explode: element("explode", HTMLInputElement),
  "explode-value": element("explode-value", HTMLOutputElement),
  "hide-part": element("hide-part", HTMLButtonElement),
  "isolate-part": element("isolate-part", HTMLButtonElement),
  "layer-list": element("layer-list", HTMLDivElement),
  "live-state": element("live-state", HTMLParagraphElement),
  "model-dialog": element("model-dialog", HTMLDialogElement),
  "open-model": element("open-model", HTMLButtonElement),
  "part-description": element("part-description", HTMLParagraphElement),
  "part-inspector": element("part-inspector", HTMLElement),
  "part-labels": element("part-labels", HTMLDivElement),
  "part-name": element("part-name", HTMLElement),
  partial: element("partial", HTMLOutputElement),
  pause: element("pause", HTMLButtonElement),
  power: element("power", HTMLOutputElement),
  "pulse-rate": element("pulse-rate", HTMLOutputElement),
  pulses: element("pulses", HTMLCanvasElement),
  pv: element("pv", HTMLCanvasElement),
  "reset-view": element("reset-view", HTMLButtonElement),
  rpm: element("rpm", HTMLInputElement),
  "rpm-value": element("rpm-value", HTMLOutputElement),
  "show-all": element("show-all", HTMLButtonElement),
  sound: element("sound", HTMLButtonElement),
  speed: element("speed", HTMLSelectElement),
  "stroke-labels": element("stroke-labels", HTMLDivElement),
  "stroke-marker": element("stroke-marker", HTMLElement),
  "stroke-track": element("stroke-track", HTMLDivElement),
  "tach-rpm": element("tach-rpm", HTMLOutputElement),
  throttle: element("throttle", HTMLInputElement),
  "throttle-value": element("throttle-value", HTMLOutputElement),
  "view-modes": element("view-modes", HTMLDivElement),
  work: element("work", HTMLOutputElement),
};
const $ = <K extends keyof typeof ui>(id: K): (typeof ui)[K] => ui[id];
const cfg = { ...Engine.defaults };
let model = Engine.cycle(cfg),
  crank = 0,
  selected = 1,
  running = !matchMedia("(prefers-reduced-motion: reduce)").matches;
let last = performance.now(),
  audio: AudioGraph | null = null,
  audible = false,
  startingAudio = false;
const camera: Camera = { yaw: 2.2, elevation: 0.4, zoom: 1 };
const assembly = Assembly.create();
const orbitVelocity = { yaw: 0, elevation: 0 };
let labels: Label[] = [],
  pointer: OrbitPointer | null = null,
  frame = 0;
const buttons = new Map<number, HTMLButtonElement>();
let recording: RecordingStudio | null = null;
let audioClock = 0;
const driving = new DrivingLab({
  onMode: () => {
    setRunning(true);
    if (!driving.active) solve();
    const note = document.querySelector(".canvas-note span");
    if (note)
      note.textContent = driving.active
        ? "Shared 4.0 L cutaway · motion slowed"
        : "4.0 L · cross-plane";
  },
  onStart: () => setRunning(true),
  onReset: () => recording?.stop(),
});
recording = new RecordingStudio({
  audioStream: async () => {
    await setSound(true);
    if (!audio)
      throw new Error("Engine audio could not start. Try Start sound first.");
    return audio.capture.stream;
  },
  startRun: () => driving.start(),
  snapshot: () => driving.snapshot(),
});
const modelDialog = $("model-dialog");
$("open-model").onclick = () => modelDialog.showModal();
$("close-model").onclick = () => modelDialog.close();
modelDialog.addEventListener("click", (event) => {
  if (event.target !== modelDialog) return;
  const r = modelDialog.getBoundingClientRect();
  if (
    event.clientX < r.left ||
    event.clientX > r.right ||
    event.clientY < r.top ||
    event.clientY > r.bottom
  )
    modelDialog.close();
});
const layerRows = Assembly.layers.map((layer) => {
  const row = document.createElement("div");
  row.className = "layer-row";
  row.dataset.layer = layer.id;
  const name = document.createElement("button");
  name.textContent = layer.name;
  name.onclick = () =>
    selectPart({ layer: layer.id, name: layer.name, cylinder: null });
  const visibility = document.createElement("input");
  visibility.type = "checkbox";
  visibility.checked = true;
  visibility.setAttribute("aria-label", `Show ${layer.name}`);
  visibility.onchange = () => {
    if (visibility.checked) assembly.visible.add(layer.id);
    else assembly.visible.delete(layer.id);
    syncAssembly();
  };
  row.append(name, visibility);
  $("layer-list").append(row);
  return { row, layer, name, visibility };
});
const viewButtons = Array.from($("view-modes").children).map((button) => {
  if (
    !(button instanceof HTMLButtonElement) ||
    !isViewMode(button.dataset.mode)
  )
    throw new Error("Invalid view control.");
  return { button, mode: button.dataset.mode };
});
function syncAssembly() {
  for (const { button, mode } of viewButtons)
    button.setAttribute("aria-pressed", String(mode === assembly.mode));
  $("explode").value = String(assembly.targetExplode * 100);
  $("explode-value").textContent =
    `${Math.round(assembly.targetExplode * 100)}%`;
  for (const { row, layer, visibility } of layerRows) {
    visibility.checked = assembly.visible.has(layer.id);
    row.classList.toggle("selected", layer.id === assembly.selected?.layer);
  }
  $("part-inspector").hidden = !assembly.selected;
  if (assembly.selected) {
    $("part-name").textContent = assembly.selected.name;
    $("part-description").textContent =
      Assembly.layers.find((l) => l.id === assembly.selected?.layer)
        ?.description ?? "";
  }
}
function selectPart(part: SelectedPart | null) {
  assembly.selected = part;
  if (part?.cylinder) select(part.cylinder);
  syncAssembly();
}
for (const { button, mode } of viewButtons)
  button.onclick = () => {
    assembly.mode = mode;
    assembly.targetExplode = assembly.mode === "exploded" ? 0.85 : 0;
    assembly.visible = new Set(Assembly.layers.map((l) => l.id));
    assembly.selected = null;
    if (assembly.mode === "exploded") setRunning(false);
    syncAssembly();
  };
$("explode").oninput = () => {
  assembly.mode = "exploded";
  assembly.targetExplode = Number($("explode").value) / 100;
  syncAssembly();
};
$("show-all").onclick = () => {
  assembly.visible = new Set(Assembly.layers.map((l) => l.id));
  assembly.selected = null;
  syncAssembly();
};
$("clear-part").onclick = () => selectPart(null);
$("hide-part").onclick = () => {
  if (assembly.selected) assembly.visible.delete(assembly.selected.layer);
  selectPart(null);
};
$("isolate-part").onclick = () => {
  if (assembly.selected) assembly.visible = new Set([assembly.selected.layer]);
  syncAssembly();
};
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    selectPart(null);
  }
});
const labelElements: HTMLSpanElement[] = [];
for (let id = 1; id <= 8; id++) {
  const label = document.createElement("span");
  label.textContent = String(id);
  $("part-labels").append(label);
  labelElements.push(label);
}
for (const id of Engine.order) {
  const b = document.createElement("button");
  b.textContent = String(id);
  b.setAttribute("aria-label", `Select cylinder ${id}`);
  b.setAttribute("aria-pressed", String(id === selected));
  b.onclick = () => select(id);
  $("cylinders").append(b);
  buttons.set(id, b);
}
function select(id: number) {
  selected = id;
  for (const [n, b] of buttons)
    b.setAttribute("aria-pressed", String(n === id));
  $("cylinder-title").textContent = `Cylinder ${id}`;
}
function audioParameters() {
  if (!audio) return;
  const parameters: AudioParameters = {
    rpm: driving.active ? driving.state.rpm : cfg.rpm,
    amplitude: driving.active
      ? 0.04 + 0.96 * driving.state.throttle
      : Math.max(0.03, Math.min(1, (model.exhaustPressure - 106000) / 550000)),
    running:
      running &&
      !document.hidden &&
      (!driving.active ||
        driving.state.status === "running" ||
        driving.state.status === "ready"),
    ...(driving.active ? { tone: driving.tone } : {}),
  };
  audio.node.port.postMessage(parameters);
}
function solve() {
  model = Engine.cycle(cfg);
  $("rpm-value").textContent = `${cfg.rpm} RPM`;
  $("throttle-value").textContent = `${Math.round(cfg.throttle * 100)} %`;
  $("compression-value").textContent = `${cfg.compression.toFixed(1)} : 1`;
  $("advance-value").textContent = `${cfg.advance}° BTDC`;
  $("work").textContent = `${model.work.toFixed(1)} J`;
  $("power").textContent = `${(model.power / 1000).toFixed(1)} kW`;
  $("tach-rpm").textContent = String(cfg.rpm);
  $("pulse-rate").textContent = ((cfg.rpm * 8) / 120).toFixed(0);
  audioParameters();
}
for (const key of [
  "rpm",
  "throttle",
  "compression",
  "advance",
] satisfies (keyof EngineConfig)[])
  $(key).addEventListener("input", () => {
    cfg[key] = Number($(key).value) / (key === "throttle" ? 100 : 1);
    solve();
  });
function setRunning(value: boolean) {
  running = value;
  $("pause").textContent = running ? "Pause" : "Resume";
  audioParameters();
}
$("pause").onclick = () => setRunning(!running);
$("angle").addEventListener("input", () => {
  setRunning(false);
  crank = Number($("angle").value);
});
$("reset-view").onclick = () => {
  Object.assign(camera, { yaw: 2.2, elevation: 0.4, zoom: 1 });
  orbitVelocity.yaw = orbitVelocity.elevation = 0;
};
$("engine").addEventListener("pointerdown", (e) => {
  if (pointer || e.button !== 0) return;
  pointer = {
    id: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    startX: e.clientX,
    startY: e.clientY,
    time: e.timeStamp,
    moved: false,
  };
  orbitVelocity.yaw = orbitVelocity.elevation = 0;
  $("engine").setPointerCapture(e.pointerId);
});
$("engine").addEventListener("pointermove", (e) => {
  if (!pointer || pointer.id !== e.pointerId) return;
  const dx = e.clientX - pointer.x,
    dy = e.clientY - pointer.y;
  const elapsed = Math.max(0.008, (e.timeStamp - pointer.time) / 1000);
  const sensitivity =
    2.8 / Math.min($("engine").clientWidth, $("engine").clientHeight);
  pointer.moved ||=
    Math.hypot(e.clientX - pointer.startX, e.clientY - pointer.startY) > 4;
  if (pointer.moved) {
    // Orbit the camera in the opposite horizontal direction so the object follows the hand.
    const yaw = -dx * sensitivity,
      elevation = dy * sensitivity;
    camera.yaw += yaw;
    camera.elevation = Math.max(
      -0.15,
      Math.min(1.2, camera.elevation + elevation),
    );
    orbitVelocity.yaw =
      0.5 * orbitVelocity.yaw + 0.5 * Math.max(-3, Math.min(3, yaw / elapsed));
    orbitVelocity.elevation =
      0.5 * orbitVelocity.elevation +
      0.5 * Math.max(-2, Math.min(2, elevation / elapsed));
  }
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.time = e.timeStamp;
});
$("engine").addEventListener("pointerup", (e) => {
  if (!pointer || pointer.id !== e.pointerId) return;
  if (!pointer.moved) {
    const rect = $("engine").getBoundingClientRect();
    const x = e.clientX - rect.left,
      y = e.clientY - rect.top;
    let nearest = null,
      distance = 14;
    for (const l of labels) {
      const d = Math.hypot(l.point[0] - x, l.point[1] - y);
      if (d < distance) {
        distance = d;
        nearest = l.id;
      }
    }
    if (nearest) {
      select(nearest);
      selectPart({
        layer: "rotating",
        name: `Piston & rod ${nearest}`,
        cylinder: nearest,
      });
    } else selectPart(Scene.pick(x, y));
  }
  if (
    e.timeStamp - pointer.time > 80 ||
    matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    orbitVelocity.yaw = orbitVelocity.elevation = 0;
  pointer = null;
});
$("engine").addEventListener("pointercancel", () => {
  pointer = null;
  orbitVelocity.yaw = orbitVelocity.elevation = 0;
});
$("engine").addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    camera.zoom = Math.max(
      0.65,
      Math.min(2.2, camera.zoom * Math.exp(-e.deltaY * 0.001)),
    );
  },
  { passive: false },
);
$("engine").addEventListener("keydown", (e) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
    e.preventDefault();
    orbitVelocity.yaw = orbitVelocity.elevation = 0;
    camera.yaw +=
      e.key === "ArrowLeft" ? 0.1 : e.key === "ArrowRight" ? -0.1 : 0;
    camera.elevation = Math.max(
      -0.15,
      Math.min(
        1.2,
        camera.elevation +
          (e.key === "ArrowUp" ? -0.06 : e.key === "ArrowDown" ? 0.06 : 0),
      ),
    );
  }
});
async function setSound(enabled: boolean) {
  if (startingAudio) return;
  startingAudio = true;
  let openingContext: AudioContext | null = null;
  try {
    if (!audio) {
      const context = new AudioContext();
      openingContext = context;
      await context.resume();
      if (!context.audioWorklet)
        throw new Error(
          "AudioWorklet is unavailable. Open this on localhost in a current browser.",
        );
      await context.audioWorklet.addModule(
        new URL("./exhaust-worklet.js", import.meta.url),
      );
      const node = new AudioWorkletNode(context, "v8-exhaust", {
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      const gain = context.createGain();
      const analyser = context.createAnalyser();
      analyser.fftSize = Math.min(
        32768,
        2 ** Math.ceil(Math.log2(context.sampleRate * 0.05 + 1024)),
      );
      const waveform = new Float32Array(analyser.fftSize);
      const capture = context.createMediaStreamDestination();
      gain.gain.value = 0;
      node.connect(analyser).connect(gain).connect(context.destination);
      gain.connect(capture);
      audio = { context, node, gain, analyser, waveform, capture };
      openingContext = null;
      audioParameters();
    }
    await audio.context.resume();
    audible = enabled;
    audio.gain.gain.setTargetAtTime(
      audible ? 0.35 : 0,
      audio.context.currentTime,
      0.025,
    );
    $("sound").textContent = audible ? "Mute sound" : "Start sound";
    $("sound").setAttribute("aria-pressed", String(audible));
    $("audio-status").textContent = "";
  } catch (error) {
    $("audio-status").textContent =
      `Sound could not start: ${error instanceof Error ? error.message : String(error)}`;
    const context = audio?.context ?? openingContext;
    if (context) await context.close();
    audio = null;
    audible = false;
  } finally {
    startingAudio = false;
  }
}
$("sound").onclick = () => {
  void setSound(!audible);
};
document.addEventListener("visibilitychange", () => {
  last = performance.now();
  audioParameters();
  if (audio)
    audio.gain.gain.setTargetAtTime(
      !document.hidden && audible ? 0.35 : 0,
      audio.context.currentTime,
      0.025,
    );
});
function draw(now: number) {
  const elapsed = Math.max(0, (now - last) / 1000);
  const dt = Math.min(elapsed, 0.05);
  last = now;
  driving.tick(Math.min(elapsed, 0.25), running && !document.hidden);
  const actualRpm = driving.active ? driving.state.rpm : cfg.rpm;
  if (driving.active) {
    $("tach-rpm").textContent = actualRpm.toFixed(0);
    $("pulse-rate").textContent = (actualRpm / 15).toFixed(0);
  }
  audioClock += dt;
  if (audioClock >= 0.04) {
    audioClock = 0;
    audioParameters();
  }
  assembly.explode +=
    (assembly.targetExplode - assembly.explode) * (1 - Math.exp(-8 * dt));
  if (Math.abs(assembly.explode - assembly.targetExplode) < 0.0001)
    assembly.explode = assembly.targetExplode;
  if (!pointer) {
    const decay = Math.exp(-12 * dt),
      travel = (1 - decay) / 12;
    camera.yaw += orbitVelocity.yaw * travel;
    camera.elevation = Math.max(
      -0.15,
      Math.min(1.2, camera.elevation + orbitVelocity.elevation * travel),
    );
    orbitVelocity.yaw *= decay;
    orbitVelocity.elevation *= decay;
  }
  if (
    running &&
    !document.hidden &&
    (!driving.active ||
      driving.state.status === "running" ||
      driving.state.status === "ready")
  ) {
    const speed = $("speed").value;
    crank = Engine.mod(
      crank +
        dt *
          (driving.active
            ? Math.min(actualRpm, 120)
            : speed === "real"
              ? cfg.rpm
              : Number(speed)) *
          6,
      720,
    );
  }
  const phase = Engine.phase(crank, selected),
    sample = Engine.sampleAt(model, phase);
  labels = Scene.render(
    $("engine"),
    model,
    crank,
    selected,
    camera,
    assembly,
    recording?.active ?? false,
  );
  if (!driving.active) Renderer.pv($("pv"), model, phase);
  recording?.draw($("engine"), driving.plot, driving.snapshot(), model, phase);
  if (
    recording?.active &&
    driving.active &&
    (driving.state.status === "complete" || driving.state.status === "limited")
  )
    recording?.stop();
  for (const el of labelElements) el.hidden = true;
  for (const label of labels) {
    const el = labelElements[label.id - 1];
    el.hidden = false;
    el.style.left = `${label.point[0]}px`;
    el.style.top = `${label.point[1]}px`;
    el.style.color = label.color;
  }
  const pc = $("pulses"),
    pw = pc.clientWidth,
    ph = pc.clientHeight,
    pr = Math.min(devicePixelRatio || 1, 2);
  if (pc.width !== Math.round(pw * pr) || pc.height !== Math.round(ph * pr)) {
    pc.width = Math.round(pw * pr);
    pc.height = Math.round(ph * pr);
  }
  const px = pc.getContext("2d");
  if (!px) throw new Error("Canvas 2D is unavailable.");
  px.setTransform(pr, 0, 0, pr, 0, 0);
  px.clearRect(0, 0, pw, ph);
  px.strokeStyle = "#dce4e9";
  px.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    px.beginPath();
    px.moveTo((i * pw) / 5, 5);
    px.lineTo((i * pw) / 5, ph - 15);
    px.stroke();
  }
  px.beginPath();
  const rate = actualRpm / 15;
  const liveAudio = audio && audible ? audio : null;
  let signalStart = 0,
    signalLength = 0;
  if (liveAudio) {
    liveAudio.analyser.getFloatTimeDomainData(liveAudio.waveform);
    signalLength = Math.min(
      liveAudio.waveform.length - 1024,
      Math.round(liveAudio.context.sampleRate * 0.05),
    );
    const lastStart = liveAudio.waveform.length - signalLength;
    signalStart = Math.max(1, lastStart - 1024);
    while (
      signalStart < lastStart &&
      !(
        liveAudio.waveform[signalStart - 1] <= 0 &&
        liveAudio.waveform[signalStart] > 0
      )
    )
      signalStart++;
  }
  pc.setAttribute(
    "aria-label",
    liveAudio
      ? "Live synthesized exhaust waveform over 50 milliseconds"
      : "Illustrated exhaust event timing over 50 milliseconds",
  );
  for (let i = 0; i < pw; i++) {
    const t = (i / pw) * 0.05;
    const age = Engine.mod(t, 1 / rate);
    const value = liveAudio
      ? liveAudio.waveform[
          signalStart +
            Math.min(signalLength - 1, Math.floor((i / pw) * signalLength))
        ] * 1.6
      : Math.exp(-age * 400) * Math.sin(age * 1800);
    const y = ph * 0.6 - value * ph * 0.4;
    if (i === 0) px.moveTo(i, y);
    else px.lineTo(i, y);
  }
  px.strokeStyle = "#328ca7";
  px.lineWidth = 1.3;
  px.stroke();
  px.font = "9px Consolas,monospace";
  px.fillStyle = "#697c89";
  px.fillText("0", 0, ph - 2);
  px.textAlign = "right";
  px.fillText("50 ms", pw, ph - 2);
  px.textAlign = "left";
  if (frame++ % 3 === 0) {
    $("angle").value = String(crank);
    $("angle-value").textContent = `${crank.toFixed(0)}° CA`;
    $("partial").textContent = `${sample.work.toFixed(1)} J`;
    $("stroke-marker").style.left = `${(phase / 720) * 100}%`;
    const stroke = Math.floor(phase / 180);
    [...$("stroke-labels").children].forEach((el, i) =>
      el.classList.toggle("active", i === stroke),
    );
    $("live-state").textContent =
      `Cylinder ${selected}: ${phase.toFixed(0)}° · ${(sample.p / 1e5).toFixed(1)} bar · ${(sample.v * 1e6).toFixed(0)} cm³`;
    for (const [id, b] of buttons) {
      const p = Engine.phase(crank, id);
      b.classList.toggle(
        "firing",
        p >= model.start && p < model.start + model.duration,
      );
    }
  }
  requestAnimationFrame(draw);
}
const initialView = new URLSearchParams(location.search).get("view");
if (isViewMode(initialView)) {
  assembly.mode = initialView;
  if (initialView === "exploded") {
    assembly.explode = assembly.targetExplode = 0.85;
    running = false;
  }
}
syncAssembly();
solve();
if (new URLSearchParams(location.search).get("mode") === "drive")
  driving.setMode(true);
setRunning(running);
requestAnimationFrame(draw);
// Read-only diagnostics for numerical and browser verification.
const diagnostics = {
  exportAssembly: Scene.exportAssembly,
  get model() {
    return model;
  },
  get state() {
    return {
      crank,
      selected,
      running,
      audible,
      audioState: audio?.context.state,
      driving: {
        active: driving.active,
        ...driving.snapshot(),
        status: driving.state.status,
      },
      recording: recording?.active ?? false,
      camera: { ...camera },
      assembly: {
        mode: assembly.mode,
        explode: assembly.explode,
        visible: [...assembly.visible],
        selected: assembly.selected,
      },
    };
  },
};
declare global {
  interface Window {
    v8Lab: typeof diagnostics;
  }
}
window.v8Lab = diagnostics;
