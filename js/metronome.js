var audioContext = null;
var unlocked = false;
var isPlaying = false;      // Are we currently playing?
var startTime;              // The start time of the entire sequence.
var current16thNote;        // What note is currently last scheduled?
var tempo = 120.0;          // tempo (in beats per minute)
var lookahead = 25.0;       // How frequently to call scheduling function 
                            //(in milliseconds)
var scheduleAheadTime = 0.1;    // How far ahead to schedule audio (sec)
                            // This is calculated from lookahead, and overlaps 
                            // with next interval (in case the timer is late)
var nextNoteTime = 0.0;     // when the next note is due.
var noteResolution = 0;     // 0 == 16th, 1 == 8th, 2 == quarter note
var noteLength = 0.05;      // length of "beep" (in seconds)
var canvas,                 // the canvas element
    canvasContext;          // canvasContext is the canvas' context 2D
var last16thNoteDrawn = -1; // the last "box" we drew on the screen
var notesInQueue = [];      // the notes that have been put into the web audio,
                            // and may or may not have played yet. {note, time}
var timerWorker = null;     // The Web Worker used to fire timer messages

// Debug settings
var DEBUG = true;           // Enable debug mode to log detailed information

// Audio routing variables
var analyzerMixerNode = null;   // Mixer for analyzer (visualization)
var destinationMixerNode = null; // Mixer for destination (speakers)
var metronomeGainNode = null;   // Gain node for metronome
var metronomeAnalyzerGain = null; // Gain node for metronome to analyzer
var metronomeDestinationGain = null; // Gain node for metronome to destination
var analyserNode = null;        // Analyser for visualization
var visualizerNode = null;      // Reference for visualizer.js

// Make audio context and mixers available globally for other components
window.audioContext = audioContext;
window.analyzerMixerNode = analyzerMixerNode;
window.destinationMixerNode = destinationMixerNode;

// First, let's shim the requestAnimationFrame API, with a setTimeout fallback
window.requestAnimFrame = window.requestAnimationFrame;

function nextNote() {
    // Advance current note and time by a 16th note...
    var secondsPerBeat = 60.0 / tempo;    // Notice this picks up the CURRENT 
                                          // tempo value to calculate beat length.
    nextNoteTime += 0.25 * secondsPerBeat;    // Add beat length to last beat time

    current16thNote++;    // Advance the beat number, wrap to zero
    if (current16thNote == 16) {
        current16thNote = 0;
    }
}

function scheduleNote( beatNumber, time ) {
    // push the note on the queue, even if we're not playing.
    notesInQueue.push( { note: beatNumber, time: time } );

    if ( (noteResolution==1) && (beatNumber%2))
        return; // we're not playing non-8th 16th notes
    if ( (noteResolution==2) && (beatNumber%4))
        return; // we're not playing non-quarter 8th notes

    // create an oscillator
    var osc = audioContext.createOscillator();
    osc.connect(metronomeGainNode); // Connect to metronome gain node
    
    if (beatNumber % 16 === 0)    // beat 0 == high pitch
        osc.frequency.value = 880.0;
    else if (beatNumber % 4 === 0 )    // quarter notes = medium pitch
        osc.frequency.value = 440.0;
    else                        // other 16th notes = low pitch
        osc.frequency.value = 220.0;

    osc.start( time );
    osc.stop( time + noteLength );
}

function scheduler() {
    // while there are notes that will need to play before the next interval, 
    // schedule them and advance the pointer.
    while (nextNoteTime < audioContext.currentTime + scheduleAheadTime ) {
        scheduleNote( current16thNote, nextNoteTime );
        nextNote();
    }
}

// Function to update metronome gain
window.updateMetronomeGain = function(value) {
    if (metronomeGainNode) {
        metronomeGainNode.gain.value = parseFloat(value);
        console.log('Metronome main gain updated to:', value);
    }
};

// Function to update metronome analyzer gain
window.updateMetronomeAnalyzerGain = function(value) {
    if (metronomeAnalyzerGain) {
        metronomeAnalyzerGain.gain.value = parseFloat(value);
        console.log('Metronome analyzer gain updated to:', value);
    }
};

// Function to update metronome destination gain
window.updateMetronomeDestinationGain = function(value) {
    if (metronomeDestinationGain) {
        metronomeDestinationGain.gain.value = parseFloat(value);
        console.log('Metronome destination gain updated to:', value);
    }
};

function setupAudioNodes() {
    // Create two separate mixer nodes
    analyzerMixerNode = audioContext.createGain();
    analyzerMixerNode.gain.value = 1.0;
    
    destinationMixerNode = audioContext.createGain();
    destinationMixerNode.gain.value = 1.0;
    
    // Create analyzer for visualization
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 2048;
    
    // Connect mixer routing
    analyzerMixerNode.connect(analyserNode);       // Analyzer mixer to analyzer
    destinationMixerNode.connect(audioContext.destination); // Destination mixer to speakers
    
    // Set visualizer node to our analyser
    visualizerNode = analyserNode;
    window.visualizerNode = visualizerNode; // Expose to global scope for visualizer.js
    
    // Create metronome gain nodes (one for each mixer)
    metronomeGainNode = audioContext.createGain();
    metronomeGainNode.gain.value = parseFloat(document.getElementById('metronomeGain').value || 0.8);
    
    metronomeAnalyzerGain = audioContext.createGain();
    metronomeAnalyzerGain.gain.value = parseFloat(document.getElementById('metronomeAnalyzerGain').value || 0.8);
    
    metronomeDestinationGain = audioContext.createGain();
    metronomeDestinationGain.gain.value = parseFloat(document.getElementById('metronomeDestinationGain').value || 0.8);
    
    // Connect metronome to both mixers
    metronomeGainNode.connect(metronomeAnalyzerGain);
    metronomeGainNode.connect(metronomeDestinationGain);
    metronomeAnalyzerGain.connect(analyzerMixerNode);
    metronomeDestinationGain.connect(destinationMixerNode);
    
    // Initialize wav source from wavsource.js with both mixers
    if (typeof window.initWavSource === 'function') {
        window.initWavSource(audioContext, analyzerMixerNode, destinationMixerNode);
    }
    
    // Update global references for other components
    window.audioContext = audioContext;
    window.analyzerMixerNode = analyzerMixerNode;
    window.destinationMixerNode = destinationMixerNode;
    window.analyserNode = analyserNode; // Make sure the analyzer is globally available
    
    console.log("Dual mixer audio routing setup complete");
}

function play() {
    if (!audioContext) {
        audioContext = new AudioContext();
        window.audioContext = audioContext; // Make sure it's globally available
    }

    if (!unlocked) {
      // play silent buffer to unlock the audio
      var buffer = audioContext.createBuffer(1, 1, 22050);
      var node = audioContext.createBufferSource();
      node.buffer = buffer;
      node.start(0);
      unlocked = true;
    }
    
    // Set up audio nodes if not already done
    if (!destinationMixerNode || !analyzerMixerNode) {
        setupAudioNodes();
        if (typeof window.setupVisualizer === 'function') {
            window.setupVisualizer();
        } else {
            console.error('setupVisualizer function not found');
        }
    }

    isPlaying = !isPlaying;

    if (isPlaying) { // start playing
        current16thNote = 0;
        nextNoteTime = audioContext.currentTime;
        
        // Start metronome
        timerWorker.postMessage("start");
        
        // Start mega.wav using wavsource.js
        if (typeof window.playMegaWav === 'function') {
            window.playMegaWav();
        }
        
        return "stop";
    } else {
        // Stop metronome
        timerWorker.postMessage("stop");
        
        // Stop mega.wav using wavsource.js
        if (typeof window.stopMegaWav === 'function') {
            window.stopMegaWav();
        }
        
        return "play";
    }
}

function resetCanvas (e) {
    // Update canvas width to match its display width
    canvas.width = canvas.offsetWidth;
    
    // Also update offscreen canvas width if it exists
    if (window.offscreenCanvas) {
        window.offscreenCanvas.width = canvas.width;
    }
    
    // Make sure we scroll to the top left
    window.scrollTo(0, 0); 
}

function draw() {
    var currentNote = last16thNoteDrawn;
    if (audioContext) {
        var currentTime = audioContext.currentTime;

        while (notesInQueue.length && notesInQueue[0].time < currentTime) {
            currentNote = notesInQueue[0].note;
            notesInQueue.splice(0,1);   // remove note from queue
        }

        // We only need to draw if the note has moved.
        if (last16thNoteDrawn != currentNote) {
            var x = Math.floor( canvas.width / 18 );
            canvasContext.clearRect(0,0,canvas.width, canvas.height); 
            for (var i=0; i<16; i++) {
                canvasContext.fillStyle = ( currentNote == i ) ? 
                    ((currentNote%4 === 0)?"red":"blue") : "black";
                canvasContext.fillRect( x * (i+1), x, x/2, x/2 );
            }
            last16thNoteDrawn = currentNote;
        }
    }
    // set up to draw again
    requestAnimFrame(draw);
}

function init(){
    // Create AudioContext with a user gesture to comply with autoplay policies
    if (!audioContext) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('AudioContext created:', audioContext);
            // Update global reference
            window.audioContext = audioContext;
        } catch(e) {
            console.error('Failed to create AudioContext:', e);
            alert('Could not create audio context. Please try using a different browser.');
            return;
        }
    }

    canvas = document.getElementById('visualizer');
    if (!canvas) {
        console.error('Visualizer canvas not found');
        return;
    }
    
    // Set canvas width based on its display width
    canvas.width = canvas.offsetWidth;
    canvasContext = canvas.getContext('2d');
    
    window.onorientationchange = resetCanvas;
    window.onresize = resetCanvas;

    requestAnimFrame(draw);    // start the drawing loop.

    // Set up audio routing
    setupAudioNodes();
    
    // Initialize the visualizer
    if (typeof window.setupVisualizer === 'function') {
        window.setupVisualizer();
    } else {
        console.error('setupVisualizer function not found');
    }

    // Request microphone permissions from inputstream.js
    if (typeof window.requestMicrophonePermissionsExplicit === 'function') {
        window.requestMicrophonePermissionsExplicit();
    }

    // Add microphone access button from inputstream.js
    if (typeof window.initMicrophoneButton === 'function') {
        window.initMicrophoneButton();
    }

    timerWorker = new Worker("js/metronomeworker.js");

    timerWorker.onmessage = function(e) {
        if (e.data == "tick") {
            scheduler();
        }
        else
            console.log("message: " + e.data);
    };
    timerWorker.postMessage({"interval":lookahead});
    
    console.log('Metronome initialization complete');
}

window.addEventListener("load", init );

