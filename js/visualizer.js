// Variables for the main canvas
var visualizerNode;
var analyser;
var dataArray;
var bufferLength;

// Variables for offscreen canvas
var offscreenCanvas;
var offscreenContext;
var SECONDS_TO_DISPLAY = 1.0; // Now modifiable via slider
var audioSamplesPerSecond;
var currentPosition = 0;
var scaleFactor = 4; // Default scale factor for offscreen canvas

// Write head variables
var writeHeadWidth = 5; // Width of the clearing "write head"
var writeHeadColor = 'rgb(200, 200, 200)'; // Background color for cleared area

// Grid variables
var showGrid = false; // Grid visibility toggle
var beatGridPositions = []; // Store positions of beat grid lines

// Resampling variables
var useResampling = false; // Toggle for Holters-Parker resampling
var resampledData = null; // Array to hold resampled data

// Debug settings
var DEBUG = false; // Toggle debug logging

// Make setupVisualizer globally accessible
window.setupVisualizer = setupVisualizer;

// Function to update the time span
window.updateTimeSpan = function(value) {
    const newValue = parseFloat(value);
    if (SECONDS_TO_DISPLAY !== newValue) {
        SECONDS_TO_DISPLAY = newValue;
        document.getElementById('showTimeSpan').innerText = newValue.toFixed(1);
        
        // Reset the visualizer for the new time span
        resetVisualizer();
        
        // Update the grid positions with the new time span
        updateBeatGridPositions();
        
        // Recalculate and log visualizer settings with the new time span
        const settings = calculateVisualizerSettings();
        logVisualizerConfiguration(settings, true);
        
        if (DEBUG) {
            console.log(`Time span updated: ${SECONDS_TO_DISPLAY}s`);
            logCanvasTimeMapping();
        }
    }
};

// Debug function to log canvas-time mapping
function logCanvasTimeMapping() {
    const pixelsPerSecond = offscreenCanvas.width / SECONDS_TO_DISPLAY;
    console.log('Canvas-Time Mapping:');
    console.log(`- Canvas width: ${offscreenCanvas.width}px`);
    console.log(`- Time span: ${SECONDS_TO_DISPLAY}s`);
    console.log(`- Pixels per second: ${pixelsPerSecond}px/s`);
    console.log(`- For 1 beat at ${tempo} BPM (${(60.0/tempo).toFixed(3)}s): ${(pixelsPerSecond * 60.0/tempo).toFixed(1)}px`);
}

// Reset the visualizer when time span changes
function resetVisualizer() {
    // Reset current position
    currentPosition = 0;
    
    // Clear offscreen canvas
    if (offscreenContext) {
        offscreenContext.fillStyle = writeHeadColor;
        offscreenContext.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
    }
}

function setupVisualizer() {
    console.log('Setting up visualizer');
    
    // Use the analyser node that's already connected in our audio chain
    analyser = window.analyserNode || analyserNode; // Try to get from global scope first, then local
    
    if (!analyser) {
        console.error('Analyzer node not found. Visualizer cannot be initialized.');
        return;
    }
    
    console.log('Analyzer node found:', analyser);
    
    bufferLength = analyser.frequencyBinCount;
    
    // Calculate buffer time - this is how much time one buffer of audio data represents
    const bufferTime = parseFloat(bufferLength) / parseFloat(audioContext.sampleRate);
    console.log(`Buffer Length: ${bufferLength} samples`);
    console.log(`Audio Context Sample Rate: ${audioContext.sampleRate} samples/second`);
    console.log(`Buffer Time: ${bufferTime.toFixed(5)}s (${(bufferTime * 1000).toFixed(2)}ms)`);
    
    dataArray = new Uint8Array(bufferLength);

    // Calculate approximate audio samples per second based on Web Audio API
    audioSamplesPerSecond = audioContext.sampleRate;
    
    // Create offscreen canvas
    offscreenCanvas = document.createElement('canvas');
    // Ensure offscreen canvas matches main canvas width
    offscreenCanvas.width = canvas.width * scaleFactor;
    offscreenCanvas.height = canvas.height * scaleFactor;
    
    // Make offscreen canvas accessible globally
    window.offscreenCanvas = offscreenCanvas;
    
    offscreenContext = offscreenCanvas.getContext('2d');
    
    // Initialize offscreen canvas
    offscreenContext.fillStyle = writeHeadColor;
    offscreenContext.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
    offscreenContext.lineWidth = 2;
    offscreenContext.strokeStyle = 'rgb(0, 0, 0)';
    
    // Log FFT settings and canvas dimensions
    console.log('Analyzer FFT Size:', analyser.fftSize);
    console.log('Visualizer canvas dimensions:', canvas.width, 'x', canvas.height);
    console.log('Offscreen canvas dimensions:', offscreenCanvas.width, 'x', offscreenCanvas.height);
    
    // Calculate and log visualizer settings
    const settings = calculateVisualizerSettings();
    logVisualizerConfiguration(settings);
    
    // Calculate initial beat grid positions
    updateBeatGridPositions();
    
    // Start with the default time span value
    document.getElementById('showTimeSpan').innerText = SECONDS_TO_DISPLAY.toFixed(1);
    document.getElementById('timeSpan').value = SECONDS_TO_DISPLAY;
    
    // Log canvas-time mapping
    if (DEBUG) {
        logCanvasTimeMapping();
    }
    
    // Setup resize event listener for the canvas
    window.addEventListener('resize', handleCanvasResize);
    
    drawVisualizer();
}

// Function to update beat grid positions based on current tempo and resolution
function updateBeatGridPositions() {
    beatGridPositions = [];
    
    if (!window.tempo) return; // If tempo isn't defined yet, exit
    
    // Access the exact same metronome timing variables that the metronome uses
    const resolution = window.noteResolution !== undefined ? window.noteResolution : 0;
    const currentTempo = window.tempo;
    
    // Calculate seconds per beat exactly as the metronome does
    const secondsPerBeat = 60.0 / currentTempo;
    
    // Calculate pixels per second for visualization
    const pixelsPerSecond = offscreenCanvas.width / SECONDS_TO_DISPLAY;
    
    // Determine the time interval between grid lines based on resolution
    let gridInterval;
    let gridLineType;
    
    if (resolution === 2) {
        // Quarter notes - only show quarter notes (beats)
        gridInterval = secondsPerBeat;
        gridLineType = "quarter";
    } else if (resolution === 1) {
        // Eighth notes - show eighth notes
        gridInterval = secondsPerBeat / 2;
        gridLineType = "eighth";
    } else {
        // 16th notes (default)
        gridInterval = secondsPerBeat / 4;
        gridLineType = "sixteenth";
    }
    
    // Calculate how many grid lines to display based on the time span
    const gridLinesCount = Math.ceil(SECONDS_TO_DISPLAY / gridInterval) + 1;
    
    // Generate grid position data
    for (let i = 0; i < gridLinesCount; i++) {
        const timePosition = i * gridInterval;
        const canvasPosition = timePosition * pixelsPerSecond;
        
        // Determine what type of beat this grid line represents
        let beatNumber;
        let isBeat = false;
        let isDownbeat = false;
        
        if (gridLineType === "quarter") {
            // Every line is a beat (quarter note)
            beatNumber = i + 1;
            isBeat = true;
            isDownbeat = (i % 4 === 0);
        } else if (gridLineType === "eighth") {
            // Even numbers are beats (quarter notes)
            beatNumber = Math.floor(i / 2) + 1;
            isBeat = (i % 2 === 0);
            isDownbeat = (i % 8 === 0);
        } else {
            // Every 4th line is a beat (quarter note)
            beatNumber = Math.floor(i / 4) + 1;
            isBeat = (i % 4 === 0);
            isDownbeat = (i % 16 === 0);
        }
        
        beatGridPositions.push({
            position: canvasPosition,
            timePosition: timePosition,
            gridNumber: i + 1,
            beatNumber: beatNumber,
            isBeat: isBeat,
            isDownbeat: isDownbeat
        });
    }
    
    if (DEBUG) {
        console.log(`Grid updated: ${currentTempo} BPM, resolution ${resolution}, ${beatGridPositions.length} grid lines`);
        console.log(`- Grid type: ${gridLineType}`);
        console.log(`- Seconds per beat: ${secondsPerBeat.toFixed(3)}s`);
        console.log(`- Grid interval: ${gridInterval.toFixed(3)}s`);
        console.log(`- Pixels per second: ${pixelsPerSecond.toFixed(2)}px/s`);
    }
}

// Function to toggle grid visibility
window.toggleGrid = function() {
    showGrid = !showGrid;
    updateBeatGridPositions(); // Ensure grid is current when toggled on
    return showGrid;
};

// Function to toggle Holters-Parker resampling
window.toggleResampling = function() {
    useResampling = !useResampling;
    console.log(`Holters-Parker resampling ${useResampling ? 'enabled' : 'disabled'}`);
    return useResampling;
};

// Implementation of Holters-Parker resampling algorithm
function holtersParkerResample(inputBuffer, targetLength) {
    // Create output buffer of target length
    const outputBuffer = new Uint8Array(targetLength);
    
    // Early exit for identical lengths
    if (inputBuffer.length === targetLength) {
        return new Uint8Array(inputBuffer);
    }
    
    const inputLength = inputBuffer.length;
    const scaleFactor = inputLength / targetLength;
    
    // Use Holters-Parker algorithm for high-quality resampling
    for (let i = 0; i < targetLength; i++) {
        // Calculate the center position in the input buffer
        const inputIndex = i * scaleFactor;
        
        // Get the low and high indices for interpolation
        const indexLow = Math.floor(inputIndex);
        const indexHigh = Math.min(indexLow + 1, inputLength - 1);
        
        // Calculate interpolation factor
        const alpha = inputIndex - indexLow;
        
        // Get the low and high values
        const valueLow = inputBuffer[indexLow];
        const valueHigh = inputBuffer[indexHigh];
        
        // Apply cubic Hermite interpolation for smoother results
        // This is the core of the Holters-Parker approach
        let value;
        
        if (indexLow > 0 && indexHigh < inputLength - 1) {
            // We have enough points for cubic interpolation
            const valueBefore = inputBuffer[indexLow - 1];
            const valueAfter = inputBuffer[indexHigh + 1];
            
            // Cubic Hermite spline coefficients
            const c0 = valueLow;
            const c1 = 0.5 * (valueHigh - valueBefore);
            const c2 = valueBefore - 2.5 * valueLow + 2 * valueHigh - 0.5 * valueAfter;
            const c3 = 0.5 * (valueAfter - valueBefore) + 1.5 * (valueLow - valueHigh);
            
            // Calculate interpolated value using cubic polynomial
            const alpha2 = alpha * alpha;
            const alpha3 = alpha2 * alpha;
            value = c0 + c1 * alpha + c2 * alpha2 + c3 * alpha3;
        } else {
            // Fall back to linear interpolation near edges
            value = valueLow + alpha * (valueHigh - valueLow);
        }
        
        // Ensure the result is within the valid range for Uint8Array (0-255)
        outputBuffer[i] = Math.max(0, Math.min(255, Math.round(value+10)));
    }
    
    return outputBuffer;
}

function drawVisualizer() {
    requestAnimationFrame(drawVisualizer);

    // Update grid positions if tempo or resolution has changed
    if (window.tempo && 
       (window.tempo !== window._lastCheckedTempo || 
        window.noteResolution !== window._lastCheckedResolution)) {
        updateBeatGridPositions();
        window._lastCheckedTempo = window.tempo;
        window._lastCheckedResolution = window.noteResolution;
    }

    // Get audio data
    analyser.getByteTimeDomainData(dataArray);
    
    // Draw to offscreen canvas
    updateOffscreenCanvas();
    
    // Copy from offscreen canvas to visible canvas
    renderVisibleCanvas();
}

function updateOffscreenCanvas() {
    // Get settings from our common calculation function
    const settings = calculateVisualizerSettings();
    
    // Use sliceWidth and dx from the settings
    const sliceWidth = settings.sliceWidth;
    const dx = settings.dx;
    
    // Calculate min and max values for this buffer
    let minValue = 255;
    let maxValue = 0;
    
    for (var i = 0; i < bufferLength; i++) {
        const value = dataArray[i];
        if (value < minValue) minValue = value;
        if (value > maxValue) maxValue = value;
    }
    
    // Convert to normalized range (-1 to 1)
    const minNorm = minValue / 128.0 - 1.0;
    const maxNorm = maxValue / 128.0 - 1.0;
    
    // Clear only the area ahead of the current write position (write head)
    offscreenContext.fillStyle = writeHeadColor;
    offscreenContext.fillRect(
        currentPosition, 
        0, 
        writeHeadWidth + sliceWidth, 
        offscreenCanvas.height
    );
    
    // Continue from current position
    offscreenContext.beginPath();
    var x = currentPosition;
    
    // Apply Holters-Parker resampling if enabled
    let displayData;
    if (useResampling) {
        // Use the resampling values from settings instead of calculating here
        const targetSampleCount = settings.targetSampleCount;
        const resampledDx = settings.resampledDx;
        
        // Apply resampling to match pixel count
        displayData = holtersParkerResample(dataArray, targetSampleCount);
        
        // Draw the resampled waveform
        for (var i = 0; i < displayData.length; i++) {
            var v = displayData[i] / 128.0;
            var y = v * offscreenCanvas.height / 2;
            
            const currentX = x + (i * resampledDx);
            
            if (i === 0) {
                offscreenContext.moveTo(currentX, y);
            } else {
                offscreenContext.lineTo(currentX, y);
            }
        }
    } else {
        // Draw the original waveform without resampling
        for (var i = 0; i < bufferLength; i++) {
            var v = dataArray[i] / 128.0;
            var y = v * offscreenCanvas.height / 2;
            
            x = x + dx;
            
            if (i === 0) {
                offscreenContext.moveTo(x, y);
            } else {
                offscreenContext.lineTo(x, y);
            }
        }
    }
    
    offscreenContext.stroke();
    
    // Draw min-max range as a vertical line
    const midX = currentPosition + sliceWidth / 2;
    const midY = offscreenCanvas.height / 2;
    const minY = (1 + minNorm) * offscreenCanvas.height / 2;
    const maxY = (1 + maxNorm) * offscreenCanvas.height / 2;
    
    // Draw min-max line with a different color
    offscreenContext.beginPath();
    offscreenContext.strokeStyle = 'rgba(255, 0, 0, 0.5)';
    offscreenContext.lineWidth = 3;
    offscreenContext.moveTo(midX, minY);
    offscreenContext.lineTo(midX, maxY);
    offscreenContext.stroke();
    
    // Reset stroke style for the next waveform
    offscreenContext.strokeStyle = 'rgb(0, 0, 0)';
    offscreenContext.lineWidth = 2;
    
    // Increment current position
    currentPosition += sliceWidth;
    
    // If we've reached the end of the offscreen canvas, wrap around
    if (currentPosition >= offscreenCanvas.width) {
        currentPosition = 0;
    }
}

function renderVisibleCanvas() {
    // Clear visible canvas
    canvasContext.fillStyle = 'rgb(200, 200, 200)';
    canvasContext.fillRect(0, 0, canvas.width, canvas.height);
    
    // Copy the entire offscreen canvas to the visible canvas (scaled to fit)
    canvasContext.drawImage(
        offscreenCanvas,
        0, 0, offscreenCanvas.width, offscreenCanvas.height,
        0, 0, canvas.width, canvas.height
    );
    
    // Draw grid if enabled
    if (showGrid && beatGridPositions.length > 0) {
        drawBeatGrid();
    }
}

// Function to draw beat grid on the visible canvas
function drawBeatGrid() {
    // Calculate scaling factor between offscreen and visible canvas
    const scaleX = canvas.width / offscreenCanvas.width;
    
    // Set up text rendering
    canvasContext.font = '10px Arial';
    canvasContext.textAlign = 'center';
    
    // Get resolution name for display
    let resolutionName = "16th Notes";
    if (window.noteResolution === 1) resolutionName = "8th Notes";
    if (window.noteResolution === 2) resolutionName = "Quarter Notes";
    
    // Draw each grid line
    beatGridPositions.forEach(beat => {
        // Scale position to visible canvas
        const x = beat.position * scaleX;
        
        // Skip if outside the canvas
        if (x < 0 || x > canvas.width) return;
        
        if (beat.isDownbeat) {
            // Downbeat (first beat of measure) - thickest line, bright color
            canvasContext.strokeStyle = 'rgba(255, 0, 0, 0.7)';
            canvasContext.lineWidth = 2;
            
            // Draw vertical line
            canvasContext.beginPath();
            canvasContext.moveTo(x, 0);
            canvasContext.lineTo(x, canvas.height);
            canvasContext.stroke();
            
            // Draw beat number (measure number)
            canvasContext.fillStyle = 'rgba(255, 0, 0, 1)';
            canvasContext.fillText(
                beat.beatNumber.toString(), 
                x, 
                15
            );
        }
        else if (beat.isBeat) {
            // Regular beat - medium line
            canvasContext.strokeStyle = 'rgba(0, 100, 255, 0.7)';
            canvasContext.lineWidth = 1.5;
            
            // Draw vertical line
            canvasContext.beginPath();
            canvasContext.moveTo(x, 0);
            canvasContext.lineTo(x, canvas.height);
            canvasContext.stroke();
            
            // Draw beat number
            canvasContext.fillStyle = 'rgba(0, 100, 255, 1)';
            canvasContext.fillText(
                beat.beatNumber.toString(), 
                x, 
                15
            );
        } else {
            // Subdivision - thinner line
            canvasContext.strokeStyle = 'rgba(0, 100, 255, 0.3)';
            canvasContext.lineWidth = 0.5;
            
            // Draw vertical line
            canvasContext.beginPath();
            canvasContext.moveTo(x, 0);
            canvasContext.lineTo(x, canvas.height);
            canvasContext.stroke();
        }
    });
    
}

// Handle canvas resize
function handleCanvasResize() {
    // Update the main canvas width based on its container size
    canvas.width = canvas.offsetWidth;
    
    // Update offscreen canvas to match
    if (offscreenCanvas) {
        // Save current content
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = offscreenCanvas.width;
        tempCanvas.height = offscreenCanvas.height;
        const tempContext = tempCanvas.getContext('2d');
        tempContext.drawImage(offscreenCanvas, 0, 0);
        
        // Resize offscreen canvas
        offscreenCanvas.width = canvas.width * scaleFactor;
        offscreenCanvas.height = canvas.height * scaleFactor;
        
        // Clear and restore content (scaled if needed)
        offscreenContext.fillStyle = writeHeadColor;
        offscreenContext.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
        
        // Only copy back if we're not starting fresh
        if (currentPosition > 0) {
            // Scale content to new dimensions
            const scaleFactor = offscreenCanvas.width / tempCanvas.width;
            offscreenContext.drawImage(
                tempCanvas,
                0, 0, tempCanvas.width, tempCanvas.height,
                0, 0, offscreenCanvas.width, offscreenCanvas.height
            );
            
            // Adjust current position based on scale
            currentPosition = Math.min(
                Math.floor(currentPosition * scaleFactor),
                offscreenCanvas.width - 1
            );
        }
    }
    
    // Update grid positions for new dimensions
    updateBeatGridPositions();
    
    if (DEBUG) {
        console.log('Canvas resized:', canvas.width, 'x', canvas.height);
        console.log('Offscreen canvas updated:', offscreenCanvas.width, 'x', offscreenCanvas.height);
        logCanvasTimeMapping();
    }
}

// Track previous state to detect changes
var prevSettings = {
    bufferLength: 0,
    sampleRate: 0,
    timeSpan: 0,
    canvasWidth: 0,
    canvasHeight: 0,
    offscreenWidth: 0,
    offscreenHeight: 0
};

// Calculate and return visualizer settings
function calculateVisualizerSettings() {
    const bufferTime = parseFloat(bufferLength) / parseFloat(audioContext.sampleRate);
    const buffersNeeded = SECONDS_TO_DISPLAY / bufferTime;
    
    // Calculate how wide each buffer should be in pixels
    const sliceWidth = offscreenCanvas ? offscreenCanvas.width / buffersNeeded : 0;
    
    // Calculate pixel step for each data point (per buffer)
    const dx = sliceWidth / Math.max(1, bufferLength);
    
    // Calculate pixels per buffer length (total pixels to represent one buffer)
    const pixelsPerBufferLength = bufferLength * dx;
    
    // Calculate resampling values for Holters-Parker
    const targetSampleCount = Math.ceil(sliceWidth / dx);
    const resampledDx = sliceWidth / targetSampleCount;
    
    // Create current settings object
    const currentSettings = {
        bufferTime,
        buffersNeeded,
        sliceWidth,
        dx,
        pixelsPerBufferLength,
        targetSampleCount,
        resampledDx,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        offscreenWidth: offscreenCanvas ? offscreenCanvas.width : 0,
        offscreenHeight: offscreenCanvas ? offscreenCanvas.height : 0,
        sampleRate: audioContext.sampleRate,
        bufferLength: bufferLength,
        timeSpan: SECONDS_TO_DISPLAY
    };
    
    // Check if any input variables have changed
    const hasChanged = 
        prevSettings.bufferLength !== currentSettings.bufferLength ||
        prevSettings.sampleRate !== currentSettings.sampleRate ||
        prevSettings.timeSpan !== currentSettings.timeSpan ||
        prevSettings.canvasWidth !== currentSettings.canvasWidth ||
        prevSettings.canvasHeight !== currentSettings.canvasHeight ||
        prevSettings.offscreenWidth !== currentSettings.offscreenWidth ||
        prevSettings.offscreenHeight !== currentSettings.offscreenHeight;
    
    // If something changed, update previous settings and log if in debug mode
    if (hasChanged) {
        // Find what specific things changed for targeted actions
        const changes = {
            bufferLength: prevSettings.bufferLength !== currentSettings.bufferLength,
            sampleRate: prevSettings.sampleRate !== currentSettings.sampleRate,
            timeSpan: prevSettings.timeSpan !== currentSettings.timeSpan,
            canvasWidth: prevSettings.canvasWidth !== currentSettings.canvasWidth,
            canvasHeight: prevSettings.canvasHeight !== currentSettings.canvasHeight,
            offscreenWidth: prevSettings.offscreenWidth !== currentSettings.offscreenWidth,
            offscreenHeight: prevSettings.offscreenHeight !== currentSettings.offscreenHeight
        };
        
        // Store current settings for next comparison
        prevSettings = {
            bufferLength: currentSettings.bufferLength,
            sampleRate: currentSettings.sampleRate,
            timeSpan: currentSettings.timeSpan,
            canvasWidth: currentSettings.canvasWidth,
            canvasHeight: currentSettings.canvasHeight,
            offscreenWidth: currentSettings.offscreenWidth,
            offscreenHeight: currentSettings.offscreenHeight
        };
        
        // Log changes if in debug mode
        if (DEBUG) {
            console.log('Visualizer settings recalculated due to input changes');
            
            // Determine what changed
            if (changes.bufferLength)
                console.log(`- Buffer length changed: ${prevSettings.bufferLength} → ${currentSettings.bufferLength}`);
            if (changes.sampleRate)
                console.log(`- Sample rate changed: ${prevSettings.sampleRate} → ${currentSettings.sampleRate}`);
            if (changes.timeSpan)
                console.log(`- Time span changed: ${prevSettings.timeSpan} → ${currentSettings.timeSpan}`);
            if (changes.canvasWidth)
                console.log(`- Canvas width changed: ${prevSettings.canvasWidth} → ${currentSettings.canvasWidth}`);
            if (changes.canvasHeight)
                console.log(`- Canvas height changed: ${prevSettings.canvasHeight} → ${currentSettings.canvasHeight}`);
            if (changes.offscreenWidth)
                console.log(`- Offscreen width changed: ${prevSettings.offscreenWidth} → ${currentSettings.offscreenWidth}`);
            if (changes.offscreenHeight)
                console.log(`- Offscreen height changed: ${prevSettings.offscreenHeight} → ${currentSettings.offscreenHeight}`);
        }
        
        // Trigger specific actions based on what changed
        onVisualizerSettingsChanged(changes, currentSettings);
    }
    
    return currentSettings;
}

// Function to handle actions when visualizer settings change
function onVisualizerSettingsChanged(changes, settings) {
    // If time span changed, we need to update grid positions
    if (changes.timeSpan) {
        updateBeatGridPositions();
    }
    
    // If canvas size changed, ensure offscreen canvas matches
    if ((changes.canvasWidth || changes.canvasHeight) && 
        (offscreenCanvas && (offscreenCanvas.width !== canvas.width || offscreenCanvas.height !== canvas.height))) {
        offscreenCanvas.width = canvas.width;
        offscreenCanvas.height = canvas.height;
        
        // Clear offscreen canvas after resize
        if (offscreenContext) {
            offscreenContext.fillStyle = writeHeadColor;
            offscreenContext.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
            
            // Reset position to start fresh
            currentPosition = 0;
        }
        
        // Update grid positions for new dimensions
        updateBeatGridPositions();
    }
    
    // If buffer length or sample rate changed, data array might need updating
    if (changes.bufferLength) {
        dataArray = new Uint8Array(bufferLength);
    }
    
    // If time span or sample rate changed, we might need to adjust the writeHead width
    if (changes.timeSpan || changes.sampleRate || changes.canvasWidth) {
        // Calculate optimal write head width based on time span and canvas width
        // (This is optional enhancement that keeps write head width proportional)
        const pixelsPerSecond = offscreenCanvas.width / SECONDS_TO_DISPLAY;
        const optimalWidth = Math.max(5, Math.ceil(pixelsPerSecond * 0.01)); // 1% of a second, minimum 5px
        
        if (writeHeadWidth !== optimalWidth) {
            writeHeadWidth = optimalWidth;
            if (DEBUG) {
                console.log(`Write head width adjusted to ${writeHeadWidth}px`);
            }
        }
    }
}

// Function to log visualizer configuration
function logVisualizerConfiguration(settings, isUpdate = false) {
    const headerText = isUpdate ? 
        '------ VISUALIZER CONFIGURATION UPDATED ------' : 
        '------ VISUALIZER CONFIGURATION ------';
    
    const footerText = isUpdate ? 
        '-------------------------------------------' : 
        '--------------------------------------';
    
    console.log(headerText);
    console.log(`Onscreen Canvas: ${settings.canvasWidth} x ${settings.canvasHeight}px`);
    console.log(`Offscreen Canvas: ${settings.offscreenWidth} x ${settings.offscreenHeight}px`);
    console.log(`Time Span to Display: ${settings.timeSpan.toFixed(4)}s`);
    console.log(`Analyzer Node Sample Rate: ${settings.sampleRate}Hz`);
    console.log(`Analyzer Buffer Length: ${settings.bufferLength} samples`);
    console.log(`Analyzer Buffer Time: ${settings.bufferTime.toFixed(5)}s (${(settings.bufferTime * 1000).toFixed(2)}ms)`);
    console.log(`Buffers Per Canvas: ${settings.buffersNeeded.toFixed(4)} (${Math.ceil(settings.buffersNeeded)} needed)`);
    console.log(`Slice Width: ${settings.sliceWidth.toFixed(4)}px`);
    console.log(`Pixel Step (dx): ${settings.dx.toFixed(4)}px per sample`);
    console.log(`Pixels Per Buffer Length: ${settings.pixelsPerBufferLength.toFixed(4)}px (entire buffer width)`);
    
    // Log Holters-Parker resampling values
    console.log(`Resampling Target Sample Count: ${settings.targetSampleCount}`);
    console.log(`Resampling Pixel Step (resampledDx): ${settings.resampledDx.toFixed(4)}px per sample`);
    console.log(`Resampling Active: ${useResampling ? 'Yes' : 'No'}`);
    
    if (!isUpdate) {
        console.log(`Write Head Width: ${writeHeadWidth}px`);
    }
    
    console.log(footerText);
}
