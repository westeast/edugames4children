// Temple Run - Utility Functions

// === Math Helpers ===
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

export function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

export function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomFloat(min, max) {
    return Math.random() * (max - min) + min;
}

export function distance3D(ax, ay, az, bx, by, bz) {
    const dx = ax - bx;
    const dy = ay - by;
    const dz = az - bz;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function distance2D(ax, az, bx, bz) {
    const dx = ax - bx;
    const dz = az - bz;
    return Math.sqrt(dx * dx + dz * dz);
}

// === Object Pool ===
export class ObjectPool {
    constructor(factory, resetFn, initialSize = 10) {
        this.factory = factory;
        this.resetFn = resetFn;
        this.pool = [];
        this.active = [];

        // Pre-allocate
        for (let i = 0; i < initialSize; i++) {
            const obj = this.factory();
            obj._poolActive = false;
            this.pool.push(obj);
        }
    }

    acquire() {
        let obj;
        if (this.pool.length > 0) {
            obj = this.pool.pop();
        } else {
            obj = this.factory();
        }
        obj._poolActive = true;
        this.active.push(obj);
        return obj;
    }

    release(obj) {
        obj._poolActive = false;
        this.resetFn(obj);
        const idx = this.active.indexOf(obj);
        if (idx !== -1) {
            this.active.splice(idx, 1);
        }
        this.pool.push(obj);
    }

    releaseAll() {
        while (this.active.length > 0) {
            this.release(this.active[0]);
        }
    }

    getActiveCount() {
        return this.active.length;
    }
}

// === Weighted Random Selection ===
export function weightedRandom(items, weights) {
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let random = Math.random() * totalWeight;
    for (let i = 0; i < items.length; i++) {
        random -= weights[i];
        if (random <= 0) return items[i];
    }
    return items[items.length - 1];
}

// === Debounce ===
export function debounce(fn, ms) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), ms);
    };
}

// === Format Number with Commas ===
export function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
