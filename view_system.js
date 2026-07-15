import * as THREE from 'three';

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const H = 0.07;
const CONFIG = {
    playerSpeed: 0.12,
    gravity: -22,
    playerHeight: H,
    sensitivity: 0.002,
    jumpSpeed: H * 35,
};

// ─── STATE ────────────────────────────────────────────────────────────────────
let scene, renderer, clock = new THREE.Clock();
let playerGroup, pitchObject;
let body = {}, avatarRoot;
let cameras = [];
let cam2, cam4;
let keys = {}, yaw = 0, pitch = 0;
let velY = 0, prevVelY = 0;
let isLocked = false;
let walkTime = 0, landTimer = 0;
let animState = 'idle'; // idle | walk | jump | fall | land

// ─── BUILD AVATAR ────────────────────────────────────────────────────────────
function makeCapsule(rx, ry, color = 0xffffff) {
    const m = new THREE.Mesh(
        new THREE.CapsuleGeometry(rx, ry, 8, 16),
        new THREE.MeshStandardMaterial({ color, roughness: 0.7 })
    );
    m.castShadow = true;
    return m;
}
function makeSphere(r, color = 0xffffff) {
    const m = new THREE.Mesh(
        new THREE.SphereGeometry(r, 16, 12),
        new THREE.MeshStandardMaterial({ color, roughness: 0.6 })
    );
    m.castShadow = true;
    return m;
}

function buildAvatar() {
    const root = new THREE.Group();
    const b = {};

    // Torso — single continuous piece
    const torso = makeCapsule(0.24, 0.42);
    torso.position.y = 1.06;
    root.add(torso);

    const torsoGroup = new THREE.Group();
    torsoGroup.position.y = 1.06;
    root.add(torsoGroup);
    b.torsoGroup = torsoGroup;

    // Head
    const head = makeSphere(0.20);
    head.position.y = 0.62;
    torsoGroup.add(head);
    b.headGroup = head;

    // ── Legs ──
    function makeLeg(side) {
        const sign = side === 'l' ? -1 : 1;
        const hip = new THREE.Group();
        hip.position.set(sign * 0.14, -0.20, 0);
        root.add(hip);

        const thigh = makeCapsule(0.10, 0.30);
        thigh.position.y = -0.34;
        hip.add(thigh);

        const knee = new THREE.Group();
        knee.position.y = -0.68;
        hip.add(knee);

        const shin = makeCapsule(0.08, 0.28);
        shin.position.y = -0.30;
        knee.add(shin);

        const ankle = new THREE.Group();
        ankle.position.y = -0.58;
        knee.add(ankle);

        const foot = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, 0.06, 0.20),
            new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 })
        );
        foot.position.set(0, -0.03, 0.04);
        foot.castShadow = true;
        ankle.add(foot);

        return { hip, knee, shin, foot };
    }
    const lLeg = makeLeg('l'), rLeg = makeLeg('r');
    b.lHip = lLeg.hip; b.lKnee = lLeg.knee; b.lShin = lLeg.shin;
    b.rHip = rLeg.hip; b.rKnee = rLeg.knee; b.rShin = rLeg.shin;

    // ── Arms ──
    function makeArm(side) {
        const sign = side === 'l' ? -1 : 1;
        const shoulder = new THREE.Group();
        shoulder.position.set(sign * 0.30, 0.28, 0);
        torsoGroup.add(shoulder);

        const upper = makeCapsule(0.08, 0.22);
        upper.position.y = -0.26;
        shoulder.add(upper);

        const elbow = new THREE.Group();
        elbow.position.y = -0.50;
        shoulder.add(elbow);

        const forearm = makeCapsule(0.07, 0.20);
        forearm.position.y = -0.24;
        elbow.add(forearm);

        const wrist = new THREE.Group();
        wrist.position.y = -0.46;
        elbow.add(wrist);

        const hand = makeSphere(0.06);
        wrist.add(hand);

        return { shoulder, elbow, forearm, hand };
    }
    const lArm = makeArm('l'), rArm = makeArm('r');
    b.lShoulder = lArm.shoulder; b.lElbow = lArm.elbow;
    b.rShoulder = rArm.shoulder; b.rElbow = rArm.elbow;
    b.lForearm = lArm.forearm; b.lHand = lArm.hand;
    b.rForearm = rArm.forearm; b.rHand = rArm.hand;

    Object.assign(body, b);
    playerGroup.add(root);
    avatarRoot = root;
}

// ─── ANIMATION ────────────────────────────────────────────────────────────────
const L = THREE.MathUtils.lerp;

function setHip(h, x, s) { h.rotation.x = L(h.rotation.x, x, s || 0.25); }
function setKnee(k, x, s) { k.rotation.x = L(k.rotation.x, x, s || 0.25); }
function setShoulder(s, x, z, sp) { s.rotation.x = L(s.rotation.x, x, sp || 0.25); s.rotation.z = L(s.rotation.z, z || 0, sp || 0.25); }
function setElbow(e, x, s) { e.rotation.x = L(e.rotation.x, x, s || 0.25); }

function animateAvatar(dt, moving, grounded) {
    if (!body.lHip) return;

    // Determine state
    if (!grounded && velY > 0.3) animState = 'jump';
    else if (!grounded && velY < -0.3) animState = 'fall';
    else if (landTimer > 0) { animState = 'land'; landTimer -= dt; }
    else if (moving) animState = 'walk';
    else animState = 'idle';

    // Detect landing
    if (grounded && prevVelY < -2) { landTimer = 0.35; animState = 'land'; }

    const sp = 0.3; // speed factor

    if (animState === 'idle') {
        walkTime += dt * 1.2;
        const breath = Math.sin(walkTime * 0.85) * 0.008;
        if (body.torsoGroup) body.torsoGroup.position.y = L(body.torsoGroup.position.y, 1.06 + breath, 0.06);
        setHip(body.lHip, 0); setHip(body.rHip, 0);
        setKnee(body.lKnee, 0); setKnee(body.rKnee, 0);
        setShoulder(body.lShoulder, 0.05, -0.06);
        setShoulder(body.rShoulder, 0.05, 0.06);
        setElbow(body.lElbow, 0.12); setElbow(body.rElbow, 0.12);

    } else if (animState === 'walk') {
        walkTime += dt * 8;
        const t = walkTime, s = Math.sin(t);
        if (body.torsoGroup) body.torsoGroup.position.y = L(body.torsoGroup.position.y, 1.06 + Math.abs(s) * 0.015, 0.12);
        setHip(body.lHip, s * 0.6, sp);
        setHip(body.rHip, -s * 0.6, sp);
        setKnee(body.lKnee, Math.max(0, -s) * 0.8, sp);
        setKnee(body.rKnee, Math.max(0, s) * 0.8, sp);
        setShoulder(body.lShoulder, -s * 0.4, -0.08, sp);
        setShoulder(body.rShoulder, s * 0.4, 0.08, sp);
        setElbow(body.lElbow, 0.5, sp); setElbow(body.rElbow, 0.5, sp);
        if (body.headGroup) body.headGroup.position.y = 0.68 + Math.abs(s) * 0.015;

    } else if (animState === 'jump') {
        if (body.torsoGroup) body.torsoGroup.position.y = L(body.torsoGroup.position.y, 1.18, 0.25);
        setHip(body.lHip, -0.4, sp); setHip(body.rHip, -0.4, sp);
        setKnee(body.lKnee, 1.0, sp); setKnee(body.rKnee, 1.0, sp);
        setShoulder(body.lShoulder, -1.1, -0.15, sp);
        setShoulder(body.rShoulder, -1.1, 0.15, sp);
        setElbow(body.lElbow, -0.3, sp); setElbow(body.rElbow, -0.3, sp);

    } else if (animState === 'fall') {
        setHip(body.lHip, 0.15, 0.12); setHip(body.rHip, 0.15, 0.12);
        setKnee(body.lKnee, 0.4, 0.12); setKnee(body.rKnee, 0.4, 0.12);
        setShoulder(body.lShoulder, 0.2, -1.0, 0.12);
        setShoulder(body.rShoulder, 0.2, 1.0, 0.12);
        setElbow(body.lElbow, 0.2, 0.12); setElbow(body.rElbow, 0.2, 0.12);

    } else if (animState === 'land') {
        const p = 1.0 - (landTimer / 0.35);
        const squat = Math.sin(p * Math.PI) * 0.2;
        if (body.torsoGroup) body.torsoGroup.position.y = L(body.torsoGroup.position.y, 1.06 - squat * 0.4, 0.3);
        setHip(body.lHip, 0.4, 0.3); setHip(body.rHip, 0.4, 0.3);
        setKnee(body.lKnee, 0.8, 0.3); setKnee(body.rKnee, 0.8, 0.3);
        setShoulder(body.lShoulder, 0.3, -0.12, 0.3);
        setShoulder(body.rShoulder, 0.3, 0.12, 0.3);
        setElbow(body.lElbow, 0.4, 0.3); setElbow(body.rElbow, 0.4, 0.3);
    }
}

// ─── SETUP ────────────────────────────────────────────────────────────────────
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x000000, 4.5);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.autoClear = false;
    const cvs = renderer.domElement;
    cvs.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:0;';
    document.body.appendChild(cvs);

    // Faint ambient light so outlines are visible
    scene.add(new THREE.AmbientLight(0x0e0e14, 0.12));

    // Player group
    playerGroup = new THREE.Group();
    scene.add(playerGroup);

    // Pitch object (for 1st person camera and torch)
    pitchObject = new THREE.Object3D();
    pitchObject.position.set(0, CONFIG.playerHeight * 0.93, 0);
    playerGroup.add(pitchObject);

    // Ground plane (infinite dark ground)
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(200, 200),
        new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    scene.add(ground);

    // Build avatar
    buildAvatar();

    // ── Cameras ──
    const c1 = new THREE.PerspectiveCamera(80, 1, 0.005, 50);
    pitchObject.add(c1);

    cam2 = new THREE.PerspectiveCamera(60, 1, 0.005, 50);
    scene.add(cam2);

    const c3 = new THREE.PerspectiveCamera(70, 1, 0.005, 50);
    c3.position.set(0, CONFIG.playerHeight * 2.5, CONFIG.playerHeight * 5);
    c3.lookAt(0, CONFIG.playerHeight * 0.5, 0);
    playerGroup.add(c3);

    cam4 = new THREE.PerspectiveCamera(60, 1, 0.01, 50);
    scene.add(cam4);

    cameras = [c1, null, c3, cam4];

    // ── Flashlight (cloned from restore_point) ──
    // Spotlight attached to camera
    const torchLight = new THREE.SpotLight(0xfff8ee, 1.0, 4.0, Math.PI / 5.0, 0.4, 1.5);
    torchLight.position.set(0.013, -0.012, -0.021);
    torchLight.castShadow = true;
    torchLight.shadow.mapSize.width = 1024;
    torchLight.shadow.mapSize.height = 1024;
    torchLight.shadow.camera.near = 0.005;
    torchLight.shadow.camera.far = 4.0;
    torchLight.shadow.bias = -0.0005;
    pitchObject.add(torchLight);

    const torchTarget = new THREE.Object3D();
    pitchObject.add(torchTarget);
    torchLight.target = torchTarget;

    // Procedural flashlight mesh (bottom-right of screen)
    const torchGroup = new THREE.Group();
    const bodyGeom = new THREE.CylinderGeometry(0.0004, 0.0004, 0.005, 12);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x222f3e, metalness: 0.8, roughness: 0.2 });
    const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
    bodyMesh.rotation.x = Math.PI / 2;
    torchGroup.add(bodyMesh);

    const headGeom = new THREE.CylinderGeometry(0.0007, 0.0004, 0.0015, 12);
    const headMat = new THREE.MeshStandardMaterial({ color: 0x57606f, metalness: 0.9, roughness: 0.1 });
    const headMesh = new THREE.Mesh(headGeom, headMat);
    headMesh.position.set(0, 0, -0.003);
    headMesh.rotation.x = Math.PI / 2;
    torchGroup.add(headMesh);

    const lensGeom = new THREE.CylinderGeometry(0.0006, 0.0006, 0.0001, 12);
    const lensMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const lensMesh = new THREE.Mesh(lensGeom, lensMat);
    lensMesh.position.set(0, 0, -0.0038);
    lensMesh.rotation.x = Math.PI / 2;
    torchGroup.add(lensMesh);

    torchGroup.position.set(0.013, -0.012, -0.018);
    torchGroup.rotation.set(0.18, -0.22, 0.0);
    pitchObject.add(torchGroup);

    // Hide loading
    document.getElementById('loading-screen').style.display = 'none';

    // Events
    window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
    window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
    window.addEventListener('resize', () => renderer.setSize(window.innerWidth, window.innerHeight));
    cvs.addEventListener('click', () => cvs.requestPointerLock());
    document.addEventListener('pointerlockchange', () => {
        isLocked = document.pointerLockElement === cvs;
        document.getElementById('pointer-hint').style.display = isLocked ? 'none' : 'block';
    });
    document.addEventListener('mousemove', e => {
        if (!isLocked) return;
        yaw   -= e.movementX * CONFIG.sensitivity;
        pitch -= e.movementY * CONFIG.sensitivity;
        pitch = Math.max(-1.2, Math.min(1.2, pitch));
    });

    animate();
}

// ─── GAME LOOP ────────────────────────────────────────────────────────────────
function update(dt) {
    if (!playerGroup) return;

    playerGroup.rotation.y = yaw;
    if (pitchObject) pitchObject.rotation.x = pitch;

    const dir = new THREE.Vector3();
    if (keys['w'] || keys['arrowup'])    dir.z -= 1;
    if (keys['s'] || keys['arrowdown'])  dir.z += 1;
    if (keys['a'] || keys['arrowleft'])  dir.x -= 1;
    if (keys['d'] || keys['arrowright']) dir.x += 1;
    const moving = dir.lengthSq() > 0;

    if (moving) {
        dir.normalize().applyEuler(new THREE.Euler(0, yaw, 0));
        playerGroup.position.addScaledVector(dir, CONFIG.playerSpeed * dt);
    }

    if (keys[' '] && playerGroup.position.y <= 0.01)
        velY = CONFIG.jumpSpeed;

    prevVelY = velY;

    velY += CONFIG.gravity * dt;
    playerGroup.position.y += velY * dt;
    const grounded = playerGroup.position.y <= 0.01;
    if (grounded) { playerGroup.position.y = 0; velY = 0; }

    // Head follows pitch
    if (body.headGroup) {
        body.headGroup.rotation.x = L(body.headGroup.rotation.x, pitch * 0.5, 0.08);
    }

    animateAvatar(dt, moving, grounded);
}
}

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    update(dt);

    const w = window.innerWidth, h = window.innerHeight;
    const aspect = (w / 2) / (h / 2);

    // Update dynamic cameras
    if (playerGroup) {
        const behind = new THREE.Vector3(0, CONFIG.playerHeight * 1.5, -CONFIG.playerHeight * 3)
            .applyQuaternion(playerGroup.quaternion);
        cam2.position.copy(playerGroup.position).add(behind);
        cam2.lookAt(playerGroup.position.x, playerGroup.position.y + CONFIG.playerHeight * 0.7, playerGroup.position.z);
        cam2.aspect = aspect; cam2.updateProjectionMatrix();

        cam4.position.set(playerGroup.position.x, playerGroup.position.y + CONFIG.playerHeight * 80, playerGroup.position.z);
        cam4.lookAt(playerGroup.position.x, playerGroup.position.y, playerGroup.position.z);
        cam4.aspect = aspect; cam4.updateProjectionMatrix();
    }

    cameras[0].aspect = aspect; cameras[0].updateProjectionMatrix();
    cameras[2].aspect = aspect; cameras[2].updateProjectionMatrix();

    renderer.clear();

    // Hide body for 1st person, show only forearms + hands
    const visMap = new Map();
    if (avatarRoot) {
        avatarRoot.traverse(c => {
            if (c.isMesh) { visMap.set(c, c.visible); c.visible = false; }
        });
        if (body.lForearm) body.lForearm.visible = true;
        if (body.lHand) body.lHand.visible = true;
        if (body.rForearm) body.rForearm.visible = true;
        if (body.rHand) body.rHand.visible = true;
    }

    renderer.setScissorTest(true);

    // 1st person
    renderer.setScissor(0, h/2, w/2, h/2);
    renderer.setViewport(0, h/2, w/2, h/2);
    renderer.render(scene, cameras[0]);

    // Restore visibility
    if (avatarRoot) {
        avatarRoot.traverse(c => {
            if (c.isMesh && visMap.has(c)) c.visible = visMap.get(c);
        });
    }

    // 2nd person (facing)
    renderer.setScissor(w/2, h/2, w/2, h/2);
    renderer.setViewport(w/2, h/2, w/2, h/2);
    renderer.render(scene, cam2);

    // 3rd person
    renderer.setScissor(0, 0, w/2, h/2);
    renderer.setViewport(0, 0, w/2, h/2);
    renderer.render(scene, cameras[2]);

    // Bird's eye
    renderer.setScissor(w/2, 0, w/2, h/2);
    renderer.setViewport(w/2, 0, w/2, h/2);
    renderer.render(scene, cam4);

    renderer.setScissorTest(false);
}

init();
