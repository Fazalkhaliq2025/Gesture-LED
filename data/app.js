/**
 * ==============================================================================
 * GestureLED Web Serial Dashboard & Controller
 * Framework: Vanilla ES6 + MediaPipe Hands via CDN + Web Serial API
 * Author: SKR Electronics Lab (SK Raihan)
 * ==============================================================================
 */

(() => {
  'use strict';

  // ============================================================================
  // DOM ELEMENT REFERENCES
  // ============================================================================
  const btnConnectSerial = document.getElementById('btnConnectSerial');
  const btnSerialText = document.getElementById('btnSerialText');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const statusHost = document.getElementById('statusHost');
  const handTrackingStatus = document.getElementById('handTrackingStatus');
  const fpsDisplay = document.getElementById('fpsDisplay');

  const tabButtons = document.querySelectorAll('.tab-button');
  const modePanes = {
    1: document.getElementById('paneMode1'),
    2: document.getElementById('paneMode2'),
    3: document.getElementById('paneMode3'),
    4: document.getElementById('paneMode4')
  };

  const videoElement = document.getElementById('webcamVideo');
  const canvasElement = document.getElementById('outputCanvas');
  const canvasCtx = canvasElement.getContext('2d');
  const cameraFallback = document.getElementById('cameraFallback');
  const btnEnableCamera = document.getElementById('btnEnableCamera');
  const fallbackTitle = document.getElementById('fallbackTitle');
  const fallbackDesc = document.getElementById('fallbackDesc');

  // Mode 1 UI
  const palmStateBadge = document.getElementById('palmStateBadge');
  const cmdMode1 = document.getElementById('cmdMode1');

  // Mode 2 UI
  const brightnessNumeric = document.getElementById('brightnessNumeric');
  const brightnessBar = document.getElementById('brightnessBar');
  const pinchDistanceVal = document.getElementById('pinchDistanceVal');
  const cmdMode2 = document.getElementById('cmdMode2');

  // Mode 3 UI
  const fingerCountDisplay = document.getElementById('fingerCountDisplay');
  const chipThumb = document.getElementById('chipThumb');
  const chipIndex = document.getElementById('chipIndex');
  const chipMiddle = document.getElementById('chipMiddle');
  const chipRing = document.getElementById('chipRing');
  const chipPinky = document.getElementById('chipPinky');
  const cmdMode3 = document.getElementById('cmdMode3');

  // Virtual Hardware LEDs (0 to 4 - null-safe)
  const virtualLeds = [
    document.getElementById('led0'),
    document.getElementById('led1'),
    document.getElementById('led2'),
    document.getElementById('led3'),
    document.getElementById('led4')
  ].filter(Boolean);

  // ============================================================================
  // PURGE WI-FI PROVISIONING FROM FLASHER MODAL
  // ============================================================================
  const flasherModalObserver = new MutationObserver(() => {
    const wifiBtn = document.getElementById('__efb-succ-open-wifi');
    if (wifiBtn) wifiBtn.remove();
    const wifiCard = document.querySelector('.__efb-wifi-card');
    if (wifiCard) wifiCard.remove();
    const wifiBtns = document.querySelectorAll('.__efb-succ-btn-wifi');
    wifiBtns.forEach(btn => btn.remove());
  });
  flasherModalObserver.observe(document.body, { childList: true, subtree: true });

  // ============================================================================
  // APPLICATION STATE
  // ============================================================================
  let currentMode = 1; // 1, 2, or 3
  let isCameraActive = false;

  // Web Serial State
  let serialPort = null;
  let serialWriter = null;
  let serialReader = null;
  let isSerialConnected = false;

  // Mode 1 State (Sends ONLY on state change)
  let lastPalmState = null; // 'OPEN' | 'CLOSED' | null

  // Mode 2 State (Throttled to ~10 messages/sec = 100ms interval)
  let lastMode2Timestamp = 0;
  let lastSentBrightness = -1;
  const MODE2_THROTTLE_MS = 100;

  // Mode 3 State (Sends ONLY on count change)
  let lastFingerCount = -1;

  // FPS calculation
  let frameCount = 0;
  let lastFpsUpdateTime = performance.now();

  // ============================================================================
  // WEB SERIAL CONNECTION MANAGEMENT
  // ============================================================================

  function updateConnectionUI(connected, label, detail) {
    isSerialConnected = connected;
    statusDot.className = 'status-dot ' + (connected ? 'connected' : 'disconnected');
    statusText.textContent = label;
    statusHost.textContent = detail;
    btnSerialText.textContent = connected ? 'Disconnect USB' : 'Connect USB Controller';
    btnConnectSerial.classList.toggle('connected', connected);
  }

  async function connectSerial() {
    if (!('serial' in navigator)) {
      alert('Web Serial API is not supported in this browser. Please use Google Chrome or Microsoft Edge on Desktop.');
      return;
    }

    // If already connected, disconnect
    if (isSerialConnected && serialPort) {
      await disconnectSerial();
      return;
    }

    try {
      // Request serial port from user
      serialPort = await navigator.serial.requestPort();
      await serialPort.open({ baudRate: 115200 });

      // Setup writer stream
      const textEncoder = new TextEncoderStream();
      textEncoder.readable.pipeTo(serialPort.writable);
      serialWriter = textEncoder.writable.getWriter();

      updateConnectionUI(true, 'Connected', 'USB Serial @ 115200');
      console.log('[Web Serial] Connected to ESP32 on USB port.');

      // Listen for hardware disconnects
      serialPort.addEventListener('disconnect', () => {
        disconnectSerial();
      });

      // Start asynchronous read loop to capture ESP32 serial logs
      readSerialLoop();

    } catch (err) {
      console.warn('[Web Serial] Connection cancelled or error:', err);
      updateConnectionUI(false, 'Disconnected', 'Select USB Controller');
    }
  }

  async function disconnectSerial() {
    try {
      if (serialWriter) {
        await serialWriter.close();
        serialWriter = null;
      }
      if (serialReader) {
        await serialReader.cancel();
        serialReader = null;
      }
      if (serialPort) {
        await serialPort.close();
        serialPort = null;
      }
    } catch (e) {
      console.warn('[Web Serial] Close error:', e);
    }
    updateConnectionUI(false, 'Disconnected', 'Select USB Controller');
  }

  async function readSerialLoop() {
    try {
      while (serialPort && serialPort.readable) {
        const textDecoder = new TextDecoderStream();
        serialPort.readable.pipeTo(textDecoder.writable);
        serialReader = textDecoder.readable.getReader();
        while (true) {
          const { value, done } = await serialReader.read();
          if (done) break;
          if (value) {
            console.log('[ESP32 UART]', value.trim());
          }
        }
      }
    } catch (err) {
      console.log('[Web Serial] Reader stopped:', err);
    }
  }

  /**
   * Dispatch command frame directly to ESP32 over Web Serial.
   */
  async function sendCommand(cmd) {
    if (serialWriter) {
      try {
        await serialWriter.write(cmd + '\n');
      } catch (err) {
        console.warn('[Web Serial] Write error:', err);
      }
    } else {
      console.log('[Controller (Not Connected)]', cmd);
    }
  }

  function updateChannelMatrix(states, duties, fills) {
    for (let i = 0; i < 5; i++) {
      const rows = document.querySelectorAll(`.ch-row-${i}`);
      const vals = document.querySelectorAll(`.ch-val-${i}`);
      const bars = document.querySelectorAll(`.ch-bar-${i}`);
      const isActive = states[i];
      const dutyText = duties ? duties[i] : (isActive ? 'ON (100%)' : 'OFF');
      const fillPct = fills ? fills[i] : (isActive ? '100%' : '0%');

      rows.forEach(r => r.classList.toggle('active', !!isActive));
      vals.forEach(v => v.textContent = dutyText);
      bars.forEach(b => b.style.width = fillPct);
    }
  }

  btnConnectSerial.addEventListener('click', connectSerial);

  // ============================================================================
  // TAB / MODE SWITCHING
  // ============================================================================

  function setMode(mode) {
    currentMode = mode;

    // Reset mode-specific states when switching to ensure fresh state dispatch
    lastPalmState = null;
    lastSentBrightness = -1;
    lastFingerCount = -1;

    // Update Tab Buttons UI
    tabButtons.forEach(btn => {
      const btnMode = parseInt(btn.getAttribute('data-mode'), 10);
      const isActive = btnMode === mode;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    // Update Mode Panes UI
    Object.keys(modePanes).forEach(k => {
      modePanes[k].classList.toggle('active', parseInt(k, 10) === mode);
    });

    // Reset Virtual LEDs to match firmware behavior
    resetVirtualLeds();
  }

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = parseInt(btn.getAttribute('data-mode'), 10);
      setMode(mode);
    });
  });

  // ============================================================================
  // VIRTUAL HARDWARE LED VISUALIZER
  // ============================================================================

  function resetVirtualLeds() {
    virtualLeds.forEach(led => {
      led.classList.remove('active');
      led.style.opacity = '1';
    });
    updateChannelMatrix(
      [false, false, false, false, false],
      ['OFF', 'OFF', 'OFF', 'OFF', 'OFF'],
      ['0%', '0%', '0%', '0%', '0%']
    );
    const statusEl = document.getElementById('counterStatusText');
    if (statusEl) {
      statusEl.textContent = 'All Outputs Inactive';
      statusEl.style.color = 'var(--dim)';
    }
    for (let i = 0; i < 5; i++) {
      const seg = document.getElementById(`seg${i}`);
      if (seg) seg.classList.remove('active');
    }
  }

  function setVirtualLedsState(allOn) {
    virtualLeds.forEach(led => {
      led.classList.toggle('active', allOn);
      led.style.opacity = '1';
    });
    const stateArr = [allOn, allOn, allOn, allOn, allOn];
    const dutyArr = stateArr.map(s => s ? 'ON (100%)' : 'OFF');
    const fillArr = stateArr.map(s => s ? '100%' : '0%');
    updateChannelMatrix(stateArr, dutyArr, fillArr);
  }

  function setVirtualLedsBrightness(brightness) {
    const normalized = brightness / 255;
    virtualLeds.forEach(led => {
      if (brightness > 0) {
        led.classList.add('active');
        led.style.opacity = (0.2 + 0.8 * normalized).toFixed(2);
      } else {
        led.classList.remove('active');
        led.style.opacity = '1';
      }
    });
    const pct = Math.round((brightness / 255) * 100);
    const txt = brightness > 0 ? `${pct}% (${brightness})` : 'OFF (0%)';
    const fill = `${pct}%`;
    const isActive = brightness > 0;
    updateChannelMatrix(
      [isActive, isActive, isActive, isActive, isActive],
      [txt, txt, txt, txt, txt],
      [fill, fill, fill, fill, fill]
    );
  }

  function setVirtualLedsCount(count) {
    virtualLeds.forEach((led, i) => {
      led.classList.toggle('active', i < count);
      led.style.opacity = '1';
    });
    const states = [0, 1, 2, 3, 4].map(i => i < count);
    const duties = states.map(s => s ? 'ON (100%)' : 'OFF');
    const fills = states.map(s => s ? '100%' : '0%');
    updateChannelMatrix(states, duties, fills);

    const statusEl = document.getElementById('counterStatusText');
    if (statusEl) {
      statusEl.textContent = count === 0
        ? 'All Outputs Inactive'
        : count === 5
        ? 'All 5 Outputs Active'
        : `${count} of 5 Outputs Active`;
      statusEl.style.color = count > 0 ? 'var(--led-on)' : 'var(--dim)';
    }
    for (let i = 0; i < 5; i++) {
      const seg = document.getElementById(`seg${i}`);
      if (seg) seg.classList.toggle('active', i < count);
    }
  }

  // ============================================================================
  // GESTURE PROCESSING LOGIC
  // ============================================================================

  function landmarkDistance(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dz = (p1.z || 0) - (p2.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  function analyzeFingers(landmarks) {
    const wrist = landmarks[0];

    // For Index, Middle, Ring, Pinky:
    // Extended if TIP distance from wrist is noticeably greater than PIP distance from wrist
    const isIndexExtended = landmarkDistance(landmarks[8], wrist) > landmarkDistance(landmarks[6], wrist) * 1.12;
    const isMiddleExtended = landmarkDistance(landmarks[12], wrist) > landmarkDistance(landmarks[10], wrist) * 1.12;
    const isRingExtended = landmarkDistance(landmarks[16], wrist) > landmarkDistance(landmarks[14], wrist) * 1.12;
    const isPinkyExtended = landmarkDistance(landmarks[20], wrist) > landmarkDistance(landmarks[18], wrist) * 1.12;

    // For Thumb:
    // Compare distance from Thumb TIP (4) to Pinky MCP base (17) vs Thumb IP (3) to Pinky MCP base (17)
    const isThumbExtended = landmarkDistance(landmarks[4], landmarks[17]) > landmarkDistance(landmarks[3], landmarks[17]) * 1.15;

    return {
      thumb: isThumbExtended,
      index: isIndexExtended,
      middle: isMiddleExtended,
      ring: isRingExtended,
      pinky: isPinkyExtended
    };
  }

  /**
   * Mode 1: Open / Closed palm
   * Sends MODE1:ON / MODE1:OFF only on state change.
   */
  function handleMode1(landmarks, fingers) {
    const extendedCount = Object.values(fingers).filter(Boolean).length;
    let detectedState = null;

    if (extendedCount >= 4) {
      detectedState = 'OPEN';
    } else if (extendedCount <= 1) {
      detectedState = 'CLOSED';
    }

    if (detectedState) {
      palmStateBadge.textContent = detectedState === 'OPEN' ? 'OPEN PALM (ALL ON)' : 'CLOSED FIST (ALL OFF)';
      palmStateBadge.className = 'metric-pill ' + detectedState.toLowerCase();

      // Send frame ONLY when the state actually changes
      if (detectedState !== lastPalmState) {
        lastPalmState = detectedState;
        const cmd = detectedState === 'OPEN' ? 'MODE1:ON' : 'MODE1:OFF';
        cmdMode1.textContent = cmd;
        sendCommand(cmd);
        setVirtualLedsState(detectedState === 'OPEN');
      }
    } else {
      palmStateBadge.textContent = 'TRANSITIONING...';
      palmStateBadge.className = 'metric-pill';
    }
  }

  /**
   * Mode 2: Pinch distance (Landmarks 4 Thumb Tip & 8 Index Tip)
   * Sends MODE2:<0-255> throttled to ~10 messages/sec max.
   */
  function handleMode2(landmarks) {
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const dist = landmarkDistance(thumbTip, indexTip);

    // Map pinch distance range [0.035 (closed pinch), 0.22 (fully spread)] to [0, 255]
    const MIN_DIST = 0.035;
    const MAX_DIST = 0.22;
    const normalized = Math.max(0, Math.min(1, (dist - MIN_DIST) / (MAX_DIST - MIN_DIST)));
    const brightness = Math.round(normalized * 255);
    const percentage = Math.round(normalized * 100);

    // Update UI immediately for fluid visual feedback
    pinchDistanceVal.textContent = dist.toFixed(3);
    brightnessNumeric.textContent = `${brightness} / 255 (${percentage}%)`;
    brightnessBar.style.width = `${percentage}%`;
    cmdMode2.textContent = `MODE2:${brightness}`;
    setVirtualLedsBrightness(brightness);

    // Throttle Serial transmission to ~10 Hz (100ms interval)
    const now = performance.now();
    if (now - lastMode2Timestamp >= MODE2_THROTTLE_MS) {
      if (brightness !== lastSentBrightness) {
        lastSentBrightness = brightness;
        lastMode2Timestamp = now;
        sendCommand(`MODE2:${brightness}`);
      }
    }
  }

  /**
   * Mode 3: Finger count (0-5)
   * Sends MODE3:<0-5> only on count change.
   */
  function handleMode3(fingers) {
    const count = Object.values(fingers).filter(Boolean).length;

    // Update Finger Chips in UI
    const updateChip = (chip, isExtended) => {
      chip.classList.toggle('extended', isExtended);
      chip.querySelector('.finger-state').textContent = isExtended ? 'UP' : 'DOWN';
    };

    updateChip(chipThumb, fingers.thumb);
    updateChip(chipIndex, fingers.index);
    updateChip(chipMiddle, fingers.middle);
    updateChip(chipRing, fingers.ring);
    updateChip(chipPinky, fingers.pinky);

    fingerCountDisplay.textContent = count;
    cmdMode3.textContent = `MODE3:${count}`;
    setVirtualLedsCount(count);

    // Send frame ONLY when the count actually changes
    if (count !== lastFingerCount) {
      lastFingerCount = count;
      sendCommand(`MODE3:${count}`);
    }
  }

  // ============================================================================
  // MEDIAPIPE HANDS RESULTS HANDLER & DRAWING
  // ============================================================================

  // Red joints, green bones, red pinch line in Pinch Dimmer mode (design only, no logic)
  function drawMinimalHandLandmarks(ctx, landmarks) {
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
      [0, 5], [5, 6], [6, 7], [7, 8],       // Index
      [5, 9], [9, 10], [10, 11], [11, 12],   // Middle
      [9, 13], [13, 14], [14, 15], [15, 16], // Ring
      [13, 17], [17, 18], [18, 19], [19, 20],// Pinky
      [0, 17]                                // Palm base
    ];

    const w = canvasElement.width;
    const h = canvasElement.height;
    const s = w / 640; // scale with camera resolution

    // Bones - bright vivid spring green (#2BFF00)
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.8 * s;
    ctx.strokeStyle = '#2BFF00';
    connections.forEach(([i, j]) => {
      ctx.beginPath();
      ctx.moveTo(landmarks[i].x * w, landmarks[i].y * h);
      ctx.lineTo(landmarks[j].x * w, landmarks[j].y * h);
      ctx.stroke();
    });

    // Pinch distance: caliper line between thumb tip (4) and index tip (8) in Mode 2
    if (currentMode === 2) {
      ctx.lineWidth = 2.8 * s;
      ctx.strokeStyle = '#FF0000';
      ctx.beginPath();
      ctx.moveTo(landmarks[4].x * w, landmarks[4].y * h);
      ctx.lineTo(landmarks[8].x * w, landmarks[8].y * h);
      ctx.stroke();
    }

    // Joints - pure full red (#FF0000), solid fill with NO white border
    landmarks.forEach((pt, index) => {
      const isPinchPoint = (currentMode === 2 && (index === 4 || index === 8));
      const radius = isPinchPoint ? (4.8 * s) : (4.0 * s);

      ctx.beginPath();
      ctx.arc(pt.x * w, pt.y * h, radius, 0, 2 * Math.PI);
      ctx.fillStyle = '#FF0000';
      ctx.fill();
    });
  }

  function onResults(results) {
    // Update FPS counter
    frameCount++;
    const now = performance.now();
    if (now - lastFpsUpdateTime >= 1000) {
      fpsDisplay.textContent = `${frameCount} FPS`;
      frameCount = 0;
      lastFpsUpdateTime = now;
    }

    // Prepare Canvas Dimensions
    if (canvasElement.width !== videoElement.videoWidth || canvasElement.height !== videoElement.videoHeight) {
      canvasElement.width = videoElement.videoWidth || 640;
      canvasElement.height = videoElement.videoHeight || 480;
    }

    // Render Clean Video Frame onto Canvas
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const landmarks = results.multiHandLandmarks[0];
      handTrackingStatus.textContent = 'Hand Tracked (1)';

      // Draw minimal hand landmark overlays
      drawMinimalHandLandmarks(canvasCtx, landmarks);

      // Perform finger analysis
      const fingers = analyzeFingers(landmarks);

      // Route to active mode handler
      if (currentMode === 1) {
        handleMode1(landmarks, fingers);
      } else if (currentMode === 2) {
        handleMode2(landmarks);
      } else if (currentMode === 3) {
        handleMode3(fingers);
      }
    } else {
      handTrackingStatus.textContent = 'No Hand Detected';
    }

    canvasCtx.restore();
  }

  // ============================================================================
  // CAMERA ACQUISITION & MEDIAPIPE INITIALIZATION
  // ============================================================================

  let handsInstance = null;

  function initMediaPipe() {
    handsInstance = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    handsInstance.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.65,
      minTrackingConfidence: 0.65
    });

    handsInstance.onResults(onResults);
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      });

      videoElement.srcObject = stream;
      await videoElement.play();

      isCameraActive = true;
      cameraFallback.classList.add('hidden');

      // Frame Processing Animation Loop
      const processLoop = async () => {
        if (isCameraActive && videoElement.readyState >= 2 && handsInstance) {
          try {
            await handsInstance.send({ image: videoElement });
          } catch (err) {
            console.error('[MediaPipe] Frame inference error:', err);
          }
        }
        if (isCameraActive) {
          requestAnimationFrame(processLoop);
        }
      };

      requestAnimationFrame(processLoop);

    } catch (err) {
      console.warn('[Camera] Access denied or error:', err);
      showCameraError(err);
    }
  }

  function showCameraError(err) {
    cameraFallback.classList.remove('hidden');
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      fallbackTitle.textContent = 'Camera Access Blocked';
      fallbackDesc.textContent = 'Camera permission was denied in your browser. Please allow camera permissions in site settings and click "Enable Camera" to begin gesture tracking.';
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      fallbackTitle.textContent = 'No Webcam Detected';
      fallbackDesc.textContent = 'No camera device was detected on your computer. Please connect a webcam and click "Enable Camera".';
    } else {
      fallbackTitle.textContent = 'Camera Unavailable';
      fallbackDesc.textContent = `Could not access video feed (${err.message || err.name}). Please check permissions and click "Enable Camera".`;
    }
  }

  btnEnableCamera.addEventListener('click', () => {
    startCamera();
  });

  // ============================================================================
  // APP BOOTSTRAP
  // ============================================================================

  window.addEventListener('DOMContentLoaded', () => {
    initMediaPipe();
    startCamera();
  });

})();