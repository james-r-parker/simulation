// --- GPU PHYSICS MODULE (WebGPU) ---
// GPU-accelerated ray tracing + physics simulation
// Massive performance boost for large agent counts

import { TWO_PI, DAMPENING_FACTOR, MAX_VELOCITY, WORLD_WIDTH, WORLD_HEIGHT, MAX_THRUST, MAX_ROTATION } from './constants.js';

export class GPUPhysics {
    constructor(logger) {
        this.logger = logger;
        this.logger.log('GPUPhysics constructor started.');

        this.device = null;
        this.queue = null;
        this.initialized = false;
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
            await this.createFoodPipeline();
            await this.createPheromonePipeline();

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
};

@group(0) @binding(0) var<uniform> uniforms: RayUniforms;
@group(0) @binding(1) var<storage, read> agents: array<Agent>;
@group(0) @binding(2) var<storage, read> entities: array<Entity>;
@group(0) @binding(3) var<storage, read> obstacles: array<Obstacle>;
@group(0) @binding(4) var<storage, read_write> results: array<RayResult>;

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


@compute @workgroup_size(64, 1, 1)
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
    
    // Entity intersection
    for (var i = 0u; i < u32(uniforms.numEntities); i = i + 1u) {
        let entity = entities[i];
        // Skip self: agents come after food in the entities array
        let my_entity_index = agent_index + u32(uniforms.numFood);
        if (entity.entityType == 1.0 && i == my_entity_index) { continue; }
        
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

    // Obstacle intersection
    for (var i = 0u; i < u32(uniforms.numObstacles); i = i + 1u) {
        let obs = obstacles[i];
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

        this.rayTracingPipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: { module, entryPoint: 'main' }
        });
    }

    createRayTracingBuffers(maxAgents, maxRays, maxEntities, maxObstacles) {
        if (this.buffers) {
            Object.values(this.buffers).forEach(buffer => {
                if (buffer instanceof GPUBuffer) buffer.destroy();
            });
        }

        this.buffers = {
            uniforms: this.device.createBuffer({
                size: 7 * Float32Array.BYTES_PER_ELEMENT,
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
            maxAgents, maxRays, maxEntities, maxObstacles
        };

        this.rayTracingBindGroup = this.device.createBindGroup({
            layout: this.rayTracingPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.buffers.uniforms } },
                { binding: 1, resource: { buffer: this.buffers.agent } },
                { binding: 2, resource: { buffer: this.buffers.entity } },
                { binding: 3, resource: { buffer: this.buffers.obstacle } },
                { binding: 4, resource: { buffer: this.buffers.result } },
            ],
        });
    }

    async batchRayTracing(agents, entities, obstacles, numRaysPerAgent, worldWidth = 10000, worldHeight = 10000) {
        if (!this.device || !this.initialized) {
            this.logger.warn('[GPU] Ray tracing called before device ready');
            return null;
        }

        const numAgents = agents.length;
        if (numAgents === 0) return null;

        const totalRays = numAgents * numRaysPerAgent;
        const numEntities = entities.length;
        // Each circular obstacle becomes 8 line segments
        const segmentsPerObstacle = 8;
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
                    return null;
                }
            } else {
                this.logger.error('GPU data exceeds pre-allocated buffer size! Aborting ray trace.', {
                    numAgents, maxAgents: this.buffers?.maxAgents,
                    totalRays, maxRays: this.buffers?.maxRays,
                    numEntities, maxEntities: this.buffers?.maxEntities,
                    numObstacleSegments, maxObstacles: this.buffers?.maxObstacles
                });
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

            this.queue.writeBuffer(this.buffers.agent, 0, agentData);
            this.queue.writeBuffer(this.buffers.entity, 0, entityData);
            this.queue.writeBuffer(this.buffers.obstacle, 0, obstacleData);
            this.queue.writeBuffer(this.buffers.uniforms, 0, new Float32Array([
                numAgents, numRaysPerAgent, numEntities, numObstacleSegments, foodCount, worldWidth, worldHeight
            ]));

            const commandEncoder = this.device.createCommandEncoder();
            const pass = commandEncoder.beginComputePass();
            pass.setPipeline(this.rayTracingPipeline);
            pass.setBindGroup(0, this.rayTracingBindGroup);

            pass.dispatchWorkgroups(Math.ceil(totalRays / 64));
            pass.end();

            const gpuReadBuffer = this.device.createBuffer({
                size: this.buffers.result.size,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });

            commandEncoder.copyBufferToBuffer(this.buffers.result, 0, gpuReadBuffer, 0, this.buffers.result.size);

            // Add error scoping to catch more specific WebGPU errors
            this.device.pushErrorScope('validation');

            this.queue.submit([commandEncoder.finish()]);

            const gpuError = await this.device.popErrorScope();
            if (gpuError) {
                this.logger.error(`[WebGPU] Error during command submission:`, gpuError);
                return null;
            }

            await gpuReadBuffer.mapAsync(GPUMapMode.READ);
            const mappedRange = gpuReadBuffer.getMappedRange();
            const resultData = new Float32Array(mappedRange.slice(0)); // Create a copy
            gpuReadBuffer.unmap(); // Now we can unmap immediately
            gpuReadBuffer.destroy(); // CRITICAL FIX: Destroy buffer to prevent memory leak

            // More robust NaN check on the copied data
            for (let i = 0; i < resultData.length; i++) {
                if (isNaN(resultData[i])) {
                    const rayIndex = Math.floor(i / 4);
                    const propertyIndex = i % 4;
                    const propertyName = ['distance', 'hitType', 'entityId', 'padding'][propertyIndex];

                    this.logger.warn(`[GPU] Result contains NaN at ray ${rayIndex}, property: ${propertyName}`);
                    return null; // Abort if any NaN is found
                }
            }

            return resultData;
        } catch (e) {
            this.logger.error('[GPU] Ray tracing error:', e);
            return null;
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

    async createFoodPipeline() {
        const foodShader = `
            struct Food {
                position: vec2<f32>,
                energy: f32,
                initial_energy: f32,
                age: f32,
                max_age: f32,
                rot_rate: f32,
                size: f32,
                is_high_value: f32,
            };

            @group(0) @binding(0) var<storage, read_write> food: array<Food>;

            @compute @workgroup_size(64)
            fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
                let index = global_id.x;
                if (index >= arrayLength(&food)) {
                    return;
                }

                var f = food[index];

                // Age food
                f.age += 1.0;

                // Energy decay (rotting)
                f.energy = max(0.0, f.energy - f.rot_rate);

                // Update visual size based on remaining energy
                let energy_ratio = f.energy / f.initial_energy;
                if (f.is_high_value > 0.5) {
                    f.size = max(4.0, 12.0 * energy_ratio); // High-value: 12→4
                } else {
                    f.size = max(3.0, 8.0 * energy_ratio);  // Normal: 8→3
                }

                food[index] = f;
            }
        `;

        this.foodPipeline = await this.device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: this.device.createShaderModule({ code: foodShader }),
                entryPoint: 'main'
            }
        });
    }

    async createPheromonePipeline() {
        const pheromoneShader = `
            struct Pheromone {
                position: vec2<f32>,
                life: f32,
                size: f32,
                fade_rate: f32,
            };

            @group(0) @binding(0) var<storage, read_write> pheromones: array<Pheromone>;

            @compute @workgroup_size(64)
            fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
                let index = global_id.x;
                if (index >= arrayLength(&pheromones)) {
                    return;
                }

                var p = pheromones[index];

                // Fade pheromone
                p.life -= p.fade_rate;

                // Grow size
                p.size += 0.2;

                pheromones[index] = p;
            }
        `;

        this.pheromonePipeline = await this.device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: this.device.createShaderModule({ code: pheromoneShader }),
                entryPoint: 'main'
            }
        });
    }

    async batchFoodUpdate(foodArray) {
        if (!this.useGPU || !this.initialized || !this.foodPipeline || foodArray.length === 0) {
            return null;
        }

        // Create buffer for food data
        const foodData = new Float32Array(foodArray.length * 8); // 8 floats per food
        for (let i = 0; i < foodArray.length; i++) {
            const food = foodArray[i];
            const offset = i * 8;
            foodData[offset] = food.x;
            foodData[offset + 1] = food.y;
            foodData[offset + 2] = food.energyValue;
            foodData[offset + 3] = food.initialEnergy;
            foodData[offset + 4] = food.age;
            foodData[offset + 5] = food.maxAge;
            foodData[offset + 6] = food.rotRate;
            foodData[offset + 7] = food.isHighValue ? 1.0 : 0.0;
        }

        const foodBuffer = this.device.createBuffer({
            size: foodData.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
        });

        this.device.queue.writeBuffer(foodBuffer, 0, foodData);

        const bindGroup = this.device.createBindGroup({
            layout: this.foodPipeline.getBindGroupLayout(0),
            entries: [{ binding: 0, resource: { buffer: foodBuffer } }]
        });

        // Execute food updates
        const commandEncoder = this.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginComputePass();

        passEncoder.setPipeline(this.foodPipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.dispatchWorkgroups(Math.ceil(foodArray.length / 64), 1, 1);

        passEncoder.end();
        this.device.queue.submit([commandEncoder.finish()]);

        // Read back results
        const resultBuffer = this.device.createBuffer({
            size: foodData.byteLength,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });

        const copyEncoder = this.device.createCommandEncoder();
        copyEncoder.copyBufferToBuffer(foodBuffer, 0, resultBuffer, 0, foodData.byteLength);
        this.device.queue.submit([copyEncoder.finish()]);

        await resultBuffer.mapAsync(GPUMapMode.READ);
        const resultData = new Float32Array(resultBuffer.getMappedRange());

        // Update food objects with GPU results
        for (let i = 0; i < foodArray.length; i++) {
            const food = foodArray[i];
            const offset = i * 8;
            food.energyValue = resultData[offset + 2];
            food.age = resultData[offset + 4];
            food.size = resultData[offset + 7]; // Updated size

            // Mark as dead if energy <= 0 or age exceeded
            if (food.energyValue <= 0 || food.age > food.maxAge) {
                food.isDead = true;
            }
        }

        resultBuffer.unmap();
        resultBuffer.destroy();
        foodBuffer.destroy();

        return true;
    }

    async batchPheromoneUpdate(pheromoneArray) {
        if (!this.useGPU || !this.initialized || !this.pheromonePipeline || pheromoneArray.length === 0) {
            return null;
        }

        // Create buffer for pheromone data
        const pheromoneData = new Float32Array(pheromoneArray.length * 4); // 4 floats per pheromone
        for (let i = 0; i < pheromoneArray.length; i++) {
            const p = pheromoneArray[i];
            const offset = i * 4;
            pheromoneData[offset] = p.x;
            pheromoneData[offset + 1] = p.y;
            pheromoneData[offset + 2] = p.life;
            pheromoneData[offset + 3] = p.size;
        }

        const pheromoneBuffer = this.device.createBuffer({
            size: pheromoneData.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
        });

        this.device.queue.writeBuffer(pheromoneBuffer, 0, pheromoneData);

        const bindGroup = this.device.createBindGroup({
            layout: this.pheromonePipeline.getBindGroupLayout(0),
            entries: [{ binding: 0, resource: { buffer: pheromoneBuffer } }]
        });

        // Execute pheromone updates
        const commandEncoder = this.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginComputePass();

        passEncoder.setPipeline(this.pheromonePipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.dispatchWorkgroups(Math.ceil(pheromoneArray.length / 64), 1, 1);

        passEncoder.end();
        this.device.queue.submit([commandEncoder.finish()]);

        // Read back results
        const resultBuffer = this.device.createBuffer({
            size: pheromoneData.byteLength,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });

        const copyEncoder = this.device.createCommandEncoder();
        copyEncoder.copyBufferToBuffer(pheromoneBuffer, 0, resultBuffer, 0, pheromoneData.byteLength);
        this.device.queue.submit([copyEncoder.finish()]);

        await resultBuffer.mapAsync(GPUMapMode.READ);
        const resultData = new Float32Array(resultBuffer.getMappedRange());

        // Update pheromone objects with GPU results
        for (let i = 0; i < pheromoneArray.length; i++) {
            const p = pheromoneArray[i];
            const offset = i * 4;
            p.life = resultData[offset + 2];
            p.size = resultData[offset + 3];

            // Mark as dead if life <= 0
            if (p.life <= 0) {
                p.isDead = true;
            }
        }

        resultBuffer.unmap();
        resultBuffer.destroy();
        pheromoneBuffer.destroy();

        return true;
    }

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
}

