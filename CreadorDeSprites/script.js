// --- REFERENCIAS DEL DOM GLOBALES ---
const mainVideo = document.getElementById('mainVideo');
const mainImage = document.getElementById('mainImage');
const timeline = document.getElementById('timeline');
const loopTimeline = document.getElementById('loopTimeline');
const loopCanvas = document.getElementById('loopCanvas');
const loopCtx = loopCanvas.getContext('2d', { alpha: true, willReadFrequently: true });

const loopStart = document.getElementById('loopStart');
const loopEnd = document.getElementById('loopEnd');
const manualFrameStart = document.getElementById('manualFrameStart');
const manualFrameEnd = document.getElementById('manualFrameEnd');
const generateBtn = document.getElementById('generateBtn');
const dropZone = document.getElementById('dropZone');

const chromaRefCanvas = document.getElementById('chromaRefCanvas');
const chromaRefCtx = chromaRefCanvas.getContext('2d', { willReadFrequently: true });
const colorPreview = document.getElementById('colorPreview');
const chromaTolerance = document.getElementById('chromaTolerance');
const tolValueLabel = document.getElementById('tolValue');
const chromaErode = document.getElementById('chromaErode');
const erodeValueLabel = document.getElementById('erodeValue');

const finalExportCanvas = document.getElementById('finalExportCanvas');
const frameSkip = document.getElementById('frameSkip');
const btnExportSpriteSheet = document.getElementById('btnExportSpriteSheet');
const alignModeSelect = document.getElementById('alignModeSelect');
const manualControls = document.getElementById('manualControls');

// Controles Capa 4
const gridWInput = document.getElementById('gridW');
const gridHInput = document.getElementById('gridH');
const gridGuide = document.getElementById('gridGuide');

const assetScale = document.getElementById('assetScale');
const numScale = document.getElementById('numScale');
const anchorPoint = document.getElementById('anchorPoint');
const aiStabilizeToggle = document.getElementById('aiStabilizeToggle');
const spriteW = document.getElementById('spriteW');
const spriteH = document.getElementById('spriteH');

const offsetX = document.getElementById('offsetX');
const numOffX = document.getElementById('numOffX');
const offsetY = document.getElementById('offsetY');
const numOffY = document.getElementById('numOffY');

const masterCanvas = document.getElementById('masterCanvas');
const masterCtx = masterCanvas.getContext('2d', { willReadFrequently: true });
const masterCamera = document.getElementById('masterCamera');
const btnAppendToMaster = document.getElementById('btnAppendToMaster');
const masterDropZone = document.getElementById('masterDropZone');
const masterInput = document.getElementById('masterInput');
const btnDownloadMaster = document.getElementById('btnDownloadMaster');
const btnClearMaster = document.getElementById('btnClearMaster');
const rowManagerContainer = document.getElementById('rowManagerContainer');

// --- VARIABLES DE ESTADO ---
let originalFramesData = [], processedFrames = [], timeStampMap = [], loopThumbElements = [];
let previewTimer, currentLoopIdx = 0, playDirection = 1, selectedRGB = null;
const FPS = 30;
let currentMediaType = null;

let currentCroppedSprites = []; 
let masterGridRows = []; 
let masterUploadedImg = null; 

let lockedGridW = 0, lockedGridH = 0, universalReferenceH = 0; 
let mScale = 1, mPanX = 0, mPanY = 0;
let isDraggingM = false, startDragX, startDragY;

// --- 1. DRAG & DROP ---
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
    window.addEventListener(evt, preventDefaults, false);
    dropZone.addEventListener(evt, preventDefaults, false);
});
function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }
['dragenter', 'dragover'].forEach(evt => dropZone.addEventListener(evt, () => dropZone.classList.add('drag-over'), false));
['dragleave', 'drop'].forEach(evt => dropZone.addEventListener(evt, () => dropZone.classList.remove('drag-over'), false));

dropZone.addEventListener('drop', (e) => { if(e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]); }, false);
dropZone.onclick = () => document.getElementById('videoInput').click();
document.getElementById('videoInput').onchange = (e) => { if (e.target.files.length) handleFile(e.target.files[0]); };

function handleFile(file) {
    if (!file) return; 
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) return alert("Bro, sube un formato válido (.mp4, .png, .jpg).");
    
    const url = URL.createObjectURL(file);
    if (isVideo) { 
        currentMediaType = 'video'; 
        mainVideo.src = url; 
        mainVideo.load(); 
    } 
    else { 
        currentMediaType = 'image'; 
        mainImage.src = url; 
    }
    
    dropZone.innerHTML = `
        <div class="text-center space-y-3">
            <p class="text-5xl text-emerald-400">✅</p>
            <p class="text-sm font-semibold text-slate-200">${isVideo ? '🎬' : '🖼️'} ${file.name}</p>
        </div>
    `;
    ['loopSection', 'chromaSection', 'exportSection'].forEach(id => document.getElementById(id)?.classList.add('panel-disabled'));
}

// --- 2. EXTRACCIÓN BUGFIX DE ASINCRONÍA ---
generateBtn.onclick = async () => {
    if (!currentMediaType) return alert("Sube un archivo primero, crack.");
    generateBtn.innerText = "Procesando..."; generateBtn.disabled = true;
    
    originalFramesData.length = 0; processedFrames.length = 0; timeStampMap.length = 0; loopThumbElements.length = 0;
    clearInterval(previewTimer); selectedRGB = null;
    timeline.innerHTML = ""; loopTimeline.innerHTML = "";

    const procCanvas = document.getElementById('procCanvas');
    const pCtx = procCanvas.getContext('2d', { willReadFrequently: true });
    
    if (currentMediaType === 'video') {
        const step = parseInt(document.getElementById('frameStep').value) || 1;
        
        await new Promise(r => {
            if (mainVideo.readyState >= 1) r();
            else { mainVideo.onloadedmetadata = r; mainVideo.onerror = r; }
        });
        
        await new Promise(r => setTimeout(r, 150)); 
        if (mainVideo.videoWidth === 0) return failLoad("El navegador no pudo decodificar el video.");

        procCanvas.width = mainVideo.videoWidth; 
        procCanvas.height = mainVideo.videoHeight;
        loopStart.max = mainVideo.duration; 
        loopEnd.max = mainVideo.duration; 
        loopEnd.value = mainVideo.duration;
        
        let currentTime = 0;
        while (currentTime < mainVideo.duration) {
            mainVideo.currentTime = currentTime;
            await new Promise(r => { 
                const onSeek = () => { mainVideo.removeEventListener('seeked', onSeek); r(); };
                mainVideo.addEventListener('seeked', onSeek);
                setTimeout(r, 100); 
            });
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

        if (mainImage.naturalWidth === 0) return failLoad("Imagen corrupta o formato no soportado.");

        procCanvas.width = mainImage.naturalWidth; 
        procCanvas.height = mainImage.naturalHeight;
        pCtx.drawImage(mainImage, 0, 0);
        loopStart.max = 0; loopEnd.max = 0; loopEnd.value = 0;
        timeStampMap.push(0);
        saveFrameToPipeline(procCanvas);
    }
    
    ['loopSection', 'chromaSection', 'exportSection'].forEach(id => document.getElementById(id)?.classList.remove('panel-disabled'));
    manualFrameStart.max = originalFramesData.length; manualFrameEnd.max = originalFramesData.length;
    manualFrameStart.value = 1; manualFrameEnd.value = originalFramesData.length;
    generateBtn.innerText = "⚡ Procesar Asset"; generateBtn.disabled = false;
    
    syncLoopControls('slider'); updateChromaRef(); 
    alignModeSelect.value = 'auto'; alignModeSelect.dispatchEvent(new Event('change'));
    startCanvasPreview();
};

function failLoad(msg) {
    alert(msg);
    generateBtn.innerText = "⚡ Procesar Asset"; generateBtn.disabled = false;
}

function saveFrameToPipeline(procCanvas) {
    const f = document.createElement('canvas'); f.width = procCanvas.width; f.height = procCanvas.height;
    f.getContext('2d', { willReadFrequently: true }).drawImage(procCanvas, 0, 0); 
    originalFramesData.push(f);

    const pf = document.createElement('canvas'); pf.width = procCanvas.width; pf.height = procCanvas.height;
    pf.getContext('2d', { willReadFrequently: true }).drawImage(f, 0, 0); 
    processedFrames.push(pf);
    
    const safeHeight = procCanvas.height > 0 ? procCanvas.height : 1;
    const thumbScale = Math.min(1, 100 / safeHeight);
    const thumbW = Math.max(1, procCanvas.width * thumbScale);
    const thumbH = Math.max(1, procCanvas.height * thumbScale);

    const t1 = document.createElement('canvas'); t1.width = thumbW; t1.height = thumbH;
    t1.getContext('2d').drawImage(procCanvas, 0, 0, thumbW, thumbH);
    timeline.appendChild(t1);

    const t2 = document.createElement('canvas'); t2.width = thumbW; t2.height = thumbH;
    t2.getContext('2d').drawImage(procCanvas, 0, 0, thumbW, thumbH);
    
    const currentIdx = originalFramesData.length - 1;
    t2.onclick = () => { loopStart.value = timeStampMap[currentIdx]; syncLoopControls('slider'); };
    t2.oncontextmenu = (e) => { e.preventDefault(); loopEnd.value = timeStampMap[currentIdx]; syncLoopControls('slider'); };
    loopThumbElements.push(t2); loopTimeline.appendChild(t2);
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
    if(el) el.onchange = () => { startCanvasPreview(); updateExportPreview(); };
});
frameSkip.oninput = () => { if (frameSkip.value < 1) frameSkip.value = 1; updateExportPreview(); startCanvasPreview(); };

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
    const tolSq = chromaTolerance.value * chromaTolerance.value; 
    const erodeRadius = parseInt(chromaErode.value) || 0;
    const targetR = selectedRGB.r, targetG = selectedRGB.g, targetB = selectedRGB.b;

    originalFramesData.forEach((origCanvas, i) => {
        const procCtx = processedFrames[i].getContext('2d', { willReadFrequently: true });
        const w = origCanvas.width, h = origCanvas.height;
        const imgData = origCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0,0,w,h);
        const d = imgData.data;
        const len = d.length;

        for (let j = 0; j < len; j += 4) {
            const dr = d[j] - targetR, dg = d[j+1] - targetG, db = d[j+2] - targetB;
            if ((dr * dr + dg * dg + db * db) <= tolSq) d[j+3] = 0; 
        }

        if (erodeRadius > 0) {
            const outAlpha = new Uint8Array(w * h);
            for (let p = 0; p < w * h; p++) outAlpha[p] = d[p * 4 + 3];
            let idx = 0;
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    if (outAlpha[idx] > 0) {
                        let isEdge = false;
                        const yMin = Math.max(0, y - erodeRadius), yMax = Math.min(h - 1, y + erodeRadius);
                        const xMin = Math.max(0, x - erodeRadius), xMax = Math.min(w - 1, x + erodeRadius);
                        edgeCheck: for (let ny = yMin; ny <= yMax; ny++) {
                            const yOffset = ny * w;
                            for (let nx = xMin; nx <= xMax; nx++) {
                                if (outAlpha[yOffset + nx] === 0) { isEdge = true; break edgeCheck; }
                            }
                        }
                        if (isEdge) d[idx * 4 + 3] = 0; 
                    }
                    idx++;
                }
            }
        }
        
        procCtx.putImageData(imgData, 0, 0);
        const thumbCtx = loopThumbElements[i].getContext('2d');
        thumbCtx.clearRect(0,0, thumbCtx.canvas.width, thumbCtx.canvas.height);
        thumbCtx.drawImage(processedFrames[i], 0, 0, thumbCtx.canvas.width, thumbCtx.canvas.height);
    });
    updateExportPreview(); 
}

// --- 6. EXPORTACIÓN HÍBRIDA CAPA 4 (ESTABILIZACIÓN PERFECTA) ---
if(assetScale) assetScale.oninput = (e) => { numScale.value = e.target.value; updateExportPreview(); };
if(numScale) numScale.oninput = (e) => { assetScale.value = e.target.value; updateExportPreview(); };
if(anchorPoint) anchorPoint.onchange = updateExportPreview;
if(aiStabilizeToggle) aiStabilizeToggle.onchange = updateExportPreview;
if(spriteW) spriteW.oninput = updateExportPreview;
if(spriteH) spriteH.oninput = updateExportPreview;
if(offsetX) offsetX.oninput = (e) => { numOffX.value = e.target.value; updateExportPreview(); };
if(numOffX) numOffX.oninput = (e) => { offsetX.value = e.target.value; updateExportPreview(); };
if(offsetY) offsetY.oninput = (e) => { numOffY.value = e.target.value; updateExportPreview(); };
if(numOffY) numOffY.oninput = (e) => { offsetY.value = e.target.value; updateExportPreview(); };
if(gridWInput) gridWInput.oninput = updateExportPreview;
if(gridHInput) gridHInput.oninput = updateExportPreview;

function updateAlignmentUI() {
    let isAuto = alignModeSelect.value === 'auto';
    let isMasterLocked = masterGridRows.length > 0;
    if(manualControls.classList.contains('hidden')) manualControls.classList.remove('hidden');

    document.querySelectorAll('.control-lockable').forEach(el => el.disabled = isAuto);
    manualControls.style.opacity = isAuto ? '0.5' : '1';
    manualControls.style.pointerEvents = isAuto ? 'none' : 'auto';
    if(gridGuide) gridGuide.style.display = isAuto ? 'none' : 'block';

    if (isMasterLocked) { gridWInput.disabled = true; gridHInput.disabled = true; } 
    else { gridWInput.disabled = isAuto; gridHInput.disabled = isAuto; }
}

alignModeSelect.onchange = () => { updateAlignmentUI(); updateExportPreview(); };

function getGlobalBoundingBox(frames) {
    let gMinX = Infinity, gMinY = Infinity, gMaxX = -1, gMaxY = -1, hasContent = false;
    frames.forEach(canvas => {
        let b = getFrameBoundingBox(canvas);
        if(b) {
            if (b.x < gMinX) gMinX = b.x;
            if (b.y < gMinY) gMinY = b.y;
            if (b.x + b.w > gMaxX) gMaxX = b.x + b.w;
            if (b.y + b.h > gMaxY) gMaxY = b.y + b.h;
            hasContent = true;
        }
    });
    return hasContent ? { x: gMinX, y: gMinY, w: gMaxX - gMinX, h: gMaxY - gMinY } : null;
}

function getFrameBoundingBox(canvas) {
    const w = canvas.width, h = canvas.height;
    if(w === 0 || h === 0) return null;
    const data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = -1, maxY = -1, hasContent = false;
    for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 10) { 
            const p = i >> 2, x = p % w, y = Math.floor(p / w);
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
            hasContent = true;
        }
    }
    return hasContent ? { x: minX, y: minY, w: (maxX - minX) + 1, h: (maxY - minY) + 1 } : null;
}

function updateExportPreview() {
    currentCroppedSprites.length = 0; 
    if(!processedFrames.length) return;
    const idxS = parseInt(manualFrameStart.value) - 1, idxE = parseInt(manualFrameEnd.value) - 1;
    if (isNaN(idxS) || isNaN(idxE)) return;

    const skip = parseInt(frameSkip.value) || 1;
    let activeIndices = [];
    for (let i = idxS; i <= idxE; i += skip) activeIndices.push(i);
    
    const isPingPong = document.getElementById('pingPongMode').checked;
    if (isPingPong && activeIndices.length > 2) {
        for (let i = activeIndices.length - 2; i > 0; i--) activeIndices.push(activeIndices[i]);
    }

    const finalSprites = activeIndices.map(i => processedFrames[i]);

    if(finalSprites.length === 0) return;
    if(document.getElementById('finalSpriteCount')) document.getElementById('finalSpriteCount').innerText = finalSprites.length;

    const globalBounds = getGlobalBoundingBox(finalSprites);
    if (!globalBounds) return;

    let mode = alignModeSelect.value;
    let isMasterLocked = masterGridRows.length > 0;
    
    // MAGIA DE MACRO: En Modo Auto, calculamos la base perfecta y se la heredamos a los inputs manuales
    if (mode === 'auto') {
        let optimalScale = (isMasterLocked && universalReferenceH > 0) ? (universalReferenceH / globalBounds.h) : 1;
        
        if (!isMasterLocked) {
            gridWInput.value = Math.ceil(globalBounds.w * optimalScale) + 10; 
            gridHInput.value = Math.ceil(globalBounds.h * optimalScale) + 10;
        }
        
        let scalePct = Math.round(optimalScale * 100);
        numScale.value = scalePct;
        assetScale.value = scalePct;
        spriteW.value = 0;
        spriteH.value = 0;
        anchorPoint.value = 'bottom';
        numOffX.value = 0; 
        offsetX.value = 0;
        numOffY.value = 0; 
        offsetY.value = 0;
        aiStabilizeToggle.checked = true; 
    }
    
    let gW = parseInt(gridWInput.value) || 180;
    let gH = parseInt(gridHInput.value) || 180;
    if (isMasterLocked) { gW = lockedGridW; gH = lockedGridH; gridWInput.value = gW; gridHInput.value = gH; }

    if (gridGuide) gridGuide.style.backgroundSize = `${gW}px ${gH}px`;
    window.currentAnimRawHeight = globalBounds.h; 

    finalExportCanvas.width = gW * finalSprites.length; finalExportCanvas.height = gH;
    const ctx = finalExportCanvas.getContext('2d');
    ctx.imageRendering = 'pixelated'; ctx.clearRect(0,0, finalExportCanvas.width, finalExportCanvas.height);
    
    let baseScale = parseFloat(numScale.value) / 100;
    let forceW = parseInt(spriteW.value) || 0;
    let forceH = parseInt(spriteH.value) || 0;
    let anchor = anchorPoint.value;
    let offX = parseInt(numOffX.value) || 0;
    let offY = parseInt(numOffY.value) || 0;
    let stabilize = aiStabilizeToggle.checked;

    // El escalado principal siempre obedece al Global para no deformar
    let scaleX = baseScale, scaleY = baseScale;
    if (forceW > 0 || forceH > 0) {
        if (forceW > 0 && forceH > 0) { scaleX = forceW / globalBounds.w; scaleY = forceH / globalBounds.h; } 
        else if (forceW > 0) { scaleX = forceW / globalBounds.w; scaleY = scaleX; } 
        else if (forceH > 0) { scaleY = forceH / globalBounds.h; scaleX = scaleY; }
    }

    let globalScaledW = globalBounds.w * scaleX;
    let globalScaledH = globalBounds.h * scaleY;

    finalSprites.forEach((f, index) => { 
        let localBounds = getFrameBoundingBox(f);
        if(!localBounds) localBounds = {x:0, y:0, w:f.width, h:f.height};
        
        let bounds, finalW, finalH, drawX, drawY;

        if (stabilize) {
            // HYBRID STABILIZATION: X usa centro global, Y se amarra a local
            bounds = localBounds;
            finalW = localBounds.w * scaleX;
            finalH = localBounds.h * scaleY;
            let localOffsetX = (localBounds.x - globalBounds.x) * scaleX;
            let localOffsetY = (localBounds.y - globalBounds.y) * scaleY;

            switch(anchor) {
                case 'bottom': 
                    drawX = (gW - globalScaledW) / 2 + localOffsetX; 
                    drawY = gH - finalH; 
                    break;
                case 'center': 
                    drawX = (gW - finalW) / 2; 
                    drawY = (gH - finalH) / 2; 
                    break;
                case 'top': 
                    drawX = (gW - globalScaledW) / 2 + localOffsetX; 
                    drawY = 0; 
                    break;
                case 'left': 
                    drawX = 0; 
                    drawY = (gH - globalScaledH) / 2 + localOffsetY; 
                    break;
                case 'right': 
                    drawX = gW - finalW; 
                    drawY = (gH - globalScaledH) / 2 + localOffsetY; 
                    break;
            }
        } else {
            // PURE GLOBAL: Se recorta la caja global completa
            bounds = globalBounds;
            finalW = globalScaledW;
            finalH = globalScaledH;
            
            switch(anchor) {
                case 'bottom': drawX = (gW - finalW) / 2; drawY = (gH - finalH); break;
                case 'center': drawX = (gW - finalW) / 2; drawY = (gH - finalH) / 2; break;
                case 'top': drawX = (gW - finalW) / 2; drawY = 0; break;
                case 'left': drawX = 0; drawY = (gH - finalH) / 2; break;
                case 'right': drawX = (gW - finalW); drawY = (gH - finalH) / 2; break;
            }
        }

        drawX += offX;
        drawY += offY;

        let cellCanvas = document.createElement('canvas');
        cellCanvas.width = gW; cellCanvas.height = gH;
        let cCtx = cellCanvas.getContext('2d');
        cCtx.imageSmoothingEnabled = false;
        cCtx.drawImage(f, bounds.x, bounds.y, bounds.w, bounds.h, drawX, drawY, finalW, finalH);
        
        ctx.drawImage(cellCanvas, index * gW, 0);
        currentCroppedSprites.push(cellCanvas);
    });
}

btnExportSpriteSheet.onclick = () => {
    if (!finalExportCanvas || btnExportSpriteSheet.disabled) return;
    try {
        const link = document.createElement('a'); 
        link.download = `fila_sprites_${manualFrameStart.value}.png`;
        link.href = finalExportCanvas.toDataURL('image/png'); 
        link.click();
    } catch(err) {
        alert("Asegúrate de correr la web desde un servidor local (Live Server).");
    }
};

// --- 7. MASTER BOARD COMPOSITOR Y CÁMARA ---
btnAppendToMaster.onclick = () => {
    if (btnAppendToMaster.disabled || currentCroppedSprites.length === 0) return;
    if (masterGridRows.length === 0) {
        lockedGridW = parseInt(gridWInput.value) || 180; lockedGridH = parseInt(gridHInput.value) || 180;
        universalReferenceH = window.currentAnimRawHeight;
    }
    masterGridRows.push([...currentCroppedSprites]);
    updateRowManagerUI(); renderMasterBoard(); updateAlignmentUI();
    mPanX = 0; mPanY = 0; mScale = 1; updateMasterCamera();
    document.getElementById('masterSection').scrollIntoView({ behavior: 'smooth' });
};

window.moveRow = function(index, dir) {
    if (index + dir < 0 || index + dir >= masterGridRows.length) return;
    const temp = masterGridRows[index]; masterGridRows[index] = masterGridRows[index + dir]; masterGridRows[index + dir] = temp;
    updateRowManagerUI(); renderMasterBoard();
};

window.deleteRow = function(index) {
    if(!confirm(`¿Seguro que quieres borrar la fila ${index + 1}?`)) return;
    masterGridRows.splice(index, 1);
    if(masterGridRows.length === 0 && !masterUploadedImg) { lockedGridW = 0; lockedGridH = 0; universalReferenceH = 0; updateAlignmentUI(); }
    updateRowManagerUI(); renderMasterBoard();
};

function updateRowManagerUI() {
    if(!rowManagerContainer) return;
    rowManagerContainer.innerHTML = '';
    if(masterGridRows.length === 0) { rowManagerContainer.innerHTML = '<p class="text-center text-slate-600 text-xs py-6">La cuadrícula está vacía.</p>'; return; }

    masterGridRows.forEach((row, index) => {
        const item = document.createElement('div'); item.className = 'row-manager-item';
        let previewCanvas = document.createElement('canvas'); previewCanvas.className = 'row-manager-preview';
        if(row.length > 0) {
            previewCanvas.width = row[0].width; previewCanvas.height = row[0].height;
            let pCtx = previewCanvas.getContext('2d'); pCtx.imageSmoothingEnabled = false; pCtx.drawImage(row[0], 0, 0);
        }
        item.innerHTML = `<span class="row-manager-idx">${index + 1}</span>`;
        item.appendChild(previewCanvas);
        
        const actions = document.createElement('div'); actions.className = 'row-manager-actions';
        actions.innerHTML = `
            <button class="btn-row-action" ${index === 0 ? 'disabled' : ''} onclick="window.moveRow(${index}, -1)">⬆️</button>
            <button class="btn-row-action" ${index === masterGridRows.length - 1 ? 'disabled' : ''} onclick="window.moveRow(${index}, 1)">⬇️</button>
            <button class="btn-row-action btn-row-delete" onclick="window.deleteRow(${index})">🗑️</button>
        `;
        item.appendChild(actions); rowManagerContainer.appendChild(item);
    });
}

function renderMasterBoard() {
    let maxCols = 0; masterGridRows.forEach(row => { if (row.length > maxCols) maxCols = row.length; });
    if (maxCols === 0 && !masterUploadedImg) { masterCanvas.width = 0; masterCanvas.height = 0; return; }

    let cellW = lockedGridW || parseInt(gridWInput.value) || 180;
    let cellH = lockedGridH || parseInt(gridHInput.value) || 180; 
    let startY = masterUploadedImg ? masterUploadedImg.height : 0;
    
    masterCanvas.width = Math.max(maxCols * cellW, masterUploadedImg ? masterUploadedImg.width : 0);
    masterCanvas.height = startY + (masterGridRows.length * cellH);
    
    masterCtx.imageRendering = 'pixelated'; masterCtx.clearRect(0,0, masterCanvas.width, masterCanvas.height);
    if (masterUploadedImg) masterCtx.drawImage(masterUploadedImg, 0, 0);

    masterGridRows.forEach((row, rIdx) => {
        row.forEach((spr, cIdx) => masterCtx.drawImage(spr, cIdx * cellW, startY + (rIdx * cellH)));
    });
}

masterDropZone.onclick = () => masterInput.click();
masterInput.onchange = (e) => { if(e.target.files.length) loadMasterImage(e.target.files[0]); };

function loadMasterImage(file) {
    if(!file || !file.type.startsWith('image/')) return alert("Sube un PNG, bro");
    const img = new Image();
    img.onload = () => {
        const tempCanvas = document.createElement('canvas'); tempCanvas.width = img.width; tempCanvas.height = img.height;
        const ctx = tempCanvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height).data;

        function isRowEmpty(y) {
            for (let x = 0; x < tempCanvas.width; x++) if (imgData[(y * tempCanvas.width + x) * 4 + 3] > 10) return false;
            return true;
        }

        let rows = [], inRow = false, startY = 0;
        for (let y = 0; y < tempCanvas.height; y++) {
            let empty = isRowEmpty(y);
            if (!inRow && !empty) { inRow = true; startY = y; } 
            else if (inRow && empty) { inRow = false; rows.push({ y: startY, h: y - startY }); }
        }
        if (inRow) rows.push({ y: startY, h: tempCanvas.height - startY });

        masterGridRows = []; 
        if (rows.length > 0) {
            rows.forEach(rect => {
                let rowSprites = [], inCol = false, startX = 0;
                function isColEmpty(x) {
                    for (let y = rect.y; y < rect.y + rect.h; y++) if (imgData[(y * tempCanvas.width + x) * 4 + 3] > 10) return false;
                    return true;
                }
                for (let x = 0; x < tempCanvas.width; x++) {
                    let empty = isColEmpty(x);
                    if (!inCol && !empty) { inCol = true; startX = x; } 
                    else if (inCol && empty) {
                        inCol = false; let sprW = x - startX;
                        let sprCanvas = document.createElement('canvas'); sprCanvas.width = sprW; sprCanvas.height = rect.h;
                        sprCanvas.getContext('2d').drawImage(tempCanvas, startX, rect.y, sprW, rect.h, 0, 0, sprW, rect.h);
                        rowSprites.push(sprCanvas);
                    }
                }
                if (inCol) {
                    let sprW = tempCanvas.width - startX;
                    let sprCanvas = document.createElement('canvas'); sprCanvas.width = sprW; sprCanvas.height = rect.h;
                    sprCanvas.getContext('2d').drawImage(tempCanvas, startX, rect.y, sprW, rect.h, 0, 0, sprW, rect.h);
                    rowSprites.push(sprCanvas);
                }
                if(rowSprites.length > 0) masterGridRows.push(rowSprites);
            });
        } else masterGridRows.push([tempCanvas]);
        
        masterUploadedImg = null; updateRowManagerUI(); renderMasterBoard(); updateAlignmentUI();
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
    masterGridRows.length = 0; masterUploadedImg = null; masterCanvas.width = 0; masterCanvas.height = 0;
    lockedGridW = 0; lockedGridH = 0; universalReferenceH = 0;
    updateAlignmentUI(); updateRowManagerUI();
    mPanX = 0; mPanY = 0; mScale = 1; updateMasterCamera();
};

function updateMasterCamera() { masterCamera.style.transform = `translate(${mPanX}px, ${mPanY}px) scale(${mScale})`; }

masterCamera.parentElement.addEventListener('mousedown', (e) => {
    isDraggingM = true; startDragX = e.clientX - mPanX; startDragY = e.clientY - mPanY; masterCamera.classList.add('grabbing-cursor');
});
window.addEventListener('mousemove', (e) => { if (isDraggingM) { mPanX = e.clientX - startDragX; mPanY = e.clientY - startDragY; updateMasterCamera(); } });
window.addEventListener('mouseup', () => { isDraggingM = false; masterCamera.classList.remove('grabbing-cursor'); });
masterCamera.parentElement.addEventListener('mouseleave', () => { isDraggingM = false; masterCamera.classList.remove('grabbing-cursor'); });

masterCamera.parentElement.addEventListener('wheel', (e) => {
    e.preventDefault(); 
    if (e.ctrlKey || e.metaKey) {
        mScale += (e.deltaY < 0 ? 0.05 : -0.05);
        mScale = Math.max(0.1, Math.min(mScale, 5)); 
    } else { mPanX -= e.deltaX; mPanY -= e.deltaY; }
    updateMasterCamera();
}, { passive: false });

setTimeout(updateAlignmentUI, 100);