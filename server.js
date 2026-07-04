const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const os = require('os');

const PORT = 3000;

// Content types helper
const CONTENT_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.mpeg': 'audio/mpeg',
    '.wav': 'audio/wav'
};

// Global Lobbies registry (Lobby Code -> Lobby Details)
let lobbies = new Map(); // Map(lobbyCode -> { clients: Map(ws -> playerData), hostId: number, gameTimeLeft: number, timerInterval: setInterval })

// Local profiles database (in-memory fallback)
let localProfiles = new Map(); // username -> secretToken

// Load environment variables manually from .env if it exists
try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        envContent.split(/\r?\n/).forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const parts = trimmed.split('=');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
                    process.env[key] = value;
                }
            }
        });
        console.log("Loaded .env configuration file.");
    }
} catch (e) {
    console.error("Failed to load .env file manually:", e);
}

// HTTP Static File Server
const server = http.createServer((req, res) => {
    // Strip query parameters (e.g. ?v=82 cache busters) from the file path lookup
    const urlParts = req.url.split('?');
    const urlPath = urlParts[0];
    const decodedPath = decodeURIComponent(urlPath);
    
    // Parse query parameters
    const urlParams = new URL(req.url, 'http://localhost').searchParams;
    
    // API Endpoint: Check if room name is unique
    if (decodedPath === '/api/check-room') {
        const name = urlParams.get('name');
        const exists = lobbies.has(name);
        res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ exists }));
        return;
    }

    // API Endpoint: Get Supabase Config
    if (decodedPath === '/api/supabase-config') {
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({
            url: process.env.SUPABASE_URL || null,
            key: process.env.SUPABASE_KEY || null
        }));
        return;
    }

    // API Endpoint: Check if callsign username is currently active/online
    if (decodedPath === '/api/check-username') {
        const name = urlParams.get('name');
        let active = false;
        
        // Scan all lobbies for anyone using this name
        for (const lobby of lobbies.values()) {
            for (const client of lobby.clients.values()) {
                if (client.name && client.name.toLowerCase() === name.toLowerCase()) {
                    active = true;
                    break;
                }
            }
            if (active) break;
        }
        
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ active }));
        return;
    }

    // API Endpoint: Local profile authentication (fallback database)
    if (decodedPath === '/api/local-profile') {
        const name = urlParams.get('name');
        const token = urlParams.get('token');
        let status = 'success';
        let returnToken = token;

        if (localProfiles.has(name)) {
            const savedToken = localProfiles.get(name);
            if (savedToken !== token) {
                status = 'invalid';
            }
        } else {
            // Register new local profile
            if (!token) {
                returnToken = 'local_' + Math.random().toString(36).substring(2, 15);
            }
            localProfiles.set(name, returnToken);
        }

        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ status, token: returnToken }));
        return;
    }

    // API Endpoint: Increment profile game count
    if (decodedPath === '/api/increment-games') {
        const name = urlParams.get('name');
        console.log(`Survivor "${name}" stats updated (+1 Game Played).`);
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ success: true }));
        return;
    }

    let filePath;
    if (decodedPath.startsWith('/horror game/') || decodedPath.startsWith('/horror game')) {
        // Serve from horror game folder
        const subPath = decodedPath.replace('/horror game', '');
        filePath = path.join(__dirname, subPath === '/' || subPath === '' ? '/index.html' : subPath);
    } else {
        // Serve from landing page folder
        const subPath = decodedPath === '/' ? '/index.html' : decodedPath;
        filePath = path.join(__dirname, '..', 'game-landing-page', subPath);
    }

    // Rewrite clean URLs: If file doesn't exist and has no extension, check if appending .html matches a file
    if (!fs.existsSync(filePath) && path.extname(filePath) === '') {
        const htmlPath = filePath + '.html';
        if (fs.existsSync(htmlPath)) {
            filePath = htmlPath;
        }
    }

    // Safety check: prevent directory traversal outside of workspace root
    const projectRoot = path.join(__dirname, '..');
    if (!filePath.startsWith(projectRoot)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    const extname = path.extname(filePath);
    let contentType = CONTENT_TYPES[extname.toLowerCase()] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 File Not Found</h1>');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, {
                'Content-Type': contentType,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });
            res.end(content, 'utf-8');
        }
    });
});

// WebSocket Multiplayer Server
const wss = new WebSocketServer({ server });
let nextPlayerId = 1;

function getOrCreateLobby(lobbyCode) {
    if (!lobbies.has(lobbyCode)) {
        const lobby = {
            clients: new Map(),
            hostId: null,
            originalHostName: null, // Track the callsign of the room creator
            gameTimeLeft: 300,
            timerInterval: null
        };
        
        // Start a synchronized round timer for this specific lobby
        lobby.timerInterval = setInterval(() => {
            if (lobby.gameTimeLeft > 0) {
                lobby.gameTimeLeft--;
            } else {
                lobby.gameTimeLeft = 300; // Reset countdown
            }
            broadcastToLobby(lobbyCode, {
                type: 'timer',
                timeLeft: lobby.gameTimeLeft
            }, null, 'game');
        }, 1000);
        
        lobbies.set(lobbyCode, lobby);
        console.log(`Lobby [${lobbyCode}] created`);
    }
    return lobbies.get(lobbyCode);
}

function deleteLobbyIfEmpty(lobbyCode) {
    const lobby = lobbies.get(lobbyCode);
    if (lobby && lobby.clients.size === 0) {
        clearInterval(lobby.timerInterval);
        lobbies.delete(lobbyCode);
        console.log(`Lobby [${lobbyCode}] deleted (empty)`);
    }
}

// Optional filter by client mode ('lobby' or 'game')
function broadcastToLobby(lobbyCode, data, excludeWs = null, modeFilter = null) {
    const lobby = lobbies.get(lobbyCode);
    if (!lobby) return;
    const messageStr = JSON.stringify(data);
    for (const [clientWs, clientData] of lobby.clients.entries()) {
        if (clientWs !== excludeWs && clientWs.readyState === 1) {
            if (modeFilter && clientData.mode !== modeFilter) continue;
            clientWs.send(messageStr);
        }
    }
}

function sendLobbyUpdate(lobbyCode) {
    const lobby = lobbies.get(lobbyCode);
    if (!lobby) return;
    
    const playersList = Array.from(lobby.clients.entries())
        .filter(([ws, data]) => data.mode === 'lobby')
        .map(([ws, data]) => ({
            id: data.id,
            name: data.name,
            isReady: data.isReady || false,
            isHost: data.id === lobby.hostId
        }));
        
    broadcastToLobby(lobbyCode, {
        type: 'lobby_update',
        hostId: lobby.hostId,
        players: playersList
    }, null, 'lobby');
}

wss.on('connection', (ws, req) => {
    // Parse lobby and mode query parameters
    const urlParams = new URL(req.url, 'http://localhost').searchParams;
    const lobbyCode = urlParams.get('lobby') || 'global';
    const mode = urlParams.get('mode') || 'game'; // 'lobby' (waiting room) or 'game' (3D simulation)
    const name = urlParams.get('name') || `Survivor_${nextPlayerId}`;
    
    const lobby = getOrCreateLobby(lobbyCode);
    const id = nextPlayerId++;
    
    // Store player data relative to the lobby
    lobby.clients.set(ws, { id, name, mode, isReady: false, lobbyCode });

    // Host Assignment & Succession logic
    const lobbyPlayers = Array.from(lobby.clients.values()).filter(c => c.mode === 'lobby');
    if (lobbyPlayers.length === 1) {
        // This is the first lobby member! They are the creator / host
        lobby.hostId = id;
        lobby.originalHostName = name;
        console.log(`Assigned original host: Player ${id} ("${name}") for Lobby [${lobbyCode}]`);
    } else {
        // Check if the original host has rejoined the lobby
        if (name === lobby.originalHostName) {
            lobby.hostId = id;
            console.log(`Original host "${name}" rejoined. Restored ownership to Player ${id} in Lobby [${lobbyCode}].`);
        }
    }

    console.log(`Player ${id} ("${name}") connected to Lobby [${lobbyCode}] in mode: ${mode}`);

    if (mode === 'lobby') {
        // Send initial state and then broadcast update
        ws.send(JSON.stringify({
            type: 'init_lobby',
            id: id,
            hostId: lobby.hostId
        }));
        sendLobbyUpdate(lobbyCode);
    } else {
        // Mode is 'game'
        const existingPlayers = [];
        for (const [clientWs, clientData] of lobby.clients.entries()) {
            if (clientWs !== ws && clientData.mode === 'game') {
                existingPlayers.push({
                    id: clientData.id,
                    x: clientData.x || 0,
                    y: clientData.y || 0,
                    z: clientData.z || 0,
                    yaw: clientData.yaw || 0,
                    pitch: clientData.pitch || 0,
                    activeSlot: clientData.activeSlot || 1,
                    isSprinting: clientData.isSprinting || false,
                    isFlashlightOn: clientData.isFlashlightOn || false
                });
            }
        }

        ws.send(JSON.stringify({
            type: 'init',
            id: id,
            players: existingPlayers,
            timeLeft: lobby.gameTimeLeft
        }));

        // Broadcast join event to other players in the same lobby
        broadcastToLobby(lobbyCode, {
            type: 'join',
            id: id,
            x: 0,
            y: 0.025,
            z: 0,
            yaw: 0,
            pitch: 0,
            isFlashlightOn: false
        }, ws, 'game');
    }

    // Handle messages
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const playerData = lobby.clients.get(ws);
            if (!playerData) return;

            if (playerData.mode === 'lobby') {
                if (data.type === 'ready_toggle') {
                    playerData.isReady = !playerData.isReady;
                    sendLobbyUpdate(lobbyCode);
                } else if (data.type === 'chat') {
                    broadcastToLobby(lobbyCode, {
                        type: 'chat',
                        name: playerData.name,
                        text: data.text
                    }, null, 'lobby');
                } else if (data.type === 'launch_game') {
                    if (playerData.id === lobby.hostId) {
                        broadcastToLobby(lobbyCode, {
                            type: 'launch_game',
                            lobbyCode: lobbyCode
                        }, null, 'lobby');
                    }
                }
            } else {
                // Game mode updates
                if (data.type === 'update') {
                    playerData.x = data.x;
                    playerData.y = data.y;
                    playerData.z = data.z;
                    playerData.yaw = data.yaw;
                    playerData.pitch = data.pitch;
                    playerData.activeSlot = data.activeSlot;
                    playerData.isSprinting = data.isSprinting;
                    playerData.isFlashlightOn = data.isFlashlightOn;
                    playerData.animState = data.animState;

                    broadcastToLobby(lobbyCode, {
                        type: 'update',
                        id: id,
                        x: data.x,
                        y: data.y,
                        z: data.z,
                        yaw: data.yaw,
                        pitch: data.pitch,
                        activeSlot: data.activeSlot,
                        isSprinting: data.isSprinting,
                        isFlashlightOn: data.isFlashlightOn,
                        animState: data.animState
                    }, ws, 'game');
                }
            }
        } catch (e) {
            console.error('Error handling player message:', e);
        }
    });

    // Handle disconnection
    ws.on('close', () => {
        console.log(`Player ${id} disconnected from Lobby [${lobbyCode}]`);
        lobby.clients.delete(ws);
        
        if (mode === 'lobby') {
            // Re-assign host if the host disconnected
            if (lobby.hostId === id) {
                const remainingLobbyClients = Array.from(lobby.clients.entries()).filter(([cWs, cData]) => cData.mode === 'lobby');
                if (remainingLobbyClients.length > 0) {
                    lobby.hostId = remainingLobbyClients[0][1].id;
                    console.log(`Temporary host assigned for Lobby [${lobbyCode}] is Player ${lobby.hostId} ("${remainingLobbyClients[0][1].name}")`);
                } else {
                    lobby.hostId = null;
                }
            }
            sendLobbyUpdate(lobbyCode);
        } else {
            broadcastToLobby(lobbyCode, {
                type: 'leave',
                id: id
            }, null, 'game');
        }
        
        deleteLobbyIfEmpty(lobbyCode);
    });
});

// Get network interfaces to print IP addresses
function getLocalIpAddresses() {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                addresses.push(iface.address);
            }
        }
    }
    return addresses;
}

server.listen(PORT, '0.0.0.0', () => {
    console.log(`===================================================`);
    console.log(`MULTIPLAYER HORROR GAME RUNNING ON PORT ${PORT}`);
    console.log(`Local Access: http://localhost:${PORT}`);

    const ips = getLocalIpAddresses();
    if (ips.length > 0) {
        console.log(`\nJoin from other devices on the same Wi-Fi:`);
        ips.forEach(ip => {
            console.log(`👉 http://${ip}:${PORT}`);
        });
    } else {
        console.log(`\nNo external network interface found. Connect to Wi-Fi to play multiplayer!`);
    }
    console.log(`===================================================`);
});
