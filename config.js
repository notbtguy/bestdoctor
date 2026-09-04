// ==========================================
// SHARED CONFIG & STATE
// ==========================================
const peerConfig = {
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            {
                urls: 'turn:openrelay.metered.ca:80',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:443',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            }
        ]
    }
};

let peer;
let conn;

let baseBeta = 0;
let baseGamma = 0;
let isCalibrated = false;
let hasReceivedGyroData = false;
let gyroDebugTimeout = null;

// Controller tuning
const gyroConfig = {
    sensitivity: 34,
    deadZone: 1.5,
    smoothing: 0.18,
    sendIntervalMs: 22,
    invertX: false,
    invertY: false
};
