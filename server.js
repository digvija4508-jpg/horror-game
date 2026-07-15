const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const os = require('os');

const PORT = 8000;

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

// HTTP Static File Server
const server = http.createServer((req, res) => {
    // Strip query parameters (e.g. ?v=82 cache busters) from the file path lookup
    const urlPath = req.url.split('?')[0];
    // Decodes URL components (e.g. %20 space)
    let filePath = path.join(__dirname, decodeURIComponent(urlPath === '/' ? '/index.html' : urlPath));
    
    // Safety check: prevent directory traversal
    if (!filePath.startsWith(__dirname)) {
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
let clients = new Map();
let nextPlayerId = 1;

// Global Synchronized Round Timer (5 minutes / 300 seconds)
let gameTimeLeft = 300;
setInterval(() => {
    if (gameTimeLeft > 0) {
        gameTimeLeft--;
        broadcast({
            type: 'timer',
            timeLeft: gameTimeLeft
        });
    } else {
        gameTimeLeft = 300; // Reset countdown
        broadcast({
            type: 'timer',
            timeLeft: gameTimeLeft
        });
    }
}, 1000);

wss.on('connection', (ws) => {
    const id = nextPlayerId++;
    clients.set(ws, { id });

    console.log(`Player ${id} connected`);

    // 1. Send initialization data to the new player
    const existingPlayers = [];
    for (const [clientWs, clientData] of clients.entries()) {
        if (clientWs !== ws) {
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
        timeLeft: gameTimeLeft
    }));

    // 2. Broadcast join event to all other players with initial positions
    broadcast({
        type: 'join',
        id: id,
        x: 0,
        y: 0.025,
        z: 0,
        yaw: 0,
        pitch: 0,
        isFlashlightOn: false
    }, ws);

    // 3. Handle messages from client
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'update') {
                const playerData = clients.get(ws);
                if (playerData) {
                    playerData.x = data.x;
                    playerData.y = data.y;
                    playerData.z = data.z;
                    playerData.yaw = data.yaw;
                    playerData.pitch = data.pitch;
                    playerData.activeSlot = data.activeSlot;
                    playerData.isSprinting = data.isSprinting;
                    playerData.isFlashlightOn = data.isFlashlightOn;

                    // Broadcast movement updates to everyone else
                    broadcast({
                        type: 'update',
                        id: id,
                        x: data.x,
                        y: data.y,
                        z: data.z,
                        yaw: data.yaw,
                        pitch: data.pitch,
                        activeSlot: data.activeSlot,
                        isSprinting: data.isSprinting,
                        isFlashlightOn: data.isFlashlightOn
                    }, ws);
                }
            }
        } catch (e) {
            console.error('Error handling player message:', e);
        }
    });

    // 4. Handle disconnection
    ws.on('close', () => {
        console.log(`Player ${id} disconnected`);
        clients.delete(ws);
        broadcast({
            type: 'leave',
            id: id
        });
    });
});

// Broadcast helper
function broadcast(data, excludeWs = null) {
    const messageStr = JSON.stringify(data);
    for (const clientWs of clients.keys()) {
        if (clientWs !== excludeWs && clientWs.readyState === 1) {
            clientWs.send(messageStr);
        }
    }
}

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
