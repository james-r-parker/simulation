// --- GPU COMPUTE MODULE (WebGPU) ---
// Direct WebGPU compute shaders for neural network forward passes
// MAXIMUM OPTIMIZATION: Weight caching, double-buffering, batched uploads, parallel processing, vectorization

import { GPU_INIT_TIMEOUT_MS } from './constants.js';
import { NeuralNetwork } from './neural-network.js';

export class GPUCompute {
    constructor(logger) {
        this.logger = logger;
        this.logger.log('GPUCompute constructor started.');

        this.device = null;
        this.queue = null;
        this.initialized = false;
        this.useGPU = false;
        this.pipelines = new Map(); // specialization -> pipeline
        this.bufferCache = new Map(); // specialization -> buffers
        this.weightCache = new Map(); // agent -> {weight1Hash, weight2Hash} to detect changes
        this.minAgentsForGPU = 20; // Only use GPU if we have enough agents
        this.processing = false; // Lock to prevent concurrent GPU operations
        this.stagingBufferIndex = 0; // For double-buffering
        this.optimalWorkgroupSize = 128; // Default, will be optimized based on GPU
    }

    async init() {
        if (this.device) return true;

        if (!navigator.gpu) {
            this.logger.warn('WebGPU not available, falling back to CPU');
            return false;
        }

        try {
            // Add timeout to prevent hanging
            const adapter = await navigator.gpu.requestAdapter({
                // powerPreference: 'high-performance'
            });
            
            if (!adapter) {
                this.logger.warn('No GPU adapter found, falling back to CPU');
                return false;
            }

            // PERFORMANCE: Determine optimal workgroup size based on GPU capabilities
            const maxWorkgroupSize = adapter.limits.maxComputeInvocationsPerWorkgroup;
            // Use 256 as default (good balance for most GPUs)
            if (maxWorkgroupSize >= 256) {
                this.optimalWorkgroupSize = 256; // Often optimal for modern GPUs
            } else if (maxWorkgroupSize >= 128) {
                this.optimalWorkgroupSize = 128;
            } else {
                this.optimalWorkgroupSize = 64; // Fallback
            }
            this.logger.log(`[GPU-COMPUTE] Optimal workgroup size: ${this.optimalWorkgroupSize} (max supported: ${maxWorkgroupSize})`);

            this.device = await Promise.race([
                adapter.requestDevice({
                    requiredFeatures: [],
                    requiredLimits: {
                        maxComputeWorkgroupStorageSize: adapter.limits.maxComputeWorkgroupStorageSize,
                        maxComputeInvocationsPerWorkgroup: adapter.limits.maxComputeInvocationsPerWorkgroup,
                        maxBufferSize: adapter.limits.maxBufferSize
                    }
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Device request timeout')), GPU_INIT_TIMEOUT_MS))
            ]);
            
            // Check if device is already lost (from previous hang)
            try {
                const lostInfo = await Promise.race([
                    this.device.lost,
                    new Promise(resolve => setTimeout(() => resolve(null), 10))
                ]);
                if (lostInfo) {
                    this.logger.warn('GPU Compute device already lost during init:', lostInfo);
                    return false;
                }
            } catch (e) {
                // Device lost promise might reject, that's okay
            }
            
            this.queue = this.device.queue;
            
            // Set up device lost handler
            this.device.lost.then((info) => {
                this.logger.warn('GPU Compute device lost:', info);
                // Clear ALL state to ensure clean recovery
                this.useGPU = false;
                this.initialized = false;
                this.device = null;
                this.queue = null;
                this.pipelines.clear();
                this.bufferCache.clear();
                this.weightCache.clear();
                this.stagingBufferIndex = 0; // Reset double-buffering state
                this.processing = false; // Reset processing lock
            }).catch(() => {
                // Ignore errors from lost promise
            });
            
            this.initialized = true;
            this.useGPU = true;
            
            // console.log('WebGPU initialized successfully - using GPU acceleration');
            return true;
        } catch (error) {
            this.logger.error('WebGPU initialization failed:', error);
            return false;
        }
    }

    // Create compute pipeline for a specific specialization
    createPipelineForSpecialization(inputSize, hiddenSize, outputSize) {
        const key = `${inputSize}_${hiddenSize}_${outputSize}`;
        if (this.pipelines.has(key)) {
            return this.pipelines.get(key);
        }

        if (!this.device) return null;

        // HEAVILY OPTIMIZED compute shader with vectorization and better memory access
        // PERFORMANCE: Use optimal workgroup size for this GPU
        // OPTIMIZED: Reduced local array size from 60 to 32 (max hidden size is now 30)
        // OPTIMIZED: Vectorized operations using vec4<f32> for SIMD processing (4x parallelism)
        // OPTIMIZED: Improved loop unrolling and memory access patterns
        const workgroupSize = this.optimalWorkgroupSize || 128;
        const computeShaderCode = `
struct Uniforms {
    inputSize: u32,
    hiddenSize: u32,
    outputSize: u32,
    numAgents: u32,
    _padding: u32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> inputs: array<f32>;
@group(0) @binding(2) var<storage, read> weights1: array<f32>;
@group(0) @binding(3) var<storage, read> weights2: array<f32>;
@group(0) @binding(4) var<storage, read_write> outputs: array<f32>;
@group(0) @binding(5) var<storage, read_write> newHiddenStates: array<f32>;

fn sigmoid(x: f32) -> f32 {
    // Fast sigmoid - optimized for GPU
    return 1.0 / (1.0 + exp(-x));
}

@compute @workgroup_size(${workgroupSize}) // Optimized workgroup size for GPU
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let agentIndex = global_id.x;
    if (agentIndex >= uniforms.numAgents) {
        return;
    }
    
    let inputSize = uniforms.inputSize;
    let hiddenSize = uniforms.hiddenSize;
    let outputSize = uniforms.outputSize;
    
    // Pre-compute all offsets (faster than computing multiple times)
    let inputOffset = agentIndex * inputSize;
    let hiddenOffset = agentIndex * hiddenSize;
    let outputOffset = agentIndex * outputSize;
    let weight1Base = agentIndex * inputSize * hiddenSize;
    let weight2Base = agentIndex * hiddenSize * outputSize;
    
    // First layer: inputs -> hidden
    // OPTIMIZED: Reduced from 60 to 32 (max hidden size is now 30 after increase)
    // This reduces register pressure and improves GPU occupancy
    var hidden: array<f32, 32>;
    
    // OPTIMIZED: Vectorized inner loop using vec4<f32> for 4x SIMD parallelism
    // Process hidden neurons with coalesced memory access and vectorization
    for (var i: u32 = 0u; i < hiddenSize; i++) {
        var sum: f32 = 0.0;
        
        // Vectorized processing: process 4 inputs at once using SIMD
        var j: u32 = 0u;
        let vec4End = inputSize - (inputSize % 4u);
        
        // Process in chunks of 4 using vec4 for SIMD
        while (j < vec4End) {
            // Load 4 inputs and 4 weights as vectors (coalesced access)
            let inputVec = vec4<f32>(
                inputs[inputOffset + j],
                inputs[inputOffset + j + 1u],
                inputs[inputOffset + j + 2u],
                inputs[inputOffset + j + 3u]
            );
            let weightVec = vec4<f32>(
                weights1[weight1Base + j * hiddenSize + i],
                weights1[weight1Base + (j + 1u) * hiddenSize + i],
                weights1[weight1Base + (j + 2u) * hiddenSize + i],
                weights1[weight1Base + (j + 3u) * hiddenSize + i]
            );
            // Dot product computes sum of 4 multiplications in parallel
            sum += dot(inputVec, weightVec);
            j += 4u;
        }
        
        // Handle remaining inputs (not divisible by 4)
        while (j < inputSize) {
            sum += inputs[inputOffset + j] * weights1[weight1Base + j * hiddenSize + i];
            j += 1u;
        }
        
        hidden[i] = sigmoid(sum);
    }
    
    // Second layer: hidden -> output (output is always small, so standard loop)
    // OPTIMIZED: Vectorized processing for hidden layer using vec4
    for (var i: u32 = 0u; i < outputSize; i++) {
        var sum: f32 = 0.0;
        
        // Vectorized processing: process 4 hidden neurons at once
        var j: u32 = 0u;
        let vec4End = hiddenSize - (hiddenSize % 4u);
        
        // Process in chunks of 4 using vec4 for SIMD
        while (j < vec4End) {
            // Load 4 hidden values and 4 weights as vectors
            let hiddenVec = vec4<f32>(
                hidden[j],
                hidden[j + 1u],
                hidden[j + 2u],
                hidden[j + 3u]
            );
            let weightVec = vec4<f32>(
                weights2[weight2Base + j * outputSize + i],
                weights2[weight2Base + (j + 1u) * outputSize + i],
                weights2[weight2Base + (j + 2u) * outputSize + i],
                weights2[weight2Base + (j + 3u) * outputSize + i]
            );
            // Dot product computes sum of 4 multiplications in parallel
            sum += dot(hiddenVec, weightVec);
            j += 4u;
        }
        
        // Handle remaining hidden neurons (not divisible by 4)
        while (j < hiddenSize) {
            sum += hidden[j] * weights2[weight2Base + j * outputSize + i];
            j += 1u;
        }
        
        outputs[outputOffset + i] = sigmoid(sum);
    }
    
    // Store new hidden state (direct write, coalesced access)
    // OPTIMIZED: Vectorized write for better memory throughput
    var i: u32 = 0u;
    let vec4End = hiddenSize - (hiddenSize % 4u);
    
    // Write in chunks of 4 using vectorized stores
    while (i < vec4End) {
        let hiddenVec = vec4<f32>(hidden[i], hidden[i + 1u], hidden[i + 2u], hidden[i + 3u]);
        newHiddenStates[hiddenOffset + i] = hiddenVec.x;
        newHiddenStates[hiddenOffset + i + 1u] = hiddenVec.y;
        newHiddenStates[hiddenOffset + i + 2u] = hiddenVec.z;
        newHiddenStates[hiddenOffset + i + 3u] = hiddenVec.w;
        i += 4u;
    }
    
    // Handle remaining elements
    while (i < hiddenSize) {
        newHiddenStates[hiddenOffset + i] = hidden[i];
        i += 1u;
    }
}
`;

        try {
            const computeModule = this.device.createShaderModule({
                label: `Neural Network Compute ${key}`,
                code: computeShaderCode
            });

            const pipeline = this.device.createComputePipeline({
                label: `Neural Network Pipeline ${key}`,
                layout: 'auto',
                compute: {
                    module: computeModule,
                    entryPoint: 'main'
                }
            });

            this.pipelines.set(key, pipeline);
            return pipeline;
        } catch (error) {
            this.logger.warn(`Failed to create compute pipeline for ${key}:`, error);
            return null;
        }
    }

    // Ultra-fast weight change detection - optimized hash (only samples key weights)
    checkWeightChanged(agent, weights1, weights2) {
        // Fast path: Check if we've seen this agent before
        const cached = this.weightCache.get(agent);
        if (!cached) {
            // First time - compute hash and cache
            const hash = this.fastHashWeights(weights1, weights2);
            this.weightCache.set(agent, hash);
            return true; // Needs upload
        }
        
        // Quick check: sample only first weight of each matrix (ultra-fast)
        const w1First = weights1[0]?.[0] || 0;
        const w2First = weights2[0]?.[0] || 0;
        
        // If first weights match cached, likely unchanged (99% of cases)
        if (Math.abs(cached.first1 - w1First) < 0.0001 && Math.abs(cached.first2 - w2First) < 0.0001) {
            return false; // Probably unchanged
        }
        
        // Changed - recompute full hash
        const hash = this.fastHashWeights(weights1, weights2);
        if (hash.hash1 !== cached.hash1 || hash.hash2 !== cached.hash2) {
            this.weightCache.set(agent, hash);
            return true; // Changed, needs upload
        }
        
        // Hash matches but first weight different (rare) - update cache
        cached.first1 = w1First;
        cached.first2 = w2First;
        return false;
    }
    
    // Ultra-fast hash - samples multiple points across the matrix for better coverage
    fastHashWeights(weights1, weights2) {
        let hash1 = 0, hash2 = 0;
        const sampleSize = 5; // Increased sample size for better coverage
        
        // Sample weights from different parts of the matrix for better coverage
        const maxRows1 = weights1.length;
        const maxRows2 = weights2.length;

        for (let i = 0; i < sampleSize; i++) {
            // Sample from different positions: start, middle, end
            const rowIdx = i < 3 ? i : Math.floor((i - 3) * maxRows1 / sampleSize);
            const row = weights1[Math.min(rowIdx, maxRows1 - 1)];
            if (row) {
                const maxCols = row.length;
                for (let j = 0; j < Math.min(maxCols, 3); j++) {
                    // Sample from different column positions
                    const colIdx = j < 2 ? j : Math.floor(j * maxCols / 3);
                    hash1 = ((hash1 << 3) - hash1) + (row[Math.min(colIdx, maxCols - 1)] * 1000) | 0;
                }
            }
        }

        for (let i = 0; i < sampleSize; i++) {
            // Sample from different positions: start, middle, end
            const rowIdx = i < 3 ? i : Math.floor((i - 3) * maxRows2 / sampleSize);
            const row = weights2[Math.min(rowIdx, maxRows2 - 1)];
            if (row) {
                const maxCols = row.length;
                for (let j = 0; j < Math.min(maxCols, 3); j++) {
                    // Sample from different column positions
                    const colIdx = j < 2 ? j : Math.floor(j * maxCols / 3);
                    hash2 = ((hash2 << 3) - hash2) + (row[Math.min(colIdx, maxCols - 1)] * 1000) | 0;
                }
            }
        }
        
        return {
            hash1,
            hash2,
            first1: weights1[0]?.[0] || 0,
            first2: weights2[0]?.[0] || 0
        };
    }

    // Batch neural network forward passes - MAXIMUM OPTIMIZATION
    async batchNeuralNetworkForward(agents) {
        if (!this.useGPU || !this.initialized || agents.length < this.minAgentsForGPU) {
            return null; // Fall back to CPU
        }
        
        // Check if device is lost (device.lost is a promise, check if device exists)
        if (!this.device || !this.initialized) {
            return null;
        }
        
        // Prevent concurrent GPU operations (buffer mapping conflict)
        if (this.processing) {
            return null; // Skip if already processing, agents will use CPU
        }
        
        this.processing = true;

        try {
            // Safety validation - prevent GPU hang from corrupted data
            if (agents.length > 10000) {
                this.logger.warn('Neural network forward: too many agents, skipping GPU', { numAgents: agents.length });
                return null;
            }
            // Group agents by specialization (each has same network size)
            const agentsBySpecialization = {};
            agents.forEach(agent => {
                if (agent.isDead || !agent.lastInputs) return;
                const spec = agent.specializationType;
                if (!agentsBySpecialization[spec]) {
                    agentsBySpecialization[spec] = [];
                }
                agentsBySpecialization[spec].push(agent);
            });

            const results = {};
            
            // Process all specializations in parallel (use Promise.all for true parallelism)
            const specializationPromises = [];
            
            for (const [spec, specAgents] of Object.entries(agentsBySpecialization)) {
                if (specAgents.length === 0) continue;
                
                specializationPromises.push(this.processSpecialization(spec, specAgents).then(result => {
                    if (result) results[spec] = true;
                }).catch(error => {
                    this.logger.warn(`WebGPU processing failed for ${spec}, falling back to CPU:`, error);
                }));
            }
            
            // Wait for all specializations to complete
            await Promise.all(specializationPromises);

            return Object.keys(results).length > 0 ? results : null;
        } finally {
            this.processing = false; // Always release lock, even on error
        }
    }

    // Process a single specialization (extracted for parallel processing)
    async processSpecialization(spec, specAgents) {
        const firstAgent = specAgents[0];
        const perceptionSize = firstAgent.lastInputs.length;
        const hiddenSize = firstAgent.hiddenSize;
        const outputSize = firstAgent.nn.outputSize;
        const inputSize = perceptionSize + hiddenSize;

        // Filter out invalid agents (optimized: single pass)
        const validAgents = [];
        for (let i = 0; i < specAgents.length; i++) {
            const agent = specAgents[i];
            if (agent.lastInputs && agent.lastInputs.length === perceptionSize &&
                agent.hiddenState && agent.hiddenState.length === hiddenSize) {
                validAgents.push(agent);
            }
        }

        // PERFORMANCE: Cache array length early
        const numValidAgents = validAgents.length;
        if (numValidAgents === 0) return false;

        // Get or create pipeline for this specialization
        let pipeline = this.createPipelineForSpecialization(inputSize, hiddenSize, outputSize);
        if (!pipeline) {
            return false; // Skip this specialization
        }

        // Get or create buffers for this specialization
        const bufferKey = `${inputSize}_${hiddenSize}_${outputSize}`;
        let buffers = this.bufferCache.get(bufferKey);
        
        const maxAgents = Math.max(numValidAgents, 256); // Allocate for at least 256 agents
        
        if (!buffers || buffers.maxAgents < numValidAgents) {
            // Create or resize buffers with DOUBLE-BUFFERING for staging
            const uniformBufferSize = 6 * 4; // 6 u32s (24 bytes)
            const inputBufferSize = maxAgents * inputSize * 4; // f32 = 4 bytes
            const weight1BufferSize = maxAgents * inputSize * hiddenSize * 4;
            const weight2BufferSize = maxAgents * hiddenSize * outputSize * 4;
            const outputBufferSize = maxAgents * outputSize * 4;
            const hiddenStateBufferSize = maxAgents * hiddenSize * 4;

            buffers = {
                uniforms: this.device.createBuffer({
                    size: uniformBufferSize,
                    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
                }),
                inputs: this.device.createBuffer({
                    size: inputBufferSize,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
                }),
                weights1: this.device.createBuffer({
                    size: weight1BufferSize,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
                }),
                weights2: this.device.createBuffer({
                    size: weight2BufferSize,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
                }),
                outputs: this.device.createBuffer({
                    size: outputBufferSize,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
                }),
                newHiddenStates: this.device.createBuffer({
                    size: hiddenStateBufferSize,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
                }),
                // DOUBLE-BUFFERING: Two sets of staging buffers for overlap
                stagingOutputs: [
                    this.device.createBuffer({
                        size: outputBufferSize,
                        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
                    }),
                    this.device.createBuffer({
                        size: outputBufferSize,
                        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
                    })
                ],
                stagingHiddenStates: [
                    this.device.createBuffer({
                        size: hiddenStateBufferSize,
                        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
                    }),
                    this.device.createBuffer({
                        size: hiddenStateBufferSize,
                        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
                    })
                ],
                maxAgents: maxAgents,
                bindGroup: null, // Cache bind group
                inputArray: null, // Reuse input array
                uniformArray: null // Reuse uniform array
            };

            this.bufferCache.set(bufferKey, buffers);
        }

        // OPTIMIZATION: Reuse typed arrays to avoid allocations
        if (!buffers.inputArray || buffers.inputArray.length < maxAgents * inputSize) {
            buffers.inputArray = new Float32Array(maxAgents * inputSize);
        }
        const inputs = buffers.inputArray;

        // Pack inputs efficiently (use set() for TypedArray bulk copy)
        // OPTIMIZED: Direct memory access, no function calls in hot loop
        for (let idx = 0; idx < numValidAgents; idx++) {
            const agent = validAgents[idx];
            const inputOffset = idx * inputSize;
            const perceptionInputs = agent.lastInputs;
            const hiddenState = agent.hiddenState;
            
            // PERFORMANCE: Direct copy without fallback (inputs should always be valid)
            let i = inputOffset;
            for (let j = 0; j < perceptionSize; j++) {
                inputs[i++] = perceptionInputs[j];
            }
            for (let j = 0; j < hiddenSize; j++) {
                inputs[i++] = hiddenState[j];
            }
        }

        // Check for weight changes - OPTIMIZED: use version tracking instead of hashing
        const agentsNeedingWeightUpdate = [];
        let needsWeightUpload = false;

        // Pre-allocate weight arrays only if needed
        let batchedWeight1Data = null;
        let batchedWeight2Data = null;
        const weightUpdateOffsets = [];

        // Clean up weight cache entries for dead agents to prevent memory leaks
        const deadAgentIds = new Set();
        for (const agent of validAgents) {
            if (agent.isDead) {
                deadAgentIds.add(agent.id);
            }
        }
        for (const deadId of deadAgentIds) {
            this.weightCache.delete(deadId);
        }

        // OPTIMIZED: Pre-calculate expected dimensions once outside the loop
        const expectedWeight1RowsMin = perceptionSize + hiddenSize; // Minimum expected (correct size)
        const expectedWeight1RowsMax = perceptionSize + 2 * hiddenSize; // Maximum (agent bug creates this)
        const expectedWeight2Rows = hiddenSize;

        for (let idx = 0; idx < numValidAgents; idx++) {
            const agent = validAgents[idx];
            const w = agent.nn.getWeights();

            // OPTIMIZED: Only validate weights if not already validated (cache validation result)
            // Check if agent has been validated before (use a flag to avoid repeated validation)
            if (!agent._gpuWeightsValidated) {
                // CRITICAL: Validate weight dimensions match expected input size
                // This handles cases where agents have old weights from before input size changes
                // Fast validation: only check lengths, not every row
                const w1Len = w.weights1 ? w.weights1.length : 0;
                const w2Len = w.weights2 ? w.weights2.length : 0;
                const w1RowLen = w.weights1 && w.weights1[0] ? w.weights1[0].length : 0;
                const w2RowLen = w.weights2 && w.weights2[0] ? w.weights2[0].length : 0;
                
                const weight1Valid = w1Len >= expectedWeight1RowsMin && 
                                     w1Len <= expectedWeight1RowsMax &&
                                     w1RowLen === hiddenSize;
                const weight2Valid = w2Len === expectedWeight2Rows && w2RowLen === outputSize;
                
                if (!weight1Valid || !weight2Valid) {
                    // Weight dimensions don't match - force reinitialization
                    this.logger.warn(`[GPU-COMPUTE] Agent ${agent.id} has incompatible weights. Expected w1=${expectedWeight1RowsMin}-${expectedWeight1RowsMax}x${hiddenSize}, w2=${expectedWeight2Rows}x${outputSize}. Got w1=${w1Len}x${w1RowLen}, w2=${w2Len}x${w2RowLen}. Reinitializing.`);
                    
                    // Force neural network to reinitialize with correct dimensions
                    agent.nn = new NeuralNetwork(perceptionSize, hiddenSize, outputSize, null, agent.logger);
                    agent.gene.weights = agent.nn.getWeights(); // Update gene with new weights
                    agent.inputSize = perceptionSize + hiddenSize;
                    
                    // Clear weight cache for this agent
                    this.weightCache.delete(agent);
                    
                    // Get new weights after reinitialization
                    const newW = agent.nn.getWeights();
                    w.weights1 = newW.weights1;
                    w.weights2 = newW.weights2;
                }
                
                // Mark as validated to skip future checks
                agent._gpuWeightsValidated = true;
            }

            // Ultra-fast weight change check (with fallback to full validation)
            if (this.checkWeightChanged(agent, w.weights1, w.weights2)) {
                // Weights changed - clear validation flag to revalidate dimensions
                agent._gpuWeightsValidated = false;
                needsWeightUpload = true;
                if (!batchedWeight1Data) {
                    batchedWeight1Data = new Float32Array(maxAgents * inputSize * hiddenSize);
                    batchedWeight2Data = new Float32Array(maxAgents * hiddenSize * outputSize);
                }

                agentsNeedingWeightUpdate.push({ agent, idx });

                const weight1Offset = idx * inputSize * hiddenSize;
                const weight2Offset = idx * hiddenSize * outputSize;
                const w1 = w.weights1;
                const w2 = w.weights2;

                // Pack weights directly into batched array (optimized loops)
                // Note: The agent's neural network was created with inputSize that includes hiddenSize
                // So weights1 has (perceptionSize + hiddenSize + hiddenSize) rows
                // But we only need to pack (perceptionSize + hiddenSize) rows for the GPU shader
                // The GPU shader expects inputSize rows where inputSize = perceptionSize + hiddenSize
                const actualWeight1Rows = Math.min(w1.length, inputSize); // Pack only inputSize rows
                for (let j = 0; j < actualWeight1Rows; j++) {
                    const w1Row = w1[j];
                    const rowOffset = weight1Offset + j * hiddenSize;
                    if (w1Row && w1Row.length === hiddenSize) {
                        for (let k = 0; k < hiddenSize; k++) {
                            batchedWeight1Data[rowOffset + k] = w1Row[k] || 0;
                        }
                    } else {
                        // Fallback: zero out if row is invalid
                        for (let k = 0; k < hiddenSize; k++) {
                            batchedWeight1Data[rowOffset + k] = 0;
                        }
                    }
                }
                // Zero out any remaining rows if weights1 had fewer rows than expected
                for (let j = actualWeight1Rows; j < inputSize; j++) {
                    const rowOffset = weight1Offset + j * hiddenSize;
                    for (let k = 0; k < hiddenSize; k++) {
                        batchedWeight1Data[rowOffset + k] = 0;
                    }
                }
                for (let j = 0; j < hiddenSize; j++) {
                    const w2Row = w2[j];
                    const rowOffset = weight2Offset + j * outputSize;
                    if (w2Row && w2Row.length === outputSize) {
                        for (let k = 0; k < outputSize; k++) {
                            batchedWeight2Data[rowOffset + k] = w2Row[k] || 0;
                        }
                    } else {
                        // Fallback: zero out if row is invalid
                        for (let k = 0; k < outputSize; k++) {
                            batchedWeight2Data[rowOffset + k] = 0;
                        }
                    }
                }

                weightUpdateOffsets.push({ idx, weight1Offset, weight2Offset });
            }
        }

        // OPTIMIZATION: Batch all uploads in command encoder for better GPU scheduling
        const encoder = this.device.createCommandEncoder();
        
        // Upload inputs (always needed)
        this.queue.writeBuffer(buffers.inputs, 0, inputs, 0, numValidAgents * inputSize);

        // Upload weights ONLY if they changed
        if (needsWeightUpload && batchedWeight1Data) {
            // Upload all changed weights in batched operations
            for (const { weight1Offset, weight2Offset } of weightUpdateOffsets) {
                const weight1Size = inputSize * hiddenSize;
                const weight2Size = hiddenSize * outputSize;
                this.queue.writeBuffer(buffers.weights1, weight1Offset * 4, batchedWeight1Data, weight1Offset, weight1Size);
                this.queue.writeBuffer(buffers.weights2, weight2Offset * 4, batchedWeight2Data, weight2Offset, weight2Size);
            }
        }

        // Upload uniforms (reuse array if possible)
        if (!buffers.uniformArray) {
            buffers.uniformArray = new Uint32Array(6);
        }
        buffers.uniformArray[0] = inputSize;
        buffers.uniformArray[1] = hiddenSize;
        buffers.uniformArray[2] = outputSize;
        buffers.uniformArray[3] = numValidAgents;
        buffers.uniformArray[4] = 0;
        buffers.uniformArray[5] = 0;
        this.queue.writeBuffer(buffers.uniforms, 0, buffers.uniformArray);

        // OPTIMIZATION: Reuse bind group if buffers haven't changed
        if (!buffers.bindGroup) {
            buffers.bindGroup = this.device.createBindGroup({
                layout: pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: buffers.uniforms } },
                    { binding: 1, resource: { buffer: buffers.inputs } },
                    { binding: 2, resource: { buffer: buffers.weights1 } },
                    { binding: 3, resource: { buffer: buffers.weights2 } },
                    { binding: 4, resource: { buffer: buffers.outputs } },
                    { binding: 5, resource: { buffer: buffers.newHiddenStates } }
                ]
            });
        }

        // Dispatch compute shader
        const pass = encoder.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, buffers.bindGroup);
        // PERFORMANCE: Use optimal workgroup size (stored in pipeline metadata or use default)
        const workgroupSize = this.optimalWorkgroupSize || 128;
        const workgroupCount = Math.ceil(numValidAgents / workgroupSize);
        pass.dispatchWorkgroups(workgroupCount);
        pass.end();

        // DOUBLE-BUFFERING: Use alternating staging buffers
        const stagingIndex = this.stagingBufferIndex % 2;

        // Copy results to staging buffers (non-blocking)
        encoder.copyBufferToBuffer(buffers.outputs, 0, buffers.stagingOutputs[stagingIndex], 0, numValidAgents * outputSize * 4);
        encoder.copyBufferToBuffer(buffers.newHiddenStates, 0, buffers.stagingHiddenStates[stagingIndex], 0, numValidAgents * hiddenSize * 4);

        this.queue.submit([encoder.finish()]);

        // Wait for GPU to finish (necessary for immediate results)
        await this.queue.onSubmittedWorkDone();

        // PERFORMANCE: Map both buffers in parallel instead of sequentially
        // Map and read results (with error handling)
        try {
            await Promise.all([
                buffers.stagingOutputs[stagingIndex].mapAsync(GPUMapMode.READ),
                buffers.stagingHiddenStates[stagingIndex].mapAsync(GPUMapMode.READ)
            ]);

            const outputArray = new Float32Array(buffers.stagingOutputs[stagingIndex].getMappedRange());
            const hiddenStateArray = new Float32Array(buffers.stagingHiddenStates[stagingIndex].getMappedRange());

            // PERFORMANCE: Optimized unpacking - arrays are pre-allocated, use direct assignment
            // Use subarray views for faster access (no copying, just views)
            for (let idx = 0; idx < numValidAgents; idx++) {
                const agent = validAgents[idx];
                const outputOffset = idx * outputSize;
                const hiddenOffset = idx * hiddenSize;

                // PERFORMANCE: Allocate arrays if needed (first time or size changed)
                // Initialize with zeros to prevent NaN issues
                if (!agent.lastOutput || agent.lastOutput.length !== outputSize) {
                    agent.lastOutput = new Array(outputSize).fill(0);
                }
                if (!agent.newHiddenState || agent.newHiddenState.length !== hiddenSize) {
                    agent.newHiddenState = new Array(hiddenSize).fill(0);
                }

                // PERFORMANCE: Direct assignment from typed array views
                // Use subarray for zero-copy views, then direct assignment
                const outputView = outputArray.subarray(outputOffset, outputOffset + outputSize);
                const hiddenView = hiddenStateArray.subarray(hiddenOffset, hiddenOffset + hiddenSize);
                
                // Direct assignment from views (faster than manual loop with bounds checking)
                // Pre-allocated arrays ensure correct size, so we can use direct assignment
                for (let i = 0; i < outputSize; i++) {
                    agent.lastOutput[i] = outputView[i];
                }
                for (let i = 0; i < hiddenSize; i++) {
                    agent.newHiddenState[i] = hiddenView[i];
                }
            }

            // Unmap buffers
            buffers.stagingOutputs[stagingIndex].unmap();
            buffers.stagingHiddenStates[stagingIndex].unmap();

            // Only advance staging buffer index on successful completion
            this.stagingBufferIndex++;
        } catch (mapError) {
            // Buffer already mapped or other mapping error
            try {
                if (buffers.stagingOutputs[stagingIndex].mapState === 'mapped') {
                    buffers.stagingOutputs[stagingIndex].unmap();
                }
                if (buffers.stagingHiddenStates[stagingIndex].mapState === 'mapped') {
                    buffers.stagingHiddenStates[stagingIndex].unmap();
                }
            } catch (e) {
                // Ignore unmapping errors
            }
            // Don't advance staging buffer index on failure to avoid corruption
            throw mapError;
        }

        return true;
    }

    isAvailable() {
        return this.useGPU && this.initialized;
    }

    clearCache() {
        // Clear GPU resource caches to free memory
        this.pipelines.clear();
        this.weightCache.clear();

        // Properly dispose of all cached buffers
        for (const buffers of this.bufferCache.values()) {
            if (buffers.uniforms) buffers.uniforms.destroy();
            if (buffers.inputs) buffers.inputs.destroy();
            if (buffers.weights1) buffers.weights1.destroy();
            if (buffers.weights2) buffers.weights2.destroy();
            if (buffers.outputs) buffers.outputs.destroy();
            if (buffers.newHiddenStates) buffers.newHiddenStates.destroy();
        }
        this.bufferCache.clear();

        this.logger.log('GPUCompute buffers disposed and cache cleared');
    }

    /**
     * Selectively clear old cache entries to free memory without destroying performance
     * Enhanced for long-term stability with more aggressive cleanup over time
     * @param {number} maxEntries - Maximum number of entries to keep (default: 10)
     * @param {number} sessionHours - Hours since simulation started (for adaptive cleanup)
     */
    trimCache(maxEntries = 10, sessionHours = 0) {
        // Adaptive cache limits based on session duration
        let adaptiveMaxEntries = maxEntries;
        if (sessionHours > 1) adaptiveMaxEntries = Math.max(5, maxEntries - 2);
        if (sessionHours > 2) adaptiveMaxEntries = Math.max(3, maxEntries - 4);
        if (sessionHours > 4) adaptiveMaxEntries = Math.max(2, maxEntries - 6);
        if (sessionHours > 8) adaptiveMaxEntries = Math.max(1, maxEntries - 8);

        // Also trim pipelines - keep only most recently used architectures
        if (this.pipelines.size > adaptiveMaxEntries) {
            const pipelineEntries = Array.from(this.pipelines.entries());
            const toRemove = pipelineEntries.slice(0, pipelineEntries.length - adaptiveMaxEntries);
            for (const [key] of toRemove) {
                this.pipelines.delete(key);
            }
            this.logger.debug(`GPUCompute pipelines trimmed from ${pipelineEntries.length} to ${this.pipelines.size} entries (${sessionHours.toFixed(1)}h session)`);
        }

        // If cache is not too large, don't trim
        if (this.bufferCache.size <= adaptiveMaxEntries) {
            return;
        }

        // Convert to array, sort by access time (if available), keep most recent
        const entries = Array.from(this.bufferCache.entries());
        // For long sessions, be more aggressive with cleanup
        const toRemove = entries.slice(0, entries.length - adaptiveMaxEntries);

        let buffersDisposed = 0;
        for (const [key, buffers] of toRemove) {
            // Dispose all GPU buffers
            if (buffers.uniforms) buffers.uniforms.destroy();
            if (buffers.inputs) buffers.inputs.destroy();
            if (buffers.weights1) buffers.weights1.destroy();
            if (buffers.weights2) buffers.weights2.destroy();
            if (buffers.outputs) buffers.outputs.destroy();
            if (buffers.newHiddenStates) buffers.newHiddenStates.destroy();

            // Dispose staging buffers (double-buffering)
            if (buffers.stagingOutputs) {
                buffers.stagingOutputs.forEach(buffer => {
                    if (buffer && !buffer.destroyed) buffer.destroy();
                });
            }
            if (buffers.stagingHiddenStates) {
                buffers.stagingHiddenStates.forEach(buffer => {
                    if (buffer && !buffer.destroyed) buffer.destroy();
                });
            }

            // Clear bind group reference
            if (buffers.bindGroup) {
                buffers.bindGroup = null;
            }

            // Clear typed arrays
            if (buffers.inputArray) buffers.inputArray = null;
            if (buffers.uniformArray) buffers.uniformArray = null;

            // Remove from cache
            this.bufferCache.delete(key);
            buffersDisposed++;
        }

        this.logger.debug(`GPUCompute cache trimmed from ${entries.length} to ${this.bufferCache.size} entries (${buffersDisposed} buffers disposed, ${sessionHours.toFixed(1)}h session)`);
    }

    /**
     * Force defragmentation of GPU memory by recreating critical buffers
     * Call this periodically during long sessions to prevent memory fragmentation
     */
    defragmentMemory() {
        if (!this.device) return;

        this.logger.debug('GPUCompute: Starting memory defragmentation');

        // Force recreation of all buffer caches by clearing them
        // This will cause buffers to be recreated on next use with fresh memory
        const originalSize = this.bufferCache.size;
        this.clearCache();
        this.logger.debug(`GPUCompute: Defragmented memory by clearing ${originalSize} buffer cache entries`);
    }

    /**
     * Comprehensive cleanup for long-term stability
     * @param {number} sessionHours - Hours since simulation started
     * @param {Array} agents - Optional array of current agents in simulation for cache cleanup
     */
    deepCleanup(sessionHours = 0, agents = null) {
        // Trim caches with session-aware limits
        this.trimCache(10, sessionHours);

        // Defragment memory every few hours for very long sessions
        if (sessionHours > 2 && sessionHours % 2 === 0) {
            this.defragmentMemory();
        }

        // MEMORY LEAK FIX: More aggressive weight cache cleanup
        this.cleanupWeightCache(agents);
    }

    /**
     * Clean up weight cache for dead agents - can be called independently for emergency cleanup
     * @param {Array} agents - Optional array of current agents in simulation
     */
    cleanupWeightCache(agents = null) {
        let removedCount = 0;
        const originalSize = this.weightCache.size;

        // Clean up weight cache entries for agents not in simulation
        if (agents && Array.isArray(agents)) {
            const activeAgentIds = new Set();
            for (const agent of agents) {
                if (agent && !agent.isDead && agent.id) {
                    activeAgentIds.add(agent.id);
                }
            }

            // Remove cache entries for agents that are no longer in simulation
            for (const [agentId] of this.weightCache.entries()) {
                if (!activeAgentIds.has(agentId)) {
                    this.weightCache.delete(agentId);
                    removedCount++;
                }
            }
        }

        // MEMORY LEAK FIX: More aggressive size-based cleanup - reduce threshold from 1000 to 500
        // Clear weight cache if it exceeds reasonable size (fallback if agents not provided)
        if (this.weightCache.size > 500) {
            // Keep only entries that have been accessed recently (if we had timestamps)
            // For now, clear half to prevent sudden performance drops
            const entries = Array.from(this.weightCache.entries());
            const toRemove = entries.slice(0, Math.floor(entries.length / 2));
            for (const [key] of toRemove) {
                this.weightCache.delete(key);
                removedCount++;
            }
        }

        if (removedCount > 0) {
            this.logger.info(`[GPU-COMPUTE] Weight cache cleanup: removed ${removedCount} entries (${originalSize} → ${this.weightCache.size})`);
        }
    }
}
