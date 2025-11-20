# index.html Documentation

## Overview

The main HTML entry point for the Blob Evolution simulation. This file sets up the DOM structure and initializes the simulation.

## Structure

### Head Section
- **Meta Tags**: UTF-8 charset, viewport for responsive design
- **Title**: "Blob Evolution v5.0 (WebGL)"
- **Stylesheet**: Links to `css/style.css` for dark mode styling

### Body Structure

#### Info Bar (`#info-bar`)
Displays real-time simulation statistics:
- **Population**: Current agent count vs max agents
- **Best Agent**: Fitness, age, offspring, kills, food eaten
- **Generation**: Current generation number
- **Avg. Energy**: Average energy and food scarcity factor

#### Controls (`#controls`)
Interactive controls for the simulation:
- **Speed Slider**: 1-10x simulation speed
- **Max Agents Slider**: 10-100 maximum population
- **Show Rays Checkbox**: Toggle ray visualization
- **Follow Best Checkbox**: Toggle camera following best agent
- **Food Rate Slider**: 0.1-2.0x food spawn multiplier
- **Mutation Rate Slider**: 0.01-0.5 mutation rate
- **Clear Gene Pool Button**: Clear all stored gene pools

#### Canvas Container (`#canvas-container`)
Empty div where the WebGL renderer will attach its canvas element.

### Script Section

Uses ES6 modules to import and initialize the simulation:

```javascript
import { Simulation } from './js/game.js';

const container = document.getElementById('canvas-container');
const sim = new Simulation(container);

sim.init().then(() => {
    sim.gameLoop();
});
```

**Initialization Flow**:
1. Import `Simulation` class from `js/game.js`
2. Get canvas container element
3. Create new `Simulation` instance
4. Call `init()` (async) to set up database and load gene pools
5. Start game loop after initialization completes

## Key Features

### ES6 Modules
- Uses `type="module"` for modern JavaScript
- Enables clean imports/exports
- Requires local web server (CORS restrictions)

### Minimal HTML
- No inline styles or scripts
- Clean separation of concerns
- All logic in JavaScript modules
- All styling in CSS file

### Accessibility
- Semantic HTML structure
- Labeled form controls
- Clear information hierarchy

## Browser Requirements

- ES6 module support
- WebGL support
- IndexedDB support
- Modern JavaScript features

## Running

Must be served through a local web server:
- Python: `python -m http.server 8000`
- Node.js: `npx http-server -p 8000`
- VS Code: Live Server extension

Then open: `http://localhost:8000`

## Dependencies

- **Three.js**: Loaded from CDN in `renderer.js`
- **CSS**: `css/style.css` for styling
- **JavaScript Modules**: All in `js/` directory



