// UI-related functions moved from game.js

import { updateMemoryStats, handleMemoryPressure } from './memory.js';
import { updateFoodScalingFactor } from './spawn.js';

export function updateLoadingScreen(status, progress) {
    const statusEl = document.getElementById('loading-status');
    const progressEl = document.getElementById('loading-progress-bar');
    if (statusEl) statusEl.textContent = status;
    if (progressEl) progressEl.style.width = `${progress}%`;
}

export function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.style.opacity = '0';
        loadingScreen.style.transition = 'opacity 0.5s';
        setTimeout(() => {
            loadingScreen.style.display = 'none';
        }, 500);
    }
}

export function setupUIListeners(simulation) {
    // Set slider values to match code defaults
    const gameSpeedSlider = document.getElementById('gameSpeed');
    const maxAgentsSlider = document.getElementById('maxAgents');
    gameSpeedSlider.value = simulation.gameSpeed;
    maxAgentsSlider.value = simulation.maxAgents;

    gameSpeedSlider.addEventListener('input', e => {
        simulation.gameSpeed = parseInt(e.target.value, 10);
    });

    maxAgentsSlider.addEventListener('input', e => {
        simulation.maxAgents = parseInt(e.target.value, 10);
        updateFoodScalingFactor(simulation);
    });

    document.getElementById('showRays').addEventListener('change', e => {
        simulation.showRays = e.target.checked;
        simulation.renderer.setShowRays(e.target.checked);
    });

    const followBestCheckbox = document.getElementById('followBest');
    followBestCheckbox.checked = simulation.followBest;
    followBestCheckbox.addEventListener('change', e => {
        simulation.followBest = e.target.checked;
        if (simulation.followBest) {
            // Reset to center when re-enabling follow best
            simulation.camera.targetX = simulation.worldWidth / 2;
            simulation.camera.targetY = simulation.worldHeight / 2;
        }
    });

    const useGpuCheckbox = document.getElementById('useGpu');
    useGpuCheckbox.checked = simulation.useGpu;
    useGpuCheckbox.addEventListener('change', e => {
        simulation.useGpu = e.target.checked;
        simulation.logger.log('GPU usage:', simulation.useGpu ? 'enabled' : 'disabled');
    });

    // Camera controls (pan and zoom)
    setupCameraControls(simulation);

    // Set other slider values to match code defaults
    const foodRateSlider = document.getElementById('foodRate');
    const mutationRateSlider = document.getElementById('mutationRate');
    foodRateSlider.value = simulation.foodSpawnRate;
    mutationRateSlider.value = simulation.mutationRate;

    foodRateSlider.addEventListener('input', e => {
        simulation.foodSpawnRate = parseFloat(e.target.value);
        updateFoodScalingFactor(simulation);
    });

    mutationRateSlider.addEventListener('input', e => {
        simulation.mutationRate = parseFloat(e.target.value);
    });

    document.getElementById('clearStorage').addEventListener('click', async () => {
        await simulation.db.clearAll();
        alert('Gene pool cleared. Reloading.');
        location.reload();
    });

    // Copy Stats button
    const copyStatsBtn = document.getElementById('copyStats');
    if (copyStatsBtn) {
        copyStatsBtn.addEventListener('click', () => {
            copySimulationStats(simulation);
        });
    }

    // Wake Lock Toggle
    const wakeLockBtn = document.getElementById('wakeLock');
    if (wakeLockBtn) {
        wakeLockBtn.addEventListener('click', async () => {
            await simulation.toggleWakeLock();
            updateWakeLockButton();
        });

        // Check if already in fullscreen on page load
        if (document.fullscreenElement && !simulation.wakeLockEnabled) {
            console.log('[WAKE] 🖥️ Page loaded in fullscreen - auto-enabling wake lock');
            simulation.requestWakeLock().then(() => updateWakeLockButton());
        }
    }

    // Fullscreen Toggle
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', async () => {
            console.log('[FULLSCREEN] Toggle button clicked, current fullscreenElement:', document.fullscreenElement);
            if (!document.fullscreenElement) {
                try {
                    await document.documentElement.requestFullscreen();
                    console.log('[FULLSCREEN] Requested fullscreen');
                } catch (err) {
                    console.error('[FULLSCREEN] Failed to enter fullscreen:', err);
                }
            } else {
                try {
                    await document.exitFullscreen();
                    console.log('[FULLSCREEN] Exited fullscreen');
                } catch (err) {
                    console.error('[FULLSCREEN] Failed to exit fullscreen:', err);
                }
            }
        });
    }

    window.addEventListener('resize', () => resize(simulation));

    // Handle page visibility changes to maintain wake lock
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible' && simulation.wakeLockEnabled && !simulation.wakeLock) {
            // Page became visible again, re-acquire wake lock if it was enabled
            console.log('[WAKE] 🔄 Re-acquiring wake lock after page became visible');
            await simulation.requestWakeLock();
            updateWakeLockButton();
        }
    });

    // Auto-apply wake lock when entering fullscreen
    console.log('[FULLSCREEN] Setting up fullscreen event listener');

    document.addEventListener('fullscreenchange', async () => {
        console.log('[FULLSCREEN] fullscreenchange event fired, fullscreenElement:', document.fullscreenElement);

        // Check for fullscreen using multiple methods
        const isFullscreen = !!(
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement
        );

        console.log(`[FULLSCREEN] Detected fullscreen state: ${isFullscreen}`);

        if (isFullscreen) {
            console.log('[FULLSCREEN] 🖥️ Entering fullscreen mode');

            // Disable follow best agent
            const followBestCheckbox = document.getElementById('followBest');
            if (followBestCheckbox) {
                followBestCheckbox.checked = false;
                simulation.followBest = false;
                console.log('[FULLSCREEN] 👁️ Disabled "Follow Best" for fullscreen overview');
            }

            // Set camera to show entire map zoomed out (same as default zoom level)
            const worldWidth = simulation.worldWidth;
            const worldHeight = simulation.worldHeight;

            // Use the same zoom level as the default (0.5) for consistent zoomed-out view
            const optimalZoom = 0.5; // Same as default camera zoom

            // Center camera on world center
            simulation.camera.targetX = worldWidth / 2;
            simulation.camera.targetY = worldHeight / 2;
            simulation.camera.targetZoom = optimalZoom;

            console.log(`[FULLSCREEN] 📹 Camera set to default zoom level for overview: zoom=${simulation.camera.targetZoom.toFixed(2)}, center=(${simulation.camera.targetX}, ${simulation.camera.targetY})`);

            // Enable wake lock if not already active
            if (!simulation.wakeLockEnabled) {
                console.log('[WAKE] 🖥️ Entering fullscreen - auto-enabling wake lock');
                await simulation.requestWakeLock();
                updateWakeLockButton();
            }

            // Hide UI elements initially
            hideFullscreenUI();

        } else {
            console.log('[FULLSCREEN] 🖥️ Exiting fullscreen mode');

            // Show UI elements again
            showFullscreenUI();

            if (simulation.wakeLockEnabled && simulation.wakeLock) {
                // Optional: Could auto-release when exiting fullscreen
                // For now, we'll keep it enabled but log the exit
                console.log('[WAKE] 🖥️ Exiting fullscreen (wake lock remains active)');
            }
        }
    });

    function updateWakeLockButton() {
        const wakeLockBtn = document.getElementById('wakeLock');
        if (wakeLockBtn) {
            if (simulation.wakeLockEnabled) {
                wakeLockBtn.textContent = '🔋';
                wakeLockBtn.title = 'Screen Awake (Click to Disable)';
                wakeLockBtn.style.background = 'rgba(57, 255, 20, 0.1)';
                wakeLockBtn.style.borderColor = 'var(--neon-green)';
                wakeLockBtn.style.boxShadow = '0 0 8px rgba(57, 255, 20, 0.3)';
            } else {
                wakeLockBtn.textContent = '🔋';
                wakeLockBtn.title = 'Keep Screen Awake';
                wakeLockBtn.style.background = '';
                wakeLockBtn.style.borderColor = '';
                wakeLockBtn.style.boxShadow = '';
            }
        }
    }

    // Fullscreen UI management
    let uiHideTimeout;
    const UI_HIDE_DELAY = 30000; // 30 seconds
    let uiVisible = true;

    function hideFullscreenUI() {
        if (!document.fullscreenElement) return;

        const elements = [
            document.getElementById('info-bar'),
            document.getElementById('sidebar'),
            document.getElementById('sidebar-toggle'),
            document.getElementById('controls')
        ];

        elements.forEach(el => {
            if (el) el.classList.add('fullscreen-hidden');
        });

        uiVisible = false;
        console.log('[FULLSCREEN] 👁️ UI hidden for fullscreen immersion');
    }

    function showFullscreenUI() {
        if (!document.fullscreenElement) return;

        const elements = [
            document.getElementById('info-bar'),
            document.getElementById('sidebar'),
            document.getElementById('sidebar-toggle'),
            document.getElementById('controls')
        ];

        elements.forEach(el => {
            if (el) el.classList.remove('fullscreen-hidden');
        });

        uiVisible = true;
        console.log('[FULLSCREEN] 👁️ UI shown');

        // Set timeout to hide UI again after 30 seconds
        clearTimeout(uiHideTimeout);
        uiHideTimeout = setTimeout(() => {
            if (document.fullscreenElement) {
                hideFullscreenUI();
            }
        }, UI_HIDE_DELAY);
    }

    // Mouse movement detection for fullscreen UI
    let lastMouseMove = 0;
    document.addEventListener('mousemove', () => {
        if (!document.fullscreenElement) return;

        const now = Date.now();
        // Throttle mouse move events to avoid excessive calls
        if (now - lastMouseMove < 100) return;
        lastMouseMove = now;

        if (!uiVisible) {
            showFullscreenUI();
        } else {
            // Reset the hide timeout
            clearTimeout(uiHideTimeout);
            uiHideTimeout = setTimeout(() => {
                if (document.fullscreenElement) {
                    hideFullscreenUI();
                }
            }, UI_HIDE_DELAY);
        }
    });

    // Handle mouse leaving/entering the window
    document.addEventListener('mouseleave', () => {
        if (document.fullscreenElement && uiVisible) {
            // Start the hide timeout immediately when mouse leaves
            clearTimeout(uiHideTimeout);
            uiHideTimeout = setTimeout(() => {
                if (document.fullscreenElement) {
                    hideFullscreenUI();
                }
            }, 1000); // Shorter delay when mouse leaves window
        }
    });

    window.addEventListener('beforeunload', async () => {
        // Release wake lock and flush dead agent queue
        await simulation.releaseWakeLock();
        simulation.processDeadAgentQueue();
        await simulation.db.flush();
    });
}

export function setupCameraControls(simulation) {
    const container = simulation.renderer.container;
    const canvas = simulation.renderer.renderer.domElement;

    let isDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;

    canvas.addEventListener('mousedown', (e) => {
        if (simulation.followBest) return; // Disable when following best agent
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        canvas.style.cursor = 'grabbing';
        e.preventDefault();
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isDragging || simulation.followBest) return;

        const deltaX = e.clientX - lastMouseX;
        const deltaY = e.clientY - lastMouseY;

        const aspect = container.clientWidth / container.clientHeight;
        const viewSize = Math.max(simulation.worldWidth, simulation.worldHeight) * 0.4;

        simulation.camera.pan(deltaX, deltaY, container.clientWidth, container.clientHeight, viewSize, aspect);

        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        e.preventDefault();
    });

    canvas.addEventListener('mouseup', () => {
        isDragging = false;
        canvas.style.cursor = 'default';
    });

    canvas.addEventListener('mouseleave', () => {
        isDragging = false;
        canvas.style.cursor = 'default';
    });

    canvas.addEventListener('wheel', (e) => {
        if (simulation.followBest) return; // Disable when following best agent

        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const aspect = container.clientWidth / container.clientHeight;
        simulation.camera.zoomAt(mouseX, mouseY, e.deltaY, container.clientWidth, container.clientHeight,
            simulation.worldWidth, simulation.worldHeight, aspect);

        e.preventDefault();
    });
}

export function resize(simulation) {
    const infoBar = document.getElementById('info-bar');
    const controls = document.getElementById('controls');
    const infoBarHeight = infoBar ? infoBar.offsetHeight : 0;
    const controlsHeight = controls ? controls.offsetHeight : 0;
    const width = window.innerWidth;
    const height = window.innerHeight - infoBarHeight - controlsHeight;
    simulation.renderer.resize(width, height);
}

export function updateInfo(simulation) {
    // Count only living agents for display
    const livingAgents = simulation.agents.filter(a => !a.isDead);
    document.getElementById('info-pop').innerText = `Population: ${livingAgents.length}/${simulation.maxAgents} (Total: ${simulation.totalAgentsSpawned})`;
    if (simulation.bestAgent) {
        document.getElementById('info-best').innerText = `Best Agent: F:${simulation.bestAgent.fitness.toFixed(0)}, A:${simulation.bestAgent.age.toFixed(0)}s, O:${simulation.bestAgent.offspring}, K:${simulation.bestAgent.kills}, Fd:${simulation.bestAgent.foodEaten}`;
    }
    document.getElementById('info-gen').innerText = `Generation: ${simulation.generation}`;
    document.getElementById('info-genepools').innerText = `Gene Pools: ${Object.keys(simulation.db.pool).length}`;
    const avgEnergy = livingAgents.length > 0 ? livingAgents.reduce((acc, a) => acc + a.energy, 0) / livingAgents.length : 0;
    document.getElementById('info-avg-e').innerText = `Avg. Energy: ${avgEnergy.toFixed(0)} | Scarcity: ${simulation.foodScarcityFactor.toFixed(2)}`;

    // Update runtime
    const runtimeMs = Date.now() - (simulation.startTime || Date.now());
    const runtimeSeconds = Math.floor(runtimeMs / 1000);
    document.getElementById('info-runtime').innerText = `Runtime: ${runtimeSeconds}s`;

    // Update memory stats
    updateMemoryStats(simulation);

    // Check for memory pressure and take action if needed
    handleMemoryPressure(simulation);
}

export function copySimulationStats(simulation) {
    // Gather all current stats
    const livingAgents = simulation.agents.filter(a => !a.isDead);
    if (livingAgents.length === 0) {
        alert('No living agents to analyze');
        return;
    }

    // Calculate stats (same as updateDashboard)
    const bestFitness = simulation.bestAgent ? simulation.bestAgent.fitness : 0;
    const geneIdCount = new Set(livingAgents.map(a => a.geneId)).size;
    const genePoolHealth = simulation.db.getGenePoolHealth();
    const genePoolCount = genePoolHealth.genePoolCount;

    const avgFitness = livingAgents.reduce((sum, a) => sum + a.fitness, 0) / livingAgents.length;
    const avgAge = livingAgents.reduce((sum, a) => sum + a.age, 0) / livingAgents.length;
    const avgEnergy = livingAgents.reduce((sum, a) => sum + a.energy, 0) / livingAgents.length;
    const avgOffspring = livingAgents.reduce((sum, a) => sum + a.offspring, 0) / livingAgents.length;
    const avgFood = livingAgents.reduce((sum, a) => sum + a.foodEaten, 0) / livingAgents.length;
    const avgKills = livingAgents.reduce((sum, a) => sum + a.kills, 0) / livingAgents.length;
    const avgCollisions = livingAgents.reduce((sum, a) => sum + (a.collisions || 0), 0) / livingAgents.length;
    const avgWallHits = livingAgents.reduce((sum, a) => sum + (a.timesHitObstacle || 0), 0) / livingAgents.length;

    const MATURATION_SECONDS = 15;
    const matureAgents = livingAgents.filter(a => a.age >= MATURATION_SECONDS).length;
    const maturationRate = (matureAgents / livingAgents.length) * 100;
    const maxAge = Math.max(...livingAgents.map(a => a.age), 0);

    const totalSexualOffspring = livingAgents.reduce((sum, a) => sum + (a.childrenFromMate || 0), 0);
    const totalAsexualOffspring = livingAgents.reduce((sum, a) => sum + (a.childrenFromSplit || 0), 0);

    const reproductionRate = simulation.reproductionRate || 0;
    const collisionFreeAgents = livingAgents.filter(a => (a.timesHitObstacle || 0) === 0).length;
    const collisionFreePercent = (collisionFreeAgents / livingAgents.length) * 100;
    const qualifiedAgents = livingAgents.filter(a => a.fit).length;

    let learningRate = 0;
    if (simulation.fitnessHistory.length >= 2) {
        const recent = simulation.fitnessHistory.slice(-5);
        const older = simulation.fitnessHistory.slice(-10, -5);
        if (older.length > 0) {
            const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
            const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
            learningRate = (recentAvg - olderAvg) / older.length;
        }
    }

    let fitnessDelta = 0;
    if (simulation.fitnessHistory.length >= 2) {
        fitnessDelta = simulation.fitnessHistory[simulation.fitnessHistory.length - 1] - simulation.fitnessHistory[simulation.fitnessHistory.length - 2];
    }

    // Get memory stats
    const memoryStats = {
        current: 'N/A',
        peak: 'N/A'
    };
    if (performance.memory) {
        memoryStats.current = (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1) + 'MB';
        memoryStats.peak = simulation.peakMemoryUsage ? simulation.peakMemoryUsage.toFixed(1) + 'MB' : 'N/A';
    }

    // Calculate simulation runtime
    const runtimeMs = Date.now() - (simulation.startTime || Date.now());
    const runtimeSeconds = Math.floor(runtimeMs / 1000);
    const runtimeMinutes = Math.floor(runtimeSeconds / 60);
    const runtimeDisplay = runtimeMinutes > 0 ?
        `${runtimeMinutes}m ${runtimeSeconds % 60}s` :
        `${runtimeSeconds}s`;

    // Format stats for copying
    const statsText = `
🎯 SIMULATION STATS - ${new Date().toLocaleString()}

📊 Core Metrics
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Population: ${livingAgents.length} agents (Total Spawned: ${simulation.totalAgentsSpawned})
Generation: ${simulation.generation || 0}
Frames Processed: ${simulation.frameCount || 0}
Best Fitness: ${bestFitness.toFixed(0)} (Δ: ${fitnessDelta >= 0 ? '+' : ''}${fitnessDelta.toFixed(0)})
Avg Fitness: ${avgFitness.toFixed(1)}
Simulation Runtime: ${runtimeDisplay} (${runtimeSeconds}s)

🎯 Performance Targets
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Avg Age: ${avgAge.toFixed(1)}s (Target: 60s+)
Max Age: ${maxAge.toFixed(1)}s
Mature Agents (≥15s): ${matureAgents} / ${livingAgents.length}
Maturation Rate: ${maturationRate.toFixed(1)}%

💰 Resources & Survival
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Avg Energy: ${avgEnergy.toFixed(1)}
Food Available: ${simulation.food.length} items
Avg Food Eaten: ${avgFood.toFixed(1)}
Total Food Consumed: ${livingAgents.reduce((sum, a) => sum + a.foodEaten, 0)}
Avg Kills: ${avgKills.toFixed(2)}

🤝 Reproduction
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Sexual Offspring: ${totalSexualOffspring}
Asexual Offspring: ${totalAsexualOffspring}
Avg Offspring/Agent: ${(avgOffspring).toFixed(2)}
Reproduction Events/min: ${reproductionRate}

🎯 Behavior & Learning
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Genetic Diversity: ${geneIdCount} active gene IDs
Stored Gene Pools: ${genePoolCount}
Qualified Agents: ${qualifiedAgents} (F≥5000, 15s+, 3+ food)
Total Agents Spawned: ${simulation.totalAgentsSpawned}
Mutation Rate: ${(simulation.mutationRate * 100).toFixed(1)}%
Learning Rate: ${learningRate >= 0 ? '+' : ''}${learningRate.toFixed(1)}/gen

⚔️ Combat & Navigation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Avg Collisions: ${avgCollisions.toFixed(1)}
Avg Wall Hits: ${avgWallHits.toFixed(1)}
Collision-Free %: ${collisionFreePercent.toFixed(1)}%

🧠 Memory Monitor
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Current Usage: ${memoryStats.current}
Peak Usage: ${memoryStats.peak}
Total Entities: ${simulation.agents.length + simulation.food.length + simulation.pheromones.length}

⚙️ Simulation Settings
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Game Speed: ${simulation.gameSpeed}
Max Agents: ${simulation.maxAgents}
Food Spawn Multiplier: ${simulation.finalFoodSpawnMultiplier ? simulation.finalFoodSpawnMultiplier.toFixed(2) : 'N/A'}
Food Scarcity Factor: ${simulation.foodScarcityFactor.toFixed(2)}
GPU Enabled: ${simulation.useGpu ? 'Yes' : 'No'}

📈 Recent Fitness History (last 10)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${simulation.fitnessHistory.slice(-10).map((f, i) => `${i+1}: ${f.toFixed(0)}`).join(' | ')}
`;

    // Copy to clipboard
    navigator.clipboard.writeText(statsText.trim()).then(() => {
        // Visual feedback
        const btn = document.getElementById('copyStats');
        if (btn) {
            const originalText = btn.textContent;
            btn.textContent = '✅ Copied!';
            btn.style.backgroundColor = '#0f0';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.backgroundColor = '';
            }, 2000);
        }
    }).catch(err => {
        console.error('Failed to copy stats:', err);
        alert('Failed to copy stats to clipboard');
    });
}

export function updateDashboard(simulation) {
    // Only count living agents for dashboard stats
    const livingAgents = simulation.agents.filter(a => !a.isDead);
    if (livingAgents.length === 0) return;

    // Calculate metrics
    const bestFitness = simulation.bestAgent ? simulation.bestAgent.fitness : 0;
    const geneIdCount = new Set(livingAgents.map(a => a.geneId)).size;
    const genePoolHealth = simulation.db.getGenePoolHealth();
    const genePoolCount = genePoolHealth.genePoolCount;


    // Average stats
    const avgFitness = livingAgents.reduce((sum, a) => sum + a.fitness, 0) / livingAgents.length;
    const avgAge = livingAgents.reduce((sum, a) => sum + a.age, 0) / livingAgents.length; // Real seconds accounting for game speed
    const avgEnergy = livingAgents.reduce((sum, a) => sum + a.energy, 0) / livingAgents.length;
    const avgOffspring = livingAgents.reduce((sum, a) => sum + a.offspring, 0) / livingAgents.length;
    const avgOffspringMate = livingAgents.reduce((sum, a) => sum + a.childrenFromMate, 0) / livingAgents.length;
    const avgOffspringSplit = livingAgents.reduce((sum, a) => sum + a.childrenFromSplit, 0) / livingAgents.length;
    const avgFood = livingAgents.reduce((sum, a) => sum + a.foodEaten, 0) / livingAgents.length;
    const avgKills = livingAgents.reduce((sum, a) => sum + a.kills, 0) / livingAgents.length;
    const avgCollisions = livingAgents.reduce((sum, a) => sum + (a.collisions || 0), 0) / livingAgents.length;
    const avgWallHits = livingAgents.reduce((sum, a) => sum + (a.timesHitObstacle || 0), 0) / livingAgents.length;

    // NEW: Critical lifespan metrics (TIME-BASED)
    const MATURATION_SECONDS = 15; // 15 seconds of real time
    const matureAgents = livingAgents.filter(a => a.age >= MATURATION_SECONDS).length;
    const maturationRate = (matureAgents / livingAgents.length) * 100;
    const maxAge = Math.max(...livingAgents.map(a => a.age), 0); // Real seconds accounting for game speed
    const maxFrames = Math.max(...livingAgents.map(a => a.framesAlive), 0);

    // NEW: Reproduction metrics
    const totalSexualOffspring = livingAgents.reduce((sum, a) => sum + (a.childrenFromMate || 0), 0);
    const totalAsexualOffspring = livingAgents.reduce((sum, a) => sum + (a.childrenFromSplit || 0), 0);

    // Calculate reproduction rate (events per minute)
    // Store previous offspring count and calculate delta
    if (!simulation.previousOffspringCount) simulation.previousOffspringCount = 0;
    if (!simulation.lastReproductionCheck) simulation.lastReproductionCheck = Date.now();

    const currentOffspringCount = totalSexualOffspring + totalAsexualOffspring;
    const offspringDelta = currentOffspringCount - simulation.previousOffspringCount;
    const timeDelta = (Date.now() - simulation.lastReproductionCheck) / 1000 / 60; // in minutes
    const reproductionRate = timeDelta > 0 ? (offspringDelta / timeDelta).toFixed(1) : 0;

    // Update tracking variables every 10 seconds
    if (timeDelta >= 0.167) { // ~10 seconds
        simulation.previousOffspringCount = currentOffspringCount;
        simulation.lastReproductionCheck = Date.now();
    }

    // NEW: Collision-free percentage
    const collisionFreeAgents = livingAgents.filter(a => (a.timesHitObstacle || 0) === 0).length;
    const collisionFreePercent = (collisionFreeAgents / livingAgents.length) * 100;

    // Count qualified agents (same criteria as database saving: fitness >= 5000, food >= 3, age >= 15s)
    const qualifiedAgents = livingAgents.filter(a => a.fit).length;

    // Learning rate (fitness improvement per generation)
    let learningRate = 0;
    if (simulation.fitnessHistory.length >= 2) {
        const recent = simulation.fitnessHistory.slice(-5);
        const older = simulation.fitnessHistory.slice(-10, -5);
        if (older.length > 0) {
            const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
            const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
            learningRate = (recentAvg - olderAvg) / older.length;
        }
    }

    // Fitness delta
    let fitnessDelta = 0;
    if (simulation.fitnessHistory.length >= 2) {
        fitnessDelta = simulation.fitnessHistory[simulation.fitnessHistory.length - 1] - simulation.fitnessHistory[simulation.fitnessHistory.length - 2];
    }

    // Update DOM - NEW METRICS
    const matureAgentsEl = document.getElementById('mature-agents');
    const totalAgentsEl = document.getElementById('total-agents');
    const maturationRateEl = document.getElementById('maturation-rate');
    const maxAgeEl = document.getElementById('max-age');

    const totalSexualOffspringEl = document.getElementById('total-sexual-offspring');
    const totalAsexualOffspringEl = document.getElementById('total-asexual-offspring');
    const reproductionRateEl = document.getElementById('reproduction-rate');
    const avgWallHitsEl = document.getElementById('avg-wall-hits');
    const collisionFreePercentEl = document.getElementById('collision-free-percent');

    if (matureAgentsEl) matureAgentsEl.textContent = matureAgents;
    if (totalAgentsEl) totalAgentsEl.textContent = livingAgents.length;
    if (maturationRateEl) {
        maturationRateEl.textContent = maturationRate.toFixed(1);
        maturationRateEl.style.color = maturationRate >= 30 ? '#0f0' : maturationRate >= 10 ? '#ff0' : '#f00';
    }
    if (maxAgeEl) maxAgeEl.textContent = maxAge.toFixed(0);
    if (totalSexualOffspringEl) totalSexualOffspringEl.textContent = totalSexualOffspring;
    if (totalAsexualOffspringEl) totalAsexualOffspringEl.textContent = totalAsexualOffspring;
    if (reproductionRateEl) reproductionRateEl.textContent = reproductionRate;
    if (avgWallHitsEl) avgWallHitsEl.textContent = avgWallHits.toFixed(1);
    if (collisionFreePercentEl) {
        collisionFreePercentEl.textContent = collisionFreePercent.toFixed(1);
        collisionFreePercentEl.style.color = collisionFreePercent >= 50 ? '#0f0' : collisionFreePercent >= 25 ? '#ff0' : '#f00';
    }

    // Update DOM - EXISTING METRICS
    const fitnessValueEl = document.getElementById('fitness-value');
    const fitnessDeltaEl = document.getElementById('fitness-delta');
    const avgFitnessValueEl = document.getElementById('avg-fitness-value');
    const diversityValueEl = document.getElementById('diversity-value');
    const genePoolValueEl = document.getElementById('gene-pool-value');
    const qualifiedAgentsValueEl = document.getElementById('qualified-agents-value');
    const validationQueueValueEl = document.getElementById('validation-queue-value');
    const mutationRateValueEl = document.getElementById('mutation-rate-value');
    const avgAgeEl = document.getElementById('avg-age');
    const avgEnergyEl = document.getElementById('avg-energy');
    const avgOffspringEl = document.getElementById('avg-offspring');
    const avgOffspringMateEl = document.getElementById('avg-offspring-mate');
    const avgOffspringSplitEl = document.getElementById('avg-offspring-split');
    const avgFoodEl = document.getElementById('avg-food');
    const avgKillsEl = document.getElementById('avg-kills');
    const avgCollisionsEl = document.getElementById('avg-collisions');
    const learningRateEl = document.getElementById('learning-rate-value');

    if (fitnessValueEl) fitnessValueEl.textContent = bestFitness.toFixed(0);
    if (fitnessDeltaEl) {
        fitnessDeltaEl.textContent = (fitnessDelta >= 0 ? '+' : '') + fitnessDelta.toFixed(0);
        fitnessDeltaEl.style.color = fitnessDelta >= 0 ? '#0f0' : '#f00';
    }
    if (avgFitnessValueEl) avgFitnessValueEl.textContent = avgFitness.toFixed(1);
    if (diversityValueEl) diversityValueEl.textContent = geneIdCount;
    if (genePoolValueEl) genePoolValueEl.textContent = genePoolCount;
    if (qualifiedAgentsValueEl) {
        qualifiedAgentsValueEl.textContent = qualifiedAgents;
        qualifiedAgentsValueEl.style.color = qualifiedAgents > 0 ? '#0f0' : '#f00';
    }
    if (validationQueueValueEl) {
        validationQueueValueEl.textContent = simulation.validationQueue.size;
        validationQueueValueEl.style.color = simulation.validationQueue.size > 0 ? '#ff0' : '#888';
    }
    if (mutationRateValueEl) mutationRateValueEl.textContent = (simulation.mutationRate * 100).toFixed(1) + '%';
    if (avgAgeEl) {
        avgAgeEl.textContent = avgAge.toFixed(1);
        // Color code based on target: green if >60s (1 min), yellow if 30-60s (30s-1min), red if <30s
        avgAgeEl.style.color = avgAge >= 60 ? '#0f0' : avgAge >= 30 ? '#ff0' : '#f00';
    }
    if (avgEnergyEl) avgEnergyEl.textContent = avgEnergy.toFixed(1);
    if (avgOffspringEl) avgOffspringEl.textContent = avgOffspring.toFixed(2);
    if (avgOffspringMateEl) avgOffspringMateEl.textContent = avgOffspringMate.toFixed(2);
    if (avgOffspringSplitEl) avgOffspringSplitEl.textContent = avgOffspringSplit.toFixed(2);
    if (avgFoodEl) avgFoodEl.textContent = avgFood.toFixed(1);
    if (avgKillsEl) avgKillsEl.textContent = avgKills.toFixed(2);
    if (avgCollisionsEl) avgCollisionsEl.textContent = avgCollisions.toFixed(1);
    if (learningRateEl) {
        learningRateEl.textContent = (learningRate >= 0 ? '+' : '') + learningRate.toFixed(1);
        learningRateEl.style.color = learningRate >= 0 ? '#0f0' : '#f00';
    }

    // Update fitness chart
    simulation.updateFitnessChart();
}
