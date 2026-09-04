// ==========================================
// SHARED CONFIG & STATE
// ==========================================

// Same fix as the flight sim: "urls" (plural) not "url", plus a TURN
// relay fallback for phones on cellular/carrier-NAT networks.
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

// Calibration
let baseBeta = 0;
let baseGamma = 0;
let isCalibrated = false;

// Gyro debug tracking
let hasReceivedGyroData = false;
let gyroDebugTimeout = null;
