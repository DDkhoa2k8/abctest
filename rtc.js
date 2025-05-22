// Configuration
const config = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        // Add more STUN/TURN servers here if needed
    ]
};

// DOM elements
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const statusDiv = document.getElementById('status');

// WebRTC variables
let peerConnection;
let dataChannel;
let makingOffer = false;
let ignoreOffer = false;

// Signaling simulation (replace with actual signaling server in production)
const signaling = {
    sendOffer: null,
    sendAnswer: null,
    sendIceCandidate: null,
    
    onOffer: null,
    onAnswer: null,
    onIceCandidate: null
};

// Initialize the app
init();

function init() {
    // Set up signaling simulation
    setupSignalingSimulation();
    
    // Set up event listeners
    sendButton.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    
    // For demo purposes, automatically start connection
    setTimeout(startConnection, 1000);
}

function setupSignalingSimulation() {
    signaling.sendOffer = (offer) => {
        console.log("Sending offer:", offer);
        setTimeout(() => signaling.onOffer && signaling.onOffer(offer), 500);
    };
    
    signaling.sendAnswer = (answer) => {
        console.log("Sending answer:", answer);
        setTimeout(() => signaling.onAnswer && signaling.onAnswer(answer), 500);
    };
    
    signaling.sendIceCandidate = (candidate) => {
        console.log("Sending ICE candidate:", candidate);
        setTimeout(() => signaling.onIceCandidate && signaling.onIceCandidate(candidate), 500);
    };
}

async function startConnection() {
    try {
        statusDiv.textContent = "Starting connection...";
        
        // Create peer connection if it doesn't exist
        if (!peerConnection) {
            peerConnection = new RTCPeerConnection(config);
            
            // Set up event handlers
            peerConnection.onicecandidate = handleICECandidateEvent;
            peerConnection.oniceconnectionstatechange = handleICEConnectionStateChangeEvent;
            peerConnection.onsignalingstatechange = handleSignalingStateChangeEvent;
            peerConnection.onnegotiationneeded = handleNegotiationNeeded;
            
            // Create data channel
            dataChannel = peerConnection.createDataChannel('chat');
            setupDataChannel(dataChannel);
        }
        
        makingOffer = true;
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        signaling.sendOffer(offer);
        
        statusDiv.textContent = "Offer sent, waiting for answer...";
    } catch (error) {
        console.error("Error starting connection:", error);
        statusDiv.textContent = "Error: " + error.message;
        makingOffer = false;
    }
}

async function handleNegotiationNeeded() {
    try {
        makingOffer = true;
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        signaling.sendOffer(offer);
    } catch (err) {
        console.error("Negotiation error:", err);
    } finally {
        makingOffer = false;
    }
}

signaling.onOffer = async (offer) => {
    try {
        statusDiv.textContent = "Received offer, processing...";
        
        if (!peerConnection) {
            peerConnection = new RTCPeerConnection(config);
            peerConnection.onicecandidate = handleICECandidateEvent;
            peerConnection.ondatachannel = (event) => {
                dataChannel = event.channel;
                setupDataChannel(dataChannel);
            };
        }
        
        const offerCollision = makingOffer || peerConnection.signalingState != "stable";
        ignoreOffer = !makingOffer && offerCollision;
        
        if (ignoreOffer) {
            return;
        }
        
        if (offerCollision) {
            await Promise.all([
                peerConnection.setLocalDescription({type: "rollback"}),
                peerConnection.setRemoteDescription(offer)
            ]);
        } else {
            await peerConnection.setRemoteDescription(offer);
        }
        
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        signaling.sendAnswer(answer);
        
        statusDiv.textContent = "Answer sent, connecting...";
    } catch (error) {
        console.error("Error handling offer:", error);
        statusDiv.textContent = "Error: " + error.message;
    }
};

signaling.onAnswer = async (answer) => {
    try {
        const readyForAnswer = !makingOffer && (
            peerConnection.signalingState == "have-local-offer" || 
            peerConnection.signalingState == "have-remote-offer"
        );
        
        if (!readyForAnswer) {
            console.warn("Not ready for answer, current state:", peerConnection.signalingState);
            return;
        }
        
        await peerConnection.setRemoteDescription(answer);
        statusDiv.textContent = "Connection established! Ready to chat.";
    } catch (error) {
        console.error("Error handling answer:", error);
        statusDiv.textContent = "Error: " + error.message;
    }
};

signaling.onIceCandidate = async (candidate) => {
    try {
        if (ignoreOffer) return;
        await peerConnection.addIceCandidate(candidate);
    } catch (error) {
        console.error("Error adding ICE candidate:", error);
    }
};

function handleICECandidateEvent(event) {
    if (event.candidate) {
        signaling.sendIceCandidate(event.candidate);
    }
}

function handleICEConnectionStateChangeEvent() {
    const state = peerConnection.iceConnectionState;
    console.log("ICE connection state changed to:", state);
    
    if (state === 'connected') {
        statusDiv.textContent = "Connected! Ready to chat.";
    } else if (state === 'disconnected' || state === 'failed') {
        statusDiv.textContent = `Connection ${state}. Try refreshing.`;
        // Optional: implement reconnect logic here
    }
}

function handleSignalingStateChangeEvent() {
    console.log("Signaling state changed to:", peerConnection.signalingState);
}

function setupDataChannel(channel) {
    channel.onopen = () => {
        console.log("Data channel opened");
        statusDiv.textContent = "Connected! Ready to chat.";
    };
    
    channel.onclose = () => {
        console.log("Data channel closed");
        statusDiv.textContent = "Connection closed";
    };
    
    channel.onmessage = (event) => {
        addMessageToChat(`Peer: ${event.data}`);
    };
    
    channel.onerror = (error) => {
        console.error("Data channel error:", error);
        statusDiv.textContent = "Error in connection";
    };
}

function sendMessage() {
    const message = messageInput.value.trim();
    if (message && dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(message);
        addMessageToChat(`You: ${message}`);
        messageInput.value = '';
    }
}

function addMessageToChat(message) {
    const messageElement = document.createElement('div');
    messageElement.textContent = message;
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Utility function to restart connection
function restartConnection() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    startConnection();
}