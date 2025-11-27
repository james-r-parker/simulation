// --- VALIDATION SYSTEM ---
// Manages multi-run testing and validation of promising agents

import {
    VALIDATION_REQUIRED_RUNS,
    VALIDATION_FITNESS_THRESHOLD,
    MAX_VALIDATION_QUEUE_SIZE,
    VALIDATION_COOLDOWN_MS,
    VALIDATION_CLEANUP_TIMEOUT_MS
} from './constants.js';
import { toast } from './toast.js';

export class ValidationManager {
    constructor(logger, db) {
        this.logger = logger;
        this.db = db;
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

        // Check if this geneId is already in the gene pool - if so, skip validation and save directly
        // But skip this check for validation run processing (when skipGenePoolCheck = true)
        if (!skipGenePoolCheck && this.db.pool[geneId]) {
            console.log(`[VALIDATION] ⏭️ Skipping validation for ${geneId} - already in gene pool, saving directly`);
            // Note: We can't push to deadAgentQueue here as it's not available in this class
            // The caller should handle this case
            return false; // Indicate that validation was skipped
        }

        if (!this.validationQueue.has(geneId)) {
            this.validationQueue.set(geneId, {
                geneId: geneId,
                attempts: 0,
                scores: [],
                lastValidationTime: 0,
                isValidated: false,
                isActiveTest: false, // Flag to prevent duplicate spawns during active testing
                weights: agent.getWeights(), // Store weights directly to avoid agent reference issues
                specializationType: agent.specializationType || 'forager'
            });
            console.log(`[VALIDATION] 🆕 ${geneId} (ID: ${agent.id}) entered validation system`);
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

        // Enhanced logging for validation runs
        const currentFitness = agent.fitness;
        const source = isPeriodicValidation ? 'periodic' : 'death';
        const runNumber = validationEntry.attempts;

        console.log(`[VALIDATION] ${geneId} (ID: ${agent.id}) - Run ${runNumber}: Fitness ${currentFitness.toFixed(1)} (${source})`);

        // Check for early success after 2 runs
        if (validationEntry.attempts >= 2 && !validationEntry.isValidated) {
            const successfulRuns = validationEntry.scores.filter(score => score >= VALIDATION_FITNESS_THRESHOLD).length;
            if (successfulRuns >= 2) {
                // Early success - agent has proven itself with 2 good runs
                const avgScore = validationEntry.scores.reduce((a, b) => a + b, 0) / validationEntry.scores.length;
                console.log(`[VALIDATION] 🎉 ${geneId} PASSED EARLY VALIDATION (2/${validationEntry.attempts} runs passed, avg: ${avgScore.toFixed(1)})`);

                validationEntry.isValidated = true;

                // Show toast notification
                this.toast.showValidationPassed(geneId, avgScore, validationEntry.scores, validationEntry.attempts);

                const validationRecord = {
                    id: `${geneId}_${Date.now()}`,
                    geneId: validationEntry.geneId,
                    fitness: avgScore,
                    weights: validationEntry.weights,
                    specializationType: validationEntry.specializationType,
                    fit: true,
                    getWeights: () => validationEntry.weights
                };
                return { success: true, record: validationRecord };
            }
        }

        // Check if agent has completed required validation runs (full 3-run cycle)
        if (validationEntry.attempts >= VALIDATION_REQUIRED_RUNS && !validationEntry.isValidated) {
            const avgScore = validationEntry.scores.reduce((a, b) => a + b, 0) / validationEntry.scores.length;
            const bestScore = Math.max(...validationEntry.scores);
            const successfulRuns = validationEntry.scores.filter(score => score >= VALIDATION_FITNESS_THRESHOLD).length;

            console.log(`[VALIDATION] ${geneId} validation complete:`);
            validationEntry.scores.forEach((score, index) => {
                const status = score === bestScore ? '🏆 BEST' : score >= VALIDATION_FITNESS_THRESHOLD ? '✅ PASS' : '❌ LOW';
                console.log(`  ├── Run ${index + 1}: ${score.toFixed(1)} ${status}`);
            });
            console.log(`  └── Results: ${successfulRuns}/${VALIDATION_REQUIRED_RUNS} runs passed | Average: ${avgScore.toFixed(1)}`);

            if (successfulRuns >= 2) { // Require at least 2 out of 3 runs to be successful
                // Agent passed validation - return validation record for gene pool saving
                validationEntry.isValidated = true;
                console.log(`[VALIDATION] 🎉 ${geneId} PASSED VALIDATION (avg: ${avgScore.toFixed(1)})`);

                // Show toast notification
                this.toast.showValidationPassed(geneId, avgScore, validationEntry.scores, validationEntry.attempts);

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

                return { success: true, record: validationRecord };
            } else {
                // Agent failed validation - mark as failed and remove from queue
                console.log(`[VALIDATION] 💥 ${geneId} FAILED VALIDATION (avg: ${avgScore.toFixed(1)} < ${VALIDATION_FITNESS_THRESHOLD})`);
                validationEntry.isValidated = false;

                // Show toast notification for failed validation
                this.toast.showValidationFailed(geneId, avgScore, validationEntry.scores, validationEntry.attempts);

                // Remove failed agent from validation queue
                console.log(`[VALIDATION] 🗑️ Removing failed agent ${geneId} from validation queue`);
                this.validationQueue.delete(geneId);
                this.releaseSpawnLock(geneId);
            }
        } else if (!validationEntry.isValidated) {
            // Still in progress
            const progress = `${validationEntry.attempts}/${VALIDATION_REQUIRED_RUNS}`;
            console.log(`[VALIDATION] ${geneId} progress: ${progress} runs completed`);
        }

        // Clean up validated entries after some time
        if (validationEntry.isValidated && validationEntry.attempts > VALIDATION_REQUIRED_RUNS + 2) {
            console.log(`[VALIDATION] 🧹 Cleaned up validated agent ${geneId} from queue (completed validation)`);
            this.validationQueue.delete(geneId);
        }

        return { success: false };
    }

    // Clean up the validation queue (remove old/stale entries)
    cleanupValidationQueue() {
        const now = Date.now();
        const entries = Array.from(this.validationQueue.entries());

        // Priority 1: Remove agents that should be removed based on validation logic
        const shouldRemoveEntries = entries.filter(([geneId, entry]) => {
            const reason = this.shouldRemoveFromQueue(entry);
            return reason !== false;
        });

        shouldRemoveEntries.forEach(([geneId, entry]) => {
            const reason = this.shouldRemoveFromQueue(entry);
            console.log(`[VALIDATION] 🗑️ Removed ${geneId} from validation queue (${reason})`);
            this.validationQueue.delete(geneId);
            // Release spawn lock if it exists
            this.releaseSpawnLock(geneId);
        });

        // Priority 2: Aggressive queue size management - prioritize stuck agents
        if (this.validationQueue.size > MAX_VALIDATION_QUEUE_SIZE) {
            const remainingEntries = Array.from(this.validationQueue.entries());

            // First, try to remove stuck agents (high attempt count)
            const stuckAgents = remainingEntries
                .filter(([_, entry]) => entry.attempts >= VALIDATION_REQUIRED_RUNS + 1 && !entry.isValidated)
                .sort(([_, a], [__, b]) => b.attempts - a.attempts) // Remove highest attempt count first
                .slice(0, Math.min(5, remainingEntries.length));

            if (stuckAgents.length > 0) {
                stuckAgents.forEach(([geneId, entry]) => {
                    console.log(`[VALIDATION] 🗑️ Removed stuck ${geneId} from validation queue (high attempts: ${entry.attempts})`);
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
                    console.log(`[VALIDATION] 🗑️ Removed ${geneId} from validation queue (queue full, attempts: ${entry.attempts}/${VALIDATION_REQUIRED_RUNS})`);
                    this.validationQueue.delete(geneId);
                    this.releaseSpawnLock(geneId);
                });
            }
        }

        // Priority 3: Clean up very old entries (10+ minutes since last validation attempt)
        const tenMinutesAgo = now - VALIDATION_CLEANUP_TIMEOUT_MS;
        for (const [geneId, entry] of this.validationQueue.entries()) {
            if (entry.lastValidationTime < tenMinutesAgo && !entry.isValidated) {
                console.log(`[VALIDATION] ⏰ Removed stale ${geneId} from validation queue (10+ minutes old, attempts: ${entry.attempts})`);
                this.validationQueue.delete(geneId);
                this.releaseSpawnLock(geneId);
            }
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
            console.log(`[VALIDATION] Resyncing counter: ${this.activeValidationAgents} → ${actualCount}`);
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
            return false; // Already locked
        }
        this.spawnLocks.add(geneId);
        return true;
    }

    releaseSpawnLock(geneId) {
        this.spawnLocks.delete(geneId);
    }

    isSpawnLocked(geneId) {
        return this.spawnLocks.has(geneId);
    }

    // Handle validation agent death
    handleValidationDeath(agent, db) {
        if (this.validationQueue.has(agent.geneId)) {
            const validationEntry = this.validationQueue.get(agent.geneId);
            console.log(`[VALIDATION] 💥 Validation agent ${agent.geneId} died, validation run completed (fitness: ${agent.fitness.toFixed(1)}, attempts: ${validationEntry.attempts}/${VALIDATION_REQUIRED_RUNS})`);
            this.activeValidationAgents--; // Decrement counter when validation agent dies
            validationEntry.isActiveTest = false; // Clear active test flag
            console.log(`[VALIDATION] Active validation agents: ${this.activeValidationAgents}, cleared active test flag for ${agent.geneId}`);

            // SPECIAL HANDLING: If agent dies with fitness above threshold, count it as a pass
            if (agent.fitness >= VALIDATION_FITNESS_THRESHOLD) {
                console.log(`[VALIDATION] 💀 Agent ${agent.geneId} died but achieved fitness ${agent.fitness.toFixed(1)} >= ${VALIDATION_FITNESS_THRESHOLD} - counting as successful run`);

                // Force this run to be recorded as successful
                validationEntry.attempts++;
                validationEntry.scores.push(agent.fitness);
                validationEntry.lastValidationTime = Date.now();

                // Check if this gives us enough successful runs for validation
                const successfulRuns = validationEntry.scores.filter(score => score >= VALIDATION_FITNESS_THRESHOLD).length;

                if (successfulRuns >= 2 || (validationEntry.attempts >= VALIDATION_REQUIRED_RUNS && successfulRuns >= 2)) {
                    // Agent now has enough successful runs to pass validation
                    const avgScore = validationEntry.scores.reduce((a, b) => a + b, 0) / validationEntry.scores.length;
                    console.log(`[VALIDATION] 🎉 ${agent.geneId} PASSED VALIDATION from death (death counted as pass, ${successfulRuns}/${validationEntry.attempts} runs successful, avg: ${avgScore.toFixed(1)})`);

                    validationEntry.isValidated = true;
                    this.toast.showValidationPassed(agent.geneId, avgScore, validationEntry.scores, validationEntry.attempts);

                    const validationRecord = {
                        id: `${agent.geneId}_${Date.now()}`,
                        geneId: validationEntry.geneId,
                        fitness: avgScore,
                        weights: validationEntry.weights,
                        specializationType: validationEntry.specializationType,
                        fit: true,
                        getWeights: () => validationEntry.weights
                    };

                    db.queueSaveAgent(validationRecord);
                    this.validationQueue.delete(agent.geneId);
                } else {
                    // Not enough successful runs yet, keep in queue for potential respawn
                    console.log(`[VALIDATION] Agent ${agent.geneId} death counted as pass but needs more runs (${successfulRuns}/${Math.max(2, validationEntry.attempts)} successful needed)`);
                }
            } else {
                // Agent died with insufficient fitness - process normally
                console.log(`[VALIDATION] Agent ${agent.geneId} died with insufficient fitness ${agent.fitness.toFixed(1)} < ${VALIDATION_FITNESS_THRESHOLD} - processing as normal validation attempt`);
                const result = this.addToValidationQueue(agent, false, true);
                if (result.success) {
                    // Agent passed validation through normal means
                    console.log(`[VALIDATION] ✅ Validated agent ${agent.geneId} passed through normal validation, queueing for save`);
                    db.queueSaveAgent(result.record);
                    this.validationQueue.delete(agent.geneId);
                } else {
                    // Agent failed validation - remove from queue
                    console.log(`[VALIDATION] 🗑️ Removing failed validation agent ${agent.geneId} from queue (died with insufficient fitness)`);
                    this.validationQueue.delete(agent.geneId);
                }
            }
            return true;
        }
        return false;
    }

    // Determine if a validation entry should be removed from the queue
    shouldRemoveFromQueue(validationEntry) {
        // Remove if already validated (shouldn't happen here but safety check)
        if (validationEntry.isValidated) {
            return 'already validated';
        }

        // Remove if completed required runs but failed validation
        if (validationEntry.attempts >= VALIDATION_REQUIRED_RUNS) {
            const successfulRuns = validationEntry.scores.filter(score => score >= VALIDATION_FITNESS_THRESHOLD).length;
            if (successfulRuns < 2) {
                return `failed validation (${successfulRuns}/${VALIDATION_REQUIRED_RUNS} successful runs)`;
            }
        }

        // Remove if too many attempts without success (stuck agents)
        if (validationEntry.attempts >= VALIDATION_REQUIRED_RUNS + 2) {
            return `too many attempts (${validationEntry.attempts}), likely stuck`;
        }

        // Keep if still has potential for validation
        return false;
    }
}
