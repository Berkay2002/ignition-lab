export const layers = [
  {
    id: "block",
    name: "Cylinder block",
    description:
      "Cylinder banks, bore liners, casting ribs, oil filter and starter motor.",
  },
  {
    id: "rotating",
    name: "Crank & pistons",
    description:
      "Eight pistons and connecting rods drive four shared crank throws.",
  },
  {
    id: "bearings",
    name: "Main bearings",
    description: "Five main bearing caps support the crankshaft.",
  },
  {
    id: "pan",
    name: "Oil pan",
    description:
      "The bolted sump, oil pickup and windage tray beneath the crank.",
  },
  {
    id: "heads",
    name: "Cylinder heads",
    description: "Two head castings close the chambers and carry the ports.",
  },
  {
    id: "valves",
    name: "Valvetrain",
    description:
      "The half-speed camshaft actuates pushrods, rockers, and spring-return valves.",
  },
  {
    id: "covers",
    name: "Valve covers",
    description: "Ribbed covers with breathers, ignition coils and plug leads.",
  },
  {
    id: "intake",
    name: "Intake manifold",
    description:
      "The plenum and swept runners feed both banks, with rails and eight fuel injectors.",
  },
  {
    id: "exhaust",
    name: "Exhaust manifolds",
    description: "Four runners on each bank merge into a collector.",
  },
  {
    id: "timing",
    name: "Timing & flywheel",
    description:
      "A 2:1 timing drive, flywheel, alternator, water pump and serpentine belt.",
  },
] satisfies {
  id:
    | "block"
    | "rotating"
    | "bearings"
    | "pan"
    | "heads"
    | "valves"
    | "covers"
    | "intake"
    | "exhaust"
    | "timing";
  name: string;
  description: string;
}[];
export type LayerId = (typeof layers)[number]["id"];
export type ViewMode = "assembled" | "cutaway" | "exploded";
export type SelectedPart = {
  layer: LayerId;
  name: string;
  cylinder: number | null;
};
export type AssemblyState = {
  mode: ViewMode;
  explode: number;
  targetExplode: number;
  visible: Set<LayerId>;
  selected: SelectedPart | null;
};
export function isViewMode(value: unknown): value is ViewMode {
  return value === "assembled" || value === "cutaway" || value === "exploded";
}
export const Assembly = {
  layers,
  create: (): AssemblyState => ({
    mode: "assembled",
    explode: 0,
    targetExplode: 0,
    visible: new Set(layers.map((layer) => layer.id)),
    selected: null,
  }),
};
