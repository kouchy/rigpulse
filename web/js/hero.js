/**
 * RigPulse — Hero Brand Badge Controller (js/hero.js)
 * 
 * Manages high-fidelity retro arcade animations:
 * - 8-bit Mario with dynamic running vs jumping split legs
 * - Pixel Pac-Man with periodic pellet-eating bursts (dots slide into mouth)
 * - Authentic Tetris baseline cluster with sliding block and 3-pulse line-clear flash
 * - Radioactive Half-Life Lambda with subtle synthwave gradient and ionization shockwaves
 * - Hyper-speed laser streaks and interactive action hooks (WOL, Sleep, Online, GPU mode).
 */

import { state } from './state.js';

let heroBadgeEl = null;
let heroTitleEl = null;
let heroSubtitleEl = null;
let marioEl = null;
let marioWrapEl = null;
let starEl = null;
let pacmanWrapEl = null;
let tetrisClusterEl = null;
let lambdaWrapEl = null;
let speedlinesWrapEl = null;

let arcadeTimer = null;
let isAnyArcadeAnimating = false;
let lastHeroPicked = null;
let lastPowerStateKey = null;

let isMarioJumping = false;
let isPacmanEating = false;
let isTetrisClearing = false;
let isWarpActive = false;
let currentGpuMode = 'eco';

// ── Mario Jump Sequence (Periodic, Staggered, Animated Legs) ───────────
export function triggerMarioJumpSequence(isSuperJump = false, onComplete = null) {
    if (!marioEl || isMarioJumping || !state.machineIsUp) return;
    isMarioJumping = true;
    isAnyArcadeAnimating = true;

    // 1. Crouch down before leaping
    marioEl.style.transform = 'translateY(2px)';
    marioEl.setAttribute('data-pose', 'run');

    setTimeout(() => {
        if (!marioEl || !state.machineIsUp) {
            isMarioJumping = false;
            isAnyArcadeAnimating = false;
            if (typeof onComplete === 'function') onComplete();
            return;
        }
        // 2. Launch into the air (Legs switch to split-kick, star flashes)
        marioEl.style.transform = isSuperJump ? 'translateY(-20px)' : 'translateY(-14px)';
        marioEl.setAttribute('data-pose', 'jump');
        if (starEl) starEl.classList.add('active');

        // 3. Apex hang
        setTimeout(() => {
            if (!marioEl || !state.machineIsUp) {
                isMarioJumping = false;
                isAnyArcadeAnimating = false;
                if (typeof onComplete === 'function') onComplete();
                return;
            }
            marioEl.style.transform = isSuperJump ? 'translateY(-22px)' : 'translateY(-16px)';

            // 4. Descend
            setTimeout(() => {
                if (!marioEl || !state.machineIsUp) {
                    isMarioJumping = false;
                    isAnyArcadeAnimating = false;
                    if (typeof onComplete === 'function') onComplete();
                    return;
                }
                marioEl.style.transform = 'translateY(-6px)';

                // 5. Touchdown (Legs switch back to ground running pose, star turns off)
                setTimeout(() => {
                    if (!marioEl) {
                        isMarioJumping = false;
                        isAnyArcadeAnimating = false;
                        if (typeof onComplete === 'function') onComplete();
                        return;
                    }
                    if (!state.machineIsUp) {
                        marioEl.style.transform = 'none';
                        marioEl.setAttribute('data-pose', 'run');
                        if (starEl) starEl.classList.remove('active');
                        isMarioJumping = false;
                        isAnyArcadeAnimating = false;
                        if (typeof onComplete === 'function') onComplete();
                        return;
                    }
                    marioEl.style.transform = 'translateY(1px)';
                    marioEl.setAttribute('data-pose', 'run');
                    if (starEl) starEl.classList.remove('active');

                    // 6. Upright ground rest
                    setTimeout(() => {
                        if (marioEl) marioEl.style.transform = 'none';
                        isMarioJumping = false;
                        isAnyArcadeAnimating = false;

                        if (typeof onComplete === 'function') {
                            onComplete();
                        } else if (state.machineIsUp) {
                            scheduleNextArcadeAction();
                        }
                    }, 140);
                }, 180);
            }, 260);
        }, 300);
    }, 120);
}

// ── Pac-Man Pellet Intake Sequence (Periodic Chomping) ─────────────────
export function triggerPacmanEatSequence(onComplete = null) {
    if (!pacmanWrapEl || isPacmanEating || !state.machineIsUp) return;
    isPacmanEating = true;
    isAnyArcadeAnimating = true;

    // Add .eating class -> mouth chomps and dots slide into mouth
    pacmanWrapEl.classList.add('eating');

    // Chomp for 2.24s (approx 4 bites & dots ingested)
    setTimeout(() => {
        if (pacmanWrapEl) {
            pacmanWrapEl.classList.remove('eating');
        }
        isPacmanEating = false;
        isAnyArcadeAnimating = false;

        if (typeof onComplete === 'function') {
            onComplete();
        } else if (state.machineIsUp) {
            scheduleNextArcadeAction();
        }
    }, 2240);
}

// ── Tetris Line Sequence (Slide left -> 2 Simultaneous Pulses -> Slide Return) ────
export function triggerTetrisClearSequence(onComplete = null) {
    if (!tetrisClusterEl || isTetrisClearing || !state.machineIsUp) return;
    isTetrisClearing = true;
    isAnyArcadeAnimating = true;

    // Reset and trigger full line-clear sequence
    tetrisClusterEl.classList.remove('line-clear-flash');
    void tetrisClusterEl.offsetWidth; // Force reflow
    tetrisClusterEl.classList.add('line-clear-flash');

    // 1.1s total animation sequence
    setTimeout(() => {
        if (tetrisClusterEl) {
            tetrisClusterEl.classList.remove('line-clear-flash');
        }
        isTetrisClearing = false;
        isAnyArcadeAnimating = false;

        if (typeof onComplete === 'function') {
            onComplete();
        } else if (state.machineIsUp) {
            scheduleNextArcadeAction();
        }
    }, 1140);
}

// ── Unified Random Arcade Animation Dispatcher ─────────────────────────
function scheduleNextArcadeAction(minMs = 3800, maxMs = 8200) {
    clearTimeout(arcadeTimer);
    arcadeTimer = null;

    if (!state.machineIsUp) return;
    if (currentGpuMode === 'light' || currentGpuMode === 'ultralight') return;

    // Random interval latency between actions (organic arcade feel)
    const delay = minMs + Math.random() * (maxMs - minMs);
    arcadeTimer = setTimeout(() => {
        executeRandomArcadeAction();
    }, delay);
}

function executeRandomArcadeAction() {
    if (!state.machineIsUp || isAnyArcadeAnimating) {
        if (state.machineIsUp) scheduleNextArcadeAction(2500, 4500);
        return;
    }
    if (currentGpuMode === 'light' || currentGpuMode === 'ultralight') return;

    // Random choice among mario, pacman, tetris, avoiding immediate repeat if possible
    const candidates = ['mario', 'pacman', 'tetris'];
    const filtered = candidates.filter(c => c !== lastHeroPicked);
    const chosen = filtered.length > 0
        ? filtered[Math.floor(Math.random() * filtered.length)]
        : candidates[Math.floor(Math.random() * candidates.length)];
    lastHeroPicked = chosen;

    const onComplete = () => {
        if (state.machineIsUp) {
            scheduleNextArcadeAction(4000, 8500);
        }
    };

    if (chosen === 'mario') {
        triggerMarioJumpSequence(false, onComplete);
    } else if (chosen === 'pacman') {
        triggerPacmanEatSequence(onComplete);
    } else if (chosen === 'tetris') {
        triggerTetrisClearSequence(onComplete);
    }
}

// ── Public Initialization ──────────────────────────────────────────────
export function initHero() {
    heroBadgeEl      = document.getElementById('hero-badge');
    heroTitleEl      = document.getElementById('hero-title');
    heroSubtitleEl   = document.getElementById('hero-subtitle');
    marioEl          = document.getElementById('hero-mario-sprite');
    marioWrapEl      = heroBadgeEl ? heroBadgeEl.querySelector('.hero-mario-wrap') : null;
    starEl           = document.getElementById('hero-mario-star');
    pacmanWrapEl     = document.getElementById('hero-pacman-wrap');
    tetrisClusterEl  = document.getElementById('hero-tetris-cluster');
    lambdaWrapEl     = document.getElementById('hero-lambda-wrap');
    speedlinesWrapEl = document.getElementById('hero-speedlines');

    if (heroBadgeEl) {
        if (heroTitleEl) {
            const initialLen = (heroTitleEl.textContent || 'RIGPULSE').trim().length;
            heroBadgeEl.style.setProperty('--name-len', String(initialLen || 8));
        }
        setupInteractions();
        setHeroMode(state.gpuMode || 'eco');
        startSpriteLoops();
    }
}

function setupInteractions() {
    // Click / touch hooks for delightful tactile feedback (only when machine is online)
    if (marioWrapEl) {
        marioWrapEl.addEventListener('click', () => {
            if (!state.machineIsUp || isAnyArcadeAnimating) return;
            triggerMarioJumpSequence(true);
        });
    }
    if (pacmanWrapEl) {
        pacmanWrapEl.addEventListener('click', () => {
            if (!state.machineIsUp || isAnyArcadeAnimating) return;
            triggerPacmanEatSequence();
        });
    }
    if (tetrisClusterEl) {
        tetrisClusterEl.addEventListener('click', () => {
            if (!state.machineIsUp || isAnyArcadeAnimating) return;
            triggerTetrisClearSequence();
        });
    }
    if (lambdaWrapEl) {
        lambdaWrapEl.addEventListener('click', () => {
            if (!state.machineIsUp) return;
            triggerRadiationPulse();
        });
    }
}

function startSpriteLoops() {
    if (!state.machineIsUp) return;
    if (currentGpuMode === 'light' || currentGpuMode === 'ultralight') return;

    // Do not cancel or restart if a timer or animation is already active
    if (arcadeTimer || isAnyArcadeAnimating) return;

    scheduleNextArcadeAction(1800, 3600);
}

// ── Public Setters ─────────────────────────────────────────────────────
export function setHeroName(name) {
    if (!name) name = 'RIGPULSE';
    const upper = name.toUpperCase();
    if (heroTitleEl) {
        heroTitleEl.textContent = upper;
        heroTitleEl.setAttribute('data-text', upper);
        if (heroBadgeEl) {
            heroBadgeEl.style.setProperty('--name-len', String(upper.length));
        }
    }
}

export function setHeroDomain(domain) {
    if (heroSubtitleEl) {
        heroSubtitleEl.textContent = (domain || '').toUpperCase();
    }
}

export function setHeroState(isUp, isBooting, isSleeping = false) {
    if (!heroBadgeEl) return;

    const isOnline = Boolean(isUp);
    const isBoot = Boolean(isBooting);
    const isSleep = !isOnline && !isBoot && Boolean(isSleeping);
    const isOff = !isOnline && !isBoot && !isSleep;

    const currentKey = `${isOnline}_${isBoot}_${isSleep}_${isOff}`;
    const stateChanged = (currentKey !== lastPowerStateKey);
    lastPowerStateKey = currentKey;

    heroBadgeEl.classList.toggle('online', isOnline);
    heroBadgeEl.classList.toggle('booting', isBoot);
    heroBadgeEl.classList.toggle('offline', !isOnline && !isBoot);
    heroBadgeEl.classList.toggle('sleeping', isSleep);
    heroBadgeEl.classList.toggle('off', isOff);

    if (isOnline) {
        if (stateChanged || (!arcadeTimer && !isAnyArcadeAnimating)) {
            startSpriteLoops();
        }
    } else {
        // When not online (sleeping or off): no periodic timers for any hero
        clearTimeout(arcadeTimer);
        arcadeTimer = null;

        isMarioJumping = false;
        isPacmanEating = false;
        isTetrisClearing = false;
        isAnyArcadeAnimating = false;

        if (marioEl) {
            marioEl.style.transform = 'none';
            marioEl.setAttribute('data-pose', 'run');
        }
        if (starEl) {
            starEl.classList.remove('active');
        }
        if (pacmanWrapEl) {
            pacmanWrapEl.classList.remove('eating');
        }
        if (tetrisClusterEl) {
            tetrisClusterEl.classList.remove('tetris-sliding', 'line-clear-flash');
        }
    }
}

export function setHeroMode(mode) {
    currentGpuMode = mode;
    if (!heroBadgeEl) return;

    heroBadgeEl.classList.remove('hero-mode-heavy', 'hero-mode-eco', 'hero-mode-light');
    heroBadgeEl.classList.add(`hero-mode-${mode}`);

    if (mode === 'light' || mode === 'ultralight') {
        clearTimeout(arcadeTimer);
        arcadeTimer = null;
    } else if (state.machineIsUp) {
        startSpriteLoops();
    }
}

// ── Interactive Action Triggers ────────────────────────────────────────

/**
 * Triggered on Wake-on-LAN / Power On:
 * Hyperdrive warp streaks accelerate, Mario super-jumps, Pac-Man chomps,
 * Tetris line clears, and Lambda emits radioactive shockwaves!
 */
export function triggerHyperdriveWarp() {
    if (!heroBadgeEl || isWarpActive || !state.machineIsUp) return;
    isWarpActive = true;

    heroBadgeEl.classList.add('hyper-warp');

    // Trigger full arcade ensemble combo
    triggerMarioJumpSequence(true);
    triggerPacmanEatSequence();
    triggerTetrisClearSequence();

    // Trigger speedline expansion
    if (speedlinesWrapEl) {
        speedlinesWrapEl.classList.add('warp-burst');
    }

    // Trigger radiation burst from Lambda
    triggerRadiationPulse();

    setTimeout(() => {
        if (heroBadgeEl) heroBadgeEl.classList.remove('hyper-warp');
        if (speedlinesWrapEl) speedlinesWrapEl.classList.remove('warp-burst');
        isWarpActive = false;
        startSpriteLoops();
    }, 3200);
}

/**
 * Triggered when the machine reaches ONLINE state:
 * Concentric radioactive ionizing shockwaves ripple outward from the Half-Life Lambda.
 */
export function triggerRadiationPulse() {
    if (!lambdaWrapEl || !state.machineIsUp) return;

    // Reset and trigger shockwave rings
    const rings = lambdaWrapEl.querySelectorAll('.rad-shockwave');
    rings.forEach((ring, idx) => {
        ring.classList.remove('pulse');
        // Force reflow
        void ring.offsetWidth;
        setTimeout(() => {
            ring.classList.add('pulse');
        }, idx * 160);
    });
}


