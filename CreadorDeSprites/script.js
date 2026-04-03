const mainVideo = document.getElementById('mainVideo');
const mainImage = document.getElementById('mainImage');
const timeline = document.getElementById('timeline');
const loopTimeline = document.getElementById('loopTimeline');
const loopCanvas = document.getElementById('loopCanvas');
const loopCtx = loopCanvas.getContext('2d');

const loopStart = document.getElementById('loopStart');
const loopEnd = document.getElementById('loopEnd');
const manualFrameStart = document.getElementById('manualFrameStart');
const manualFrameEnd = document.getElementById('manualFrameEnd');
const generateBtn = document.getElementById('generateBtn');
const dropZone = document.getElementById('dropZone');

const chromaRefCanvas = document.getElementById('chromaRefCanvas');
const chromaRefCtx = chromaRefCanvas.getContext('2d');
const colorPreview = document.getElementById('colorPreview');
const chromaTolerance = document.getElementById('chromaTolerance');
const tolValueLabel = document.getElementById('tolValue');
const chromaErode = document.getElementById('chromaErode');
const erodeValueLabel = document.getElementById('erodeValue');

// EXPORTACIÓN Y RECORTE CAPA 4
const finalExportCanvas = document.getElementById('finalExportCanvas');
const frameSkip = document.getElementById('frameSkip');
const skipWarning = document.getElementById('skipWarning');
const btnExportSpriteSheet = document.getElementById('btnExportSpriteSheet');

// SELECTOR Y CONTROLES NUMÉRICOS
const alignModeSelect = document.getElementById('alignModeSelect');
const manualControls = document.getElementById('manualControls');

const gridWInput = document.getElementById('gridW');
const gridHInput = document.getElementById('gridH');
const gridGuide = document.getElementById('gridGuide');

// Conexión Slider -> Input Numérico
const assetScale = document.getElementById('assetScale');
const numScale = document.getElementById('numScale');
const offsetX = document.getElementById('offsetX');
const numOffX = document.getElementById('numOffX');
const offsetY = document.getElementById('offsetY');
const numOffY = document.getElementById('numOffY');

// MASTER BOARD & CAMERA
const masterCanvas = document.getElementById('masterCanvas');
const masterCtx = masterCanvas.getContext('2d');
const masterCamera = document.getElementById('masterCamera');
const btnAppendToMaster = document.getElementById('btnAppendToMaster');
const masterDropZone = document.getElementById('masterDropZone');
const masterInput = document.getElementById('masterInput');
const btnDownloadMaster = document.getElementById('btnDownloadMaster');
const btnClearMaster = document.getElementById('btnClearMaster');
const rowManagerContainer = document.getElementById('rowManagerContainer');

let originalFramesData = [], processedFrames = [], timeStampMap = [], loopThumbElements = [];
let previewTimer, currentLoopIdx = 0, playDirection = 1, selectedRGB = null;
const FPS = 30;
let currentMediaType = null;

// ESTRUCTURA DE DATOS DEL MASTER BOARD DINÁMICO
let currentCroppedSprites = []; 
let masterGridRows = []; 
let masterUploadedImg = null; 

// Para bloquear la cuadrícula base y hacer el Auto-Scale
let lockedGridW = 0;
let lockedGridH = 0;
let universalReferenceH = 0; // Se guarda en la Fila 1

// Memoria para que el Auto le pase los valores al Manual sin brincar
window.lastAutoScale = 100;
window.lastAutoOffX = 0;
window.lastAutoOffY = 0;
let prevMode = 'auto';

// VARIABLES DE LA CÁMARA
let mScale = 1;
let mPanX = 0, mPanY = 0;
let isDraggingM = false;
let startDragX, startDragY;

// --- 1. DRAG & DROP INMERSIVO ---
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    window.addEventListener(eventName, preventDefaults, false);
    dropZone.addEventListener(eventName, preventDefaults, false);
});
function preventDefaults (e) { e.preventDefault(); e.stopPropagation(); }
['dragenter', 'dragover'].forEach(eventName => { dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-over'), false); });
['dragleave', 'drop'].forEach(eventName => { dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-over'), false); });

dropZone.addEventListener('drop', (e) => {
    let dt = e.dataTransfer; let files = dt.files;
    if(files.length) handleFile(files[0]);
}, false);

dropZone.onclick = () => document.getElementById('videoInput').click();
document.getElementById('videoInput').onchange = (e) => { if (e.target.files.length) handleFile(e.target.files[0]); };

function handleFile(file) {
    if (!file) return; 
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) return alert("Sube video o imagen válido.");
    
    const url = URL.createObjectURL(file);
    if (isVideo) { currentMediaType = 'video'; mainVideo.src = url; mainVideo.load(); } 
    else { currentMediaType = 'image'; mainImage.src = url; }
    
    dropZone.innerHTML = `
        <div class="text-center space-y-3">
            <p class="text-5xl text-emerald-400">✅</p>
            <p class="text-sm font-semibold text-slate-200">${isVideo ? '🎬' : '🖼️'} ${file.name}</p>
        </div>
    `;
    ['loopSection', 'chromaSection', 'exportSection'].forEach(id => {
        let el = document.getElementById(id);
        if(el) el.classList.add('panel-disabled');
    });
}

// --- 2. EXTRACCIÓN ---
generateBtn.onclick = async () => {
    if (!currentMediaType) return alert("Sube un archivo primero");
    generateBtn.innerText = "Procesando..."; generateBtn.disabled = true;
    originalFramesData = []; processedFrames = []; timeStampMap = []; loopThumbElements = [];
    clearInterval(previewTimer); selectedRGB = null;
    timeline.innerHTML = ""; loopTimeline.innerHTML = "";

    const procCanvas = document.getElementById('procCanvas');
    const pCtx = procCanvas.getContext('2d');
    
    if (currentMediaType === 'video') {
        const step = parseInt(document.getElementById('frameStep').value) || 1;
        mainVideo.load();
        await new Promise(r => {
            if (mainVideo.readyState >= 2) r();
            else { mainVideo.onloadeddata = r; mainVideo.onerror = r; }
        });
        procCanvas.width = mainVideo.videoWidth; procCanvas.height = mainVideo.videoHeight;
        loopStart.max = mainVideo.duration; loopEnd.max = mainVideo.duration; loopEnd.value = mainVideo.duration;
        
        let currentTime = 0;
        while (currentTime < mainVideo.duration) {
            mainVideo.currentTime = currentTime;
            await new Promise(r => { mainVideo.onseeked = r; setTimeout(r, 80); });
            pCtx.drawImage(mainVideo, 0, 0);
            timeStampMap.push(currentTime);
            saveFrameToPipeline(procCanvas);
            currentTime += (1/FPS * step);
        }
    } else {
        await new Promise(r => {
            if (mainImage.complete && mainImage.naturalHeight !== 0) r();
            else { mainImage.onload = r; mainImage.onerror = r; }
        });
        procCanvas.width = mainImage.naturalWidth; procCanvas.height = mainImage.naturalHeight;
        pCtx.drawImage(mainImage, 0, 0);
        loopStart.max = 0; loopEnd.max = 0; loopEnd.value = 0;
        timeStampMap.push(0);
        saveFrameToPipeline(procCanvas);
    }
    
    ['loopSection', 'chromaSection', 'exportSection'].forEach(id => {
        let el = document.getElementById(id);
        if(el) el.classList.remove('panel-disabled');
    });
    manualFrameStart.max = originalFramesData.length; manualFrameEnd.max = originalFramesData.length;
    manualFrameStart.value = 1; manualFrameEnd.value = originalFramesData.length;
    generateBtn.innerText = "⚡ Procesar Asset"; generateBtn.disabled = false;
    
    syncLoopControls('slider'); updateChromaRef(); 
    alignModeSelect.value = 'auto'; // Forzar a auto al cargar uno nuevo
    alignModeSelect.dispatchEvent(new Event('change'));
    startCanvasPreview();
};

function saveFrameToPipeline(procCanvas) {
    const f = document.createElement('canvas'); f.width = procCanvas.width; f.height = procCanvas.height;
    f.getContext('2d').drawImage(procCanvas, 0, 0); originalFramesData.push(f);

    const pf = document.createElement('canvas'); pf.width = procCanvas.width; pf.height = procCanvas.height;
    pf.getContext('2d').drawImage(f, 0, 0); processedFrames.push(pf);
    timeline.appendChild(f);

    const fl = f.cloneNode(); fl.getContext('2d').drawImage(f, 0, 0);
    const currentIdx = originalFramesData.length - 1;
    fl.onclick = () => { loopStart.value = timeStampMap[currentIdx]; syncLoopControls('slider'); };
    fl.oncontextmenu = (e) => { e.preventDefault(); loopEnd.value = timeStampMap[currentIdx]; syncLoopControls('slider'); };
    loopThumbElements.push(fl); loopTimeline.appendChild(fl);
}

// --- 3. EDITOR DE LOOP ---
function syncLoopControls(source) {
    let sVal, eVal, idxS, idxE;
    const step = parseInt(document.getElementById('frameStep').value) || 1;

    if (source === 'slider') {
        sVal = parseFloat(loopStart.value); eVal = parseFloat(loopEnd.value);
        if (sVal >= eVal && currentMediaType === 'video') { sVal = Math.max(0, eVal - (1/FPS * step)); loopStart.value = sVal.toFixed(2); }
        idxS = findClosestIndex(sVal); idxE = findClosestIndex(eVal);
        manualFrameStart.value = idxS + 1; manualFrameEnd.value = idxE + 1;
    } else {
        idxS = parseInt(manualFrameStart.value) - 1; idxE = parseInt(manualFrameEnd.value) - 1;
        if (idxS < 0) idxS = 0;
        if (idxE >= originalFramesData.length) idxE = originalFramesData.length - 1;
        if (idxS >= idxE && currentMediaType === 'video') { idxS = Math.max(0, idxE - 1); manualFrameStart.value = idxS + 1; }
        else if (currentMediaType === 'image') { idxS = 0; idxE = 0; }
        loopStart.value = timeStampMap[idxS]; loopEnd.value = timeStampMap[idxE];
    }
    document.getElementById('fStart').innerText = idxS + 1; document.getElementById('fEnd').innerText = idxE + 1;
    loopThumbElements.forEach((c, i) => {
        c.classList.remove('start-mark', 'end-mark');
        if (i === idxS) c.classList.add('start-mark');
        if (i === idxE) c.classList.add('end-mark');
    });
    currentLoopIdx = 0; updateChromaRef(); updateExportPreview(); startCanvasPreview();
}

function findClosestIndex(t) {
    if(!timeStampMap.length) return 0;
    return timeStampMap.reduce((p, c, i) => Math.abs(c - t) < Math.abs(timeStampMap[p] - t) ? i : p, 0);
}

loopStart.oninput = () => syncLoopControls('slider'); loopEnd.oninput = () => syncLoopControls('slider');
manualFrameStart.onchange = () => syncLoopControls('keyboard'); manualFrameEnd.onchange = () => syncLoopControls('keyboard');
['pingPongMode', 'blendLoopMode', 'blendFramesCount'].forEach(id => {
    let el = document.getElementById(id);
    if(el) el.onchange = startCanvasPreview;
});
frameSkip.oninput = () => { if (frameSkip.value < 1) frameSkip.value = 1; updateExportPreview(); startCanvasPreview(); };

// --- 4. MOTOR DE PREVIEW ---
function startCanvasPreview() {
    clearInterval(previewTimer); let magicStep = 0;
    previewTimer = setInterval(() => {
        const idxS = parseInt(manualFrameStart.value) - 1, idxE = parseInt(manualFrameEnd.value) - 1;
        const numBlend = parseInt(document.getElementById('blendFramesCount').value) || 1;
        const isPingPong = document.getElementById('pingPongMode').checked, isBlend = document.getElementById('blendLoopMode').checked;
        const skip = parseInt(frameSkip.value) || 1;
        
        if (isNaN(idxS) || isNaN(idxE)) return;

        let activeIndices = [];
        for (let i = idxS; i <= idxE; i += skip) activeIndices.push(i);
        if (activeIndices.length === 0) activeIndices.push(idxS);
        const maxIdx = activeIndices.length - 1;

        if (currentLoopIdx > maxIdx || currentLoopIdx < 0) currentLoopIdx = 0;
        let frame, reset = false;
        
        if (isBlend && !isPingPong && magicStep > 0 && currentMediaType === 'video') {
            frame = createBlended(processedFrames[activeIndices[maxIdx]], processedFrames[activeIndices[0]], magicStep / (numBlend + 1));
            if (++magicStep > numBlend) { magicStep = 0; reset = true; }
        } else { frame = processedFrames[activeIndices[currentLoopIdx]]; }

        if (frame) {
            loopCanvas.width = frame.width; loopCanvas.height = frame.height;
            loopCtx.clearRect(0, 0, loopCanvas.width, loopCanvas.height);
            loopCtx.imageRendering = 'pixelated'; loopCtx.drawImage(frame, 0, 0);
        }

        if (reset) currentLoopIdx = 0;
        else if (isPingPong && currentMediaType === 'video') {
            currentLoopIdx += playDirection;
            if (currentLoopIdx >= maxIdx) { currentLoopIdx = maxIdx; playDirection = -1; }
            else if (currentLoopIdx <= 0) { currentLoopIdx = 0; playDirection = 1; }
        } else if (currentMediaType === 'video') {
            if (magicStep === 0) { if (++currentLoopIdx > maxIdx) { if (isBlend) { currentLoopIdx = maxIdx; magicStep = 1; } else currentLoopIdx = 0; } }
        }
    }, 1000 / FPS); 
}

function createBlended(e, s, a) {
    const c = document.createElement('canvas'); c.width = e.width; c.height = e.height;
    const ctx = c.getContext('2d'); ctx.imageRendering = 'pixelated';
    ctx.globalAlpha = 1.0; ctx.drawImage(e, 0, 0); ctx.globalAlpha = a; ctx.drawImage(s, 0, 0); return c;
}

// --- 5. CHROMA ---
function updateChromaRef() {
    if(!originalFramesData.length) return;
    const f = originalFramesData[parseInt(manualFrameStart.value) - 1];
    chromaRefCanvas.width = f.width; chromaRefCanvas.height = f.height;
    chromaRefCanvas.getContext('2d').drawImage(f, 0, 0);
}
chromaRefCanvas.onclick = (e) => {
    const r = chromaRefCanvas.getBoundingClientRect(), sX = chromaRefCanvas.width / r.width, sY = chromaRefCanvas.height / r.height;
    const p = chromaRefCanvas.getContext('2d').getImageData((e.clientX - r.left) * sX, (e.clientY - r.top) * sY, 1, 1).data;
    selectedRGB = { r: p[0], g: p[1], b: p[2] }; colorPreview.style.background = `rgb(${p[0]},${p[1]},${p[2]})`;
    applyChromaNonDestructive();
};
chromaTolerance.oninput = () => { tolValueLabel.innerText = chromaTolerance.value; if(selectedRGB) applyChromaNonDestructive(); };
chromaErode.oninput = () => { erodeValueLabel.innerText = chromaErode.value + ' px'; if(selectedRGB) applyChromaNonDestructive(); };

function applyChromaNonDestructive() {
    if (!selectedRGB || !originalFramesData.length) return;
    const tolSq = Math.pow(parseInt(chromaTolerance.value), 2);
    const erodeRadius = parseInt(chromaErode.value) || 0;

    originalFramesData.forEach((origCanvas, i) => {
        const procCtx = processedFrames[i].getContext('2d', { willReadFrequently: true });
        const w = origCanvas.width, h = origCanvas.height;
        const imgData = origCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0,0,w,h);
        const d = imgData.data;

        for (let j=0; j<d.length; j+=4) {
            if (Math.pow(d[j]-selectedRGB.r, 2) + Math.pow(d[j+1]-selectedRGB.g, 2) + Math.pow(d[j+2]-selectedRGB.b, 2) <= tolSq) d[j+3] = 0;
        }

        if (erodeRadius > 0) {
            const outAlpha = new Uint8Array(w * h);
            for (let p = 0; p < w * h; p++) outAlpha[p] = d[p * 4 + 3];
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const idx = y * w + x;
                    if (outAlpha[idx] > 0) {
                        let isEdge = false;
                        for (let dy = -erodeRadius; dy <= erodeRadius; dy++) {
                            for (let dx = -erodeRadius; dx <= erodeRadius; dx++) {
                                if (dx === 0 && dy === 0) continue;
                                const nx = x + dx, ny = y + dy;
                                if (nx >= 0 && nx < w && ny >= 0 && ny < h && outAlpha[ny * w + nx] === 0) { isEdge = true; break; }
                            } if (isEdge) break;
                        }
                        if (isEdge) d[idx * 4 + 3] = 0; 
                    }
                }
            }
        }
        
        procCtx.clearRect(0,0,w,h); procCtx.putImageData(imgData, 0, 0);
        const thumbCtx = loopThumbElements[i].getContext('2d');
        thumbCtx.clearRect(0,0,w,h); thumbCtx.drawImage(processedFrames[i], 0, 0);
    });
    updateExportPreview(); 
}

// --- 6. EXPORTACIÓN HÍBRIDA CAPA 4 (LA MAGIA VISUAL/MANUAL) ---

assetScale.oninput = (e) => { numScale.value = e.target.value; updateExportPreview(); };
numScale.oninput = (e) => { assetScale.value = e.target.value; updateExportPreview(); };

offsetX.oninput = (e) => { numOffX.value = e.target.value; updateExportPreview(); };
numOffX.oninput = (e) => { offsetX.value = e.target.value; updateExportPreview(); };

offsetY.oninput = (e) => { numOffY.value = e.target.value; updateExportPreview(); };
numOffY.oninput = (e) => { offsetY.value = e.target.value; updateExportPreview(); };

gridWInput.oninput = updateExportPreview;
gridHInput.oninput = updateExportPreview;

// Actualizar estados visuales de la UI
function updateAlignmentUI() {
    let isAuto = alignModeSelect.value === 'auto';
    let isMasterLocked = masterGridRows.length > 0;

    // Asegurarse que el contenedor de controles siempre esté visible
    if(manualControls.classList.contains('hidden')) {
        manualControls.classList.remove('hidden');
    }

    const manualInputs = [assetScale, numScale, offsetX, numOffX, offsetY, numOffY];
    manualInputs.forEach(el => { el.disabled = isAuto; });

    if (isAuto) {
        manualControls.style.opacity = '0.5';
        manualControls.style.pointerEvents = 'none';
        if(gridGuide) gridGuide.style.display = 'none';
    } else {
        manualControls.style.opacity = '1';
        manualControls.style.pointerEvents = 'auto';
        if(gridGuide) gridGuide.style.display = 'block';
    }

    if (isMasterLocked) {
        gridWInput.disabled = true;
        gridHInput.disabled = true;
    } else {
        gridWInput.disabled = isAuto;
        gridHInput.disabled = isAuto;
    }
}

// Evento al cambiar el desplegable
alignModeSelect.onchange = () => {
    let currentMode = alignModeSelect.value;

    // MAGIA: Si el usuario pasa de 'auto' a 'manual', inyectamos los valores para que NO BRINQUE
    if (prevMode === 'auto' && currentMode === 'manual') {
        assetScale.value = window.lastAutoScale;
        numScale.value = window.lastAutoScale;
        offsetX.value = window.lastAutoOffX;
        numOffX.value = window.lastAutoOffX;
        offsetY.value = window.lastAutoOffY;
        numOffY.value = window.lastAutoOffY;
    }
    
    prevMode = currentMode;
    updateAlignmentUI();
    updateExportPreview();
};

function getGlobalBoundingBox(frames) {
    let globalMinX = Infinity, globalMinY = Infinity, globalMaxX = -1, globalMaxY = -1;
    let hasContent = false;
    frames.forEach(canvas => {
        const w = canvas.width, h = canvas.height;
        const data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (data[(y * w + x) * 4 + 3] > 10) { 
                    if (x < globalMinX) globalMinX = x;
                    if (y < globalMinY) globalMinY = y;
                    if (x > globalMaxX) globalMaxX = x;
                    if (y > globalMaxY) globalMaxY = y;
                    hasContent = true;
                }
            }
        }
    });
    if (!hasContent) return null;
    return { x: globalMinX, y: globalMinY, w: (globalMaxX - globalMinX) + 1, h: (globalMaxY - globalMinY) + 1 };
}

function updateExportPreview() {
    currentCroppedSprites = []; 
    if(!processedFrames.length) return;
    const idxS = parseInt(manualFrameStart.value) - 1, idxE = parseInt(manualFrameEnd.value) - 1;
    if (isNaN(idxS) || isNaN(idxE)) return;

    const skip = parseInt(frameSkip.value) || 1;
    let activeIndices = [];
    for (let i = idxS; i <= idxE; i += skip) activeIndices.push(i);
    const finalSprites = activeIndices.map(i => processedFrames[i]);

    if(finalSprites.length === 0) return;
    let fCountEl = document.getElementById('finalSpriteCount');
    if(fCountEl) fCountEl.innerText = finalSprites.length;

    const bounds = getGlobalBoundingBox(finalSprites);
    if (!bounds) return;

    let mode = alignModeSelect.value;
    let isMasterLocked = masterGridRows.length > 0;
    
    let gW, gH, scaleVal, drawX, drawY;
    let cropW = bounds.w, cropH = bounds.h;

    if (mode === 'auto') {
        // En automático leemos el Master si existe, o usamos la silueta si no.
        if (isMasterLocked && universalReferenceH > 0) {
            gW = lockedGridW;
            gH = lockedGridH;
            scaleVal = universalReferenceH / cropH;
        } else {
            gW = cropW;
            gH = cropH;
            scaleVal = 1;
        }
        
        let scaledW = cropW * scaleVal;
        let scaledH = cropH * scaleVal;

        // Auto centra en X y ancla al PISO en Y
        drawX = (gW - scaledW) / 2;
        drawY = gH - scaledH; 

        // GUARDAR VALORES EN MEMORIA: Calculamos el equivalente Manual para cuando el usuario cambie de modo
        window.lastAutoScale = Math.round(scaleVal * 100);
        window.lastAutoOffX = 0; // X ya está centrado en ambos
        // La diferencia entre el piso (Auto) y el centro (Manual) es justo la mitad del espacio sobrante
        window.lastAutoOffY = Math.round((gH - scaledH) / 2); 

        // Actualizamos los controles visualmente para que el usuario sepa qué hace la máquina
        if(!isMasterLocked) { gridWInput.value = gW; gridHInput.value = gH; }
        numScale.value = window.lastAutoScale; assetScale.value = window.lastAutoScale;
        numOffX.value = window.lastAutoOffX; offsetX.value = window.lastAutoOffX;
        numOffY.value = window.lastAutoOffY; offsetY.value = window.lastAutoOffY;

    } else {
        // MODO MANUAL: Respetamos cien por ciento lo que dicen los inputs
        gW = parseInt(gridWInput.value) || 180;
        gH = parseInt(gridHInput.value) || 180;
        
        if (isMasterLocked) {
            gW = lockedGridW;
            gH = lockedGridH;
            gridWInput.value = gW;
            gridHInput.value = gH;
        }

        scaleVal = parseFloat(numScale.value) / 100;
        let offX = parseInt(numOffX.value) || 0;
        let offY = parseInt(numOffY.value) || 0;

        let scaledW = cropW * scaleVal;
        let scaledH = cropH * scaleVal;

        // Manual centra en ambos ejes y luego aplica el offset del usuario
        drawX = (gW - scaledW) / 2 + offX;
        drawY = (gH - scaledH) / 2 + offY;
    }

    if (gridGuide) gridGuide.style.backgroundSize = `${gW}px ${gH}px`;
    window.currentAnimRawHeight = cropH; // Guardado por si se vuelve la primera fila

    finalExportCanvas.width = gW * finalSprites.length;
    finalExportCanvas.height = gH;
    
    const ctx = finalExportCanvas.getContext('2d');
    ctx.imageRendering = 'pixelated'; 
    ctx.clearRect(0,0, finalExportCanvas.width, finalExportCanvas.height);
    
    finalSprites.forEach((f, index) => { 
        let cellCanvas = document.createElement('canvas');
        cellCanvas.width = gW;
        cellCanvas.height = gH;
        let cCtx = cellCanvas.getContext('2d');
        cCtx.imageSmoothingEnabled = false;
        cCtx.drawImage(f, bounds.x, bounds.y, cropW, cropH, drawX, drawY, cropW * scaleVal, cropH * scaleVal);

        ctx.drawImage(cellCanvas, index * gW, 0);
        currentCroppedSprites.push(cellCanvas);
    });
}

btnExportSpriteSheet.onclick = () => {
    if (btnExportSpriteSheet.disabled) return;
    const link = document.createElement('a'); link.download = `fila_sprites_${manualFrameStart.value}.png`;
    link.href = finalExportCanvas.toDataURL('image/png'); link.click();
};

// --- 7. MASTER BOARD COMPOSITOR ---
btnAppendToMaster.onclick = () => {
    if (btnAppendToMaster.disabled || currentCroppedSprites.length === 0) return;

    if (masterGridRows.length === 0) {
        lockedGridW = parseInt(gridWInput.value) || 180;
        lockedGridH = parseInt(gridHInput.value) || 180;
        universalReferenceH = window.currentAnimRawHeight;
    }

    masterGridRows.push([...currentCroppedSprites]);
    
    updateRowManagerUI();
    renderMasterBoard();
    updateAlignmentUI(); // Por si cambió el estado de "isLocked"
    
    mPanX = 0; mPanY = 0; mScale = 1; updateMasterCamera();
    document.getElementById('masterSection').scrollIntoView({ behavior: 'smooth' });
};

// --- ADMINISTRADOR DE FILAS LIGADO A WINDOW ---
window.moveRow = function(index, dir) {
    if (index + dir < 0 || index + dir >= masterGridRows.length) return;
    const temp = masterGridRows[index];
    masterGridRows[index] = masterGridRows[index + dir];
    masterGridRows[index + dir] = temp;
    updateRowManagerUI();
    renderMasterBoard();
};

window.deleteRow = function(index) {
    if(!confirm(`¿Seguro que quieres borrar la fila ${index + 1}?`)) return;
    masterGridRows.splice(index, 1);
    
    if(masterGridRows.length === 0 && !masterUploadedImg) {
        lockedGridW = 0;
        lockedGridH = 0;
        universalReferenceH = 0;
        updateAlignmentUI();
    }
    
    updateRowManagerUI();
    renderMasterBoard();
};

function updateRowManagerUI() {
    if(!rowManagerContainer) return;
    rowManagerContainer.innerHTML = '';
    if(masterGridRows.length === 0) {
        rowManagerContainer.innerHTML = '<p class="text-center text-slate-600 text-xs py-6">La cuadrícula está vacía.</p>';
        return;
    }

    masterGridRows.forEach((row, index) => {
        const item = document.createElement('div');
        item.className = 'row-manager-item';

        let previewCanvas = document.createElement('canvas');
        previewCanvas.className = 'row-manager-preview';
        if(row.length > 0) {
            previewCanvas.width = row[0].width;
            previewCanvas.height = row[0].height;
            let pCtx = previewCanvas.getContext('2d');
            pCtx.imageSmoothingEnabled = false;
            pCtx.drawImage(row[0], 0, 0);
        }

        item.innerHTML = `<span class="row-manager-idx">${index + 1}</span>`;
        item.appendChild(previewCanvas);

        const actions = document.createElement('div');
        actions.className = 'row-manager-actions';

        const btnUp = document.createElement('button');
        btnUp.className = 'btn-row-action';
        btnUp.innerHTML = '⬆️';
        btnUp.disabled = index === 0;
        btnUp.setAttribute('onclick', `window.moveRow(${index}, -1)`);

        const btnDown = document.createElement('button');
        btnDown.className = 'btn-row-action';
        btnDown.innerHTML = '⬇️';
        btnDown.disabled = index === masterGridRows.length - 1;
        btnDown.setAttribute('onclick', `window.moveRow(${index}, 1)`);

        const btnDel = document.createElement('button');
        btnDel.className = 'btn-row-action btn-row-delete';
        btnDel.innerHTML = '🗑️';
        btnDel.setAttribute('onclick', `window.deleteRow(${index})`);

        actions.appendChild(btnUp);
        actions.appendChild(btnDown);
        actions.appendChild(btnDel);

        item.appendChild(actions);
        rowManagerContainer.appendChild(item);
    });
}

function renderMasterBoard() {
    let maxCols = 0;
    masterGridRows.forEach(row => { if (row.length > maxCols) maxCols = row.length; });

    if (maxCols === 0 && !masterUploadedImg) {
        masterCanvas.width = 0; masterCanvas.height = 0;
        return;
    }

    let cellW = lockedGridW || parseInt(gridWInput.value) || 180;
    let cellH = lockedGridH || parseInt(gridHInput.value) || 180; 

    let startY = 0;
    if (masterUploadedImg) startY = masterUploadedImg.height;

    let totalW = Math.max(maxCols * cellW, masterUploadedImg ? masterUploadedImg.width : 0);
    let totalH = startY + (masterGridRows.length * cellH);

    masterCanvas.width = totalW;
    masterCanvas.height = totalH;
    masterCtx.imageRendering = 'pixelated';
    masterCtx.clearRect(0,0, masterCanvas.width, masterCanvas.height);

    if (masterUploadedImg) masterCtx.drawImage(masterUploadedImg, 0, 0);

    masterGridRows.forEach((row, rIdx) => {
        row.forEach((spr, cIdx) => {
            let dX = cIdx * cellW;
            let dY = startY + (rIdx * cellH); 
            masterCtx.drawImage(spr, dX, dY);
        });
    });
}

// --- EL SMART SLICE CORTADOR (VERTICAL + HORIZONTAL) ---
masterDropZone.onclick = () => masterInput.click();
masterInput.onchange = (e) => { if(e.target.files.length) loadMasterImage(e.target.files[0]); };

function loadMasterImage(file) {
    if(!file || !file.type.startsWith('image/')) return alert("Sube un PNG");
    const img = new Image();
    img.onload = () => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const ctx = tempCanvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const imgData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height).data;

        // 1. Escanear Filas (Horizontal)
        function isRowEmpty(y) {
            for (let x = 0; x < tempCanvas.width; x++) {
                if (imgData[(y * tempCanvas.width + x) * 4 + 3] > 10) return false;
            }
            return true;
        }

        let rows = [];
        let inRow = false;
        let startY = 0;

        for (let y = 0; y < tempCanvas.height; y++) {
            let empty = isRowEmpty(y);
            if (!inRow && !empty) {
                inRow = true;
                startY = y;
            } else if (inRow && empty) {
                inRow = false;
                rows.push({ y: startY, h: y - startY });
            }
        }
        if (inRow) rows.push({ y: startY, h: tempCanvas.height - startY });

        masterGridRows = []; 
        
        if (rows.length > 0) {
            // 2. Escanear Columnas por cada Fila (Vertical)
            rows.forEach(rect => {
                let rowSprites = [];
                let inCol = false;
                let startX = 0;

                function isColEmpty(x) {
                    for (let y = rect.y; y < rect.y + rect.h; y++) {
                        if (imgData[(y * tempCanvas.width + x) * 4 + 3] > 10) return false;
                    }
                    return true;
                }

                for (let x = 0; x < tempCanvas.width; x++) {
                    let empty = isColEmpty(x);
                    if (!inCol && !empty) {
                        inCol = true;
                        startX = x;
                    } else if (inCol && empty) {
                        inCol = false;
                        let sprW = x - startX;
                        let sprCanvas = document.createElement('canvas');
                        sprCanvas.width = sprW;
                        sprCanvas.height = rect.h;
                        sprCanvas.getContext('2d').drawImage(tempCanvas, startX, rect.y, sprW, rect.h, 0, 0, sprW, rect.h);
                        rowSprites.push(sprCanvas);
                    }
                }
                if (inCol) {
                    let sprW = tempCanvas.width - startX;
                    let sprCanvas = document.createElement('canvas');
                    sprCanvas.width = sprW;
                    sprCanvas.height = rect.h;
                    sprCanvas.getContext('2d').drawImage(tempCanvas, startX, rect.y, sprW, rect.h, 0, 0, sprW, rect.h);
                    rowSprites.push(sprCanvas);
                }

                if(rowSprites.length > 0) masterGridRows.push(rowSprites);
            });
        } else {
            masterGridRows.push([tempCanvas]);
        }
        
        masterUploadedImg = null; 
        updateRowManagerUI();
        renderMasterBoard(); 
        updateAlignmentUI(); // Bloquear grid base si suben el master directamente
        mPanX = 0; mPanY = 0; mScale = 1; updateMasterCamera();
        document.getElementById('masterSection').scrollIntoView({ behavior: 'smooth' });
    };
    img.src = URL.createObjectURL(file);
}

btnDownloadMaster.onclick = () => {
    if(masterGridRows.length === 0 && !masterUploadedImg) return alert("Vacío.");
    const link = document.createElement('a'); link.download = `master.png`;
    link.href = masterCanvas.toDataURL('image/png'); link.click();
};

btnClearMaster.onclick = () => {
    if(!confirm("¿Seguro que deseas limpiar todo? Se perderán todas las filas.")) return;
    masterGridRows = []; 
    masterUploadedImg = null;
    masterCanvas.width = 0; masterCanvas.height = 0;
    
    lockedGridW = 0; lockedGridH = 0; universalReferenceH = 0;
    updateAlignmentUI();
    
    updateRowManagerUI();
    mPanX = 0; mPanY = 0; mScale = 1; updateMasterCamera();
};

// --- MOTOR DE CÁMARA PRO ---
function updateMasterCamera() {
    masterCamera.style.transform = `translate(${mPanX}px, ${mPanY}px) scale(${mScale})`;
}

masterCamera.parentElement.addEventListener('mousedown', (e) => {
    isDraggingM = true; startDragX = e.clientX - mPanX; startDragY = e.clientY - mPanY; masterCamera.classList.add('grabbing-cursor');
});

window.addEventListener('mousemove', (e) => {
    if (!isDraggingM) return;
    mPanX = e.clientX - startDragX; mPanY = e.clientY - startDragY; updateMasterCamera();
});

window.addEventListener('mouseup', () => { isDraggingM = false; masterCamera.classList.remove('grabbing-cursor'); });
masterCamera.parentElement.addEventListener('mouseleave', () => { isDraggingM = false; masterCamera.classList.remove('grabbing-cursor'); });

masterCamera.parentElement.addEventListener('wheel', (e) => {
    e.preventDefault(); 
    if (e.ctrlKey || e.metaKey) {
        const zoomIntensity = 0.05;
        if (e.deltaY < 0) mScale += zoomIntensity; else mScale -= zoomIntensity;
        mScale = Math.max(0.1, Math.min(mScale, 5)); 
    } else {
        mPanX -= e.deltaX; mPanY -= e.deltaY;
    }
    updateMasterCamera();
}, { passive: false });

document.getElementById('btnZoomIn').onclick = () => { mScale = Math.min(mScale + 0.2, 5); updateMasterCamera(); };
document.getElementById('btnZoomOut').onclick = () => { mScale = Math.max(mScale - 0.2, 0.1); updateMasterCamera(); };
document.getElementById('btnZoomReset').onclick = () => { mScale = 1; mPanX = 0; mPanY = 0; updateMasterCamera(); };

// Iniciar con UI sincronizada
setTimeout(updateAlignmentUI, 100);