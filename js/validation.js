// --- VALIDATION SYSTEM ---
// Manages multi-run testing and validation of promising agents

import {
    VALIDATION_REQUIRED_RUNS,
    MAX_VALIDATION_QUEUE_SIZE,
    VALIDATION_COOLDOWN_MS,
    VALIDATION_CLEANUP_TIMEOUT_MS,
    MIN_FITNESS_TO_SAVE_GENE_POOL,
    MIN_FOOD_EATEN_TO_SAVE_GENE_POOL,
    MIN_SECONDS_ALIVE_TO_SAVE_GENE_POOL,
    MIN_EXPLORATION_PERCENTAGE_TO_SAVE_GENE_POOL,
    MIN_TURNS_TOWARDS_FOOD_TO_SAVE_GENE_POOL,
    MAX_AGENTS_TO_SAVE_PER_GENE_POOL,
    EXPLORATION_GRID_WIDTH,
    EXPLORATION_GRID_HEIGHT
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

        // CRITICAL: When skipGenePoolCheck is true (death processing), the agent may already be cleaned up
        // In this case, we use the stored validation entry data instead of agent.nn
        const isDeathProcessing = skipGenePoolCheck && this.validationQueue.has(geneId);

        // Safety check: Ensure agent exists
        if (!agent) {
            this.logger.warn(`[VALIDATION] ❌ Cannot add agent to validation queue - agent is null`);
            return false;
        }

        // Try to get weights - this will work even if neural network is cleaned up
        // as long as getWeights() method is still available
        let weights = null;
        try {
            weights = agent.getWeights();
        } catch (error) {
            // If getWeights fails, check if neural network exists
            if (!agent.nn && !isDeathProcessing) {
                this.logger.warn(`[VALIDATION] ❌ Cannot add agent to validation queue - no neural network and getWeights() failed: ${error.message}`);
                return false;
            }
            // If it's death processing, we'll use stored weights from validation entry
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
                // Use weights we extracted earlier, or try to get them again
                if (!weights) {
                    weights = agent.getWeights();
                }

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
                    criteriaDetails: [], // Track which criteria passed/failed in each run
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

        // Extract detailed criteria information for this run
        const criteriaDetails = this.getCriteriaDetails(agent);
        validationEntry.criteriaDetails.push(criteriaDetails);

        // Enhanced logging for validation runs
        const currentFitness = agent.fitness;
        const source = isPeriodicValidation ? 'periodic' : 'death';
        const runNumber = validationEntry.attempts;

        // Detailed logging with criteria breakdown
        const criteriaStatus = criteriaDetails.criteria.map((c, i) => {
            const names = ['Fitness', 'Food', 'Age', 'Exploration', 'Navigation'];
            return `${names[i]}: ${c.passed ? '✅' : '❌'} (${c.value.toFixed(1)}/${c.threshold.toFixed(1)})`;
        }).join(' | ');
        
        this.logger.info(`[VALIDATION] ${geneId} (ID: ${agent.id}) - Run ${runNumber}: Fitness ${currentFitness.toFixed(1)} (${source})`);
        this.logger.info(`[VALIDATION] ${geneId} - Run ${runNumber} Criteria: ${criteriaStatus}`);
        this.logger.info(`[VALIDATION] ${geneId} - Run ${runNumber} Summary: ${criteriaDetails.criteriaMet}/5 criteria met, Fit: ${agent.fit ? 'YES' : 'NO'}`);

        // Check for early success after 2 runs
        if (validationEntry.attempts >= 2 && !validationEntry.isValidated) {
            const successfulRuns = validationEntry.fitResults.filter(fit => fit).length;
            if (successfulRuns >= 2) {
                // Early success - agent has proven itself with 2 good runs
                const avgScore = validationEntry.scores.reduce((a, b) => a + b, 0) / validationEntry.scores.length;
                this.logger.info(`[VALIDATION] ========================================`);
                this.logger.info(`[VALIDATION] 🎉 ${geneId} PASSED EARLY VALIDATION`);
                this.logger.info(`[VALIDATION] ========================================`);
                this.logger.info(`[VALIDATION] Early Success: ${successfulRuns}/${validationEntry.attempts} runs passed | Average Fitness: ${avgScore.toFixed(1)}`);
                
                // Log criteria details for successful runs
                validationEntry.scores.forEach((score, index) => {
                    if (validationEntry.fitResults[index]) {
                        const criteriaDetails = validationEntry.criteriaDetails[index];
                        if (criteriaDetails) {
                            const criteriaStatus = criteriaDetails.criteria.map(c => {
                                return `${c.name}: ${c.passed ? '✅' : '❌'} (${c.value.toFixed(1)}/${c.threshold.toFixed(1)})`;
                            }).join(' | ');
                            this.logger.info(`[VALIDATION] Run ${index + 1} (PASS): ${criteriaStatus}`);
                        }
                    }
                });
                this.logger.info(`[VALIDATION] ========================================`);

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

                // Queue save to IndexedDB - this will handle all limit checks and pool management
                // This ensures the agent goes through the same validation as all other agents:
                // - For existing pools: Only added if pool < 10 OR beats worst
                // - For new pools: Only added if < 500 pools OR beats weakest pool
                this.db.queueSaveAgent(validationRecord);
                this.logger.info(`[VALIDATION] ✅ Queued ${geneId} for gene pool (early success, fitness: ${validationRecord.fitness.toFixed(1)})`);

                return { success: true, record: validationRecord };
            }
        }

            // Check if agent has completed required validation runs (full 3-run cycle)
        if (validationEntry.attempts >= VALIDATION_REQUIRED_RUNS && !validationEntry.isValidated) {
            const avgScore = validationEntry.scores.reduce((a, b) => a + b, 0) / validationEntry.scores.length;
            const bestScore = Math.max(...validationEntry.scores);
            const successfulRuns = validationEntry.fitResults.filter(fit => fit).length;

            this.logger.info(`[VALIDATION] ========================================`);
            this.logger.info(`[VALIDATION] ${geneId} VALIDATION COMPLETE`);
            this.logger.info(`[VALIDATION] ========================================`);
            this.logger.info(`[VALIDATION] Overall Results: ${successfulRuns}/${VALIDATION_REQUIRED_RUNS} runs passed | Average Fitness: ${avgScore.toFixed(1)}`);
            
            // Detailed breakdown of each run
            validationEntry.scores.forEach((score, index) => {
                const fit = validationEntry.fitResults[index];
                const status = score === bestScore ? '🏆 BEST' : fit ? '✅ PASS' : '❌ FAIL';
                const criteriaDetails = validationEntry.criteriaDetails[index];
                
                this.logger.info(`[VALIDATION] ────────────────────────────────────────`);
                this.logger.info(`[VALIDATION] Run ${index + 1}: ${status} | Fitness: ${score.toFixed(1)}`);
                
                if (criteriaDetails) {
                    const criteriaStatus = criteriaDetails.criteria.map(c => {
                        return `${c.name}: ${c.passed ? '✅' : '❌'} (${c.value.toFixed(1)}/${c.threshold.toFixed(1)})`;
                    }).join(' | ');
                    this.logger.info(`[VALIDATION] Run ${index + 1} Criteria: ${criteriaStatus}`);
                    this.logger.info(`[VALIDATION] Run ${index + 1} Details: ${criteriaDetails.criteriaMet}/5 criteria met`);
                }
            });
            
            this.logger.info(`[VALIDATION] ========================================`);

            if (successfulRuns >= 2) { // Require at least 2 out of 3 runs to be successful
                // Agent passed validation - return validation record for gene pool saving
                validationEntry.isValidated = true;
                this.logger.info(`[VALIDATION] 🎉 ${geneId} PASSED VALIDATION - Queueing for gene pool save (avg: ${avgScore.toFixed(1)})`);

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

                // Queue save to IndexedDB - this will handle all limit checks and pool management
                // This ensures the agent goes through the same validation as all other agents:
                // - For existing pools: Only added if pool < 10 OR beats worst
                // - For new pools: Only added if < 500 pools OR beats weakest pool
                this.db.queueSaveAgent(validationRecord);
                this.logger.info(`[VALIDATION] ✅ Queued ${geneId} for gene pool (fitness: ${validationRecord.fitness.toFixed(1)})`);

                return { success: true, record: validationRecord };
            } else {
                // Agent failed validation - mark as failed and remove from queue
                this.logger.info(`[VALIDATION] ========================================`);
                this.logger.info(`[VALIDATION] 💥 ${geneId} FAILED VALIDATION`);
                this.logger.info(`[VALIDATION] ========================================`);
                this.logger.info(`[VALIDATION] Failure Reason: Only ${successfulRuns}/${VALIDATION_REQUIRED_RUNS} runs passed | Average Fitness: ${avgScore.toFixed(1)}`);
                
                // Log which runs failed and why
                validationEntry.scores.forEach((score, index) => {
                    if (!validationEntry.fitResults[index]) {
                        const criteriaDetails = validationEntry.criteriaDetails[index];
                        if (criteriaDetails) {
                            const failedCriteria = criteriaDetails.criteria.filter(c => !c.passed).map(c => {
                                return `${c.name} (${c.value.toFixed(1)}/${c.threshold.toFixed(1)})`;
                            }).join(', ');
                            this.logger.info(`[VALIDATION] Run ${index + 1} (FAIL): Fitness ${score.toFixed(1)} | Failed: ${failedCriteria || 'Unknown'}`);
                        }
                    }
                });
                this.logger.info(`[VALIDATION] ========================================`);
                
                validationEntry.isValidated = false;

                // Show toast notification for failed validation
                this.toast.showValidationFailed(geneId, avgScore, validationEntry.scores, validationEntry.fitResults, validationEntry.attempts);

                // Remove failed agent from validation queue
                this.logger.info(`[VALIDATION] 🗑️ Removing failed agent ${geneId} from validation queue`);
                this.validationQueue.delete(geneId);
                // Note: spawn lock already released in handleValidationDeath, no need to release again
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

        // CRITICAL FIX: Only count actual validation TEST agents, not original agents in validation
        // An original agent with geneId in validationQueue is NOT a validation test agent
        // We need to check agent.isValidationAgent to distinguish test agents from originals
        let actualCount = 0;
        for (const agent of simulation.agents) {
            if (!agent.isDead && agent.isValidationAgent && this.isInValidation(agent.geneId)) {
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
        if (!agent || !agent.geneId) {
            this.logger.warn(`[VALIDATION] ❌ Cannot process validation death - agent is null or has no geneId`);
            return false;
        }

        // Check if this agent's gene is actually in the validation queue
        if (!this.validationQueue.has(agent.geneId)) {
            this.logger.warn(`[VALIDATION] ❌ Cannot process validation death - agent ${agent.geneId} not in validation queue`);
            return false;
        }

        const validationEntry = this.validationQueue.get(agent.geneId);

        // CRITICAL FIX: Use the weights stored in the validation entry, not agent.nn
        // The agent's neural network may have been cleaned up by this point, but we stored
        // the weights when the agent first entered validation, so we can use those
        const storedWeights = validationEntry.weights;
        const isValidWeights = storedWeights &&
            typeof storedWeights === 'object' &&
            storedWeights.weights1 && storedWeights.weights2 &&
            Array.isArray(storedWeights.weights1) && Array.isArray(storedWeights.weights2) &&
            storedWeights.weights1.length > 0 && storedWeights.weights2.length > 0;

        if (!isValidWeights) {
            this.logger.warn(`[VALIDATION] ❌ Cannot process validation death - stored weights for ${agent.geneId} are invalid`);
            this.logger.warn(`[VALIDATION] Expected: {weights1: [...], weights2: [...]}, Got:`, storedWeights);
            // Clean up this corrupted validation entry
            this.validationQueue.delete(agent.geneId);
            this.releaseSpawnLock(agent.geneId);
            if (this.activeValidationAgents > 0) {
                this.activeValidationAgents--;
            }
            // Safe to cleanup agent now
            if (agent && !agent._cleanedUp) {
                agent.cleanup();
            }
            return false;
        }

        // Now we know we have valid stored weights and a valid validation entry
        if (this.validationQueue.has(agent.geneId)) {
            // Calculate final fitness before logging
            agent.calculateFitness();
            const criteriaDetails = this.getCriteriaDetails(agent);
            
            this.logger.info(`[VALIDATION] 💥 Validation agent ${agent.id} (${agent.geneId}) died`);
            this.logger.info(`[VALIDATION] Run ${validationEntry.attempts + 1}/${VALIDATION_REQUIRED_RUNS} completed: Fitness ${agent.fitness.toFixed(1)}, Fit: ${agent.fit ? 'YES' : 'NO'}`);
            
            if (criteriaDetails) {
                const criteriaStatus = criteriaDetails.criteria.map(c => {
                    return `${c.name}: ${c.passed ? '✅' : '❌'} (${c.value.toFixed(1)}/${c.threshold.toFixed(1)})`;
                }).join(' | ');
                this.logger.info(`[VALIDATION] Run ${validationEntry.attempts + 1} Criteria: ${criteriaStatus}`);
                this.logger.info(`[VALIDATION] Run ${validationEntry.attempts + 1} Summary: ${criteriaDetails.criteriaMet}/5 criteria met`);
            }

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

            // Process this validation run using standard logic (skipGenePoolCheck = true)
            const result = this.addToValidationQueue(agent, false, true);
            if (result.success) {
                // Agent passed validation through normal means
                // Note: addToValidationQueue already added to pool and queued save, just clean up here
                this.logger.info(`[VALIDATION] ✅ Validated agent ${agent.id} (${agent.geneId}) passed validation, already saved to pool`);
                this.validationQueue.delete(agent.geneId);
                // Spawn lock already released in addToValidationQueue

                // Safe to cleanup now that validation is complete and agent is saved
                if (agent && !agent._cleanedUp) {
                    agent.cleanup();
                }
            } else if (result === false) {
                // Agent was skipped (already in gene pool) - this shouldn't happen for validation agents
                this.logger.warn(`[VALIDATION] ⚠️ Validation agent ${agent.id} (${agent.geneId}) was skipped during death processing (already in gene pool?)`);
                // Still remove from queue to prevent getting stuck
                this.validationQueue.delete(agent.geneId);

                // Safe to cleanup since validation is not needed
                if (agent && !agent._cleanedUp) {
                    agent.cleanup();
                }
            } else {
                // Still in progress or validation ongoing
                this.logger.info(`[VALIDATION] Validation agent ${agent.id} (${agent.geneId}) death processed, validation continues (${validationEntry.attempts}/${VALIDATION_REQUIRED_RUNS} runs)`);

                // Safe to cleanup now - the stored weights in validationEntry will be used for respawning
                if (agent && !agent._cleanedUp) {
                    agent.cleanup();
                }
            }
            return true;
        }
        return false;
    }

    // Extract detailed criteria information from an agent
    getCriteriaDetails(agent) {

        // Calculate exploration percentage
        const totalCells = EXPLORATION_GRID_WIDTH * EXPLORATION_GRID_HEIGHT;
        const exploredCellsSize = agent.exploredCells?.size || 0;
        const explorationPercentage = (exploredCellsSize / totalCells) * 100;

        // Calculate age in seconds
        const ageInSeconds = agent.age || 0;

        // Get values
        const fitness = agent.fitness || 0;
        const foodEaten = agent.foodEaten || 0;
        const turnsTowardsFood = agent.turnsTowardsFood || 0;

        // Build criteria array
        const criteria = [
            {
                name: 'Fitness',
                value: fitness,
                threshold: MIN_FITNESS_TO_SAVE_GENE_POOL,
                passed: fitness >= MIN_FITNESS_TO_SAVE_GENE_POOL
            },
            {
                name: 'Food Eaten',
                value: foodEaten,
                threshold: MIN_FOOD_EATEN_TO_SAVE_GENE_POOL,
                passed: foodEaten >= MIN_FOOD_EATEN_TO_SAVE_GENE_POOL
            },
            {
                name: 'Age (seconds)',
                value: ageInSeconds,
                threshold: MIN_SECONDS_ALIVE_TO_SAVE_GENE_POOL,
                passed: ageInSeconds >= MIN_SECONDS_ALIVE_TO_SAVE_GENE_POOL
            },
            {
                name: 'Exploration (%)',
                value: explorationPercentage,
                threshold: MIN_EXPLORATION_PERCENTAGE_TO_SAVE_GENE_POOL,
                passed: explorationPercentage >= MIN_EXPLORATION_PERCENTAGE_TO_SAVE_GENE_POOL
            },
            {
                name: 'Turns Towards Food',
                value: turnsTowardsFood,
                threshold: MIN_TURNS_TOWARDS_FOOD_TO_SAVE_GENE_POOL,
                passed: turnsTowardsFood >= MIN_TURNS_TOWARDS_FOOD_TO_SAVE_GENE_POOL
            }
        ];

        const criteriaMet = criteria.filter(c => c.passed).length;

        return {
            criteria,
            criteriaMet,
            fitness,
            foodEaten,
            ageInSeconds,
            explorationPercentage,
            turnsTowardsFood
        };
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
