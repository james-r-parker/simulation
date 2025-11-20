# Collision Logic Documentation

## Overview
Collision detection for **physical interactions** (bumping, eating, mating) is **CPU-only**.
However, **Perception (Ray Casting)** is accelerated via **WebGPU** when available.

The main collision handler for physical interactions is `checkCollisions()` in `game.js`.

---

## Collision Detection Method

### Location
- **File**: `js/game.js`
- **Method**: `checkCollisions()` (lines 826-875)
- **Called**: Every frame, inside the `gameSpeed` loop (line 1131)

### Algorithm
1. **Spatial Query**: Uses quadtree to find nearby entities (within `agentSize * 2` radius)
2. **Distance Check**: Uses squared distance (`distSq < combinedSizeSq`) to avoid expensive `sqrt()` calls
3. **Performance Limit**: Maximum 12 collision checks per agent (reduced from 15 for optimization)
4. **Early Rejection**: Skips self, dead entities, and pheromones

### Collision Formula
```javascript
const combinedSize = agentSize + otherSize;
const combinedSizeSq = combinedSize * combinedSize;
const distSq = dx * dx + dy * dy;

if (distSq < combinedSizeSq) {
    // COLLISION DETECTED
}
```

---

## Collision Types

### 1. Agent-Food Collision

**Condition**: `other.isFood === true`

**What Happens**:
```javascript
agent.energy += other.energyValue;  // Agent gains food's energy
agent.foodEaten++;                   // Increment food counter
other.isDead = true;                 // Food is consumed
```

**Food Energy Values**:
- **Normal Food**: 40-50 energy (random: `40 + Math.random() * 10`)
- **High-Value Food**: 100-120 energy (random: `100 + Math.random() * 20`)
- **High-Value Chance**: 5% (`HIGH_VALUE_FOOD_CHANCE = 0.05`)

**Food Properties**:
- Normal food: `size = 3`
- High-value food: `size = 5`
- Both have `isFood = true` marker

---

### 2. Agent-Agent Mating Collision

**Condition**: 
```javascript
other instanceof Agent && 
agent.wantsToReproduce && 
other.wantsToReproduce
```

**What Happens**:
```javascript
agent.tryMate(other, this);
```

**Mating Requirements** (`tryMate()` method):
1. Both agents must be mature: `age >= MATURATION_AGE_SECONDS`
2. Neither agent is pregnant: `!isPregnant`
3. No reproduction cooldown: `reproductionCooldown === 0`
4. Sufficient energy: `energy >= MIN_ENERGY_TO_REPRODUCE`
5. Mate selection: Agent with higher `speedFactor * (energy / MAX_ENERGY)` becomes pregnant

**Mating Result**:
- One agent becomes pregnant (`isPregnant = true`)
- Pregnancy duration: `PREGNANCY_DURATION_FRAMES` frames
- After pregnancy: Child is born via `birthChild()`
- Child inherits: Crossover of both parents' neural network weights
- Child gets: `CHILD_STARTING_ENERGY` energy
- Reproduction cooldown: Both parents get `REPRODUCTION_COOLDOWN_FRAMES`

**Note**: Mating happens **before** attack check, so agents can mate even if one could attack the other.

---

### 3. Agent-Agent Attack/Cannibalism Collision

**Condition**:
```javascript
other instanceof Agent &&
agent.wantsToAttack &&
agentSize > other.size * 1.1  // Attacker must be 10% larger
```

**What Happens**:
```javascript
agent.energy += other.energy * 0.8;  // Attacker gains 80% of victim's energy
agent.kills++;                         // Increment kill counter
other.isDead = true;                   // Victim dies
```

**Attack Requirements**:
- Attacker must have `wantsToAttack = true` (neural network output[4] > 0.8)
- Attacker must be **at least 10% larger** than victim (`agentSize > other.size * 1.1`)
- No size requirement for victim (can be any size smaller)

**Energy Transfer**:
- Attacker gains: `victim.energy * 0.8` (80% efficiency)
- Victim loses: All energy (dies)

**Fitness Impact**:
- `kills * 10` points added to fitness
- `foodEaten * 150` points (for comparison)

---

## Collision Processing Order

When an agent collides with another agent, the order is:

1. **First**: Check for mating (if both `wantsToReproduce`)
2. **Then**: Check for attack (if attacker `wantsToAttack` and is larger)

**Important**: If both conditions are true, **mating happens first**, then attack is checked. However, if mating succeeds, the agents may have cooldowns that prevent immediate attack.

---

## GPU Collision Detection (Not Currently Used)

**Status**: 
- **Ray Tracing (Vision)**: Handled by `GPUPhysics` (WebGPU) for high performance.
- **Body Collisions**: Handled by CPU (`checkCollisions`) as it is fast enough with Quadtree.

**Location**: `js/gpu-physics.js`
- **Method**: `batchRayTracing()` is called every frame in `game.js`.
- **Method**: `createCollisionPipeline()` exists but is not used for body collisions.

**Why Split Approach**: 
- Ray tracing (thousands of rays) is O(N * Rays) and benefits massively from GPU.
- Body collisions are O(N log N) with Quadtree and are efficient enough on CPU.
- Keeping body logic on CPU simplifies game state management (eating, mating events).

---

## Performance Optimizations

1. **Quadtree Spatial Indexing**: Reduces collision checks from O(n²) to O(n log n)
2. **Squared Distance**: Avoids `sqrt()` calls (uses `distSq < combinedSizeSq`)
3. **Max Checks Limit**: Only 12 collision checks per agent (prevents O(n²) worst case)
4. **Early Rejection**: Skips self, dead entities, pheromones immediately

---

## Edge Cases Handled

1. **Self-Collision**: `if (agent === other) continue;`
2. **Dead Entities**: `if (other.isDead) continue;`
3. **Pheromones**: `if (other instanceof PheromonePuff) continue;`
4. **Size Validation**: `const otherSize = other.size || 5;` (defaults to 5 if undefined)
5. **Null Checks**: `if (!agent || agent.isDead) continue;`

---

## Summary

**Food Eating**:
- ✅ Works: Agents gain `food.energyValue` energy
- ✅ Counter: `agent.foodEaten++` increments
- ✅ Food dies: `food.isDead = true`

**Agent Eating**:
- ✅ Works: Attacker gains `victim.energy * 0.8`
- ✅ Counter: `agent.kills++` increments
- ✅ Victim dies: `victim.isDead = true`
- ✅ Size requirement: Attacker must be >10% larger
- ✅ Attack flag: Requires `wantsToAttack = true`

**Mating**:
- ✅ Works: Both agents must want to reproduce
- ✅ Pregnancy: One agent becomes pregnant
- ✅ Child birth: After pregnancy duration
- ✅ Cooldown: Both parents get reproduction cooldown

All collision logic is **CPU-based** and working correctly. GPU collision detection exists but is not integrated into the game loop.



