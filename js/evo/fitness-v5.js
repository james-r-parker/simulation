// The legacy fitness formula (`calculateFitness` in js/agent.js) on observer counters, in ticks.
//
// The weights are copied from js/constants/agents.js (js/evo may not import js/constants). Legacy seconds become
// `ageTicks / TICKS_PER_SECOND`; the legacy exploration grid becomes the observer's `cellsVisited` over its
// 72 x 41 cells. Terms whose legacy input the observer does not count are 0 and named below.

/** Ticks per legacy second (the legacy frame target). */
const TICKS_PER_SECOND = 60;
/** Cells in the observer's exploration bitset (72 x 41). */
const GRID_CELLS = 72 * 41;

// FITNESS_CATEGORIES
const SURVIVAL_WEIGHT = 0.3;
const ACTION_WEIGHT = 0.3;
const SPECIALIZATION_WEIGHT = 0.4;

// SURVIVAL_SCORING.AGE_MULTIPLIER, DAMAGE_AVOIDANCE_BONUS (TEMPERATURE_EFFICIENCY_BONUS and
// ENERGY_EFFICIENCY_MULTIPLIER need the temperature average and energy spent, which the observer lacks: 0)
const AGE_MULTIPLIER = 5;
const DAMAGE_AVOIDANCE_BONUS = 0.5;
/** Legacy: each collision costs 30 collision-free frames. */
const COLLISION_PENALTY_FRAMES = 30;
/** Legacy: the damage-avoidance bonus needs more than 200 collision-free frames. */
const MIN_COLLISION_FREE_FRAMES = 200;

// ACTION_SCORING (GOAL_COMPLETION and the turnsAwayFromObstacles / foodApproaches parts of the navigation term
// have no observer counter: 0)
const FOOD_EATEN = 150;
const EXPLORATION_PERCENT = 200;
const MOVEMENT_DISTANCE = 0.5;
const NAVIGATION_QUALITY = 8;
/** MIN_DISTANCE_FOR_MOVEMENT_REWARDS */
const MIN_DISTANCE_FOR_MOVEMENT = 100;
/** Legacy cap on the turns-towards-food count in the navigation term. */
const MAX_TURNS_TOWARDS_FOOD = 100;

// SPECIALIZATION_SCORING
const PREDATOR_DAMAGE_DEALT = 10;
const PREDATOR_KILLS = 800;
/** Legacy estimate: damage dealt is `kills * 100` (legacy-audit FIT-5). */
const PREDATOR_DAMAGE_PER_KILL = 100;
const FORAGER_GATHERING_RATE = 100;
const FORAGER_SHARING_BONUS = 50;
/** Legacy estimate: shouts are 10% of food eaten (FIT-5). */
const FORAGER_SHOUTS_PER_FOOD = 0.1;
const SCOUT_UNIQUE_SECTORS = 5;
const SCOUT_INFORMATION_SHARING = 50;
/** Legacy estimate: shouts are 5% of cells explored (FIT-5). */
const SCOUT_SHOUTS_PER_CELL = 0.05;
const DEFENDER_TIME_NEAR_ALLIES = 2;
const DEFENDER_PREDATOR_INTERCEPTION = 250;
/** Legacy estimate: guarding frames are 30% of frames alive; no ally proximity is measured (FIT-3). */
const DEFENDER_GUARDING_SHARE = 0.3;
const REPRODUCER_OFFSPRING = 300;
const REPRODUCER_OFFSPRING_SURVIVAL = 300;
/** Legacy estimate: 30% of offspring survive (FIT-5). */
const REPRODUCER_SURVIVAL_SHARE = 0.3;
const REPRODUCER_SPLIT_BONUS = 400;

/**
 * Legacy `calculateSurvivalScore`. The temperature and energy-efficiency terms are 0 (not observed). The
 * legacy `collisions` counter also held obstacle hits, so `totalCollisions` equals it.
 * @param {Record<string, any>} observer
 * @param {number} slot
 * @returns {number}
 */
function survivalScore(observer, slot) {
    const ageTicks = observer.ageTicks[slot];
    let score = (ageTicks / TICKS_PER_SECOND) * AGE_MULTIPLIER;
    const collisionFree = Math.max(0, ageTicks - observer.collisions[slot] * COLLISION_PENALTY_FRAMES);
    if (collisionFree > MIN_COLLISION_FREE_FRAMES) {
        score += collisionFree * DAMAGE_AVOIDANCE_BONUS;
    }
    return Math.max(0, score);
}

/**
 * Food items eaten: `foodEnergy` is the only food counter, so the count is the energy over one item's energy.
 * @param {Record<string, any>} observer
 * @param {number} slot
 * @param {Record<string, any>} config
 * @returns {number}
 */
function foodEaten(observer, slot, config) {
    return observer.foodEnergy[slot] / config.foodEnergy;
}

/**
 * Legacy `calculateActionScore`. The circular-motion penalty (`consecutiveTurns`) is not observed: 0.
 * @param {Record<string, any>} observer
 * @param {number} slot
 * @param {Record<string, any>} config
 * @returns {number}
 */
function actionScore(observer, slot, config) {
    let score = foodEaten(observer, slot, config) * FOOD_EATEN;
    score += (observer.cellsVisited[slot] / GRID_CELLS) * 100 * EXPLORATION_PERCENT;
    const distance = observer.distance[slot];
    if (distance > MIN_DISTANCE_FOR_MOVEMENT) {
        score += distance * MOVEMENT_DISTANCE;
        const turns = Math.min(observer.turnsTowardsFood[slot], MAX_TURNS_TOWARDS_FOOD);
        score += turns * NAVIGATION_QUALITY;
    }
    return Math.max(0, score);
}

/**
 * @param {Record<string, any>} observer
 * @param {number} slot
 * @param {Record<string, any>} config
 * @returns {number}
 */
function foragerScore(observer, slot, config) {
    const eaten = foodEaten(observer, slot, config);
    const ageSeconds = observer.ageTicks[slot] / TICKS_PER_SECOND;
    // The legacy food-efficiency term (`energy / foodEaten`, FIT-6) needs the current energy: 0.
    const perMinute = ageSeconds > 0 ? (eaten / ageSeconds) * 60 : 0;
    return perMinute * FORAGER_GATHERING_RATE + eaten * FORAGER_SHOUTS_PER_FOOD * FORAGER_SHARING_BONUS;
}

/**
 * Legacy `calculateSpecializationScore`. Not observed, so 0: the predator pursuit time, the scout vision bonus
 * (`maxRayDist`) and the defender patrol and mitigation terms (territory, aggression).
 * @param {Record<string, any>} observer
 * @param {number} slot
 * @param {Record<string, any>} config
 * @returns {number}
 */
function specializationScore(observer, slot, config) {
    const specs = config.specialisations;
    const spec = observer.spec[slot];
    const kills = observer.kills[slot];
    let score = 0;
    if (spec === specs.predator.index) {
        score = kills * PREDATOR_DAMAGE_PER_KILL * PREDATOR_DAMAGE_DEALT + kills * PREDATOR_KILLS;
    } else if (spec === specs.forager.index) {
        score = foragerScore(observer, slot, config);
    } else if (spec === specs.scout.index) {
        const cells = observer.cellsVisited[slot];
        score = cells * SCOUT_UNIQUE_SECTORS + cells * SCOUT_SHOUTS_PER_CELL * SCOUT_INFORMATION_SHARING;
    } else if (spec === specs.defender.index) {
        const guarding = observer.ageTicks[slot] * DEFENDER_GUARDING_SHARE;
        score = guarding * DEFENDER_TIME_NEAR_ALLIES + kills * DEFENDER_PREDATOR_INTERCEPTION;
    } else if (spec === specs.reproducer.index) {
        const children = observer.children[slot];
        score = children * REPRODUCER_OFFSPRING;
        score += children * REPRODUCER_SURVIVAL_SHARE * REPRODUCER_OFFSPRING_SURVIVAL;
        score += observer.childrenFromSplit[slot] * REPRODUCER_SPLIT_BONUS;
    }
    return Math.max(0, score);
}

/**
 * The legacy fitness: 0.3 survival + 0.3 action + 0.4 specialisation.
 * @param {Record<string, any>} observer the eval observer; only per-slot state is read
 * @param {number} slot the slot (valid after the slot's agent died, until it is reused)
 * @param {Record<string, any>} config the validated sim config
 * @returns {number}
 */
export function fitnessV5(observer, slot, config) {
    return (
        survivalScore(observer, slot) * SURVIVAL_WEIGHT +
        actionScore(observer, slot, config) * ACTION_WEIGHT +
        specializationScore(observer, slot, config) * SPECIALIZATION_WEIGHT
    );
}
