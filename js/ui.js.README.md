# UI Documentation (`ui.js`)

## Overview
The `ui.js` module manages the user interface, including the dashboard, info bar, controls, and the fullscreen AI summarization feature.

## Why It Exists
- **Feedback**: Users need to see what's happening (stats, charts, logs).
- **Control**: Users need to adjust simulation parameters (speed, mutation rate) in real-time.
- **Immersion**: The fullscreen mode and AI summaries add a "premium" feel to the experience.

## Key Features

### Dashboard Updates (`updateInfo`, `copySimulationStats`)
- Updates the sidebar with real-time metrics: population, fitness, age, etc.
- **Memory Monitor**: Displays current memory usage and trends.

### Fullscreen Mode
- **Wake Lock**: Prevents the screen from sleeping during long runs.
- **AI Summarizer**: When in fullscreen, it periodically generates a text summary of the simulation's progress using a local AI API (if available) and displays it with a "hacker-style" typing effect.
- **UI Hiding**: Automatically hides UI elements for a cinematic view, reappearing on mouse movement.

### Controls
- Handles all sliders and buttons (Speed, Max Agents, Show Rays, etc.).
- **Camera**: Implements pan and zoom functionality (mouse drag and wheel).

### `setupUIListeners(simulation)`
Attaches all event listeners to DOM elements. This is the entry point for UI interactivity.
