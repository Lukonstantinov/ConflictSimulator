# CLAUDE.md

## Project: ConflictSimulator — Fantasy War Simulator

### Version: 1.1.0

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
- **1.1.0** — Phase 1 Foundation: Vite + React + TS scaffold, Voronoi map generation (d3-delaunay + Lloyd relaxation + Perlin noise terrain), PixiJS renderer, country assignment UI, config panel, Zustand stores, IndexedDB persistence, implementation plan
- **1.0.0** — Initial project setup, CLAUDE.md created
