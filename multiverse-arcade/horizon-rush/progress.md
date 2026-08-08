Original prompt: Build a polished 3D open-world arcade racing game called "Horizon Rush" (Forza Horizon-inspired) per horizon-racer-spec.md.

## Architecture
- index.html: HUD, start/pause/finish overlays, SVG logo, importmap (three@0.183.0)
- src/styles.css: design tokens (Chakra Petch display, Rajdhani body), HUD panels, overlays
- src/env.js: procedural env map, sky shader dome, stars, day-night keyframes, sun direction
- src/world.js: road Catmull-Rom loop, 3 biomes, InstancedMesh trees/buildings/barriers/arches/lights, ferris wheel, ramps, colliders
- src/car.js: buildCar() primitive sports car (player + traffic + rivals)
- src/audio.js: WebAudio synth engine/screech/nitro/beep, mute
- src/effects.js: ParticlePool (smoke/flames), SkidMarks, Rain
- src/main.js: renderer, scene, physics, camera, input, traffic AI, rivals+race, HUD, minimap, atmosphere, test hooks

## Test hooks
- window.render_game_to_text(), window.advanceTime(ms), window.__game

## TODO / verify in QA
- Driving accel/steer/drift/nitro
- Race start (R), countdown, checkpoints, positions, finish screen
- Day-night (T), rain cycle, wet roads
- On-foot (E), steal car
- FPS 60+, no console errors
- Screenshots day/night/rain

## QA RESULTS (verified via Playwright)
- Start screen, logo, controls: PASS
- Driving: top speed 281 km/h (spec ~280): PASS
- Nitrous (Shift): boosts to 360 km/h, drains meter, FOV kick: PASS
- Drifting (Space+steer): drifting=true, drift score accumulates, banks to total (4108 test), fills nitro: PASS
- Race (R): countdown 3-2-1-GO, 7 checkpoints x2 laps, positions 1-6, finish screen "1st PLACE": PASS
- Day-night (T skip + auto cycle): night neon windows/streetlights/headlights glow: PASS
- Weather: rain particles, wet glossy darker roads, fog: PASS
- On-foot (E): exit to capsule character, walk, re-enter/steal car: PASS
- Traffic: 16 cars, 3 parked/stealable, rest loop spline: PASS
- Camera cycle (C): chase/hood/cinematic: PASS
- Pause (P/Esc) + resume, mute (M): PASS
- Console errors: 0
- Draw calls: 36-348 (mostly <200); Triangles 13k-29k => 60+ FPS on real GPU
  (headless swiftshader throttles rAF, so on-screen FPS counter unreliable in CI; draw-call/tri budget confirms perf)

## Fixes applied during QA
- Countdown starts at 3 (was showing 4)
- Cleaned redundant traffic/rival spline advance math
- Removed dead endRace() function
- Added test hooks: cpPositions, teleport, setWeather, setTime, togglePause
- advanceTime no longer renders per-step (was causing test timeouts)

## Update: Destruction + Density (2026-07-20)
Modules changed: world.js (rewrite), destructibles.js (new), audio.js, main.js.

### Features
- Destructible trees: hit ABOVE 100 km/h -> instance zeroed, pooled falling mesh topples in impact dir with bounce, rests ~8.5s then sinks/fades. Below 100 km/h solid. +250 score, "TREE SMASH!", crunch sound, minor speed loss (x0.92). Palms + pines both destructible (507 total).
- Flying barriers: hit >=100 km/h -> pooled mesh launches with impact velocity + upward + spin + gravity, bounces, rests ~7.5s, fades. Below solid. +150 score, "BARRIER SMASH!", impact sound, speed x0.9. 140 barriers.
- Pooled reusable meshes (6 trees + 6 barriers).
- Denser world: palms 90->220, pines 140->340, skyscraper grid -5..5, neon signs (day/night emissive), street furniture, beach umbrellas (per-instance color), festival stalls, snow peaks. Filler: 400 rocks (big=collider), 500 bushes, 700 grass. All InstancedMesh.
- Connectors: 3 open Catmull-Rom shortcut roads (coast-city, city-mountain, mountain-coast) rendered as ribbons + dashed center lines; drivable; shown on minimap (amber dashed). ~1/4 traffic cars ping-pong along connectors.

### Perf optimizations
- Ferris wheel spokes/cabs converted to InstancedMesh (~24 -> 2 draw calls).
- Traffic distance culling: hide cars >230 units (each car ~15 meshes). Parked/stealable + stolen cars exempt.
- Worst-case diagonal draw calls: 426 -> 116 after both optimizations. Normal gameplay 40-270. Triangles ~40k-70k. Well under 300 desktop budget.

### QA (Playwright, headless)
- Tree >100 km/h -> topples, count increments, +250. PASS
- Tree low speed (~47 km/h) -> solid, no smash. PASS
- Barrier >=100 km/h -> flies (tumble physics visible in screenshot), +150. PASS
- Connector roads drivable end-to-end, no obstruction. PASS
- Minimap shows connectors. PASS
- Regression: race (countdown/GO/lap HUD), on-foot toggle, weather rain ramp, day-night neon glow, drift/nitro, audio. PASS
- Console errors: 0 across all tests.
- Note: headless swiftshader throttles rAF so on-screen FPS unreliable; perf validated via draw-call/triangle budget per game-testing.md.
