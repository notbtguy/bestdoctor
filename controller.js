// ==========================================
// CONTROLLER LOGIC (PHONE)
// LANDSCAPE GYRO AXIS FIX
// ==========================================
// Phone is held horizontally like a POV game controller.
//
// SCREEN-RELATIVE CONTROL:
//   tilt LEFT / RIGHT -> surgical hand LEFT / RIGHT
//   tilt UP / DOWN     -> surgical hand UP / DOWN
//
// Handles both Android landscape orientations (90° / 270°).
// ==========================================

function initController(hostPeerId) {
    document.getElementById('controller-ui').style.display = 'flex';

    const statusEl = document.getElementById('ctrl-status');
    const debugEl = document.getElementById('gyro-debug');
    const feedbackEl = document.getElementById('tool-feedback');

    let selectedTool = 'scalpel';
    let filteredX = 0.5;
    let filteredY = 0.5;
    let lastSend = 0;
    let orientationActive = false;
    let lastScreenAngle = getScreenAngle();

    const vibrate = (pattern) => {
        try {
            if (navigator.vibrate) navigator.vibrate(pattern);
        } catch (_) {}
    };

    function getScreenAngle() {
        if (screen.orientation && typeof screen.orientation.angle === 'number') {
            return screen.orientation.angle;
        }

        if (typeof window.orientation === 'number') {
            let angle = window.orientation;
            if (angle < 0) angle += 360;
            return angle;
        }

        return 0;
    }

    // Convert DeviceOrientation's physical beta/gamma axes into
    // axes that match what the user sees on the LANDSCAPE screen.
    function getScreenRelativeAxes(beta, gamma) {
        const angle = ((getScreenAngle() % 360) + 360) % 360;

        if (angle >= 45 && angle < 135) {
            // Landscape 90°:
            // physical beta controls screen left/right
            // physical gamma controls screen up/down
            return {
                horizontal: beta,
                vertical: -gamma,
                angle: 90
            };
        }

        if (angle >= 225 && angle < 315) {
            // Landscape 270°:
            // same axes, opposite direction
            return {
                horizontal: -beta,
                vertical: gamma,
                angle: 270
            };
        }

        // Fallback for portrait / browsers that do not report orientation.
        return {
            horizontal: gamma,
            vertical: beta,
            angle: 0
        };
    }

    async function enterFullscreen() {
        try {
            if (!document.fullscreenElement &&
                document.documentElement.requestFullscreen) {
                await document.documentElement.requestFullscreen();
            }
        } catch (_) {}

        try {
            if (screen.orientation?.lock) {
                await screen.orientation.lock('landscape');
            }
        } catch (_) {}

        lastScreenAngle = getScreenAngle();
    }

    function recalibrate() {
        // Calibration is done AFTER converting to screen-relative axes.
        // This prevents the old portrait-axis mapping from affecting
        // landscape movement.
        isCalibrated = false;
        filteredX = 0.5;
        filteredY = 0.5;
        debugEl.innerText = 'Hold naturally — recentering...';
        vibrate(20);
    }

    document.getElementById('btn-start-gyro').addEventListener('click', async () => {
        await enterFullscreen();

        statusEl.innerText = 'Requesting motion permission...';
        statusEl.className = 'mt-4 text-sm font-bold text-cyan-300';

        if (typeof DeviceOrientationEvent !== 'undefined' &&
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const permissionState =
                    await DeviceOrientationEvent.requestPermission();

                if (permissionState !== 'granted') {
                    statusEl.innerText = 'Motion permission denied.';
                    statusEl.className = 'mt-4 text-sm font-bold text-red-400';
                    return;
                }
            } catch (e) {
                console.error(e);
                statusEl.innerText =
                    'Could not access motion sensors. Use HTTPS.';
                statusEl.className = 'mt-4 text-sm font-bold text-red-400';
                return;
            }
        }

        statusEl.innerText = 'Connecting to laptop...';

        peer = new Peer(peerConfig);

        peer.on('open', () => {
            statusEl.innerText =
                'Connected to signaling. Opening controller link...';

            conn = peer.connect(hostPeerId, { reliable: true });

            const timeout = setTimeout(() => {
                if (!conn.open) {
                    const ice = conn.peerConnection
                        ? conn.peerConnection.iceConnectionState
                        : 'unknown';

                    statusEl.innerHTML =
                        `Could not reach laptop.<br>ICE: <b>${ice}</b>`;

                    statusEl.className =
                        'mt-4 text-sm font-bold text-red-400';
                }
            }, 12000);

            conn.on('open', () => {
                clearTimeout(timeout);
                activateControllerUI();
            });

            conn.on('data', data => {
                if (data.type === 'handshake' && data.status === 'ready') {
                    activateControllerUI();
                }

                if (data.type === 'feedback') {
                    handleFeedback(data.result, data.message);
                }
            });

            conn.on('error', err => {
                statusEl.innerText =
                    'Connection error: ' + (err.type || err.message || err);
                statusEl.className =
                    'mt-4 text-sm font-bold text-red-400';
            });

            conn.on('close', () => {
                statusEl.innerText = 'Disconnected from laptop.';
                statusEl.className =
                    'mt-4 text-sm font-bold text-red-400';
            });
        });

        peer.on('error', err => {
            statusEl.innerText =
                'Failed to connect: ' + (err.type || 'unknown error');
            statusEl.className =
                'mt-4 text-sm font-bold text-red-400';
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

            window.addEventListener(
                'deviceorientation',
                handleOrientation,
                true
            );

            const orientationChanged = () => {
                lastScreenAngle = getScreenAngle();

                // Recenter after a physical screen rotation so the
                // cursor never jumps unexpectedly.
                isCalibrated = false;
                filteredX = 0.5;
                filteredY = 0.5;

                debugEl.innerText =
                    'Landscape orientation changed — recentering...';
            };

            window.addEventListener(
                'orientationchange',
                orientationChanged,
                true
            );

            screen.orientation?.addEventListener?.(
                'change',
                orientationChanged
            );
        }

        recalibrate();

        setTimeout(() => {
            if (!hasReceivedGyroData) {
                debugEl.innerHTML =
                    '<span class="text-red-400 font-bold">' +
                    'No motion data detected.</span><br>' +
                    'Check sensor permissions or browser support.';
            }
        }, 4000);
    }

    document
        .getElementById('btn-recalibrate')
        .addEventListener('click', recalibrate);

    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document
                .querySelectorAll('.tool-btn')
                .forEach(b => b.classList.remove('selected'));

            btn.classList.add('selected');
            selectedTool = btn.dataset.tool;

            if (conn?.open) {
                conn.send({
                    type: 'tool',
                    tool: selectedTool
                });
            }

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

        if (conn?.open) {
            conn.send({ type: 'action' });
        }

        vibrate(28);
    };

    btnAction.addEventListener('pointerdown', doAction);

    function handleFeedback(result, message) {
        feedbackEl.innerText = message || '';

        feedbackEl.className =
            'text-sm font-black mt-2 text-center px-4 h-7 ' +
            (result === 'success'
                ? 'text-emerald-400'
                : 'text-rose-400');

        if (result === 'success') {
            vibrate([25, 35, 25]);
        } else {
            vibrate([120, 40, 80]);
        }

        clearTimeout(handleFeedback.timer);

        handleFeedback.timer = setTimeout(() => {
            feedbackEl.innerText = '';
        }, 2200);
    }

    function handleOrientation(event) {
        if (event.beta == null || event.gamma == null) return;

        hasReceivedGyroData = true;

        const beta = event.beta;
        const gamma = event.gamma;

        // THIS is the actual landscape correction.
        const axes = getScreenRelativeAxes(beta, gamma);

        const horizontal = axes.horizontal;
        const vertical = axes.vertical;
        const angle = axes.angle;

        if (angle !== lastScreenAngle) {
            lastScreenAngle = angle;
            isCalibrated = false;
            filteredX = 0.5;
            filteredY = 0.5;

            debugEl.innerText =
                `Landscape ${angle}° • recentering...`;

            return;
        }

        debugEl.innerText =
            `Landscape ${angle}°  •  ` +
            `LEFT/RIGHT ${Math.round(horizontal)}°  •  ` +
            `UP/DOWN ${Math.round(vertical)}°`;

        if (!isCalibrated) {
            // Store screen-relative values, NOT raw beta/gamma.
            baseGamma = horizontal;
            baseBeta = vertical;

            isCalibrated = true;
            filteredX = 0.5;
            filteredY = 0.5;
            return;
        }

        if (!conn?.open) return;

        let dx = horizontal - baseGamma;
        let dy = vertical - baseBeta;

        if (Math.abs(dx) < gyroConfig.deadZone) dx = 0;
        if (Math.abs(dy) < gyroConfig.deadZone) dy = 0;

        const curve = value => {
            const normalized =
                Math.min(
                    1,
                    Math.abs(value) / gyroConfig.sensitivity
                );

            return Math.sign(value) *
                Math.pow(normalized, 0.82);
        };

        let targetX =
            0.5 +
            curve(dx) *
            0.5 *
            (gyroConfig.invertX ? -1 : 1);

        let targetY =
            0.5 +
            curve(dy) *
            0.5 *
            (gyroConfig.invertY ? -1 : 1);

        targetX = Math.max(0, Math.min(1, targetX));
        targetY = Math.max(0, Math.min(1, targetY));

        filteredX +=
            (targetX - filteredX) *
            gyroConfig.smoothing;

        filteredY +=
            (targetY - filteredY) *
            gyroConfig.smoothing;

        const now = performance.now();

        if (now - lastSend >= gyroConfig.sendIntervalMs) {
            lastSend = now;

            conn.send({
                type: 'cursor',
                x: filteredX,
                y: filteredY
            });
        }
    }
}
