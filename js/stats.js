


import {
    GENE_POOL_MIN_FITNESS,
    MIN_FOOD_EATEN_TO_SAVE_GENE_POOL,
    MIN_FRAMES_ALIVE_TO_SAVE_GENE_POOL,
    MIN_SECONDS_ALIVE_TO_SAVE_GENE_POOL,
    MIN_EXPLORATION_PERCENTAGE_TO_SAVE_GENE_POOL,
    MIN_TURNS_TOWARDS_FOOD_TO_SAVE_GENE_POOL,
    MIN_DISTANCE_FOR_MOVEMENT_REWARDS,
    FITNESS_MULTIPLIERS,
    FITNESS_PENALTIES,
    SURVIVAL_BONUSES,
    EXPLORATION_GRID_WIDTH,
    EXPLORATION_GRID_HEIGHT,
    TEMPERATURE_MAX,
    FPS_TARGET,
    TARGET_AGE_SECONDS,
    MAX_ENERGY,
    MIN_ENERGY_TO_REPRODUCE,
    MIN_ENERGY_FOR_SPLITTING,
    PASSIVE_LOSS,
    MOVEMENT_COST_MULTIPLIER,
    ROTATION_COST_MULTIPLIER,
    AGENT_SIZE_ENERGY_LOSS_MULTIPLIER,
    REPRODUCTION_COOLDOWN_FRAMES,
    PREGNANCY_DURATION_FRAMES,
    MATURATION_AGE_FRAMES,
    REPRODUCE_COST_BASE,
    CHILD_STARTING_ENERGY,
    FOOD_ENERGY_NORMAL_BASE,
    FOOD_ENERGY_HIGH_BASE,
    FOOD_SPAWN_RATE,
    HIGH_VALUE_FOOD_CHANCE
} from './constants.js';

export function copySimulationStats(simulation) {
    // Gather all current stats - OPTIMIZED: Use for loop instead of filter
    const livingAgents = [];
    const agentsLen = simulation.agents.length;
    for (let i = 0; i < agentsLen; i++) {
        const agent = simulation.agents[i];
        if (agent && !agent.isDead) {
            livingAgents.push(agent);
        }
    }
    if (livingAgents.length === 0) {
        alert('No living agents to analyze');
        return;
    }

    // Calculate stats (same as updateDashboard)
    const bestFitness = simulation.bestAgent ? simulation.bestAgent.fitness : 0;
    // OPTIMIZED: Use for loop instead of map
    const geneIdSet = new Set();
    const livingAgentsLen = livingAgents.length;
    for (let i = 0; i < livingAgentsLen; i++) {
        geneIdSet.add(livingAgents[i].geneId);
    }
    const geneIdCount = geneIdSet.size;
    const genePoolHealth = simulation.db.getGenePoolHealth();
    const genePoolCount = genePoolHealth.genePoolCount;

    // OPTIMIZED: Use for loops instead of reduce for better performance
    let sumFitness = 0, sumAge = 0, sumEnergy = 0, sumOffspring = 0, sumFood = 0, sumKills = 0, sumCollisions = 0, sumWallHits = 0;
    for (let i = 0; i < livingAgentsLen; i++) {
        const a = livingAgents[i];
        sumFitness += a.fitness;
        sumAge += a.age;
        sumEnergy += a.energy;
        sumOffspring += a.offspring;
        sumFood += a.foodEaten;
        sumKills += a.kills;
        sumCollisions += (a.collisions || 0);
        sumWallHits += (a.timesHitObstacle || 0);
    }
    const avgFitness = sumFitness / livingAgentsLen;
    const avgAge = sumAge / livingAgentsLen;
    const avgEnergy = sumEnergy / livingAgentsLen;
    const avgOffspring = sumOffspring / livingAgentsLen;
    const avgFood = sumFood / livingAgentsLen;
    const avgKills = sumKills / livingAgentsLen;
    const avgCollisions = sumCollisions / livingAgentsLen;
    const avgWallHits = sumWallHits / livingAgentsLen;

    // Navigation behavior tracking (NEW) - with safety checks to prevent Infinity
    const safeNumber = (val, defaultVal = 0) => {
        if (typeof val !== 'number' || !isFinite(val)) return defaultVal;
        return val;
    };
    // OPTIMIZED: Use for loops instead of reduce
    let sumTurnsTowardsFood = 0, sumTurnsAwayFromObstacles = 0, sumFoodApproaches = 0, sumCleverTurns = 0, sumSuccessfulEscapes = 0;
    for (let i = 0; i < livingAgentsLen; i++) {
        const a = livingAgents[i];
        sumTurnsTowardsFood += safeNumber(a.turnsTowardsFood || 0, 0);
        sumTurnsAwayFromObstacles += safeNumber(a.turnsAwayFromObstacles || 0, 0);
        sumFoodApproaches += safeNumber(a.foodApproaches || 0, 0);
        sumCleverTurns += safeNumber(a.cleverTurns || 0, 0);
        sumSuccessfulEscapes += safeNumber(a.successfulEscapes || 0, 0);
    }
    const avgTurnsTowardsFood = sumTurnsTowardsFood / livingAgentsLen;
    const avgTurnsAwayFromObstacles = sumTurnsAwayFromObstacles / livingAgentsLen;
    const avgFoodApproaches = sumFoodApproaches / livingAgentsLen;
    const avgCleverTurns = sumCleverTurns / livingAgentsLen;
    const avgSuccessfulEscapes = sumSuccessfulEscapes / livingAgentsLen;

    // Detailed fitness breakdown - with safety checks to prevent Infinity
    // NOTE: This breakdown matches the actual calculateFitness() formula in agent.js
    // OPTIMIZED: Use for loop instead of map
    const fitnessBreakdown = [];
    for (let i = 0; i < livingAgentsLen; i++) {
        const a = livingAgents[i];
        const breakdown = (() => {
        const totalCells = EXPLORATION_GRID_WIDTH * EXPLORATION_GRID_HEIGHT;
        const explorationPercentage = safeNumber((a.exploredCells?.size || 0) / totalCells * 100, 0);
        const ageInSeconds = safeNumber(a.age || 0, 0);

        // Match actual calculateFitness() formula multipliers (updated after Phase 2 changes)
        let baseScore = 0;

        // Temperature system (symmetric bonus/penalty - 100 points each)
        const avgTemperature = a.temperatureSamples > 0 ? safeNumber(a.temperatureSum / a.temperatureSamples, 0) : 0;
        let temperatureBonus = 0;
        let temperaturePenalty = 0;
        if (avgTemperature < 1) {
            temperaturePenalty = (1 - avgTemperature) * 100; // Up to 100 points penalty
        } else {
            temperatureBonus = (avgTemperature / TEMPERATURE_MAX) * 100; // Up to 100 points bonus
        }
        baseScore += temperatureBonus - temperaturePenalty;

        // Productive actions - match actual multipliers from agent.js (with normalization)
        baseScore += safeNumber(a.offspring || 0, 0) * FITNESS_MULTIPLIERS.OFFSPRING;
        baseScore += safeNumber(a.cleverTurns || 0, 0) * FITNESS_MULTIPLIERS.CLEVER_TURNS;
        baseScore += safeNumber(explorationPercentage, 0) * FITNESS_MULTIPLIERS.EXPLORATION;
        baseScore += safeNumber(a.foodEaten || 0, 0) * FITNESS_MULTIPLIERS.FOOD_EATEN;
        baseScore += safeNumber(a.kills || 0, 0) * FITNESS_MULTIPLIERS.KILLS;

        // Reproduction attempts bonus
        baseScore += safeNumber(a.reproductionAttempts || 0, 0) * FITNESS_MULTIPLIERS.REPRODUCTION_ATTEMPT;

        // Goals completed bonus
        const goalsCompleted = safeNumber(a.goalMemory?.goalsCompleted || 0, 0);
        baseScore += goalsCompleted * FITNESS_MULTIPLIERS.GOALS_COMPLETED;

        // Movement rewards - NORMALIZED by distance (matches agent.js)
        const distanceTravelled = safeNumber(a.distanceTravelled || 0, 0);
        if (distanceTravelled > MIN_DISTANCE_FOR_MOVEMENT_REWARDS) {
            const distanceNormalizer = distanceTravelled / 100;

            // Direction changes: normalized (matches agent.js)
            const directionChangedNormalized = Math.min(safeNumber(a.directionChanged || 0, 0), 500) / Math.max(distanceNormalizer, 1);
            baseScore += directionChangedNormalized * FITNESS_MULTIPLIERS.DIRECTION_CHANGES;

            // Speed changes: normalized (matches agent.js)
            const speedChangedNormalized = Math.min(safeNumber(a.speedChanged || 0, 0), 200) / Math.max(distanceNormalizer, 1);
            baseScore += speedChangedNormalized * FITNESS_MULTIPLIERS.SPEED_CHANGES;

            // Navigation rewards - NORMALIZED (matches agent.js)
            const turnsTowardsFoodNormalized = safeNumber(a.turnsTowardsFood || 0, 0) / Math.max(distanceNormalizer, 1);
            baseScore += turnsTowardsFoodNormalized * FITNESS_MULTIPLIERS.TURNS_TOWARDS_FOOD;

            const turnsAwayFromObstaclesNormalized = safeNumber(a.turnsAwayFromObstacles || 0, 0) / Math.max(distanceNormalizer, 1);
            baseScore += turnsAwayFromObstaclesNormalized * FITNESS_MULTIPLIERS.TURNS_AWAY_FROM_OBSTACLES;

            const foodApproachesNormalized = safeNumber(a.foodApproaches || 0, 0) / Math.max(distanceNormalizer, 1);
            baseScore += foodApproachesNormalized * FITNESS_MULTIPLIERS.FOOD_APPROACHES;
        } else {
            // Penalty for minimal movement (matches agent.js)
            const movementPenalty = (MIN_DISTANCE_FOR_MOVEMENT_REWARDS - distanceTravelled) / 10;
            baseScore -= Math.min(movementPenalty, 50);
        }

        // Enhanced synergy bonus
        const offspring = safeNumber(a.offspring || 0, 0);
        const foodEaten = safeNumber(a.foodEaten || 0, 0);
        if (offspring > 0 && foodEaten > 0) {
            baseScore += (offspring * 2 + foodEaten) * 10; // Enhanced from (offspring * foodEaten) * 5
        }

        // Efficiency (no threshold - always calculate)
        // Reuse distanceTravelled declared above
        let efficiency = 0;
        const energySpent = safeNumber(a.energySpent || 0, 0);
        if (energySpent > 0) {
            efficiency = Math.min(distanceTravelled / Math.max(energySpent, 1), 10.0);
        }
        baseScore += efficiency * FITNESS_MULTIPLIERS.EFFICIENCY;

        // Successful escapes
        baseScore += safeNumber(a.successfulEscapes || 0, 0) * FITNESS_MULTIPLIERS.SUCCESSFUL_ESCAPES;

        // Penalties - match actual formula (single circle penalty, not double)
        const consecutiveTurns = safeNumber(a.consecutiveTurns || 0, 0);
        const cappedTurns = Math.min(consecutiveTurns, 50);
        const circlePenalty = Math.min(cappedTurns * 20, 2000); // Fixed: single penalty, not double
        const penalties =
            circlePenalty +
            safeNumber(a.timesHitObstacle || 0, 0) * 30 +
            (safeNumber(a.collisions || 0, 0) - safeNumber(a.timesHitObstacle || 0, 0)) * 10;

        // Collision avoidance reward
        // FIXED: Use actual framesAlive instead of ageInSeconds * FPS_TARGET to prevent inflation on FPS drops
        const framesAlive = safeNumber(a.framesAlive || 0, 0);
        const obstacleFreeFrames = Math.max(0, framesAlive - (safeNumber(a.timesHitObstacle || 0, 0) * 30));
        if (obstacleFreeFrames > 200) {
            baseScore += (obstacleFreeFrames / 200) * 25;
        }

        // Inactivity penalty
        let inactivityPenalty = 0;
        if (ageInSeconds > 20 && baseScore < 50) {
            const inactivityDuration = Math.max(0, ageInSeconds - 20);
            inactivityPenalty = inactivityDuration * 2;
        }

        // Apply inactivity penalty
        let adjustedBaseScore = Math.max(0, baseScore - inactivityPenalty);
        // Note: Temperature penalty already applied in baseScore calculation above

        // REBALANCED SURVIVAL: Separate bonus instead of multiplier
        // Only applies if agent lives over 500 seconds (agents are living much longer now)
        const survivalBonus = ageInSeconds > SURVIVAL_BONUSES.EXTENDED_THRESHOLD ?
            Math.min((ageInSeconds - SURVIVAL_BONUSES.EXTENDED_THRESHOLD) * SURVIVAL_BONUSES.BASE_MULTIPLIER, SURVIVAL_BONUSES.BASE_CAP) : 0;
        const rawSurvivalBonus = ageInSeconds > SURVIVAL_BONUSES.EXTENDED_THRESHOLD ?
            (ageInSeconds - SURVIVAL_BONUSES.EXTENDED_THRESHOLD) / SURVIVAL_BONUSES.EXTENDED_DIVISOR : 0;
        // Final fitness = adjusted base score + survival bonuses (not multiplied)
        const finalFitness = adjustedBaseScore + survivalBonus + rawSurvivalBonus;

        const finalBaseScore = safeNumber(baseScore, 0);
        const finalPenalties = safeNumber(penalties, 0);
        const finalNetBaseScore = safeNumber(adjustedBaseScore, 0); // Use adjusted base score (after penalties and inactivity)

        return {
            fitness: safeNumber(a.fitness, 0),
            baseScore: finalBaseScore,
            penalties: finalPenalties,
            netBaseScore: finalNetBaseScore,
            survivalBonus: safeNumber(survivalBonus, 0), // Changed from survivalMultiplier
            rawSurvivalBonus: safeNumber(rawSurvivalBonus, 0),
            finalFitness: safeNumber(a.fitness, 0)
        };
        })();
        fitnessBreakdown.push(breakdown);
    }

    // OPTIMIZED: Use for loops instead of reduce
    let sumBaseScore = 0, sumPenalties = 0, sumNetBaseScore = 0, sumSurvivalBonus = 0, sumRawSurvivalBonus = 0;
    const fitnessBreakdownLen = fitnessBreakdown.length;
    for (let i = 0; i < fitnessBreakdownLen; i++) {
        const f = fitnessBreakdown[i];
        sumBaseScore += f.baseScore;
        sumPenalties += f.penalties;
        sumNetBaseScore += f.netBaseScore;
        sumSurvivalBonus += f.survivalBonus;
        sumRawSurvivalBonus += f.rawSurvivalBonus;
    }
    const avgBaseScore = sumBaseScore / fitnessBreakdownLen;
    const avgPenalties = sumPenalties / fitnessBreakdownLen;
    const avgNetBaseScore = sumNetBaseScore / fitnessBreakdownLen;
    const avgSurvivalBonus = sumSurvivalBonus / fitnessBreakdownLen;
    const avgRawSurvivalBonus = sumRawSurvivalBonus / fitnessBreakdownLen;

    // Additional fitness component averages for detailed breakdown
    // (avgExplorationPercentage is calculated later in qualification criteria section)
    // Calculate normalized movement and navigation values (matching agent.js calculation)
    // OPTIMIZED: Use for loops instead of reduce
    let sumDirectionChanged = 0, sumSpeedChanged = 0, sumTurnsTowardsFoodNormalized = 0;
    let sumTurnsAwayFromObstaclesNormalized = 0, sumFoodApproachesNormalized = 0, sumObstacleFreeFrames = 0;
    for (let i = 0; i < livingAgentsLen; i++) {
        const a = livingAgents[i];
        const distanceTravelled = safeNumber(a.distanceTravelled || 0, 0);
        if (distanceTravelled > MIN_DISTANCE_FOR_MOVEMENT_REWARDS) {
            const distanceNormalizer = distanceTravelled / 100;
            const invDistanceNormalizer = 1 / Math.max(distanceNormalizer, 1);
            sumDirectionChanged += Math.min(safeNumber(a.directionChanged || 0, 0), 500) * invDistanceNormalizer;
            sumSpeedChanged += Math.min(safeNumber(a.speedChanged || 0, 0), 200) * invDistanceNormalizer;
            sumTurnsTowardsFoodNormalized += safeNumber(a.turnsTowardsFood || 0, 0) * invDistanceNormalizer;
            sumTurnsAwayFromObstaclesNormalized += safeNumber(a.turnsAwayFromObstacles || 0, 0) * invDistanceNormalizer;
            sumFoodApproachesNormalized += safeNumber(a.foodApproaches || 0, 0) * invDistanceNormalizer;
        }
        // FIXED: Use actual framesAlive instead of ageInSeconds * FPS_TARGET to prevent inflation on FPS drops
        const framesAlive = safeNumber(a.framesAlive || 0, 0);
        const obstacleFreeFrames = Math.max(0, framesAlive - ((a.timesHitObstacle || 0) * 30));
        sumObstacleFreeFrames += (obstacleFreeFrames > 200 ? (obstacleFreeFrames / 200) * 25 : 0);
    }
    const avgDirectionChanged = sumDirectionChanged / livingAgentsLen;
    const avgSpeedChanged = sumSpeedChanged / livingAgentsLen;
    const avgTurnsTowardsFoodNormalized = sumTurnsTowardsFoodNormalized / livingAgentsLen;
    const avgTurnsAwayFromObstaclesNormalized = sumTurnsAwayFromObstaclesNormalized / livingAgentsLen;
    const avgFoodApproachesNormalized = sumFoodApproachesNormalized / livingAgentsLen;
    const avgObstacleFreeFrames = sumObstacleFreeFrames / livingAgentsLen;

    const MATURATION_SECONDS = 10; // Updated to match new MATURATION_AGE_FRAMES (600 frames = 10s)
    // OPTIMIZED: Use for loops instead of filter/map/reduce
    let matureAgents = 0, maxAge = 0, totalSexualOffspring = 0, totalAsexualOffspring = 0;
    for (let i = 0; i < livingAgentsLen; i++) {
        const a = livingAgents[i];
        if (a.age >= MATURATION_SECONDS) matureAgents++;
        if (a.age > maxAge) maxAge = a.age;
        totalSexualOffspring += (a.childrenFromMate || 0);
        totalAsexualOffspring += (a.childrenFromSplit || 0);
    }
    const maturationRate = (matureAgents / livingAgentsLen) * 100;

    const reproductionRate = simulation.reproductionRate || 0;
    // OPTIMIZED: Use for loops instead of filter
    let collisionFreeAgents = 0, qualifiedAgents = 0;
    for (let i = 0; i < livingAgentsLen; i++) {
        const a = livingAgents[i];
        if ((a.timesHitObstacle || 0) === 0) collisionFreeAgents++;
        if (a.fit) qualifiedAgents++;
    }
    const collisionFreePercent = (collisionFreeAgents / livingAgentsLen) * 100;

    // Calculate qualification criteria breakdown
    // OPTIMIZED: Use for loops instead of filter/reduce
    const totalCells = EXPLORATION_GRID_WIDTH * EXPLORATION_GRID_HEIGHT;
    const invTotalCells = 1 / totalCells;
    let agentsMeetingFitness = 0, agentsMeetingFood = 0, agentsMeetingAge = 0, agentsMeetingExploration = 0, agentsMeetingNavigation = 0;
    let sumExplorationPercentage = 0;
    for (let i = 0; i < livingAgentsLen; i++) {
        const a = livingAgents[i];
        if (a.fitness >= GENE_POOL_MIN_FITNESS) agentsMeetingFitness++;
        if ((a.foodEaten || 0) >= MIN_FOOD_EATEN_TO_SAVE_GENE_POOL) agentsMeetingFood++;
        if ((a.age || 0) >= MIN_SECONDS_ALIVE_TO_SAVE_GENE_POOL) agentsMeetingAge++;
        const explorationPercentage = ((a.exploredCells?.size || 0) * invTotalCells) * 100;
        if (explorationPercentage >= MIN_EXPLORATION_PERCENTAGE_TO_SAVE_GENE_POOL) agentsMeetingExploration++;
        if ((a.turnsTowardsFood || 0) >= MIN_TURNS_TOWARDS_FOOD_TO_SAVE_GENE_POOL) agentsMeetingNavigation++;
        sumExplorationPercentage += explorationPercentage;
    }
    const avgExplorationPercentage = sumExplorationPercentage / livingAgentsLen;

    let learningRate = 0;
    if (simulation.fitnessHistory.length >= 2) {
        const recent = simulation.fitnessHistory.slice(-5);
        const older = simulation.fitnessHistory.slice(-10, -5);
        if (older.length > 0) {
            // OPTIMIZED: Use for loops instead of reduce
            let recentSum = 0, olderSum = 0;
            const recentLen = recent.length;
            const olderLen = older.length;
            for (let i = 0; i < recentLen; i++) recentSum += recent[i];
            for (let i = 0; i < olderLen; i++) olderSum += older[i];
            const recentAvg = recentSum / recentLen;
            const olderAvg = olderSum / olderLen;
            learningRate = (recentAvg - olderAvg) / olderLen;
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

    // Calculate detailed food statistics
    // OPTIMIZED: Use for loops instead of filter/reduce
    const livingFood = [];
    const highValueFood = [];
    const normalFood = [];
    const foodLen = simulation.food.length;
    for (let i = 0; i < foodLen; i++) {
        const f = simulation.food[i];
        if (f && !f.isDead) {
            livingFood.push(f);
            if (f.isHighValue) {
                highValueFood.push(f);
            } else {
                normalFood.push(f);
            }
        }
    }
    const livingFoodLen = livingFood.length;
    let totalFoodEnergy = 0, highValueEnergy = 0, normalEnergy = 0;
    for (let i = 0; i < livingFoodLen; i++) {
        const f = livingFood[i];
        totalFoodEnergy += f.energyValue;
        if (f.isHighValue) {
            highValueEnergy += f.energyValue;
        } else {
            normalEnergy += f.energyValue;
        }
    }
    const avgFoodEnergy = livingFoodLen > 0 ? totalFoodEnergy / livingFoodLen : 0;

    const foodSpawnRate = simulation.foodSpawnRate;
    const foodScarcityFactor = simulation.foodScarcityFactor;
    const finalFoodMultiplier = simulation.finalFoodSpawnMultiplier;
    const populationFactor = Math.max(0.5, 1 - (livingAgents.length / simulation.maxAgents));
    const currentSpawnChance = finalFoodMultiplier * foodScarcityFactor * populationFactor;
    const spawnRatePerSecond = currentSpawnChance * 60; // At 60 FPS

    // Energy calculations
    const avgFoodValue = 0.9 * 90 + 0.1 * 225; // Weighted average of normal/high-value food (approx)
    const energyProvidedPerSecond = spawnRatePerSecond * avgFoodValue;
    const energyNeededPerSecond = livingAgents.length * 0.42; // ~0.42 energy/sec per agent
    const energyBuffer = energyNeededPerSecond > 0 ? ((energyProvidedPerSecond / energyNeededPerSecond) - 1) * 100 : 0;

    // Get detailed gene pool information
    // OPTIMIZED: Use for loops instead of sort/map
    const genePools = simulation.db.getGenePoolHealth().pools || [];
    const genePoolsLen = genePools.length;
    // Manual sort for top 5 (more efficient than full sort)
    const topGenePools = [];
    for (let i = 0; i < Math.min(5, genePoolsLen); i++) {
        let maxIdx = i;
        for (let j = i + 1; j < genePoolsLen; j++) {
            if (genePools[j].fitness > genePools[maxIdx].fitness) {
                maxIdx = j;
            }
        }
        if (maxIdx !== i) {
            const temp = genePools[i];
            genePools[i] = genePools[maxIdx];
            genePools[maxIdx] = temp;
        }
        const p = genePools[i];
        topGenePools.push(`ID ${p.id}: Fit ${p.fitness.toFixed(0)}, Count ${p.count}`);
    }
    const topGenePoolsStr = topGenePools.join('\n');

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

    // Calculate statistical distributions for all fitness metrics
    // OPTIMIZED: Use for loops instead of map
    const fitnessValues = [];
    const baseScoreValues = [];
    const penaltiesValues = [];
    const netBaseScoreValues = [];
    const survivalBonusValues = [];
    const foodEatenValues = [];
    const offspringValues = [];
    const killsValues = [];
    const explorationValues = [];
    const cleverTurnsValues = [];
    const turnsTowardsFoodRawValues = [];
    const turnsAwayFromObstaclesRawValues = [];
    const foodApproachesRawValues = [];
    const directionChangedRawValues = [];
    const speedChangedRawValues = [];
    const successfulEscapesValues = [];
    const energyValues = [];
    const energySpentValues = [];
    const ageValues = [];
    const distanceTravelledValues = [];
    const reproductionAttemptsValues = [];
    const childrenFromMateValues = [];
    const childrenFromSplitValues = [];
    
    for (let i = 0; i < livingAgentsLen; i++) {
        const a = livingAgents[i];
        fitnessValues.push(safeNumber(a.fitness, 0));
        foodEatenValues.push(safeNumber(a.foodEaten || 0, 0));
        offspringValues.push(safeNumber(a.offspring || 0, 0));
        killsValues.push(safeNumber(a.kills || 0, 0));
        explorationValues.push(safeNumber(((a.exploredCells?.size || 0) * invTotalCells * 100), 0));
        cleverTurnsValues.push(safeNumber(a.cleverTurns || 0, 0));
        turnsTowardsFoodRawValues.push(safeNumber(a.turnsTowardsFood || 0, 0));
        turnsAwayFromObstaclesRawValues.push(safeNumber(a.turnsAwayFromObstacles || 0, 0));
        foodApproachesRawValues.push(safeNumber(a.foodApproaches || 0, 0));
        directionChangedRawValues.push(safeNumber(a.directionChanged || 0, 0));
        speedChangedRawValues.push(safeNumber(a.speedChanged || 0, 0));
        successfulEscapesValues.push(safeNumber(a.successfulEscapes || 0, 0));
        energyValues.push(safeNumber(a.energy, 0));
        energySpentValues.push(safeNumber(a.energySpent || 0, 0));
        ageValues.push(safeNumber(a.age || 0, 0));
        distanceTravelledValues.push(safeNumber(a.distanceTravelled || 0, 0));
        reproductionAttemptsValues.push(safeNumber(a.reproductionAttempts || 0, 0));
        childrenFromMateValues.push(safeNumber(a.childrenFromMate || 0, 0));
        childrenFromSplitValues.push(safeNumber(a.childrenFromSplit || 0, 0));
    }
    for (let i = 0; i < fitnessBreakdownLen; i++) {
        const f = fitnessBreakdown[i];
        baseScoreValues.push(f.baseScore);
        penaltiesValues.push(f.penalties);
        netBaseScoreValues.push(f.netBaseScore);
        survivalBonusValues.push(f.survivalBonus);
    }

    // Calculate normalized values for navigation metrics
    // OPTIMIZED: Use for loops instead of map
    const turnsTowardsFoodNormalizedValues = [];
    const turnsAwayFromObstaclesNormalizedValues = [];
    const foodApproachesNormalizedValues = [];
    const directionChangedNormalizedValues = [];
    const speedChangedNormalizedValues = [];
    const efficiencyValues = [];
    const obstacleFreeFramesValues = [];
    
    for (let i = 0; i < livingAgentsLen; i++) {
        const a = livingAgents[i];
        const distanceTravelled = safeNumber(a.distanceTravelled || 0, 0);
        if (distanceTravelled > MIN_DISTANCE_FOR_MOVEMENT_REWARDS) {
            const distanceNormalizer = distanceTravelled / 100;
            const invDistanceNormalizer = 1 / Math.max(distanceNormalizer, 1);
            turnsTowardsFoodNormalizedValues.push(safeNumber(a.turnsTowardsFood || 0, 0) * invDistanceNormalizer);
            turnsAwayFromObstaclesNormalizedValues.push(safeNumber(a.turnsAwayFromObstacles || 0, 0) * invDistanceNormalizer);
            foodApproachesNormalizedValues.push(safeNumber(a.foodApproaches || 0, 0) * invDistanceNormalizer);
            directionChangedNormalizedValues.push(Math.min(safeNumber(a.directionChanged || 0, 0), 500) * invDistanceNormalizer);
            speedChangedNormalizedValues.push(Math.min(safeNumber(a.speedChanged || 0, 0), 200) * invDistanceNormalizer);
        } else {
            turnsTowardsFoodNormalizedValues.push(0);
            turnsAwayFromObstaclesNormalizedValues.push(0);
            foodApproachesNormalizedValues.push(0);
            directionChangedNormalizedValues.push(0);
            speedChangedNormalizedValues.push(0);
        }
        
        // Calculate efficiency values
        const energySpent = safeNumber(a.energySpent || 0, 0);
        if (energySpent > 0) {
            efficiencyValues.push(Math.min(distanceTravelled / Math.max(energySpent, 1), 10.0));
        } else {
            efficiencyValues.push(0);
        }
        
        // Calculate obstacle-free frames values
        // FIXED: Use actual framesAlive instead of ageInSeconds * FPS_TARGET to prevent inflation on FPS drops
        const framesAlive = safeNumber(a.framesAlive || 0, 0);
        const obstacleFreeFrames = Math.max(0, framesAlive - ((a.timesHitObstacle || 0) * 30));
        obstacleFreeFramesValues.push(obstacleFreeFrames > 200 ? (obstacleFreeFrames / 200) * 25 : 0);
    }

    // Calculate all statistics
    const statsFitness = calculateStats(fitnessValues);
    const statsBaseScore = calculateStats(baseScoreValues);
    const statsPenalties = calculateStats(penaltiesValues);
    const statsNetBaseScore = calculateStats(netBaseScoreValues);
    const statsSurvivalBonus = calculateStats(survivalBonusValues);
    const statsFoodEaten = calculateStats(foodEatenValues);
    const statsOffspring = calculateStats(offspringValues);
    const statsKills = calculateStats(killsValues);
    const statsExploration = calculateStats(explorationValues);
    const statsCleverTurns = calculateStats(cleverTurnsValues);
    const statsTurnsTowardsFoodRaw = calculateStats(turnsTowardsFoodRawValues);
    const statsTurnsTowardsFoodNorm = calculateStats(turnsTowardsFoodNormalizedValues);
    const statsTurnsAwayFromObstaclesRaw = calculateStats(turnsAwayFromObstaclesRawValues);
    const statsTurnsAwayFromObstaclesNorm = calculateStats(turnsAwayFromObstaclesNormalizedValues);
    const statsFoodApproachesRaw = calculateStats(foodApproachesRawValues);
    const statsFoodApproachesNorm = calculateStats(foodApproachesNormalizedValues);
    const statsDirectionChangedRaw = calculateStats(directionChangedRawValues);
    const statsDirectionChangedNorm = calculateStats(directionChangedNormalizedValues);
    const statsSpeedChangedRaw = calculateStats(speedChangedRawValues);
    const statsSpeedChangedNorm = calculateStats(speedChangedNormalizedValues);
    const statsSuccessfulEscapes = calculateStats(successfulEscapesValues);
    const statsEnergy = calculateStats(energyValues);
    const statsEnergySpent = calculateStats(energySpentValues);
    const statsAge = calculateStats(ageValues);
    const statsDistanceTravelled = calculateStats(distanceTravelledValues);
    const statsReproductionAttempts = calculateStats(reproductionAttemptsValues);
    const statsChildrenFromMate = calculateStats(childrenFromMateValues);
    const statsChildrenFromSplit = calculateStats(childrenFromSplitValues);
    const statsEfficiency = calculateStats(efficiencyValues);
    const statsObstacleFreeFrames = calculateStats(obstacleFreeFramesValues);

    // Format stats helper
    const formatStats = (stats, decimals = 1) => {
        return `avg=${stats.avg.toFixed(decimals)}, median=${stats.median.toFixed(decimals)}, p99=${stats.p99.toFixed(decimals)}, min=${stats.min.toFixed(decimals)}, max=${stats.max.toFixed(decimals)}`;
    };

    const report = `
=== SIMULATION REPORT ===
Time: ${new Date().toLocaleTimeString()}
Runtime: ${runtimeDisplay}
FPS: ${(simulation.currentFps || 0).toFixed(1)}

-- POPULATION & FITNESS --
Population: ${livingAgents.length} (Max: ${simulation.maxAgents})
Generation: ${simulation.generation}
Best Fitness: ${bestFitness.toFixed(0)} (Δ: ${fitnessDelta >= 0 ? '+' : ''}${fitnessDelta.toFixed(0)})
Avg Fitness: ${avgFitness.toFixed(1)}
Learning Rate: ${learningRate.toFixed(2)}/gen

-- SURVIVAL --
Avg Age: ${avgAge.toFixed(1)}s (Target: ${TARGET_AGE_SECONDS}s+)
Max Age: ${maxAge.toFixed(1)}s
Mature Agents (≥10s): ${matureAgents} / ${livingAgents.length} (${maturationRate.toFixed(1)}%)

-- ENERGY & FOOD --
Avg Energy: ${avgEnergy.toFixed(1)}
Food Available: ${livingFood.length} (High Value: ${highValueFood.length})
Total Food Energy: ${totalFoodEnergy.toFixed(0)}
Avg Food Energy: ${avgFoodEnergy.toFixed(1)}
Energy Buffer: ${energyBuffer.toFixed(1)}% (${energyProvidedPerSecond.toFixed(1)} provided vs ${energyNeededPerSecond.toFixed(1)} needed / sec)
Avg Food Eaten: ${avgFood.toFixed(1)}
Food Spawn Rate: ${spawnRatePerSecond.toFixed(3)} food/sec (Chance: ${(currentSpawnChance * 100).toFixed(2)}%)

-- REPRODUCTION --
Sexual Offspring: ${totalSexualOffspring}
Asexual Offspring: ${totalAsexualOffspring}
Avg Offspring/Agent: ${avgOffspring.toFixed(2)}
Reproduction Events/min: ${reproductionRate.toFixed(1)}

-- BEHAVIOR & LEARNING --
Genetic Diversity: ${geneIdCount} active gene IDs
Stored Gene Pools: ${genePoolCount}
Qualified Agents: ${qualifiedAgents}
Validation Queue: ${validationQueueSize}

-- QUALIFICATION CRITERIA --
Gene Pool Qualification Thresholds:
  - Fitness: ≥${GENE_POOL_MIN_FITNESS}
  - Food Eaten: ≥${MIN_FOOD_EATEN_TO_SAVE_GENE_POOL} items
  - Age: ≥${(MIN_FRAMES_ALIVE_TO_SAVE_GENE_POOL / 60).toFixed(1)}s (${MIN_FRAMES_ALIVE_TO_SAVE_GENE_POOL} frames)
  - Exploration: ≥${MIN_EXPLORATION_PERCENTAGE_TO_SAVE_GENE_POOL}% map coverage
  - Navigation: ≥${MIN_TURNS_TOWARDS_FOOD_TO_SAVE_GENE_POOL} turns towards food
Agents Meeting Each Criterion:
  - Fitness ≥${GENE_POOL_MIN_FITNESS}: ${agentsMeetingFitness} / ${livingAgentsLen} (${((agentsMeetingFitness / livingAgentsLen) * 100).toFixed(1)}%)
  - Food ≥${MIN_FOOD_EATEN_TO_SAVE_GENE_POOL}: ${agentsMeetingFood} / ${livingAgentsLen} (${((agentsMeetingFood / livingAgentsLen) * 100).toFixed(1)}%)
  - Age ≥${(MIN_FRAMES_ALIVE_TO_SAVE_GENE_POOL / 60).toFixed(1)}s: ${agentsMeetingAge} / ${livingAgentsLen} (${((agentsMeetingAge / livingAgentsLen) * 100).toFixed(1)}%)
  - Exploration ≥${MIN_EXPLORATION_PERCENTAGE_TO_SAVE_GENE_POOL}%: ${agentsMeetingExploration} / ${livingAgentsLen} (${((agentsMeetingExploration / livingAgentsLen) * 100).toFixed(1)}%)
  - Navigation ≥${MIN_TURNS_TOWARDS_FOOD_TO_SAVE_GENE_POOL}: ${agentsMeetingNavigation} / ${livingAgentsLen} (${((agentsMeetingNavigation / livingAgentsLen) * 100).toFixed(1)}%)
  - ALL CRITERIA MET (Qualified): ${qualifiedAgents} / ${livingAgentsLen} (${((qualifiedAgents / livingAgentsLen) * 100).toFixed(1)}%)
Avg Exploration: ${avgExplorationPercentage.toFixed(2)}%
Avg Turns Towards Food: ${avgTurnsTowardsFood.toFixed(2)}

-- COMBAT & NAVIGATION --
Avg Collisions: ${avgCollisions.toFixed(1)}
Avg Wall Hits: ${avgWallHits.toFixed(1)}
Collision-Free %: ${collisionFreePercent.toFixed(1)}%
Avg Kills: ${avgKills.toFixed(2)}

-- NAVIGATION BEHAVIOR (NEW TRACKING) --
Avg Turns Towards Food: ${avgTurnsTowardsFood.toFixed(2)}
Avg Turns Away From Obstacles: ${avgTurnsAwayFromObstacles.toFixed(2)}
Avg Food Approaches: ${avgFoodApproaches.toFixed(2)}
Avg Clever Turns: ${avgCleverTurns.toFixed(2)}
Avg Successful Escapes: ${avgSuccessfulEscapes.toFixed(2)}

-- STATISTICAL DISTRIBUTIONS (avg, median, p99, min, max) --
Core Fitness Metrics:
  - Fitness: ${formatStats(statsFitness)}
  - Base Score: ${formatStats(statsBaseScore)}
  - Penalties: ${formatStats(statsPenalties)}
  - Net Base Score: ${formatStats(statsNetBaseScore)}
  - Survival Bonus: ${formatStats(statsSurvivalBonus, 0)}

Fitness Component Metrics:
  - Food Eaten: ${formatStats(statsFoodEaten, 1)}
  - Offspring: ${formatStats(statsOffspring, 2)}
  - Kills: ${formatStats(statsKills, 2)}
  - Exploration (%): ${formatStats(statsExploration, 2)}
  - Clever Turns: ${formatStats(statsCleverTurns, 1)}
  - Turns Towards Food (raw): ${formatStats(statsTurnsTowardsFoodRaw, 1)}
  - Turns Towards Food (normalized): ${formatStats(statsTurnsTowardsFoodNorm, 2)}
  - Turns Away From Obstacles (raw): ${formatStats(statsTurnsAwayFromObstaclesRaw, 1)}
  - Turns Away From Obstacles (normalized): ${formatStats(statsTurnsAwayFromObstaclesNorm, 2)}
  - Food Approaches (raw): ${formatStats(statsFoodApproachesRaw, 1)}
  - Food Approaches (normalized): ${formatStats(statsFoodApproachesNorm, 2)}
  - Direction Changes (raw): ${formatStats(statsDirectionChangedRaw, 1)}
  - Direction Changes (normalized): ${formatStats(statsDirectionChangedNorm, 2)}
  - Speed Changes (raw): ${formatStats(statsSpeedChangedRaw, 1)}
  - Speed Changes (normalized): ${formatStats(statsSpeedChangedNorm, 2)}
  - Obstacle-Free Frames: ${formatStats(statsObstacleFreeFrames, 1)}
  - Successful Escapes: ${formatStats(statsSuccessfulEscapes, 2)}
  - Efficiency (distance/energy): ${formatStats(statsEfficiency, 2)}

Energy & Survival Metrics:
  - Energy (current): ${formatStats(statsEnergy, 1)}
  - Energy Spent: ${formatStats(statsEnergySpent, 1)}
  - Age (seconds): ${formatStats(statsAge, 1)}
  - Distance Travelled: ${formatStats(statsDistanceTravelled, 1)}

Reproduction Metrics:
  - Reproduction Attempts: ${formatStats(statsReproductionAttempts, 1)}
  - Children From Mate: ${formatStats(statsChildrenFromMate, 1)}
  - Children From Split: ${formatStats(statsChildrenFromSplit, 1)}

-- FITNESS BREAKDOWN --
Avg Base Score: ${avgBaseScore.toFixed(1)}
Avg Penalties: ${avgPenalties.toFixed(1)}
Avg Net Base Score: ${avgNetBaseScore.toFixed(1)}
Avg Survival Bonus: ${avgSurvivalBonus.toFixed(0)} pts
Avg Raw Survival Bonus: ${avgRawSurvivalBonus.toFixed(1)}
Fitness Components (Rewards):
  - Food Eaten: ${(avgFood * FITNESS_MULTIPLIERS.FOOD_EATEN).toFixed(1)} pts (${avgFood.toFixed(1)} × ${FITNESS_MULTIPLIERS.FOOD_EATEN})
  - Offspring: ${(avgOffspring * FITNESS_MULTIPLIERS.OFFSPRING).toFixed(1)} pts (${avgOffspring.toFixed(2)} × ${FITNESS_MULTIPLIERS.OFFSPRING})
  - Kills: ${(avgKills * FITNESS_MULTIPLIERS.KILLS).toFixed(1)} pts (${avgKills.toFixed(2)} × ${FITNESS_MULTIPLIERS.KILLS})
  - Turns Towards Food: ${(avgTurnsTowardsFoodNormalized * FITNESS_MULTIPLIERS.TURNS_TOWARDS_FOOD).toFixed(1)} pts (${avgTurnsTowardsFood.toFixed(2)} raw, ${avgTurnsTowardsFoodNormalized.toFixed(2)} normalized × ${FITNESS_MULTIPLIERS.TURNS_TOWARDS_FOOD})
  - Turns Away From Obstacles: ${(avgTurnsAwayFromObstaclesNormalized * FITNESS_MULTIPLIERS.TURNS_AWAY_FROM_OBSTACLES).toFixed(1)} pts (${avgTurnsAwayFromObstacles.toFixed(2)} raw, ${avgTurnsAwayFromObstaclesNormalized.toFixed(2)} normalized × ${FITNESS_MULTIPLIERS.TURNS_AWAY_FROM_OBSTACLES})
  - Food Approaches: ${(avgFoodApproachesNormalized * FITNESS_MULTIPLIERS.FOOD_APPROACHES).toFixed(1)} pts (${avgFoodApproaches.toFixed(2)} raw, ${avgFoodApproachesNormalized.toFixed(2)} normalized × ${FITNESS_MULTIPLIERS.FOOD_APPROACHES})
  - Clever Turns: ${(avgCleverTurns * FITNESS_MULTIPLIERS.CLEVER_TURNS).toFixed(1)} pts (${avgCleverTurns.toFixed(2)} × ${FITNESS_MULTIPLIERS.CLEVER_TURNS})
  - Exploration: ${(avgExplorationPercentage * FITNESS_MULTIPLIERS.EXPLORATION).toFixed(1)} pts (${avgExplorationPercentage.toFixed(2)}% × ${FITNESS_MULTIPLIERS.EXPLORATION})
  - Direction Changes: ${(avgDirectionChanged * FITNESS_MULTIPLIERS.DIRECTION_CHANGES).toFixed(1)} pts (normalized × ${FITNESS_MULTIPLIERS.DIRECTION_CHANGES}, capped at 500 raw)
  - Speed Changes: ${(avgSpeedChanged * FITNESS_MULTIPLIERS.SPEED_CHANGES).toFixed(1)} pts (normalized × ${FITNESS_MULTIPLIERS.SPEED_CHANGES}, capped at 200 raw)
  - Obstacle-Free Frames: ${avgObstacleFreeFrames.toFixed(1)} pts
  - Successful Escapes: ${(avgSuccessfulEscapes * FITNESS_MULTIPLIERS.SUCCESSFUL_ESCAPES).toFixed(1)} pts (${avgSuccessfulEscapes.toFixed(2)} × ${FITNESS_MULTIPLIERS.SUCCESSFUL_ESCAPES})
Fitness Components (Penalties):
  - Obstacle Collisions: -${(avgWallHits * 30).toFixed(1)} pts (${avgWallHits.toFixed(1)} × 30)
  - Wall Hits: -${((avgCollisions - avgWallHits) * 10).toFixed(1)} pts (${(avgCollisions - avgWallHits).toFixed(1)} × 10)
  - Circular Movement: (included in penalties above)
  - Total Penalties: -${avgPenalties.toFixed(1)} pts

-- SYSTEM --
Memory: ${memoryStats.current} (Peak: ${memoryStats.peak})
GPU: ${simulation.useGpu ? 'Enabled' : 'Disabled'}

-- BALANCE CONSTANTS --
Energy:
  - MAX_ENERGY: ${MAX_ENERGY}
  - MIN_ENERGY_TO_REPRODUCE: ${MIN_ENERGY_TO_REPRODUCE}
  - MIN_ENERGY_FOR_SPLITTING: ${MIN_ENERGY_FOR_SPLITTING}
  - PASSIVE_LOSS: ${PASSIVE_LOSS} per frame
  - MOVEMENT_COST_MULTIPLIER: ${MOVEMENT_COST_MULTIPLIER}
  - ROTATION_COST_MULTIPLIER: ${ROTATION_COST_MULTIPLIER}
  - AGENT_SIZE_ENERGY_LOSS_MULTIPLIER: ${AGENT_SIZE_ENERGY_LOSS_MULTIPLIER}
Reproduction:
  - REPRODUCTION_COOLDOWN_FRAMES: ${REPRODUCTION_COOLDOWN_FRAMES} (${(REPRODUCTION_COOLDOWN_FRAMES / 60).toFixed(1)}s)
  - PREGNANCY_DURATION_FRAMES: ${PREGNANCY_DURATION_FRAMES} (${(PREGNANCY_DURATION_FRAMES / 60).toFixed(1)}s)
  - MATURATION_AGE_FRAMES: ${MATURATION_AGE_FRAMES} (${(MATURATION_AGE_FRAMES / 60).toFixed(1)}s)
  - REPRODUCE_COST_BASE: ${REPRODUCE_COST_BASE}
  - CHILD_STARTING_ENERGY: ${CHILD_STARTING_ENERGY}
  - TARGET_AGE_SECONDS: ${TARGET_AGE_SECONDS}
Food:
  - FOOD_ENERGY_NORMAL_BASE: ${FOOD_ENERGY_NORMAL_BASE}
  - FOOD_ENERGY_HIGH_BASE: ${FOOD_ENERGY_HIGH_BASE}
  - FOOD_SPAWN_RATE: ${FOOD_SPAWN_RATE}
  - HIGH_VALUE_FOOD_CHANCE: ${HIGH_VALUE_FOOD_CHANCE}
Fitness Multipliers (Rewards):
  - FOOD_EATEN: ${FITNESS_MULTIPLIERS.FOOD_EATEN}
  - OFFSPRING: ${FITNESS_MULTIPLIERS.OFFSPRING}
  - KILLS: ${FITNESS_MULTIPLIERS.KILLS}
  - EXPLORATION: ${FITNESS_MULTIPLIERS.EXPLORATION}
  - CLEVER_TURNS: ${FITNESS_MULTIPLIERS.CLEVER_TURNS}
  - EFFICIENCY: ${FITNESS_MULTIPLIERS.EFFICIENCY}
  - TURNS_TOWARDS_FOOD: ${FITNESS_MULTIPLIERS.TURNS_TOWARDS_FOOD}
  - TURNS_AWAY_FROM_OBSTACLES: ${FITNESS_MULTIPLIERS.TURNS_AWAY_FROM_OBSTACLES}
  - FOOD_APPROACHES: ${FITNESS_MULTIPLIERS.FOOD_APPROACHES}
  - DIRECTION_CHANGES: ${FITNESS_MULTIPLIERS.DIRECTION_CHANGES}
  - SPEED_CHANGES: ${FITNESS_MULTIPLIERS.SPEED_CHANGES}
  - SUCCESSFUL_ESCAPES: ${FITNESS_MULTIPLIERS.SUCCESSFUL_ESCAPES}
  - GOALS_COMPLETED: ${FITNESS_MULTIPLIERS.GOALS_COMPLETED}
  - REPRODUCTION_ATTEMPT: ${FITNESS_MULTIPLIERS.REPRODUCTION_ATTEMPT}
Fitness Penalties:
  - CIRCULAR_MOVEMENT: ${FITNESS_PENALTIES.CIRCULAR_MOVEMENT}
  - OBSTACLE_HIT: ${FITNESS_PENALTIES.OBSTACLE_HIT}
  - WALL_HIT: ${FITNESS_PENALTIES.WALL_HIT}
  - INACTIVITY: ${FITNESS_PENALTIES.INACTIVITY}
  - MINIMAL_MOVEMENT: ${FITNESS_PENALTIES.MINIMAL_MOVEMENT}
Survival Bonuses:
  - BASE_MULTIPLIER: ${SURVIVAL_BONUSES.BASE_MULTIPLIER}
  - BASE_CAP: ${SURVIVAL_BONUSES.BASE_CAP}
  - EXTENDED_THRESHOLD: ${SURVIVAL_BONUSES.EXTENDED_THRESHOLD}s
  - EXTENDED_DIVISOR: ${SURVIVAL_BONUSES.EXTENDED_DIVISOR}
Mutation Rate: ${(simulation.mutationRate * 100).toFixed(2)}%

-- SETTINGS --
Game Speed: ${simulation.gameSpeed}
Max Agents: ${simulation.maxAgents}
Food Spawn Multiplier: ${finalFoodMultiplier.toFixed(2)}
Food Scarcity Factor: ${foodScarcityFactor.toFixed(2)}
Population Factor: ${populationFactor.toFixed(2)}
`;

    // Copy to clipboard
    navigator.clipboard.writeText(report.trim()).then(() => {
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
        simulation.logger.error('Failed to copy stats:', err);
        alert('Failed to copy stats to clipboard');
    });
}