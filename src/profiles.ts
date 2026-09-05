import type { CarProfile } from "./vehicle-types.js";

const torqueAtPower = (kw: number, rpm: number) =>
  (kw * 60000) / (2 * Math.PI * rpm);
const illustrative =
  "Torque between published peaks is interpolated, not a measured dyno map. Grip, losses, shift timing and audio resonance are modeling assumptions. Audio is synthesized, not a recording or an exact reproduction.";

export const defaultProfile: CarProfile = {
  id: "audi-r8",
  name: "Audi R8 4.2 FSI · 2007",
  engine: "4.2 FSI V8 · 6-speed manual",
  displacementLitres: 4.163,
  crank: "cross-plane",
  aspiration: "natural",
  idleRpm: 850,
  redlineRpm: 8250,
  peakPowerKw: 309,
  peakTorqueNm: 430,
  massKg: 1560,
  dragAreaM2: 0.69,
  tyreRadiusM: 0.33,
  finalDrive: 4.235,
  gears: [4.373, 2.709, 1.878, 1.413, 1.126, 0.928],
  shiftSeconds: 0.32,
  tractionMu: 0.98,
  drivetrainEfficiency: 0.86,
  torqueCurve: [
    [850, 180],
    [2000, 320],
    [3500, 395],
    [4500, 430],
    [6000, 430],
    [7000, 410],
    [7800, torqueAtPower(309, 7800)],
    [8250, 350],
  ],
  sound: { resonance: 1.1, roughness: 0.8 },
  sources: [
    {
      label: "Audi 2007 R8 owner's manual, pp. 196-198 (archived copy)",
      url: "https://sb952effb4c14a0dc.jimcontent.com/download/version/1703856959/module/9694138682/name/Audi%20R8%20Owners%20Manual%202007.pdf",
    },
    {
      label: "Audi: the first-generation R8",
      url: "https://www.audi.com/en/press-releases/the-audi-r8-a-captivating-legend-16374",
    },
  ],
  assumptions:
    "Published engine peaks and 1560 kg manual-car mass include a 75 kg driver allowance. Gear ratios, final drive, 0.69 m² drag area, 0.33 m rolling radius, idle and 8250 rpm limit are unverified simulation inputs. " +
    illustrative,
};

export const profiles: CarProfile[] = [
  defaultProfile,
  {
    id: "audi-rs6",
    name: "Audi RS 6 Avant performance · 2023",
    engine: "4.0 TFSI V8 biturbo · 8-speed automatic",
    displacementLitres: 3.996,
    crank: "cross-plane",
    aspiration: "turbo",
    idleRpm: 750,
    redlineRpm: 6500,
    peakPowerKw: 463,
    peakTorqueNm: 850,
    massKg: 2165,
    dragAreaM2: 0.8435,
    tyreRadiusM: 0.355,
    finalDrive: 3.204,
    gears: [4.714, 3.143, 2.106, 1.667, 1.285, 1, 0.839, 0.667],
    shiftSeconds: 0.18,
    tractionMu: 1.04,
    drivetrainEfficiency: 0.86,
    torqueCurve: [
      [750, 220],
      [1500, 500],
      [2300, 850],
      [4500, 850],
      [5500, 800],
      [6000, torqueAtPower(463, 6000)],
      [6500, 650],
    ],
    sound: { resonance: 0.77, roughness: 0.78 },
    sources: [
      {
        label: "Audi: RS 6 Avant performance launch, June 2023",
        url: "https://www.audi.com/en/the-audi-rs-6-avant-and-the-new-audi-rs-6-avant-performance-12345/dynamic-power-meets-expressive-design-the-audi-rs-6-avant-performance-12346",
      },
      {
        label:
          "Audi German technical data, 13 June 2024 (gearing and drag proxy)",
        url: "https://uploads.audi-mediacenter.com/system/production/car_motorizations/1370/file_en/166de9727de38a5c299b6abc81e611a4b7b28256/eTD-Audi-RS6-Avant-performance-TFSI-463kW_240613.pdf",
      },
    ],
    assumptions:
      "2023 launch: 463 kW, 850 Nm, 2090 kg unladen; simulation adds 75 kg. Gearing and Cd×A use Audi's 2024 German sheet as a proxy, not verified 2023 configuration. Rolling radius 0.355 m and 6500 rpm limit are assumed. Turbo response is simplified. " +
      illustrative,
  },
  {
    id: "mustang-gt",
    name: "Ford Mustang GT 5.0 · 2018",
    engine: "5.0 V8 · 10-speed automatic · US rating",
    displacementLitres: 5,
    crank: "cross-plane",
    aspiration: "natural",
    idleRpm: 750,
    redlineRpm: 7400,
    peakPowerKw: 342.9997,
    peakTorqueNm: 569.4435,
    massKg: 1800,
    dragAreaM2: 0.78,
    tyreRadiusM: 0.335,
    finalDrive: 3.55,
    gears: [4.696, 2.985, 2.146, 1.769, 1.52, 1.275, 1, 0.854, 0.689, 0.636],
    shiftSeconds: 0.2,
    tractionMu: 0.83,
    drivetrainEfficiency: 0.89,
    torqueCurve: [
      [750, 200],
      [1800, 370],
      [3000, 475],
      [4600, 569.4435],
      [6000, 535],
      [7000, torqueAtPower(342.9997, 7000)],
      [7400, 425],
    ],
    sound: { resonance: 0.94, roughness: 1.22 },
    sources: [
      {
        label: "Ford: 2018 Mustang launch, 460 hp and 420 lb-ft",
        url: "https://media.ford.com/content/fordmedia/fna/mx/es/news/2017/12/03/nuevo-mustang-2018.html",
      },
      {
        label: "Ford 2018 Mustang specification infographic (SAE US figures)",
        url: "https://media.ford.com/content/dam/fordmedia/fmea/middle-east/2017/11/Road%20to%20Dubai%20Motor%20Show%202017/Infographics/FordDIMS2017_Mustang_Infographic_UAE.pdf",
      },
    ],
    assumptions:
      "Published US ratings: 460 mechanical hp and 420 lb-ft; 5.0 L is the marketed displacement. 1800 kg running mass, gearing, 3.55 axle, 0.78 m² drag area, 0.335 m radius and 7400 rpm limit are unverified inputs. Curve peak RPM positions are approximate. " +
      illustrative,
  },
  {
    id: "amg-c63s",
    name: "Mercedes-AMG C 63 S · 2015",
    engine: "4.0 V8 biturbo · 7-speed MCT · saloon",
    displacementLitres: 3.982,
    crank: "cross-plane",
    aspiration: "turbo",
    idleRpm: 750,
    redlineRpm: 6500,
    peakPowerKw: 375,
    peakTorqueNm: 700,
    massKg: 1730,
    dragAreaM2: 0.72,
    tyreRadiusM: 0.326,
    finalDrive: 2.85,
    gears: [4.377, 2.859, 1.921, 1.368, 1, 0.82, 0.728],
    shiftSeconds: 0.2,
    tractionMu: 0.86,
    drivetrainEfficiency: 0.89,
    torqueCurve: [
      [750, 220],
      [1200, 430],
      [1750, 700],
      [4500, 700],
      [5500, torqueAtPower(375, 5500)],
      [6250, 565],
      [6500, 530],
    ],
    sound: { resonance: 0.78, roughness: 1.12 },
    sources: [
      {
        label:
          "Mercedes-Benz: C 63 / C 63 S launch specifications, September 2014",
        url: "https://media.mercedes-benz.pl/mercedes-amg-c-63-klasa-c-w-mocarnej-odsonie/",
      },
    ],
    assumptions:
      "2015 saloon launch: 375 kW, 700 Nm and 1730 kg including 75 kg driver/luggage. Gearing, axle, 0.72 m² drag area, 0.326 m rolling radius, idle and 6500 rpm limit are unverified inputs. Turbo response and the published power plateau are approximated. " +
      illustrative,
  },
  {
    id: "corvette-c7",
    name: "Chevrolet Corvette Stingray · 2014",
    engine: "6.2 LT1 V8 · 7-speed manual · standard exhaust",
    displacementLitres: 6.2,
    crank: "cross-plane",
    aspiration: "natural",
    idleRpm: 650,
    redlineRpm: 6600,
    peakPowerKw: 339.2712,
    peakTorqueNm: 623.6762,
    massKg: 1571,
    dragAreaM2: 0.59,
    tyreRadiusM: 0.333,
    finalDrive: 3.42,
    gears: [2.66, 1.78, 1.3, 1, 0.74, 0.5, 0.42],
    shiftSeconds: 0.32,
    tractionMu: 0.88,
    drivetrainEfficiency: 0.9,
    torqueCurve: [
      [650, 250],
      [1500, 450],
      [3000, 580],
      [4600, 623.6762],
      [5500, 580],
      [6000, torqueAtPower(339.2712, 6000)],
      [6600, 470],
    ],
    sound: { resonance: 0.7, roughness: 1.38 },
    sources: [
      {
        label:
          "Chevrolet 2014 Corvette brochure, performance specifications (archived copy)",
        url: "https://cdn.dealereprocess.org/cdn/brochures/chevrolet/2014-corvettestingray.pdf",
      },
      {
        label: "Chevrolet 2014 Stingray details book (archived copy)",
        url: "https://www.corvetteactioncenter.com/specs/c7-corvette/2014-c7-corvette/2014_Corvette_Stingray_Details_Book.pdf",
      },
    ],
    assumptions:
      "Standard-exhaust coupe: published 455 hp, 460 lb-ft and 6600 rpm redline. 3298 lb curb mass is rounded to 1496 kg, plus 75 kg driver. Gearing, axle, 0.59 m² drag area and 0.333 m rolling radius are unverified model inputs. 6.2 L is marketed displacement. " +
      illustrative,
  },
  {
    id: "ferrari-458",
    name: "Ferrari 458 Italia · 2010",
    engine: "4.5 V8 · flat-plane · 7-speed DCT",
    displacementLitres: 4.499,
    crank: "flat-plane",
    aspiration: "natural",
    idleRpm: 1000,
    redlineRpm: 9000,
    peakPowerKw: 419,
    peakTorqueNm: 540,
    massKg: 1560,
    dragAreaM2: 0.64,
    tyreRadiusM: 0.348,
    finalDrive: 5.143,
    gears: [3.077, 2.185, 1.626, 1.286, 1.028, 0.839, 0.693],
    shiftSeconds: 0.12,
    tractionMu: 0.95,
    drivetrainEfficiency: 0.9,
    torqueCurve: [
      [1000, 190],
      [2000, 330],
      [3250, 435],
      [4500, 510],
      [6000, 540],
      [7500, 510],
      [8500, 470],
      [9000, torqueAtPower(419, 9000)],
    ],
    sound: { resonance: 1.4, roughness: 0.6 },
    sources: [
      {
        label: "Ferrari 2010 press book, 458 Italia pp. 34-41 (archived text)",
        url: "https://pdfcoffee.com/ferrari-2010pdf-pdf-free.html",
      },
      {
        label: "Ferrari history: 2009 458 Italia",
        url: "https://www.ferrari.com/en-PA/history/garage/2009/458-italia",
      },
    ],
    assumptions:
      "Published 419 kW, 540 Nm and 9000 rpm limit. 1485 kg kerb mass plus 75 kg driver; not the advertised 1380 kg dry mass. Gearing, axle, 0.64 m² drag area, 0.348 m rolling radius and idle are unverified inputs. Flat-plane sound uses generic alternating banks. " +
      illustrative,
  },
];
