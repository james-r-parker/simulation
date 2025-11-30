// --- VALIDATION SYSTEM ---
// Manages multi-run testing and validation of promising agents

import {
    VALIDATION_REQUIRED_RUNS,
    MAX_VALIDATION_QUEUE_SIZE,
    VALIDATION_COOLDOWN_MS,
    VALIDATION_CLEANUP_TIMEOUT_MS
} from './constants.js';
import { toast } from './toast.js';

export class ValidationManager {
    constructor(logger, db, simulation) {
        this.logger = logger;
        this.db = db;
        this.simulation = simulation;
        this.validationQueue = new Map(); // geneId -> validation entry
        this.activeValidationAgents = 0; // Count of currently living validation agents
        this.spawnLocks = new Set(); // geneIds currently being spawned to prevent race conditions
        this.toast = toast; // Toast notification system
    }

    // Add an agent to the validation queue for testing
    // Returns:
    // - false: Gene already exists in pool, skip validation (caller should handle as existing gene)
    // - { success: false }: Validation in progress or failed
    // - { success: true, record: {...} }: Validation passed, record ready for gene pool
    addToValidationQueue(agent, isPeriodicValidation = false, skipGenePoolCheck = false) {
        const geneId = agent.geneId;

        // Safety check: Ensure agent has valid neural network
        if (!agent || !agent.nn) {
            this.logger.warn(`[VALIDATION] ❌ Cannot add agent to validation queue - agent or neural network is null`);
            return false;
        }

        // Check if this geneId is already in the gene pool - if so, skip validation and save directly
        // But skip this check for validation run processing (when skipGenePoolCheck = true)
        if (!skipGenePoolCheck && this.db.pool[geneId]) {
            this.logger.info(`[VALIDATION] ⏭️ Skipping validation for ${geneId} - already in gene pool, saving directly`);
            // Note: We can't push to deadAgentQueue here as it's not available in this class
            // The caller should handle this case
            return false; // Indicate that validation was skipped
        }

        if (!this.validationQueue.has(geneId)) {
            try {
                const weights = agent.getWeights();

                // Safety check: Ensure weights are valid NeuralNetwork format (object with weights1, weights2)
                const isValidWeights = weights &&
                    typeof weights === 'object' &&
                    weights.weights1 && weights.weights2 &&
                    Array.isArray(weights.weights1) && Array.isArray(weights.weights2) &&
                    weights.weights1.length > 0 && weights.weights2.length > 0;

                if (!isValidWeights) {
                    this.logger.warn(`[VALIDATION] ❌ Cannot add ${geneId} to validation queue - invalid weights format`);
                    this.logger.warn(`[VALIDATION] Expected: {weights1: [...], weights2: [...]}, Got:`, weights);
                    // Log additional debug info
                    if (agent && agent.nn) {
                        this.logger.warn(`[VALIDATION] Agent NN exists but getWeights() returned invalid format. NN inputSize: ${agent.nn.inputSize}, hiddenSize: ${agent.nn.hiddenSize}, outputSize: ${agent.nn.outputSize}`);
                    } else {
                        this.logger.warn(`[VALIDATION] Agent has no neural network!`);
                    }
                    return false;
                }

                this.validationQueue.set(geneId, {
                    geneId: geneId,
                    attempts: 0,
                    scores: [],
                    fitResults: [], // Track whether each run was fit
                    lastValidationTime: 0,
                    isValidated: false,
                    isActiveTest: false, // Flag to prevent duplicate spawns during active testing
                    weights: weights, // Store weights directly to avoid agent reference issues
                    specializationType: agent.specializationType || 'forager'
                });
                this.logger.info(`[VALIDATION] 🆕 ${geneId} (ID: ${agent.id}) entered validation system`);
            } catch (error) {
                this.logger.error(`[VALIDATION] ❌ Failed to get weights for agent ${geneId}:`, error);
                return false;
            }
        }

        const validationEntry = this.validationQueue.get(geneId);

        // Prevent duplicate validations within short time window
        const currentTime = Date.now();
        if (currentTime - validationEntry.lastValidationTime < VALIDATION_COOLDOWN_MS) { // Cooldown between validation attempts
            return false;
        }
        validationEntry.lastValidationTime = currentTime;

        // Record this validation attempt
        validationEntry.attempts++;
        validationEntry.scores.push(agent.fitness);
        validationEntry.fitResults.push(agent.fit); // Track fit status

        // Enhanced logging for validation runs
        const currentFitness = agent.fitness;
        const source = isPeriodicValidation ? 'periodic' : 'death';
        const runNumber = validationEntry.attempts;

        this.logger.info(`[VALIDATION] ${geneId} (ID: ${agent.id}) - Run ${runNumber}: Fitness ${currentFitness.toFixed(1)} (${source})`);

        // Check for early success after 2 runs
        if (validationEntry.attempts >= 2 && !validationEntry.isValidated) {
            const successfulRuns = validationEntry.fitResults.filter(fit => fit).length;
            if (successfulRuns >= 2) {
                // Early success - agent has proven itself with 2 good runs
                const avgScore = validationEntry.scores.reduce((a, b) => a + b, 0) / validationEntry.scores.length;
                this.logger.info(`[VALIDATION] 🎉 ${geneId} PASSED EARLY VALIDATION (2/${validationEntry.attempts} runs passed, avg: ${avgScore.toFixed(1)})`);

                validationEntry.isValidated = true;

                // Show toast notification
                this.toast.showValidationPassed(geneId, avgScore, validationEntry.scores, validationEntry.fitResults, validationEntry.attempts);

                const validationRecord = {
                    id: `${geneId}_${Date.now()}`,
                    geneId: validationEntry.geneId,
                    fitness: avgScore,
                    weights: validationEntry.weights,
                    specializationType: validationEntry.specializationType,
                    fit: true,
                    getWeights: () => validationEntry.weights
                };

                // Release spawn lock on successful validation
                this.releaseSpawnLock(geneId);

                // Mark this lineage as validated to prevent descendants from needing validation
                this.simulation.validatedLineages.add(validationEntry.geneId);

                // Clean up immediately after successful validation
                this.validationQueue.delete(geneId);

                return { success: true, record: validationRecord };
            }
        }

        // Check if agent has completed required validation runs (full 3-run cycle)
        if (validationEntry.attempts >= VALIDATION_REQUIRED_RUNS && !validationEntry.isValidated) {
            const avgScore = validationEntry.scores.reduce((a, b) => a + b, 0) / validationEntry.scores.length;
            const bestScore = Math.max(...validationEntry.scores);
            const successfulRuns = validationEntry.fitResults.filter(fit => fit).length;

            this.logger.info(`[VALIDATION] ${geneId} validation complete:`);
                validationEntry.scores.forEach((score, index) => {
                    const fit = validationEntry.fitResults[index];
                    const status = score === bestScore ? '🏆 BEST' : fit ? '✅ FIT' : '❌ LOW';
                    this.logger.info(`  ├── Run ${index + 1}: ${score.toFixed(1)} ${status}`);
                });
            this.logger.info(`  └── Results: ${successfulRuns}/${VALIDATION_REQUIRED_RUNS} runs passed | Average: ${avgScore.toFixed(1)}`);

            if (successfulRuns >= 2) { // Require at least 2 out of 3 runs to be successful
                // Agent passed validation - return validation record for gene pool saving
                validationEntry.isValidated = true;
                this.logger.info(`[VALIDATION] 🎉 ${geneId} PASSED VALIDATION (avg: ${avgScore.toFixed(1)})`);

                // Show toast notification
                this.toast.showValidationPassed(geneId, avgScore, validationEntry.scores, validationEntry.fitResults, validationEntry.attempts);

                // Create a validation record to save
                const validationRecord = {
                    id: `${geneId}_${Date.now()}`, // Generate unique ID for validated agent
                    geneId: validationEntry.geneId,
                    fitness: avgScore, // Use average score
                    weights: validationEntry.weights, // Use stored weights
                    specializationType: validationEntry.specializationType,
                    fit: true, // Mark as qualified for gene pool
                    getWeights: () => validationEntry.weights // Return stored weights
                };

                // Release spawn lock on successful validation
                this.releaseSpawnLock(geneId);

                // Mark this lineage as validated to prevent descendants from needing validation
                this.simulation.validatedLineages.add(validationEntry.geneId);

                // Clean up immediately after successful validation
                this.validationQueue.delete(geneId);

                return { success: true, record: validationRecord };
            } else {
                // Agent failed validation - mark as failed and remove from queue
                this.logger.info(`[VALIDATION] 💥 ${geneId} FAILED VALIDATION (${successfulRuns}/${VALIDATION_REQUIRED_RUNS} fit runs)`);
                validationEntry.isValidated = false;

                // Show toast notification for failed validation
                this.toast.showValidationFailed(geneId, avgScore, validationEntry.scores, validationEntry.fitResults, validationEntry.attempts);

                // Remove failed agent from validation queue
                this.logger.info(`[VALIDATION] 🗑️ Removing failed agent ${geneId} from validation queue`);
                this.validationQueue.delete(geneId);
                this.releaseSpawnLock(geneId);
            }
        } else if (!validationEntry.isValidated) {
            // Still in progress
            const progress = `${validationEntry.attempts}/${VALIDATION_REQUIRED_RUNS}`;
            this.logger.info(`[VALIDATION] ${geneId} progress: ${progress} runs completed`);
        }

        return { success: false };
    }

    // Clean up the validation queue (remove old/stale entries)
    cleanupValidationQueue() {
        const now = Date.now();
        const entries = Array.from(this.validationQueue.entries());

        // Priority 1: Remove agents that should be removed based on validation logic
        const shouldRemoveEntries = entries.map(([geneId, entry]) => {
            const reason = this.shouldRemoveFromQueue(entry);
            return { geneId, entry, reason };
        }).filter(item => item.reason !== false);

        shouldRemoveEntries.forEach(({ geneId, reason }) => {
            this.logger.info(`[VALIDATION] 🗑️ Removed ${geneId} from validation queue (${reason})`);
            this.validationQueue.delete(geneId);
            // Release spawn lock if it exists
            this.releaseSpawnLock(geneId);
        });

        // Priority 2: Check for agents that have been marked as active test but haven't progressed
        // This prevents validation from getting permanently blocked on slow/stuck agents
        const twoMinutesAgo = now - (2 * 60 * 1000); // 2 minutes - reset if no living agent (died without cleanup)

        for (const [geneId, entry] of this.validationQueue.entries()) {
            if (entry.isActiveTest) {
                // Check if there's actually a living agent with this geneId in the simulation
                let livingAgentExists = false;
                if (this.simulation && this.simulation.agents) {
                    for (const agent of this.simulation.agents) {
                        if (!agent.isDead && agent.geneId === geneId) {
                            livingAgentExists = true;
                            break;
                        }
                    }
                }

                if (!livingAgentExists && entry.lastValidationTime < twoMinutesAgo) {
                    // No living agent found after 2+ minutes - agent likely died/stuck, safe to reset
                    this.logger.warn(`[VALIDATION] ⚠️ Resetting stuck active test flag for ${geneId} (no living agent after 2+ minutes)`);
                    entry.isActiveTest = false;
                    this.releaseSpawnLock(geneId);
                } else if (livingAgentExists && entry.lastValidationTime < twoMinutesAgo) {
                    // Living agent exists, been testing 2+ minutes - monitor but don't reset yet
                    this.logger.debug(`[VALIDATION] ⏱️ Validation agent for ${geneId} still active after 2+ minutes (monitoring)`);
                }
                // If living agent exists and < 2 minutes, continue normal operation
            }
        }

        // Priority 3: Aggressive queue size management - prioritize stuck agents
        if (this.validationQueue.size > MAX_VALIDATION_QUEUE_SIZE) {
            const remainingEntries = Array.from(this.validationQueue.entries());

            // First, try to remove stuck agents (high attempt count)
            const stuckAgents = remainingEntries
                .filter(([_, entry]) => entry.attempts >= VALIDATION_REQUIRED_RUNS + 1 && !entry.isValidated)
                .sort(([_, a], [__, b]) => b.attempts - a.attempts) // Remove highest attempt count first
                .slice(0, Math.min(5, remainingEntries.length));

            if (stuckAgents.length > 0) {
                stuckAgents.forEach(([geneId, entry]) => {
                    this.logger.info(`[VALIDATION] 🗑️ Removed stuck ${geneId} from validation queue (high attempts: ${entry.attempts})`);
                    this.validationQueue.delete(geneId);
                    this.releaseSpawnLock(geneId);
                });
            }

            // If still over limit, remove oldest entries
            if (this.validationQueue.size > MAX_VALIDATION_QUEUE_SIZE) {
                const oldestEntries = Array.from(this.validationQueue.entries())
                    .filter(([_, entry]) => !entry.isValidated)
                    .sort(([_, a], [__, b]) => a.lastValidationTime - b.lastValidationTime)
                    .slice(0, Math.min(10, this.validationQueue.size - MAX_VALIDATION_QUEUE_SIZE));

                oldestEntries.forEach(([geneId, entry]) => {
                    this.logger.info(`[VALIDATION] 🗑️ Removed ${geneId} from validation queue (queue full, attempts: ${entry.attempts}/${VALIDATION_REQUIRED_RUNS})`);
                    this.validationQueue.delete(geneId);
                    this.releaseSpawnLock(geneId);
                });
            }
        }

        // Priority 4: Clean up very old entries (10+ minutes since last validation attempt)
        const tenMinutesAgo = now - VALIDATION_CLEANUP_TIMEOUT_MS;
        for (const [geneId, entry] of this.validationQueue.entries()) {
            if (entry.lastValidationTime < tenMinutesAgo && !entry.isValidated) {
                this.logger.info(`[VALIDATION] ⏰ Removed stale ${geneId} from validation queue (10+ minutes old, attempts: ${entry.attempts})`);
                this.validationQueue.delete(geneId);
                this.releaseSpawnLock(geneId);
            }
        }

        // Priority 5: Resync active validation agents counter to prevent drift
        if (this.simulation) {
            this.resyncActiveAgentsCount(this.simulation);
        }
    }

    // Get validation statistics
    getStats(simulation) {
        // Get accurate count of living validation agents
        let actualValidationAgents = 0;
        if (simulation && simulation.agents) {
            for (const agent of simulation.agents) {
                if (!agent.isDead && this.isInValidation(agent.geneId)) {
                    actualValidationAgents++;
                }
            }
        }

        return {
            queueSize: this.validationQueue.size,
            activeAgents: this.activeValidationAgents,
            actualActiveAgents: actualValidationAgents,
            spawnLocks: this.spawnLocks.size
        };
    }

    // Resync active validation agents counter with actual living agents
    resyncActiveAgentsCount(simulation) {
        if (!simulation || !simulation.agents) return;

        let actualCount = 0;
        for (const agent of simulation.agents) {
            if (!agent.isDead && this.isInValidation(agent.geneId)) {
                actualCount++;
            }
        }

        if (actualCount !== this.activeValidationAgents) {
            this.logger.info(`[VALIDATION] Resyncing counter: ${this.activeValidationAgents} → ${actualCount}`);
            this.activeValidationAgents = actualCount;
        }

        return actualCount;
    }

    // Check if an agent is currently in validation
    isInValidation(geneId) {
        return this.validationQueue.has(geneId);
    }

    // Spawn lock management to prevent race conditions
    acquireSpawnLock(geneId) {
        if (this.spawnLocks.has(geneId)) {
            this.logger.debug(`[VALIDATION] 🔒 Spawn lock already held for ${geneId}`);
            return false; // Already locked
        }
        this.spawnLocks.add(geneId);
        this.logger.debug(`[VALIDATION] 🔓 Acquired spawn lock for ${geneId}`);
        return true;
    }

    releaseSpawnLock(geneId) {
        const wasLocked = this.spawnLocks.has(geneId);
        this.spawnLocks.delete(geneId);
        if (wasLocked) {
            this.logger.debug(`[VALIDATION] 🔒 Released spawn lock for ${geneId}`);
        } else {
            this.logger.warn(`[VALIDATION] ⚠️ Attempted to release spawn lock for ${geneId} but it wasn't locked`);
        }
    }

    isSpawnLocked(geneId) {
        return this.spawnLocks.has(geneId);
    }

    // Handle validation agent death
    handleValidationDeath(agent, db) {
        // Safety check: Ensure agent is valid before processing
        if (!agent || !agent.nn) {
            this.logger.warn(`[VALIDATION] ❌ Cannot process validation death - agent ${agent?.geneId || 'unknown'} or neural network is null/invalid`);
            // If this was supposed to be a validation agent, clean up the queue entry
            if (agent && agent.geneId && this.validationQueue.has(agent.geneId)) {
                this.logger.warn(`[VALIDATION] 🗑️ Removing invalid validation entry for ${agent.geneId}`);
                this.validationQueue.delete(agent.geneId);
                this.releaseSpawnLock(agent.geneId);
                // Decrement counter if this was an active validation agent
                if (this.activeValidationAgents > 0) {
                    this.activeValidationAgents--;
                }
            }
            // Safe to cleanup invalid agent
            if (agent) {
                agent.cleanup();
            }
            return false;
        }

        // Additional safety check: Ensure neural network can provide valid weights
        try {
            const testWeights = agent.getWeights();
            const isValidWeights = testWeights &&
                typeof testWeights === 'object' &&
                testWeights.weights1 && testWeights.weights2 &&
                Array.isArray(testWeights.weights1) && Array.isArray(testWeights.weights2) &&
                testWeights.weights1.length > 0 && testWeights.weights2.length > 0;

            if (!isValidWeights) {
                this.logger.warn(`[VALIDATION] ❌ Cannot process validation death - agent ${agent?.geneId || 'unknown'}  neural network has invalid weights format`);
                this.logger.warn(`[VALIDATION] Expected: {weights1: [...], weights2: [...]}, Got:`, testWeights);
                // Clean up this corrupted validation entry
                if (this.validationQueue.has(agent.geneId)) {
                    this.logger.warn(`[VALIDATION] 🗑️ Removing corrupted validation entry for ${agent.geneId}`);
                    this.validationQueue.delete(agent.geneId);
                    this.releaseSpawnLock(agent.geneId);
                    if (this.activeValidationAgents > 0) {
                        this.activeValidationAgents--;
                    }
                }
                agent.cleanup();
                return false;
            }
        } catch (error) {
            this.logger.warn(`[VALIDATION] ❌ Cannot process validation death ${agent?.geneId || 'unknown'}  - error getting weights: ${error.message}`);
            // Clean up this corrupted validation entry
            if (this.validationQueue.has(agent.geneId)) {
                this.logger.warn(`[VALIDATION] 🗑️ Removing corrupted validation entry for ${agent.geneId}`);
                this.validationQueue.delete(agent.geneId);
                this.releaseSpawnLock(agent.geneId);
                if (this.activeValidationAgents > 0) {
                    this.activeValidationAgents--;
                }
            }
            agent.cleanup();
            return false;
        }

        if (this.validationQueue.has(agent.geneId)) {
            const validationEntry = this.validationQueue.get(agent.geneId);
            this.logger.info(`[VALIDATION] 💥 Validation agent ${agent.id} (${agent.geneId}) died, validation run completed (fitness: ${agent.fitness.toFixed(1)}, fit: ${agent.fit}, attempts: ${validationEntry.attempts}/${VALIDATION_REQUIRED_RUNS})`);

            // Safety: Ensure active validation agents counter doesn't go negative
            if (this.activeValidationAgents > 0) {
                this.activeValidationAgents--; // Decrement counter when validation agent dies
            } else {
                this.logger.warn(`[VALIDATION] ⚠️ Active validation agents counter was already 0, possible sync issue`);
            }

            validationEntry.isActiveTest = false; // Clear active test flag
            this.logger.info(`[VALIDATION] Active validation agents: ${this.activeValidationAgents}, cleared active test flag for agent ${agent.id} (${agent.geneId})`);

            // Always release spawn lock on death to prevent permanent locks
            this.releaseSpawnLock(agent.geneId);

            // Process this validation run using standard logic
            const result = this.addToValidationQueue(agent, false, true);
            if (result.success) {
                // Agent passed validation through normal means
                this.logger.info(`[VALIDATION] ✅ Validated agent ${agent.id} (${agent.geneId}) passed validation, queueing for save`);
                db.queueSaveAgent(result.record);
                this.validationQueue.delete(agent.geneId);
                // Spawn lock already released above

                // Safe to cleanup now that validation is complete and agent is saved
                agent.cleanup();
            } else if (result === false) {
                // Agent was skipped (already in gene pool) - this shouldn't happen for validation agents
                this.logger.warn(`[VALIDATION] ⚠️ Validation agent ${agent.id} (${agent.geneId}) was skipped during death processing (already in gene pool?)`);
                // Still remove from queue to prevent getting stuck
                this.validationQueue.delete(agent.geneId);

                // Safe to cleanup since validation is not needed
                agent.cleanup();
            } else {
                // Still in progress or validation ongoing - DON'T cleanup, agent will be respawned
                this.logger.info(`[VALIDATION] Validation agent ${agent.id} (${agent.geneId}) death processed, validation continues (${validationEntry.attempts}/${VALIDATION_REQUIRED_RUNS} runs)`);
            }
            return true;
        }
        return false;
    }

    // Determine if a validation entry should be removed from the queue
    shouldRemoveFromQueue(validationEntry) {
        // Remove if completed required runs but failed validation
        if (validationEntry.attempts >= VALIDATION_REQUIRED_RUNS) {
            const successfulRuns = validationEntry.fitResults.filter(fit => fit).length;
            if (successfulRuns < 2) {
                return `failed validation (${successfulRuns}/${VALIDATION_REQUIRED_RUNS} fit runs)`;
            }
        }

        // Remove if too many attempts without success (stuck agents)
        if (validationEntry.attempts >= VALIDATION_REQUIRED_RUNS + 2) {
            return `too many attempts (${validationEntry.attempts}), likely stuck`;
        }

        // Remove if validated but still in queue (shouldn't happen but safety check)
        if (validationEntry.isValidated) {
            return `already validated but still in queue`;
        }

        // Remove if entry has been inactive for too long without making progress
        const now = Date.now();
        const timeSinceLastAttempt = now - validationEntry.lastValidationTime;
        if (timeSinceLastAttempt > VALIDATION_CLEANUP_TIMEOUT_MS && validationEntry.attempts > 0) {
            return `inactive for ${Math.floor(timeSinceLastAttempt / 60000)} minutes`;
        }

        // Keep if still has potential for validation
        return false;
    }
}
