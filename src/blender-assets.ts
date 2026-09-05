import type { MeshData } from "./types.js";
declare global {
  var BlenderMeshes: unknown;
}

function isVertices(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length % 18 === 0 &&
    value.every((v: unknown) => typeof v === "number" && Number.isFinite(v))
  );
}
/** Validate the generated asset once where it enters the typed renderer. */
export function readBlenderMeshes(): MeshData | null {
  const value = globalThis.BlenderMeshes;
  if (value === undefined) return null;
  if (!value || typeof value !== "object")
    throw new Error("Invalid Blender mesh asset.");
  if (
    !("cylinder" in value && isVertices(value.cylinder)) ||
    !("tube" in value && isVertices(value.tube)) ||
    !("liner" in value && isVertices(value.liner)) ||
    !("halfTube" in value && isVertices(value.halfTube)) ||
    !("weight" in value && isVertices(value.weight)) ||
    !("box" in value && isVertices(value.box)) ||
    !("bevel" in value && isVertices(value.bevel)) ||
    !("bore" in value && isVertices(value.bore)) ||
    !("spring" in value && isVertices(value.spring)) ||
    !("sump" in value && isVertices(value.sump)) ||
    !("flange" in value && isVertices(value.flange)) ||
    !("coverShell" in value && isVertices(value.coverShell))
  )
    throw new Error("Incomplete Blender mesh asset.");
  return {
    cylinder: value.cylinder,
    tube: value.tube,
    liner: value.liner,
    halfTube: value.halfTube,
    weight: value.weight,
    box: value.box,
    bevel: value.bevel,
    bore: value.bore,
    spring: value.spring,
    sump: value.sump,
    flange: value.flange,
    coverShell: value.coverShell,
  };
}
