// --- QUADTREE SPATIAL INDEXING ---
// Preserved exactly from original

export class Point {
    constructor(x, y, data) {
        this.x = x; 
        this.y = y; 
        this.data = data;
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
        return (point.x >= this.x - this.w && point.x <= this.x + this.w &&
                point.y >= this.y - this.h && point.y <= this.y + this.h);
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

    // Dispose method to prevent memory leaks
    dispose() {
        // Clear points array
        this.points.length = 0;

        // Recursively dispose children
        if (this.divided) {
            if (this.northeast) {
                this.northeast.dispose();
                this.northeast = null;
            }
            if (this.northwest) {
                this.northwest.dispose();
                this.northwest = null;
            }
            if (this.southeast) {
                this.southeast.dispose();
                this.southeast = null;
            }
            if (this.southwest) {
                this.southwest.dispose();
                this.southwest = null;
            }
            this.divided = false;
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
        if (!this.boundary.intersects(range)) return found;
        for (let p of this.points) {
            if (range.contains(p)) found.push(p.data);
        }
        if (this.divided) {
            this.northwest.query(range, found);
            this.northeast.query(range, found);
            this.southwest.query(range, found);
            this.southeast.query(range, found);
        }
        return found;
    }
}



