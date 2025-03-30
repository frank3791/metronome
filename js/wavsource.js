// Wav Source management for metronome
// This file handles mega.wav audio source and controls

// Audio variables
var megaWavGainNode = null;     // Gain node for mega.wav
var megaWavSource = null;       // Media element source for mega.wav
var megaWavAnalyzerGain = null; // Gain node for mega.wav to analyzer
var megaWavDestinationGain = null; // Gain node for mega.wav to destination

// Initialize the mega.wav audio source
function initWavSource(audioContext, analyzerMixerNode, destinationMixerNode) {
    // Set up mega.wav source and its gain nodes
    const audioElement = document.getElementById('megaWavAudio');
    megaWavSource = audioContext.createMediaElementSource(audioElement);
    
    // Create main gain node for mega.wav
    megaWavGainNode = audioContext.createGain();
    megaWavGainNode.gain.value = parseFloat(document.getElementById('megaWavGain').value);
    
    // Create separate gain nodes for each mixer
    megaWavAnalyzerGain = audioContext.createGain();
    megaWavAnalyzerGain.gain.value = parseFloat(document.getElementById('megaWavAnalyzerGain').value || 0.5);
    
    megaWavDestinationGain = audioContext.createGain();
    megaWavDestinationGain.gain.value = parseFloat(document.getElementById('megaWavDestinationGain').value || 0.5);
    
    // Connect nodes: source -> main gain -> separate gains -> separate mixers
    megaWavSource.connect(megaWavGainNode);
    megaWavGainNode.connect(megaWavAnalyzerGain);
    megaWavGainNode.connect(megaWavDestinationGain);
    megaWavAnalyzerGain.connect(analyzerMixerNode);
    megaWavDestinationGain.connect(destinationMixerNode);
    
    console.log("Mega.wav source initialized with dual mixer routing");
    
    return {
        source: megaWavSource,
        gainNode: megaWavGainNode,
        analyzerGain: megaWavAnalyzerGain,
        destinationGain: megaWavDestinationGain
    };
}

// Function to update mega.wav gain
function updateMegaWavGain(value) {
    if (megaWavGainNode) {
        megaWavGainNode.gain.value = parseFloat(value);
        console.log('Mega.wav gain updated to:', value);
    }
}

// Function to update mega.wav analyzer gain
function updateMegaWavAnalyzerGain(value) {
    if (megaWavAnalyzerGain) {
        megaWavAnalyzerGain.gain.value = parseFloat(value);
        console.log('Mega.wav analyzer gain updated to:', value);
    }
}

// Function to update mega.wav destination gain
function updateMegaWavDestinationGain(value) {
    if (megaWavDestinationGain) {
        megaWavDestinationGain.gain.value = parseFloat(value);
        console.log('Mega.wav destination gain updated to:', value);
    }
}

// Function to play mega.wav
function playMegaWav() {
    document.getElementById('megaWavAudio').play();
    console.log('Mega.wav playback started');
}

// Function to stop mega.wav
function stopMegaWav() {
    const audioElement = document.getElementById('megaWavAudio');
    audioElement.pause();
    audioElement.currentTime = 0;
    console.log('Mega.wav playback stopped');
}

// Export functions to global scope for external access
window.updateMegaWavAnalyzerGain = updateMegaWavAnalyzerGain;
window.updateMegaWavDestinationGain = updateMegaWavDestinationGain;
window.updateMegaWavGain = updateMegaWavGain;
window.playMegaWav = playMegaWav;
window.stopMegaWav = stopMegaWav;
window.initWavSource = initWavSource;