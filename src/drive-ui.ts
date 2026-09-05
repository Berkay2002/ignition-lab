import { profiles, defaultProfile } from "./profiles.js";
import { createRun, stepRun } from "./vehicle.js";
import type {
  CarProfile,
  DriveControls,
  DriveScenario,
  DriveState,
} from "./vehicle-types.js";
import type { AudioTone } from "./types.js";

const scenarios: { id: DriveScenario; name: string }[] = [
  { id: "launch", name: "0 to 100 km/h" },
  { id: "sprint", name: "100 to 200 km/h" },
  { id: "rolling", name: "80 to 160 km/h" },
  { id: "braking", name: "160 to 0 km/h" },
  { id: "dyno", name: "Single-gear dyno sweep" },
  { id: "free", name: "Free drive" },
];
function get<T extends HTMLElement>(id: string, type: new () => T): T {
  const el = document.getElementById(id);
  if (!(el instanceof type)) throw new Error(`Missing driving control: ${id}`);
  return el;
}
type TracePoint = {
  time: number;
  speed: number;
  rpm: number;
  torque: number;
  power: number;
  gear: number;
  throttle: number;
  brake: number;
  disabledCylinder: number | null;
  timingRetard: number;
  tone: AudioTone;
};
type RunResult = {
  profile: string;
  scenario: DriveScenario;
  elapsed: number;
  status: string;
  trace: TracePoint[];
};
export type DrivingSnapshot = {
  profile: string;
  scenario: string;
  speedKmh: number;
  rpm: number;
  gear: number;
  elapsed: number;
  powerKw: number;
  stage: string;
};

export class DrivingLab {
  active = false;
  profile: CarProfile = defaultProfile;
  state: DriveState = createRun(defaultProfile, "launch");
  readonly controls: DriveControls = {
    transmission: "auto",
    throttle: 0.7,
    brake: 0,
    shift: 0,
    disabledCylinder: null,
    timingRetard: 0,
  };
  private trace: TracePoint[] = [];
  private history: RunResult[] = [];
  private baseline: RunResult | null = null;
  private sampleClock = 0;
  private completed = false;
  readonly plot: HTMLCanvasElement;
  private readonly ui;

  constructor(
    private readonly hooks: {
      onMode: () => void;
      onStart: () => void;
      onReset: () => void;
    },
  ) {
    const nav = document.createElement("nav");
    nav.className = "mode-switch";
    nav.setAttribute("aria-label", "Lab mode");
    nav.innerHTML =
      '<button id="mode-study" aria-pressed="true">Engine study</button><button id="mode-drive" aria-pressed="false">Driving lab</button>';
    document.querySelector("header")?.append(nav);
    const container = document.createElement("div");
    container.id = "driving-lab";
    container.innerHTML = `
      <section class="drive-panel overlay" aria-label="Driving scenario setup">
        <div class="drive-heading"><h2>Driving lab</h2><span>Simulated</span></div>
        <label for="car-profile">Vehicle profile<select id="car-profile"></select></label>
        <p id="profile-engine" class="drive-small"></p>
        <label for="drive-scenario">Scenario<select id="drive-scenario"></select></label>
        <button id="drive-start" class="drive-primary">Run scenario</button>
        <div class="drive-pair"><label for="transmission">Gearbox<select id="transmission"><option value="auto">Automatic</option><option value="manual">Manual</option></select></label><div class="gear-buttons"><button id="gear-down" aria-label="Shift down">−</button><button id="gear-up" aria-label="Shift up">+</button></div></div>
        <div id="free-controls" hidden><label for="drive-throttle">Throttle <output id="drive-throttle-value">70%</output><input id="drive-throttle" type="range" min="0" max="100" value="70"></label><label for="drive-brake">Brake <output id="drive-brake-value">0%</output><input id="drive-brake" type="range" min="0" max="100" value="0"></label></div>
        <div class="drive-pair"><label for="exhaust-style">Exhaust<select id="exhaust-style"><option value="stock">Stock</option><option value="sport" selected>Sports</option><option value="open">Open headers</option></select></label><label for="listening-position">Listen from<select id="listening-position"><option value="tailpipe">Tailpipes</option><option value="engine">Engine bay</option><option value="cabin">Cabin</option><option value="roadside">Roadside fly-by</option></select></label></div>
        <label class="drive-check"><input id="overrun" type="checkbox">Overrun crackle</label>
        <details><summary>Diagnosis</summary><label for="failed-cylinder">Cylinder operation<select id="failed-cylinder"><option value="0">All cylinders</option>${Array.from({ length: 8 }, (_, i) => `<option value="${i + 1}">Disable cylinder ${i + 1}</option>`).join("")}</select></label><label for="timing-retard">Timing retard <output id="retard-value">0°</output><input id="timing-retard" type="range" min="0" max="30" value="0"></label><p class="drive-small">Fault effects are simplified. Retard reduces modeled torque; a disabled cylinder loses its firing pulse.</p></details>
        <details><summary>Specifications & assumptions</summary><p class="drive-small" id="profile-specs"></p><p class="drive-small" id="profile-assumptions"></p><div id="profile-sources"></div><p class="drive-small">No manufacturer affiliation. Sound is an approximation. The cutaway remains the shared 4.0 L cross-plane assembly.</p></details>
        <details><summary>How this run is calculated</summary><p class="drive-small">Wheel force = torque × gear × final drive × efficiency ÷ tyre radius. Traction limits that force. Air drag and rolling resistance are subtracted; acceleration = net force ÷ mass. The simulation integrates acceleration to obtain speed and distance. RPM follows wheel speed, with a launch-clutch and shift model.</p><p class="drive-small">The torque curve is an estimate constrained by published peak specifications. Run times and dyno curves are model outputs, not road-test measurements.</p></details>
      </section>
      <section class="drive-dashboard overlay" aria-label="Driving instruments">
        <div class="drive-readouts"><div><output id="road-speed">0</output><span>km/h</span></div><div><output id="road-gear">1</output><span>gear</span></div><div><output id="road-rpm">850</output><span>RPM</span></div><div><output id="road-time">0.00</output><span>seconds</span></div></div>
        <div class="rev-track"><i id="rev-fill"></i></div><div class="drive-status"><span id="drive-stage">Ready</span><span id="road-power">0 kW</span></div>
        <p class="drive-small" id="drive-result" role="status">Select a scenario, then run. Start sound to listen.</p>
      </section>
      <section class="drive-plot-card overlay" aria-label="Scenario results"><div class="drive-heading"><h2 id="drive-plot-title">Speed trace</h2><span id="drive-plot-unit">km/h</span></div><canvas id="drive-plot" role="img" aria-label="Calculated speed over elapsed time"></canvas><p id="trace-legend" class="drive-small">Current run</p><p id="run-comparison" class="drive-small"></p><div id="drive-history"></div><button id="export-run" disabled>Export run data</button></section>
      <section class="drive-record-bar"><button id="record-drive">Record video + sound</button><button id="show-recordings">Clips & comparison</button><span id="record-status" role="status"></span></section>`;
    document.querySelector("main")?.append(container);
    this.plot = get("drive-plot", HTMLCanvasElement);
    this.ui = {
      profile: get("car-profile", HTMLSelectElement),
      scenario: get("drive-scenario", HTMLSelectElement),
      start: get("drive-start", HTMLButtonElement),
      transmission: get("transmission", HTMLSelectElement),
      down: get("gear-down", HTMLButtonElement),
      up: get("gear-up", HTMLButtonElement),
      throttle: get("drive-throttle", HTMLInputElement),
      brake: get("drive-brake", HTMLInputElement),
      exhaust: get("exhaust-style", HTMLSelectElement),
      listening: get("listening-position", HTMLSelectElement),
      overrun: get("overrun", HTMLInputElement),
      cylinder: get("failed-cylinder", HTMLSelectElement),
      retard: get("timing-retard", HTMLInputElement),
      rpm: get("road-rpm", HTMLOutputElement),
      speed: get("road-speed", HTMLOutputElement),
      gear: get("road-gear", HTMLOutputElement),
      time: get("road-time", HTMLOutputElement),
      result: get("drive-result", HTMLParagraphElement),
      history: get("drive-history", HTMLDivElement),
      export: get("export-run", HTMLButtonElement),
    };
    for (const profile of profiles)
      this.ui.profile.add(new Option(profile.name, profile.id));
    for (const scenario of scenarios)
      this.ui.scenario.add(new Option(scenario.name, scenario.id));
    this.ui.profile.value = this.profile.id;
    const query = new URLSearchParams(location.search);
    const initialProfile = profiles.find((p) => p.id === query.get("car"));
    if (initialProfile) {
      this.profile = initialProfile;
      this.ui.profile.value = initialProfile.id;
    }
    const initialScenario = scenarios.find(
      (s) => s.id === query.get("scenario"),
    );
    if (initialScenario) this.ui.scenario.value = initialScenario.id;
    this.state = createRun(this.profile, this.scenario());
    const freeControls = get("free-controls", HTMLDivElement);
    freeControls.hidden = this.state.scenario !== "free";
    const finishFree = document.createElement("button");
    finishFree.textContent = "Finish free drive";
    finishFree.onclick = () => {
      if (this.state.scenario === "free" && this.state.status === "running") {
        this.state.status = "complete";
        this.state.stage = "done";
        this.finish();
        this.paint();
      }
    };
    freeControls.append(finishFree);
    get("mode-study", HTMLButtonElement).onclick = () => this.setMode(false);
    get("mode-drive", HTMLButtonElement).onclick = () => this.setMode(true);
    this.ui.profile.onchange = () => {
      this.profile =
        profiles.find((p) => p.id === this.ui.profile.value) ?? defaultProfile;
      this.reset();
      this.syncProfile();
    };
    this.ui.scenario.onchange = () => this.reset();
    this.ui.start.onclick = () => this.start();
    this.ui.transmission.onchange = () => {
      this.controls.transmission =
        this.ui.transmission.value === "manual" ? "manual" : "auto";
      this.syncGears();
    };
    this.ui.down.onclick = () => {
      this.controls.shift = -1;
    };
    this.ui.up.onclick = () => {
      this.controls.shift = 1;
    };
    this.ui.throttle.oninput = () => {
      this.controls.throttle = Number(this.ui.throttle.value) / 100;
      get("drive-throttle-value", HTMLOutputElement).value =
        `${this.ui.throttle.value}%`;
    };
    this.ui.brake.oninput = () => {
      this.controls.brake = Number(this.ui.brake.value) / 100;
      get("drive-brake-value", HTMLOutputElement).value =
        `${this.ui.brake.value}%`;
    };
    this.ui.cylinder.onchange = () => {
      const id = Number(this.ui.cylinder.value);
      this.controls.disabledCylinder = id >= 1 && id <= 8 ? id : null;
    };
    this.ui.retard.oninput = () => {
      this.controls.timingRetard = Number(this.ui.retard.value);
      get("retard-value", HTMLOutputElement).value = `${this.ui.retard.value}°`;
    };
    this.ui.export.onclick = () => this.exportRun();
    this.syncProfile();
    this.syncGears();
    this.paint();
  }
  setMode(active: boolean) {
    this.hooks.onReset();
    this.active = active;
    document.body.classList.toggle("driving", active);
    get("mode-study", HTMLButtonElement).setAttribute(
      "aria-pressed",
      String(!active),
    );
    get("mode-drive", HTMLButtonElement).setAttribute(
      "aria-pressed",
      String(active),
    );
    if (!active && this.state.status === "running") this.state.status = "ready";
    this.hooks.onMode();
  }
  private scenario(): DriveScenario {
    return (
      scenarios.find((s) => s.id === this.ui.scenario.value)?.id ?? "launch"
    );
  }
  reset() {
    this.hooks.onReset();
    this.state = createRun(this.profile, this.scenario());
    this.trace = [];
    this.completed = false;
    this.sampleClock = 0;
    this.controls.shift = 0;
    this.baseline =
      this.history.find((r) => r.scenario === this.state.scenario) ?? null;
    get("free-controls", HTMLDivElement).hidden =
      this.state.scenario !== "free";
    this.ui.result.textContent =
      "Ready. Run times are calculated, not manufacturer test results.";
    this.ui.start.textContent = "Run scenario";
    this.ui.export.disabled = true;
    this.paint();
  }
  start() {
    this.reset();
    this.state.status = "running";
    this.ui.start.textContent = "Restart run";
    this.hooks.onStart();
  }
  private syncGears() {
    this.ui.down.disabled = this.ui.up.disabled =
      this.controls.transmission !== "manual";
  }
  private syncProfile() {
    const p = this.profile;
    get("profile-engine", HTMLParagraphElement).textContent =
      `${p.engine} · ${p.peakPowerKw} kW · ${p.peakTorqueNm} N·m`;
    get("profile-specs", HTMLParagraphElement).textContent =
      `Model inputs: ${p.massKg} kg; CdA ${p.dragAreaM2.toFixed(2)} m²; tyre radius ${p.tyreRadiusM.toFixed(3)} m; final drive ${p.finalDrive}; ratios ${p.gears.join(" / ")}; shift ${p.shiftSeconds}s; drive efficiency ${(p.drivetrainEfficiency * 100).toFixed(0)}%.`;
    get("profile-assumptions", HTMLParagraphElement).textContent =
      p.assumptions;
    const sources = get("profile-sources", HTMLDivElement);
    sources.replaceChildren();
    for (const source of p.sources) {
      const a = document.createElement("a");
      a.href = source.url;
      a.textContent = source.label;
      a.target = "_blank";
      a.rel = "noreferrer";
      sources.append(a);
    }
  }
  tick(dt: number, playing: boolean) {
    if (!this.active) return;
    if (playing && this.state.status === "running") {
      stepRun(this.state, this.profile, dt, this.controls);
      this.controls.shift = 0;
      this.sampleClock += dt;
      if (this.sampleClock >= 1 / 12 || this.state.status !== "running") {
        this.sampleClock = 0;
        this.trace.push({
          time: this.state.elapsed,
          speed: this.state.speedMS * 3.6,
          rpm: this.state.rpm,
          torque: this.state.torqueNm,
          power: this.state.powerKw,
          gear: this.state.gear,
          throttle: this.state.throttle,
          brake: this.controls.brake,
          disabledCylinder: this.controls.disabledCylinder,
          timingRetard: this.controls.timingRetard,
          tone: this.tone,
        });
        if (this.trace.length > 12000) this.trace.shift();
      }
      if (this.state.status !== "running" && !this.completed) this.finish();
    }
    this.paint();
  }
  private finish() {
    this.completed = true;
    this.ui.export.disabled = false;
    const result: RunResult = {
      profile: this.profile.name,
      scenario: this.state.scenario,
      elapsed: this.state.elapsed,
      status: this.state.status,
      trace: [...this.trace],
    };
    this.history.unshift(result);
    this.history = this.history.slice(0, 6);
    this.ui.history.replaceChildren();
    for (const run of this.history) {
      const b = document.createElement("button");
      b.textContent = `${run.profile} · ${run.elapsed.toFixed(2)} s${run.status === "limited" ? " (limit)" : ""}`;
      b.title = "Use this run as the comparison trace";
      b.onclick = () => {
        if (run.scenario === this.state.scenario) {
          this.baseline = run;
          this.paint();
        } else
          this.ui.result.textContent =
            "Choose the same scenario to compare these traces.";
      };
      this.ui.history.append(b);
    }
  }
  get tone(): AudioTone {
    const exhaust = this.ui.exhaust.value,
      listening = this.ui.listening.value;
    return {
      exhaust: exhaust === "stock" || exhaust === "open" ? exhaust : "sport",
      listening:
        listening === "engine" ||
        listening === "cabin" ||
        listening === "roadside"
          ? listening
          : "tailpipe",
      crank: this.profile.crank,
      resonance: this.profile.sound.resonance,
      roughness: this.profile.sound.roughness,
      overrun: this.ui.overrun.checked,
      disabledCylinder: this.controls.disabledCylinder,
      timingRetard: this.controls.timingRetard,
      speedMS: this.state.speedMS,
      distanceM: this.state.distanceM - 80,
    };
  }
  snapshot(): DrivingSnapshot {
    return {
      profile: this.profile.name,
      scenario:
        scenarios.find((s) => s.id === this.state.scenario)?.name ?? "Driving",
      speedKmh: this.state.speedMS * 3.6,
      rpm: this.state.rpm,
      gear: this.state.gear,
      elapsed: this.state.elapsed,
      powerKw: this.state.powerKw,
      stage: this.state.stage,
    };
  }
  private paint() {
    const s = this.state;
    this.ui.speed.value = (s.speedMS * 3.6).toFixed(0);
    this.ui.gear.value = String(s.gear);
    this.ui.rpm.value = s.rpm.toFixed(0);
    this.ui.time.value = s.elapsed.toFixed(2);
    get("rev-fill", HTMLElement).style.width =
      `${Math.min(100, (s.rpm / this.profile.redlineRpm) * 100)}%`;
    get("drive-stage", HTMLSpanElement).textContent =
      s.status === "ready" ? "Ready" : s.stage.replaceAll("-", " ");
    get("road-power", HTMLSpanElement).textContent =
      `${s.powerKw.toFixed(0)} kW · ${s.torqueNm.toFixed(0)} N·m`;
    if (s.status === "complete")
      this.ui.result.textContent = `Calculated result: ${s.elapsed.toFixed(2)} s · ${s.distanceM.toFixed(0)} m`;
    if (s.status === "limited")
      this.ui.result.textContent =
        "Run limit reached. The target was not reached under these inputs.";
    if (s.status === "running")
      this.ui.result.textContent =
        s.scenario === "dyno"
          ? "Estimated crank torque and power from this profile's torque curve."
          : `${this.snapshot().scenario} · vehicle model running`;
    const dyno = s.scenario === "dyno";
    get("drive-plot-title", HTMLElement).textContent = dyno
      ? "Modeled dyno"
      : "Speed trace";
    get("drive-plot-unit", HTMLSpanElement).textContent = dyno
      ? "N·m / kW"
      : "km/h";
    this.plot.setAttribute(
      "aria-label",
      dyno
        ? "Estimated torque and power against RPM"
        : "Calculated vehicle speed against elapsed time",
    );
    const base = this.baseline?.scenario === s.scenario ? this.baseline : null;
    get("trace-legend", HTMLParagraphElement).textContent = dyno
      ? "Teal: torque · Amber: power"
      : "Teal: current run";
    get("run-comparison", HTMLParagraphElement).textContent = base
      ? `Gray: ${base.profile} · ${base.elapsed.toFixed(2)} s`
      : "Completed runs can be compared here.";
    const w = this.plot.clientWidth,
      h = this.plot.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(devicePixelRatio, 2);
    if (
      this.plot.width !== Math.round(w * dpr) ||
      this.plot.height !== Math.round(h * dpr)
    ) {
      this.plot.width = Math.round(w * dpr);
      this.plot.height = Math.round(h * dpr);
    }
    const c = this.plot.getContext("2d");
    if (!c) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const left = 34,
      top = 18,
      bottom = h - 30,
      right = w - 10;
    const maxX = dyno
      ? this.profile.redlineRpm
      : Math.max(10, s.elapsed, base?.elapsed ?? 0);
    const maxY = dyno
      ? Math.ceil(
          Math.max(this.profile.peakTorqueNm, this.profile.peakPowerKw) / 100,
        ) * 100
      : Math.max(
          100,
          ...this.trace.map((p) => p.speed),
          ...(base?.trace.map((p) => p.speed) ?? []),
        ) * 1.08;
    c.font = "9px Consolas, monospace";
    c.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const y = bottom - ((bottom - top) * i) / 4;
      c.strokeStyle = "#dce5e9";
      c.beginPath();
      c.moveTo(left, y);
      c.lineTo(right, y);
      c.stroke();
      c.fillStyle = "#71818c";
      c.fillText(((maxY * i) / 4).toFixed(0), left - 6, y + 3);
    }
    c.textAlign = "center";
    for (let i = 0; i <= 4; i++)
      c.fillText(
        ((maxX * i) / 4).toFixed(0),
        left + ((right - left) * i) / 4,
        bottom + 14,
      );
    c.fillText(dyno ? "RPM" : "seconds", (left + right) / 2, h - 2);
    const line = (
      points: TracePoint[],
      color: string,
      key: "speed" | "torque" | "power",
    ) => {
      c.strokeStyle = color;
      c.lineWidth = 1.8;
      c.beginPath();
      points.forEach((p, i) => {
        const x = left + ((dyno ? p.rpm : p.time) / maxX) * (right - left),
          y = bottom - (p[key] / maxY) * (bottom - top);
        if (i) c.lineTo(x, y);
        else c.moveTo(x, y);
      });
      c.stroke();
    };
    if (base) line(base.trace, "#aab7bf", dyno ? "torque" : "speed");
    line(this.trace, "#267f98", dyno ? "torque" : "speed");
    if (dyno) line(this.trace, "#b87c2b", "power");
  }
  private exportRun() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            profile: this.profile,
            scenario: this.state.scenario,
            model:
              "longitudinal vehicle approximation; estimated torque curve; not measured performance",
            controls: this.controls,
            result: this.state,
            samples: this.trace,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `ignition-${this.profile.id}-${this.state.scenario}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
