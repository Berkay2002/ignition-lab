export type CarProfile = {
  id: string;
  name: string;
  engine: string;
  displacementLitres: number;
  crank: "cross-plane" | "flat-plane";
  aspiration: "natural" | "turbo" | "supercharged";
  idleRpm: number;
  redlineRpm: number;
  peakPowerKw: number;
  peakTorqueNm: number;
  massKg: number;
  dragAreaM2: number;
  tyreRadiusM: number;
  finalDrive: number;
  gears: number[];
  shiftSeconds: number;
  tractionMu: number;
  drivetrainEfficiency: number;
  torqueCurve: [number, number][];
  sound: { resonance: number; roughness: number };
  sources: { label: string; url: string }[];
  assumptions: string;
};

export type DriveScenario =
  | "launch"
  | "sprint"
  | "rolling"
  | "braking"
  | "dyno"
  | "free";
export type DriveControls = {
  transmission: "auto" | "manual";
  throttle: number;
  brake: number;
  shift: -1 | 0 | 1;
  disabledCylinder: number | null;
  timingRetard: number;
};
export type DriveState = {
  scenario: DriveScenario;
  status: "ready" | "running" | "complete" | "limited";
  stage:
    | "idle"
    | "launch"
    | "pull"
    | "shift"
    | "coast"
    | "brake"
    | "rev-match"
    | "done";
  elapsed: number;
  speedMS: number;
  distanceM: number;
  rpm: number;
  gear: number;
  throttle: number;
  acceleration: number;
  torqueNm: number;
  powerKw: number;
  wheelPowerKw: number;
  shiftRemaining: number;
  shiftFromRpm: number;
  shiftTargetGear: number;
  lastShiftAt: number;
};
