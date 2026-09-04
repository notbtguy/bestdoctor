// ==========================================
// SURGERY GAME LOGIC (HOST ONLY)
// Coin-removal surgery: incision -> extract coin -> stitch
// ==========================================

const Game = (() => {
    let canvas, ctx;
    let width = 0, height = 0;

    // Cursor position, normalized 0-1 (received from phone gyro)
    let cursorX = 0.5;
    let cursorY = 0.5;

    let selectedTool = 'scalpel';

    // States: 'closed' -> 'open' -> 'stitching' -> 'done' | 'failed'
    let state = 'closed';
    let stitchCount = 0;
    const STITCHES_NEEDED = 3;

    let lives = 3;
    let score = 0;
    let startTime = null;
    let elapsedSeconds = 0;

    // Feedback message shown briefly on screen (e.g. "Wrong tool!")
    let feedbackMsg = '';
    let feedbackTimer = 0;
    let feedbackColor = '#ef4444';

    // Callback fired when host should tell the controller the result
    // of an action (for vibration / on-phone feedback text).
    let onFeedbackCallback = null;

    // Target zones (normalized coordinates, relative to canvas)
    const incisionZone = { x: 0.5, y: 0.52, w: 0.14, h: 0.05 }; // rect (w/h are half-extents)
    const coinPos = { x: 0.5, y: 0.53 };
    const coinRadius = 0.02;

    let restartBtnBounds = null; // set when drawing end screen, used for click-to-restart

    function init(canvasEl) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        resize();
        window.addEventListener('resize', resize);
        canvas.addEventListener('click', handleCanvasClick);
        startTime = Date.now();
        requestAnimationFrame(loop);
    }

    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    }

    function setOnFeedback(cb) {
        onFeedbackCallback = cb;
    }

    function setCursor(nx, ny) {
        cursorX = Math.min(1, Math.max(0, nx));
        cursorY = Math.min(1, Math.max(0, ny));
    }

    function setTool(tool) {
        selectedTool = tool;
    }

    function withinRect(px, py, zone) {
        return Math.abs(px - zone.x) < zone.w && Math.abs(py - zone.y) < zone.h;
    }

    function withinCircle(px, py, circle, r) {
        const dx = px - circle.x;
        const dy = py - circle.y;
        return Math.sqrt(dx * dx + dy * dy) < r;
    }

    function flashFeedback(msg, color) {
        feedbackMsg = msg;
        feedbackColor = color;
        feedbackTimer = 90; // frames (~1.5s at 60fps)
    }

    function sendPhoneFeedback(result, message) {
        if (onFeedbackCallback) onFeedbackCallback(result, message);
    }

    function loseLife() {
        lives -= 1;
        if (lives <= 0) {
            state = 'failed';
        }
    }

    function performAction() {
        if (state === 'done' || state === 'failed') return;

        if (state === 'closed') {
            if (selectedTool !== 'scalpel') {
                flashFeedback('Wrong tool — use the SCALPEL', '#ef4444');
                sendPhoneFeedback('fail', 'Use the scalpel on the incision line');
                loseLife();
                return;
            }
            if (!withinRect(cursorX, cursorY, incisionZone)) {
                flashFeedback('Move to the incision line', '#f59e0b');
                sendPhoneFeedback('fail', 'Missed — move over the incision line');
                loseLife();
                return;
            }
            state = 'open';
            flashFeedback('Incision made — remove the coin!', '#22c55e');
            sendPhoneFeedback('success', 'Incision made! Switch to forceps');
            return;
        }

        if (state === 'open') {
            if (selectedTool !== 'forceps') {
                flashFeedback('Wrong tool — use the FORCEPS', '#ef4444');
                sendPhoneFeedback('fail', 'Use the forceps to grab the coin');
                loseLife();
                return;
            }
            if (!withinCircle(cursorX, cursorY, coinPos, coinRadius * 1.8)) {
                flashFeedback('Get closer to the coin', '#f59e0b');
                sendPhoneFeedback('fail', 'Missed the coin — get closer');
                loseLife();
                return;
            }
            state = 'stitching';
            score += 100;
            flashFeedback('Coin removed! Now stitch the wound', '#22c55e');
            sendPhoneFeedback('success', 'Coin removed! Switch to needle');
            return;
        }

        if (state === 'stitching') {
            if (selectedTool !== 'needle') {
                flashFeedback('Wrong tool — use the NEEDLE', '#ef4444');
                sendPhoneFeedback('fail', 'Use the needle to stitch the wound');
                loseLife();
                return;
            }
            if (!withinRect(cursorX, cursorY, incisionZone)) {
                flashFeedback('Move to the wound to stitch', '#f59e0b');
                sendPhoneFeedback('fail', 'Missed — move over the wound');
                loseLife();
                return;
            }
            stitchCount += 1;
            score += 50;
            if (stitchCount >= STITCHES_NEEDED) {
                state = 'done';
                elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
                flashFeedback('Surgery complete!', '#22c55e');
                sendPhoneFeedback('success', 'Surgery complete! Great job, doctor.');
            } else {
                flashFeedback(`Stitch ${stitchCount}/${STITCHES_NEEDED}`, '#22c55e');
                sendPhoneFeedback('success', `Stitch ${stitchCount}/${STITCHES_NEEDED}`);
            }
            return;
        }
    }

    function restart() {
        state = 'closed';
        stitchCount = 0;
        lives = 3;
        score = 0;
        startTime = Date.now();
        feedbackMsg = '';
    }

    function handleCanvasClick(e) {
        if ((state === 'done' || state === 'failed') && restartBtnBounds) {
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const b = restartBtnBounds;
            if (mx > b.x && mx < b.x + b.w && my > b.y && my < b.y + b.h) {
                restart();
            }
        }
    }

    // ---------------- DRAWING ----------------

    function loop() {
        draw();
        requestAnimationFrame(loop);
    }

    function draw() {
        // Background: hospital teal grid
        ctx.fillStyle = '#0d3b3e';
        ctx.fillRect(0, 0, width, height);
        drawGrid();

        drawPatient();

        if (state === 'closed') drawIncisionTarget();
        if (state === 'open' || state === 'stitching') drawOpenWound();
        if (state === 'stitching') drawStitches();

        drawCursor();
        drawHUD();

        if (feedbackTimer > 0) {
            drawFeedback();
            feedbackTimer--;
        }

        if (state === 'done') drawEndScreen(true);
        if (state === 'failed') drawEndScreen(false);
    }

    function drawGrid() {
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        const step = 40;
        for (let x = 0; x < width; x += step) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        for (let y = 0; y < height; y += step) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
    }

    function drawPatient() {
        const cx = width * 0.5;
        const cy = height * 0.58;
        const rw = width * 0.32;
        const rh = height * 0.32;

        // Blanket / drape
        ctx.fillStyle = '#2f6b58';
        ctx.fillRect(0, cy + rh * 0.5, width, height);

        // Skin gradient
        const grad = ctx.createRadialGradient(cx, cy - rh * 0.3, 10, cx, cy, rw);
        grad.addColorStop(0, '#f2c9a0');
        grad.addColorStop(1, '#d9a878');
        ctx.fillStyle = grad;
        roundRect(cx - rw, cy - rh, rw * 2, rh * 2, rw * 0.35);
        ctx.fill();

        // Surgical drape opening (blue cloth with cutout around belly)
        ctx.fillStyle = 'rgba(37, 99, 150, 0.55)';
        ctx.fillRect(0, 0, width, cy - rh * 0.7);
        ctx.fillRect(0, 0, cx - rw * 0.75, height);
        ctx.fillRect(cx + rw * 0.75, 0, width - (cx + rw * 0.75), height);
    }

    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function drawIncisionTarget() {
        const x = incisionZone.x * width;
        const y = incisionZone.y * height;
        const w = incisionZone.w * width;
        const h = incisionZone.h * height;

        ctx.save();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);
        roundRect(x - w, y - h, w * 2, h * 2, 10);
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('INCISION LINE', x, y - h - 10);
    }

    function drawOpenWound() {
        const x = incisionZone.x * width;
        const y = incisionZone.y * height;
        const w = incisionZone.w * width;
        const h = incisionZone.h * height;

        // Dark wound cavity
        ctx.fillStyle = '#7a1f1f';
        roundRect(x - w, y - h, w * 2, h * 2, 10);
        ctx.fill();

        // Blood edge
        ctx.strokeStyle = '#b91c1c';
        ctx.lineWidth = 4;
        roundRect(x - w, y - h, w * 2, h * 2, 10);
        ctx.stroke();

        // Coin (only while not yet removed)
        if (state === 'open') {
            const coinX = coinPos.x * width;
            const coinY = coinPos.y * height;
            const r = coinRadius * width;

            const coinGrad = ctx.createRadialGradient(coinX - r * 0.3, coinY - r * 0.3, r * 0.1, coinX, coinY, r);
            coinGrad.addColorStop(0, '#fde68a');
            coinGrad.addColorStop(1, '#b45309');
            ctx.fillStyle = coinGrad;
            ctx.beginPath();
            ctx.arc(coinX, coinY, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#78350f';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    function drawStitches() {
        const x = incisionZone.x * width;
        const y = incisionZone.y * height;
        const w = incisionZone.w * width;

        for (let i = 0; i < stitchCount; i++) {
            const sx = x - w + (w * 2 * (i + 1)) / (STITCHES_NEEDED + 1);
            ctx.strokeStyle = '#111827';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(sx - 6, y - 10);
            ctx.lineTo(sx + 6, y + 10);
            ctx.moveTo(sx + 6, y - 10);
            ctx.lineTo(sx - 6, y + 10);
            ctx.stroke();
        }
    }

    function drawCursor() {
        const x = cursorX * width;
        const y = cursorY * height;

        ctx.save();
        ctx.translate(x, y);

        if (selectedTool === 'scalpel') {
            ctx.strokeStyle = '#e5e7eb';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(-18, 18);
            ctx.lineTo(6, -6);
            ctx.stroke();
            ctx.fillStyle = '#cbd5e1';
            ctx.beginPath();
            ctx.moveTo(6, -6);
            ctx.lineTo(20, -20);
            ctx.lineTo(10, -2);
            ctx.closePath();
            ctx.fill();
        } else if (selectedTool === 'forceps') {
            ctx.strokeStyle = '#d1d5db';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(-10, -16);
            ctx.lineTo(-2, 0);
            ctx.moveTo(10, -16);
            ctx.lineTo(2, 0);
            ctx.stroke();
        } else if (selectedTool === 'needle') {
            ctx.strokeStyle = '#d1d5db';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, 14, Math.PI * 0.2, Math.PI * 1.5);
            ctx.stroke();
            ctx.strokeStyle = '#60a5fa';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(10, -10);
            ctx.lineTo(28, 6);
            ctx.stroke();
        }

        // Crosshair dot
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    function drawHUD() {
        ctx.textAlign = 'left';

        // Lives (hearts)
        ctx.font = '22px sans-serif';
        ctx.fillStyle = '#ef4444';
        let heartStr = '';
        for (let i = 0; i < lives; i++) heartStr += '♥ ';
        ctx.fillText(heartStr.trim(), 20, 40);

        // Score
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText('Score: ' + score, 20, 68);

        // Selected tool
        ctx.fillStyle = '#93c5fd';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText('Tool: ' + selectedTool.toUpperCase(), 20, 90);

        // Instruction banner
        let instruction = '';
        if (state === 'closed') instruction = 'Use the SCALPEL to open the incision line';
        else if (state === 'open') instruction = 'Use the FORCEPS to remove the coin';
        else if (state === 'stitching') instruction = `Use the NEEDLE to stitch the wound (${stitchCount}/${STITCHES_NEEDED})`;

        if (instruction) {
            ctx.textAlign = 'center';
            ctx.font = 'bold 18px sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.fillText(instruction, width / 2, 40);
        }
    }

    function drawFeedback() {
        ctx.save();
        ctx.globalAlpha = Math.min(1, feedbackTimer / 20);
        ctx.textAlign = 'center';
        ctx.font = 'bold 24px sans-serif';
        ctx.fillStyle = feedbackColor;
        ctx.fillText(feedbackMsg, width / 2, height * 0.75);
        ctx.restore();
    }

    function drawEndScreen(success) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, width, height);

        ctx.textAlign = 'center';
        ctx.fillStyle = success ? '#22c55e' : '#ef4444';
        ctx.font = 'bold 48px sans-serif';
        ctx.fillText(success ? 'Surgery Successful!' : 'Surgery Failed', width / 2, height / 2 - 60);

        ctx.fillStyle = '#ffffff';
        ctx.font = '20px sans-serif';
        if (success) {
            ctx.fillText(`Score: ${score}  •  Time: ${elapsedSeconds}s`, width / 2, height / 2 - 10);
        } else {
            ctx.fillText(`Score: ${score}`, width / 2, height / 2 - 10);
        }

        // Restart button
        const bw = 220, bh = 56;
        const bx = width / 2 - bw / 2;
        const by = height / 2 + 30;
        restartBtnBounds = { x: bx, y: by, w: bw, h: bh };

        ctx.fillStyle = '#2563eb';
        roundRect(bx, by, bw, bh, 12);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText('Restart Surgery', width / 2, by + bh / 2 + 6);
    }

    return {
        init,
        setCursor,
        setTool,
        performAction,
        setOnFeedback
    };
})();
