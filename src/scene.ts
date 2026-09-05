/* Native WebGL assembly renderer with independent parts and exact color picking. */
import { Engine } from "./engine.js";
import type { CycleModel } from "./engine.js";
import { Geometry } from "./geometry.js";
import { readBlenderMeshes } from "./blender-assets.js";
import { map3 } from "./types.js";
import type {
  Vec3,
  Basis,
  Color,
  Camera,
  Label,
  MeshName,
  MeshData,
} from "./types.js";
import type { AssemblyState, LayerId, SelectedPart } from "./assembly.js";
type Shape = {
  type: MeshName;
  center: Vec3;
  basis: Basis;
  size: Vec3;
  color: Color;
  metal: number;
  cut: boolean;
};
type EnginePart = Shape & SelectedPart & { pickable: true };
type DrawCommand = EnginePart | (Shape & { pickable: false });
type PickBuffer = {
  fbo: WebGLFramebuffer;
  texture: WebGLTexture;
  depth: WebGLRenderbuffer;
  width: number;
  height: number;
};
type RendererState = {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  attrs: { position: number; normal: number };
  U: Record<string, WebGLUniformLocation | null>;
  meshes: Record<string, { buffer: WebGLBuffer; count: number }>;
  canvas: HTMLCanvasElement;
  meshData: MeshData;
  pickBuffer: PickBuffer | null;
};
type Frame = {
  commands: DrawCommand[];
  vp: Float32Array<ArrayBuffer>;
  eye: Vec3;
  w: number;
  h: number;
  signature: string;
  labels: Label[];
};
function allocated<T>(value: T | null): T {
  if (value === null) throw new Error("WebGL resource allocation failed.");
  return value;
}
const blenderMeshes = readBlenderMeshes();
const add = (a: Vec3, b: Vec3, k = 1) => map3(a, (v, i) => v + b[i] * k),
  sub = (a: Vec3, b: Vec3) => add(a, b, -1),
  dot = (a: Vec3, b: Vec3) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ],
  norm = (a: Vec3) => map3(a, (v) => v / Math.hypot(...a));
const axes: Basis = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  shaftAxes: Basis = [
    [1, 0, 0],
    [0, 0, 1],
    [0, 1, 0],
  ];
function mul(a: Float32Array, b: Float32Array) {
  const c = new Float32Array(16);
  for (let col = 0; col < 4; col++)
    for (let row = 0; row < 4; row++)
      for (let k = 0; k < 4; k++)
        c[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
  return c;
}
let state: RendererState | null = null,
  lastFrame: Frame | null = null;
const cuttable = new Set([
  "block",
  "heads",
  "pan",
  "covers",
  "intake",
  "timing",
]);
function init(canvas: HTMLCanvasElement): RendererState {
  const gl = allocated(
    canvas.getContext("webgl", { antialias: true, alpha: false }),
  );
  function shader(type: number, source: string) {
    const s = allocated(gl.createShader(type));
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw Error(gl.getShaderInfoLog(s) ?? "Shader compilation failed.");
    return s;
  }
  const program = allocated(gl.createProgram());
  gl.attachShader(
    program,
    shader(
      gl.VERTEX_SHADER,
      `attribute vec3 position;attribute vec3 normal;uniform mat4 mvp;uniform mat4 model;uniform mat3 normalMatrix;varying vec3 N;varying vec3 P;void main(){P=(model*vec4(position,1.)).xyz;N=normalMatrix*normal;gl_Position=mvp*vec4(position,1.);}`,
    ),
  );
  gl.attachShader(
    program,
    shader(
      gl.FRAGMENT_SHADER,
      `precision highp float;varying vec3 N;varying vec3 P;uniform vec4 color;uniform vec3 eye;uniform float metal;uniform float cutaway;uniform float picking;uniform vec3 pickColor;void main(){if(cutaway>.5&&P.x>.002)discard;if(picking>.5){gl_FragColor=vec4(pickColor,1.);return;}vec3 n=normalize(N);vec3 l=normalize(vec3(-.5,1.,.8));vec3 v=normalize(eye-P);float d=max(dot(n,l),0.);float fill=max(dot(n,normalize(vec3(.7,.4,-1.))),0.);float spec=pow(max(dot(n,normalize(l+v)),0.),36.+metal*48.);float rim=pow(1.-abs(dot(n,v)),3.);float grain=sin(P.x*4100.)*sin(P.y*3900.)*sin(P.z*4300.)*.015*(1.-metal);vec3 c=color.rgb*(.42+.58*d+.20*fill+grain)+vec3(spec*.48*metal+rim*.08*metal);gl_FragColor=vec4(c,color.a);}`,
    ),
  );
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw Error(gl.getProgramInfoLog(program) ?? "Program link failed.");
  gl.useProgram(program);
  const attrs = {
    position: gl.getAttribLocation(program, "position"),
    normal: gl.getAttribLocation(program, "normal"),
  };
  const U = Object.fromEntries(
    [
      "mvp",
      "model",
      "normalMatrix",
      "color",
      "eye",
      "metal",
      "cutaway",
      "picking",
      "pickColor",
    ].map((k) => [k, gl.getUniformLocation(program, k)]),
  );
  const meshData = { ...Geometry.meshes(), ...(blenderMeshes || {}) },
    meshes: RendererState["meshes"] = {};
  for (const [name, vertices] of Object.entries(meshData)) {
    const buffer = allocated(gl.createBuffer());
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    meshes[name] = { buffer, count: vertices.length / 6 };
  }
  return { gl, program, attrs, U, meshes, canvas, meshData, pickBuffer: null };
}
function draw(
  renderer: RendererState,
  command: DrawCommand,
  vp: Float32Array,
  picking = false,
  index = 0,
) {
  const { gl, U, meshes, attrs } = renderer,
    c = command;
  const m = new Float32Array([
    ...c.basis[0].map((v) => v * c.size[0]),
    0,
    ...c.basis[1].map((v) => v * c.size[1]),
    0,
    ...c.basis[2].map((v) => v * c.size[2]),
    0,
    ...c.center,
    1,
  ]);
  const normals = new Float32Array([
    ...c.basis[0].map((v) => v / c.size[0]),
    ...c.basis[1].map((v) => v / c.size[1]),
    ...c.basis[2].map((v) => v / c.size[2]),
  ]);
  gl.uniformMatrix4fv(U.mvp, false, mul(vp, m));
  gl.uniformMatrix4fv(U.model, false, m);
  gl.uniformMatrix3fv(U.normalMatrix, false, normals);
  gl.uniform4fv(U.color, c.color);
  gl.uniform1f(U.metal, c.metal);
  gl.uniform1f(U.cutaway, c.cut ? 1 : 0);
  gl.uniform1f(U.picking, picking ? 1 : 0);
  if (picking)
    gl.uniform3fv(U.pickColor, [
      (index & 255) / 255,
      ((index >> 8) & 255) / 255,
      ((index >> 16) & 255) / 255,
    ]);
  const mesh = meshes[c.type];
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
  gl.enableVertexAttribArray(attrs.position);
  gl.enableVertexAttribArray(attrs.normal);
  gl.vertexAttribPointer(attrs.position, 3, gl.FLOAT, false, 24, 0);
  gl.vertexAttribPointer(attrs.normal, 3, gl.FLOAT, false, 24, 12);
  gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
}
function render(
  canvas: HTMLCanvasElement,
  model: CycleModel,
  crank: number,
  selected: number,
  camera: Camera,
  assembly: AssemblyState,
) {
  if (!state) state = init(canvas);
  const { gl, program, U } = state,
    w = canvas.clientWidth,
    h = canvas.clientHeight,
    dpr = Math.min(devicePixelRatio || 1, 2),
    e = assembly.explode;
  const signature = [
    w,
    h,
    dpr,
    crank,
    selected,
    camera.yaw,
    camera.elevation,
    camera.zoom,
    e,
    assembly.mode,
    [...assembly.visible].join(","),
    assembly.selected?.layer,
    ...Object.values(model.cfg),
  ].join("|");
  if (lastFrame?.signature === signature) return lastFrame.labels;
  if (
    canvas.width !== Math.round(w * dpr) ||
    canvas.height !== Math.round(h * dpr)
  ) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.965, 0.972, 0.975, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.useProgram(program);
  const target: Vec3 = [0, 0.1 + e * 0.06, 0],
    distance = 1.6;
  const eye = add(target, [
    Math.sin(camera.yaw) * Math.cos(camera.elevation) * distance,
    Math.sin(camera.elevation) * distance,
    Math.cos(camera.yaw) * Math.cos(camera.elevation) * distance,
  ]);
  const z = norm(sub(eye, target)),
    x = norm(cross([0, 1, 0], z)),
    y = cross(z, x);
  const view = new Float32Array([
    x[0],
    y[0],
    z[0],
    0,
    x[1],
    y[1],
    z[1],
    0,
    x[2],
    y[2],
    z[2],
    0,
    -dot(x, eye),
    -dot(y, eye),
    -dot(z, eye),
    1,
  ]);
  const mobile = w < 760,
    usableW = mobile ? w - 15 : Math.max(380, w - 535),
    usableH = mobile ? 355 : Math.max(300, h - 220);
  const scale =
    Math.min(usableW / (0.67 + e * 0.32), usableH / (0.58 + e * 0.8)) *
    camera.zoom;
  const centerX = mobile ? w * 0.5 : w > 1100 ? w * 0.49 : w * 0.44,
    centerY = mobile ? 258 : h * 0.43;
  const proj = new Float32Array([
    (2 * scale) / w,
    0,
    0,
    0,
    0,
    (2 * scale) / h,
    0,
    0,
    0,
    0,
    -2 / 5,
    0,
    (2 * centerX) / w - 1,
    1 - (2 * centerY) / h,
    -1,
    1,
  ]);
  const vp = mul(proj, view);
  gl.uniform3fv(U.eye, eye);
  const silver: Color = [0.7, 0.75, 0.79, 1],
    cast: Color = [0.57, 0.64, 0.68, 1],
    dark: Color = [0.075, 0.095, 0.12, 1],
    steel: Color = [0.34, 0.4, 0.45, 1],
    brass: Color = [0.63, 0.48, 0.28, 1],
    cover: Color = [0.16, 0.24, 0.29, 1];
  const commands: DrawCommand[] = [],
    labels: Label[] = [];
  let context: SelectedPart & { offset: Vec3 } = {
    layer: "block",
    name: "Cylinder block",
    offset: [0, 0, 0],
    cylinder: null,
  };
  function group(
    layer: LayerId,
    name: string,
    bank = 0,
    cylinder: number | null = null,
  ) {
    const u: Vec3 = [bank * Math.SQRT1_2, Math.SQRT1_2, 0];
    let offset: Vec3 = [0, 0, 0];
    if (layer === "block") offset = [0, 0.115 * e, 0];
    if (layer === "bearings") offset = [0, -0.075 * e, 0];
    if (layer === "pan") offset = [0, -0.19 * e, 0];
    if (layer === "heads") offset = add([0, 0.15 * e, 0], u, 0.12 * e);
    if (layer === "valves")
      offset = bank ? add([0, 0.18 * e, 0], u, 0.17 * e) : [0, 0.05 * e, 0];
    if (layer === "covers") offset = add([0, 0.25 * e, 0], u, 0.23 * e);
    if (layer === "intake") offset = [0, 0.39 * e, 0];
    if (layer === "exhaust") offset = [bank * 0.19 * e, 0, 0];
    if (layer === "timing")
      offset = [0, 0, (name.includes("Flywheel") ? 1 : -1) * 0.16 * e];
    context = { layer, name, offset, cylinder };
  }
  function part(
    type: MeshName,
    center: Vec3,
    basis: Basis,
    size: Vec3,
    color: Color,
    metal = 1,
    pickable = true,
  ) {
    if (!assembly.visible.has(context.layer)) return;
    const selectedLayer = assembly.selected?.layer === context.layer;
    const tint: Color = selectedLayer
      ? [
          Math.min(1, color[0] * 0.78 + 0.25),
          Math.min(1, color[1] * 0.8 + 0.13),
          color[2] * 0.75,
          color[3],
        ]
      : color;
    const shape: Shape = {
      type,
      center: add(center, context.offset),
      basis,
      size,
      color: tint,
      metal,
      cut: assembly.mode === "cutaway" && cuttable.has(context.layer),
    };
    commands.push(
      pickable
        ? {
            ...shape,
            pickable: true,
            layer: context.layer,
            name: context.name,
            cylinder: context.cylinder,
          }
        : { ...shape, pickable: false },
    );
  }
  function tube(
    a: Vec3,
    b: Vec3,
    r: number,
    color: Color = silver,
    type: MeshName = "cylinder",
    metal = 1,
  ) {
    const delta = sub(b, a),
      u = norm(delta),
      n = norm(cross(Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], u)),
      v = cross(n, u);
    part(
      type,
      add(a, delta, 0.5),
      [n, u, v],
      [r, Math.hypot(...delta), r],
      color,
      metal,
    );
  }
  function box(
    c: Vec3,
    size: Vec3,
    color: Color = cast,
    basis: Basis = axes,
    type: MeshName = "box",
    metal = 0.5,
  ) {
    part(type, c, basis, size, color, metal);
  }
  function bolt(c: Vec3, u: Vec3, r = 0.003) {
    tube(c, add(c, u, 0.003), r, silver);
    tube(add(c, u, 0.003), add(c, u, 0.0038), r * 0.43, dark);
  }
  function pipe(points: Vec3[], r: number, color: Color = steel) {
    for (let i = 1; i < points.length; i++)
      tube(points[i - 1], points[i], r, color);
  }
  const head =
    Engine.r + Engine.rod + 0.012 + Engine.stroke / (model.cfg.compression - 1);
  // A continuous casting with eight through-bores, a valley, and lower crankcase skirt.
  group("block", "Cylinder block");
  part("halfTube", [0, 0, 0], shaftAxes, [0.103, 0.46, 0.076], cast, 0.4);
  for (const xx of [-0.093, 0.093])
    box([xx, -0.055, 0], [0.023, 0.022, 0.478], cast);
  box([0, 0.086, 0], [0.065, 0.018, 0.455], cast);
  for (const bank of [-1, 1]) {
    const u: Vec3 = [bank * Math.SQRT1_2, Math.SQRT1_2, 0],
      n: Vec3 = [Math.SQRT1_2, -bank * Math.SQRT1_2, 0],
      basis: Basis = [n, u, [0, 0, 1]],
      pos = (d: number, zz = 0): Vec3 => [u[0] * d, u[1] * d, zz];
    group(
      "block",
      bank < 0 ? "Left cylinder bank" : "Right cylinder bank",
      bank,
    );
    for (let i = 0; i < 4; i++) {
      const zz = (i - 1.5) * 0.11;
      part(
        "bore",
        pos((0.078 + head) / 2, zz),
        basis,
        [0.055, head - 0.078, 0.055],
        cast,
        0.38,
      );
      part(
        "liner",
        pos((0.08 + head) / 2, zz),
        basis,
        [0.043, head - 0.08, 0.043],
        silver,
      );
      for (const side of [-1, 1]) {
        const c = add(pos(head + 0.001, zz), n, side * 0.047);
        bolt(c, u, 0.003);
      }
      const plug = add(pos(0.122, zz), n, bank * 0.057);
      tube(plug, add(plug, n, bank * 0.003), 0.013, steel);
      tube(add(plug, n, bank * 0.003), add(plug, n, bank * 0.004), 0.01, brass);
    }
    for (const side of [-1, 1])
      box(add(pos(0.128), n, side * 0.058), [0.012, 0.099, 0.454], cast, basis);
    // Heads, ports, and spark plugs. A bank remains intact in the half-section view.
    group(
      "heads",
      bank < 0 ? "Left cylinder head" : "Right cylinder head",
      bank,
    );
    box(pos(head + 0.024), [0.129, 0.043, 0.472], silver, basis, "bevel", 0.72);
    box(pos(head + 0.001), [0.132, 0.002, 0.474], dark, basis);
    for (let i = 0; i < 4; i++) {
      const zz = (i - 1.5) * 0.11;
      for (const side of [-1, 1]) {
        const p = add(pos(head + 0.021, zz), n, side * 0.065);
        tube(p, add(p, n, side * 0.004), 0.015, steel, "tube");
        tube(add(p, n, side * 0.001), add(p, n, side * 0.002), 0.011, dark);
      }
      const plug = add(pos(head + 0.01, zz + 0.031), n, bank * 0.052);
      tube(plug, add(plug, n, bank * 0.025), 0.004, [0.88, 0.87, 0.78, 1]);
      bolt(add(pos(head + 0.047, zz), n, bank * 0.045), u, 0.004);
    }
    // Removable ribbed covers with a gasket and perimeter fasteners.
    group(
      "covers",
      bank < 0 ? "Left rocker cover" : "Right rocker cover",
      bank,
    );
    box(
      pos(head + 0.089),
      [0.127, 0.051, 0.468],
      cover,
      basis,
      "coverShell",
      0.7,
    );
    box(pos(head + 0.064), [0.136, 0.004, 0.475], dark, basis);
    for (const offset of [-0.033, -0.016, 0, 0.016, 0.033])
      box(
        add(pos(head + 0.115), n, offset),
        [0.005, 0.004, 0.374],
        silver,
        basis,
        "bevel",
      );
    for (const zz of [-0.185, 0, 0.185])
      for (const side of [-1, 1])
        bolt(add(pos(head + 0.077, zz), n, side * 0.059), u, 0.004);
    if (bank < 0) {
      const cap = pos(head + 0.122, -0.14);
      part("cylinder", cap, basis, [0.018, 0.015, 0.018], dark);
      part("cylinder", add(cap, u, 0.008), basis, [0.015, 0.002, 0.015], brass);
    }
  }
  // Crankshaft with four cross-plane throws and individual counterweights.
  group("rotating", "Cross-plane crankshaft");
  tube([0, 0, -0.274], [0, 0, 0.258], 0.016, silver);
  for (let i = 0; i < 4; i++) {
    const k = Engine.piston(crank, i * 2 + 1),
      zz = (i - 1.5) * 0.11,
      p: Vec3 = [k.pin[0], k.pin[1], zz];
    const radial = norm([p[0], p[1], 0]),
      perp: Vec3 = [-radial[1], radial[0], 0];
    for (const offset of [-0.032, 0.032]) {
      tube([0, 0, zz + offset], add(p, [0, 0, 1], offset), 0.017, steel);
      part(
        "weight",
        [-p[0] * 0.38, -p[1] * 0.38, zz + offset],
        [perp, [0, 0, 1], radial],
        [0.047, 0.014, 0.047],
        steel,
      );
    }
    tube(add(p, [0, 0, 1], -0.033), add(p, [0, 0, 1], 0.033), 0.013, silver);
  }
  for (let i = 0; i < 5; i++) {
    const zz = -0.22 + i * 0.11;
    group("bearings", `Main bearing ${i + 1}`);
    part("halfTube", [0, -0.002, zz], shaftAxes, [0.027, 0.023, 0.027], brass);
    part("halfTube", [0, -0.005, zz], shaftAxes, [0.034, 0.028, 0.034], silver);
    for (const xx of [-0.041, 0.041]) {
      box([xx, -0.024, zz], [0.025, 0.029, 0.03], silver, axes, "bevel");
      tube([xx, -0.048, zz], [xx, 0.012, zz], 0.003, steel);
      bolt([xx, -0.05, zz], [0, -1, 0], 0.005);
    }
  }
  // Pistons and rods retain the exact thermodynamic slider-crank positions.
  for (let id = 1; id <= 8; id++) {
    const k = Engine.piston(crank, id),
      phase = Engine.phase(crank, id),
      s = Engine.sampleAt(model, phase),
      bank = id % 2 ? -1 : 1,
      basis: Basis = [k.n, k.u, [0, 0, 1]],
      pos = (d: number): Vec3 => [k.u[0] * d, k.u[1] * d, k.axial];
    group("rotating", `Piston & rod ${id}`, bank, id);
    const delta = sub(k.center, k.pin),
      rodU = norm(delta),
      rodN = norm(cross([0, 0, 1], rodU));
    box(
      add(k.pin, delta, 0.5),
      [0.012, Math.hypot(...delta) - 0.01, 0.011],
      silver,
      [rodN, rodU, [0, 0, 1]],
      "bevel",
    );
    box(
      add(k.pin, delta, 0.5),
      [0.007, Math.hypot(...delta) - 0.025, 0.0115],
      steel,
      [rodN, rodU, [0, 0, 1]],
      "bevel",
    );
    tube(
      add(k.pin, [0, 0, 1], -0.009),
      add(k.pin, [0, 0, 1], 0.009),
      0.019,
      silver,
      "tube",
    );
    part(
      "cylinder",
      pos(k.distance - 0.004),
      basis,
      [0.041, 0.033, 0.041],
      silver,
    );
    for (const d of [0.001, 0.0055, 0.0095])
      part(
        "cylinder",
        pos(k.distance + d),
        basis,
        [0.0415, 0.0014, 0.0415],
        dark,
      );
    part(
      "cylinder",
      pos(k.distance + 0.013),
      basis,
      [0.035, 0.001, 0.035],
      [0.78, 0.8, 0.8, 1],
    );
    tube(add(k.center, k.n, -0.041), add(k.center, k.n, 0.041), 0.006, steel);
    // Valve lift uses smooth ideal stroke timing; it remains illustrative, not a cam design.
    group("valves", `Valve gear ${id}`, bank, id);
    for (const side of [-1, 1]) {
      const valvePhase = side < 0 ? phase : phase - 540,
        lift =
          valvePhase >= 0 && valvePhase < 180
            ? 0.009 * Math.sin((valvePhase * Math.PI) / 180) ** 2
            : 0;
      const valve = add(pos(head + 0.002 - lift), k.n, side * 0.02);
      part(
        "cylinder",
        valve,
        basis,
        [0.014, 0.003, 0.014],
        side < 0 ? silver : brass,
      );
      tube(valve, add(valve, k.u, 0.064), 0.0025, steel);
      const springBase = add(pos(head + 0.045), k.n, side * 0.02),
        length = 0.021 - lift;
      part(
        "spring",
        add(springBase, k.u, length / 2),
        basis,
        [0.007, length, 0.007],
        steel,
      );
      part(
        "cylinder",
        add(springBase, k.u, length),
        basis,
        [0.009, 0.003, 0.009],
        silver,
      );
      const pivot = pos(head + 0.066),
        tip = add(pos(head + 0.066 - lift), k.n, side * 0.02),
        back = add(pos(head + 0.066 + lift * 0.6), k.n, -side * 0.025);
      tube(back, tip, 0.004, silver);
      tube(
        add(pivot, [0, 0, 1], -0.008),
        add(pivot, [0, 0, 1], 0.008),
        0.006,
        steel,
      );
      const lifter: Vec3 = [bank * 0.018, 0.088, k.axial + side * 0.014];
      tube(lifter, back, 0.0028, silver);
    }
    const crown = k.distance + 0.012,
      col: Color =
        phase < 180
          ? [0.2, 0.67, 0.83, 0.13]
          : phase < 360
            ? [0.38, 0.64, 0.73, 0.1]
            : phase < 540
              ? [1, 0.4, 0.065, 0.17 + Math.min(1, s.p / model.peak) * 0.33]
              : [0.52, 0.57, 0.6, 0.1];
    group("rotating", `Combustion chamber ${id}`, bank, id);
    if (assembly.mode === "cutaway" && e < 0.01 && bank > 0)
      part(
        "cylinder",
        pos((head + crown) / 2),
        basis,
        [0.039, Math.max(0.001, head - crown), 0.039],
        col,
        0,
        false,
      );
    if (
      assembly.visible.has("rotating") &&
      (assembly.mode === "cutaway" || assembly.mode === "exploded")
    ) {
      const p = add(
          pos(head + 0.077),
          assembly.mode === "exploded" ? [0, 0.01, 0] : [0, 0, 0],
        ),
        clip = [0, 0, 0, 0];
      for (let row = 0; row < 4; row++)
        for (let j = 0; j < 4; j++) clip[row] += vp[j * 4 + row] * [...p, 1][j];
      labels.push({
        id,
        point: [((clip[0] + 1) * w) / 2, ((1 - clip[1]) * h) / 2],
        color: id === selected ? "#c27816" : "#546774",
      });
    }
  }
  group("valves", "Camshaft");
  tube([0, 0.08, -0.24], [0, 0.08, 0.24], 0.009, steel);
  for (let i = 0; i < 16; i++) {
    const a = ((crank * 0.5 + i * 45) * Math.PI) / 180,
      zz = -0.2 + i * 0.0267;
    part(
      "cylinder",
      [Math.sin(a) * 0.0035, 0.08 + Math.cos(a) * 0.0035, zz],
      shaftAxes,
      [0.013, 0.009, 0.013],
      silver,
    );
  }
  // Sealed intake plenum, curved runners, and a front throttle body.
  group("intake", "Intake plenum");
  box([0, 0.254, 0], [0.115, 0.071, 0.331], silver, axes, "bevel", 0.6);
  box([0, 0.29, 0], [0.095, 0.009, 0.31], cover, axes, "bevel");
  for (let i = 0; i < 7; i++)
    box(
      [0, 0.296, -0.12 + i * 0.04],
      [0.083, 0.003, 0.005],
      silver,
      axes,
      "bevel",
    );
  for (const bank of [-1, 1])
    for (let i = 0; i < 4; i++) {
      group("intake", `${bank < 0 ? "Left" : "Right"} intake runner ${i + 1}`);
      const zz = (i - 1.5) * 0.11;
      pipe(
        [
          [bank * 0.037, 0.243, zz * 0.8],
          [bank * 0.061, 0.214, zz],
          [bank * 0.09, 0.191, zz],
          [bank * 0.113, 0.172, zz],
        ],
        0.014,
        silver,
      );
      for (const side of [-1, 1])
        bolt([bank * 0.062, 0.215, zz + side * 0.015], [0, 1, 0], 0.0025);
    }
  group("intake", "Throttle body");
  tube([0, 0.256, -0.173], [0, 0.256, -0.221], 0.029, steel, "tube");
  tube([0, 0.256, -0.22], [0, 0.256, -0.228], 0.033, silver, "tube");
  part("cylinder", [0, 0.256, -0.22], shaftAxes, [0.024, 0.002, 0.024], brass);
  // Short, swept exhaust manifolds with flanges and merged outlets.
  for (const bank of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      group(
        "exhaust",
        `${bank < 0 ? "Left" : "Right"} exhaust runner ${i + 1}`,
        bank,
      );
      const zz = (i - 1.5) * 0.11;
      pipe(
        [
          [bank * 0.189, 0.12, zz],
          [bank * 0.212, 0.1, zz],
          [bank * 0.234, 0.056, zz + 0.014],
          [bank * 0.22, 0.018, 0.205],
        ],
        0.012,
        steel,
      );
      box([bank * 0.187, 0.119, zz], [0.009, 0.043, 0.043], silver);
      for (const dz of [-0.017, 0.017])
        bolt([bank * 0.194, 0.126, zz + dz], [bank, 0, 0], 0.003);
    }
    group(
      "exhaust",
      bank < 0 ? "Left exhaust collector" : "Right exhaust collector",
      bank,
    );
    tube(
      [bank * 0.22, 0.018, 0.19],
      [bank * 0.22, -0.004, 0.27],
      0.024,
      steel,
      "tube",
    );
    tube(
      [bank * 0.22, -0.004, 0.266],
      [bank * 0.22, -0.007, 0.276],
      0.029,
      silver,
      "tube",
    );
  }
  group("pan", "Oil sump");
  box([0, -0.109, 0], [0.191, 0.085, 0.445], dark, axes, "sump", 0.75);
  box([0, -0.065, 0], [0.218, 0.008, 0.48], silver, axes, "flange");
  box([0, -0.061, 0], [0.215, 0.002, 0.476], dark, axes, "flange");
  for (const xx of [-0.096, 0.096])
    for (let i = 0; i < 8; i++)
      bolt([xx, -0.071, -0.211 + i * 0.0603], [0, -1, 0], 0.0035);
  for (const xx of [-0.065, -0.032, 0, 0.032, 0.065])
    box([xx, -0.152, 0], [0.007, 0.003, 0.33], steel, axes, "bevel");
  tube([0.083, -0.131, 0.16], [0.101, -0.131, 0.16], 0.005, brass);
  // Sprockets, chain links, front cover, pulley, and flywheel.
  group("timing", "Timing chain & sprockets");
  for (const [yy, radius, ratio] of [
    [0, 0.025, 1],
    [0.08, 0.05, 0.5],
  ]) {
    tube([0, yy, -0.254], [0, yy, -0.265], radius, silver, "tube");
    const count = ratio === 1 ? 20 : 40;
    for (let i = 0; i < count; i++) {
      const a = (crank * ratio * Math.PI) / 180 + (i * Math.PI * 2) / count;
      box(
        [Math.cos(a) * radius, yy + Math.sin(a) * radius, -0.262],
        [0.004, 0.004, 0.011],
        steel,
      );
    }
    tube([0, yy, -0.25], [0, yy, -0.268], 0.009, steel);
  }
  for (let side of [-1, 1])
    for (let i = 0; i < 16; i++) {
      const t = (i / 16 + Engine.mod(crank, 360) / 360 / 16) % 1,
        xx = side * (0.025 + 0.025 * t),
        yy = 0.08 * t;
      box([xx, yy, -0.267], [0.007, 0.004, 0.004], dark);
    }
  for (const [yy, radius, start, count] of [
    [0.08, 0.05, 0, 32],
    [0, 0.025, Math.PI, 16],
  ])
    for (let i = 0; i < count; i++) {
      const a = start + ((i + 0.5) * Math.PI) / count;
      box(
        [Math.cos(a) * radius, yy + Math.sin(a) * radius, -0.267],
        [0.005, 0.004, 0.005],
        dark,
      );
    }
  group("timing", "Front timing cover");
  box([0, 0.038, -0.281], [0.143, 0.192, 0.022], cover, axes, "bevel", 0.7);
  tube([0, 0, -0.29], [0, 0, -0.324], 0.049, steel);
  for (const zz of [-0.3, -0.307, -0.314])
    tube([0, 0, zz], [0, 0, zz - 0.002], 0.05, dark);
  for (const xx of [-0.055, 0.055])
    for (const yy of [-0.035, 0.04, 0.115])
      bolt([xx, yy, -0.294], [0, 0, -1], 0.0035);
  group("timing", "Flywheel");
  tube([0, 0, 0.257], [0, 0, 0.281], 0.075, silver);
  tube([0, 0, 0.281], [0, 0, 0.285], 0.066, steel);
  tube([0, 0, 0.285], [0, 0, 0.292], 0.019, silver);
  for (let i = 0; i < 64; i++) {
    const a = ((crank + (i * 360) / 64) * Math.PI) / 180;
    box(
      [Math.cos(a) * 0.075, Math.sin(a) * 0.075, 0.27],
      [0.004, 0.004, 0.022],
      steel,
    );
  }
  for (let i = 0; i < 8; i++) {
    const a = (crank * Math.PI) / 180 + (i * Math.PI) / 4;
    bolt([Math.cos(a) * 0.038, Math.sin(a) * 0.038, 0.286], [0, 0, 1], 0.004);
  }
  const opaque = commands.filter((c) => c.color[3] >= 1),
    transparent = commands.filter((c) => c.color[3] < 1);
  for (let i = 0; i < 16; i++)
    transparent.push({
      type: "cylinder",
      center: [0, -0.156 - e * 0.19, 0],
      basis: axes,
      size: [0.32 - i * 0.009, 0.0001, 0.27 - i * 0.007],
      color: [0.32, 0.39, 0.43, 0.007],
      metal: 0,
      pickable: false,
      cut: false,
    });
  gl.disable(gl.BLEND);
  gl.depthMask(true);
  for (const c of opaque) draw(state, c, vp);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  transparent.sort(
    (a, b) => dot(sub(b.center, eye), z) - dot(sub(a.center, eye), z),
  );
  for (const c of transparent) draw(state, c, vp);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  lastFrame = { commands, vp, eye, w, h, signature, labels };
  return labels;
}
function pick(x: number, y: number): SelectedPart | null {
  if (!state || !lastFrame) return null;
  const renderer = state;
  const { gl, canvas, U } = renderer,
    { commands, vp } = lastFrame;
  if (
    !state.pickBuffer ||
    state.pickBuffer.width !== canvas.width ||
    state.pickBuffer.height !== canvas.height
  ) {
    if (state.pickBuffer) {
      gl.deleteFramebuffer(state.pickBuffer.fbo);
      gl.deleteTexture(state.pickBuffer.texture);
      gl.deleteRenderbuffer(state.pickBuffer.depth);
    }
    const fbo = allocated(gl.createFramebuffer()),
      texture = allocated(gl.createTexture()),
      depth = allocated(gl.createRenderbuffer());
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      canvas.width,
      canvas.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(
      gl.RENDERBUFFER,
      gl.DEPTH_COMPONENT16,
      canvas.width,
      canvas.height,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER,
      gl.DEPTH_ATTACHMENT,
      gl.RENDERBUFFER,
      depth,
    );
    state.pickBuffer = {
      fbo,
      texture,
      depth,
      width: canvas.width,
      height: canvas.height,
    };
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, state.pickBuffer.fbo);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.disable(gl.BLEND);
  gl.disable(gl.DITHER);
  gl.depthMask(true);
  commands.forEach((c, i) => {
    if (c.pickable) draw(renderer, c, vp, true, i + 1);
  });
  const pixel = new Uint8Array(4),
    px = Math.min(
      canvas.width - 1,
      Math.max(0, Math.floor((x / canvas.clientWidth) * canvas.width)),
    ),
    py = Math.min(
      canvas.height - 1,
      Math.max(0, Math.floor((1 - y / canvas.clientHeight) * canvas.height)),
    );
  gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.uniform1f(U.picking, 0);
  gl.enable(gl.DITHER);
  const c = commands[pixel[0] + pixel[1] * 256 + pixel[2] * 65536 - 1];
  return c?.pickable
    ? { layer: c.layer, name: c.name, cylinder: c.cylinder }
    : null;
}
export const Scene = {
  render,
  pick,
  exportAssembly: () => ({
    meshes: state?.meshData,
    parts: lastFrame?.commands
      .filter((c) => c.pickable)
      .map((c) => ({ ...c, cut: false })),
    source: blenderMeshes ? "Blender" : "procedural",
  }),
};
