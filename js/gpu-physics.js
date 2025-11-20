// --- GPU PHYSICS MODULE (WebGPU) ---
// GPU-accelerated ray tracing
// Massive performance boost for large agent counts

import { TWO_PI } from './constants.js';

export class GPUPhysics {
    constructor(logger) {
        this.logger = logger;
        this.logger.log('GPUPhysics constructor started.');

        this.device = null;
        this.queue = null;
        this.initialized = false;
        this.rayTracingPipeline = null;
        this.rayTracingBindGroup = null;
        this.buffers = null;
    }

    async init(config = {}) {
        if (this.device) return true;

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

            if (config.maxAgents && config.maxRaysPerAgent && config.maxEntities && config.maxObstacles) {
                this.logger.log('[GPU-BUFFER] Pre-allocating buffers on initialization.', config);
                this.createRayTracingBuffers(
                    config.maxAgents,
                    config.maxAgents * config.maxRaysPerAgent,
                    config.maxEntities,
                    config.maxObstacles
                );
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
            this.logger.error('GPU data exceeds pre-allocated buffer size! Aborting ray trace.', {
                numAgents, maxAgents: this.buffers?.maxAgents,
                totalRays, maxRays: this.buffers?.maxRays,
                numEntities, maxEntities: this.buffers?.maxEntities,
                numObstacleSegments, maxObstacles: this.buffers?.maxObstacles
            });
            return null;
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
}

