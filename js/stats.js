


import {
    MIN_FITNESS_TO_SAVE_GENE_POOL,
    MIN_FOOD_EATEN_TO_SAVE_GENE_POOL,
    MIN_FRAMES_ALIVE_TO_SAVE_GENE_POOL,
    MIN_SECONDS_ALIVE_TO_SAVE_GENE_POOL,
    MIN_EXPLORATION_PERCENTAGE_TO_SAVE_GENE_POOL,
    MIN_TURNS_TOWARDS_FOOD_TO_SAVE_GENE_POOL,
    EXPLORATION_GRID_WIDTH,
    EXPLORATION_GRID_HEIGHT
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
    const fitnessBreakdown = livingAgents.map(a => {
        const totalCells = EXPLORATION_GRID_WIDTH * EXPLORATION_GRID_HEIGHT;
        const explorationPercentage = safeNumber((a.exploredCells?.size || 0) / totalCells * 100, 0);
        const baseScore = 
            safeNumber(a.offspring || 0, 0) * 50 +
            safeNumber(a.cleverTurns || 0, 0) * 50 +
            Math.min(safeNumber(a.directionChanged || 0, 0), 500) * 2 +
            Math.min(safeNumber(a.speedChanged || 0, 0), 200) * 1 +
            explorationPercentage * 20 + // Updated to match new reward (was 10)
            safeNumber(a.foodEaten || 0, 0) * 200 +
            safeNumber(a.kills || 0, 0) * 100 +
            safeNumber(a.turnsTowardsFood || 0, 0) * 10 + // Updated to match new reward (was 5)
            safeNumber(a.turnsAwayFromObstacles || 0, 0) * 10 +
            safeNumber(a.foodApproaches || 0, 0) * 25; // Updated to match new reward (was 15), with safety check
        
        const penalties = 
            Math.min(safeNumber(a.consecutiveTurns || 0, 0) * 20, 2000) * 2 + // Circle penalty applied twice
            safeNumber(a.timesHitObstacle || 0, 0) * 30 +
            (safeNumber(a.collisions || 0, 0) - safeNumber(a.timesHitObstacle || 0, 0)) * 10;
        
        const survivalMultiplier = Math.min(1 + (safeNumber(a.framesAlive || 0, 0) / 1800), 3.0);
        const rawSurvivalBonus = safeNumber(a.framesAlive || 0, 0) / 30;
        
        const finalBaseScore = safeNumber(baseScore, 0);
        const finalPenalties = safeNumber(penalties, 0);
        const finalNetBaseScore = safeNumber(finalBaseScore - finalPenalties, 0);
        
        return {
            fitness: safeNumber(a.fitness, 0),
            baseScore: finalBaseScore,
            penalties: finalPenalties,
            netBaseScore: finalNetBaseScore,
            survivalMultiplier: safeNumber(survivalMultiplier, 1.0),
            rawSurvivalBonus: safeNumber(rawSurvivalBonus, 0),
            finalFitness: safeNumber(a.fitness, 0)
        };
    });
    
    const avgBaseScore = fitnessBreakdown.reduce((sum, f) => sum + f.baseScore, 0) / livingAgents.length;
    const avgPenalties = fitnessBreakdown.reduce((sum, f) => sum + f.penalties, 0) / livingAgents.length;
    const avgNetBaseScore = fitnessBreakdown.reduce((sum, f) => sum + f.netBaseScore, 0) / livingAgents.length;
    const avgSurvivalMultiplier = fitnessBreakdown.reduce((sum, f) => sum + f.survivalMultiplier, 0) / livingAgents.length;
    const avgRawSurvivalBonus = fitnessBreakdown.reduce((sum, f) => sum + f.rawSurvivalBonus, 0) / livingAgents.length;
    
    // Additional fitness component averages for detailed breakdown
    // (avgExplorationPercentage is calculated later in qualification criteria section)
    const avgDirectionChanged = livingAgents.reduce((sum, a) => sum + Math.min(a.directionChanged || 0, 500), 0) / livingAgents.length;
    const avgSpeedChanged = livingAgents.reduce((sum, a) => sum + Math.min(a.speedChanged || 0, 200), 0) / livingAgents.length;
    const avgObstacleFreeFrames = livingAgents.reduce((sum, a) => {
        const obstacleFreeFrames = Math.max(0, (a.framesAlive || 0) - ((a.timesHitObstacle || 0) * 30));
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
Avg Age: ${avgAge.toFixed(1)}s (Target: 60s+)
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

-- FITNESS BREAKDOWN --
Avg Base Score: ${avgBaseScore.toFixed(1)}
Avg Penalties: ${avgPenalties.toFixed(1)}
Avg Net Base Score: ${avgNetBaseScore.toFixed(1)}
Avg Survival Multiplier: ${avgSurvivalMultiplier.toFixed(2)}x
Avg Raw Survival Bonus: ${avgRawSurvivalBonus.toFixed(1)}
Fitness Components (Rewards):
  - Food Eaten: ${(avgFood * 200).toFixed(1)} pts (${avgFood.toFixed(1)} × 200)
  - Offspring: ${(avgOffspring * 50).toFixed(1)} pts (${avgOffspring.toFixed(2)} × 50)
  - Turns Towards Food: ${(avgTurnsTowardsFood * 5).toFixed(1)} pts (${avgTurnsTowardsFood.toFixed(2)} × 5)
  - Turns Away From Obstacles: ${(avgTurnsAwayFromObstacles * 10).toFixed(1)} pts (${avgTurnsAwayFromObstacles.toFixed(2)} × 10)
  - Food Approaches: ${(avgFoodApproaches * 15).toFixed(1)} pts (${avgFoodApproaches.toFixed(2)} × 15)
  - Clever Turns: ${(avgCleverTurns * 50).toFixed(1)} pts (${avgCleverTurns.toFixed(2)} × 50)
  - Exploration: ${(avgExplorationPercentage * 10).toFixed(1)} pts (${avgExplorationPercentage.toFixed(2)}% × 10)
  - Direction Changes: ${(avgDirectionChanged * 2).toFixed(1)} pts (${avgDirectionChanged.toFixed(1)} × 2, capped)
  - Speed Changes: ${(avgSpeedChanged * 1).toFixed(1)} pts (${avgSpeedChanged.toFixed(1)} × 1, capped)
  - Obstacle-Free Frames: ${avgObstacleFreeFrames.toFixed(1)} pts
  - Successful Escapes: ${(avgSuccessfulEscapes * 75).toFixed(1)} pts (${avgSuccessfulEscapes.toFixed(2)} × 75)
Fitness Components (Penalties):
  - Obstacle Collisions: -${(avgWallHits * 30).toFixed(1)} pts (${avgWallHits.toFixed(1)} × 30)
  - Wall Hits: -${((avgCollisions - avgWallHits) * 10).toFixed(1)} pts (${(avgCollisions - avgWallHits).toFixed(1)} × 10)
  - Circular Movement: (included in penalties above)
  - Total Penalties: -${avgPenalties.toFixed(1)} pts

-- SYSTEM --
Memory: ${memoryStats.current} (Peak: ${memoryStats.peak})
GPU: ${simulation.useGpu ? 'Enabled' : 'Disabled'}

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