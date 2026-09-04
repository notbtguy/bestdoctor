// ==========================================
// HOST LOGIC (LAPTOP / SCREEN)
// ==========================================
function initHost() {
    document.getElementById('host-lobby').style.display = 'flex';

    peer = new Peer(peerConfig);

    peer.on('open', (id) => {
        console.log('Host ID:', id);
        const controllerUrl = `${window.location.origin}${window.location.pathname}?mode=controller&host=${id}`;

        new QRCode(document.getElementById("qrcode"), {
            text: controllerUrl,
            width: 200,
            height: 200,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
    });

    peer.on('connection', (connection) => {
        conn = connection;
        document.getElementById('connection-status').innerText = "Controller Connected! Starting surgery...";
        document.getElementById('connection-status').className = "text-sm font-bold text-green-600";

        conn.on('open', () => {
            conn.send({ type: 'handshake', status: 'ready' });
        });

        setTimeout(() => {
            document.getElementById('host-lobby').style.display = 'none';
            startGame();
        }, 1000);

        conn.on('data', (data) => {
            if (data.type === 'cursor') {
                Game.setCursor(data.x, data.y);
            } else if (data.type === 'tool') {
                Game.setTool(data.tool);
            } else if (data.type === 'action') {
                Game.performAction();
            }
        });

        conn.on('close', () => {
            document.getElementById('connection-status').innerText = "Controller disconnected.";
        });
    });

    peer.on('error', (err) => {
        console.error("Host peer error:", err);
        document.getElementById('connection-status').innerText = "Connection Error. Refresh page.";
        document.getElementById('connection-status').className = "text-red-600 font-bold text-sm";
    });
}

function startGame() {
    const canvas = document.getElementById('game-canvas');
    Game.init(canvas);

    // Relay in-game feedback (right tool / wrong tool / stitch progress etc.)
    // back to the phone so the surgeon gets on-screen text + vibration.
    Game.setOnFeedback((result, message) => {
        if (conn && conn.open) {
            conn.send({ type: 'feedback', result, message });
        }
    });
}
