// UI-related functions moved from game.js

import { updateMemoryStats, handleMemoryPressure } from './memory.js';
import { updateFoodScalingFactor } from './spawn.js';
import { copySimulationStats } from './stats.js';
import {
    MIN_FITNESS_TO_SAVE_GENE_POOL,
    MIN_FOOD_EATEN_TO_SAVE_GENE_POOL,
    MIN_FRAMES_ALIVE_TO_SAVE_GENE_POOL,
    MIN_EXPLORATION_PERCENTAGE_TO_SAVE_GENE_POOL,
    MIN_TURNS_TOWARDS_FOOD_TO_SAVE_GENE_POOL,
    EXPLORATION_GRID_WIDTH,
    EXPLORATION_GRID_HEIGHT
} from './constants.js';

const safeNumber = (value, fallback = 0) => {
    const num = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(num) ? num : fallback;
};

const averageMetric = (items, getter) => {
    if (!items || items.length === 0) return 0;
    const total = items.reduce((sum, item) => sum + safeNumber(getter(item), 0), 0);
    return safeNumber(total / items.length, 0);
};

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
async function initializeSummarizer(requireUserGesture = false) {
    if (!('Summarizer' in self)) {
        console.log('[SUMMARIZER] ❌ Summarizer API not supported');
        return null;
    }

    let availability;
    try {
        availability = await Summarizer.availability();
        console.log('[SUMMARIZER] Availability check:', availability);

        if (availability === 'unavailable') {
            console.log('[SUMMARIZER] ❌ Summarizer not available');
            return null;
        }

        // If availability is "downloading" or "downloadable", we need a user gesture
        if ((availability === 'downloading' || availability === 'downloadable') && !requireUserGesture) {
            console.log('[SUMMARIZER] ⚠️ User gesture required for initialization. Will retry on next user interaction.');
            return null;
        }

        const summarizerInstance = await Summarizer.create({
            type: 'tldr',
            length: 'medium',
            format: 'plain-text',
            lang: 'en', // Specify output language (en, es, or ja)
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
        if (error.name === 'NotAllowedError' && availability && (availability === 'downloading' || availability === 'downloadable')) {
            console.log('[SUMMARIZER] ⚠️ User gesture required. Click anywhere to initialize.');
            return null;
        }
        console.error('[SUMMARIZER] Failed to initialize summarizer:', error);
        return null;
    }
}

// Start periodic summarization when entering fullscreen
async function startPeriodicSummarization(simulation) {
    console.log('[SUMMARIZER] 🚀 Starting periodic summarization');

    // Initialize summarizer if not already done
    if (!summarizer) {
        // Try to initialize (may fail if user gesture is required)
        summarizer = await initializeSummarizer(false);
        
        // If initialization failed due to user gesture requirement, set up click handler
        if (!summarizer && 'Summarizer' in self) {
            const availability = await Summarizer.availability();
            if (availability === 'downloading' || availability === 'downloadable') {
                console.log('[SUMMARIZER] 👆 Waiting for user gesture to initialize...');
                
                // Set up one-time click handler to initialize on user interaction
                const initOnClick = async (e) => {
                    summarizer = await initializeSummarizer(true);
                    if (summarizer) {
                        console.log('[SUMMARIZER] ✅ Initialized after user gesture');
                        // Remove the click handler
                        document.removeEventListener('click', initOnClick);
                        document.removeEventListener('touchstart', initOnClick);
                        // Generate first summary now that it's initialized
                        setTimeout(() => {
                            generateAndDisplaySummary(simulation);
                        }, 500);
                    }
                };
                
                // Listen for click or touch
                document.addEventListener('click', initOnClick, { once: true });
                document.addEventListener('touchstart', initOnClick, { once: true });
                
                // Don't return - let the interval be set up, it will just skip until initialized
            } else {
                console.log('[SUMMARIZER] ❌ Cannot start summarization - API not available');
                return;
            }
        } else if (!summarizer) {
            console.log('[SUMMARIZER] ❌ Cannot start summarization - API not available');
            return;
        }
    }

    // Clear any existing interval
    if (summaryInterval) {
        clearInterval(summaryInterval);
    }

    // Start summarization every minute (only when focused)
    summaryInterval = setInterval(async () => {
        if (document.hasFocus()) {
            await generateAndDisplaySummary(simulation);
        }
    }, 60000); // 60 seconds

    // Generate first summary immediately (only if not already scheduled and focused)
    if (!initialSummaryScheduled && document.hasFocus()) {
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

        // Generate summary using Summarizer API with focus on key metric differences
        const summary = await summarizer.summarize(contextText, {
            context: 'Analyze key performance differences and evolutionary trends in this simulation. Focus on significant changes in fitness, population, reproduction rates, genetic diversity, and agent behavior. Identify whether the simulation is improving, stagnating, or declining. Compare current metrics against historical baselines and highlight any concerning trends or breakthroughs in evolution. Pay special attention to fitness deltas, reproduction efficiency, and genetic diversity changes over time.'
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
    const bestFitness = safeNumber(simulation.bestAgent ? simulation.bestAgent.fitness : 0, 0);
    const geneIdCount = new Set(livingAgents.map(a => a.geneId)).size;
    const genePoolHealth = simulation.db.getGenePoolHealth();
    const genePoolCount = genePoolHealth.genePoolCount;

    const avgFitness = averageMetric(livingAgents, a => a.fitness);
    const avgAge = averageMetric(livingAgents, a => a.age);
    const avgEnergy = averageMetric(livingAgents, a => a.energy);
    const avgFood = averageMetric(livingAgents, a => a.foodEaten);
    const avgKills = averageMetric(livingAgents, a => a.kills);

    const MATURATION_SECONDS = 10; // Updated to match new MATURATION_AGE_FRAMES (600 frames = 10s)
    const matureAgents = livingAgents.filter(a => a.age >= MATURATION_SECONDS).length;
    const maturationRate = (matureAgents / livingAgents.length) * 100;

    const totalSexualOffspring = livingAgents.reduce((sum, a) => sum + safeNumber(a.childrenFromMate || 0, 0), 0);
    const totalAsexualOffspring = livingAgents.reduce((sum, a) => sum + safeNumber(a.childrenFromSplit || 0, 0), 0);

    // Calculate simulation runtime
    const runtimeMs = Date.now() - (simulation.startTime || Date.now());
    const runtimeSeconds = safeNumber(Math.floor(runtimeMs / 1000), 0);

    let fitnessDelta = 0;
    if (simulation.fitnessHistory.length >= 2) {
        fitnessDelta = safeNumber(simulation.fitnessHistory[simulation.fitnessHistory.length - 1] - simulation.fitnessHistory[simulation.fitnessHistory.length - 2], 0);
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

    let contextText = 'EVOLUTIONARY SIMULATION PERFORMANCE ANALYSIS\n\n';

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

    // Add detailed historical comparison data
    if (historicalSummaries.length > 1) {
        contextText += 'KEY METRIC DIFFERENCES:\n';

        // Compare with immediate previous (most recent comparison)
        if (historicalSummaries.length >= 2) {
            const prev = historicalSummaries[1];
            const timeDiff = (new Date(current.timestamp) - new Date(prev.timestamp)) / 1000 / 60; // minutes

            const fitnessDelta = current.data.bestFitness - prev.data.bestFitness;
            const avgFitnessDelta = current.data.avgFitness.toFixed(1) - prev.data.avgFitness.toFixed(1);
            const popDelta = current.data.population - prev.data.population;
            const genDelta = current.data.generation - prev.data.generation;
            const sexualDelta = current.data.totalSexualOffspring - prev.data.totalSexualOffspring;
            const asexualDelta = current.data.totalAsexualOffspring - prev.data.totalAsexualOffspring;
            const diversityDelta = current.data.geneIdCount - prev.data.geneIdCount;

            contextText += `RECENT CHANGES (${timeDiff.toFixed(1)} minutes ago → now):\n`;
            contextText += `• Fitness: ${fitnessDelta >= 0 ? '+' : ''}${fitnessDelta.toFixed(0)} (best), ${avgFitnessDelta >= 0 ? '+' : ''}${avgFitnessDelta.toFixed(1)} (avg)\n`;
            contextText += `• Population: ${popDelta >= 0 ? '+' : ''}${popDelta} agents\n`;
            contextText += `• Reproduction: ${sexualDelta >= 0 ? '+' : ''}${sexualDelta} sexual, ${asexualDelta >= 0 ? '+' : ''}${asexualDelta} asexual\n`;
            contextText += `• Genetic Diversity: ${diversityDelta >= 0 ? '+' : ''}${diversityDelta} gene pools\n`;
            contextText += `• Generation Progress: +${genDelta} generations\n\n`;
        }

        // Add longer-term trend analysis (compare with 5+ entries back)
        if (historicalSummaries.length >= 5) {
            const baseline = historicalSummaries[4]; // ~5 entries back
            const baselineTime = (new Date(current.timestamp) - new Date(baseline.timestamp)) / 1000 / 60; // minutes

            const longTermFitnessDelta = current.data.bestFitness - baseline.data.bestFitness;
            const longTermAvgFitnessDelta = current.data.avgFitness.toFixed(1) - baseline.data.avgFitness.toFixed(1);
            const longTermGenProgress = current.data.generation - baseline.data.generation;

            contextText += `LONG-TERM TRENDS (${baselineTime.toFixed(0)} minutes span):\n`;
            contextText += `• Fitness Evolution: ${longTermFitnessDelta >= 0 ? '+' : ''}${longTermFitnessDelta.toFixed(0)} (best), ${longTermAvgFitnessDelta >= 0 ? '+' : ''}${longTermAvgFitnessDelta.toFixed(1)} (avg)\n`;
            contextText += `• Evolutionary Pace: ${longTermGenProgress} generations total\n`;
            contextText += `• Fitness Rate: ${(longTermFitnessDelta / baselineTime).toFixed(1)} per minute\n\n`;
        }

        // Add performance trend indicators
        contextText += 'PERFORMANCE TREND ANALYSIS:\n';
        const recentEntries = historicalSummaries.slice(0, Math.min(8, historicalSummaries.length));

        // Calculate trend direction for key metrics
        const fitnessTrend = calculateTrendDirection(recentEntries.map(e => e.data.bestFitness));
        const populationTrend = calculateTrendDirection(recentEntries.map(e => e.data.population));
        const diversityTrend = calculateTrendDirection(recentEntries.map(e => e.data.geneIdCount));

        contextText += `• Fitness Trend: ${fitnessTrend}\n`;
        contextText += `• Population Trend: ${populationTrend}\n`;
        contextText += `• Diversity Trend: ${diversityTrend}\n\n`;

        // Add detailed timeline for context
        contextText += 'RECENT TIMELINE (last 8 data points):\n';
        recentEntries.forEach((entry, index) => {
            const timeAgo = index === 0 ? 'NOW' : `${index * 0.5}min ago`;
            const fitnessChange = index === 0 ? '' : ` (${entry.data.fitnessDelta >= 0 ? '+' : ''}${entry.data.fitnessDelta.toFixed(0)})`;
            contextText += `${timeAgo}: Gen ${entry.data.generation}, Best ${entry.data.bestFitness.toFixed(0)}${fitnessChange}, Pop ${entry.data.population}, Div ${entry.data.geneIdCount}\n`;
        });
    }

    return contextText.trim();
}

// Helper function to calculate trend direction
function calculateTrendDirection(values) {
    if (values.length < 3) return 'insufficient data';

    const recent = values.slice(0, Math.min(3, values.length));
    const older = values.slice(3, Math.min(6, values.length));

    if (older.length === 0) return 'insufficient data';

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

    const change = recentAvg - olderAvg;
    const percentChange = Math.abs(change / olderAvg) * 100;

    if (percentChange < 2) return 'stable';
    return change > 0 ? `improving (+${percentChange.toFixed(1)}%)` : `declining (-${percentChange.toFixed(1)}%)`;
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

    const autoAdjustCheckbox = document.getElementById('autoAdjust');
    autoAdjustCheckbox.checked = simulation.autoAdjustEnabled;
    autoAdjustCheckbox.addEventListener('change', e => {
        simulation.autoAdjustEnabled = e.target.checked;
        simulation.logger.log('Auto-adjust:', simulation.autoAdjustEnabled ? 'enabled' : 'disabled');
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
        simulation.toast.show('🗑️', 'Gene Pool Cleared', 'All saved genes have been removed. Reloading...', 'toast-warning', 3000);
        setTimeout(() => location.reload(), 1000); // Brief delay to show toast before reload
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

export function updateDashboard(simulation) {
    // Only count living agents for dashboard stats
    const livingAgents = simulation.agents.filter(a => !a.isDead);
    if (livingAgents.length === 0) return;

    // Calculate metrics
    const bestFitness = safeNumber(simulation.bestAgent ? simulation.bestAgent.fitness : 0, 0);
    const geneIdCount = new Set(livingAgents.map(a => a.geneId)).size;
    const genePoolHealth = simulation.db.getGenePoolHealth();
    const genePoolCount = genePoolHealth.genePoolCount;


    // Average stats
    const avgFitness = averageMetric(livingAgents, a => a.fitness);
    const avgAge = averageMetric(livingAgents, a => a.age); // Real seconds accounting for game speed
    const avgEnergy = averageMetric(livingAgents, a => a.energy);
    const avgOffspring = averageMetric(livingAgents, a => a.offspring || 0);
    const avgOffspringMate = averageMetric(livingAgents, a => a.childrenFromMate || 0);
    const avgOffspringSplit = averageMetric(livingAgents, a => a.childrenFromSplit || 0);
    const avgFood = averageMetric(livingAgents, a => a.foodEaten || 0);
    const avgKills = averageMetric(livingAgents, a => a.kills || 0);
    const avgCollisions = averageMetric(livingAgents, a => a.collisions || 0);
    const avgWallHits = averageMetric(livingAgents, a => a.timesHitObstacle || 0);

    // NEW: Critical lifespan metrics (TIME-BASED)
    const MATURATION_SECONDS = 10; // Updated to 10 seconds to match new MATURATION_AGE_FRAMES (600 frames)
    const matureAgents = livingAgents.filter(a => a.age >= MATURATION_SECONDS).length;
    const maturationRate = (matureAgents / livingAgents.length) * 100;
    const maxAge = safeNumber(Math.max(...livingAgents.map(a => safeNumber(a.age, 0))), 0); // Real seconds accounting for game speed
    const maxFrames = safeNumber(Math.max(...livingAgents.map(a => safeNumber(a.framesAlive, 0))), 0);

    // NEW: Reproduction metrics
    const totalSexualOffspring = livingAgents.reduce((sum, a) => sum + safeNumber(a.childrenFromMate || 0, 0), 0);
    const totalAsexualOffspring = livingAgents.reduce((sum, a) => sum + safeNumber(a.childrenFromSplit || 0, 0), 0);

    // Calculate reproduction rate (events per minute)
    // Store previous offspring count and calculate delta
    if (!simulation.previousOffspringCount) simulation.previousOffspringCount = 0;
    if (!simulation.lastReproductionCheck) simulation.lastReproductionCheck = Date.now();

    const currentOffspringCount = totalSexualOffspring + totalAsexualOffspring;
    const offspringDelta = currentOffspringCount - simulation.previousOffspringCount;
    const timeDelta = (Date.now() - simulation.lastReproductionCheck) / 1000 / 60; // in minutes
    const reproductionRateValue = safeNumber(timeDelta > 0 ? (offspringDelta / timeDelta) : 0, 0);

    // Update tracking variables every 10 seconds
    if (timeDelta >= 0.167) { // ~10 seconds
        simulation.previousOffspringCount = currentOffspringCount;
        simulation.lastReproductionCheck = Date.now();
    }

    // NEW: Collision-free percentage
    const collisionFreeAgents = livingAgents.filter(a => safeNumber(a.timesHitObstacle || 0, 0) === 0).length;
    const collisionFreePercent = safeNumber((collisionFreeAgents / livingAgents.length) * 100, 0);

    // Count qualified agents (same criteria as database saving: fitness >= 4000, food >= 6, age >= 20s)
    const qualifiedAgents = livingAgents.filter(a => a.fit).length;

    // Validation queue size
    const validationQueueSizeDashboard = simulation.validationManager && simulation.validationManager.validationQueue
        ? simulation.validationManager.validationQueue.size
        : 0;

    // Calculate qualification criteria breakdown
    const totalCells = EXPLORATION_GRID_WIDTH * EXPLORATION_GRID_HEIGHT;
    const agentsMeetingFitness = livingAgents.filter(a => safeNumber(a.fitness, 0) >= MIN_FITNESS_TO_SAVE_GENE_POOL).length;
    const agentsMeetingFood = livingAgents.filter(a => safeNumber(a.foodEaten || 0, 0) >= MIN_FOOD_EATEN_TO_SAVE_GENE_POOL).length;
    const agentsMeetingAge = livingAgents.filter(a => safeNumber(a.framesAlive || 0, 0) >= MIN_FRAMES_ALIVE_TO_SAVE_GENE_POOL).length;
    const agentsMeetingExploration = livingAgents.filter(a => {
        const explorationPercentage = ((a.exploredCells?.size || 0) / totalCells) * 100;
        return explorationPercentage >= MIN_EXPLORATION_PERCENTAGE_TO_SAVE_GENE_POOL;
    }).length;
    const agentsMeetingNavigation = livingAgents.filter(a => safeNumber(a.turnsTowardsFood || 0, 0) >= MIN_TURNS_TOWARDS_FOOD_TO_SAVE_GENE_POOL).length;
    
    // Calculate average exploration percentage and turns towards food
    const avgExplorationPercentage = livingAgents.reduce((sum, a) => {
        const explorationPercentage = ((a.exploredCells?.size || 0) / totalCells) * 100;
        return sum + explorationPercentage;
    }, 0) / livingAgents.length;
    const avgTurnsTowardsFood = averageMetric(livingAgents, a => a.turnsTowardsFood || 0);

    // Learning rate (fitness improvement per generation)
    let learningRate = 0;
    if (simulation.fitnessHistory.length >= 2) {
        const recent = simulation.fitnessHistory.slice(-5);
        const older = simulation.fitnessHistory.slice(-10, -5);
        if (older.length > 0) {
            const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
            const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
            learningRate = safeNumber((recentAvg - olderAvg) / older.length, 0);
        }
    }

    // Fitness delta
    let fitnessDelta = 0;
    if (simulation.fitnessHistory.length >= 2) {
        fitnessDelta = safeNumber(simulation.fitnessHistory[simulation.fitnessHistory.length - 1] - simulation.fitnessHistory[simulation.fitnessHistory.length - 2], 0);
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
    if (reproductionRateEl) reproductionRateEl.textContent = reproductionRateValue.toFixed(1);
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
    const mutationRatePercent = safeNumber(simulation.mutationRate, 0) * 100;

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
        validationQueueValueEl.textContent = validationQueueSizeDashboard;
        validationQueueValueEl.style.color = validationQueueSizeDashboard > 0 ? '#ff0' : '#888';
    }
    if (mutationRateValueEl) mutationRateValueEl.textContent = mutationRatePercent.toFixed(1) + '%';
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

    // Update DOM - QUALIFICATION CRITERIA
    const avgExplorationPctEl = document.getElementById('avg-exploration-pct');
    const avgTurnsToFoodEl = document.getElementById('avg-turns-to-food');
    const meetFitnessEl = document.getElementById('meet-fitness');
    const meetFoodEl = document.getElementById('meet-food');
    const meetAgeEl = document.getElementById('meet-age');
    const meetExplorationEl = document.getElementById('meet-exploration');
    const meetNavigationEl = document.getElementById('meet-navigation');

    if (avgExplorationPctEl) avgExplorationPctEl.textContent = avgExplorationPercentage.toFixed(1);
    if (avgTurnsToFoodEl) avgTurnsToFoodEl.textContent = avgTurnsTowardsFood.toFixed(1);
    if (meetFitnessEl) {
        meetFitnessEl.textContent = agentsMeetingFitness;
        meetFitnessEl.style.color = agentsMeetingFitness > 0 ? '#0f0' : '#f00';
    }
    if (meetFoodEl) {
        meetFoodEl.textContent = agentsMeetingFood;
        meetFoodEl.style.color = agentsMeetingFood > 0 ? '#0f0' : '#f00';
    }
    if (meetAgeEl) {
        meetAgeEl.textContent = agentsMeetingAge;
        meetAgeEl.style.color = agentsMeetingAge > 0 ? '#0f0' : '#f00';
    }
    if (meetExplorationEl) {
        meetExplorationEl.textContent = agentsMeetingExploration;
        meetExplorationEl.style.color = agentsMeetingExploration > 0 ? '#0f0' : '#f00';
    }
    if (meetNavigationEl) {
        meetNavigationEl.textContent = agentsMeetingNavigation;
        meetNavigationEl.style.color = agentsMeetingNavigation > 0 ? '#0f0' : '#f00';
    }
    // Update all total-agents-ref elements (they all show the same value)
    const totalAgentsRefs = document.querySelectorAll('.total-agents-ref');
    totalAgentsRefs.forEach(el => {
        el.textContent = livingAgents.length;
    });

    // Update fitness chart
    simulation.updateFitnessChart();
}
