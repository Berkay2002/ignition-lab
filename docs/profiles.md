# Vehicle profiles and evidence

These profiles combine published specifications with an approximate vehicle model. They are not measured replicas. The sound is synthesized from firing pulses and tuned filters; no recording, measured exhaust transfer function, ECU calibration or manufacturer sound model is included. A manufacturer's name identifies the specification reference, not a claim that the audio reproduces that particular car.

The engine assembly remains the lab's generic V8. Choosing a profile does not turn its geometry into an Audi, Ford, AMG, Chevrolet or Ferrari engine. Flat-plane audio uses a generic alternating-bank pulse pattern, not a verified Ferrari cylinder-number sequence.

## What the numbers mean

- Engine torque and power are at the crankshaft. Power follows `P = torque × RPM × 2π / 60000` in kW. Mechanical horsepower converts at 0.745699872 kW/hp; pound-feet convert at 1.355817948 N·m/lb-ft. Metric PS/CV must not use the mechanical horsepower conversion.
- The torque tables in `src/profiles.ts` are hand-built interpolation knots anchored to published peaks. Intermediate torque, low-speed torque and post-peak roll-off are assumptions. They are not copied dyno curves. In particular, the Mustang peak RPM positions are approximate.
- Running mass includes a nominal 75 kg driver allowance except where the cited definition already includes one. Occupants, options and fuel can change real mass.
- `dragAreaM2` means Cd times frontal area. Tyre radius is an effective rolling radius, not an unloaded sidewall calculation. Both affect computed acceleration and RPM.
- Grip, drivetrain efficiency, shift duration and sound parameters are assumed in every profile. They are not measurements of traction control, transmission efficiency or acoustic resonance. A single grip limit cannot reproduce axle load transfer, tyre slip or an all-wheel-drive control system.
- Idle and simulation RPM limits are marked below. A simulation limit is not necessarily a manufacturer's fuel-cut threshold.
- Displayed acceleration times come from these inputs and the implemented vehicle equations. They have not been calibrated against independent tests and must not be presented as verified performance of the named cars.

Sources were reviewed on 6 September 2026. Historic documents are sometimes manufacturer-authored copies on archive hosts; those are identified below. All source URLs are also exposed by the profile data.

## Audi R8 4.2 FSI, 2007, six-speed manual

The [Audi R8 owner's manual, printed pages 196-198](https://sb952effb4c14a0dc.jimcontent.com/download/version/1703856959/module/9694138682/name/Audi%20R8%20Owners%20Manual%202007.pdf), is an Audi-authored document hosted as an archived copy. It supplies 4163 cm³, 309 kW at 7800 rpm, 430 N·m from 4500 to 6000 rpm and 1560 kg for the manual car. The general notes define the mass as including a 75 kg driver allowance, so this profile does not add another driver. [Audi's retrospective](https://www.audi.com/en/press-releases/the-audi-r8-a-captivating-legend-16374) corroborates the original 420 PS engine; later 430 PS versions are not this profile.

Unverified inputs: six ratios `[4.373, 2.709, 1.878, 1.413, 1.126, 0.928]`, final drive 4.235, drag area 0.69 m², rolling radius 0.33 m, idle 850 rpm and limit 8250 rpm. These are model choices, not established by the linked manual.

## Audi RS 6 Avant performance, 2023 launch

[Audi's June 2023 launch material](https://www.audi.com/en/the-audi-rs-6-avant-and-the-new-audi-rs-6-avant-performance-12345/dynamic-power-meets-expressive-design-the-audi-rs-6-avant-performance-12346) gives 463 kW, 850 N·m and 2090 kg unladen. The modeled mass is 2165 kg after a nominal driver allowance.

The [German technical sheet dated 13 June 2024](https://uploads.audi-mediacenter.com/system/production/car_motorizations/1370/file_en/166de9727de38a5c299b6abc81e611a4b7b28256/eTD-Audi-RS6-Avant-performance-TFSI-463kW_240613.pdf) supplies 3996 cm³, peak power at 6000 rpm, torque at 2300-4500 rpm, eight ratios `[4.714, 3.143, 2.106, 1.667, 1.285, 1, 0.839, 0.667]`, final drive 3.204, Cd 0.35 and frontal area 2.41 m². Their product is 0.8435 m². These are explicitly later-year proxies, not proof of the exact 2023 configuration. Its weight differs from the launch material and is not silently substituted.

Unverified inputs include 0.355 m rolling radius, 750 rpm idle and 6500 rpm limit. Boost response, torque-converter behavior and launch control are simplified.

## Ford Mustang GT 5.0, 2018, US-rating reference

[Ford's December 2017 launch announcement](https://media.ford.com/content/fordmedia/fna/mx/es/news/2017/12/03/nuevo-mustang-2018.html) specifies 460 hp and 420 lb-ft for the 2018 5.0 V8, with a ten-speed automatic available. The [manufacturer's model infographic](https://media.ford.com/content/dam/fordmedia/fmea/middle-east/2017/11/Road%20to%20Dubai%20Motor%20Show%202017/Infographics/FordDIMS2017_Mustang_Infographic_UAE.pdf) identifies its figures as SAE US ratings on 93-octane fuel. The profile converts to approximately 343 kW and 569.44 N·m. The displacement field uses the marketed 5.0 L value, not a claim of exact swept volume. European 450 PS specifications are not mixed into this profile.

Unverified inputs: 1800 kg total running mass, ratios `[4.696, 2.985, 2.146, 1.769, 1.52, 1.275, 1, 0.854, 0.689, 0.636]`, axle 3.55, drag area 0.78 m², rolling radius 0.335 m, idle 750 rpm and limit 7400 rpm. The curve places torque/power anchors at approximately 4600/7000 rpm; the linked launch text establishes the peak values but not those RPM positions.

## Mercedes-AMG C 63 S saloon, 2015 launch

[Mercedes-Benz's September 2014 launch release](https://media.mercedes-benz.pl/mercedes-amg-c-63-klasa-c-w-mocarnej-odsonie/) identifies February 2015 market introduction of the S saloon. It supplies 3982 cm³, 375 kW at 5500-6250 rpm, 700 N·m at 1750-4500 rpm, a seven-speed MCT transmission and 1730 kg including 68 kg driver plus 7 kg luggage. This is the V8 W205 saloon, not the previous-generation 6.2 L coupe or the later four-cylinder hybrid.

Unverified inputs: ratios `[4.377, 2.859, 1.921, 1.368, 1, 0.82, 0.728]`, axle 2.85, drag area 0.72 m², rolling radius 0.326 m, idle 750 rpm and limit 6500 rpm. The hand-built curve reaches the published power at 5500 rpm and approximates the high-speed plateau. Boost and wet-clutch behavior are simplified.

## Chevrolet Corvette Stingray coupe, 2014, standard exhaust

The [Chevrolet brochure, performance specification table](https://cdn.dealereprocess.org/cdn/brochures/chevrolet/2014-corvettestingray.pdf), is a manufacturer-authored archived copy. It supplies the standard-exhaust 455 hp at 6000 rpm, 460 lb-ft at 4600 rpm, 6600 rpm redline and 3298 lb coupe curb weight. The profile converts the engine ratings and uses 1496 kg rounded curb weight plus 75 kg driver, totaling 1571 kg. Its 6.2 L displacement is the marketed value. The optional exhaust's higher figures are not used. The [Chevrolet details book](https://www.corvetteactioncenter.com/specs/c7-corvette/2014-c7-corvette/2014_Corvette_Stingray_Details_Book.pdf), also archived, confirms the engine and seven-speed manual configuration.

Unverified inputs: ratios `[2.66, 1.78, 1.3, 1, 0.74, 0.5, 0.42]`, axle 3.42, drag area 0.59 m², rolling radius 0.333 m and 650 rpm idle. These were not verified against a manufacturer ratio sheet.

## Ferrari 458 Italia, 2010 specification reference

The [Ferrari 2010 press book, printed pages 34-41, archived text](https://pdfcoffee.com/ferrari-2010pdf-pdf-free.html) supplies 4499 cm³, 419 kW at 9000 rpm, 540 N·m at 6000 rpm, seven-speed dual-clutch transmission and a 9000 rpm maximum. Its Italian metric table is used because the archived English table contains inconsistent extracted units. The modeled mass is 1485 kg kerb plus 75 kg driver, totaling 1560 kg; the 1380 kg dry-weight claim is not used as running mass. The published light specification includes forged wheels and racing seats. [Ferrari's history page](https://www.ferrari.com/en-PA/history/garage/2009/458-italia) corroborates the 2009 introduction and high-speed V8 concept; its displacement differs slightly from the press book, which is the selected reference here.

Unverified inputs: ratios `[3.077, 2.185, 1.626, 1.286, 1.028, 0.839, 0.693]`, final drive 5.143, drag area 0.64 m², rolling radius 0.348 m and 1000 rpm idle. The flat-plane bank pattern is generic. The audio has not been compared with controlled 458 recordings, and the discrete simulated shift is not a measured DCT torque-transfer model.

## Acoustic tuning

Each profile supplies a dimensionless resonance multiplier and roughness multiplier. These are explicitly creative synthesis settings, not measured resonant frequencies or combustion variation. Cross-plane and flat-plane pulse spacing, engine speed and load create structural differences in the generated sound. Exhaust, cabin and fly-by options describe generic filters and spatial effects; they do not establish a factory exhaust, cabin impulse response or exact microphone position for a named model.

To claim a closer acoustic reproduction would require licensed recordings at known RPM/load, verified cylinder-to-bank firing order, exhaust geometry or measured transfer functions, microphone geometry, and comparison against those recordings. No such validation is claimed here.
