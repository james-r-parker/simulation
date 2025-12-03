


import {
    MIN_FITNESS_TO_SAVE_GENE_POOL,
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
    
    // Navigation behavior tracking (NEW) - with safety checks to prevent Infinity
    const safeNumber = (val, defaultVal = 0) => {
        if (typeof val !== 'number' || !isFinite(val)) return defaultVal;
        return val;
    };
    const avgTurnsTowardsFood = livingAgents.reduce((sum, a) => sum + safeNumber(a.turnsTowardsFood || 0, 0), 0) / livingAgents.length;
    const avgTurnsAwayFromObstacles = livingAgents.reduce((sum, a) => sum + safeNumber(a.turnsAwayFromObstacles || 0, 0), 0) / livingAgents.length;
    const avgFoodApproaches = livingAgents.reduce((sum, a) => sum + safeNumber(a.foodApproaches || 0, 0), 0) / livingAgents.length;
    const avgCleverTurns = livingAgents.reduce((sum, a) => sum + safeNumber(a.cleverTurns || 0, 0), 0) / livingAgents.length;
    const avgSuccessfulEscapes = livingAgents.reduce((sum, a) => sum + safeNumber(a.successfulEscapes || 0, 0), 0) / livingAgents.length;
    
    // Detailed fitness breakdown - with safety checks to prevent Infinity
    // NOTE: This breakdown matches the actual calculateFitness() formula in agent.js
    const fitnessBreakdown = livingAgents.map(a => {
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
        const ageInFrames = ageInSeconds * FPS_TARGET;
        const obstacleFreeFrames = Math.max(0, ageInFrames - (safeNumber(a.timesHitObstacle || 0, 0) * 30));
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
    });
    
    const avgBaseScore = fitnessBreakdown.reduce((sum, f) => sum + f.baseScore, 0) / livingAgents.length;
    const avgPenalties = fitnessBreakdown.reduce((sum, f) => sum + f.penalties, 0) / livingAgents.length;
    const avgNetBaseScore = fitnessBreakdown.reduce((sum, f) => sum + f.netBaseScore, 0) / livingAgents.length;
    const avgSurvivalBonus = fitnessBreakdown.reduce((sum, f) => sum + f.survivalBonus, 0) / livingAgents.length;
    const avgRawSurvivalBonus = fitnessBreakdown.reduce((sum, f) => sum + f.rawSurvivalBonus, 0) / livingAgents.length;
    
    // Additional fitness component averages for detailed breakdown
    // (avgExplorationPercentage is calculated later in qualification criteria section)
    // Calculate normalized movement and navigation values (matching agent.js calculation)
    const avgDirectionChanged = livingAgents.reduce((sum, a) => {
        const distanceTravelled = safeNumber(a.distanceTravelled || 0, 0);
        if (distanceTravelled > MIN_DISTANCE_FOR_MOVEMENT_REWARDS) {
            const distanceNormalizer = distanceTravelled / 100;
            const normalized = Math.min(safeNumber(a.directionChanged || 0, 0), 500) / Math.max(distanceNormalizer, 1);
            return sum + normalized;
        }
        return sum;
    }, 0) / livingAgents.length;
    
    const avgSpeedChanged = livingAgents.reduce((sum, a) => {
        const distanceTravelled = safeNumber(a.distanceTravelled || 0, 0);
        if (distanceTravelled > MIN_DISTANCE_FOR_MOVEMENT_REWARDS) {
            const distanceNormalizer = distanceTravelled / 100;
            const normalized = Math.min(safeNumber(a.speedChanged || 0, 0), 200) / Math.max(distanceNormalizer, 1);
            return sum + normalized;
        }
        return sum;
    }, 0) / livingAgents.length;
    
    const avgTurnsTowardsFoodNormalized = livingAgents.reduce((sum, a) => {
        const distanceTravelled = safeNumber(a.distanceTravelled || 0, 0);
        if (distanceTravelled > MIN_DISTANCE_FOR_MOVEMENT_REWARDS) {
            const distanceNormalizer = distanceTravelled / 100;
            const normalized = safeNumber(a.turnsTowardsFood || 0, 0) / Math.max(distanceNormalizer, 1);
            return sum + normalized;
        }
        return sum;
    }, 0) / livingAgents.length;
    
    const avgTurnsAwayFromObstaclesNormalized = livingAgents.reduce((sum, a) => {
        const distanceTravelled = safeNumber(a.distanceTravelled || 0, 0);
        if (distanceTravelled > MIN_DISTANCE_FOR_MOVEMENT_REWARDS) {
            const distanceNormalizer = distanceTravelled / 100;
            const normalized = safeNumber(a.turnsAwayFromObstacles || 0, 0) / Math.max(distanceNormalizer, 1);
            return sum + normalized;
        }
        return sum;
    }, 0) / livingAgents.length;
    
    const avgFoodApproachesNormalized = livingAgents.reduce((sum, a) => {
        const distanceTravelled = safeNumber(a.distanceTravelled || 0, 0);
        if (distanceTravelled > MIN_DISTANCE_FOR_MOVEMENT_REWARDS) {
            const distanceNormalizer = distanceTravelled / 100;
            const normalized = safeNumber(a.foodApproaches || 0, 0) / Math.max(distanceNormalizer, 1);
            return sum + normalized;
        }
        return sum;
    }, 0) / livingAgents.length;
    
    const avgObstacleFreeFrames = livingAgents.reduce((sum, a) => {
        const ageInFrames = (a.age || 0) * FPS_TARGET;
        const obstacleFreeFrames = Math.max(0, ageInFrames - ((a.timesHitObstacle || 0) * 30));
        return sum + (obstacleFreeFrames > 200 ? (obstacleFreeFrames / 200) * 25 : 0);
    }, 0) / livingAgents.length;

    const MATURATION_SECONDS = 10; // Updated to match new MATURATION_AGE_FRAMES (600 frames = 10s)
    const matureAgents = livingAgents.filter(a => a.age >= MATURATION_SECONDS).length;
    const maturationRate = (matureAgents / livingAgents.length) * 100;
    const maxAge = Math.max(...livingAgents.map(a => a.age), 0);

    const totalSexualOffspring = livingAgents.reduce((sum, a) => sum + (a.childrenFromMate || 0), 0);
    const totalAsexualOffspring = livingAgents.reduce((sum, a) => sum + (a.childrenFromSplit || 0), 0);

    const reproductionRate = simulation.reproductionRate || 0;
    const collisionFreeAgents = livingAgents.filter(a => (a.timesHitObstacle || 0) === 0).length;
    const collisionFreePercent = (collisionFreeAgents / livingAgents.length) * 100;
    const qualifiedAgents = livingAgents.filter(a => a.fit).length;
    
    // Calculate qualification criteria breakdown
    const totalCells = EXPLORATION_GRID_WIDTH * EXPLORATION_GRID_HEIGHT;
    const agentsMeetingFitness = livingAgents.filter(a => a.fitness >= MIN_FITNESS_TO_SAVE_GENE_POOL).length;
    const agentsMeetingFood = livingAgents.filter(a => (a.foodEaten || 0) >= MIN_FOOD_EATEN_TO_SAVE_GENE_POOL).length;
    const agentsMeetingAge = livingAgents.filter(a => (a.age || 0) >= MIN_SECONDS_ALIVE_TO_SAVE_GENE_POOL).length;
    const agentsMeetingExploration = livingAgents.filter(a => {
        const explorationPercentage = ((a.exploredCells?.size || 0) / totalCells) * 100;
        return explorationPercentage >= MIN_EXPLORATION_PERCENTAGE_TO_SAVE_GENE_POOL;
    }).length;
    const agentsMeetingNavigation = livingAgents.filter(a => (a.turnsTowardsFood || 0) >= MIN_TURNS_TOWARDS_FOOD_TO_SAVE_GENE_POOL).length;
    
    // Calculate average exploration percentage
    const avgExplorationPercentage = livingAgents.reduce((sum, a) => {
        const explorationPercentage = ((a.exploredCells?.size || 0) / totalCells) * 100;
        return sum + explorationPercentage;
    }, 0) / livingAgents.length;

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

    // Calculate detailed food statistics
    const livingFood = simulation.food.filter(f => !f.isDead);
    const highValueFood = livingFood.filter(f => f.isHighValue);
    const normalFood = livingFood.filter(f => !f.isHighValue);

    const totalFoodEnergy = livingFood.reduce((sum, f) => sum + f.energyValue, 0);
    const avgFoodEnergy = livingFood.length > 0 ? totalFoodEnergy / livingFood.length : 0;

    const highValueEnergy = highValueFood.reduce((sum, f) => sum + f.energyValue, 0);
    const normalEnergy = normalFood.reduce((sum, f) => sum + f.energyValue, 0);

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
    const genePools = simulation.db.getGenePoolHealth().pools || [];
    const topGenePools = genePools
        .sort((a, b) => b.fitness - a.fitness)
        .slice(0, 5)
        .map(p => `ID ${p.id}: Fit ${p.fitness.toFixed(0)}, Count ${p.count}`)
        .join('\n');

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
    const fitnessValues = livingAgents.map(a => safeNumber(a.fitness, 0));
    const baseScoreValues = fitnessBreakdown.map(f => f.baseScore);
    const penaltiesValues = fitnessBreakdown.map(f => f.penalties);
    const netBaseScoreValues = fitnessBreakdown.map(f => f.netBaseScore);
    const survivalBonusValues = fitnessBreakdown.map(f => f.survivalBonus);
    const foodEatenValues = livingAgents.map(a => safeNumber(a.foodEaten || 0, 0));
    const offspringValues = livingAgents.map(a => safeNumber(a.offspring || 0, 0));
    const killsValues = livingAgents.map(a => safeNumber(a.kills || 0, 0));
    const explorationValues = livingAgents.map(a => {
        const totalCells = EXPLORATION_GRID_WIDTH * EXPLORATION_GRID_HEIGHT;
        return safeNumber(((a.exploredCells?.size || 0) / totalCells * 100), 0);
    });
    const cleverTurnsValues = livingAgents.map(a => safeNumber(a.cleverTurns || 0, 0));
    const turnsTowardsFoodRawValues = livingAgents.map(a => safeNumber(a.turnsTowardsFood || 0, 0));
    const turnsAwayFromObstaclesRawValues = livingAgents.map(a => safeNumber(a.turnsAwayFromObstacles || 0, 0));
    const foodApproachesRawValues = livingAgents.map(a => safeNumber(a.foodApproaches || 0, 0));
    const directionChangedRawValues = livingAgents.map(a => safeNumber(a.directionChanged || 0, 0));
    const speedChangedRawValues = livingAgents.map(a => safeNumber(a.speedChanged || 0, 0));
    const successfulEscapesValues = livingAgents.map(a => safeNumber(a.successfulEscapes || 0, 0));
    const energyValues = livingAgents.map(a => safeNumber(a.energy, 0));
    const energySpentValues = livingAgents.map(a => safeNumber(a.energySpent || 0, 0));
    const ageValues = livingAgents.map(a => safeNumber(a.age || 0, 0));
    const distanceTravelledValues = livingAgents.map(a => safeNumber(a.distanceTravelled || 0, 0));
    const reproductionAttemptsValues = livingAgents.map(a => safeNumber(a.reproductionAttempts || 0, 0));
    const childrenFromMateValues = livingAgents.map(a => safeNumber(a.childrenFromMate || 0, 0));
    const childrenFromSplitValues = livingAgents.map(a => safeNumber(a.childrenFromSplit || 0, 0));
    
    // Calculate normalized values for navigation metrics
    const turnsTowardsFoodNormalizedValues = livingAgents.map(a => {
        const distanceTravelled = safeNumber(a.distanceTravelled || 0, 0);
        if (distanceTravelled > MIN_DISTANCE_FOR_MOVEMENT_REWARDS) {
            const distanceNormalizer = distanceTravelled / 100;
            return safeNumber(a.turnsTowardsFood || 0, 0) / Math.max(distanceNormalizer, 1);
        }
        return 0;
    });
    const turnsAwayFromObstaclesNormalizedValues = livingAgents.map(a => {
        const distanceTravelled = safeNumber(a.distanceTravelled || 0, 0);
        if (distanceTravelled > MIN_DISTANCE_FOR_MOVEMENT_REWARDS) {
            const distanceNormalizer = distanceTravelled / 100;
            return safeNumber(a.turnsAwayFromObstacles || 0, 0) / Math.max(distanceNormalizer, 1);
        }
        return 0;
    });
    const foodApproachesNormalizedValues = livingAgents.map(a => {
        const distanceTravelled = safeNumber(a.distanceTravelled || 0, 0);
        if (distanceTravelled > MIN_DISTANCE_FOR_MOVEMENT_REWARDS) {
            const distanceNormalizer = distanceTravelled / 100;
            return safeNumber(a.foodApproaches || 0, 0) / Math.max(distanceNormalizer, 1);
        }
        return 0;
    });
    const directionChangedNormalizedValues = livingAgents.map(a => {
        const distanceTravelled = safeNumber(a.distanceTravelled || 0, 0);
        if (distanceTravelled > MIN_DISTANCE_FOR_MOVEMENT_REWARDS) {
            const distanceNormalizer = distanceTravelled / 100;
            return Math.min(safeNumber(a.directionChanged || 0, 0), 500) / Math.max(distanceNormalizer, 1);
        }
        return 0;
    });
    const speedChangedNormalizedValues = livingAgents.map(a => {
        const distanceTravelled = safeNumber(a.distanceTravelled || 0, 0);
        if (distanceTravelled > MIN_DISTANCE_FOR_MOVEMENT_REWARDS) {
            const distanceNormalizer = distanceTravelled / 100;
            return Math.min(safeNumber(a.speedChanged || 0, 0), 200) / Math.max(distanceNormalizer, 1);
        }
        return 0;
    });
    
    // Calculate efficiency values
    const efficiencyValues = livingAgents.map(a => {
        const distanceTravelled = safeNumber(a.distanceTravelled || 0, 0);
        const energySpent = safeNumber(a.energySpent || 0, 0);
        if (energySpent > 0) {
            return Math.min(distanceTravelled / Math.max(energySpent, 1), 10.0);
        }
        return 0;
    });

    // Calculate obstacle-free frames values
    const obstacleFreeFramesValues = livingAgents.map(a => {
        const ageInFrames = (a.age || 0) * FPS_TARGET;
        const obstacleFreeFrames = Math.max(0, ageInFrames - ((a.timesHitObstacle || 0) * 30));
        return obstacleFreeFrames > 200 ? (obstacleFreeFrames / 200) * 25 : 0;
    });

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
  - Fitness: ≥${MIN_FITNESS_TO_SAVE_GENE_POOL}
  - Food Eaten: ≥${MIN_FOOD_EATEN_TO_SAVE_GENE_POOL} items
  - Age: ≥${(MIN_FRAMES_ALIVE_TO_SAVE_GENE_POOL / 60).toFixed(1)}s (${MIN_FRAMES_ALIVE_TO_SAVE_GENE_POOL} frames)
  - Exploration: ≥${MIN_EXPLORATION_PERCENTAGE_TO_SAVE_GENE_POOL}% map coverage
  - Navigation: ≥${MIN_TURNS_TOWARDS_FOOD_TO_SAVE_GENE_POOL} turns towards food
Agents Meeting Each Criterion:
  - Fitness ≥${MIN_FITNESS_TO_SAVE_GENE_POOL}: ${agentsMeetingFitness} / ${livingAgents.length} (${((agentsMeetingFitness / livingAgents.length) * 100).toFixed(1)}%)
  - Food ≥${MIN_FOOD_EATEN_TO_SAVE_GENE_POOL}: ${agentsMeetingFood} / ${livingAgents.length} (${((agentsMeetingFood / livingAgents.length) * 100).toFixed(1)}%)
  - Age ≥${(MIN_FRAMES_ALIVE_TO_SAVE_GENE_POOL / 60).toFixed(1)}s: ${agentsMeetingAge} / ${livingAgents.length} (${((agentsMeetingAge / livingAgents.length) * 100).toFixed(1)}%)
  - Exploration ≥${MIN_EXPLORATION_PERCENTAGE_TO_SAVE_GENE_POOL}%: ${agentsMeetingExploration} / ${livingAgents.length} (${((agentsMeetingExploration / livingAgents.length) * 100).toFixed(1)}%)
  - Navigation ≥${MIN_TURNS_TOWARDS_FOOD_TO_SAVE_GENE_POOL}: ${agentsMeetingNavigation} / ${livingAgents.length} (${((agentsMeetingNavigation / livingAgents.length) * 100).toFixed(1)}%)
  - ALL CRITERIA MET (Qualified): ${qualifiedAgents} / ${livingAgents.length} (${((qualifiedAgents / livingAgents.length) * 100).toFixed(1)}%)
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