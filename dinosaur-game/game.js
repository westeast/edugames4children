const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const speedSelect = document.getElementById("speed-select");
const speedIndicator = document.getElementById("speed-indicator");

const letters = ["A", "B", "C", "D", "a", "b", "c", "d", "b", "p", "m", "f", "d", "t", "n", "l"];
const colors = ["#e91e63", "#9c27b0", "#3f51b5", "#00bcd4", "#4caf50", "#ffeb3b", "#ff9800", "#795548"];
const speedLevels = {
    1: 3.5,
    2: 5,
    3: 6.5,
    4: 8,
    5: 10
};

let frames = 0;
let score = 0;
let lives = 0;
let isGameOver = false;
let isGameStarted = false;
let speedBoost = 0;
let collectedText = "-";
let framesSinceLastObstacle = 0;
let targetObstacleFrames = 120;
let lastObstacleType = '';
let sameObstacleCount = 0;
let currentSpeed = speedLevels[2];

function recalcSpeed() {
    const level = Number(speedSelect.value);
    currentSpeed = speedLevels[level] + speedBoost;
    speedIndicator.innerText = `当前: ${level}挡`;
}

let audioCtx;
function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playTone(freq, duration = 0.12, type = "sine", volume = 0.08) {
    ensureAudio();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = volume;
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

function playJump() {
    playTone(520, 0.1, "square", 0.08);
}

function playStar() {
    playTone(900, 0.09, "triangle", 0.12);
    setTimeout(() => playTone(1200, 0.09, "triangle", 0.09), 90);
}

function playHit() {
    playTone(200, 0.2, "sawtooth", 0.15);
}

document.getElementById('restart-btn').addEventListener('click', reset);
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        if (isGameOver) reset();
        else if (!isGameStarted) {
            isGameStarted = true;
            loop();
        } else {
            if (rex.isGrounded) {
                rex.jump();
                playJump();
            }
        }
    }
});

speedSelect.addEventListener('change', () => {
    recalcSpeed();
});

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

const rex = {
    x: 50,
    y: 200,
    w: 48,
    h: 48,
    dy: 0,
    gravity: 0.6,
    jumpForce: -12,
    isGrounded: false,
    color: "#444",
    accent: "#4db6ac",
    
    draw() {
        // Chrome-like dino built with a pixel grid (scale 4)
        const s = 4;
        const px = this.x;
        const py = this.y;
        const blocks = [
            [3,0,6],[2,1,8],[2,2,8],[2,3,8],[2,4,7],[2,5,6],
            [2,6,6],[3,7,3],[3,8,3],[3,9,3], // body to tail
            [0,2,2],[0,3,2], // head top
            [1,5,1], // jaw
            [8,4,2],[9,5,1], // tail tip
            [4,10,2],[6,10,2], // legs
        ];
        ctx.fillStyle = this.color;
        blocks.forEach(([bx, by, bw]) => ctx.fillRect(px + bx*s, py + by*s, bw*s, s));
        // Accent belly stripe
        ctx.fillStyle = this.accent;
        ctx.fillRect(px + 3*s, py + 7*s, 5*s, s);
        // Eye
        ctx.fillStyle = "white";
        ctx.fillRect(px + 6*s, py + 2*s, s, s);
        ctx.fillStyle = "black";
        ctx.fillRect(px + 6*s, py + 2*s, s/1.2, s/1.2);
    },
    
    update() {
        this.y += this.dy;
        this.dy += this.gravity;
        
        // Ground checking logic will be handled outside per platform
        if (this.y + this.h >= canvas.height - 20) {
            this.y = canvas.height - 20 - this.h;
            this.dy = 0;
            this.isGrounded = true;
        } else {
            this.isGrounded = false;
        }
    },
    
    jump() {
        this.dy = this.jumpForce;
        this.isGrounded = false;
    }
};

let obstacles = [];
let items = [];
let stars = [];

class BaseObstacle {
    constructor() {
        this.x = canvas.width;
        this.y = 0;
        this.w = 0;
        this.h = 0;
        this.type = 'base';
    }
    draw() {}
    update() {
        this.x -= currentSpeed;
    }
}

class TreeObstacle extends BaseObstacle {
    constructor() {
        super();
        this.type = 'tree';
        this.w = 28; 
        const heights = [40, 56, 72]; 
        this.h = heights[randomInt(0, 2)];
        this.y = canvas.height - 20 - this.h;
        this.color = "#4caf50";
        this.trunkColor = "#795548";
    }
    draw() {
        const s = 4;
        const cx = this.x + this.w/2;
        ctx.fillStyle = this.trunkColor;
        ctx.fillRect(cx - s, this.y + this.h * 0.4, s*2, this.h * 0.6);
        ctx.fillStyle = this.color;
        if (this.h === 40) { 
            ctx.fillRect(this.x, this.y, this.w, this.h * 0.5);
            ctx.fillRect(this.x + s, this.y - s, this.w - s*2, s);
        } else if (this.h === 56) { 
            ctx.fillRect(this.x - 4, this.y + s, this.w + 8, this.h * 0.4);
            ctx.fillRect(this.x, this.y - s, this.w, s*2);
        } else { 
            ctx.fillRect(this.x - 8, this.y + s*2, this.w + 16, this.h * 0.4);
            ctx.fillRect(this.x - 4, this.y, this.w + 8, s*2);
            ctx.fillRect(this.x, this.y - s*2, this.w, s*2);
        }
    }
}

class CactusObstacle extends BaseObstacle {
    constructor() {
        super();
        this.type = 'cactus';
        this.color = "#8bc34a"; 
        const variantType = randomInt(0, 1);
        if (variantType === 0) {
            const scales = [1.2, 1.8, 2.4];
            const sc = scales[randomInt(0, 2)];
            this.w = 12 * sc;
            this.h = 24 * sc;
        } else {
            this.w = 20;
            const hVars = [30, 45, 60];
            this.h = hVars[randomInt(0, 2)];
        }
        this.y = canvas.height - 20 - this.h;
    }
    draw() {
        ctx.fillStyle = this.color;
        const thick = this.w * 0.4;
        const mx = this.x + (this.w - thick) / 2;
        ctx.fillRect(mx, this.y, thick, this.h);
        const brachW = this.w * 0.3;
        ctx.fillRect(this.x, this.y + this.h * 0.3, brachW, this.h * 0.4);
        ctx.fillRect(this.x, this.y + this.h * 0.15, this.w * 0.15, this.h * 0.15);
        const rightX = this.x + this.w - brachW;
        ctx.fillRect(rightX, this.y + this.h * 0.4, brachW, this.h * 0.3);
        ctx.fillRect(this.x + this.w - this.w*0.15, this.y + this.h * 0.25, this.w * 0.15, this.h * 0.15);
    }
}

class HouseObstacle extends BaseObstacle {
    constructor() {
        super();
        this.type = 'house';
        this.w = 56;
        this.h = 48;
        this.y = canvas.height - 20 - this.h;
        this.color = "#9c27b0";
    }
    draw() {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y + 16, this.w, this.h - 16);
        ctx.fillStyle = "#ff9800";
        ctx.beginPath();
        ctx.moveTo(this.x - 8, this.y + 16);
        ctx.lineTo(this.x + this.w/2, this.y);
        ctx.lineTo(this.x + this.w + 8, this.y + 16);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#795548";
        ctx.fillRect(this.x + this.w/2 - 8, this.y + this.h - 16, 16, 16);
    }
}

class BirdObstacle extends BaseObstacle {
    constructor() {
        super();
        this.type = 'bird';
        this.w = 32;
        this.h = 24;
        this.y = randomInt(110, 190);
        this.color = "#29b6f6";
    }
    draw() {
        ctx.fillStyle = this.color;
        const s = 4;
        ctx.fillRect(this.x + s*2, this.y + s*2, 5*s, 3*s);
        const wingUp = Math.floor(frames / 10) % 2 === 0;
        if (wingUp) {
            ctx.fillRect(this.x + s*3, this.y, 2*s, 2*s);
        } else {
            ctx.fillRect(this.x + s*3, this.y + s*4, 2*s, 2*s);
        }
        ctx.fillRect(this.x, this.y + s, 2*s, 2*s);
        ctx.fillStyle = "#fbc02d";
        ctx.fillRect(this.x - s, this.y + s*2, s, s);
    }
}

class PitObstacle extends BaseObstacle {
    constructor() {
        super();
        this.type = 'pit';
        this.w = 64;
        this.h = 20;
        this.y = canvas.height - 20;
    }
    draw() {
        ctx.clearRect(this.x, this.y, this.w, this.h);
        ctx.fillStyle = "#e0f7fa";
        ctx.fillRect(this.x, this.y, this.w, 20);
    }
}

class Item {
    constructor(isStar = false) {
        this.x = canvas.width + randomInt(0, 100);
        this.y = randomInt(50, 200);
        this.isStar = isStar;
        
        if (isStar) {
            this.w = 25;
            this.h = 25;
            this.color = "#ffeb3b"; // Yellow star
        } else {
            this.text = letters[randomInt(0, letters.length - 1)];
            this.color = colors[randomInt(0, colors.length - 1)];
            this.w = 30;
            this.h = 30;
        }
    }
    
    draw() {
        if (this.isStar) {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x + 12, this.y + 12, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "white";
            ctx.font = "15px Arial";
            ctx.fillText("★", this.x + 4, this.y + 17);
        } else {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x + 15, this.y + 15, 15, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "white";
            ctx.font = "bold 20px Arial";
            ctx.fillText(this.text, this.x + 6, this.y + 22);
        }
    }
    
    update() {
        this.x -= currentSpeed;
    }
}

function handleElements() {
// Generate Obstacles
    framesSinceLastObstacle++;
    
    // Jump duration is roughly 40 frames. With 1.2x spacing, safe delay is 48 frames.
    if (framesSinceLastObstacle >= targetObstacleFrames) {
        // Weighted random: House 20%, Tree 40%, Cactus 40%
        let types = ['house', 'tree', 'tree', 'cactus', 'cactus'];
        
        // Exclude type if consecutive >= 2
        if (sameObstacleCount >= 2) {
            types = types.filter(t => t !== lastObstacleType);
        }
        
        let t = types[randomInt(0, types.length - 1)];
        if (t === lastObstacleType) {
            sameObstacleCount++;
        } else {
            lastObstacleType = t;
            sameObstacleCount = 1;
        }

        if (t === 'tree') obstacles.push(new TreeObstacle());
        else if (t === 'cactus') obstacles.push(new CactusObstacle());
        else obstacles.push(new HouseObstacle());
        
        framesSinceLastObstacle = 0;
        
        // Base interval 1.5 - 2.5s (90 - 150 frames at 60fps)
        let baseMin = Math.max(50, 90 - speedBoost * 3);
        let baseMax = Math.max(80, 150 - speedBoost * 4);
        
        targetObstacleFrames = randomInt(baseMin, baseMax);
    }
    // Generate Educational Items
    if (frames % 180 === 0) {
        items.push(new Item(false));
    }
    // Generate Stars
    if (frames % 1000 === 0) {
        items.push(new Item(true));
    }

    for (let i = 0; i < obstacles.length; i++) {
        obstacles[i].update();
        obstacles[i].draw();
        
        let o = obstacles[i];
        
        // Collision checking
        if (
            rex.x < o.x + o.w &&
            rex.x + rex.w > o.x &&
            rex.y < o.y + o.h &&
            rex.y + rex.h > o.y
        ) {
            // Pit is safe if you are jumping over it, deadly if you are on it
            if (o.type === 'pit' && rex.y + rex.h >= canvas.height - 20) {
                collide();
            } else if (o.type !== 'pit') {
                // Frontal collision with object
                collide();
            }
        }
        
        if (o.x + o.w < 0) {
            obstacles.splice(i, 1);
            i--;
            score += 10;
        }
    }
    
    for (let i = 0; i < items.length; i++) {
        items[i].update();
        items[i].draw();
        
        let item = items[i];
        
        if (
            rex.x < item.x + item.w &&
            rex.x + rex.w > item.x &&
            rex.y < item.y + item.h &&
            rex.y + rex.h > item.y
        ) {
            if (item.isStar) {
                lives++;
                document.getElementById('lives').innerText = lives;
                playStar();
            } else {
                score += 50;
                collectedText = item.text;
                document.getElementById('collected').innerText = collectedText;
                document.getElementById('score').innerText = score;
            }
            items.splice(i, 1);
            i--;
        } else if (item.x + item.w < 0) {
            items.splice(i, 1);
            i--;
        }
    }
}

function collide() {
    if (lives > 0) {
        lives--;
        document.getElementById('lives').innerText = lives;
        // invulnerable push forward
        obstacles = []; 
        playHit();
    } else {
        isGameOver = true;
        playHit();
    }
}

function drawGround() {
    ctx.fillStyle = "#8d6e63"; // Brown
    ctx.fillRect(0, canvas.height - 20, canvas.width, 20);
    ctx.fillStyle = "#4caf50"; // Grass
    ctx.fillRect(0, canvas.height - 24, canvas.width, 4);
}

function reset() {
    isGameOver = false;
    score = 0;
    lives = 0;
    frames = 0;
    framesSinceLastObstacle = 0;
    targetObstacleFrames = 120;
    lastObstacleType = '';
    sameObstacleCount = 0;
    speedBoost = 0;
    obstacles = [];
    items = [];
    rex.y = 200;
    rex.dy = 0;
    document.getElementById('game-over').classList.add('hidden');
    document.getElementById('lives').innerText = lives;
    document.getElementById('score').innerText = score;
    document.getElementById('collected').innerText = "-";
    recalcSpeed();
    loop();
}

function loop() {
    if (isGameOver) {
        document.getElementById('game-over').classList.remove('hidden');
        document.getElementById('final-score').innerText = score;
        return;
    }
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGround();
    handleElements();
    rex.update();
    rex.draw();
    
    score++;
    if (score % 500 === 0) {
        speedBoost += 0.5; // increase difficulty
        recalcSpeed();
    }
    
    document.getElementById('score').innerText = score;
    frames++;
    requestAnimationFrame(loop);
}

function drawStartScreen() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGround();
    rex.draw();
    
    ctx.fillStyle = "#333";
    ctx.font = "30px Arial";
    ctx.textAlign = "center";
    ctx.fillText("按空格键开始游戏", canvas.width / 2, canvas.height / 2);
    
    if (!isGameStarted) {
        requestAnimationFrame(drawStartScreen);
    }
}

// Start Game
recalcSpeed();
drawStartScreen();
