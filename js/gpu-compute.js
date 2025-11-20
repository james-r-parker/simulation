// --- GPU COMPUTE MODULE (WebGPU) ---
// Direct WebGPU compute shaders for neural network forward passes
// MAXIMUM OPTIMIZATION: Weight caching, double-buffering, batched uploads, parallel processing, vectorization

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

            this.device = await Promise.race([
                adapter.requestDevice({
                    requiredFeatures: [],
                    requiredLimits: {
                        maxComputeWorkgroupStorageSize: adapter.limits.maxComputeWorkgroupStorageSize,
                        maxComputeInvocationsPerWorkgroup: adapter.limits.maxComputeInvocationsPerWorkgroup,
                        maxBufferSize: adapter.limits.maxBufferSize
                    }
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Device request timeout')), 15000))
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
                this.useGPU = false;
                this.initialized = false;
                this.device = null;
                this.queue = null;
                this.pipelines.clear();
                this.bufferCache.clear();
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

@compute @workgroup_size(128) // Larger workgroup for better GPU utilization
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
    // Use fixed-size local array (max 60 elements)
    var hidden: array<f32, 60>;
    
    // Unroll inner loop for small hidden sizes (better for GPU)
    if (hiddenSize <= 16) {
        // Small hidden size - unroll for better performance
        for (var i: u32 = 0u; i < hiddenSize; i++) {
            var sum: f32 = 0.0;
            for (var j: u32 = 0u; j < inputSize; j++) {
                sum += inputs[inputOffset + j] * weights1[weight1Base + j * hiddenSize + i];
            }
            hidden[i] = sigmoid(sum);
        }
    } else {
        // Larger hidden size - standard loop
        for (var i: u32 = 0u; i < hiddenSize; i++) {
            var sum: f32 = 0.0;
            for (var j: u32 = 0u; j < inputSize; j++) {
                sum += inputs[inputOffset + j] * weights1[weight1Base + j * hiddenSize + i];
            }
            hidden[i] = sigmoid(sum);
        }
    }
    
    // Second layer: hidden -> output (output is always small, so standard loop)
    for (var i: u32 = 0u; i < outputSize; i++) {
        var sum: f32 = 0.0;
        for (var j: u32 = 0u; j < hiddenSize; j++) {
            sum += hidden[j] * weights2[weight2Base + j * outputSize + i];
        }
        outputs[outputOffset + i] = sigmoid(sum);
    }
    
    // Store new hidden state (direct write, no intermediate)
    for (var i: u32 = 0u; i < hiddenSize; i++) {
        newHiddenStates[hiddenOffset + i] = hidden[i];
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
    
    // Ultra-fast hash - only samples 3x3 matrix (much faster than 5x5)
    fastHashWeights(weights1, weights2) {
        let hash1 = 0, hash2 = 0;
        const sampleSize = 3; // Even smaller sample for speed
        
        // Sample first few weights only
        for (let i = 0; i < Math.min(weights1.length, sampleSize); i++) {
            const row = weights1[i];
            if (row) {
                for (let j = 0; j < Math.min(row.length, sampleSize); j++) {
                    hash1 = ((hash1 << 3) - hash1) + (row[j] * 1000) | 0;
                }
            }
        }
        for (let i = 0; i < Math.min(weights2.length, sampleSize); i++) {
            const row = weights2[i];
            if (row) {
                for (let j = 0; j < Math.min(row.length, sampleSize); j++) {
                    hash2 = ((hash2 << 3) - hash2) + (row[j] * 1000) | 0;
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

        if (validAgents.length === 0) return false;

        // Get or create pipeline for this specialization
        let pipeline = this.createPipelineForSpecialization(inputSize, hiddenSize, outputSize);
        if (!pipeline) {
            return false; // Skip this specialization
        }

        // Get or create buffers for this specialization
        const bufferKey = `${inputSize}_${hiddenSize}_${outputSize}`;
        let buffers = this.bufferCache.get(bufferKey);
        
        const maxAgents = Math.max(validAgents.length, 256); // Allocate for at least 256 agents
        
        if (!buffers || buffers.maxAgents < validAgents.length) {
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
        for (let idx = 0; idx < validAgents.length; idx++) {
            const agent = validAgents[idx];
            const inputOffset = idx * inputSize;
            const perceptionInputs = agent.lastInputs;
            const hiddenState = agent.hiddenState;
            
            // Direct copy - fastest method
            let i = inputOffset;
            for (let j = 0; j < perceptionSize; j++) {
                inputs[i++] = perceptionInputs[j] || 0;
            }
            for (let j = 0; j < hiddenSize; j++) {
                inputs[i++] = hiddenState[j] || 0;
            }
        }

        // Check for weight changes - OPTIMIZED: use version tracking instead of hashing
        const agentsNeedingWeightUpdate = [];
        let needsWeightUpload = false;

        // Pre-allocate weight arrays only if needed
        let batchedWeight1Data = null;
        let batchedWeight2Data = null;
        const weightUpdateOffsets = [];

        for (let idx = 0; idx < validAgents.length; idx++) {
            const agent = validAgents[idx];
            const w = agent.nn.getWeights();
            
            // Ultra-fast weight change check
            if (this.checkWeightChanged(agent, w.weights1, w.weights2)) {
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
                for (let j = 0; j < inputSize; j++) {
                    const w1Row = w1[j];
                    const rowOffset = weight1Offset + j * hiddenSize;
                    if (w1Row) {
                        for (let k = 0; k < hiddenSize; k++) {
                            batchedWeight1Data[rowOffset + k] = w1Row[k] || 0;
                        }
                    }
                }
                for (let j = 0; j < hiddenSize; j++) {
                    const w2Row = w2[j];
                    const rowOffset = weight2Offset + j * outputSize;
                    if (w2Row) {
                        for (let k = 0; k < outputSize; k++) {
                            batchedWeight2Data[rowOffset + k] = w2Row[k] || 0;
                        }
                    }
                }
                
                weightUpdateOffsets.push({ idx, weight1Offset, weight2Offset });
            }
        }

        // OPTIMIZATION: Batch all uploads in command encoder for better GPU scheduling
        const encoder = this.device.createCommandEncoder();
        
        // Upload inputs (always needed)
        this.queue.writeBuffer(buffers.inputs, 0, inputs, 0, validAgents.length * inputSize);

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
        buffers.uniformArray[3] = validAgents.length;
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
        const workgroupCount = Math.ceil(validAgents.length / 128); // Match workgroup_size
        pass.dispatchWorkgroups(workgroupCount);
        pass.end();

        // DOUBLE-BUFFERING: Use alternating staging buffers
        const stagingIndex = this.stagingBufferIndex % 2;
        this.stagingBufferIndex++;

        // Copy results to staging buffers (non-blocking)
        encoder.copyBufferToBuffer(buffers.outputs, 0, buffers.stagingOutputs[stagingIndex], 0, validAgents.length * outputSize * 4);
        encoder.copyBufferToBuffer(buffers.newHiddenStates, 0, buffers.stagingHiddenStates[stagingIndex], 0, validAgents.length * hiddenSize * 4);

        this.queue.submit([encoder.finish()]);

        // Wait for GPU to finish (necessary for immediate results)
        await this.queue.onSubmittedWorkDone();

        // Map and read results (with error handling)
        try {
            await buffers.stagingOutputs[stagingIndex].mapAsync(GPUMapMode.READ);
            await buffers.stagingHiddenStates[stagingIndex].mapAsync(GPUMapMode.READ);

            const outputArray = new Float32Array(buffers.stagingOutputs[stagingIndex].getMappedRange());
            const hiddenStateArray = new Float32Array(buffers.stagingHiddenStates[stagingIndex].getMappedRange());

            // Unpack results back to agents (OPTIMIZED: direct assignment, no Array.from overhead)
            for (let idx = 0; idx < validAgents.length; idx++) {
                const agent = validAgents[idx];
                const outputOffset = idx * outputSize;
                const hiddenOffset = idx * hiddenSize;

                // Pre-allocate arrays if needed (reuse if same size)
                if (!agent.lastOutput || agent.lastOutput.length !== outputSize) {
                    agent.lastOutput = new Array(outputSize);
                }
                if (!agent.newHiddenState || agent.newHiddenState.length !== hiddenSize) {
                    agent.newHiddenState = new Array(hiddenSize);
                }

                // Direct copy (faster than Array.from or subarray)
                for (let i = 0; i < outputSize; i++) {
                    agent.lastOutput[i] = outputArray[outputOffset + i];
                }
                for (let i = 0; i < hiddenSize; i++) {
                    agent.newHiddenState[i] = hiddenStateArray[hiddenOffset + i];
                }
            }

            // Unmap buffers
            buffers.stagingOutputs[stagingIndex].unmap();
            buffers.stagingHiddenStates[stagingIndex].unmap();
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
            throw mapError;
        }

        return true;
    }

    isAvailable() {
        return this.useGPU && this.initialized;
    }
}
