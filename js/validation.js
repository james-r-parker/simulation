// --- VALIDATION SYSTEM ---
// Manages multi-run testing and validation of promising agents

import { VALIDATION_REQUIRED_RUNS, VALIDATION_FITNESS_THRESHOLD, MAX_VALIDATION_QUEUE_SIZE } from './constants.js';
import { toast } from './toast.js';

export class ValidationManager {
    constructor(logger, db) {
        this.logger = logger;
        this.db = db;
        this.validationQueue = new Map(); // geneId -> validation entry
        this.activeValidationAgents = 0; // Count of currently living validation agents
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
        if (currentTime - validationEntry.lastValidationTime < 5000) { // 5 second cooldown
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
                // Agent failed validation - mark as failed
                console.log(`[VALIDATION] 💥 ${geneId} FAILED VALIDATION (avg: ${avgScore.toFixed(1)} < ${VALIDATION_FITNESS_THRESHOLD})`);
                validationEntry.isValidated = false;
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
        // Aggressive queue size management
        if (this.validationQueue.size > MAX_VALIDATION_QUEUE_SIZE) {
            // Remove oldest non-validated entries first
            const entries = Array.from(this.validationQueue.entries());
            const toRemove = entries
                .filter(([_, entry]) => !entry.isValidated)
                .sort(([_, a], [__, b]) => a.lastValidationTime - b.lastValidationTime)
                .slice(0, Math.min(10, this.validationQueue.size - MAX_VALIDATION_QUEUE_SIZE)); // Remove up to 10 at a time

            toRemove.forEach(([geneId, entry]) => {
                console.log(`[VALIDATION] 🗑️ Removed ${geneId} from validation queue (queue full, attempts: ${entry.attempts}/${VALIDATION_REQUIRED_RUNS})`);
                this.validationQueue.delete(geneId);
            });
        }

        // Also clean up very old entries (5+ minutes since last validation attempt)
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        for (const [geneId, entry] of this.validationQueue.entries()) {
            if (entry.lastValidationTime < fiveMinutesAgo && !entry.isValidated) {
                console.log(`[VALIDATION] ⏰ Removed stale ${geneId} from validation queue (5+ minutes old)`);
                this.validationQueue.delete(geneId);
            }
        }
    }

    // Get validation statistics
    getStats() {
        const actualValidationAgents = this.activeValidationAgents; // This would need to be passed from outside
        return {
            queueSize: this.validationQueue.size,
            activeAgents: this.activeValidationAgents
        };
    }

    // Check if an agent is currently in validation
    isInValidation(geneId) {
        return this.validationQueue.has(geneId);
    }

    // Handle validation agent death
    handleValidationDeath(agent, db) {
        if (this.validationQueue.has(agent.geneId)) {
            const validationEntry = this.validationQueue.get(agent.geneId);
            console.log(`[VALIDATION] 💥 Validation agent ${agent.geneId} died, validation run completed (fitness: ${agent.fitness.toFixed(1)}, attempts: ${validationEntry.attempts}/${VALIDATION_REQUIRED_RUNS})`);
            this.activeValidationAgents--; // Decrement counter when validation agent dies
            validationEntry.isActiveTest = false; // Clear active test flag
            console.log(`[VALIDATION] Active validation agents: ${this.activeValidationAgents}, cleared active test flag for ${agent.geneId}`);

            // Process the validation result (skip gene pool check since this is validation completion)
            const result = this.addToValidationQueue(agent, false, true);
            if (result.success) {
                // Agent passed validation, queue for gene pool save
                console.log(`[VALIDATION] ✅ Validated agent ${agent.geneId} passed, queueing for save`);
                db.queueSaveAgent(result.record);
            }

            // Only remove from validation queue if it has failed multiple times
            if (validationEntry.attempts >= VALIDATION_REQUIRED_RUNS) {
                this.validationQueue.delete(agent.geneId);
            } else {
                console.log(`[VALIDATION] Keeping ${agent.geneId} in queue for another attempt (${validationEntry.attempts}/${VALIDATION_REQUIRED_RUNS})`);
            }
            return true;
        }
        return false;
    }
}
