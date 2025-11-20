# Blob Evolution Simulation v5.0 (WebGL)

An artificial life simulation using neuroevolution with GPU-accelerated WebGL rendering.

## Overview

This is a complete rewrite of the original blob evolution simulation, preserving all simulation logic while upgrading to:
- **WebGL rendering** using Three.js for improved performance
- **Modular architecture** with separated concerns
- **Gene ID tracking** for visual lineage identification
- **IndexedDB storage** for persistent gene pool data
- **Dark mode UI** with modern styling

## Project Structure

```
f:\agents\
├── index.html              # Main HTML entry point
├── css/
│   └── style.css          # Dark mode styling
├── js/
│   ├── constants.js       # All simulation constants
│   ├── utils.js           # Math utilities and gene ID functions
│   ├── neural-network.js  # RNN implementation
│   ├── quadtree.js        # Spatial indexing
│   ├── camera.js          # Camera/viewport management
│   ├── food.js            # Food entity class
│   ├── pheromone.js       # Pheromone entity with action-based colors
│   ├── agent.js           # Agent class with specialization system
│   ├── database.js        # IndexedDB wrapper
│   ├── database-worker.js # Web Worker for database operations
│   ├── gpu-compute.js     # WebGPU neural network acceleration
│   ├── gpu-physics.js     # WebGPU ray tracing acceleration
│   ├── logger.js          # Logging utility with log levels
│   ├── renderer.js        # WebGL renderer using Three.js
│   └── game.js            # Main simulation class
└── README.md              # This file
```

## Running Locally

**IMPORTANT**: This application uses ES6 modules and **MUST** be served through a local web server. Opening `index.html` directly in a browser will cause CORS errors.

### Quick Start (Easiest)

**Windows**: Double-click `start-server.bat` (or `start-server.ps1` in PowerShell)

This will automatically start a web server using `npx http-server` on port 8000.

Then open: **http://localhost:8000** in your browser

### Manual Options

#### Option 1: npx http-server (Recommended)

Open a terminal in the project folder and run:

```bash
npx http-server -p 8000
```

Then open: `http://localhost:8000`

**Note**: Requires Node.js (download from https://nodejs.org/)

#### Option 2: VS Code Live Server

1. Install the "Live Server" extension in VS Code
2. Right-click on `index.html`
3. Select "Open with Live Server"

#### Option 3: Vite (Development Server)

If you prefer Vite for hot module replacement:

```bash
npx vite
```

Then open the URL shown in the terminal (usually `http://localhost:5173`)

See `vite.config.js` for configuration.

### Troubleshooting

**CORS Error?** You're trying to open the file directly. Use a web server instead!

**Node.js not found?** Install Node.js from https://nodejs.org/ (LTS version recommended)

## Key Features

### WebGL & WebGPU
- **Rendering**: GPU-accelerated rendering using Three.js
- **Compute**: WebGPU-accelerated Neural Network processing
- **Physics**: WebGPU-accelerated Ray Tracing for vision
- Instanced meshes for efficient agent rendering
- Optimized for hundreds of agents

### Agent Specialization System
- Five specialization types: FORAGER, PREDATOR, REPRODUCER, SCOUT, DEFENDER
- Each specialization has unique sensor configurations (30-60 rays)
- Variable hidden layer sizes (15-25 neurons) based on specialization
- Dynamic neural network architecture adapts to specialization

### Gene ID System
- Each agent has a unique gene ID
- Children inherit gene ID from mother
- Agents colored by gene ID (consistent across generations)
- Red border appears when energy < 100

### IndexedDB Storage
- Stores top 3 agents per gene ID (not just top 10 overall)
- Persistent across browser sessions
- Automatic migration from localStorage

### Pheromone System
- **Danger** (blue/cyan): Emitted when agent is fearful
- **Attack** (red/orange): Emitted when agent is aggressive
- **Reproduction** (green): Emitted when agent wants to reproduce

### Dark Mode UI
- Modern dark theme with gradients
- Improved control styling
- Color-coded information displays

## Simulation Logic

**All simulation logic is preserved exactly from the original:**
- **Neural Network**: Dynamic architecture based on agent specialization.
  - Input Size: (numSensorRays × 5) + (numAlignmentRays × 1) + 16 state inputs + hiddenSize
  - Sensor Rays: 30-60 depending on specialization (SCOUT has most)
  - Hidden Neurons: 15-25 depending on specialization (PREDATOR has most)
  - Outputs: 5 (Thrust, Rotation, Sprint, Reproduce, Attack)
- **Energy Costs**: Passive, size, movement, sprinting, rotation, obesity tax
- **Movement Physics**: Dampening factor 0.95, max velocity 10
- **Reproduction**: Mating requirements, pregnancy duration, cooldowns
- **Fitness Calculation**:
  - Base: `(Offspring × 600) + (Food × 200) + (Kills × 15)`
  - Efficiency: `(Distance/Energy × 15) + (Escapes × 75)`
  - Multiplier: `Base Score × (1 + Age/60)`
  - Bonus: `Age × 2`
- **Evolution**: One-point crossover, Gaussian mutation (micro/macro)

## Browser Requirements

- Modern browser with WebGL support
- ES6 module support
- IndexedDB support

Tested on: Chrome, Firefox, Edge (latest versions)

## Documentation

See individual README files in each directory for detailed documentation:
- `js/README.md` - JavaScript modules documentation
- `css/README.md` - Styling documentation
