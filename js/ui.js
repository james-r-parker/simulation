// UI-related functions moved from game.js

import { updateMemoryStats, handleMemoryPressure } from './memory.js';
import { updateFoodScalingFactor } from './spawn.js';

// Global variables for summarization feature
let summarizer = null;
let summaryInterval = null;
let isFullscreenMode = false;
let initialSummaryScheduled = false;
let historicalSummaries = []; // Store last 10 summaries with timestamps

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

// ============================================================================
// FULLSCREEN SUMMARIZATION FEATURE
// ============================================================================

// Initialize summarizer for AI-powered summaries
async function initializeSummarizer() {
    if (!('Summarizer' in self)) {
        console.log('[SUMMARIZER] ❌ Summarizer API not supported');
        return null;
    }

    try {
        const availability = await Summarizer.availability();
        console.log('[SUMMARIZER] Availability check:', availability);

        if (availability === 'unavailable') {
            console.log('[SUMMARIZER] ❌ Summarizer not available');
            return null;
        }

        const summarizerInstance = await Summarizer.create({
            type: 'tldr',
            length: 'medium',
            format: 'plain-text',
            sharedContext: 'This is a summary of real-time simulation statistics from an evolutionary AI simulation where autonomous agents learn to survive and evolve.',
            monitor(m) {
                m.addEventListener('downloadprogress', (e) => {
                    console.log(`[SUMMARIZER] Downloaded ${e.loaded * 100}%`);
                });
            }
        });

        console.log('[SUMMARIZER] ✅ Summarizer initialized successfully');
        return summarizerInstance;
    } catch (error) {
        console.error('[SUMMARIZER] Failed to initialize summarizer:', error);
        return null;
    }
}

// Start periodic summarization when entering fullscreen
async function startPeriodicSummarization(simulation) {
    console.log('[SUMMARIZER] 🚀 Starting periodic summarization');

    // Initialize summarizer if not already done
    if (!summarizer) {
        summarizer = await initializeSummarizer();
        if (!summarizer) {
            console.log('[SUMMARIZER] ❌ Cannot start summarization - API not available');
            return;
        }
    }

    // Clear any existing interval
    if (summaryInterval) {
        clearInterval(summaryInterval);
    }

    // Start summarization every minute
    summaryInterval = setInterval(async () => {
        await generateAndDisplaySummary(simulation);
    }, 60000); // 60 seconds

    // Generate first summary immediately (only if not already scheduled)
    if (!initialSummaryScheduled) {
        initialSummaryScheduled = true;
        setTimeout(() => {
            generateAndDisplaySummary(simulation);
            initialSummaryScheduled = false; // Reset after summary is generated
        }, 1000);
    }
}

// Stop periodic summarization
function stopPeriodicSummarization() {
    console.log('[SUMMARIZER] 🛑 Stopping periodic summarization');

    if (summaryInterval) {
        clearInterval(summaryInterval);
        summaryInterval = null;
    }

    // Reset the initial summary flag
    initialSummaryScheduled = false;

    // Clear historical summaries when exiting fullscreen
    historicalSummaries = [];
}

// Generate summary and display it with streaming effect
async function generateAndDisplaySummary(simulation) {
    if (!summarizer || !isFullscreenMode) {
        return;
    }

    try {
        // Get current simulation data
        const currentStats = generateStatsDataForSummary(simulation);
        const currentTimestamp = new Date().toISOString();

        // Store current data in historical summaries (keep only last 10)
        historicalSummaries.unshift({
            timestamp: currentTimestamp,
            data: currentStats
        });
        if (historicalSummaries.length > 10) {
            historicalSummaries = historicalSummaries.slice(0, 10);
        }

        // Generate text for AI summarization including historical context
        const contextText = generateHistoricalContextText();

        console.log('[SUMMARIZER] 📊 Generating summary with historical context');

        // Generate summary using Summarizer API with trend analysis
        const summary = await summarizer.summarize(contextText, {
            context: 'Analyze the trends and evolution in this evolutionary simulation over time. Compare current performance with historical data and identify patterns, improvements, or concerning trends in the agent population, fitness, reproduction, and behavior.'
        });

        console.log('[SUMMARIZER] 📝 Generated summary:', summary);

        // Display summary with streaming effect
        displayStreamingSummary(summary);

    } catch (error) {
        console.error('[SUMMARIZER] Failed to generate summary:', error);
    }
}

// Extract the stats data generation logic from copySimulationStats
function generateStatsDataForSummary(simulation) {
    // Gather all current stats (same logic as copySimulationStats)
    const livingAgents = simulation.agents.filter(a => !a.isDead);
    if (livingAgents.length === 0) {
        return null;
    }

    // Calculate stats (same as updateDashboard)
    const bestFitness = simulation.bestAgent ? simulation.bestAgent.fitness : 0;
    const geneIdCount = new Set(livingAgents.map(a => a.geneId)).size;
    const genePoolHealth = simulation.db.getGenePoolHealth();
    const genePoolCount = genePoolHealth.genePoolCount;

    const avgFitness = livingAgents.reduce((sum, a) => sum + a.fitness, 0) / livingAgents.length;
    const avgAge = livingAgents.reduce((sum, a) => sum + a.age, 0) / livingAgents.length;
    const avgEnergy = livingAgents.reduce((sum, a) => sum + a.energy, 0) / livingAgents.length;
    const avgFood = livingAgents.reduce((sum, a) => sum + a.foodEaten, 0) / livingAgents.length;
    const avgKills = livingAgents.reduce((sum, a) => sum + a.kills, 0) / livingAgents.length;

    const MATURATION_SECONDS = 15;
    const matureAgents = livingAgents.filter(a => a.age >= MATURATION_SECONDS).length;
    const maturationRate = (matureAgents / livingAgents.length) * 100;

    const totalSexualOffspring = livingAgents.reduce((sum, a) => sum + (a.childrenFromMate || 0), 0);
    const totalAsexualOffspring = livingAgents.reduce((sum, a) => sum + (a.childrenFromSplit || 0), 0);

    // Calculate simulation runtime
    const runtimeMs = Date.now() - (simulation.startTime || Date.now());
    const runtimeSeconds = Math.floor(runtimeMs / 1000);

    let fitnessDelta = 0;
    if (simulation.fitnessHistory.length >= 2) {
        fitnessDelta = simulation.fitnessHistory[simulation.fitnessHistory.length - 1] - simulation.fitnessHistory[simulation.fitnessHistory.length - 2];
    }

    // Return structured data for historical storage
    return {
        population: livingAgents.length,
        generation: simulation.generation || 0,
        bestFitness: bestFitness,
        fitnessDelta: fitnessDelta,
        avgFitness: avgFitness,
        avgAge: avgAge,
        maturationRate: maturationRate,
        avgEnergy: avgEnergy,
        totalSexualOffspring: totalSexualOffspring,
        totalAsexualOffspring: totalAsexualOffspring,
        geneIdCount: geneIdCount,
        genePoolCount: genePoolCount,
        runtimeSeconds: runtimeSeconds,
        foodAvailable: simulation.food.length,
        recentFitnessTrend: simulation.fitnessHistory.slice(-5)
    };
}

// Generate historical context text for AI summarization
function generateHistoricalContextText() {
    if (historicalSummaries.length === 0) {
        return 'No historical data available for analysis.';
    }

    let contextText = 'EVOLUTIONARY SIMULATION TREND ANALYSIS\n\n';

    // Add current data first (most recent)
    const current = historicalSummaries[0];
    const currentTime = new Date(current.timestamp);
    contextText += `CURRENT STATE (${currentTime.toLocaleTimeString()}):\n`;
    contextText += `- Population: ${current.data.population} agents\n`;
    contextText += `- Generation: ${current.data.generation}\n`;
    contextText += `- Best Fitness: ${current.data.bestFitness.toFixed(0)} (Δ: ${current.data.fitnessDelta >= 0 ? '+' : ''}${current.data.fitnessDelta.toFixed(0)})\n`;
    contextText += `- Average Fitness: ${current.data.avgFitness.toFixed(1)}\n`;
    contextText += `- Average Age: ${current.data.avgAge.toFixed(1)}s, Maturation Rate: ${current.data.maturationRate.toFixed(1)}%\n`;
    contextText += `- Reproduction: ${current.data.totalSexualOffspring} sexual, ${current.data.totalAsexualOffspring} asexual\n`;
    contextText += `- Genetic Diversity: ${current.data.geneIdCount} active gene pools\n`;
    contextText += `- Runtime: ${current.data.runtimeSeconds}s\n\n`;

    // Add historical comparison data
    if (historicalSummaries.length > 1) {
        contextText += 'HISTORICAL COMPARISON:\n';

        // Compare with 1 minute ago (if available)
        if (historicalSummaries.length >= 2) {
            const prev = historicalSummaries[1];
            const timeDiff = (new Date(current.timestamp) - new Date(prev.timestamp)) / 1000 / 60; // minutes
            contextText += `Compared to ${timeDiff.toFixed(1)} minutes ago:\n`;
            contextText += `- Population change: ${current.data.population - prev.data.population >= 0 ? '+' : ''}${current.data.population - prev.data.population}\n`;
            contextText += `- Fitness change: ${current.data.bestFitness - prev.data.bestFitness >= 0 ? '+' : ''}${(current.data.bestFitness - prev.data.bestFitness).toFixed(0)}\n`;
            contextText += `- Generation progress: ${current.data.generation - prev.data.generation}\n\n`;
        }

        // Add trend data from last 10 entries
        contextText += 'FITNESS TREND OVER TIME:\n';
        historicalSummaries.slice(0, 10).forEach((entry, index) => {
            const time = new Date(entry.timestamp).toLocaleTimeString();
            contextText += `${index === 0 ? 'NOW' : `${index}min ago`}: Gen ${entry.data.generation}, Best ${entry.data.bestFitness.toFixed(0)}, Avg ${entry.data.avgFitness.toFixed(1)}\n`;
        });
    }

    return contextText.trim();
}

// Display summary with streaming letter-by-letter effect
function displayStreamingSummary(summaryText) {
    // Create or update summary overlay
    let summaryOverlay = document.getElementById('ai-summary-overlay');
    if (!summaryOverlay) {
        summaryOverlay = document.createElement('div');
        summaryOverlay.id = 'ai-summary-overlay';
        summaryOverlay.className = 'ai-summary-overlay';
        document.body.appendChild(summaryOverlay);
    }

    // Clear previous content
    summaryOverlay.innerHTML = '';

    // Create summary content
    const summaryContent = document.createElement('div');
    summaryContent.className = 'ai-summary-content';
    summaryOverlay.appendChild(summaryContent);

    // Add header
    const header = document.createElement('div');
    header.className = 'ai-summary-header';
    header.textContent = '🤖 AI Analysis';
    summaryContent.appendChild(header);

    // Create text container for streaming effect
    const textContainer = document.createElement('div');
    textContainer.className = 'ai-summary-text';
    summaryContent.appendChild(textContainer);

    // Start streaming effect
    let charIndex = 0;
    const streamInterval = setInterval(() => {
        if (charIndex < summaryText.length) {
            textContainer.textContent += summaryText[charIndex];
            charIndex++;
        } else {
            clearInterval(streamInterval);
            // Auto-hide after 10 seconds with slide-down animation
            setTimeout(() => {
                summaryOverlay.style.animation = 'summary-slide-down 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards';
                setTimeout(() => {
                    if (summaryOverlay.parentNode) {
                        summaryOverlay.parentNode.removeChild(summaryOverlay);
                    }
                }, 600);
            }, 10000);
        }
    }, 25); // 25ms per character for faster typing effect

    // Show overlay
    summaryOverlay.style.opacity = '1';
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

    const showRaysCheckbox = document.getElementById('showRays');
    showRaysCheckbox.checked = simulation.showRays;
    showRaysCheckbox.addEventListener('change', e => {
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

            // Stop summarization when exiting fullscreen
            stopPeriodicSummarization();

            if (simulation.wakeLockEnabled && simulation.wakeLock) {
                // Optional: Could auto-release when exiting fullscreen
                // For now, we'll keep it enabled but log the exit
                console.log('[WAKE] 🖥️ Exiting fullscreen (wake lock remains active)');
            }
        }

        // Update fullscreen mode state
        isFullscreenMode = isFullscreen;

        // Start/stop summarization based on fullscreen state
        if (isFullscreen) {
            startPeriodicSummarization(simulation);
        } else {
            stopPeriodicSummarization();
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

    // Touch-specific variables for pinch zoom
    let initialPinchDistance = 0;
    let lastPinchCenterX = 0;
    let lastPinchCenterY = 0;
    let isPinching = false;

    // Helper function to get touch center and distance
    function getTouchData(touches) {
        if (touches.length === 1) {
            // Single touch - return position
            return {
                centerX: touches[0].clientX,
                centerY: touches[0].clientY,
                distance: 0,
                isPinch: false
            };
        } else if (touches.length >= 2) {
            // Multi-touch - calculate pinch center and distance
            const touch1 = touches[0];
            const touch2 = touches[1];
            const centerX = (touch1.clientX + touch2.clientX) / 2;
            const centerY = (touch1.clientY + touch2.clientY) / 2;
            const distance = Math.sqrt(
                Math.pow(touch2.clientX - touch1.clientX, 2) +
                Math.pow(touch2.clientY - touch1.clientY, 2)
            );
            return {
                centerX: centerX,
                centerY: centerY,
                distance: distance,
                isPinch: true
            };
        }
        return null;
    }

    // Mouse events (desktop)
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

    // Touch events (mobile)
    canvas.addEventListener('touchstart', (e) => {
        if (simulation.followBest) return;

        const touchData = getTouchData(e.touches);
        if (!touchData) return;

        if (touchData.isPinch) {
            // Start pinch gesture
            isPinching = true;
            initialPinchDistance = touchData.distance;
            lastPinchCenterX = touchData.centerX;
            lastPinchCenterY = touchData.centerY;
        } else {
            // Start single touch drag
            isDragging = true;
            lastMouseX = touchData.centerX;
            lastMouseY = touchData.centerY;
        }

        e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        if (simulation.followBest) return;

        const touchData = getTouchData(e.touches);
        if (!touchData) return;

        if (touchData.isPinch && isPinching) {
            // Handle pinch zoom
            const rect = canvas.getBoundingClientRect();
            const pinchCenterX = touchData.centerX - rect.left;
            const pinchCenterY = touchData.centerY - rect.top;

            // Calculate zoom delta based on pinch distance change
            const distanceRatio = touchData.distance / initialPinchDistance;
            const zoomDelta = (distanceRatio - 1) * 1000; // Scale for zoom sensitivity

            const aspect = container.clientWidth / container.clientHeight;
            simulation.camera.zoomAt(pinchCenterX, pinchCenterY, -zoomDelta, container.clientWidth, container.clientHeight,
                simulation.worldWidth, simulation.worldHeight, aspect);

            // Update initial distance for continuous zooming
            initialPinchDistance = touchData.distance;
        } else if (!touchData.isPinch && isDragging) {
            // Handle single touch pan
            const deltaX = touchData.centerX - lastMouseX;
            const deltaY = touchData.centerY - lastMouseY;

            const aspect = container.clientWidth / container.clientHeight;
            const viewSize = Math.max(simulation.worldWidth, simulation.worldHeight) * 0.4;

            simulation.camera.pan(deltaX, deltaY, container.clientWidth, container.clientHeight, viewSize, aspect);

            lastMouseX = touchData.centerX;
            lastMouseY = touchData.centerY;
        }

        e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
        // If no touches remaining, stop all interactions
        if (e.touches.length === 0) {
            isDragging = false;
            isPinching = false;
        } else if (e.touches.length === 1 && isPinching) {
            // Pinch ended, switch to single touch drag if still touching
            isPinching = false;
            isDragging = true;
            const touchData = getTouchData(e.touches);
            if (touchData) {
                lastMouseX = touchData.centerX;
                lastMouseY = touchData.centerY;
            }
        }
    });

    // LOG: Mouse click with world coordinates (ALWAYS log, not occasional)
    canvas.addEventListener('click', (e) => {
        if (isDragging) return; // Don't log clicks that were part of a drag

        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Convert screen coordinates to world coordinates
        const normalizedX = (mouseX / canvas.width) * 2 - 1;
        const normalizedY = 1 - (mouseY / canvas.height) * 2;

        const aspect = canvas.width / canvas.height;
        const baseViewSize = Math.max(simulation.worldWidth, simulation.worldHeight) * 0.4;
        const viewSize = baseViewSize * simulation.camera.zoom;

        const worldX = simulation.camera.x + (normalizedX * viewSize * aspect);
        const worldY = simulation.camera.y - (normalizedY * viewSize);

        console.log(`[CAMERA-CLICK] screen(${mouseX.toFixed(1)}, ${mouseY.toFixed(1)}) normalized(${normalizedX.toFixed(3)}, ${normalizedY.toFixed(3)}) world(${worldX.toFixed(1)}, ${worldY.toFixed(1)}) camera(${simulation.camera.x.toFixed(1)}, ${simulation.camera.y.toFixed(1)}) zoom(${simulation.camera.zoom.toFixed(3)})`);
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

    // Get validation queue info
    const validationQueueSize = simulation.validationManager ? simulation.validationManager.validationQueue.size : 0;

    // Get detailed gene pool information
    const poolDetails = [];
    for (const [geneId, agents] of Object.entries(simulation.db.pool || {})) {
        if (agents && agents.length > 0) {
            const maxFitness = Math.max(...agents.map(a => a.fitness || 0));
            const avgFitness = agents.reduce((sum, a) => sum + (a.fitness || 0), 0) / agents.length;
            poolDetails.push({
                geneId: geneId.substring(0, 12),
                count: agents.length,
                maxFitness,
                avgFitness
            });
        }
    }

    // Sort pools by max fitness (descending)
    poolDetails.sort((a, b) => b.maxFitness - a.maxFitness);

    // Calculate pool statistics
    const poolStats = {
        total: poolDetails.length,
        avgAgentsPerPool: poolDetails.length > 0 ? poolDetails.reduce((sum, p) => sum + p.count, 0) / poolDetails.length : 0,
        wellPopulated: poolDetails.filter(p => p.count >= 10).length, // Pools at capacity
        underPopulated: poolDetails.filter(p => p.count < 5).length,
        top10: poolDetails.slice(0, 10)
    };

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

🧬 Gene Pool Analysis
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Pools: ${poolStats.total} / 500 (${((poolStats.total / 500) * 100).toFixed(1)}% capacity)
Pools at Capacity (10 agents): ${poolStats.wellPopulated}
Under-Populated Pools (<5): ${poolStats.underPopulated}
Avg Agents per Pool: ${poolStats.avgAgentsPerPool.toFixed(1)}
Validation Queue: ${validationQueueSize} pending

Top 10 Gene Pools by Fitness:
${poolStats.top10.map((p, i) => `  ${i + 1}. ${p.geneId}... | Max: ${p.maxFitness.toFixed(0)}, Avg: ${p.avgFitness.toFixed(0)}, Agents: ${p.count}/10`).join('\n')}

Pool Health Indicators:
- Capacity Utilization: ${((poolStats.total / 500) * 100).toFixed(1)}%
- Average Pool Quality: ${poolStats.top10.length > 0 ? (poolStats.top10.reduce((sum, p) => sum + p.maxFitness, 0) / poolStats.top10.length).toFixed(0) : 'N/A'}
- Weakest Pool in Top 10: ${poolStats.top10.length >= 10 ? poolStats.top10[9].maxFitness.toFixed(0) : 'N/A'}
- Pool Diversity Score: ${poolStats.top10.length > 0 ? (new Set(poolStats.top10.map(p => Math.floor(p.maxFitness / 1000))).size * 100).toFixed(0) : 'N/A'}

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
${simulation.fitnessHistory.slice(-10).map((f, i) => `${i + 1}: ${f.toFixed(0)}`).join(' | ')}
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
        validationQueueValueEl.textContent = simulation.validationManager.validationQueue.size;
        validationQueueValueEl.style.color = simulation.validationManager.validationQueue.size > 0 ? '#ff0' : '#888';
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
