// A preallocated vertex buffer for line segments: positions and RGBA colours, filled each frame and drawn with a draw
// range. Pure: no GL.

/**
 * @typedef {object} LineBuffer
 * @property {Float32Array} position three floats per vertex
 * @property {Float32Array} color four floats per vertex
 * @property {Float32Array} rgb the colour new vertices get
 * @property {number} alpha the alpha new vertices get
 * @property {number} vertices vertices written this frame
 * @property {number} capacity vertices the buffer holds
 */

/**
 * @param {number} segments the most segments it will hold
 * @returns {LineBuffer} an empty buffer
 */
export function createLineBuffer(segments) {
    return {
        position: new Float32Array(segments * 2 * 3),
        color: new Float32Array(segments * 2 * 4),
        rgb: new Float32Array(3),
        alpha: 1,
        vertices: 0,
        capacity: segments * 2,
    };
}

/**
 * @param {LineBuffer} buffer the buffer
 * @returns {void}
 */
export function clearLines(buffer) {
    buffer.vertices = 0;
}

/**
 * Sets the colour the next vertices get.
 * @param {LineBuffer} buffer the buffer
 * @param {ArrayLike<number>} rgb linear colour
 * @param {number} alpha the alpha
 * @returns {void}
 */
export function setLineColor(buffer, rgb, alpha) {
    buffer.rgb[0] = rgb[0];
    buffer.rgb[1] = rgb[1];
    buffer.rgb[2] = rgb[2];
    buffer.alpha = alpha;
}

/**
 * Adds one vertex in the current colour. A segment is two in a row; a vertex past the capacity is dropped.
 * @param {LineBuffer} buffer the buffer
 * @param {number} x world x
 * @param {number} y world y
 * @returns {void}
 */
export function pushVertex(buffer, x, y) {
    if (buffer.vertices >= buffer.capacity) {
        return;
    }
    const v = buffer.vertices;
    buffer.position[v * 3] = x;
    buffer.position[v * 3 + 1] = y;
    buffer.position[v * 3 + 2] = 0;
    buffer.color[v * 4] = buffer.rgb[0];
    buffer.color[v * 4 + 1] = buffer.rgb[1];
    buffer.color[v * 4 + 2] = buffer.rgb[2];
    buffer.color[v * 4 + 3] = buffer.alpha;
    buffer.vertices = v + 1;
}

/**
 * Adds a segment from a point along a direction, in the current colour.
 * @param {LineBuffer} buffer the buffer
 * @param {number} x the start
 * @param {number} y the start
 * @param {{angle: number, length: number}} ray the direction and length
 * @returns {void}
 */
export function pushRay(buffer, x, y, ray) {
    pushVertex(buffer, x, y);
    pushVertex(buffer, x + Math.cos(ray.angle) * ray.length, y + Math.sin(ray.angle) * ray.length);
}

/**
 * Adds a circle as `sides` segments in the current colour.
 * @param {LineBuffer} buffer the buffer
 * @param {{x: number, y: number, radius: number, sides: number}} circle the circle
 * @returns {void}
 */
export function pushCircle(buffer, circle) {
    const { x, y, radius, sides } = circle;
    for (let k = 0; k < sides; k++) {
        const a0 = (k / sides) * Math.PI * 2;
        const a1 = ((k + 1) / sides) * Math.PI * 2;
        pushVertex(buffer, x + Math.cos(a0) * radius, y + Math.sin(a0) * radius);
        pushVertex(buffer, x + Math.cos(a1) * radius, y + Math.sin(a1) * radius);
    }
}
