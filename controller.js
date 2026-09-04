// ==========================================
// CONTROLLER LOGIC (PHONE)
// ==========================================
function initController(hostPeerId) {
    document.getElementById('controller-ui').style.display = 'flex';

    const statusEl = document.getElementById('ctrl-status');
    const debugEl = document.getElementById('gyro-debug');
    const feedbackEl = document.getElementById('tool-feedback');

    let selectedTool = 'scalpel';
    let filteredX = 0.5, filteredY = 0.5;
    let lastSend = 0;
    let orientationActive = false;

    const vibrate = (pattern) => {
        try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (_) {}
    };

    const enterFullscreen = async () => {
        try {
            if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
                await document.documentElement.requestFullscreen();
            }
        } catch (_) {}
        try { await screen.orientation?.lock?.('landscape'); } catch (_) {}
    };

    const calibrate = () => {
        isCalibrated = false;
        filteredX = 0.5;
        filteredY = 0.5;
        debugEl.innerText = 'Hold the phone naturally... calibrating';
        vibrate(20);
    };

    document.getElementById('btn-start-gyro').addEventListener('click', async () => {
        await enterFullscreen();
        statusEl.innerText = 'Requesting motion permission...';
        statusEl.className = 'mt-4 text-sm font-bold text-cyan-300';

        if (typeof DeviceOrientationEvent !== 'undefined' &&
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const permissionState = await DeviceOrientationEvent.requestPermission();
                if (permissionState !== 'granted') {
                    statusEl.innerText = 'Motion permission denied.';
                    statusEl.className = 'mt-4 text-sm font-bold text-red-400';
                    return;
                }
            } catch (e) {
                console.error(e);
                statusEl.innerText = 'Could not access motion sensors. Use HTTPS.';
                statusEl.className = 'mt-4 text-sm font-bold text-red-400';
                return;
            }
        }

        statusEl.innerText = 'Connecting to laptop...';
        peer = new Peer(peerConfig);

        peer.on('open', () => {
            statusEl.innerText = 'Connected to signaling. Opening controller link...';
            conn = peer.connect(hostPeerId, { reliable: true });

            const timeout = setTimeout(() => {
                if (!conn.open) {
                    const ice = conn.peerConnection ? conn.peerConnection.iceConnectionState : 'unknown';
                    statusEl.innerHTML = `Could not reach laptop.<br>ICE: <b>${ice}</b>`;
                    statusEl.className = 'mt-4 text-sm font-bold text-red-400';
                }
            }, 12000);

            conn.on('open', () => {
                clearTimeout(timeout);
                activateControllerUI();
            });

            conn.on('data', data => {
                if (data.type === 'handshake' && data.status === 'ready') activateControllerUI();
                if (data.type === 'feedback') handleFeedback(data.result, data.message);
            });

            conn.on('error', err => {
                statusEl.innerText = 'Connection error: ' + (err.type || err.message || err);
                statusEl.className = 'mt-4 text-sm font-bold text-red-400';
            });
            conn.on('close', () => {
                statusEl.innerText = 'Disconnected from laptop.';
                statusEl.className = 'mt-4 text-sm font-bold text-red-400';
            });
        });

        peer.on('error', err => {
            statusEl.innerText = 'Failed to connect: ' + (err.type || 'unknown error');
            statusEl.className = 'mt-4 text-sm font-bold text-red-400';
        });
        peer.on('disconnected', () => {
            statusEl.innerText = 'Reconnecting to signaling...';
            try { peer.reconnect(); } catch (_) {}
        });
    });

    function activateControllerUI() {
        document.getElementById('controller-setup').style.display = 'none';
        document.getElementById('controller-active').style.display = 'flex';
        if (!orientationActive) {
            orientationActive = true;
            window.addEventListener('deviceorientation', handleOrientation, true);
        }
        calibrate();
        gyroDebugTimeout = setTimeout(() => {
            if (!hasReceivedGyroData) {
                debugEl.innerHTML = '<span class="text-red-400 font-bold">No motion data detected.</span><br>Check sensor permissions or browser support.';
            }
        }, 4000);
    }

    document.getElementById('btn-recalibrate').addEventListener('click', calibrate);

    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedTool = btn.dataset.tool;
            if (conn?.open) conn.send({ type: 'tool', tool: selectedTool });
            vibrate(18);
        });
    });

    const btnAction = document.getElementById('btn-action');
    let lastTouch = 0;
    const doAction = (e) => {
        if (e) e.preventDefault();
        const now = performance.now();
        if (now - lastTouch < 180) return;
        lastTouch = now;
        if (conn?.open) conn.send({ type: 'action' });
        vibrate(28);
    };
    btnAction.addEventListener('pointerdown', doAction);

    function handleFeedback(result, message) {
        feedbackEl.innerText = message || '';
        feedbackEl.className = 'text-sm font-black mt-2 text-center px-4 h-7 ' +
            (result === 'success' ? 'text-emerald-400' : 'text-rose-400');

        if (result === 'success') vibrate([25, 35, 25]);
        else vibrate([120, 40, 80]);

        clearTimeout(handleFeedback.timer);
        handleFeedback.timer = setTimeout(() => feedbackEl.innerText = '', 2200);
    }

    function handleOrientation(event) {
        if (event.beta == null || event.gamma == null) return;

        hasReceivedGyroData = true;
        clearTimeout(gyroDebugTimeout);

        const beta = event.beta;
        const gamma = event.gamma;

        debugEl.innerText = `Pitch ${Math.round(beta)}°  •  Roll ${Math.round(gamma)}°`;

        if (!isCalibrated) {
            baseBeta = beta;
            baseGamma = gamma;
            isCalibrated = true;
            filteredX = 0.5;
            filteredY = 0.5;
            return;
        }
        if (!conn?.open) return;

        let dx = gamma - baseGamma;
        let dy = beta - baseBeta;

        if (Math.abs(dx) < gyroConfig.deadZone) dx = 0;
        if (Math.abs(dy) < gyroConfig.deadZone) dy = 0;

        // Smooth response; a cubic curve gives finer control near center.
        const curve = v => Math.sign(v) * Math.pow(Math.min(1, Math.abs(v) / gyroConfig.sensitivity), 0.82);
        let targetX = 0.5 + curve(dx) * 0.5 * (gyroConfig.invertX ? -1 : 1);
        let targetY = 0.5 + curve(dy) * 0.5 * (gyroConfig.invertY ? -1 : 1);

        targetX = Math.max(0, Math.min(1, targetX));
        targetY = Math.max(0, Math.min(1, targetY));

        filteredX += (targetX - filteredX) * gyroConfig.smoothing;
        filteredY += (targetY - filteredY) * gyroConfig.smoothing;

        const now = performance.now();
        if (now - lastSend >= gyroConfig.sendIntervalMs) {
            lastSend = now;
            conn.send({ type: 'cursor', x: filteredX, y: filteredY });
        }
    }
}
