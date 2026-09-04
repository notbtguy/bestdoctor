// ==========================================
// CONTROLLER LOGIC (PHONE)
// ==========================================
function initController(hostPeerId) {
    document.getElementById('controller-ui').style.display = 'flex';
    const statusEl = document.getElementById('ctrl-status');
    const debugEl = document.getElementById('gyro-debug');
    const feedbackEl = document.getElementById('tool-feedback');

    let selectedTool = 'scalpel';

    document.getElementById('btn-start-gyro').addEventListener('click', async () => {
        statusEl.innerText = "Requesting permissions...";
        statusEl.className = "mt-4 text-sm font-bold text-blue-500";

        // iOS 13+ requires an explicit permission prompt for motion sensors
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const permissionState = await DeviceOrientationEvent.requestPermission();
                if (permissionState !== 'granted') {
                    alert('Gyroscope permission is required to play. Please allow it or check your device settings.');
                    statusEl.innerText = "Permission denied.";
                    statusEl.className = "mt-4 text-sm font-bold text-red-500";
                    return;
                }
            } catch (e) {
                console.error("Error requesting DeviceOrientation:", e);
                alert("Could not request gyroscope permission. Make sure you are on HTTPS.");
                return;
            }
        }

        statusEl.innerText = "Connecting to Laptop...";

        peer = new Peer(peerConfig);

        peer.on('open', (myId) => {
            statusEl.innerText = "Signaling OK. Opening data channel...";
            conn = peer.connect(hostPeerId, { reliable: true });

            const connectTimeout = setTimeout(() => {
                if (!conn.open) {
                    const iceState = conn.peerConnection ? conn.peerConnection.iceConnectionState : 'unknown';
                    statusEl.innerHTML = `Couldn't reach the laptop.<br>ICE state: <b>${iceState}</b><br>Try both devices on the same WiFi to test.`;
                    statusEl.className = "mt-4 text-sm font-bold text-red-500";
                }
            }, 12000);

            conn.on('open', () => {
                clearTimeout(connectTimeout);
                activateControllerUI();
            });

            conn.on('data', (data) => {
                if (data.type === 'handshake' && data.status === 'ready') {
                    clearTimeout(connectTimeout);
                    activateControllerUI();
                } else if (data.type === 'feedback') {
                    handleFeedback(data.result, data.message);
                }
            });

            conn.on('error', (err) => {
                console.error("Connection error:", err);
                statusEl.innerText = "Connection error: " + (err.type || err.message || err);
                statusEl.className = "mt-4 text-sm font-bold text-red-500";
            });

            conn.on('close', () => {
                statusEl.innerText = "Disconnected from laptop.";
                statusEl.className = "mt-4 text-sm font-bold text-red-500";
            });
        });

        peer.on('error', (err) => {
            console.error("Peer error:", err);
            statusEl.innerText = "Failed to connect: " + err.type;
            statusEl.className = "mt-4 text-sm font-bold text-red-500";
        });

        peer.on('disconnected', () => {
            statusEl.innerText = "Lost connection to signaling server, retrying...";
            peer.reconnect();
        });
    });

    function activateControllerUI() {
        document.getElementById('controller-setup').style.display = 'none';
        document.getElementById('controller-active').style.display = 'flex';

        window.addEventListener('deviceorientation', handleOrientation);

        gyroDebugTimeout = setTimeout(() => {
            if (!hasReceivedGyroData) {
                debugEl.innerHTML = "<span class='text-red-500 font-bold'>No motion detected!</span><br>Check if auto-rotate is on or your browser blocks sensors.";
            }
        }, 3000);
    }

    document.getElementById('btn-recalibrate').addEventListener('click', () => {
        isCalibrated = false;
        debugEl.innerText = "Recalibrating...";
    });

    // --- TOOL SELECT BUTTONS ---
    const toolButtons = document.querySelectorAll('.tool-btn');
    toolButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            toolButtons.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedTool = btn.dataset.tool;
            if (conn && conn.open) conn.send({ type: 'tool', tool: selectedTool });
        });
    });

    // --- OPERATE (ACTION) BUTTON ---
    const btnAction = document.getElementById('btn-action');
    btnAction.addEventListener('touchstart', (e) => { e.preventDefault(); doAction(); });
    btnAction.addEventListener('mousedown', doAction);

    function doAction() {
        if (conn && conn.open) conn.send({ type: 'action' });
        if (navigator.vibrate) navigator.vibrate(30);
    }

    function handleFeedback(result, message) {
        feedbackEl.innerText = message || '';
        feedbackEl.className = "text-sm font-bold mt-2 text-center px-4 h-6 " +
            (result === 'success' ? 'text-green-600' : 'text-red-500');

        if (navigator.vibrate) {
            if (result === 'success') navigator.vibrate([40, 40, 40]);
            else navigator.vibrate(150);
        }

        setTimeout(() => { feedbackEl.innerText = ''; }, 2000);
    }

    // --- GYROSCOPE -> CURSOR POSITION ---
    function handleOrientation(event) {
        if (event.beta === null || event.gamma === null) return;

        if (!hasReceivedGyroData) {
            hasReceivedGyroData = true;
            clearTimeout(gyroDebugTimeout);
        }

        let beta = event.beta;   // front/back tilt [-180, 180]
        let gamma = event.gamma; // left/right tilt [-90, 90]

        document.getElementById('gyro-debug').innerText = `Pitch: ${Math.round(beta)}° | Roll: ${Math.round(gamma)}°`;

        if (!isCalibrated) {
            baseBeta = beta;
            baseGamma = gamma;
            isCalibrated = true;
            return;
        }

        if (!conn || !conn.open) return;

        // Difference from calibrated center point
        let diffBeta = beta - baseBeta;   // negative = tilted forward (up)
        let diffGamma = gamma - baseGamma; // negative = tilted left

        // Map tilt degrees to a normalized 0-1 cursor position around center (0.5, 0.5).
        // Sensitivity: 40 degrees of tilt reaches the edge of the screen.
        const sensitivity = 40;
        let nx = 0.5 + (diffGamma / sensitivity) * 0.5;
        let ny = 0.5 + (diffBeta / sensitivity) * 0.5;

        nx = Math.min(1, Math.max(0, nx));
        ny = Math.min(1, Math.max(0, ny));

        conn.send({ type: 'cursor', x: nx, y: ny });
    }
}
