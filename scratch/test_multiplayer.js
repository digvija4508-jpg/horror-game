const WebSocket = require('ws');

const url = 'ws://localhost:8000';

console.log('--- STARTING MULTIPLAYER FLOW TEST ---');

// Client 1 connects
const ws1 = new WebSocket(url);

ws1.on('open', () => {
    console.log('Client 1: Connected');
});

ws1.on('message', (data) => {
    const msg = JSON.parse(data);
    console.log('Client 1 Received:', msg);

    if (msg.type === 'init') {
        console.log('Client 1 got init. Sending initial update...');
        ws1.send(JSON.stringify({
            type: 'update',
            x: 1.1,
            y: 1.2,
            z: 1.3,
            yaw: 0.5,
            activeSlot: 1,
            isSprinting: false,
            isFlashlightOn: true
        }));

        // Now connect Client 2
        setTimeout(connectClient2, 500);
    }
});

function connectClient2() {
    console.log('\n--- CONNECTING CLIENT 2 ---');
    const ws2 = new WebSocket(url);

    ws2.on('open', () => {
        console.log('Client 2: Connected');
    });

    ws2.on('message', (data) => {
        const msg = JSON.parse(data);
        console.log('Client 2 Received:', msg);
        
        if (msg.type === 'init') {
            console.log('Client 2 got init. Sending update...');
            ws2.send(JSON.stringify({
                type: 'update',
                x: 2.1,
                y: 2.2,
                z: 2.3,
                yaw: 1.5,
                activeSlot: 1,
                isSprinting: true,
                isFlashlightOn: false
            }));

            // End test after some time
            setTimeout(() => {
                ws1.close();
                ws2.close();
                console.log('\n--- TEST FINISHED ---');
                process.exit(0);
            }, 1000);
        }
    });
}
