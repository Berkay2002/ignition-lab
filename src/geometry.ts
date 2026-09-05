/* Meshes are in local coordinates, with explicit normals and no external assets. */
import { map3 } from "./types.js";
import type { Vec3, MeshData } from "./types.js";
function builder() {
  const data: number[] = [];
  const vertex = (p: Vec3, n: Vec3) => data.push(...p, ...n);
  const tri = (a: Vec3, b: Vec3, c: Vec3, na: Vec3, nb = na, nc = na) => {
    vertex(a, na);
    vertex(b, nb);
    vertex(c, nc);
  };
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, n: Vec3) => {
    tri(a, b, c, n);
    tri(a, c, d, n);
  };
  return { data, tri, quad };
}
function round(inner = 0, start = 0, end = Math.PI * 2) {
  const b = builder(),
    segments = 48;
  for (let i = 0; i < segments; i++) {
    const a = start + ((end - start) * i) / segments,
      c = start + ((end - start) * (i + 1)) / segments;
    const n: Vec3 = [Math.cos(a), 0, Math.sin(a)],
      m: Vec3 = [Math.cos(c), 0, Math.sin(c)];
    const p: Vec3 = [n[0], -0.5, n[2]],
      q: Vec3 = [m[0], -0.5, m[2]],
      r: Vec3 = [m[0], 0.5, m[2]],
      s: Vec3 = [n[0], 0.5, n[2]];
    b.tri(p, s, r, n, n, m);
    b.tri(p, r, q, n, m, m);
    for (const y of [-0.5, 0.5]) {
      const up: Vec3 = [0, Math.sign(y), 0],
        p: Vec3 = [n[0], y, n[2]],
        q: Vec3 = [m[0], y, m[2]];
      if (inner)
        b.quad(
          p,
          q,
          [m[0] * inner, y, m[2] * inner],
          [n[0] * inner, y, n[2] * inner],
          up,
        );
      else b.tri([0, y, 0], p, q, up);
    }
    if (inner) {
      const nn = map3(n, (v) => -v),
        mm = map3(m, (v) => -v);
      const p: Vec3 = [n[0] * inner, -0.5, n[2] * inner],
        q: Vec3 = [m[0] * inner, -0.5, m[2] * inner],
        r: Vec3 = [m[0] * inner, 0.5, m[2] * inner],
        s: Vec3 = [n[0] * inner, 0.5, n[2] * inner];
      b.tri(p, q, r, nn, mm, mm);
      b.tri(p, r, s, nn, mm, nn);
    }
  }
  if (end - start < Math.PI * 2 - 0.01)
    for (const a of [start, end]) {
      const c = Math.cos(a),
        s = Math.sin(a);
      b.quad(
        [inner * c, -0.5, inner * s],
        [c, -0.5, s],
        [c, 0.5, s],
        [inner * c, 0.5, inner * s],
        [Math.sin(a), 0, -Math.cos(a)],
      );
    }
  return b.data;
}
function box(bevel = false) {
  const b = builder();
  if (!bevel) {
    for (let axis = 0; axis < 3; axis++)
      for (const sign of [-1, 1]) {
        const n: Vec3 = [0, 0, 0];
        n[axis] = sign;
        const a = (axis + 1) % 3,
          c = (axis + 2) % 3,
          points: Vec3[] = [];
        for (const [x, y] of [
          [-0.5, -0.5],
          [0.5, -0.5],
          [0.5, 0.5],
          [-0.5, 0.5],
        ]) {
          const p: Vec3 = [0, 0, 0];
          p[axis] = sign * 0.5;
          p[a] = x;
          p[c] = y;
          points.push(p);
        }
        b.quad(points[0], points[1], points[2], points[3], n);
      }
    return b.data;
  }
  const ring = (y: number, s: number): Vec3[] =>
    [
      [-0.4, y, -0.5],
      [0.4, y, -0.5],
      [0.5, y, -0.4],
      [0.5, y, 0.4],
      [0.4, y, 0.5],
      [-0.4, y, 0.5],
      [-0.5, y, 0.4],
      [-0.5, y, -0.4],
    ].map((p): Vec3 => [p[0] * s, p[1], p[2] * s]);
  const rings = [
    ring(-0.5, 0.85),
    ring(-0.35, 1),
    ring(0.28, 1),
    ring(0.5, 0.8),
  ];
  for (let k = 0; k < 3; k++)
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8,
        p = rings[k][i],
        q = rings[k][j],
        r = rings[k + 1][j],
        s = rings[k + 1][i];
      const a = map3(q, (v, l) => v - p[l]),
        c = map3(s, (v, l) => v - p[l]),
        n: Vec3 = [
          a[1] * c[2] - a[2] * c[1],
          a[2] * c[0] - a[0] * c[2],
          a[0] * c[1] - a[1] * c[0],
        ];
      const len = Math.hypot(...n);
      b.quad(
        p,
        q,
        r,
        s,
        map3(n, (v) => v / len),
      );
    }
  for (const k of [0, 3])
    for (let i = 0; i < 8; i++)
      b.tri([0, k === 0 ? -0.5 : 0.5, 0], rings[k][i], rings[k][(i + 1) % 8], [
        0,
        k === 0 ? -1 : 1,
        0,
      ]);
  return b.data;
}
function bore() {
  const b = builder(),
    radius = 0.782;
  for (let i = 0; i < 64; i++) {
    const a = (i * Math.PI) / 32,
      c = ((i + 1) * Math.PI) / 32,
      ca = Math.cos(a),
      sa = Math.sin(a),
      cc = Math.cos(c),
      sc = Math.sin(c);
    const ra = 1 / Math.max(Math.abs(ca), Math.abs(sa)),
      rc = 1 / Math.max(Math.abs(cc), Math.abs(sc));
    const n: Vec3 =
      Math.abs(Math.cos((a + c) / 2)) > Math.abs(Math.sin((a + c) / 2))
        ? [Math.sign(Math.cos((a + c) / 2)), 0, 0]
        : [0, 0, Math.sign(Math.sin((a + c) / 2))];
    b.quad(
      [ra * ca, -0.5, ra * sa],
      [rc * cc, -0.5, rc * sc],
      [rc * cc, 0.5, rc * sc],
      [ra * ca, 0.5, ra * sa],
      n,
    );
    for (const y of [-0.5, 0.5])
      b.quad(
        [ra * ca, y, ra * sa],
        [rc * cc, y, rc * sc],
        [radius * cc, y, radius * sc],
        [radius * ca, y, radius * sa],
        [0, Math.sign(y), 0],
      );
    b.tri(
      [radius * ca, -0.5, radius * sa],
      [radius * cc, -0.5, radius * sc],
      [radius * cc, 0.5, radius * sc],
      [-ca, 0, -sa],
      [-cc, 0, -sc],
      [-cc, 0, -sc],
    );
    b.tri(
      [radius * ca, -0.5, radius * sa],
      [radius * cc, 0.5, radius * sc],
      [radius * ca, 0.5, radius * sa],
      [-ca, 0, -sa],
      [-cc, 0, -sc],
      [-ca, 0, -sa],
    );
  }
  return b.data;
}
function spring() {
  const b = builder(),
    steps = 100,
    sides = 6;
  function point(i: number, j: number) {
    const t = (i / steps) * Math.PI * 10,
      a = (j / sides) * Math.PI * 2,
      n: Vec3 = [
        Math.cos(t) * Math.cos(a),
        Math.sin(a),
        Math.sin(t) * Math.cos(a),
      ];
    const p: Vec3 = [
      Math.cos(t) + n[0] * 0.115,
      i / steps - 0.5 + n[1] * 0.038,
      Math.sin(t) + n[2] * 0.115,
    ];
    return { p, n };
  }
  for (let i = 0; i < steps; i++)
    for (let j = 0; j < sides; j++) {
      const a = point(i, j),
        c = point(i, j + 1),
        d = point(i + 1, j + 1),
        e = point(i + 1, j);
      b.tri(a.p, c.p, d.p, a.n, c.n, d.n);
      b.tri(a.p, d.p, e.p, a.n, d.n, e.n);
    }
  return b.data;
}
export const Geometry = {
  meshes: (): MeshData => ({
    cylinder: round(),
    tube: round(0.83),
    liner: round(0.965),
    halfTube: round(0.68, Math.PI, Math.PI * 2),
    weight: round(0, Math.PI, Math.PI * 2),
    box: box(),
    bevel: box(true),
    bore: bore(),
    spring: spring(),
    sump: box(true),
    flange: box(),
    coverShell: box(true),
  }),
};
