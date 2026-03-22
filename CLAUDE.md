# CLAUDE.md

## Project: ConflictSimulator — Fantasy War Simulator

### Version: 1.6.0

A browser-based (PWA, iOS-optimized) fantasy war simulator with Voronoi-based world maps, configurable countries, and real-time war simulation.

### Versioning Rule
**After every update, increment the patch version (e.g., 1.0.0 → 1.0.1). Write the new version number in this file with a brief changelog entry below.**

### Tech Stack
- React + TypeScript, Vite, Tailwind CSS
- PixiJS (canvas rendering), d3-delaunay (Voronoi)
- Zustand (state management), IndexedDB via idb (persistence)
- Web Worker (simulation engine), vite-plugin-pwa

### Project Structure
```
src/
├── components/    # React UI components
├── engine/        # Web Worker simulation engine
├── map/           # Voronoi generation + PixiJS rendering
├── store/         # Zustand state stores
├── types/         # TypeScript interfaces
├── utils/         # Helpers (RNG, colors, persistence)
├── App.tsx
└── main.tsx
```

### Commands
```bash
npm run dev        # Start dev server
npm run build      # Production build
npm run preview    # Preview production build
npx tsc --noEmit   # Type check
```

### Changelog
- **1.6.0** — Phase 6 Advanced Features: procedural fantasy country name generator, diplomacy AI (alliance formation/betrayal based on threat assessment), replay history recording, post-war statistics dashboard (battle records, territory charts), map export/import (JSON)
- **1.5.0** — Phase 5 PWA & Mobile: vite-plugin-pwa integration, web app manifest, service worker with offline caching, iOS safe area insets, touch-optimized viewport, Add to Home Screen support
- **1.4.0** — Phase 4 God Mode: pause-and-modify intervention (adjust army/economy/strategy mid-sim), force wars/alliances/peace between countries, spawn reinforcements, live country stats overlay, what-if branching (save/load simulation snapshots)
- **1.3.0** — Phase 3 Visual Polish: animated army sprites with interpolated movement, battle burst effects (flash + particles), terrain texture patterns (mountains/forest/desert/coast), country border highlighting, minimap with viewport indicator, camera pan/zoom (mouse wheel + shift-drag + touch pinch)
- **1.2.0** — Phase 2 Simulation Core: war engine with economy system, combat resolution (terrain modifiers + defender bonus), 5-strategy AI (aggressive/defensive/expansionist/opportunist/turtle), tick-based simulation loop, play/pause/speed controls, war event log, real-time border changes
- **1.1.2** — Fix mobile/iPhone layout: responsive map sizing, scrollable UI, stacking layout on small screens
- **1.1.1** — Add GitHub Actions workflow for GitHub Pages deployment, set Vite base path
- **1.1.0** — Phase 1 Foundation: Vite + React + TS scaffold, Voronoi map generation (d3-delaunay + Lloyd relaxation + Perlin noise terrain), PixiJS renderer, country assignment UI, config panel, Zustand stores, IndexedDB persistence, implementation plan
- **1.0.0** — Initial project setup, CLAUDE.md created
