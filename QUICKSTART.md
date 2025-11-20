# Quick Start Guide

## ⚠️ Important: You MUST Use a Web Server

**DO NOT** open `index.html` directly in your browser. You'll get a CORS error.

## 🚀 Easiest Way to Run

### Windows Users

1. **Double-click** `start-server.bat`
2. Wait for server to start (may take a moment on first run)
3. Open your browser to: **http://localhost:8000**

That's it! The simulation should load.

### If Node.js Isn't Installed

#### Option A: Install Node.js (Recommended)
1. Download LTS version from: https://nodejs.org/
2. Install (Node.js includes npm)
3. Run `start-server.bat` again

#### Option B: Manual Start
1. Open terminal in project folder
2. Run: `npx http-server -p 8000`
3. Open: http://localhost:8000

#### Option C: Use Vite (Optional)
1. Install Node.js (see Option A)
2. Run: `npm run dev` (or `npx vite`)
3. Opens automatically at http://localhost:5173

#### Option D: Use VS Code
1. Install VS Code: https://code.visualstudio.com/
2. Install "Live Server" extension
3. Right-click `index.html` → "Open with Live Server"

## 🎮 Using the Simulation

Once loaded:
- **Speed Slider**: Control simulation speed (1-10x)
- **Max Agents**: Set population limit (10-100)
- **Show Rays**: Toggle sensor ray visualization
- **Follow Best**: Camera follows best agent
- **Food Rate**: Adjust food spawn rate
- **Mutation Rate**: Control evolution speed
- **Clear Gene Pool**: Reset all saved data

## 🐛 Common Issues

**"CORS policy" error?**
→ You're opening the file directly. Use a web server!

**"Node.js not found"?**
→ Install Node.js from https://nodejs.org/ (LTS version)

**Blank screen?**
→ Check browser console (F12) for errors
→ Make sure you're using a modern browser (Chrome, Firefox, Edge)

**Slow performance?**
→ Reduce Max Agents slider
→ Turn off "Show Rays"
→ Lower game speed

## 📝 Need Help?

Check the full README.md for detailed documentation.

