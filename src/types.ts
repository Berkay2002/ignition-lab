/** Three spatial coordinates, in metres, or three direction components. */
export type Vec3 = [number, number, number];
export type Basis = [Vec3, Vec3, Vec3];
export type Color = [number, number, number, number];
export type Camera = { yaw: number; elevation: number; zoom: number };
export type Label = { id: number; point: [number, number]; color: string };
export type AudioParameters = {
  rpm: number;
  amplitude: number;
  running: boolean;
  tone?: AudioTone;
};
export type AudioTone = {
  exhaust: "stock" | "sport" | "open";
  listening: "tailpipe" | "engine" | "cabin" | "roadside";
  crank: "cross-plane" | "flat-plane";
  resonance: number;
  roughness: number;
  overrun: boolean;
  disabledCylinder: number | null;
  timingRetard: number;
  speedMS: number;
  distanceM: number;
};
export type MeshName =
  | "cylinder"
  | "tube"
  | "liner"
  | "halfTube"
  | "weight"
  | "box"
  | "bevel"
  | "bore"
  | "spring"
  | "sump"
  | "flange"
  | "coverShell"
  | "hex"
  | "badge"
  | "piston";
export type MeshData = Record<MeshName, number[]>;

export function map3(
  v: Vec3,
  fn: (value: number, index: number) => number,
): Vec3 {
  return [fn(v[0], 0), fn(v[1], 1), fn(v[2], 2)];
}
