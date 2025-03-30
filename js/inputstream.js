// Input stream management for metronome
// This file handles audio input device selection and management

// Input stream variables
var inputStream = null;         // MediaStream for audio input
var inputSource = null;         // MediaStreamAudioSourceNode
var inputGainNode = null;       // Main gain node for input stream
var inputAnalyzerGain = null;   // Gain node for input to analyzer
var inputDestinationGain = null; // Gain node for input to destination
var mediaDevices = [];          // Array to store available media devices
var permissionRequested = false;
var deviceChangeHandler = null; // Single handler for device changes

// Function to populate the input sources dropdown
async function populateInputSources(audioContext) {
    console.log('Populating input sources dropdown...');
    const inputSelect = document.getElementById('inputSource');
    
    try {
        // Get initial device list
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        
        // Check if we need to request permissions (if labels are empty)
        if (audioInputs.length > 0 && !audioInputs[0].label) {
            console.log('No device labels available, requesting permissions...');
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                // Stop the stream right away
                stream.getTracks().forEach(track => track.stop());
                // Re-enumerate devices now that we have permission
                const devicesWithLabels = await navigator.mediaDevices.enumerateDevices();
                audioInputs.length = 0; // Clear array
                audioInputs.push(...devicesWithLabels.filter(device => device.kind === 'audioinput'));
            } catch (err) {
                console.error('Error getting microphone permissions:', err);
            }
        }
        
        // Clear existing options except the default one
        while (inputSelect.options.length > 1) {
            inputSelect.remove(1);
        }
        
        // Add devices to the dropdown
        audioInputs.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Microphone ${inputSelect.options.length}`;
            inputSelect.appendChild(option);
        });
        
        console.log(`Found ${audioInputs.length} audio input devices`);
        
        // Set up device change listener if not already set
        if (!window._deviceChangeListenerSet && !deviceChangeHandler) {
            deviceChangeHandler = async () => {
                console.log('Device change detected');
                // Prevent recursive calls by removing the handler temporarily
                navigator.mediaDevices.removeEventListener('devicechange', deviceChangeHandler);
                await populateInputSources(window.audioContext);
                // Re-add the handler after updating
                navigator.mediaDevices.addEventListener('devicechange', deviceChangeHandler);
            };
            navigator.mediaDevices.addEventListener('devicechange', deviceChangeHandler);
            window._deviceChangeListenerSet = true;
        }
    } catch (err) {
        console.error('Error enumerating audio devices:', err);
    }
}

// Function to get audio devices
function getAudioDevices(audioContext) {
    console.log('Getting audio devices...');
    return navigator.mediaDevices.enumerateDevices();
}

function selectInputSource(deviceId, audioContext, analyzerMixer, destinationMixer) {
    // Handle selecting an input device
    console.log('Selected device ID:', deviceId);
    
    // Request access to the selected input device
    navigator.mediaDevices.getUserMedia({
        audio: {
            deviceId: {exact: deviceId},
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
        }
    })
    .then(stream => {
        // Stop any existing stream
        if (inputStream) {
            const tracks = inputStream.getTracks();
            tracks.forEach(track => track.stop());
        }
        
        // Store the new stream
        inputStream = stream;
        
        // Create a new source if needed, or disconnect the existing one
        if (inputSource) {
            inputSource.disconnect();
        }
        
        // Create audio source from the stream
        inputSource = audioContext.createMediaStreamSource(stream);
        
        // Create gain nodes if they don't exist yet
        if (!inputGainNode) {
            // Main input gain node
            inputGainNode = audioContext.createGain();
            inputGainNode.gain.value = parseFloat(document.getElementById('inputGain').value);
            
            // Create separate gain nodes for each mixer path
            inputAnalyzerGain = audioContext.createGain();
            inputAnalyzerGain.gain.value = parseFloat(document.getElementById('inputAnalyzerGain').value || 0.7);
            
            inputDestinationGain = audioContext.createGain();
            inputDestinationGain.gain.value = parseFloat(document.getElementById('inputDestinationGain').value || 0.7);
        }
        
        // Connect nodes: input source -> main gain -> separate gains -> separate mixers
        inputSource.connect(inputGainNode);
        inputGainNode.connect(inputAnalyzerGain);
        inputGainNode.connect(inputDestinationGain);
        inputAnalyzerGain.connect(analyzerMixer);
        inputDestinationGain.connect(destinationMixer);
        
        console.log('Input source connected to dual mixer system:', deviceId);
    })
    .catch(err => {
        console.error('Error accessing input device:', err);
    });
}

// Function to request microphone permissions
function requestMicrophonePermissions() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.log("Media Devices API not supported in this browser");
        return;
    }

    // Request basic audio permissions to trigger the permission dialog
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            console.log('Microphone permission granted');
            // Stop the stream right away, we don't need it yet
            stream.getTracks().forEach(track => track.stop());
            
            // Now we can populate the dropdown with device labels
            populateInputSources(window.audioContext);
            
            // Device change listener is now handled in populateInputSources
        })
        .catch(err => {
            console.error('Error accessing microphone:', err);
        });
}

// Function to explicitly request microphone permissions with a more visible prompt
function requestMicrophonePermissionsExplicit() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.log("Media Devices API not supported in this browser");
        return;
    }

    console.log("Explicitly requesting microphone permissions...");
    
    // Create a user-visible indication that we need microphone access
    const permissionPrompt = document.createElement('div');
    permissionPrompt.style.position = 'fixed';
    permissionPrompt.style.top = '20%';
    permissionPrompt.style.left = '50%';
    permissionPrompt.style.transform = 'translate(-50%, -50%)';
    permissionPrompt.style.padding = '20px';
    permissionPrompt.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    permissionPrompt.style.color = 'white';
    permissionPrompt.style.borderRadius = '10px';
    permissionPrompt.style.zIndex = '9999';
    permissionPrompt.style.textAlign = 'center';
    permissionPrompt.innerHTML = 'Microphone access is needed to list input devices<br>Please click "Allow" when prompted.';
    document.body.appendChild(permissionPrompt);

    // Request microphone access with clearer constraints
    navigator.mediaDevices.getUserMedia({
        audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
        }
    })
    .then(stream => {
        console.log('Explicit microphone permission granted');
        
        // Remove the permission prompt
        document.body.removeChild(permissionPrompt);
        
        // Stop the stream right away, we don't need it yet
        stream.getTracks().forEach(track => track.stop());
        
        // Now that we have permission, enumerate devices again to get labels
        console.log('Re-enumerating devices with permission granted...');
        navigator.mediaDevices.enumerateDevices()
            .then(devices => {
                console.log('Devices after permission:', devices);
                populateInputSources(window.audioContext);
            });
    })
    .catch(err => {
        console.error('Error accessing microphone:', err);
        
        // Update the permission prompt to show the error
        permissionPrompt.innerHTML = `Microphone access denied or error: ${err.message}<br>Please check your browser settings.`;
        permissionPrompt.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
        
        // Remove the prompt after a few seconds
        setTimeout(() => {
            if (document.body.contains(permissionPrompt)) {
                document.body.removeChild(permissionPrompt);
            }
        }, 5000);
    });
}

// Function to manually refresh input devices list
function refreshInputDevices() {
    console.log('Manually refreshing input devices list');
    
    // Call populateInputSources directly
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.log("Media Devices API not supported in this browser");
        return;
    }
    
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            console.log('Microphone permission granted for refresh');
            // Stop the stream right away, we don't need it yet
            stream.getTracks().forEach(track => track.stop());
            
            // Now populate the dropdown with device labels
            populateInputSources(window.audioContext);
        })
        .catch(err => {
            console.error('Error accessing microphone during refresh:', err);
        });
}

// Function to update input gain
function updateInputGain(value) {
    if (inputGainNode) {
        inputGainNode.gain.value = parseFloat(value);
        console.log('Input gain updated to:', value);
    }
}

// Function to update input analyzer gain
function updateInputAnalyzerGain(value) {
    if (inputAnalyzerGain) {
        inputAnalyzerGain.gain.value = parseFloat(value);
        console.log('Input analyzer gain updated to:', value);
    }
}

// Function to update input destination gain
function updateInputDestinationGain(value) {
    if (inputDestinationGain) {
        inputDestinationGain.gain.value = parseFloat(value);
        console.log('Input destination gain updated to:', value);
    }
}

// Export functions to global scope for external access
window.populateInputSources = populateInputSources;
window.selectInputSource = selectInputSource;
window.updateInputGain = updateInputGain;
window.updateInputAnalyzerGain = updateInputAnalyzerGain;
window.updateInputDestinationGain = updateInputDestinationGain;
window.initMicrophoneButton = initMicrophoneButton;

// window.refreshInputDevices = refreshInputDevices;
// window.requestMicrophonePermissions = requestMicrophonePermissions;
// window.requestMicrophonePermissionsExplicit = requestMicrophonePermissionsExplicit;