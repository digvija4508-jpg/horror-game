import * as THREE from 'three';

// --- State Variables ---
export let playerEnergy = 1.0; // Stamina level (0.0 to 1.0)
export let localIsSprinting = true; // Sprint lock state
export let gameTimeLeft = 300; // Synchronized timer (5 minutes)
export let ambientTimer = Math.random() * 40 + 30; // 30-70 seconds interval

let soundWalkCycle = 0;
let lastStepSign = 0;

// Audio References
let audioListener = null;
let unlocked = false;

export const soundObjects = {
    ambient: null,
    finalStage: null,
    heartbeat: null,
    ghostNear: null
};

// --- 1. Initialize Audio Engine ---
export function initAudio(camera, scene) {
    if (audioListener) return; // Prevent double initialization

    // Create 3D Audio Listener and attach to camera
    audioListener = new THREE.AudioListener();
    camera.add(audioListener);

    // Initialize HTML5 Audio elements for local playback
    soundObjects.ambient = new Audio('Sounds/ambient_random.mp3');
    soundObjects.finalStage = new Audio('Sounds/final_stage.mp3');
    soundObjects.heartbeat = new Audio('Sounds/heartbeat_low_energy.mp3');
    soundObjects.ghostNear = new Audio('Sounds/ghost_near.mp3');

    // Configure looping
    soundObjects.finalStage.loop = true;
    soundObjects.heartbeat.loop = true;
    soundObjects.ghostNear.loop = true;
}

// --- 2. Unlock Browser Audio ---
export function unlockAudio() {
    if (unlocked) return;

    // Trigger playback and pause immediately to satisfy browser user gesture policies
    Object.values(soundObjects).forEach(audio => {
        if (audio) {
            audio.play().then(() => {
                audio.pause();
            }).catch(e => {
                console.warn("Audio element unlock deferred:", e);
            });
        }
    });

    if (audioListener && audioListener.context && audioListener.context.state === 'suspended') {
        audioListener.context.resume();
    }

    unlocked = true;
    console.log("Audio contexts unlocked.");
}

// --- 3. Attach Positional Audio to Remote Player ---
export function attachRemoteAudio(playerGroup) {
    if (!audioListener) return;

    const positionalAudio = new THREE.PositionalAudio(audioListener);
    positionalAudio.setRefDistance(0.3); // Positional attenuation starts at 30cm
    positionalAudio.setMaxDistance(2.5); // Fades completely at 2.5 meters
    positionalAudio.setDistanceModel('linear');

    playerGroup.add(positionalAudio);
    playerGroup.userData.footstepsAudio = positionalAudio;
    console.log("Procedural positional audio node attached to remote player.");
}

// --- 3B. Initialize Local Footstep Audio ---
export function initLocalFootstepAudio(playerMesh) {
    if (!audioListener || !playerMesh) return;

    const positionalAudio = new THREE.PositionalAudio(audioListener);
    positionalAudio.setRefDistance(0.3);
    positionalAudio.setMaxDistance(2.5);
    positionalAudio.setDistanceModel('linear');

    playerMesh.add(positionalAudio);
    console.log("Local procedural footstep audio node attached.");
}

// --- Procedural Footstep Audio Synthesizer (Dirt Ground Simulator) ---
function triggerStepNodes(ctx, destination, volume) {
    // Dynamic random variations per step to prevent identical repetition
    const pitchShift = 0.85 + Math.random() * 0.3; // +/- 15% pitch variation
    const volShift = 0.9 + Math.random() * 0.2; // +/- 10% volume variation
    const baseVol = volume * 2.5 * volShift; // Heavily boosted for clear audibility

    // 1. Ground Weight Impact Thud (low-pass noise)
    const playThud = () => {
        const duration = 0.12;
        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 220 * pitchShift; // 220Hz low-end thud

        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(baseVol * 0.65, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration - 0.02);

        source.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(destination);

        source.start();
        source.stop(ctx.currentTime + duration);
    };

    // 2. Muffled Dirt/Dust Shuffle (bandpass noise)
    const playShuffle = () => {
        const duration = 0.15;
        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 380 * pitchShift; // 380Hz center frequency
        filter.Q.value = 1.2; // wider bandpass for dirt friction scraping

        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(baseVol * 0.35, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration - 0.03);

        source.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(destination);

        source.start();
        source.stop(ctx.currentTime + duration);
    };

    // Trigger both dirt weight thud and soft dust scraping shuffle
    playThud();
    playShuffle();
}

function playProceduralStep(volume = 0.5) {
    const ctx = (audioListener && audioListener.context) ? audioListener.context : null;
    if (!ctx) return;
    if (ctx.state === 'suspended') {
        ctx.resume().then(() => {
            console.log("Web Audio Context successfully resumed on step trigger.");
        }).catch(err => {
            console.warn("Failed to resume Web Audio Context on step trigger:", err);
        });
    }
    triggerStepNodes(ctx, ctx.destination, volume);
}

function playRemoteProceduralStep(p, volume = 0.5) {
    if (!p.mesh || !p.mesh.userData.footstepsAudio) return;
    const positionalAudio = p.mesh.userData.footstepsAudio;
    const ctx = (audioListener && audioListener.context) ? audioListener.context : null;
    if (!ctx) return;
    triggerStepNodes(ctx, positionalAudio.getOutput(), volume);
}

// --- 4. Handle Socket Messages ---
export function handleSocketMessage(data) {
    if (data.type === 'init') {
        if (data.timeLeft !== undefined) {
            gameTimeLeft = data.timeLeft;
        }
    } else if (data.type === 'timer') {
        gameTimeLeft = data.timeLeft;
        
        // Update timer UI text
        const timerVal = document.getElementById('timer-value');
        if (timerVal) {
            const minutes = Math.floor(gameTimeLeft / 60);
            const seconds = gameTimeLeft % 60;
            timerVal.innerText = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
        }
    }
}

// --- 5. Update Stamina & Horror Audio State ---
export function updateAudio(deltaTime, isMoving, wantsToSprint, isGrounded, panicIntensity, otherPlayers, playerEnergy) {
    if (!soundObjects.ambient) return false;

    // Pause all audio if the pause menu is open
    const startScreen = document.getElementById('start-screen');
    const isPaused = startScreen && !startScreen.classList.contains('hidden');

    if (isPaused) {
        if (soundObjects.localFootsteps && !soundObjects.localFootsteps.paused) soundObjects.localFootsteps.pause();
        if (soundObjects.heartbeat && !soundObjects.heartbeat.paused) soundObjects.heartbeat.pause();
        if (soundObjects.ghostNear && !soundObjects.ghostNear.paused) soundObjects.ghostNear.pause();
        if (soundObjects.ambient && !soundObjects.ambient.paused) soundObjects.ambient.pause();
        if (soundObjects.finalStage && !soundObjects.finalStage.paused) soundObjects.finalStage.pause();
        
        otherPlayers.forEach(p => {
            if (p.mesh && p.mesh.userData.footstepsAudio && p.mesh.userData.footstepsAudio.isPlaying) {
                p.mesh.userData.footstepsAudio.stop();
            }
        });
        return false;
    }

    // A. Stamina / Energy System
    let activeSprinting = false;

    // Exhaustion lock: if depleted, cannot sprint until it recovers to 20%
    if (playerEnergy <= 0.01) {
        localIsSprinting = false;
    } else if (playerEnergy >= 0.20) {
        localIsSprinting = true;
    }

    activeSprinting = wantsToSprint && localIsSprinting && isMoving;

    if (activeSprinting) {
        playerEnergy = Math.max(0, playerEnergy - deltaTime * 0.12); // depletion
    } else {
        playerEnergy = Math.min(1.0, playerEnergy + deltaTime * 0.08); // regeneration
    }

    // Update UI Stamina Bar
    const staminaFill = document.getElementById('stamina-bar-fill');
    if (staminaFill) {
        staminaFill.style.width = `${playerEnergy * 100}%`;
        if (playerEnergy < 0.25) {
            staminaFill.style.background = '#ee5253'; // Alert red
        } else {
            staminaFill.style.background = 'linear-gradient(90deg, #ff9f43 0%, #ee5253 100%)';
        }
    }

    // B. Sound Playback & Ducking Logic
    const isHeartbeatActive = playerEnergy < 0.20;
    const isGhostNearActive = panicIntensity > 0.02;
    const isFinalStageActive = gameTimeLeft <= 60 && gameTimeLeft > 0;

    // Check if any major scary/tension sounds are active
    const isTensionActive = isHeartbeatActive || isGhostNearActive || isFinalStageActive;

    // 1. Heartbeat Sound (Low Energy)
    if (isHeartbeatActive) {
        if (soundObjects.heartbeat.paused) {
            soundObjects.heartbeat.play().catch(() => {});
        }
        // Urgent beating gets louder the lower the energy
        soundObjects.heartbeat.volume = ((0.25 - playerEnergy) / 0.25) * 0.8;
    } else {
        if (!soundObjects.heartbeat.paused) soundObjects.heartbeat.pause();
    }

    // 2. Ghost Near Sound (Proximity to Red Eyes)
    if (isGhostNearActive) {
        if (soundObjects.ghostNear.paused) {
            soundObjects.ghostNear.play().catch(() => {});
        }
        // Vol scales with close proximity panic
        soundObjects.ghostNear.volume = panicIntensity * 0.95;
    } else {
        if (!soundObjects.ghostNear.paused) soundObjects.ghostNear.pause();
    }

    // 3. Final Stage Sound (Last Minute)
    if (isFinalStageActive) {
        if (soundObjects.finalStage.paused) {
            soundObjects.finalStage.play().catch(() => {});
        }
        // Duck final stage volume if heartbeat or ghost is playing
        const targetVol = (isHeartbeatActive || isGhostNearActive) ? 0.12 : 0.5;
        soundObjects.finalStage.volume = THREE.MathUtils.lerp(soundObjects.finalStage.volume, targetVol, 5 * deltaTime);
    } else {
        if (!soundObjects.finalStage.paused) soundObjects.finalStage.pause();
    }

    // 4. Ambient Random Sounds
    if (!isTensionActive) {
        ambientTimer -= deltaTime;
        if (ambientTimer <= 0) {
            soundObjects.ambient.currentTime = 0;
            soundObjects.ambient.play().catch(() => {});
            ambientTimer = Math.random() * 40 + 35; // Reset interval
        }
    }

    // Duck active ambient sound if tension begins
    if (!soundObjects.ambient.paused) {
        const targetVol = isTensionActive ? 0.08 : 0.45;
        soundObjects.ambient.volume = THREE.MathUtils.lerp(soundObjects.ambient.volume, targetVol, 5 * deltaTime);
    }

    // 5. Local Footsteps Sound (Procedurally Synthesized Step-by-Step)
    if (isMoving && isGrounded) {
        const bobFrequency = activeSprinting ? 20 : 12;
        soundWalkCycle += deltaTime * bobFrequency;
        
        // Triggers a footstep on every half cycle of the sine bob
        const currentSin = Math.sin(soundWalkCycle);
        const currentSign = Math.sign(currentSin);
        
        if (currentSign !== lastStepSign && lastStepSign !== 0) {
            // Trigger a single synthetic step crunch thud
            playProceduralStep(activeSprinting ? 0.65 : 0.38);
        }
        lastStepSign = currentSign;
    } else {
        soundWalkCycle = 0;
        lastStepSign = 0;
    }

    // 6. Remote Players Positional Footsteps (Procedurally Synthesized Step-by-Step)
    otherPlayers.forEach(p => {
        if (p.mesh && p.mesh.userData.footstepsAudio) {
            // Check distance to targetPosition to see if remote player is moving
            const distanceMoved = p.mesh.position.distanceTo(p.targetPosition);
            const isRemoteMoving = distanceMoved > 0.001; // small filter threshold

            if (isRemoteMoving && p.mesh.position.y < 0.05) {
                if (p.soundWalkCycle === undefined) {
                    p.soundWalkCycle = 0;
                    p.lastStepSign = 0;
                }
                const bobFrequency = p.isSprinting ? 20 : 12;
                p.soundWalkCycle += deltaTime * bobFrequency;
                
                const currentSin = Math.sin(p.soundWalkCycle);
                const currentSign = Math.sign(currentSin);
                
                if (currentSign !== p.lastStepSign && p.lastStepSign !== 0) {
                    playRemoteProceduralStep(p, p.isSprinting ? 0.65 : 0.38);
                }
                p.lastStepSign = currentSign;
            } else {
                p.soundWalkCycle = 0;
                p.lastStepSign = 0;
            }
        }
    });

    return activeSprinting;
}
