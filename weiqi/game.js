const BOARD_SIZE = 19;

const state = {
    board: null,
    game: null,
    mode: 'pvc',
    difficulty: 5,
    moveCount: 0,
    passCount: 0,
    isGameOver: false,
    isAiThinking: false,
    blackTrash: 0,
    whiteTrash: 0,
    blackCapturedByWhite: 0,
    whiteCapturedByBlack: 0,
    playerColor: WGo.B,
    aiColor: WGo.W,
    poemQueue: [],
    speaking: false,
    poemIndex: 0,
    speechEnabled: 'speechSynthesis' in window,
    speechRate: 0.9,
    voiceType: 'default',
    poemTriggers: {
        move: true,
        capture: true,
        pass: true,
        round_end: true
    },
    lastRandomKey: '',
    currentPoemLineEl: null,
    currentPoem: null,
    currentPoemLineIndex: 0,
    currentPoemColor: null
};

const ui = {
    modeSelect: document.getElementById('modeSelect'),
    difficultySelect: document.getElementById('difficultySelect'),
    difficultyWrap: document.getElementById('difficultyWrap'),
    speechSpeedSelect: document.getElementById('speechSpeedSelect'),
    voiceSelect: document.getElementById('voiceSelect'),
    currentPlayer: document.getElementById('currentPlayer'),
    moveCount: document.getElementById('moveCount'),
    blackCaptures: document.getElementById('blackCaptures'),
    whiteCaptures: document.getElementById('whiteCaptures'),
    passCount: document.getElementById('passCount'),
    passBtn: document.getElementById('passBtn'),
    restartBtn: document.getElementById('restartBtn'),
    hintText: document.getElementById('hintText'),
    winnerBanner: document.getElementById('winnerBanner'),
    blackTrash: document.getElementById('blackTrash'),
    whiteTrash: document.getElementById('whiteTrash'),
    scoreDetail: document.getElementById('scoreDetail'),
    poemTicker: document.getElementById('poemTicker'),
    poemDisplayTitle: document.getElementById('poemDisplayTitle'),
    poemDisplayLines: document.getElementById('poemDisplayLines'),
    viewReadPoemsBtn: document.getElementById('viewReadPoemsBtn')
};

function init() {
    initBoard();
    bindEvents();
    resetGame();
}

function initBoard() {
    const boardElement = document.getElementById('board');
    const boardSizePx = Math.min(Math.max(window.innerWidth * 0.72, 360), 760);

    state.board = new WGo.Board(boardElement, {
        size: BOARD_SIZE,
        width: boardSizePx,
        section: {top: 0, right: 0, bottom: 0, left: 0},
        stoneHandler: WGo.Board.drawHandlers.REALISTIC,
        background: '#DEB887'
    });

    state.board.addEventListener('click', handleBoardClick);
    addPinStyleMarkers();

    window.addEventListener('resize', () => {
        const w = Math.min(Math.max(window.innerWidth * 0.72, 300), 760);
        state.board.setWidth(w);
    });
}

function addPinStyleMarkers() {
    const starPoints = [
        [3, 3], [3, 9], [3, 15],
        [9, 3], [9, 9], [9, 15],
        [15, 3], [15, 9], [15, 15]
    ];
    const dots = starPoints.map(([x, y]) => ({x, y, type: 'CR', label: '•', c: '#4b2e14'}));
    state.board.addObject(dots);
}

function bindEvents() {
    ui.modeSelect.addEventListener('change', () => {
        state.mode = ui.modeSelect.value;
        ui.difficultyWrap.style.display = state.mode === 'pvc' ? 'flex' : 'none';
        resetGame();
    });

    ui.difficultySelect.addEventListener('change', () => {
        state.difficulty = Number(ui.difficultySelect.value);
    });

    ui.speechSpeedSelect.addEventListener('change', () => {
        state.speechRate = Number(ui.speechSpeedSelect.value);
    });

    ui.voiceSelect.addEventListener('change', () => {
        state.voiceType = ui.voiceSelect.value;
    });

    ui.passBtn.addEventListener('click', onPass);
    ui.restartBtn.addEventListener('click', resetGame);

    if (ui.viewReadPoemsBtn) {
        ui.viewReadPoemsBtn.addEventListener('click', () => {
            window.open('read-poems.html', '_blank');
        });
    }
}

function resetGame() {
    state.game = new WGo.Game(BOARD_SIZE, 'KO', false, false);
    state.moveCount = 0;
    state.passCount = 0;
    state.isGameOver = false;
    state.isAiThinking = false;
    state.blackTrash = 0;
    state.whiteTrash = 0;
    state.blackCapturedByWhite = 0;
    state.whiteCapturedByBlack = 0;
    state.poemQueue = [];
    state.speaking = false;
    state.currentPoemLineEl = null;
    state.currentPoem = null;
    state.currentPoemLineIndex = 0;
    state.currentPoemColor = null;

    if (state.speechEnabled) {
        window.speechSynthesis.cancel();
    }

    clearBoardStones();
    addPinStyleMarkers();
    ui.winnerBanner.classList.add('hidden');
    ui.winnerBanner.textContent = '';
    ui.scoreDetail.textContent = '等待终局后显示胜负依据';
    ui.poemTicker.innerHTML = '';
    ui.poemDisplayTitle.textContent = '';
    ui.poemDisplayLines.innerHTML = '';

    updateStatus('黑棋先行。请点击交叉点落子。');
    renderTrash();
}

function clearBoardStones() {
    state.board.removeAllObjects();
}

function drawPositionFromGame() {
    state.board.removeAllObjects();

    for (let x = 0; x < BOARD_SIZE; x++) {
        for (let y = 0; y < BOARD_SIZE; y++) {
            const stone = state.game.getStone(x, y);
            if (stone === WGo.B) {
                state.board.addObject({x, y, c: WGo.B});
            } else if (stone === WGo.W) {
                state.board.addObject({x, y, c: WGo.W});
            }
        }
    }

    addPinStyleMarkers();
}

function handleBoardClick(x, y) {
    if (state.isGameOver) {
        updateStatus('对局已结束，请重新开始。');
        return;
    }

    if (state.isAiThinking) {
        updateStatus('电脑思考中，请稍候...');
        return;
    }

    if (state.mode === 'pvc' && state.game.turn === state.aiColor) {
        updateStatus('现在是电脑的回合。');
        return;
    }

    playMove(x, y, state.game.turn, true);
}

function playMove(x, y, color, allowAiAfter) {
    // Validate inputs
    if (x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) {
        showIllegalHint(1);
        return false;
    }

    const result = state.game.play(x, y, color);

    if (typeof result === 'number') {
        showIllegalHint(result);
        return false;
    }

    state.passCount = 0;
    state.moveCount += 1;

    if (result.length > 0) {
        if (color === WGo.B) {
            state.whiteTrash += result.length;
            state.whiteCapturedByBlack += result.length;
        } else {
            state.blackTrash += result.length;
            state.blackCapturedByWhite += result.length;
        }
    }

    drawPositionFromGame();
    renderTrash();

    const playerText = color === WGo.B ? '黑棋' : '白棋';
    updateStatus(result.length > 0 ? `${playerText} 提子 ${result.length} 枚。` : `${playerText} 落子成功。`);

    // Only trigger poetry for human players
    const isHumanMove = (state.mode === 'pvp') || (state.mode === 'pvc' && color === state.playerColor);
    if (isHumanMove) {
        triggerPoetryEffect(result.length > 0 ? 'capture' : 'move');
    }

    if (allowAiAfter && shouldAiPlay()) {
        triggerAiMove();
    }

    return true;
}

function onPass() {
    if (state.isGameOver || state.isAiThinking) return;

    if (state.mode === 'pvc' && state.game.turn === state.aiColor) return;

    applyPass(true);
}

function applyPass(allowAiAfter) {
    const passingColor = state.game.turn;
    state.game.pass(state.game.turn);
    state.passCount += 1;
    updateStatus('本手停一手。');

    // Only trigger poetry for human players
    const isHumanPass = (state.mode === 'pvp') || (state.mode === 'pvc' && passingColor === state.playerColor);
    if (isHumanPass) {
        triggerPoetryEffect('pass');
    }

    if (state.passCount >= 2) {
        finishGame();
        return;
    }

    if (allowAiAfter && shouldAiPlay()) {
        triggerAiMove();
    }
}

function shouldAiPlay() {
    return state.mode === 'pvc' && !state.isGameOver && state.game.turn === state.aiColor;
}

function triggerAiMove() {
    state.isAiThinking = true;
    updateStatus('电脑思考中...');

    setTimeout(() => {
        if (state.isGameOver) {
            state.isAiThinking = false;
            return;
        }

        // Double-check it's still AI's turn
        if (state.game.turn !== state.aiColor) {
            state.isAiThinking = false;
            updateStatus('回合状态异常，请重新开始。');
            return;
        }

        // Get smart candidate moves (filtered for sensible play)
        const legalMoves = generateSmartCandidates(state.aiColor, state.difficulty);

        if (!legalMoves.length) {
            // No legal moves, AI must pass
            applyPass(false);
            state.isAiThinking = false;
            return;
        }

        // Try moves until one succeeds
        let moved = false;
        const triedMoves = new Set();

        for (let attempt = 0; attempt < Math.min(legalMoves.length, 10); attempt++) {
            const aiDecision = chooseAiMoveFromList(legalMoves, state.difficulty, triedMoves);

            if (!aiDecision) {
                // No more moves to try
                break;
            }

            triedMoves.add(`${aiDecision.x},${aiDecision.y}`);

            const success = playMove(aiDecision.x, aiDecision.y, state.aiColor, false);
            if (success) {
                moved = true;
                break;
            }
        }

        if (!moved) {
            // All moves failed, pass
            applyPass(false);
        }

        state.isAiThinking = false;
    }, 220);
}

function chooseAiMoveFromList(moves, level, excludeSet) {
    // Filter out already tried moves
    const availableMoves = moves.filter(m => !excludeSet || !excludeSet.has(`${m.x},${m.y}`));
    if (!availableMoves.length) return null;

    // Always evaluate tactically - even low levels should not blunder away atari
    const scored = availableMoves.map((m) => ({...m, score: evaluateMove(m.x, m.y, state.aiColor, level)}));
    scored.sort((a, b) => b.score - a.score);

    // If top move has a clearly tactical score (capture/save), always take it
    if (scored.length > 0 && scored[0].score >= 100) {
        return {x: scored[0].x, y: scored[0].y};
    }

    // Lower levels: more randomness from a wider top pool
    let topN;
    if (level <= 2) topN = Math.min(12, scored.length);
    else if (level <= 4) topN = Math.min(8, scored.length);
    else if (level <= 6) topN = 5;
    else if (level <= 8) topN = 3;
    else topN = 2;

    const pool = scored.slice(0, topN);

    if (level >= 8) {
        let best = pool[0];
        let bestV = -Infinity;
        for (const move of pool) {
            const v = evaluateWithLookahead(move.x, move.y, state.aiColor, level >= 10 ? 2 : 1);
            if (v > bestV) {
                bestV = v;
                best = move;
            }
        }
        return {x: best.x, y: best.y};
    }

    return {x: randomPick(pool).x, y: randomPick(pool).y};
}

function chooseAiMove(level) {
    const legalMoves = collectLegalMoves(state.aiColor);
    if (!legalMoves.length) return null;
    return chooseAiMoveFromList(legalMoves, level, null);
}

function collectLegalMoves(color) {
    const moves = [];
    for (let x = 0; x < BOARD_SIZE; x++) {
        for (let y = 0; y < BOARD_SIZE; y++) {
            // Use isValid to check if the move is legal
            if (state.game.isValid(x, y, color)) {
                moves.push({x, y});
            }
        }
    }
    return moves;
}

function evaluateMove(x, y, color, level) {
    const beforePos = state.game.position;

    // Tactical scores computed BEFORE the move (on current board)
    const tactical = tacticalScore(beforePos, x, y, color);

    // Filling own real eye is almost always bad
    if (isEye(beforePos, x, y, color)) {
        return -5000;
    }

    const clone = cloneGame(state.game);
    const res = clone.play(x, y, color);
    if (typeof res === 'number') return -9999;

    const captureGain = res.length * 30;

    // Self-atari penalty: after the move, is our stone/group in atari?
    const afterPos = clone.position;
    const myGroup = findGroupAndLiberties(afterPos, x, y);
    let selfAtariPenalty = 0;
    if (myGroup.liberties.size === 1 && res.length === 0) {
        // Self-atari without capture - very bad, scaled by group size
        selfAtariPenalty = -40 - myGroup.stones.length * 25;
    } else if (myGroup.liberties.size === 2 && myGroup.stones.length >= 3) {
        // Borderline - mild penalty
        selfAtariPenalty = -3;
    }

    const libertyGain = Math.min(myGroup.liberties.size, 6) * 3;
    const centerBias = centerWeight(x, y);
    const connectBias = connectionWeight(afterPos, x, y, color);
    const threatBias = nearbyOpponentPressure(afterPos, x, y, -color);

    let score = tactical + captureGain + libertyGain + centerBias + connectBias + threatBias + selfAtariPenalty;

    if (level >= 6) score += edgeCornerBonus(x, y);
    if (level >= 7) score += territoryPotential(x, y, color);
    if (level >= 8) score += shapeStability(afterPos, x, y, color);

    // Tiny noise to avoid deterministic lockstep
    if (level <= 7) score += (Math.random() - 0.5) * 2;

    return score;
}

// === New tactical helpers ===

function neighbors4(x, y) {
    const result = [];
    if (x > 0) result.push([x - 1, y]);
    if (x < BOARD_SIZE - 1) result.push([x + 1, y]);
    if (y > 0) result.push([x, y - 1]);
    if (y < BOARD_SIZE - 1) result.push([x, y + 1]);
    return result;
}

// Find connected group and its liberties starting from (x,y)
function findGroupAndLiberties(position, x, y) {
    const color = position.get(x, y);
    if (!color) return {stones: [], liberties: new Set()};

    const stones = [];
    const liberties = new Set();
    const visited = new Set();
    const stack = [[x, y]];

    while (stack.length) {
        const [cx, cy] = stack.pop();
        const key = `${cx},${cy}`;
        if (visited.has(key)) continue;
        visited.add(key);
        stones.push([cx, cy]);

        for (const [nx, ny] of neighbors4(cx, cy)) {
            const s = position.get(nx, ny);
            if (s === 0) {
                liberties.add(`${nx},${ny}`);
            } else if (s === color && !visited.has(`${nx},${ny}`)) {
                stack.push([nx, ny]);
            }
        }
    }

    return {stones, liberties};
}

// Is (x,y) an eye for `color`? Empty point surrounded by same color
// with sufficient diagonal control to be a real eye.
function isEye(position, x, y, color) {
    if (position.get(x, y) !== 0) return false;

    // All orthogonal neighbors must be own color (or off-board)
    for (const [nx, ny] of neighbors4(x, y)) {
        const s = position.get(nx, ny);
        if (s !== color) return false;
    }
    // If we get here, no orthogonal opponent or empty - we have at least 4 friendly walls
    // (or fewer if at edge/corner). Now check diagonals.

    const isEdge = x === 0 || y === 0 || x === BOARD_SIZE - 1 || y === BOARD_SIZE - 1;
    let badDiag = 0;
    const diagonals = [[x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1], [x + 1, y + 1]];
    for (const [dx, dy] of diagonals) {
        if (dx < 0 || dy < 0 || dx >= BOARD_SIZE || dy >= BOARD_SIZE) continue;
        const s = position.get(dx, dy);
        if (s === -color) badDiag++;
    }

    // Edge: tolerate 0 enemy diagonals; center: tolerate 1
    return isEdge ? badDiag === 0 : badDiag <= 1;
}

// Compute tactical score on current board (before the move is played)
// Big bonus for capture (atari→take) and saving own atari group
function tacticalScore(position, x, y, color) {
    const opp = -color;
    let score = 0;

    // 1. Captures and atari threats on opponent groups
    const seenOpp = new Set();
    for (const [nx, ny] of neighbors4(x, y)) {
        if (position.get(nx, ny) !== opp) continue;
        const startKey = `${nx},${ny}`;
        if (seenOpp.has(startKey)) continue;
        const g = findGroupAndLiberties(position, nx, ny);
        for (const s of g.stones) seenOpp.add(`${s[0]},${s[1]}`);
        // Move at (x,y) removes this point from the group's liberties
        if (g.liberties.has(`${x},${y}`)) {
            const remaining = g.liberties.size - 1;
            if (remaining === 0) {
                // Capture!
                score += 80 + g.stones.length * 60;
            } else if (remaining === 1) {
                // Putting opponent in atari - they may try to escape
                score += 6 + g.stones.length * 10;
            } else if (remaining === 2 && g.stones.length >= 4) {
                // Reducing liberties of large group
                score += g.stones.length * 2;
            }
        }
    }

    // 2. Saving own atari groups by extending/connecting
    const seenOwn = new Set();
    for (const [nx, ny] of neighbors4(x, y)) {
        if (position.get(nx, ny) !== color) continue;
        const startKey = `${nx},${ny}`;
        if (seenOwn.has(startKey)) continue;
        const g = findGroupAndLiberties(position, nx, ny);
        for (const s of g.stones) seenOwn.add(`${s[0]},${s[1]}`);
        if (g.liberties.size === 1 && g.liberties.has(`${x},${y}`)) {
            // This neighbor group has only this liberty - extending it
            // Reward proportional to group size
            score += 50 + g.stones.length * 35;
        } else if (g.liberties.size === 2) {
            // Connecting to a 2-liberty group adds support
            score += 4 + g.stones.length * 2;
        }
    }

    return score;
}

// Generate smart candidate moves: only consider moves near existing stones
// in the early/middle game, and filter out clearly bad moves.
function generateSmartCandidates(color, level) {
    const position = state.game.position;
    const candidates = [];
    const seen = new Set();

    // Count stones to determine game phase
    let stoneCount = 0;
    for (let x = 0; x < BOARD_SIZE; x++) {
        for (let y = 0; y < BOARD_SIZE; y++) {
            if (position.get(x, y) !== 0) stoneCount++;
        }
    }

    // Empty board: play near star points
    if (stoneCount === 0) {
        const openings = [
            {x: 3, y: 3}, {x: 3, y: 15}, {x: 15, y: 3}, {x: 15, y: 15},
            {x: 9, y: 9}, {x: 3, y: 9}, {x: 9, y: 3}, {x: 15, y: 9}, {x: 9, y: 15}
        ];
        return openings.filter(m => state.game.isValid(m.x, m.y, color));
    }

    // Stone count low: also include star points + radius
    const radius = stoneCount < 6 ? 4 : 2;

    // Add neighbors of all stones within radius
    for (let x = 0; x < BOARD_SIZE; x++) {
        for (let y = 0; y < BOARD_SIZE; y++) {
            if (position.get(x, y) === 0) continue;
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dy = -radius; dy <= radius; dy++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= BOARD_SIZE || ny >= BOARD_SIZE) continue;
                    if (position.get(nx, ny) !== 0) continue;
                    const key = `${nx},${ny}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    if (state.game.isValid(nx, ny, color)) {
                        candidates.push({x: nx, y: ny});
                    }
                }
            }
        }
    }

    // Always consider star points if still empty (early game expansion)
    if (stoneCount < 12) {
        const stars = [
            [3, 3], [3, 9], [3, 15], [9, 3], [9, 9], [9, 15], [15, 3], [15, 9], [15, 15]
        ];
        for (const [sx, sy] of stars) {
            const key = `${sx},${sy}`;
            if (!seen.has(key) && position.get(sx, sy) === 0 && state.game.isValid(sx, sy, color)) {
                seen.add(key);
                candidates.push({x: sx, y: sy});
            }
        }
    }

    // Filter: remove moves that fill own real eye
    const filtered = candidates.filter(m => !isEye(position, m.x, m.y, color));

    // If level is decent and we have many candidates, also reject obvious self-atari
    if (level >= 4 && filtered.length > 8) {
        const safe = filtered.filter(m => !wouldBeBareSelfAtari(position, m.x, m.y, color));
        if (safe.length > 0) return safe;
    }

    return filtered.length > 0 ? filtered : candidates;
}

// Check if playing at (x,y) would create a bare self-atari (1-liberty group, no capture)
function wouldBeBareSelfAtari(position, x, y, color) {
    const opp = -color;
    // If this move captures anything, it's not a bare self-atari
    for (const [nx, ny] of neighbors4(x, y)) {
        if (position.get(nx, ny) !== opp) continue;
        const g = findGroupAndLiberties(position, nx, ny);
        if (g.liberties.size === 1 && g.liberties.has(`${x},${y}`)) return false;
    }

    // Simulate placement and check resulting liberties
    // Count liberties: empty neighbors of (x,y) + liberties of connecting friendly groups (excluding x,y)
    const liberties = new Set();
    for (const [nx, ny] of neighbors4(x, y)) {
        const s = position.get(nx, ny);
        if (s === 0) liberties.add(`${nx},${ny}`);
        else if (s === color) {
            const g = findGroupAndLiberties(position, nx, ny);
            for (const lib of g.liberties) {
                if (lib !== `${x},${y}`) liberties.add(lib);
            }
        }
    }
    return liberties.size <= 1;
}

function evaluateWithLookahead(x, y, color, depth) {
    const after = cloneGame(state.game);
    const first = after.play(x, y, color);
    if (typeof first === 'number') return -9999;

    // Check if our just-played group is now in atari and will be captured
    const myGroupAfter = findGroupAndLiberties(after.position, x, y);
    let selfDanger = 0;
    if (myGroupAfter.liberties.size === 1 && first.length === 0) {
        // Opponent can capture us next move
        selfDanger = -50 - myGroupAfter.stones.length * 30;
    }

    let score = first.length * 30 + estimateBoardAdvantage(after, color) + selfDanger;
    if (depth <= 0) return score;

    // Look at opponent's best tactical replies (capture/atari focused)
    const opp = -color;
    const oppCandidates = generateSmartCandidatesFromGame(after, opp).slice(0, 18);
    if (!oppCandidates.length) return score + 8;

    let worstReply = Infinity;
    for (const m of oppCandidates) {
        const next = cloneGame(after);
        const rr = next.play(m.x, m.y, opp);
        if (typeof rr === 'number') continue;
        // Opponent's tactical bonus = our loss
        const oppTactical = tacticalScore(after.position, m.x, m.y, opp);
        const val = estimateBoardAdvantage(next, color) - rr.length * 30 - oppTactical * 0.6;
        if (val < worstReply) worstReply = val;
    }

    if (worstReply === Infinity) worstReply = score;
    return score + worstReply * 0.5;
}

function generateSmartCandidatesFromGame(game, color) {
    const position = game.position;
    const candidates = [];
    const seen = new Set();
    for (let x = 0; x < BOARD_SIZE; x++) {
        for (let y = 0; y < BOARD_SIZE; y++) {
            if (position.get(x, y) === 0) continue;
            for (let dx = -2; dx <= 2; dx++) {
                for (let dy = -2; dy <= 2; dy++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= BOARD_SIZE || ny >= BOARD_SIZE) continue;
                    if (position.get(nx, ny) !== 0) continue;
                    const key = `${nx},${ny}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    if (game.isValid(nx, ny, color) && !isEye(position, nx, ny, color)) {
                        candidates.push({x: nx, y: ny});
                    }
                }
            }
        }
    }
    return candidates;
}

function collectLegalMovesFromGame(game, color) {
    const moves = [];
    for (let x = 0; x < BOARD_SIZE; x++) {
        for (let y = 0; y < BOARD_SIZE; y++) {
            if (game.isValid(x, y, color)) {
                moves.push({x, y});
            }
        }
    }
    return moves;
}

function cloneGame(source) {
    const g = new WGo.Game(BOARD_SIZE, 'KO', false, false);
    g.stack = source.stack.map((pos) => {
        const cp = pos.clone();
        cp.capCount = {black: pos.capCount.black, white: pos.capCount.white};
        cp.color = pos.color;
        return cp;
    });
    g.turn = source.turn;
    return g;
}

function estimateLiberties(position, x, y) {
    const color = position.get(x, y);
    if (!color) return 0;

    const visited = new Set();
    const liberties = new Set();
    const queue = [[x, y]];

    while (queue.length) {
        const [cx, cy] = queue.pop();
        const key = `${cx},${cy}`;
        if (visited.has(key)) continue;
        visited.add(key);

        const neighbors = [
            [cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]
        ];

        for (const [nx, ny] of neighbors) {
            if (nx < 0 || ny < 0 || nx >= BOARD_SIZE || ny >= BOARD_SIZE) continue;
            const stone = position.get(nx, ny);
            if (stone === 0) liberties.add(`${nx},${ny}`);
            if (stone === color && !visited.has(`${nx},${ny}`)) queue.push([nx, ny]);
        }
    }

    return liberties.size;
}

function centerWeight(x, y) {
    const center = (BOARD_SIZE - 1) / 2;
    const dist = Math.abs(x - center) + Math.abs(y - center);
    return Math.max(0, 14 - dist);
}

function connectionWeight(position, x, y, color) {
    const neighbors = [
        [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]
    ];
    let c = 0;
    for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= BOARD_SIZE || ny >= BOARD_SIZE) continue;
        if (position.get(nx, ny) === color) c += 3;
    }
    return c;
}

function nearbyOpponentPressure(position, x, y, opponentColor) {
    const neighbors = [
        [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]
    ];
    let p = 0;
    for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= BOARD_SIZE || ny >= BOARD_SIZE) continue;
        if (position.get(nx, ny) === opponentColor) p += 1.6;
    }
    return p;
}

function edgeCornerBonus(x, y) {
    const edge = x === 0 || y === 0 || x === BOARD_SIZE - 1 || y === BOARD_SIZE - 1;
    const nearEdge = x <= 2 || y <= 2 || x >= BOARD_SIZE - 3 || y >= BOARD_SIZE - 3;
    if (edge) return -2;
    if (nearEdge) return 1;
    return 0;
}

function territoryPotential(x, y, color) {
    const cornerStar = (
        (x === 3 && y === 3) || (x === 3 && y === 15) ||
        (x === 15 && y === 3) || (x === 15 && y === 15)
    );
    const sideStar = (
        (x === 3 && y === 9) || (x === 9 && y === 3) ||
        (x === 15 && y === 9) || (x === 9 && y === 15)
    );
    if (cornerStar) return color === WGo.W ? 4 : 3;
    if (sideStar) return 2;
    return 0;
}

function shapeStability(position, x, y, color) {
    let val = 0;
    const diagonals = [
        [x + 1, y + 1], [x + 1, y - 1], [x - 1, y + 1], [x - 1, y - 1]
    ];
    for (const [nx, ny] of diagonals) {
        if (nx < 0 || ny < 0 || nx >= BOARD_SIZE || ny >= BOARD_SIZE) continue;
        if (position.get(nx, ny) === color) val += 1.2;
    }
    return val;
}

function estimateBoardAdvantage(game, color) {
    const s = calculateScore(game);
    const diff = (color === WGo.B)
        ? (s.blackTotal - s.whiteTotal)
        : (s.whiteTotal - s.blackTotal);
    return diff;
}

function calculateScore(gameObj = state.game) {
    let blackStones = 0;
    let whiteStones = 0;
    let blackTerritory = 0;
    let whiteTerritory = 0;

    const visited = Array.from({length: BOARD_SIZE}, () => Array(BOARD_SIZE).fill(false));

    for (let x = 0; x < BOARD_SIZE; x++) {
        for (let y = 0; y < BOARD_SIZE; y++) {
            const stone = gameObj.getStone(x, y);
            if (stone === WGo.B) blackStones += 1;
            if (stone === WGo.W) whiteStones += 1;

            if (stone === 0 && !visited[x][y]) {
                const area = floodEmptyArea(gameObj, x, y, visited);
                if (area.owner === WGo.B) blackTerritory += area.points;
                if (area.owner === WGo.W) whiteTerritory += area.points;
            }
        }
    }

    const blackCaptures = gameObj.getCaptureCount(WGo.B);
    const whiteCaptures = gameObj.getCaptureCount(WGo.W);

    const blackTotal = blackStones + blackTerritory + blackCaptures;
    const whiteTotal = whiteStones + whiteTerritory + whiteCaptures;

    return {
        blackStones,
        whiteStones,
        blackTerritory,
        whiteTerritory,
        blackCaptures,
        whiteCaptures,
        blackTotal,
        whiteTotal
    };
}

function floodEmptyArea(gameObj, sx, sy, visited) {
    const queue = [[sx, sy]];
    let points = 0;
    const borders = new Set();

    while (queue.length) {
        const [x, y] = queue.pop();
        if (x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) continue;
        if (visited[x][y]) continue;
        if (gameObj.getStone(x, y) !== 0) continue;

        visited[x][y] = true;
        points += 1;

        const dirs = [
            [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]
        ];

        for (const [nx, ny] of dirs) {
            if (nx < 0 || ny < 0 || nx >= BOARD_SIZE || ny >= BOARD_SIZE) continue;
            const stone = gameObj.getStone(nx, ny);
            if (stone === 0 && !visited[nx][ny]) {
                queue.push([nx, ny]);
            } else if (stone !== 0) {
                borders.add(stone);
            }
        }
    }

    let owner = 0;
    if (borders.size === 1) owner = [...borders][0];

    return {points, owner};
}

// 中国规则贴目：白棋贴3.75子（相当于7.5目）
const KOMI = 3.75;

function finishGame() {
    state.isGameOver = true;

    const score = calculateScore();
    // 黑棋总分 - (白棋总分 + 贴目)
    const diff = score.blackTotal - (score.whiteTotal + KOMI);

    let winner;
    if (diff > 0) winner = WGo.B;
    else if (diff < 0) winner = WGo.W;
    else winner = 0;

    const mode = state.mode;
    let winnerText = '平局';

    if (winner !== 0) {
        if (mode === 'pvc') {
            if (winner === state.aiColor) winnerText = '电脑赢了';
            else winnerText = '你赢了';
        } else {
            winnerText = winner === WGo.B ? '黑棋赢了' : '白棋赢了';
        }
    }

    ui.winnerBanner.textContent = winnerText;
    ui.winnerBanner.classList.remove('hidden');

    ui.scoreDetail.innerHTML = [
        `黑棋：子 ${score.blackStones} + 地 ${score.blackTerritory} + 提子 ${score.blackCaptures} = ${score.blackTotal}`,
        `白棋：子 ${score.whiteStones} + 地 ${score.whiteTerritory} + 提子 ${score.whiteCaptures} + 贴目 ${KOMI} = ${(score.whiteTotal + KOMI).toFixed(2)}`,
        `胜负差：${Math.abs(diff).toFixed(2)}`
    ].join('<br>');

    triggerPoetryEffect('round_end');

    updateStatus('对局结束。胜负已判定。');
}

function renderTrash() {
    ui.blackTrash.innerHTML = createTrashHtml('black', state.blackTrash);
    ui.whiteTrash.innerHTML = createTrashHtml('white', state.whiteTrash);
}

function createTrashHtml(color, count) {
    const maxRender = Math.min(count, 120);
    const dots = Array.from({length: maxRender}, () => `<span class="trash-stone ${color}"></span>`).join('');
    const more = count > maxRender ? `<span>+${count - maxRender}</span>` : '';
    return dots + more;
}

function updateStatus(hint) {
    ui.currentPlayer.textContent = state.game.turn === WGo.B ? '黑棋' : '白棋';
    ui.moveCount.textContent = String(state.moveCount);
    ui.blackCaptures.textContent = String(state.game.getCaptureCount(WGo.B));
    ui.whiteCaptures.textContent = String(state.game.getCaptureCount(WGo.W));
    ui.passCount.textContent = String(state.passCount);

    if (state.isGameOver) {
        ui.passBtn.disabled = true;
    } else {
        ui.passBtn.disabled = false;
    }

    ui.hintText.textContent = hint;
}

function showIllegalHint(code) {
    if (code === 1) updateStatus('超出棋盘范围。');
    else if (code === 2) updateStatus('该交叉点已有棋子。');
    else if (code === 3) updateStatus('禁入点（自杀手），不可落子。');
    else if (code === 4) updateStatus('触发劫争禁着，不可立即提回。');
    else updateStatus('非法落子。');
}

function triggerPoetryEffect(triggerType) {
    if (!state.poemTriggers[triggerType]) return;

    const poems = Array.isArray(window.TANG_POEMS) ? window.TANG_POEMS : [];
    if (!poems.length) return;

    let textToSpeak = null;
    let isNewPoem = false;
    let lineText = null;
    let poemFinished = false;

    if (!state.currentPoem) {
        const poem = pickNextPoem(poems);
        if (!poem) return;
        state.currentPoem = poem;
        state.currentPoemLineIndex = 0;
        state.currentPoemColor = pickPoemColor();
        isNewPoem = true;
        // Title with dynasty and author: "静夜思，唐，李白"
        textToSpeak = `${poem.title}，${poem.dynasty}，${poem.author}`;
    } else {
        const poem = state.currentPoem;
        const lines = Array.isArray(poem.lines) ? poem.lines : [];
        if (state.currentPoemLineIndex < lines.length) {
            textToSpeak = lines[state.currentPoemLineIndex];
            lineText = textToSpeak;
            state.currentPoemLineIndex += 1;
            // Check if this is the last line
            if (state.currentPoemLineIndex >= lines.length) {
                poemFinished = true;
            }
        } else {
            // Current poem is finished, pick next
            const nextPoem = pickNextPoem(poems);
            if (!nextPoem) return;
            state.currentPoem = nextPoem;
            state.currentPoemLineIndex = 0;
            state.currentPoemColor = pickPoemColor();
            isNewPoem = true;
            textToSpeak = `${nextPoem.title}，${nextPoem.dynasty}，${nextPoem.author}`;
        }
    }

    if (!textToSpeak) return;

    // Save finished poem to Local Storage
    if (poemFinished && state.currentPoem) {
        const key = state.currentPoem.id || state.currentPoem.title;
        saveReadPoemKey(key);
    }

    // Update the poem display panel
    if (isNewPoem) {
        // Clear and show title for new poem
        const poem = state.currentPoem;
        ui.poemDisplayTitle.textContent = `${poem.title} - ${poem.dynasty}·${poem.author}`;
        ui.poemDisplayLines.innerHTML = '';
    } else if (lineText) {
        // Add line to the display
        const lineEl = document.createElement('div');
        lineEl.className = 'poem-display-line';
        lineEl.textContent = lineText;
        lineEl.style.color = state.currentPoemColor;
        ui.poemDisplayLines.appendChild(lineEl);
    }

    queuePoetrySpeech(textToSpeak, state.currentPoemColor);
}

function pickNextPoem(poems) {
    if (!poems.length) return null;

    // Get read poems from Local Storage
    const readPoemKeys = getReadPoemKeys();

    // Filter out already read poems
    const unreadPoems = poems.filter(poem => {
        const key = poem.id || poem.title;
        return !readPoemKeys.includes(key);
    });

    // If all poems have been read, allow re-reading from the full set.
    // Do NOT clear storage — read history must persist.
    const candidatePoems = unreadPoems.length > 0 ? unreadPoems : poems;

    // Try to pick a poem different from the last one
    for (let i = 0; i < 5; i++) {
        const poem = randomPick(candidatePoems);
        if (!poem) continue;
        const key = poem.id || poem.title;
        if (key && key !== state.lastRandomKey) {
            state.lastRandomKey = key;
            return poem;
        }
    }

    const fallback = randomPick(candidatePoems);
    if (fallback) state.lastRandomKey = fallback.id || fallback.title;
    return fallback;
}

function getReadPoemKeys() {
    try {
        const stored = localStorage.getItem('weiqi_read_poems');
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        return [];
    }
}

function saveReadPoemKey(key) {
    try {
        const keys = getReadPoemKeys();
        if (!keys.includes(key)) {
            // Cap at 300 entries; when full, drop the oldest to make room.
            // History persists across sessions and across games.
            if (keys.length >= 300) {
                keys.shift();
            }
            keys.push(key);
            localStorage.setItem('weiqi_read_poems', JSON.stringify(keys));
        }
    } catch (e) {
        // Ignore storage errors
    }
}

function clearReadPoemKeys() {
    try {
        localStorage.removeItem('weiqi_read_poems');
    } catch (e) {
        // Ignore storage errors
    }
}

function pickPoemColor() {
    const colors = ['#e11d48', '#2563eb', '#16a34a', '#b45309', '#7c3aed', '#0f766e', '#be123c', '#1d4ed8'];
    return colors[Math.floor(Math.random() * colors.length)];
}

function queuePoetrySpeech(lineText, color) {
    state.poemQueue.push({text: lineText, color});
    if (!state.speaking) {
        consumePoetryQueue();
    }
}

function consumePoetryQueue() {
    const item = state.poemQueue.shift();
    if (!item) {
        state.speaking = false;
        return;
    }

    state.speaking = true;

    const afterExit = () => {
        showPoemAtCenter(item.text, item.color);
        speakSingleLine(item.text, () => {
            state.speaking = false;
            consumePoetryQueue();
        });
    };

    if (state.currentPoemLineEl) {
        exitCurrentPoemThen(afterExit);
    } else {
        afterExit();
    }
}

function speakSingleLine(text, done) {
    if (!state.speechEnabled) {
        setTimeout(done, 120);
        return;
    }

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-CN';
    utter.rate = state.speechRate;
    utter.volume = 1;

    // 根据声音类型设置参数
    switch (state.voiceType) {
        case 'female':
            utter.pitch = 1.3;
            utter.rate = state.speechRate * 0.95;
            break;
        case 'male':
            utter.pitch = 0.85;
            utter.rate = state.speechRate * 1.0;
            break;
        case 'robot':
            utter.pitch = 0.5;
            utter.rate = state.speechRate * 1.2;
            break;
        default:
            utter.pitch = 1;
    }

    // 尝试匹配系统声音
    const voices = window.speechSynthesis.getVoices();
    const voiceMap = getVoiceMap(voices);

    if (voiceMap[state.voiceType]) {
        utter.voice = voiceMap[state.voiceType];
    } else if (voices.length > 0) {
        // 尝试找中文声音
        const zhVoice = voices.find(v => v.lang.includes('zh'));
        if (zhVoice) utter.voice = zhVoice;
    }

    utter.onend = () => setTimeout(done, 120);
    utter.onerror = () => setTimeout(done, 120);

    window.speechSynthesis.speak(utter);
}

function getVoiceMap(voices) {
    const map = {
        female: null,
        male: null,
        robot: null,
        default: null
    };

    for (const voice of voices) {
        const name = voice.name.toLowerCase();
        const lang = voice.lang.toLowerCase();

        // 只处理中文声音
        if (!lang.includes('zh') && !lang.includes('cn')) continue;

        // 甜美女生：寻找女声关键词
        if (name.includes('female') || name.includes('woman') || name.includes('girl') ||
            name.includes('女') || name.includes('xiaoxiao') || name.includes('tingting') ||
            name.includes('yaoyao') || name.includes('huihui')) {
            if (!map.female) map.female = voice;
        }

        // 阳光男生：寻找男声关键词
        if (name.includes('male') || name.includes('man') || name.includes('boy') ||
            name.includes('男') || name.includes('kangkang') || name.includes('david')) {
            if (!map.male) map.male = voice;
        }

        // 机器人：寻找合成声音
        if (name.includes('robot') || name.includes('synth') || name.includes('google')) {
            if (!map.robot) map.robot = voice;
        }
    }

    return map;
}

function showPoemAtCenter(text, color) {
    const line = document.createElement('div');
    line.className = 'poem-line enter-hold';
    line.textContent = text;
    line.style.color = color || '#1f2937';

    ui.poemTicker.appendChild(line);
    state.currentPoemLineEl = line;
}

function exitCurrentPoemThen(done) {
    const el = state.currentPoemLineEl;
    if (!el) {
        done();
        return;
    }

    el.classList.remove('enter-hold');
    el.classList.add('exit-left');

    const finish = () => {
        if (el.parentNode) el.parentNode.removeChild(el);
        if (state.currentPoemLineEl === el) state.currentPoemLineEl = null;
        done();
    };

    el.addEventListener('animationend', finish, { once: true });
}

function randomPick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

init();
