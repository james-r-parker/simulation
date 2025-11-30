// --- GPU PHYSICS MODULE (WebGPU) ---
// GPU-accelerated ray tracing + physics simulation
// Massive performance boost for large agent counts

import { TWO_PI, DAMPENING_FACTOR, MAX_VELOCITY, WORLD_WIDTH, WORLD_HEIGHT, MAX_THRUST, MAX_ROTATION, OBSTACLE_SEGMENTS } from './constants.js';

export class GPUPhysics {
    constructor(logger) {
        this.logger = logger;
        this.logger.log('GPUPhysics constructor started.');

        this.device = null;
        this.queue = null;
        this.initialized = false;
        this.workgroupSize = 256; // Default workgroup size, will be adjusted based on GPU capabilities
        this.rayTracingPipeline = null;
        this.rayTracingBindGroup = null;
        this.physicsPipeline = null;
        this.physicsBindGroup = null;
        this.foodPipeline = null;
        this.foodBindGroup = null;
        this.pheromonePipeline = null;
        this.pheromoneBindGroup = null;
        this.buffers = null;
    }

    async init(config = {}) {
        // Always recreate pipelines to handle device changes/context loss
        this.rayTracingPipeline = null;
        this.physicsPipeline = null;
        this.foodPipeline = null;
        this.pheromonePipeline = null;

        if (!navigator.gpu) {
            this.logger.warn('WebGPU not available for physics, falling back to CPU');
            return false;
        }

        try {
            const adapter = await navigator.gpu.requestAdapter({});
            if (!adapter) {
                this.logger.warn('No WebGPU adapter found for physics');
                return false;
            }

            this.device = await adapter.requestDevice();
            this.queue = this.device.queue;
            this.logger.log('GPU Physics initialized successfully', { limits: this.device.limits });
            this.initialized = true;

            await this.createRayTracingPipeline();
            // NOTE: Physics pipeline disabled for now - collision detection works perfectly with CPU
            // await this.createPhysicsPipeline();
            // NOTE: Food and pheromone pipelines removed - using CPU path due to GPU initialization failures

            if (config.maxAgents && config.maxRaysPerAgent && config.maxEntities && config.maxObstacles) {
                this.logger.log('[GPU-BUFFER] Pre-allocating buffers on initialization.', config);
                this.createRayTracingBuffers(
                    config.maxAgents,
                    config.maxAgents * config.maxRaysPerAgent,
                    config.maxEntities,
                    config.maxObstacles
                );
                // NOTE: Physics buffers disabled - using CPU collision detection
                // this.createPhysicsBuffers(config.maxAgents);
            }

            return true;

        } catch (error) {
            this.logger.error('Error initializing WebGPU for physics:', error);
            return false;
        }
    }

    async createRayTracingPipeline() {
        const rayTracingShader = `
struct Agent {
    x: f32,
    y: f32,
    vx: f32,
    vy: f32,
    angle: f32,
    energy: f32,
    size: f32,
    numSensorRays: f32,
    specializationType: f32,
    maxRayDist: f32,
    numAlignmentRays: f32,
    padding: f32,
};

struct Entity {
    x: f32,
    y: f32,
    size: f32,
    entityType: f32, // 1 for agent, 2 for food
};

struct Obstacle {
    x1: f32,
    y1: f32,
    x2: f32,
    y2: f32,
};

struct RayResult {
    distance: f32,
    hitType: f32, // 0: nothing, 1: wall, 2: food, 3: agent, 4: obstacle
    entityId: f32,
    entitySize: f32, // Size of the entity that was hit (for agent size comparison)
};

struct RayUniforms {
    numAgents: f32,
    numRaysPerAgent: f32,
    numEntities: f32,
    numObstacles: f32,
    numFood: f32,
    worldWidth: f32,
    worldHeight: f32,
    gridCellSize: f32,
    gridWidth: f32,
    gridHeight: f32,
    useSpatialGrid: f32, // 1.0 if spatial grid enabled, 0.0 otherwise
};

@group(0) @binding(0) var<uniform> uniforms: RayUniforms;
@group(0) @binding(1) var<storage, read> agents: array<Agent>;
@group(0) @binding(2) var<storage, read> entities: array<Entity>;
@group(0) @binding(3) var<storage, read> obstacles: array<Obstacle>;
@group(0) @binding(4) var<storage, read_write> results: array<RayResult>;
@group(0) @binding(5) var<storage, read> cellEntityCounts: array<u32>; // Number of entities per cell
@group(0) @binding(6) var<storage, read> cellStartIndices: array<u32>; // Starting index in cellEntityIndices for each cell
@group(0) @binding(7) var<storage, read> cellEntityIndices: array<u32>; // Flat array of entity indices per cell

fn rayCircleIntersection(rayOrigin: vec2<f32>, rayDir: vec2<f32>, circleCenter: vec2<f32>, radius: f32) -> f32 {
    let oc = rayOrigin - circleCenter;
    let a = dot(rayDir, rayDir);
    let b = 2.0 * dot(oc, rayDir);
    let c = dot(oc, oc) - radius * radius;
    let discriminant = b * b - 4.0 * a * c;
    
    if (discriminant < 0.0) {
        return -1.0;
    }
    
    let sqrtD = sqrt(discriminant);
    let t1 = (-b - sqrtD) / (2.0 * a);
    let t2 = (-b + sqrtD) / (2.0 * a);

    if (t1 > 0.001) { return t1; }
    if (t2 > 0.001) { return t2; }
    
    return -1.0;
}

fn rayLineSegmentIntersection(rayOrigin: vec2<f32>, rayDir: vec2<f32>, p1: vec2<f32>, p2: vec2<f32>) -> f32 {
    let v1 = rayOrigin - p1;
    let v2 = p2 - p1;
    let v3 = vec2<f32>(-rayDir.y, rayDir.x);

    let dot_v2_v3 = dot(v2, v3);
    if (abs(dot_v2_v3) < 0.000001) {
        return -1.0;
    }

    let t1 = (v2.x * v1.y - v2.y * v1.x) / dot_v2_v3;
    let t2 = dot(v1, v3) / dot_v2_v3;

    if (t1 > 0.0 && t2 >= 0.0 && t2 <= 1.0) {
        return t1;
    }

    return -1.0;
}


@compute @workgroup_size(256, 1, 1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let ray_index = global_id.x;

    let total_rays = u32(uniforms.numAgents * uniforms.numRaysPerAgent);
    if (ray_index >= total_rays) {
        return;
    }

    let num_rays_per_agent = u32(uniforms.numRaysPerAgent);
    let agent_index = ray_index / num_rays_per_agent;
    let ray_in_agent_index = ray_index % num_rays_per_agent;

    let agent = agents[agent_index];
    let safe_num_rays = max(agent.numSensorRays, 1.0);
    let ray_angle_step = (${TWO_PI}) / safe_num_rays;
    let ray_angle = agent.angle + (f32(ray_in_agent_index) - safe_num_rays / 2.0) * ray_angle_step;
    
    let ray_dir = vec2<f32>(cos(ray_angle), sin(ray_angle));
    let ray_origin = vec2<f32>(agent.x, agent.y);

    var closest_dist = agent.maxRayDist; // Use agent's actual max ray distance
    var hit_type: f32 = 0.0;
    var entity_id: f32 = -1.0;
    var entity_size: f32 = 0.0; // Track size of hit entity

    // World edge intersection
    var t: f32;
    if (ray_dir.x != 0.0) {
        t = (0.0 - ray_origin.x) / ray_dir.x;
        if (t > 0.0 && t < closest_dist) { closest_dist = t; hit_type = 1.0; }
        t = (uniforms.worldWidth - ray_origin.x) / ray_dir.x;
        if (t > 0.0 && t < closest_dist) { closest_dist = t; hit_type = 1.0; }
    }
    if (ray_dir.y != 0.0) {
        t = (0.0 - ray_origin.y) / ray_dir.y;
        if (t > 0.0 && t < closest_dist) { closest_dist = t; hit_type = 1.0; }
        t = (uniforms.worldHeight - ray_origin.y) / ray_dir.y;
        if (t > 0.0 && t < closest_dist) { closest_dist = t; hit_type = 1.0; }
    }
    
    // SPATIAL PARTITIONING: Use grid-based lookup to only check entities in relevant cells
    let num_entities = u32(uniforms.numEntities);
    
    if (num_entities > 0u) {
        if (uniforms.useSpatialGrid > 0.5 && uniforms.gridCellSize > 0.0) {
            // PERFORMANCE: Grid-based spatial partitioning
            // Calculate which grid cells the ray passes through
            let grid_cell_size = uniforms.gridCellSize;
            let grid_width = u32(uniforms.gridWidth);
            let grid_height = u32(uniforms.gridHeight);
            
            // Calculate grid cells that the ray passes through
            let ray_end = ray_origin + ray_dir * closest_dist;
            // Clamp cell coordinates to valid range
            let start_cell_x_f = max(0.0, min(ray_origin.x / grid_cell_size, f32(grid_width - 1u)));
            let start_cell_y_f = max(0.0, min(ray_origin.y / grid_cell_size, f32(grid_height - 1u)));
            let end_cell_x_f = max(0.0, min(ray_end.x / grid_cell_size, f32(grid_width - 1u)));
            let end_cell_y_f = max(0.0, min(ray_end.y / grid_cell_size, f32(grid_height - 1u)));
            
            let start_cell_x = u32(start_cell_x_f);
            let start_cell_y = u32(start_cell_y_f);
            let end_cell_x = u32(end_cell_x_f);
            let end_cell_y = u32(end_cell_y_f);
            
            // Simple approach: check cells in a bounding box around the ray
            // Use var for mutable variables
            var min_cell_x = min(start_cell_x, end_cell_x);
            var max_cell_x = max(start_cell_x, end_cell_x);
            var min_cell_y = min(start_cell_y, end_cell_y);
            var max_cell_y = max(start_cell_y, end_cell_y);
            
            // Expand by 1 cell in each direction to account for entity size
            if (min_cell_x > 0u) { min_cell_x = min_cell_x - 1u; }
            if (min_cell_y > 0u) { min_cell_y = min_cell_y - 1u; }
            if (max_cell_x < grid_width - 1u) { max_cell_x = max_cell_x + 1u; }
            if (max_cell_y < grid_height - 1u) { max_cell_y = max_cell_y + 1u; }
            
            // Check entities in relevant grid cells
            // Note: Entities may be checked multiple times if they span multiple cells, but early bounds check handles this efficiently
            for (var cy = min_cell_y; cy <= max_cell_y && cy < grid_height; cy = cy + 1u) {
                for (var cx = min_cell_x; cx <= max_cell_x && cx < grid_width; cx = cx + 1u) {
                    let cell_index = cy * grid_width + cx;
                    let entity_count = cellEntityCounts[cell_index];
                    
                    // Get starting index in flat entity indices array
                    let entity_index_offset = cellStartIndices[cell_index];
                    
                    // Check entities in this cell
                    for (var i = 0u; i < entity_count; i = i + 1u) {
                        let entity_idx = cellEntityIndices[entity_index_offset + i];
                        if (entity_idx >= num_entities) { continue; }
                        
                        let entity = entities[entity_idx];
                        
                        // Skip self: agents come after food in the entities array
                        let my_entity_index = agent_index + u32(uniforms.numFood);
                        if (entity.entityType == 1.0 && entity_idx == my_entity_index) { continue; }
                        
                        // Early bounds check - skip entities that are too far to intersect
                        let dx = entity.x - ray_origin.x;
                        let dy = entity.y - ray_origin.y;
                        let dist_sq = dx * dx + dy * dy;
                        let max_reach = closest_dist + entity.size;
                        if (dist_sq > max_reach * max_reach) { continue; }
                        
                        let dist = rayCircleIntersection(ray_origin, ray_dir, vec2<f32>(entity.x, entity.y), entity.size);
                        if (dist > 0.0 && dist < closest_dist) {
                            closest_dist = dist;
                            // Map entityType to hitType: food (entityType 2) → hitType 2, agent (entityType 1) → hitType 3
                            if (entity.entityType == 2.0) {
                                hit_type = 2.0; // Food
                            } else if (entity.entityType == 1.0) {
                                hit_type = 3.0; // Agent
                            }
                            entity_id = f32(entity_idx);
                            entity_size = entity.size; // Store the size of hit entity
                        }
                    }
                }
            }
        } else {
            // Fallback: Check all entities (original brute-force method)
            for (var i = 0u; i < num_entities; i = i + 1u) {
                let entity = entities[i];
                
                // Skip self: agents come after food in the entities array
                let my_entity_index = agent_index + u32(uniforms.numFood);
                if (entity.entityType == 1.0 && i == my_entity_index) { continue; }
                
                // Early bounds check - skip entities that are too far to intersect
                let dx = entity.x - ray_origin.x;
                let dy = entity.y - ray_origin.y;
                let dist_sq = dx * dx + dy * dy;
                let max_reach = closest_dist + entity.size;
                if (dist_sq > max_reach * max_reach) { continue; }
                
                let dist = rayCircleIntersection(ray_origin, ray_dir, vec2<f32>(entity.x, entity.y), entity.size);
                if (dist > 0.0 && dist < closest_dist) {
                    closest_dist = dist;
                    // Map entityType to hitType: food (entityType 2) → hitType 2, agent (entityType 1) → hitType 3
                    if (entity.entityType == 2.0) {
                        hit_type = 2.0; // Food
                    } else if (entity.entityType == 1.0) {
                        hit_type = 3.0; // Agent
                    }
                    entity_id = f32(i);
                    entity_size = entity.size; // Store the size of hit entity
                }
            }
        }
    }

    // Obstacle intersection - optimized with distance bounds
    for (var i = 0u; i < u32(uniforms.numObstacles); i = i + 1u) {
        let obs = obstacles[i];

        // Early bounds check - approximate distance to line segment
        let dx1 = obs.x1 - ray_origin.x;
        let dy1 = obs.y1 - ray_origin.y;
        let dx2 = obs.x2 - ray_origin.x;
        let dy2 = obs.y2 - ray_origin.y;

        // Use minimum distance to endpoints as approximation
        let dist1_sq = dx1 * dx1 + dy1 * dy1;
        let dist2_sq = dx2 * dx2 + dy2 * dy2;
        let min_dist_sq = min(dist1_sq, dist2_sq);

        // Skip if both endpoints are farther than current closest distance
        if (min_dist_sq > closest_dist * closest_dist) { continue; }

        let dist = rayLineSegmentIntersection(ray_origin, ray_dir, vec2<f32>(obs.x1, obs.y1), vec2<f32>(obs.x2, obs.y2));
        if (dist > 0.0 && dist < closest_dist) {
            closest_dist = dist;
            hit_type = 4.0; // Obstacle
            entity_id = f32(i);
        }
    }

    results[ray_index].distance = closest_dist;
    results[ray_index].hitType = hit_type;
    results[ray_index].entityId = entity_id;
    results[ray_index].entitySize = entity_size;
}`;

        const module = this.device.createShaderModule({ code: rayTracingShader });

        const compilationInfo = await module.getCompilationInfo();
        if (compilationInfo.messages.length > 0) {
            let hadError = false;
            for (const message of compilationInfo.messages) {
                this.logger.warn(`Shader compilation message: type ${message.type}, message: ${message.message}`);
                if (message.type === 'error') hadError = true;
            }
            if (hadError) {
                throw new Error("Shader compilation failed.");
            }
        }

        // Try different workgroup sizes if the current one fails
        const workgroupSizes = [256, 128, 64]; // Fallback sizes in order of preference
        let pipelineCreated = false;

        for (const size of workgroupSizes) {
            try {
                // Create a new shader module with the specific workgroup size
                const shaderWithSize = rayTracingShader.replace('@compute @workgroup_size(128, 1, 1)', `@compute @workgroup_size(${size}, 1, 1)`);
                const moduleWithSize = this.device.createShaderModule({ code: shaderWithSize });

                // Add error scoping for pipeline creation
                if (!this.device || this.device.destroyed) {
                    throw new Error('WebGPU device is not available or has been destroyed');
                }
                this.device.pushErrorScope('validation');
                this.device.pushErrorScope('internal');

                this.rayTracingPipeline = this.device.createComputePipeline({
                    layout: 'auto',
                    compute: { module: moduleWithSize, entryPoint: 'main' }
                });

                // Check for pipeline creation errors
                const internalError = await this.device.popErrorScope();
                const validationError = await this.device.popErrorScope();

                if (!internalError && !validationError) {
                    this.logger.info(`Ray tracing pipeline created successfully with workgroup size ${size}`);
                    this.workgroupSize = size; // Store the working size
                    pipelineCreated = true;
                    break;
                } else {
                    this.logger.warn(`Workgroup size ${size} failed:`, { internalError, validationError });
                }
            } catch (error) {
                this.logger.warn(`Failed to create pipeline with workgroup size ${size}:`, error);
            }
        }

        if (!pipelineCreated) {
            this.logger.error('Failed to create ray tracing pipeline with any workgroup size');
            return false;
        }
    }

    createRayTracingBuffers(maxAgents, maxRays, maxEntities, maxObstacles) {
        if (this.buffers) {
            Object.values(this.buffers).forEach(buffer => {
                if (buffer instanceof GPUBuffer) buffer.destroy();
            });
        }

        this.buffers = {
            uniforms: this.device.createBuffer({
                size: 11 * Float32Array.BYTES_PER_ELEMENT, // Updated for spatial grid params
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            }),
            agent: this.device.createBuffer({
                size: maxAgents * 12 * Float32Array.BYTES_PER_ELEMENT,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            }),
            entity: this.device.createBuffer({
                size: maxEntities * 4 * Float32Array.BYTES_PER_ELEMENT,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            }),
            obstacle: this.device.createBuffer({
                size: maxObstacles * 4 * Float32Array.BYTES_PER_ELEMENT,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            }),
            result: this.device.createBuffer({
                size: maxRays * 4 * Float32Array.BYTES_PER_ELEMENT,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
            }),
            // PERFORMANCE: Persistent read buffer to avoid creating/destroying every frame
            readBuffer: this.device.createBuffer({
                size: maxRays * 4 * Float32Array.BYTES_PER_ELEMENT,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            }),
            maxAgents, maxRays, maxEntities, maxObstacles
        };

        // Create spatial grid buffers (will be resized dynamically if needed)
        // World is 14400x8100, with 200px cells = 72x41 = 2952 cells max
        const maxGridCells = 4000; // Increased to handle full world size (72x41 = 2952)
        const maxGridEntities = 20000; // Max entities across all cells (400 entities * ~50 cells each)
        
        this.buffers.gridCellCounts = this.device.createBuffer({
            size: maxGridCells * Uint32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        
        this.buffers.gridStartIndices = this.device.createBuffer({
            size: maxGridCells * Uint32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        
        this.buffers.gridEntityIndices = this.device.createBuffer({
            size: maxGridEntities * Uint32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        this.rayTracingBindGroup = this.device.createBindGroup({
            layout: this.rayTracingPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.buffers.uniforms } },
                { binding: 1, resource: { buffer: this.buffers.agent } },
                { binding: 2, resource: { buffer: this.buffers.entity } },
                { binding: 3, resource: { buffer: this.buffers.obstacle } },
                { binding: 4, resource: { buffer: this.buffers.result } },
                { binding: 5, resource: { buffer: this.buffers.gridCellCounts } },
                { binding: 6, resource: { buffer: this.buffers.gridStartIndices } },
                { binding: 7, resource: { buffer: this.buffers.gridEntityIndices } },
            ],
        });
    }

    async batchRayTracing(agents, entities, obstacles, numRaysPerAgent, worldWidth = 10000, worldHeight = 10000, spatialGrid = null) {

        if (!this.device || !this.initialized) {
            this.logger.warn('[GPU] Ray tracing called before device ready');
            return null;
        }

        this.isRayTracingBusy = true;
        const numAgents = agents.length;
        if (numAgents === 0) {
            this.isRayTracingBusy = false;
            return null;
        }

        const totalRays = numAgents * numRaysPerAgent;
        const numEntities = entities.length;
        // Each circular obstacle becomes 8 line segments
        const segmentsPerObstacle = OBSTACLE_SEGMENTS;
        const numObstacleSegments = obstacles.length * segmentsPerObstacle;

        if (!this.buffers || !this.buffers.agent || numAgents > this.buffers.maxAgents || totalRays > this.buffers.maxRays ||
            numEntities > this.buffers.maxEntities || numObstacleSegments > this.buffers.maxObstacles) {

            // Try to create buffers dynamically if they don't exist or are too small
            if (!this.buffers || !this.buffers.agent) {
                this.logger.warn('GPU buffers disposed or not initialized, creating dynamically...', {
                    numAgents, totalRays, numEntities, numObstacleSegments
                });

                try {
                    const dynamicMaxAgents = Math.max(numAgents * 3, 200); // More generous allocation
                    const dynamicMaxRays = Math.max(totalRays * 3, 10000); // More generous allocation
                    const dynamicMaxEntities = Math.max(numEntities * 3, 2000); // More generous allocation
                    const dynamicMaxObstacles = Math.max(numObstacleSegments * 3, 400); // More generous allocation

                    this.createRayTracingBuffers(
                        dynamicMaxAgents,
                        dynamicMaxRays,
                        dynamicMaxEntities,
                        dynamicMaxObstacles
                    );

                    this.logger.log('GPU buffers created dynamically', {
                        maxAgents: dynamicMaxAgents,
                        maxRays: dynamicMaxRays,
                        maxEntities: dynamicMaxEntities,
                        maxObstacles: dynamicMaxObstacles
                    });
                } catch (error) {
                    this.logger.error('Failed to create GPU buffers dynamically:', error);
                    this.isRayTracingBusy = false;
                    return null;
                }
            } else {
                this.logger.error('GPU data exceeds pre-allocated buffer size! Aborting ray trace.', {
                    numAgents, maxAgents: this.buffers?.maxAgents,
                    totalRays, maxRays: this.buffers?.maxRays,
                    numEntities, maxEntities: this.buffers?.maxEntities,
                    numObstacleSegments, maxObstacles: this.buffers?.maxObstacles
                });
                this.isRayTracingBusy = false;
                return null;
            }
        }

        try {
            const agentData = new Float32Array(numAgents * 12); // Stride is 12 floats (48 bytes) to match WGSL struct
            for (let i = 0; i < numAgents; i++) {
                const agent = agents[i];
                const offset = i * 12; // Stride is 12 floats (48 bytes) to match WGSL struct
                agentData[offset] = agent.x;
                agentData[offset + 1] = agent.y;
                agentData[offset + 2] = agent.vx;
                agentData[offset + 3] = agent.vy;
                agentData[offset + 4] = agent.angle;
                agentData[offset + 5] = agent.energy;
                agentData[offset + 6] = agent.size;
                agentData[offset + 7] = agent.numSensorRays;
                agentData[offset + 8] = agent.specializationTypeId;
                agentData[offset + 9] = agent.maxRayDist;
                agentData[offset + 10] = agent.numAlignmentRays;
                // agentData[offset + 11] is padding
            }

            // Data packing for entities (other agents and food)
            const numEntities = Math.min(this.buffers.maxEntities, entities.length);
            const entityData = new Float32Array(numEntities * 4);
            let foodCount = 0, agentCount = 0, unknownCount = 0;

            // Pre-declare obstacle counts for debug logging (already declared at line 309)
            const numObstacles = obstacles.length;
            for (let i = 0; i < numEntities; i++) {
                const entity = entities[i];
                const offset = i * 4;
                entityData[offset] = entity.x;
                entityData[offset + 1] = entity.y;
                entityData[offset + 2] = entity.size;
                // Determine entity type: agent = 1, food = 2
                // Food objects have isFood property, agents have entityType property
                if (entity.entityType !== undefined) {
                    entityData[offset + 3] = entity.entityType; // Agent (1)
                    agentCount++;
                } else if (entity.isFood) {
                    entityData[offset + 3] = 2.0; // Food
                    foodCount++;
                } else {
                    entityData[offset + 3] = 0.0; // Unknown
                    unknownCount++;
                }
            }


            // Convert circle obstacles to line segments for GPU
            // Each circle becomes an octagon (8 line segments)
            const obstacleData = new Float32Array(numObstacleSegments * 4);

            for (let i = 0; i < numObstacles; i++) {
                const obs = obstacles[i];
                const angleStep = TWO_PI / segmentsPerObstacle;

                for (let seg = 0; seg < segmentsPerObstacle; seg++) {
                    const angle1 = seg * angleStep;
                    const angle2 = ((seg + 1) % segmentsPerObstacle) * angleStep;

                    const x1 = obs.x + Math.cos(angle1) * obs.radius;
                    const y1 = obs.y + Math.sin(angle1) * obs.radius;
                    const x2 = obs.x + Math.cos(angle2) * obs.radius;
                    const y2 = obs.y + Math.sin(angle2) * obs.radius;

                    const segmentIndex = i * segmentsPerObstacle + seg;
                    const offset = segmentIndex * 4;
                    obstacleData[offset] = x1;
                    obstacleData[offset + 1] = y1;
                    obstacleData[offset + 2] = x2;
                    obstacleData[offset + 3] = y2;
                }
            }

            // Process spatial grid data if provided
            let useSpatialGrid = 0.0;
            let gridCellSize = 0.0;
            let gridWidth = 0.0;
            let gridHeight = 0.0;
            
            if (spatialGrid && spatialGrid.cellEntityCounts && spatialGrid.cellEntityCounts.length > 0) {
                useSpatialGrid = 1.0;
                gridCellSize = spatialGrid.cellSize;
                gridWidth = spatialGrid.gridWidth;
                gridHeight = spatialGrid.gridHeight;
                
                // Upload spatial grid data to GPU
                const totalCells = gridWidth * gridHeight;
                if (totalCells <= 4000 && spatialGrid.cellEntityIndices.length <= 20000) {
                    this.queue.writeBuffer(this.buffers.gridCellCounts, 0, spatialGrid.cellEntityCounts);
                    this.queue.writeBuffer(this.buffers.gridStartIndices, 0, spatialGrid.cellStartIndices);
                    this.queue.writeBuffer(this.buffers.gridEntityIndices, 0, spatialGrid.cellEntityIndices);
                } else {
                    // Grid too large, fall back to brute force
                    this.logger.warn('[GPU] Spatial grid too large, falling back to brute force', {
                        totalCells, entityIndices: spatialGrid.cellEntityIndices.length,
                        maxCells: 4000, maxEntities: 20000
                    });
                    useSpatialGrid = 0.0;
                }
            }

            this.queue.writeBuffer(this.buffers.agent, 0, agentData);
            this.queue.writeBuffer(this.buffers.entity, 0, entityData);
            this.queue.writeBuffer(this.buffers.obstacle, 0, obstacleData);
            this.queue.writeBuffer(this.buffers.uniforms, 0, new Float32Array([
                numAgents, numRaysPerAgent, numEntities, numObstacleSegments, foodCount, worldWidth, worldHeight,
                gridCellSize, gridWidth, gridHeight, useSpatialGrid
            ]));

            // PERFORMANCE LOGGING: Track ray tracing workload
            const totalRaysToTrace = numAgents * numRaysPerAgent;
            const totalIntersectionTests = totalRaysToTrace * numEntities;
            const rayTracingStartTime = performance.now();

            const commandEncoder = this.device.createCommandEncoder();
            const pass = commandEncoder.beginComputePass();
            pass.setPipeline(this.rayTracingPipeline);
            pass.setBindGroup(0, this.rayTracingBindGroup);

            // Use the workgroup size that was successfully used for pipeline creation
            const workgroupSize = this.workgroupSize || 64; // Fallback to 64 if not set
            pass.dispatchWorkgroups(Math.ceil(totalRays / workgroupSize));
            pass.end();

            // PERFORMANCE: Reuse persistent read buffer instead of creating new one
            const gpuReadBuffer = this.buffers.readBuffer;

            commandEncoder.copyBufferToBuffer(this.buffers.result, 0, gpuReadBuffer, 0, this.buffers.result.size);

            // Add error scoping to catch more specific WebGPU errors
            if (!this.device || this.device.destroyed) {
                throw new Error('WebGPU device is not available or has been destroyed');
            }
            this.device.pushErrorScope('validation');
            this.device.pushErrorScope('out-of-memory');
            this.device.pushErrorScope('internal');

            this.queue.submit([commandEncoder.finish()]);

            // Check for submission errors
            let internalError, oomError, validationError;
            try {
                internalError = await this.device.popErrorScope();
            } catch (e) {
                this.logger.error('Failed to pop internal error scope:', e);
            }
            try {
                oomError = await this.device.popErrorScope();
            } catch (e) {
                this.logger.error('Failed to pop out-of-memory error scope:', e);
            }
            try {
                validationError = await this.device.popErrorScope();
            } catch (e) {
                this.logger.error('Failed to pop validation error scope:', e);
            }

            if (internalError) {
                this.logger.error('GPU ray tracing internal error:', internalError);
                return null;
            }
            if (oomError) {
                this.logger.error('GPU ray tracing out of memory:', oomError);
                return null;
            }
            if (validationError) {
                this.logger.error('GPU ray tracing validation error:', validationError);
                return null;
            }

            await gpuReadBuffer.mapAsync(GPUMapMode.READ);
            const mappedRange = gpuReadBuffer.getMappedRange();
            const resultData = new Float32Array(mappedRange.slice(0)); // Create a copy
            gpuReadBuffer.unmap();

            // PERFORMANCE LOGGING: Calculate and log ray tracing metrics
            const rayTracingEndTime = performance.now();
            const rayTracingDuration = rayTracingEndTime - rayTracingStartTime;
            const avgTestsPerRay = numEntities;
            const testsPerMs = totalIntersectionTests / rayTracingDuration;

            // Log every 1000 frames to avoid spam
            if (Math.random() < 0.001) { // ~0.1% of frames
                this.logger.debug(`[RAY-TRACE-PERF] ${numAgents} agents × ${numRaysPerAgent} rays × ${numEntities} entities = ${totalIntersectionTests.toLocaleString()} tests in ${rayTracingDuration.toFixed(2)}ms (${testsPerMs.toLocaleString()} tests/ms, ${avgTestsPerRay} entities/ray)`);
            }

            return resultData;
        } catch (e) {
            this.logger.error('[GPU] Ray tracing error:', e);
            return null;
        } finally {
            this.isRayTracingBusy = false;
        }
    }

    isAvailable() {
        return !!this.device;
    }

    async createPhysicsPipeline() {
        const physicsShader = `
            struct Agent {
                position: vec2<f32>,
                velocity: vec2<f32>,
                size: f32,
                energy: f32,
                thrust: f32,
                rotation: f32,
                output0: f32, // Forward thrust
                output1: f32, // Rotation
                output2: f32, // Sprint
                output3: f32, // Reproduction
                output4: f32, // Attack
            };

            @group(0) @binding(0) var<storage, read> agentsIn: array<Agent>;
            @group(0) @binding(1) var<storage, read_write> agentsOut: array<Agent>;

            @compute @workgroup_size(64)
            fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
                let index = global_id.x;
                if (index >= arrayLength(&agentsIn)) {
                    return;
                }

                var agent = agentsIn[index];

                // Apply neural network outputs to physics
                let forward_thrust = agent.output0 * ${MAX_THRUST};
                let rotation_delta = (agent.output1 - 0.5) * 2.0 * ${MAX_ROTATION};

                // Update rotation
                agent.rotation += rotation_delta;

                // Calculate thrust vector
                let thrust_x = cos(agent.rotation) * forward_thrust;
                let thrust_y = sin(agent.rotation) * forward_thrust;

                // Apply thrust to velocity
                agent.velocity.x += thrust_x;
                agent.velocity.y += thrust_y;

                // Apply dampening
                agent.velocity.x *= ${DAMPENING_FACTOR};
                agent.velocity.y *= ${DAMPENING_FACTOR};

                // Cap velocity
                let speed_sq = agent.velocity.x * agent.velocity.x + agent.velocity.y * agent.velocity.y;
                let max_speed_sq = f32(${MAX_VELOCITY}) * f32(${MAX_VELOCITY});
                if (speed_sq > max_speed_sq) {
                    let ratio = f32(${MAX_VELOCITY}) / sqrt(speed_sq);
                    agent.velocity.x *= ratio;
                    agent.velocity.y *= ratio;
                }

                // Update position
                agent.position.x += agent.velocity.x;
                agent.position.y += agent.velocity.y;

                // Boundary collision (bounce off edges)
                if (agent.position.x - agent.size <= 0.0) {
                    agent.position.x = agent.size;
                    agent.velocity.x = abs(agent.velocity.x);
                } else if (agent.position.x + agent.size >= f32(${WORLD_WIDTH})) {
                    agent.position.x = f32(${WORLD_WIDTH}) - agent.size;
                    agent.velocity.x = -abs(agent.velocity.x);
                }

                if (agent.position.y - agent.size <= 0.0) {
                    agent.position.y = agent.size;
                    agent.velocity.y = abs(agent.velocity.y);
                } else if (agent.position.y + agent.size >= f32(${WORLD_HEIGHT})) {
                    agent.position.y = f32(${WORLD_HEIGHT}) - agent.size;
                    agent.velocity.y = -abs(agent.velocity.y);
                }

                // Apply energy cost for movement
                let movement_cost = (abs(thrust_x) + abs(thrust_y)) * 0.001;
                agent.energy = max(0.0, agent.energy - f32(movement_cost));

                agentsOut[index] = agent;
            }
        `;

        this.physicsPipeline = await this.device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: this.device.createShaderModule({ code: physicsShader }),
                entryPoint: 'main'
            }
        });

        this.logger.log('GPU Physics pipeline created successfully');
    }

    createPhysicsBuffers(maxAgents) {
        const agentBufferSize = maxAgents * (2 + 2 + 1 + 1 + 1 + 1 + 5) * 4; // vec2 pos, vec2 vel, 6 floats = 11 floats * 4 bytes

        this.physicsBuffers = {
            agentsIn: this.device.createBuffer({
                size: agentBufferSize,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
            }),
            agentsOut: this.device.createBuffer({
                size: agentBufferSize,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
            }),
            maxAgents: maxAgents
        };

        this.physicsBindGroup = this.device.createBindGroup({
            layout: this.physicsPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.physicsBuffers.agentsIn } },
                { binding: 1, resource: { buffer: this.physicsBuffers.agentsOut } }
            ]
        });
    }

    async batchPhysicsUpdate(agents) {
        if (!this.useGPU || !this.initialized || !this.physicsPipeline) {
            return null;
        }

        // Prepare agent data for GPU
        const agentData = new Float32Array(agents.length * 11); // 11 floats per agent
        for (let i = 0; i < agents.length; i++) {
            const agent = agents[i];
            const offset = i * 11;
            agentData[offset] = agent.x;         // position.x
            agentData[offset + 1] = agent.y;     // position.y
            agentData[offset + 2] = agent.vx;    // velocity.x
            agentData[offset + 3] = agent.vy;    // velocity.y
            agentData[offset + 4] = agent.size;  // size
            agentData[offset + 5] = agent.energy;// energy
            agentData[offset + 6] = agent.thrust || 0;  // thrust
            agentData[offset + 7] = agent.angle; // rotation
            // Neural network outputs (lastOutput should be set from GPU NN)
            agentData[offset + 8] = agent.lastOutput ? agent.lastOutput[0] : 0; // forward
            agentData[offset + 9] = agent.lastOutput ? agent.lastOutput[1] : 0; // rotation
            agentData[offset + 10] = agent.lastOutput ? agent.lastOutput[2] : 0; // sprint
            // Note: Only using first 3 outputs for physics, reproduction/attack handled separately
        }

        // Upload data to GPU
        this.device.queue.writeBuffer(this.physicsBuffers.agentsIn, 0, agentData);

        // Execute physics simulation
        const commandEncoder = this.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginComputePass();

        passEncoder.setPipeline(this.physicsPipeline);
        passEncoder.setBindGroup(0, this.physicsBindGroup);
        passEncoder.dispatchWorkgroups(Math.ceil(agents.length / 64), 1, 1);

        passEncoder.end();
        this.device.queue.submit([commandEncoder.finish()]);

        // Read back results
        const resultBuffer = this.device.createBuffer({
            size: agentData.byteLength,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });

        const copyEncoder = this.device.createCommandEncoder();
        copyEncoder.copyBufferToBuffer(
            this.physicsBuffers.agentsOut, 0,
            resultBuffer, 0,
            agentData.byteLength
        );
        this.device.queue.submit([copyEncoder.finish()]);

        // Map and read results
        await resultBuffer.mapAsync(GPUMapMode.READ);
        const resultData = new Float32Array(resultBuffer.getMappedRange());

        // Update agents with GPU results
        for (let i = 0; i < agents.length; i++) {
            const agent = agents[i];
            const offset = i * 11;
            agent.x = resultData[offset];       // position.x
            agent.y = resultData[offset + 1];   // position.y
            agent.vx = resultData[offset + 2];  // velocity.x
            agent.vy = resultData[offset + 3];  // velocity.y
            agent.energy = resultData[offset + 5]; // energy
        }

        resultBuffer.unmap();
        resultBuffer.destroy();

        return true;
    }

    // GPU food updates removed - using CPU path due to GPU initialization failures

    // GPU pheromone updates removed - using CPU path due to GPU initialization failures





    clearCache() {
        // Clear GPU buffers to free memory
        if (this.buffers) {
            // Properly dispose of WebGPU buffers
            if (this.buffers.uniforms) this.buffers.uniforms.destroy();
            if (this.buffers.agent) this.buffers.agent.destroy();
            if (this.buffers.entity) this.buffers.entity.destroy();
            if (this.buffers.obstacle) this.buffers.obstacle.destroy();
            if (this.buffers.result) this.buffers.result.destroy();

            this.buffers = null;
            this.logger.log('GPUPhysics buffers disposed and cleared');
        }
    }

    /**
     * Comprehensive cleanup for long-term stability
     * @param {number} sessionHours - Hours since simulation started
     */
    deepCleanup(sessionHours = 0) {
        // Force buffer recreation for memory defragmentation in long sessions
        if (sessionHours > 4) {
            this.logger.debug(`GPUPhysics: Defragmenting memory (${sessionHours.toFixed(1)}h session)`);
            this.clearCache();
        }
    }

    /**
     * Check if buffers need to be recreated due to size changes
     * @param {Object} config - Configuration for buffer sizes
     * @returns {boolean} - True if buffers need recreation
     */
    buffersNeedRecreation(config) {
        // GPU Physics uses fixed-size buffers based on max agents/entities
        // We don't need complex cache management like GPU Compute
        // Buffers are recreated only when simulation parameters change significantly
        return false; // For now, keep it simple
    }
}

