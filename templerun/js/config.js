// Temple Run - Game Configuration & Shared State

// === Track Pacing Constants ===
export const TRACK = {
    LANE_WIDTH: 1.0,               // Distance between lane centers
    LANE_COUNT: 3,                  // Left, Center, Right
    PIECE_LENGTH: 30,               // Length of one track segment
    VISIBLE_PIECES_AHEAD: 12,       // How many pieces to generate ahead
    VISIBLE_PIECES_BEHIND: 4,       // How many pieces to keep behind
    MIN_DIST_BETWEEN_TURNS: 80,
    MAX_DIST_BETWEEN_TURNS: 200,
    MIN_DIST_BETWEEN_OBSTACLES: 30,
    MAX_DIST_BETWEEN_OBSTACLES: 80,
    MIN_DIST_AFTER_TURN_FOR_OBSTACLE: 20,
    MAX_BACK_TO_BACK_OBSTACLES: 2,
    DOUBLE_OBSTACLE_PERCENT: 0.3,
    MIN_DIST_BETWEEN_COIN_RUNS: 80,
    MAX_COINS_PER_RUN: 15,
    DEFAULT_COIN_PLACEMENT_HEIGHT: 0.5,
    ARC_MAX_HEIGHT: 2.5,
    MIN_DIST_BETWEEN_BONUS_ITEMS: 500,
    TRACK_WIDTH: 3.0,               // Total track width (3 lanes)
    WALL_HEIGHT: 3.0,               // Side wall height
    GROUND_Y: 0,                    // Ground level
};

// === Speed Constants ===
export const SPEED = {
    DEFAULT_RUN_SPEED: 6.0,         // Starting speed (units/second)
    MAX_RUN_SPEED: 15.0,            // Maximum speed
    SPEED_INCREASE_RATE: 0.00005,   // Speed increase per ms
    DEFAULT_JUMP_SPEED: 8.0,        // Initial jump velocity
    MAX_JUMP_SPEED: 12.0,
    JUMP_INCREASE_RATE: 0.000045,
    GRAVITY: -20.0,                 // Gravity acceleration
    BOOST_MULTIPLIER: 1.5,          // Boost powerup speed multiplier
    RESURRECT_SPEED_FACTOR: 0.85,   // Speed after save-me
    SLIDE_DURATION: 0.6,            // Slide duration in seconds
    LANE_CHANGE_SPEED: 8.0,         // Lane change interpolation speed
    TURN_ROTATION_SPEED: 5.0,       // Turn rotation speed
};

// === Camera Constants ===
export const CAMERA = {
    FOLLOW_DISTANCE: 8.0,           // Distance behind player
    HEIGHT_OFFSET: 3.5,             // Height above player
    FOV: 0.8,                       // Field of view in radians
    LERP_SPEED: 5.0,                // Camera follow interpolation speed
    LOOK_AHEAD: 3.0,                // Look ahead distance
};

// === Collision Constants ===
export const COLLISION = {
    PLAYER_RADIUS: 0.4,             // Player collision radius
    PLAYER_HEIGHT: 1.8,             // Player standing height
    PLAYER_SLIDE_HEIGHT: 0.6,       // Player sliding height
    COIN_COLLECT_RADIUS: 1.0,       // Normal coin collection radius
    MAGNET_COLLECT_RADIUS: 5.0,     // Magnet powerup collection radius
    OBSTACLE_HIT_MARGIN: 0.2,       // Extra margin for obstacle collision
};

// === Power-up Constants ===
export const POWERUP = {
    SHIELD_DURATION: 10.0,          // Shield duration in seconds
    BOOST_DURATION: 8.0,            // Boost duration in seconds
    MAGNET_DURATION: 10.0,          // Magnet duration in seconds
    SPAWN_MIN_DISTANCE: 500,        // Min distance between powerups
    BOOST_PROBABILITY: 0.4,
    SHIELD_PROBABILITY: 0.3,
    MAGNET_PROBABILITY: 0.3,
};

// === Chaser Constants ===
export const CHASER = {
    INITIAL_DISTANCE: 30.0,         // Starting distance behind player
    MAX_DISTANCE: 50.0,             // Max distance (chaser falls behind)
    CATCH_UP_SPEED: 8.0,            // Speed when catching up after stumble
    DRIFT_BACK_SPEED: 0.5,          // Speed of naturally drifting back
    STUMBLE_CATCH_UP: 10.0,         // Distance gained on stumble
    GRAB_DISTANCE: 1.0,             // Distance at which chaser grabs player
};

// === Score Constants ===
export const SCORE = {
    DISTANCE_MULTIPLIER: 1.0,       // Score per meter
    COIN_VALUE: 1,                  // Score per coin
    COIN_SCORE_VALUE: 50,           // Additional score per coin
};

// === Obstacle Types ===
export const OBSTACLE_TYPE = {
    JUMP_OVER: 'jumpOver',          // Low barrier, must jump
    SLIDE_UNDER: 'slideUnder',      // Overhead barrier, must slide
    LANE_BLOCK: 'laneBlock',        // Blocks one lane
    TURN_LEFT: 'turnLeft',          // Track turns left
    TURN_RIGHT: 'turnRight',        // Track turns right
};

// === Power-up Types ===
export const POWERUP_TYPE = {
    SHIELD: 'shield',
    BOOST: 'boost',
    MAGNET: 'magnet',
};

// === Game Phases ===
export const GAME_PHASE = {
    LOADING: 'loading',
    MENU: 'menu',
    PLAYING: 'playing',
    PAUSED: 'paused',
    GAMEOVER: 'gameover',
};

// === Shared Mutable State ===
export const state = {
    // Game phase
    gamePhase: GAME_PHASE.LOADING,

    // Player position & movement
    currentLane: 0,                 // -1 (left), 0 (center), 1 (right)
    targetLane: 0,
    playerX: 0,                     // Actual X position (lerped to lane)
    playerY: 0,                     // Y position (jump/slide)
    playerZ: 0,                     // Z position (forward progress)
    playerVelocityY: 0,             // Vertical velocity
    runSpeed: SPEED.DEFAULT_RUN_SPEED,
    jumpSpeed: SPEED.DEFAULT_JUMP_SPEED,

    // Player state
    isJumping: false,
    isSliding: false,
    isTurning: false,
    isDead: false,
    movementState: 'running',       // 'running' | 'jumping' | 'sliding' | 'turning' | 'death'
    slideTimer: 0,
    turnDirection: 0,               // -1 left, 1 right
    turnProgress: 0,                // 0 to 1 for turn animation

    // Track direction (cumulative rotation in 90-degree steps)
    trackDirection: 0,              // 0=+Z, 1=+X, 2=-Z, 3=-X (mod 4)
    trackAngle: 0,                  // Current track angle in radians

    // Scoring
    distance: 0,
    score: 0,
    coins: 0,
    highScore: parseInt(localStorage.getItem('templeRunHighScore') || '0'),
    totalCoins: parseInt(localStorage.getItem('templeRunTotalCoins') || '0'),

    // Difficulty
    difficultyLevel: 1,
    percentageOfMaxSpeed: 0,

    // Power-up state
    shieldActive: false,
    boostActive: false,
    magnetActive: false,
    shieldTimer: 0,
    boostTimer: 0,
    magnetTimer: 0,

    // Chaser state
    chaserDistance: CHASER.INITIAL_DISTANCE,
    chaserCatchingUp: false,

    // Input
    keys: {},
    swipeStart: null,
    swipeStartTime: 0,

    // Track state
    trackPieces: [],
    activeObstacles: [],
    activeCoins: [],
    activePowerups: [],
    nextPieceZ: 0,                  // Z position of next piece to generate
    distanceSinceLastTurn: 0,
    distanceSinceLastObstacle: 0,
    distanceSinceLastCoinRun: 0,
    distanceSinceLastPowerup: 0,
    consecutiveObstacles: 0,

    // Settings
    soundEnabled: true,
    sensitivity: 5,

    // Timing
    lastTime: 0,
    gameTime: 0,

    // Models loaded
    playerMesh: null,
    playerSkeleton: null,
    playerAnimations: {},
    chaserMesh: null,
    coinTemplate: null,
};
