// UI-related functions moved from game.js

import { updateMemoryStats, handleMemoryPressure } from './memory.js';
import { updateFoodScalingFactor } from './spawn.js';
import { copySimulationStats } from './stats.js';
import {
    GENE_POOL_MIN_FITNESS,
    MIN_FOOD_EATEN_TO_SAVE_GENE_POOL,
    MIN_FRAMES_ALIVE_TO_SAVE_GENE_POOL,
    MIN_SECONDS_ALIVE_TO_SAVE_GENE_POOL,
    MIN_EXPLORATION_PERCENTAGE_TO_SAVE_GENE_POOL,
    MIN_TURNS_TOWARDS_FOOD_TO_SAVE_GENE_POOL,
    EXPLORATION_GRID_WIDTH,
    EXPLORATION_GRID_HEIGHT,
    TARGET_AGE_SECONDS,
    FITNESS_MULTIPLIERS,
    FITNESS_PENALTIES,
    SURVIVAL_BONUSES,
    MIN_DISTANCE_FOR_MOVEMENT_REWARDS,
    TEMPERATURE_MAX,
    FPS_TARGET
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
let isAISummaryModeEnabled = false; // AI summary mode checkbox state

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
    // Only start summarization if AI summary mode is enabled
    if (!isAISummaryModeEnabled) {
        console.log('[SUMMARIZER] 🚫 AI Summary Mode not enabled - skipping summarization');
        return;
    }

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

    // Start summarization every 3 minutes (only when focused) - tripled from original 1 minute
    summaryInterval = setInterval(async () => {
        if (document.hasFocus()) {
            await generateAndDisplaySummary(simulation);
        }
    }, 180000); // 180 seconds (3 minutes)

    // Generate first summary immediately (only if not already scheduled and focused)
    if (!initialSummaryScheduled && document.hasFocus()) {
        initialSummaryScheduled = true;
        setTimeout(() => {
            generateAndDisplaySummary(simulation);
            initialSummaryScheduled = false; // Reset after summary is generated
        }, 1000);
    }
}

// Pause/resume summarization based on window focus
function handleWindowFocusChange(simulation) {
    if (!isFullscreenMode) return; // Only handle focus changes in fullscreen mode

    if (document.hasFocus()) {
        console.log('[SUMMARIZER] 👁️ Window regained focus - resuming summarization');
        // Restart summarization if we have a summarizer but no active interval
        if (summarizer && !summaryInterval) {
            summaryInterval = setInterval(async () => {
                if (document.hasFocus()) {
                    await generateAndDisplaySummary(simulation);
                }
            }, 60000); // 60 seconds
        }
    } else {
        console.log('[SUMMARIZER] 💤 Window lost focus - pausing summarization');
        // Clear the interval to stop summarization
        if (summaryInterval) {
            clearInterval(summaryInterval);
            summaryInterval = null;
        }
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
    if (!summarizer || !isFullscreenMode || !isAISummaryModeEnabled) {
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
        // OPTIMIZED: Use for loop instead of forEach
        const recentEntriesLen = recentEntries.length;
        for (let index = 0; index < recentEntriesLen; index++) {
            const entry = recentEntries[index];
            const timeAgo = index === 0 ? 'NOW' : `${index * 0.5}min ago`;
            const fitnessChange = index === 0 ? '' : ` (${entry.data.fitnessDelta >= 0 ? '+' : ''}${entry.data.fitnessDelta.toFixed(0)})`;
            contextText += `${timeAgo}: Gen ${entry.data.generation}, Best ${entry.data.bestFitness.toFixed(0)}${fitnessChange}, Pop ${entry.data.population}, Div ${entry.data.geneIdCount}\n`;
        }
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

    const aiSummaryModeCheckbox = document.getElementById('aiSummaryMode');
    aiSummaryModeCheckbox.checked = isAISummaryModeEnabled;
    aiSummaryModeCheckbox.addEventListener('change', e => {
        isAISummaryModeEnabled = e.target.checked;
        simulation.logger.log('AI Summary Mode:', isAISummaryModeEnabled ? 'enabled' : 'disabled');
        // If enabling, try to initialize summarizer
        if (isAISummaryModeEnabled) {
            initializeSummarizerForSimulation(simulation);
        } else {
            // Disable summarization when unchecked
            stopPeriodicSummarization();
        }
    });

    // Toggle render button
    const toggleRenderBtn = document.getElementById('toggle-render-btn');
    if (toggleRenderBtn) {
        // Ensure renderingEnabled property exists
        if (typeof simulation.renderingEnabled === 'undefined') {
            simulation.renderingEnabled = true;
            console.warn('[UI] renderingEnabled was undefined, initializing to true');
        }

        // Update button state based on current rendering state
        const updateButtonState = () => {
            if (simulation.renderingEnabled) {
                toggleRenderBtn.textContent = '⏸️';
                toggleRenderBtn.classList.remove('rendering-disabled');
                toggleRenderBtn.title = 'Pause Rendering';
            } else {
                toggleRenderBtn.textContent = '▶️';
                toggleRenderBtn.classList.add('rendering-disabled');
                toggleRenderBtn.title = 'Resume Rendering';
            }
        };

        // Initialize button state
        updateButtonState();

        // Remove any existing listener by checking for a stored handler
        if (toggleRenderBtn._renderToggleHandler) {
            toggleRenderBtn.removeEventListener('click', toggleRenderBtn._renderToggleHandler);
        }

        // Create and store the handler function
        toggleRenderBtn._renderToggleHandler = function (e) {
            e.preventDefault();
            e.stopPropagation();
            try {
                if (typeof simulation.toggleRendering === 'function') {
                    const isEnabled = simulation.toggleRendering();
                    updateButtonState();
                    simulation.logger.log(`[UI] Rendering toggled: ${isEnabled ? 'enabled' : 'disabled'}`);
                } else {
                    console.error('[UI] simulation.toggleRendering is not a function');
                    simulation.logger.error('[UI] simulation.toggleRendering is not a function');
                }
            } catch (error) {
                console.error('[UI] Error toggling rendering:', error);
                simulation.logger.error('[UI] Error toggling rendering:', error);
            }
        };

        // Add the event listener
        toggleRenderBtn.addEventListener('click', toggleRenderBtn._renderToggleHandler, { capture: false, passive: false });
    } else {
        console.warn('[UI] Toggle render button not found in DOM');
        simulation.logger.warn('[UI] Toggle render button not found in DOM');
    }

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

    // OPTIMIZED: Debounce resize events for better performance
    let resizeTimeout = null;
    window.addEventListener('resize', () => {
        if (resizeTimeout) clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            resize(simulation);
            resizeTimeout = null;
        }, 100); // 100ms debounce
    });

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

        // Start/stop summarization based on fullscreen state and AI summary mode
        if (isFullscreen && isAISummaryModeEnabled) {
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

        // OPTIMIZED: Use for loop instead of forEach
        const elementsLen = elements.length;
        for (let i = 0; i < elementsLen; i++) {
            const el = elements[i];
            if (el) el.classList.add('fullscreen-hidden');
        }

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

        // OPTIMIZED: Use for loop instead of forEach
        const elementsLen = elements.length;
        for (let i = 0; i < elementsLen; i++) {
            const el = elements[i];
            if (el) el.classList.remove('fullscreen-hidden');
        }

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

    // Handle window focus changes to pause/resume AI summarization
    window.addEventListener('focus', () => handleWindowFocusChange(simulation));
    window.addEventListener('blur', () => handleWindowFocusChange(simulation));

    // Genetic Diversity Modal
    const geneticDiversitySection = document.getElementById('genetic-diversity-section');
    if (geneticDiversitySection) {
        geneticDiversitySection.addEventListener('click', () => {
            showGeneticDiversityModal(simulation);
        });
        geneticDiversitySection.style.cursor = 'pointer';
        geneticDiversitySection.title = 'Click to view gene pool details';
    }

    // Survival & Performance Modal
    const survivalPerformanceSection = document.querySelector('.metric-card.critical');
    if (survivalPerformanceSection) {
        survivalPerformanceSection.addEventListener('click', () => {
            showSurvivalPerformanceModal(simulation);
        });
        survivalPerformanceSection.style.cursor = 'pointer';
        survivalPerformanceSection.title = 'Click to view detailed survival and performance metrics';
    }

    // Reproduction Status Modal
    const reproductionSection = document.querySelector('.metric-card.reproduction');
    if (reproductionSection) {
        reproductionSection.addEventListener('click', () => {
            showReproductionModal(simulation);
        });
        reproductionSection.style.cursor = 'pointer';
        reproductionSection.title = 'Click to view detailed reproduction statistics';
    }

    // Qualification Criteria Modal
    const qualificationSection = document.querySelector('.metric-card.qualification');
    if (qualificationSection) {
        qualificationSection.addEventListener('click', () => {
            showQualificationModal(simulation);
        });
        qualificationSection.style.cursor = 'pointer';
        qualificationSection.title = 'Click to view detailed qualification criteria breakdown';
    }

    // Agent Modal Close Button
    const closeAgentModalBtn = document.getElementById('close-agent-modal');
    if (closeAgentModalBtn) {
        closeAgentModalBtn.addEventListener('click', () => {
            closeAgentModal();
        });
    }

    // Agent Modal Save Button
    const saveAgentBtn = document.getElementById('save-agent-btn');
    if (saveAgentBtn) {
        saveAgentBtn.addEventListener('click', async () => {
            if (selectedAgent && simulation) {
                try {
                    // Skip validation and save directly to gene pool
                    await simulation.db.queueSaveAgent(selectedAgent);
                    toast.show('💾 Agent Saved', `Agent #${selectedAgent.id} saved directly to gene pool`, 'toast-success', 3000);
                    simulation.logger.info(`[UI] Agent ${selectedAgent.id} saved directly to gene pool (skipped validation)`);
                } catch (error) {
                    simulation.logger.error('[UI] Failed to save agent:', error);
                    toast.show('❌ Save Failed', 'Failed to save agent to gene pool', 'toast-error', 3000);
                }
            }
        });
    }

    window.addEventListener('beforeunload', async () => {
        // Release wake lock and flush dead agent queue
        await simulation.releaseWakeLock();
        simulation.processDeadAgentQueue();
        await simulation.db.flush();
    });
}


// --- Agent Details Modal ---
let agentModalUpdateInterval = null;
let selectedAgent = null;

export function openAgentModal(agent, simulation) {
    if (!agent) return;

    selectedAgent = agent;
    const sidebar = document.getElementById('agent-sidebar');
    if (sidebar) {
        sidebar.classList.remove('collapsed');
        updateAgentModal(agent, simulation);

        // Start update loop
        if (agentModalUpdateInterval) clearInterval(agentModalUpdateInterval);
        agentModalUpdateInterval = setInterval(() => {
            if (agent.isDead) {
                closeAgentModal();
            } else {
                updateAgentModal(agent, simulation);
                // Update NN visualization in real-time to show current activity
                renderNN(agent);
            }
        }, 100); // Update 10 times per second

        // Initial NN render
        renderNN(agent);
    }
}

export function closeAgentModal() {
    const sidebar = document.getElementById('agent-sidebar');
    if (sidebar) {
        sidebar.classList.add('collapsed');
    }
    if (agentModalUpdateInterval) {
        clearInterval(agentModalUpdateInterval);
        agentModalUpdateInterval = null;
    }
    selectedAgent = null;
}

function updateAgentModal(agent, simulation) {
    // Ensure fitness is up to date for accurate display
    if (agent && typeof agent.calculateFitness === 'function') {
        agent.calculateFitness();
    }

    const idEl = document.getElementById('modal-agent-id');
    if (idEl) idEl.textContent = `Agent #${agent.id || '?'}`;

    const typeEl = document.getElementById('modal-agent-type');
    if (typeEl) {
        typeEl.textContent = agent.specializationType || 'FORAGER';
        // Set color based on type
        const colors = {
            'FORAGER': 'var(--neon-green)',
            'PREDATOR': 'var(--neon-red)',
            'REPRODUCER': 'var(--neon-magenta)',
            'SCOUT': 'var(--neon-cyan)',
            'DEFENDER': 'var(--neon-yellow)'
        };
        typeEl.style.color = colors[agent.specializationType] || 'white';
        typeEl.style.borderColor = colors[agent.specializationType] || 'white';
    }

    // Update save button state based on agent eligibility
    const saveBtn = document.getElementById('save-agent-btn');
    if (saveBtn) {
        const canSave = agent.fit && !simulation.db.pool[agent.geneId];
        saveBtn.disabled = !canSave;
        saveBtn.title = canSave ?
            'Skip validation and save directly to gene pool' :
            agent.fit ?
                'Agent already exists in gene pool' :
                'Agent does not meet qualification criteria';
        saveBtn.style.opacity = canSave ? '1' : '0.5';
    }

    const genEl = document.getElementById('modal-agent-gen');
    if (genEl) genEl.textContent = agent.generation || 0;

    // Stats
    const energyVal = document.getElementById('modal-energy-val');
    const energyBar = document.getElementById('modal-energy-bar');
    if (energyVal) energyVal.textContent = agent.energy.toFixed(0);
    if (energyBar) energyBar.style.width = `${Math.min(100, (agent.energy / agent.maxEnergy) * 100)}%`;

    const healthVal = document.getElementById('modal-health-val');
    const healthBar = document.getElementById('modal-health-bar');
    // Using energy as health proxy for now
    if (healthVal) healthVal.textContent = `${((agent.energy / agent.maxEnergy) * 100).toFixed(0)}%`;
    if (healthBar) healthBar.style.width = `${Math.min(100, (agent.energy / agent.maxEnergy) * 100)}%`;

    const ageVal = document.getElementById('modal-age-val');
    if (ageVal) ageVal.textContent = `${agent.age.toFixed(1)}s`;

    const fitnessVal = document.getElementById('modal-fitness-val');
    if (fitnessVal) fitnessVal.textContent = agent.fitness.toFixed(0);

    const foodVal = document.getElementById('modal-food-val');
    if (foodVal) foodVal.textContent = (agent.foodEaten || 0).toFixed(0);

    const offspringVal = document.getElementById('modal-offspring-val');
    if (offspringVal) offspringVal.textContent = ((agent.childrenFromMate || 0) + (agent.childrenFromSplit || 0)).toFixed(0);

    const tempVal = document.getElementById('modal-temp-val');
    if (tempVal) {
        const avgTemp = agent.temperatureSamples > 0 ? agent.temperatureSum / agent.temperatureSamples : 0;
        tempVal.textContent = `${agent.temperature.toFixed(1)}°C (avg: ${avgTemp.toFixed(1)}°C)`;
    }

    const killsVal = document.getElementById('modal-kills-val');
    if (killsVal) killsVal.textContent = (agent.kills || 0).toFixed(0);

    // Fitness metrics
    const explorationVal = document.getElementById('modal-exploration-val');
    if (explorationVal) {
        const totalCells = EXPLORATION_GRID_WIDTH * EXPLORATION_GRID_HEIGHT;
        const exploredCells = agent.exploredCells?.size || 0;
        const explorationPct = (exploredCells / totalCells) * 100;
        explorationVal.textContent = `${explorationPct.toFixed(1)}%`;
    }

    // Calculate fitness components exactly as in calculateFitness()
    const safeNum = (val, defaultVal = 0) => {
        if (typeof val !== 'number' || !isFinite(val)) return defaultVal;
        return val;
    };

    const distanceTravelled = safeNum(agent.distanceTravelled || 0, 0);
    const ageInSeconds = safeNum(agent.age || 0, 0);
    const energySpent = safeNum(agent.energySpent || 0, 0);

    // Calculate normalized values (matching fitness calculation)
    let turnsTowardsFoodNormalized = 0;
    let turnsAwayFromObstaclesNormalized = 0;
    let foodApproachesNormalized = 0;
    let directionChangedNormalized = 0;
    let speedChangedNormalized = 0;

    if (distanceTravelled > MIN_DISTANCE_FOR_MOVEMENT_REWARDS) {
        const distanceNormalizer = distanceTravelled / 100;
        turnsTowardsFoodNormalized = safeNum(agent.turnsTowardsFood || 0, 0) / Math.max(distanceNormalizer, 1);
        turnsAwayFromObstaclesNormalized = safeNum(agent.turnsAwayFromObstacles || 0, 0) / Math.max(distanceNormalizer, 1);
        foodApproachesNormalized = safeNum(agent.foodApproaches || 0, 0) / Math.max(distanceNormalizer, 1);
        directionChangedNormalized = Math.min(safeNum(agent.directionChanged || 0, 0), 500) / Math.max(distanceNormalizer, 1);
        speedChangedNormalized = Math.min(safeNum(agent.speedChanged || 0, 0), 200) / Math.max(distanceNormalizer, 1);
    }

    // Temperature bonus/penalty (matching fitness calculation)
    const avgTemperature = agent.temperatureSamples > 0 ? safeNum(agent.temperatureSum / agent.temperatureSamples, 0) : 0;
    let temperatureBonus = 0;
    let temperaturePenalty = 0;
    if (avgTemperature < 1) {
        temperaturePenalty = (1 - avgTemperature) * FITNESS_MULTIPLIERS.TEMPERATURE_PENALTY_MAX;
    } else {
        temperatureBonus = (avgTemperature / TEMPERATURE_MAX) * FITNESS_MULTIPLIERS.TEMPERATURE_BONUS_MAX;
    }

    // Calculate base score components (matching fitness calculation)
    let baseScore = 0;
    baseScore += temperatureBonus - temperaturePenalty;
    baseScore += safeNum(agent.offspring || 0, 0) * FITNESS_MULTIPLIERS.OFFSPRING;
    baseScore += safeNum(agent.cleverTurns || 0, 0) * FITNESS_MULTIPLIERS.CLEVER_TURNS;
    baseScore += safeNum(agent.goalMemory?.goalsCompleted || 0, 0) * FITNESS_MULTIPLIERS.GOALS_COMPLETED;
    baseScore += safeNum(agent.reproductionAttempts || 0, 0) * FITNESS_MULTIPLIERS.REPRODUCTION_ATTEMPT;

    if (distanceTravelled > MIN_DISTANCE_FOR_MOVEMENT_REWARDS) {
        baseScore += directionChangedNormalized * FITNESS_MULTIPLIERS.DIRECTION_CHANGES;
        baseScore += speedChangedNormalized * FITNESS_MULTIPLIERS.SPEED_CHANGES;
    } else {
        const movementPenalty = (MIN_DISTANCE_FOR_MOVEMENT_REWARDS - distanceTravelled) / 10;
        baseScore -= Math.min(movementPenalty, FITNESS_PENALTIES.MINIMAL_MOVEMENT);
    }

    const explorationPct = (agent.exploredCells?.size || 0) / (EXPLORATION_GRID_WIDTH * EXPLORATION_GRID_HEIGHT) * 100;
    baseScore += safeNum(explorationPct, 0) * FITNESS_MULTIPLIERS.EXPLORATION;
    baseScore += safeNum(agent.foodEaten || 0, 0) * FITNESS_MULTIPLIERS.FOOD_EATEN;
    baseScore += safeNum(agent.kills || 0, 0) * FITNESS_MULTIPLIERS.KILLS;

    if (distanceTravelled > MIN_DISTANCE_FOR_MOVEMENT_REWARDS) {
        baseScore += turnsTowardsFoodNormalized * FITNESS_MULTIPLIERS.TURNS_TOWARDS_FOOD;
        baseScore += turnsAwayFromObstaclesNormalized * FITNESS_MULTIPLIERS.TURNS_AWAY_FROM_OBSTACLES;
        baseScore += foodApproachesNormalized * FITNESS_MULTIPLIERS.FOOD_APPROACHES;
    }

    // Synergy bonus
    const offspring = safeNum(agent.offspring || 0, 0);
    const foodEaten = safeNum(agent.foodEaten || 0, 0);
    let synergyBonus = 0;
    if (offspring > 0 && foodEaten > 0) {
        synergyBonus = (offspring * 2 + foodEaten) * FITNESS_MULTIPLIERS.REPRODUCTION_FOOD_SYNERGY;
        baseScore += synergyBonus;
    }

    // Efficiency
    let efficiency = 0;
    if (energySpent > 0) {
        efficiency = Math.min(distanceTravelled / Math.max(energySpent, 1), 10.0);
        baseScore += efficiency * FITNESS_MULTIPLIERS.EFFICIENCY;
    }

    // Successful escapes
    baseScore += safeNum(agent.successfulEscapes || 0, 0) * FITNESS_MULTIPLIERS.SUCCESSFUL_ESCAPES;

    // Penalties
    const consecutiveTurns = safeNum(agent.consecutiveTurns || 0, 0);
    const cappedTurns = Math.min(consecutiveTurns, 50);
    const circlePenalty = Math.min(cappedTurns * FITNESS_PENALTIES.CIRCULAR_MOVEMENT, 2000);
    baseScore -= circlePenalty;

    const timesHitObstacle = safeNum(agent.timesHitObstacle || 0, 0);
    const collisions = safeNum(agent.collisions || 0, 0);
    const wallHits = collisions - timesHitObstacle;
    baseScore -= timesHitObstacle * FITNESS_PENALTIES.OBSTACLE_HIT;
    baseScore -= wallHits * FITNESS_PENALTIES.WALL_HIT;

    // Obstacle-free frames
    const ageInFrames = ageInSeconds * FPS_TARGET;
    const obstacleFreeFrames = Math.max(0, ageInFrames - (timesHitObstacle * 30));
    let obstacleFreeFramesBonus = 0;
    if (obstacleFreeFrames > 200) {
        obstacleFreeFramesBonus = (obstacleFreeFrames / 200) * 25;
        baseScore += obstacleFreeFramesBonus;
    }

    // Inactivity penalty
    let inactivityPenalty = 0;
    if (ageInSeconds > 20 && baseScore < 50) {
        const inactivityDuration = Math.max(0, ageInSeconds - 20);
        inactivityPenalty = inactivityDuration * FITNESS_PENALTIES.INACTIVITY;
    }

    const adjustedBaseScore = Math.max(0, baseScore - inactivityPenalty);

    // Survival bonuses
    const survivalBonus = ageInSeconds > SURVIVAL_BONUSES.EXTENDED_THRESHOLD ?
        Math.min((ageInSeconds - SURVIVAL_BONUSES.EXTENDED_THRESHOLD) * SURVIVAL_BONUSES.BASE_MULTIPLIER, SURVIVAL_BONUSES.BASE_CAP) : 0;
    const rawSurvivalBonus = ageInSeconds > SURVIVAL_BONUSES.EXTENDED_THRESHOLD ?
        (ageInSeconds - SURVIVAL_BONUSES.EXTENDED_THRESHOLD) / SURVIVAL_BONUSES.EXTENDED_DIVISOR : 0;

    // Update display values - show both raw and normalized where applicable
    const turnsFoodVal = document.getElementById('modal-turns-food-val');
    if (turnsFoodVal) {
        const raw = safeNum(agent.turnsTowardsFood || 0, 0);
        turnsFoodVal.textContent = `${raw.toFixed(1)} (norm: ${turnsTowardsFoodNormalized.toFixed(2)})`;
    }

    const cleverTurnsVal = document.getElementById('modal-clever-turns-val');
    if (cleverTurnsVal) cleverTurnsVal.textContent = (agent.cleverTurns || 0).toFixed(1);

    const directionChangesVal = document.getElementById('modal-direction-changes-val');
    if (directionChangesVal) {
        const raw = Math.min(safeNum(agent.directionChanged || 0, 0), 500);
        directionChangesVal.textContent = `${raw.toFixed(1)} (norm: ${directionChangedNormalized.toFixed(2)})`;
    }

    const speedChangesVal = document.getElementById('modal-speed-changes-val');
    if (speedChangesVal) {
        const raw = Math.min(safeNum(agent.speedChanged || 0, 0), 200);
        speedChangesVal.textContent = `${raw.toFixed(1)} (norm: ${speedChangedNormalized.toFixed(2)})`;
    }

    const turnsObstaclesVal = document.getElementById('modal-turns-obstacles-val');
    if (turnsObstaclesVal) {
        const raw = safeNum(agent.turnsAwayFromObstacles || 0, 0);
        turnsObstaclesVal.textContent = `${raw.toFixed(1)} (norm: ${turnsAwayFromObstaclesNormalized.toFixed(2)})`;
    }

    const foodApproachesVal = document.getElementById('modal-food-approaches-val');
    if (foodApproachesVal) {
        const raw = safeNum(agent.foodApproaches || 0, 0);
        foodApproachesVal.textContent = `${raw.toFixed(1)} (norm: ${foodApproachesNormalized.toFixed(2)})`;
    }

    const efficiencyVal = document.getElementById('modal-efficiency-val');
    if (efficiencyVal) {
        efficiencyVal.textContent = efficiency.toFixed(2);
    }

    const obstacleHitsVal = document.getElementById('modal-obstacle-hits-val');
    if (obstacleHitsVal) obstacleHitsVal.textContent = timesHitObstacle.toFixed(0);

    const collisionsVal = document.getElementById('modal-collisions-val');
    if (collisionsVal) collisionsVal.textContent = collisions.toFixed(0);

    // Add new metrics that are missing
    const wallHitsVal = document.getElementById('modal-wall-hits-val');
    if (wallHitsVal) wallHitsVal.textContent = wallHits.toFixed(0);

    const survivalBonusVal = document.getElementById('modal-survival-bonus-val');
    if (survivalBonusVal) survivalBonusVal.textContent = survivalBonus.toFixed(0);

    const baseScoreVal = document.getElementById('modal-base-score-val');
    if (baseScoreVal) baseScoreVal.textContent = baseScore.toFixed(1);

    const adjustedBaseScoreVal = document.getElementById('modal-adjusted-base-score-val');
    if (adjustedBaseScoreVal) adjustedBaseScoreVal.textContent = adjustedBaseScore.toFixed(1);

    const temperatureBonusVal = document.getElementById('modal-temperature-bonus-val');
    if (temperatureBonusVal) {
        const tempValue = temperatureBonus > 0 ? `+${temperatureBonus.toFixed(1)}` : `-${temperaturePenalty.toFixed(1)}`;
        temperatureBonusVal.textContent = tempValue;
    }

    const goalsCompletedVal = document.getElementById('modal-goals-completed-val');
    if (goalsCompletedVal) goalsCompletedVal.textContent = (agent.goalMemory?.goalsCompleted || 0).toFixed(0);

    const reproductionAttemptsVal = document.getElementById('modal-reproduction-attempts-val');
    if (reproductionAttemptsVal) reproductionAttemptsVal.textContent = (agent.reproductionAttempts || 0).toFixed(0);

    const synergyBonusVal = document.getElementById('modal-synergy-bonus-val');
    if (synergyBonusVal) synergyBonusVal.textContent = synergyBonus > 0 ? `+${synergyBonus.toFixed(1)}` : '0';

    const successfulEscapesVal = document.getElementById('modal-successful-escapes-val');
    if (successfulEscapesVal) successfulEscapesVal.textContent = (agent.successfulEscapes || 0).toFixed(0);

    const obstacleFreeFramesVal = document.getElementById('modal-obstacle-free-frames-val');
    if (obstacleFreeFramesVal) {
        obstacleFreeFramesVal.textContent = `${obstacleFreeFrames.toFixed(0)} (bonus: +${obstacleFreeFramesBonus.toFixed(1)})`;
    }

    const inactivityPenaltyVal = document.getElementById('modal-inactivity-penalty-val');
    if (inactivityPenaltyVal) inactivityPenaltyVal.textContent = inactivityPenalty > 0 ? `-${inactivityPenalty.toFixed(1)}` : '0';

    const rawSurvivalBonusVal = document.getElementById('modal-raw-survival-bonus-val');
    if (rawSurvivalBonusVal) rawSurvivalBonusVal.textContent = rawSurvivalBonus.toFixed(1);

    const distanceTravelledVal = document.getElementById('modal-distance-travelled-val');
    if (distanceTravelledVal) distanceTravelledVal.textContent = distanceTravelled.toFixed(1);

    const energySpentVal = document.getElementById('modal-energy-spent-val');
    if (energySpentVal) energySpentVal.textContent = energySpent.toFixed(1);

    // Remove old survival multiplier (no longer used)
    const survivalMultiVal = document.getElementById('modal-survival-multi-val');
    if (survivalMultiVal) {
        survivalMultiVal.textContent = 'N/A';
        survivalMultiVal.title = 'Survival multiplier system replaced with bonus system';
    }

    const circlePenaltyVal = document.getElementById('modal-circle-penalty-val');
    if (circlePenaltyVal) {
        circlePenaltyVal.textContent = `-${circlePenalty.toFixed(0)}`;
    }
}

function renderNN(agent) {
    const canvas = document.getElementById('nn-viz-canvas');
    if (!canvas || !agent.nn) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Neural network visualization with real-time activity
    const hiddenSize = agent.hiddenSize || 20;
    const outputSize = agent.outputSize || 5;
    const weights2 = agent.nn.weights2; // Hidden -> Output

    if (!weights2) return;

    const nodeRadius = 4;
    const hiddenX = 60;
    const outputX = w - 80;

    const hiddenSpacing = (h - 40) / Math.max(hiddenSize, 1);
    const outputSpacing = (h - 40) / Math.max(outputSize, 1);
    const outputCenterOffset = (h - (outputSize * outputSpacing)) / 2;
    const hiddenCenterOffset = (h - (hiddenSize * hiddenSpacing)) / 2;

    // Get current outputs for activity visualization
    // Neural network outputs are sigmoid-activated (0-1 range)
    // Convert to activation levels where 0.5 = neutral, 0.0/1.0 = max activation
    const rawOutputs = agent.lastOutput || new Array(outputSize).fill(0.5);
    const currentOutputs = rawOutputs.map(output => Math.abs(output - 0.5) * 2); // Convert to 0-1 activation scale

    const currentTime = Date.now() * 0.005; // For subtle pulsing animation

    // Draw connections with activity highlighting
    for (let i = 0; i < hiddenSize; i++) {
        const hy = hiddenCenterOffset + i * hiddenSpacing + 20;
        for (let j = 0; j < outputSize; j++) {
            const oy = outputCenterOffset + j * outputSpacing + 20;

            const weight = weights2[i][j];
            const outputActivation = Math.abs(currentOutputs[j] || 0);

            // Base connection color based on weight
            const baseOpacity = Math.min(1, Math.abs(weight));
            const baseColor = weight > 0 ? [0, 255, 0] : [255, 0, 0];

            // Activity boost - make connections brighter when output is active
            const activityBoost = outputActivation * 0.5;
            const finalOpacity = Math.min(1, baseOpacity + activityBoost);

            // Subtle pulsing for active connections
            const pulse = outputActivation > 0.1 ? Math.sin(currentTime + j) * 0.2 + 0.8 : 1;
            const finalColor = `rgba(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]}, ${finalOpacity * pulse})`;

            ctx.strokeStyle = finalColor;
            ctx.lineWidth = Math.abs(weight) * 2 + (outputActivation * 2); // Thicker when active
            ctx.beginPath();
            ctx.moveTo(hiddenX, hy);
            ctx.lineTo(outputX, oy);
            ctx.stroke();
        }
    }

    // Draw Hidden nodes
    ctx.fillStyle = '#aaa';
    for (let i = 0; i < hiddenSize; i++) {
        const hy = hiddenCenterOffset + i * hiddenSpacing + 20;
        ctx.beginPath();
        ctx.arc(hiddenX, hy, nodeRadius, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.font = '12px Orbitron';
    ctx.textAlign = 'center';
    ctx.fillText("Hidden Layer", hiddenX, 15);

    // Draw Output nodes and labels with activity indication
    const outputs = ['Thrust', 'Rotate', 'Sprint', 'Mate', 'Attack'];
    ctx.textAlign = 'left';
    for (let i = 0; i < outputSize; i++) {
        const oy = outputCenterOffset + i * outputSpacing + 20;
        const outputActivation = Math.abs(currentOutputs[i] || 0);

        // Dynamic node color based on activation
        let nodeColor = '#fff'; // Default white
        let nodeRadiusDynamic = nodeRadius;

        if (outputActivation > 0.7) {
            // High activation - bright green with pulsing
            const pulse = Math.sin(currentTime * 3 + i) * 0.3 + 0.7;
            nodeColor = `rgba(0, 255, 0, ${pulse})`;
            nodeRadiusDynamic = nodeRadius * 1.5;
        } else if (outputActivation > 0.3) {
            // Medium activation - dim green
            nodeColor = `rgba(0, 255, 0, ${0.6 + outputActivation * 0.4})`;
            nodeRadiusDynamic = nodeRadius * 1.2;
        } else if (outputActivation > 0.1) {
            // Low activation - very dim green
            nodeColor = `rgba(0, 255, 0, ${0.3})`;
        }

        // Draw node with activity indication
        ctx.fillStyle = nodeColor;
        ctx.beginPath();
        ctx.arc(outputX, oy, nodeRadiusDynamic, 0, Math.PI * 2);
        ctx.fill();

        // Add subtle glow for highly active outputs
        if (outputActivation > 0.7) {
            ctx.strokeStyle = `rgba(0, 255, 0, ${0.5 + Math.sin(currentTime * 4 + i) * 0.3})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Label with activation strength
        ctx.fillStyle = outputActivation > 0.3 ? '#0f0' : '#fff';
        ctx.font = '11px Inter';

        // Show activation level descriptively
        let activationText = outputs[i];
        if (outputActivation > 0.7) {
            activationText += ' (HIGH)';
        } else if (outputActivation > 0.4) {
            activationText += ' (MED)';
        } else if (outputActivation > 0.1) {
            activationText += ' (LOW)';
        }

        ctx.fillText(activationText, outputX + 10, oy + 4);
    }

    // Status indicator
    ctx.fillStyle = '#fff';
    ctx.font = '12px Orbitron';
    ctx.textAlign = 'center';
    ctx.fillText("Outputs", outputX, 15);

    // Add activity summary at bottom
    const highActivity = currentOutputs.filter(o => o > 0.7).length;
    const medActivity = currentOutputs.filter(o => o > 0.4 && o <= 0.7).length;
    const lowActivity = currentOutputs.filter(o => o > 0.1 && o <= 0.4).length;

    ctx.fillStyle = (highActivity + medActivity) > 0 ? '#0f0' : '#666';
    ctx.font = '10px Inter';
    ctx.textAlign = 'center';

    let summaryText = '';
    if (highActivity > 0) {
        summaryText += `${highActivity} HIGH`;
    }
    if (medActivity > 0) {
        if (summaryText) summaryText += ', ';
        summaryText += `${medActivity} MED`;
    }
    if (lowActivity > 0) {
        if (summaryText) summaryText += ', ';
        summaryText += `${lowActivity} LOW`;
    }
    if (!summaryText) {
        summaryText = 'Neural network idle';
    }

    ctx.fillText(summaryText, w / 2, h - 5);
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
            // OPTIMIZED: Use multiplication instead of Math.pow
            const dx = touch2.clientX - touch1.clientX;
            const dy = touch2.clientY - touch1.clientY;
            const distance = Math.sqrt(dx * dx + dy * dy);
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

    // OPTIMIZED: Throttle mousemove for better performance
    let mouseMoveThrottle = null;
    canvas.addEventListener('mousemove', (e) => {
        if (!isDragging || simulation.followBest) return;

        // Throttle to ~60fps (16ms)
        if (mouseMoveThrottle) return;
        mouseMoveThrottle = requestAnimationFrame(() => {
            mouseMoveThrottle = null;
        });

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

        simulation.logger.debug(`[CAMERA-CLICK] screen(${mouseX.toFixed(1)}, ${mouseY.toFixed(1)}) normalized(${normalizedX.toFixed(3)}, ${normalizedY.toFixed(3)}) world(${worldX.toFixed(1)}, ${worldY.toFixed(1)}) camera(${simulation.camera.x.toFixed(1)}, ${simulation.camera.y.toFixed(1)}) zoom(${simulation.camera.zoom.toFixed(3)})`);
    });

    // OPTIMIZED: Passive wheel listener for better scroll performance
    canvas.addEventListener('wheel', (e) => {
        if (simulation.followBest) return; // Disable when following best agent

        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const aspect = container.clientWidth / container.clientHeight;
        simulation.camera.zoomAt(mouseX, mouseY, e.deltaY, container.clientWidth, container.clientHeight,
            simulation.worldWidth, simulation.worldHeight, aspect);

        e.preventDefault();
    }, { passive: false }); // Keep non-passive since we call preventDefault
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
    // Calculate average temperature for display
    const avgTemperature = livingAgents.length > 0 ? livingAgents.reduce((acc, a) => acc + a.temperature, 0) / livingAgents.length : 50;
    document.getElementById('info-avg-e').innerText = `Avg. Energy: ${avgEnergy.toFixed(0)} | Scarcity: ${simulation.foodScarcityFactor.toFixed(2)} | Temp: ${avgTemperature.toFixed(1)}°C`;

    // Update runtime
    const runtimeMs = Date.now() - (simulation.startTime || Date.now());
    const runtimeSeconds = Math.floor(runtimeMs / 1000);
    document.getElementById('info-runtime').innerText = `Runtime: ${runtimeSeconds}s`;

    // Update memory stats
    updateMemoryStats(simulation);

    // Check for memory pressure and take action if needed
    handleMemoryPressure(simulation);
}

// Genetic Diversity Modal Functions
function showGeneticDiversityModal(simulation) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('genetic-diversity-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'genetic-diversity-modal';
        modal.className = 'genetic-diversity-modal';
        document.body.appendChild(modal);
    }

    // Get gene pool data
    const genePoolHealth = simulation.db.getGenePoolHealth();
    const genePools = simulation.db.pool;

    // Get validation queue data
    const validationStats = simulation.validationManager.getStats(simulation);
    const validationQueue = Array.from(simulation.validationManager.validationQueue.entries());

    // Build modal content
    modal.innerHTML = `
        <div class="modal-backdrop">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>🧬 Genetic Diversity</h2>
                    <div class="modal-actions">
                        <button class="modal-delete-btn" id="delete-gene-pool-btn" title="Delete entire gene pool">🗑️</button>
                        <button class="modal-close" title="Close">&times;</button>
                    </div>
                </div>
                <div class="modal-body">
                    <div class="gene-pool-summary">
                        <div class="summary-stats">
                            <div class="stat-item">
                                <span class="stat-label">Gene Pools:</span>
                                <span class="stat-value">${genePoolHealth.genePoolCount}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Total Agents:</span>
                                <span class="stat-value">${genePoolHealth.totalAgents}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Avg Fitness:</span>
                                <span class="stat-value">${genePoolHealth.avgFitness.toFixed(0)}</span>
                            </div>
                        </div>
                    </div>

                    <div class="validation-queue-section">
                        <h3>🔬 Validation Queue</h3>
                        <div class="validation-stats">
                            <div class="stat-item">
                                <span class="stat-label">Queue Size:</span>
                                <span class="stat-value">${validationStats.queueSize}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Active Agents:</span>
                                <span class="stat-value">${validationStats.actualActiveAgents}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Spawn Locks:</span>
                                <span class="stat-value">${validationStats.spawnLocks}</span>
                            </div>
                        </div>

                        ${validationQueue.length > 0 ? `
                        <div class="validation-queue-table-container">
                            <table class="validation-queue-table">
                                <thead>
                                    <tr>
                                        <th>Gene ID</th>
                                        <th>Runs</th>
                                        <th>Best Score</th>
                                        <th>Avg Score</th>
                                        <th>Fit Runs</th>
                                        <th>Status</th>
                                        <th>Last Activity</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${validationQueue.map(([geneId, entry]) => {
        const bestScore = entry.scores.length > 0 ? Math.max(...entry.scores) : 0;
        const avgScore = entry.scores.length > 0 ? entry.scores.reduce((a, b) => a + b, 0) / entry.scores.length : 0;
        const fitRuns = entry.fitResults.filter(fit => fit).length;
        const totalRuns = entry.attempts;
        const timeSinceLast = Date.now() - entry.lastValidationTime;
        const timeAgo = timeSinceLast < 60000 ? `${Math.floor(timeSinceLast / 1000)}s` : `${Math.floor(timeSinceLast / 60000)}m`;

        let status = 'In Progress';
        let statusClass = 'status-progress';
        if (entry.isValidated) {
            status = 'Validated';
            statusClass = 'status-validated';
        } else if (totalRuns >= 3) {
            status = fitRuns >= 2 ? 'Passed' : 'Failed';
            statusClass = fitRuns >= 2 ? 'status-passed' : 'status-failed';
        } else if (entry.attempts >= 5) {
            status = 'Stuck';
            statusClass = 'status-stuck';
        }

        return `
                                    <tr>
                                        <td class="gene-id-cell">${geneId}</td>
                                        <td>${totalRuns}/3</td>
                                        <td class="fitness-cell">${bestScore.toFixed(0)}</td>
                                        <td>${avgScore.toFixed(0)}</td>
                                        <td>${fitRuns}/${totalRuns}</td>
                                        <td class="status-cell ${statusClass}">${status}</td>
                                        <td>${timeAgo} ago</td>
                                    </tr>
                                        `;
    }).join('')}
                                </tbody>
                            </table>
                        </div>
                        ` : '<div class="no-data">No agents currently in validation queue.</div>'}
                    </div>

                    <div class="gene-pool-table-container">
                        <table class="gene-pool-table">
                            <thead>
                                <tr>
                                    <th>Gene ID</th>
                                    <th>Agents</th>
                                    <th>Best Fitness</th>
                                    <th>Avg Fitness</th>
                                    <th>Specializations</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${Object.entries(genePools).map(([geneId, agents]) => {
        if (!agents || agents.length === 0) return '';

        const bestFitness = Math.max(...agents.map(a => a.fitness));
        const avgFitness = agents.reduce((sum, a) => sum + a.fitness, 0) / agents.length;
        const specializationCounts = {};

        agents.forEach(agent => {
            const type = agent.specializationType || 'Unknown';
            specializationCounts[type] = (specializationCounts[type] || 0) + 1;
        });

        const specializationText = Object.entries(specializationCounts)
            .map(([type, count]) => `${type}:${count}`)
            .join(', ');

        return `
                                        <tr>
                                            <td class="gene-id-cell">${geneId}</td>
                                            <td>${agents.length}</td>
                                            <td class="fitness-cell">${bestFitness.toFixed(0)}</td>
                                            <td>${avgFitness.toFixed(0)}</td>
                                            <td class="specialization-cell">${specializationText}</td>
                                        </tr>
                                    `;
    }).join('')}
                            </tbody>
                        </table>
                    </div>

                    ${genePoolHealth.genePoolCount === 0 ? '<div class="no-data">No gene pools saved yet. Agents need to meet qualification criteria to be saved.</div>' : ''}
                </div>
            </div>
        </div>
    `;

    // Show modal
    modal.style.display = 'block';
    setTimeout(() => modal.classList.add('visible'), 10);

    // Add event listeners
    const closeBtn = modal.querySelector('.modal-close');
    const backdrop = modal.querySelector('.modal-backdrop');

    const closeModal = () => {
        modal.classList.remove('visible');
        setTimeout(() => modal.style.display = 'none', 300);
    };

    closeBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeModal();
    });

    // ESC key to close
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    // Remove listeners when modal closes
    modal.addEventListener('transitionend', () => {
        if (!modal.classList.contains('visible')) {
            document.removeEventListener('keydown', escHandler);
        }
    }, { once: true });
}

// Survival & Performance Modal Functions
function showSurvivalPerformanceModal(simulation) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('survival-performance-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'survival-performance-modal';
        modal.className = 'genetic-diversity-modal'; // Reuse the same CSS class
        document.body.appendChild(modal);
    }

    // Get current stats data
    const livingAgents = simulation.agents.filter(a => !a.isDead);
    if (livingAgents.length === 0) {
        return;
    }

    // Helper function to calculate statistics (avg, median, p99, min, max)
    const calculateStats = (values) => {
        if (!values || values.length === 0) {
            return { avg: 0, median: 0, p99: 0, min: 0, max: 0 };
        }
        const sorted = [...values].sort((a, b) => a - b);
        const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
        const median = sorted[Math.floor(sorted.length / 2)];
        const p99Index = Math.floor(sorted.length * 0.99);
        const p99 = sorted[Math.min(p99Index, sorted.length - 1)];
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        return { avg, median, p99, min, max };
    };

    // Format stats helper
    const formatStats = (stats, decimals = 1) => {
        return `avg=${stats.avg.toFixed(decimals)}, median=${stats.median.toFixed(decimals)}, p99=${stats.p99.toFixed(decimals)}, min=${stats.min.toFixed(decimals)}, max=${stats.max.toFixed(decimals)}`;
    };

    // Calculate stats (same as updateDashboard)
    const bestFitness = safeNumber(simulation.bestAgent ? simulation.bestAgent.fitness : 0, 0);
    const avgFitness = averageMetric(livingAgents, a => a.fitness);
    const avgAge = averageMetric(livingAgents, a => a.age);
    const avgEnergy = averageMetric(livingAgents, a => a.energy);
    const avgFood = averageMetric(livingAgents, a => a.foodEaten);
    const avgKills = averageMetric(livingAgents, a => a.kills);
    const avgCollisions = averageMetric(livingAgents, a => a.collisions);
    const avgWallHits = averageMetric(livingAgents, a => a.timesHitObstacle);

    // Calculate statistical distributions
    const fitnessValues = livingAgents.map(a => safeNumber(a.fitness, 0));
    const ageValues = livingAgents.map(a => safeNumber(a.age || 0, 0));
    const energyValues = livingAgents.map(a => safeNumber(a.energy, 0));
    const foodValues = livingAgents.map(a => safeNumber(a.foodEaten || 0, 0));
    const killsValues = livingAgents.map(a => safeNumber(a.kills || 0, 0));
    const collisionsValues = livingAgents.map(a => safeNumber(a.collisions || 0, 0));
    const wallHitsValues = livingAgents.map(a => safeNumber(a.timesHitObstacle || 0, 0));
    const offspringValues = livingAgents.map(a => safeNumber(a.offspring || 0, 0));
    const energySpentValues = livingAgents.map(a => safeNumber(a.energySpent || 0, 0));
    const distanceTravelledValues = livingAgents.map(a => safeNumber(a.distanceTravelled || 0, 0));
    const reproductionAttemptsValues = livingAgents.map(a => safeNumber(a.reproductionAttempts || 0, 0));

    const statsFitness = calculateStats(fitnessValues);
    const statsAge = calculateStats(ageValues);
    const statsEnergy = calculateStats(energyValues);
    const statsFood = calculateStats(foodValues);
    const statsKills = calculateStats(killsValues);
    const statsCollisions = calculateStats(collisionsValues);
    const statsWallHits = calculateStats(wallHitsValues);
    const statsOffspring = calculateStats(offspringValues);
    const statsEnergySpent = calculateStats(energySpentValues);
    const statsDistanceTravelled = calculateStats(distanceTravelledValues);
    const statsReproductionAttempts = calculateStats(reproductionAttemptsValues);

    const matureAgents = livingAgents.filter(a => a.age >= 10).length; // 10 seconds = 600 frames
    const maturationRate = (matureAgents / livingAgents.length) * 100;
    const maxAge = safeNumber(Math.max(...livingAgents.map(a => safeNumber(a.age, 0))), 0);
    const collisionFreeAgents = livingAgents.filter(a => safeNumber(a.timesHitObstacle || 0, 0) === 0).length;
    const collisionFreePercent = safeNumber((collisionFreeAgents / livingAgents.length) * 100, 0);

    let fitnessDelta = 0;
    if (simulation.fitnessHistory.length >= 2) {
        fitnessDelta = safeNumber(simulation.fitnessHistory[simulation.fitnessHistory.length - 1] - simulation.fitnessHistory[simulation.fitnessHistory.length - 2], 0);
    }

    // Build modal content
    modal.innerHTML = `
        <div class="modal-backdrop">
            <div class="modal-content compact-modal">
                <div class="modal-header">
                    <h2>📊 Survival & Performance Details</h2>
                    <button class="modal-close" title="Close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="compact-summary-bar">
                        <div class="summary-item"><strong>Pop:</strong> ${livingAgents.length}</div>
                        <div class="summary-item"><strong>Gen:</strong> ${simulation.generation || 0}</div>
                        <div class="summary-item"><strong>Runtime:</strong> ${Math.floor((Date.now() - (simulation.startTime || Date.now())) / 1000)}s</div>
                        <div class="summary-item"><strong>Best Fitness:</strong> <span class="highlight-green">${bestFitness.toFixed(0)}</span></div>
                        <div class="summary-item"><strong>Δ:</strong> <span class="${fitnessDelta >= 0 ? 'highlight-green' : 'highlight-red'}">${fitnessDelta >= 0 ? '+' : ''}${fitnessDelta.toFixed(0)}</span></div>
                    </div>

                    <div class="compact-stats-grid">
                        <div class="stat-row">
                            <div class="stat-cell"><strong>Fitness:</strong> ${avgFitness.toFixed(1)}</div>
                            <div class="stat-cell"><strong>Age:</strong> ${avgAge.toFixed(1)}s</div>
                            <div class="stat-cell"><strong>Energy:</strong> ${avgEnergy.toFixed(1)}</div>
                            <div class="stat-cell"><strong>Food:</strong> ${avgFood.toFixed(1)}</div>
                        </div>
                        <div class="stat-row">
                            <div class="stat-cell"><strong>Mature:</strong> ${matureAgents}/${livingAgents.length} (${maturationRate.toFixed(1)}%)</div>
                            <div class="stat-cell"><strong>Max Age:</strong> <span class="highlight-cyan">${maxAge.toFixed(0)}s</span></div>
                            <div class="stat-cell"><strong>Kills:</strong> ${avgKills.toFixed(2)}</div>
                            <div class="stat-cell"><strong>Collisions:</strong> ${avgCollisions.toFixed(1)}</div>
                        </div>
                        <div class="stat-row">
                            <div class="stat-cell"><strong>Wall Hits:</strong> ${avgWallHits.toFixed(1)}</div>
                            <div class="stat-cell"><strong>Collision-Free:</strong> <span class="${collisionFreePercent >= 50 ? 'highlight-green' : collisionFreePercent >= 25 ? 'highlight-yellow' : 'highlight-red'}">${collisionFreePercent.toFixed(1)}%</span></div>
                            <div class="stat-cell"><strong>Learning Rate:</strong> ${simulation.fitnessHistory.length >= 2 ? ((simulation.fitnessHistory[simulation.fitnessHistory.length - 1] - simulation.fitnessHistory[simulation.fitnessHistory.length - 2]) / 2).toFixed(1) : 'N/A'}</div>
                            <div class="stat-cell"><strong>Population Δ:</strong> ${livingAgents.length - (simulation.previousPopulationCount || livingAgents.length)}</div>
                        </div>
                    </div>

                    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #444;">
                        <h3 style="margin-bottom: 15px; color: #00BCD4;">📈 Statistical Distributions</h3>
                        <div class="compact-stats-grid" style="font-size: 0.85em;">
                            <div class="stat-row">
                                <div class="stat-cell"><strong style="color: #4CAF50;">Fitness:</strong><br/><span style="color: #fff;">${formatStats(statsFitness)}</span></div>
                            </div>
                            <div class="stat-row">
                                <div class="stat-cell"><strong style="color: #4CAF50;">Age (s):</strong><br/><span style="color: #fff;">${formatStats(statsAge)}</span></div>
                            </div>
                            <div class="stat-row">
                                <div class="stat-cell"><strong style="color: #4CAF50;">Energy:</strong><br/><span style="color: #fff;">${formatStats(statsEnergy)}</span></div>
                            </div>
                            <div class="stat-row">
                                <div class="stat-cell"><strong style="color: #4CAF50;">Food Eaten:</strong><br/><span style="color: #fff;">${formatStats(statsFood, 1)}</span></div>
                            </div>
                            <div class="stat-row">
                                <div class="stat-cell"><strong style="color: #4CAF50;">Kills:</strong><br/><span style="color: #fff;">${formatStats(statsKills, 2)}</span></div>
                            </div>
                            <div class="stat-row">
                                <div class="stat-cell"><strong style="color: #4CAF50;">Collisions:</strong><br/><span style="color: #fff;">${formatStats(statsCollisions, 1)}</span></div>
                            </div>
                            <div class="stat-row">
                                <div class="stat-cell"><strong style="color: #4CAF50;">Wall Hits:</strong><br/><span style="color: #fff;">${formatStats(statsWallHits, 1)}</span></div>
                            </div>
                            <div class="stat-row">
                                <div class="stat-cell"><strong style="color: #4CAF50;">Offspring:</strong><br/><span style="color: #fff;">${formatStats(statsOffspring, 2)}</span></div>
                            </div>
                            <div class="stat-row">
                                <div class="stat-cell"><strong style="color: #4CAF50;">Energy Spent:</strong><br/><span style="color: #fff;">${formatStats(statsEnergySpent, 1)}</span></div>
                            </div>
                            <div class="stat-row">
                                <div class="stat-cell"><strong style="color: #4CAF50;">Distance Travelled:</strong><br/><span style="color: #fff;">${formatStats(statsDistanceTravelled, 1)}</span></div>
                            </div>
                            <div class="stat-row">
                                <div class="stat-cell"><strong style="color: #4CAF50;">Reproduction Attempts:</strong><br/><span style="color: #fff;">${formatStats(statsReproductionAttempts, 1)}</span></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Show modal
    modal.style.display = 'block';
    setTimeout(() => modal.classList.add('visible'), 10);

    // Add event listeners
    const closeBtn = modal.querySelector('.modal-close');
    const backdrop = modal.querySelector('.modal-backdrop');

    const closeModal = () => {
        modal.classList.remove('visible');
        setTimeout(() => modal.style.display = 'none', 300);
    };

    closeBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeModal();
    });

    // ESC key to close
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    // Remove listeners when modal closes
    modal.addEventListener('transitionend', () => {
        if (!modal.classList.contains('visible')) {
            document.removeEventListener('keydown', escHandler);
        }
    }, { once: true });
}

// Reproduction Status Modal Functions
function showReproductionModal(simulation) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('reproduction-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'reproduction-modal';
        modal.className = 'genetic-diversity-modal'; // Reuse the same CSS class
        document.body.appendChild(modal);
    }

    // Get current stats data
    const livingAgents = simulation.agents.filter(a => !a.isDead);
    if (livingAgents.length === 0) {
        return;
    }

    // Calculate reproduction stats
    const totalSexualOffspring = livingAgents.reduce((sum, a) => sum + safeNumber(a.childrenFromMate || 0, 0), 0);
    const totalAsexualOffspring = livingAgents.reduce((sum, a) => sum + safeNumber(a.childrenFromSplit || 0, 0), 0);
    const totalOffspring = totalSexualOffspring + totalAsexualOffspring;

    const avgOffspring = averageMetric(livingAgents, a => a.offspring || 0);
    const avgOffspringMate = averageMetric(livingAgents, a => a.childrenFromMate || 0);
    const avgOffspringSplit = averageMetric(livingAgents, a => a.childrenFromSplit || 0);

    // Calculate reproduction rate (events per minute)
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

    // Calculate specialization-based reproduction
    const specializationReproduction = {};
    // OPTIMIZED: Use for loop instead of forEach
    const livingAgentsLen = livingAgents.length;
    for (let i = 0; i < livingAgentsLen; i++) {
        const agent = livingAgents[i];
        const type = agent.specializationType || 'Unknown';
        if (!specializationReproduction[type]) {
            specializationReproduction[type] = {
                count: 0,
                totalOffspring: 0,
                sexualOffspring: 0,
                asexualOffspring: 0
            };
        }
        specializationReproduction[type].count++;
        specializationReproduction[type].totalOffspring += safeNumber(agent.childrenFromMate || 0, 0) + safeNumber(agent.childrenFromSplit || 0, 0);
        specializationReproduction[type].sexualOffspring += safeNumber(agent.childrenFromMate || 0, 0);
        specializationReproduction[type].asexualOffspring += safeNumber(agent.childrenFromSplit || 0, 0);
    }

    // Calculate generation distribution
    // OPTIMIZED: Use for loop instead of forEach
    const generationStats = {};
    for (let i = 0; i < livingAgentsLen; i++) {
        const agent = livingAgents[i];
        const gen = agent.generation || 0;
        if (!generationStats[gen]) {
            generationStats[gen] = { count: 0, totalOffspring: 0 };
        }
        generationStats[gen].count++;
        generationStats[gen].totalOffspring += safeNumber(agent.childrenFromMate || 0, 0) + safeNumber(agent.childrenFromSplit || 0, 0);
    }

    // Build modal content
    modal.innerHTML = `
        <div class="modal-backdrop">
            <div class="modal-content compact-modal">
                <div class="modal-header">
                    <h2>💕 Reproduction Status Details</h2>
                    <button class="modal-close" title="Close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="compact-summary-bar">
                        <div class="summary-item"><strong>Total Offspring:</strong> ${totalOffspring}</div>
                        <div class="summary-item"><strong>Sexual:</strong> <span class="highlight-green">${totalSexualOffspring}</span></div>
                        <div class="summary-item"><strong>Asexual:</strong> ${totalAsexualOffspring}</div>
                        <div class="summary-item"><strong>Rate:</strong> ${reproductionRateValue.toFixed(1)}/min</div>
                        <div class="summary-item"><strong>Avg/Agent:</strong> ${avgOffspring.toFixed(2)}</div>
                    </div>

                    <div class="compact-stats-grid">
                        <div class="stat-row">
                            <div class="stat-cell"><strong>By Specialization:</strong></div>
                            <div class="stat-cell">${Object.entries(specializationReproduction).map(([type, data]) =>
        `${type}:${data.count}→${data.totalOffspring}(${data.sexualOffspring}♡)`
    ).join(' | ')}</div>
                        </div>
                        <div class="stat-row">
                            <div class="stat-cell"><strong>Recent Generations:</strong></div>
                            <div class="stat-cell">${Object.entries(generationStats).sort(([a], [b]) => parseInt(b) - parseInt(a)).slice(0, 3).map(([gen, data]) =>
        `G${gen}:${data.count}→${data.totalOffspring}(${(data.totalOffspring / data.count).toFixed(1)})`
    ).join(' | ')}</div>
                        </div>
                        <div class="stat-row">
                            <div class="stat-cell"><strong>Status:</strong></div>
                            <div class="stat-cell">${totalSexualOffspring > totalAsexualOffspring ? 'Sexual dominant ✓' : 'Asexual dominant ⚡'} |
                            ${reproductionRateValue > 5 ? 'High rate ✓' : reproductionRateValue > 1 ? 'Moderate ⚠' : 'Low rate ⚠'} |
                            ${Object.keys(specializationReproduction).length > 1 ? 'Diverse ✓' : 'Mono-type ⚠'}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Show modal
    modal.style.display = 'block';
    setTimeout(() => modal.classList.add('visible'), 10);

    // Add event listeners
    const closeBtn = modal.querySelector('.modal-close');
    const backdrop = modal.querySelector('.modal-backdrop');

    const closeModal = () => {
        modal.classList.remove('visible');
        setTimeout(() => modal.style.display = 'none', 300);
    };

    closeBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeModal();
    });

    // ESC key to close
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    // Remove listeners when modal closes
    modal.addEventListener('transitionend', () => {
        if (!modal.classList.contains('visible')) {
            document.removeEventListener('keydown', escHandler);
        }
    }, { once: true });
}

// Qualification Criteria Modal Functions
function showQualificationModal(simulation) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('qualification-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'qualification-modal';
        modal.className = 'genetic-diversity-modal'; // Reuse the same CSS class
        document.body.appendChild(modal);
    }

    // Get current stats data
    const livingAgents = simulation.agents.filter(a => !a.isDead);
    if (livingAgents.length === 0) {
        return;
    }

    // Calculate qualification criteria breakdown
    const totalCells = EXPLORATION_GRID_WIDTH * EXPLORATION_GRID_HEIGHT;
    const agentsMeetingFitness = livingAgents.filter(a => safeNumber(a.fitness, 0) >= GENE_POOL_MIN_FITNESS).length;
    const agentsMeetingFood = livingAgents.filter(a => safeNumber(a.foodEaten || 0, 0) >= MIN_FOOD_EATEN_TO_SAVE_GENE_POOL).length;
    const agentsMeetingAge = livingAgents.filter(a => safeNumber(a.age || 0, 0) >= MIN_SECONDS_ALIVE_TO_SAVE_GENE_POOL).length;
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

    // Calculate agents meeting ALL criteria (qualified agents)
    const qualifiedAgents = livingAgents.filter(a => {
        const fitnessOk = safeNumber(a.fitness, 0) >= GENE_POOL_MIN_FITNESS;
        const foodOk = safeNumber(a.foodEaten || 0, 0) >= MIN_FOOD_EATEN_TO_SAVE_GENE_POOL;
        const ageOk = safeNumber(a.age || 0, 0) >= MIN_SECONDS_ALIVE_TO_SAVE_GENE_POOL;
        const explorationOk = ((a.exploredCells?.size || 0) / totalCells) * 100 >= MIN_EXPLORATION_PERCENTAGE_TO_SAVE_GENE_POOL;
        const navigationOk = safeNumber(a.turnsTowardsFood || 0, 0) >= MIN_TURNS_TOWARDS_FOOD_TO_SAVE_GENE_POOL;
        return fitnessOk && foodOk && ageOk && explorationOk && navigationOk;
    }).length;

    // Calculate specialization distribution for qualified agents
    const qualifiedSpecializations = {};
    livingAgents.forEach(agent => {
        const fitnessOk = safeNumber(agent.fitness, 0) >= GENE_POOL_MIN_FITNESS;
        const foodOk = safeNumber(agent.foodEaten || 0, 0) >= MIN_FOOD_EATEN_TO_SAVE_GENE_POOL;
        const ageOk = safeNumber(agent.age || 0, 0) >= MIN_SECONDS_ALIVE_TO_SAVE_GENE_POOL;
        const explorationOk = ((agent.exploredCells?.size || 0) / totalCells) * 100 >= MIN_EXPLORATION_PERCENTAGE_TO_SAVE_GENE_POOL;
        const navigationOk = safeNumber(agent.turnsTowardsFood || 0, 0) >= MIN_TURNS_TOWARDS_FOOD_TO_SAVE_GENE_POOL;

        if (fitnessOk && foodOk && ageOk && explorationOk && navigationOk) {
            const type = agent.specializationType || 'Unknown';
            qualifiedSpecializations[type] = (qualifiedSpecializations[type] || 0) + 1;
        }
    });

    // Build modal content
    modal.innerHTML = `
        <div class="modal-backdrop">
            <div class="modal-content compact-modal">
                <div class="modal-header">
                    <h2>✅ Qualification Criteria Details</h2>
                    <button class="modal-close" title="Close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="compact-summary-bar">
                        <div class="summary-item"><strong>Qualified:</strong> <span class="${qualifiedAgents > 0 ? 'highlight-green' : 'highlight-red'}">${qualifiedAgents}/${livingAgents.length}</span></div>
                        <div class="summary-item"><strong>Rate:</strong> ${((qualifiedAgents / livingAgents.length) * 100).toFixed(1)}%</div>
                        <div class="summary-item"><strong>Thresholds:</strong> F≥${GENE_POOL_MIN_FITNESS}, Food≥${MIN_FOOD_EATEN_TO_SAVE_GENE_POOL}, Age≥${MIN_SECONDS_ALIVE_TO_SAVE_GENE_POOL}s, Exp≥${MIN_EXPLORATION_PERCENTAGE_TO_SAVE_GENE_POOL}%, Nav≥${MIN_TURNS_TOWARDS_FOOD_TO_SAVE_GENE_POOL}</div>
                    </div>

                    <div class="compact-stats-grid">
                        <div class="stat-row">
                            <div class="stat-cell"><strong>Criteria Met:</strong></div>
                            <div class="stat-cell">Fitness: <span class="${agentsMeetingFitness > 0 ? 'highlight-green' : 'highlight-red'}">${agentsMeetingFitness}</span> |
                            Food: <span class="${agentsMeetingFood > 0 ? 'highlight-green' : 'highlight-red'}">${agentsMeetingFood}</span> |
                            Age: <span class="${agentsMeetingAge > 0 ? 'highlight-green' : 'highlight-red'}">${agentsMeetingAge}</span> |
                            Exp: <span class="${agentsMeetingExploration > 0 ? 'highlight-green' : 'highlight-red'}">${agentsMeetingExploration}</span> |
                            Nav: <span class="${agentsMeetingNavigation > 0 ? 'highlight-green' : 'highlight-red'}">${agentsMeetingNavigation}</span></div>
                        </div>
                        <div class="stat-row">
                            <div class="stat-cell"><strong>Population Averages:</strong></div>
                            <div class="stat-cell">Fitness: ${averageMetric(livingAgents, a => a.fitness).toFixed(0)} |
                            Food: ${averageMetric(livingAgents, a => a.foodEaten || 0).toFixed(1)} |
                            Age: ${averageMetric(livingAgents, a => a.age || 0).toFixed(1)}s |
                            Exp: <span class="highlight-cyan">${avgExplorationPercentage.toFixed(1)}%</span> |
                            Nav: <span class="highlight-green">${avgTurnsTowardsFood.toFixed(1)}</span></div>
                        </div>
                        <div class="stat-row">
                            <div class="stat-cell"><strong>Qualified Specializations:</strong></div>
                            <div class="stat-cell">${Object.entries(qualifiedSpecializations).length > 0 ?
            Object.entries(qualifiedSpecializations).map(([type, count]) => `${type}:${count}`).join(' | ') :
            'None yet'}</div>
                        </div>
                        <div class="stat-row">
                            <div class="stat-cell"><strong>Status:</strong></div>
                            <div class="stat-cell">${qualifiedAgents > 0 ? 'Evolution progressing ✓' : 'Evolution in progress ⚠'} |
                            ${agentsMeetingFitness === 0 ? 'Fitness issues ⚠' : agentsMeetingFitness < livingAgents.length * 0.1 ? 'High pressure ⚠' : 'Good fitness ✓'} |
                            ${agentsMeetingExploration === 0 ? 'Sedentary ⚠' : agentsMeetingExploration < livingAgents.length * 0.2 ? 'Limited exploration ⚠' : 'Good coverage ✓'}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Show modal
    modal.style.display = 'block';
    setTimeout(() => modal.classList.add('visible'), 10);

    // Add event listeners
    const closeBtn = modal.querySelector('.modal-close');
    const backdrop = modal.querySelector('.modal-backdrop');

    const closeModal = () => {
        modal.classList.remove('visible');
        setTimeout(() => modal.style.display = 'none', 300);
    };

    closeBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeModal();
    });

    // ESC key to close
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    // Remove listeners when modal closes
    modal.addEventListener('transitionend', () => {
        if (!modal.classList.contains('visible')) {
            document.removeEventListener('keydown', escHandler);
        }
    }, { once: true });
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
    const agentsMeetingFitness = livingAgents.filter(a => safeNumber(a.fitness, 0) >= GENE_POOL_MIN_FITNESS).length;
    const agentsMeetingFood = livingAgents.filter(a => safeNumber(a.foodEaten || 0, 0) >= MIN_FOOD_EATEN_TO_SAVE_GENE_POOL).length;
    const agentsMeetingAge = livingAgents.filter(a => safeNumber(a.age || 0, 0) >= MIN_SECONDS_ALIVE_TO_SAVE_GENE_POOL).length;
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
        // Color code based on target: green if >= target, yellow if >= target/2, red if < target/2
        const targetHalf = TARGET_AGE_SECONDS / 2;
        avgAgeEl.style.color = avgAge >= TARGET_AGE_SECONDS ? '#0f0' : avgAge >= targetHalf ? '#ff0' : '#f00';
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

/**
 * Cleanup function to remove all UI event listeners and prevent memory leaks
 * Call this when destroying the simulation
 */
export function cleanupUIEventListeners() {
    // Stop periodic summarization
    stopPeriodicSummarization();

    // Get DOM elements and remove their event listeners
    const gameSpeedSlider = document.getElementById('gameSpeed');
    const maxAgentsSlider = document.getElementById('maxAgents');
    const foodRateSlider = document.getElementById('foodRate');
    const mutationRateSlider = document.getElementById('mutationRate');
    const showRaysCheckbox = document.getElementById('showRays');
    const followBestCheckbox = document.getElementById('followBest');
    const useGpuCheckbox = document.getElementById('useGpu');
    const autoAdjustCheckbox = document.getElementById('autoAdjust');
    const copyStatsBtn = document.getElementById('copyStats');
    const clearStorageBtn = document.getElementById('clearStorage');
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const wakeLockBtn = document.getElementById('wakeLock');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const geneticDiversitySection = document.getElementById('genetic-diversity-section');

    // Note: We can't easily remove specific event listeners without storing references
    // The most reliable way is to clone and replace elements, or use a more sophisticated
    // event management system. For now, we'll clear any intervals and let garbage collection
    // handle the DOM elements when the page unloads.

    // Clear any sidebar-related event listeners by closing any open sidebars
    const agentSidebar = document.getElementById('agent-sidebar');
    if (agentSidebar && !agentSidebar.classList.contains('collapsed')) {
        agentSidebar.classList.add('collapsed');
    }
}