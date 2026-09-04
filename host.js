// ==========================================
// HOST LOGIC (LAPTOP / SCREEN)
// ==========================================
function initHost() {
    document.getElementById('host-lobby').style.display = 'flex';

    // Try fullscreen after the first user gesture; lobby also has a start button.
    const enterHostFullscreen = async () => {
        try {
            if (!document.fullscreenElement && document.documentElement.requestFullscreen)
                await document.documentElement.requestFullscreen();
        } catch (_) {}
        try { await screen.orientation?.lock?.('landscape'); } catch (_) {}
    };
    document.getElementById('btn-host-fullscreen')?.addEventListener('click', enterHostFullscreen);

    peer = new Peer(peerConfig);

    peer.on('open', (id) => {
        const controllerUrl = `${window.location.origin}${window.location.pathname}?mode=controller&host=${id}`;
        new QRCode(document.getElementById("qrcode"), {
            text: controllerUrl, width: 220, height: 220,
            colorDark: "#071217", colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
    });

    peer.on('connection', (connection) => {
        conn = connection;
        const status = document.getElementById('connection-status');
        status.innerText = "Controller Connected! Starting surgery...";
        status.className = "text-sm font-bold text-green-600";

        conn.on('open', () => conn.send({type:'handshake',status:'ready'}));

        setTimeout(() => {
            document.getElementById('host-lobby').style.display = 'none';
            startGame();
        }, 900);

        conn.on('data', data => {
            if(data.type==='cursor') Game.setCursor(data.x,data.y);
            else if(data.type==='tool') Game.setTool(data.tool);
            else if(data.type==='action') Game.performAction();
        });
        conn.on('close',()=> status.innerText="Controller disconnected.");
    });

    peer.on('error', err => {
        const status=document.getElementById('connection-status');
        status.innerText="Connection Error. Refresh page.";
        status.className="text-red-600 font-bold text-sm";
        console.error(err);
    });
}

function startGame() {
    const canvas=document.getElementById('game-canvas');
    Game.init(canvas);
    Game.setOnFeedback((result,message)=>{
        if(conn?.open) conn.send({type:'feedback',result,message});
    });
}
