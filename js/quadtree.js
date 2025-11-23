// --- QUADTREE SPATIAL INDEXING ---
// Preserved exactly from original

export class Point {
    constructor(x, y, data, radius = 0) {
        this.x = x;
        this.y = y;
        this.data = data;
        this.radius = radius; // For entities with size (obstacles, agents, food)
    }
}

export class Rectangle {
    constructor(x, y, w, h) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
    }

    contains(point) {
        // Account for entity radius when checking containment
        const entityRadius = point.radius || 0;
        return (point.x + entityRadius >= this.x - this.w &&
                point.x - entityRadius <= this.x + this.w &&
                point.y + entityRadius >= this.y - this.h &&
                point.y - entityRadius <= this.y + this.h);
    }

    intersects(range) {
        return !(range.x - range.w > this.x + this.w || range.x + range.w < this.x - this.w ||
            range.y - range.h > this.y + this.h || range.y + range.h < this.y - this.h);
    }
}

export class Quadtree {
    constructor(boundary, capacity) {
        this.boundary = boundary;
        this.capacity = capacity;
        this.points = [];
        this.divided = false;
    }

    // Dispose method to prevent memory leaks (full cleanup)
    dispose() {
        this.points.length = 0;
        if (this.divided) {
            if (this.northeast) { this.northeast.dispose(); this.northeast = null; }
            if (this.northwest) { this.northwest.dispose(); this.northwest = null; }
            if (this.southeast) { this.southeast.dispose(); this.southeast = null; }
            if (this.southwest) { this.southwest.dispose(); this.southwest = null; }
            this.divided = false;
        }
    }

    // Clear method for reuse (keeps structure to reduce GC)
    clear() {
        this.points.length = 0;
        if (this.divided) {
            this.northeast.clear();
            this.northwest.clear();
            this.southeast.clear();
            this.southwest.clear();
        }
    }

    subdivide() {
        const x = this.boundary.x, y = this.boundary.y, w = this.boundary.w / 2, h = this.boundary.h / 2;
        this.northeast = new Quadtree(new Rectangle(x + w, y - h, w, h), this.capacity);
        this.northwest = new Quadtree(new Rectangle(x - w, y - h, w, h), this.capacity);
        this.southeast = new Quadtree(new Rectangle(x + w, y + h, w, h), this.capacity);
        this.southwest = new Quadtree(new Rectangle(x - w, y + h, w, h), this.capacity);
        this.divided = true;
    }

    insert(point) {
        if (!this.boundary.contains(point)) return false;
        if (this.points.length < this.capacity) {
            this.points.push(point);
            return true;
        }
        if (!this.divided) this.subdivide();
        if (this.northeast.insert(point)) return true;
        if (this.northwest.insert(point)) return true;
        if (this.southeast.insert(point)) return true;
        if (this.southwest.insert(point)) return true;
    }

    query(range, found) {
        if (!found) found = [];

        // Always check all entities in this node (simplified spatial query)
        for (let p of this.points) {
            // Simple point-in-rectangle check
            if (p.x >= range.x - range.w && p.x <= range.x + range.w &&
                p.y >= range.y - range.h && p.y <= range.y + range.h) {
                found.push(p.data);
            }
        }

        // Recurse into child nodes
        if (this.divided) {
            this.northwest.query(range, found);
            this.northeast.query(range, found);
            this.southwest.query(range, found);
            this.southeast.query(range, found);
        }
        return found;
    }
}



