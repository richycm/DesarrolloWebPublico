const mainVideo = document.getElementById('mainVideo');
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

const finalExportCanvas = document.getElementById('finalExportCanvas');
const frameSkip = document.getElementById('frameSkip');
const skipWarning = document.getElementById('skipWarning');
const btnExportSpriteSheet = document.getElementById('btnExportSpriteSheet');

// MASTER BOARD ELEMENTS
const masterCanvas = document.getElementById('masterCanvas');
const masterCtx = masterCanvas.getContext('2d');
const btnAppendToMaster = document.getElementById('btnAppendToMaster');
const masterDropZone = document.getElementById('masterDropZone');
const masterInput = document.getElementById('masterInput');
const btnDownloadMaster = document.getElementById('btnDownloadMaster');
const btnClearMaster = document.getElementById('btnClearMaster');

let originalFramesData = [], processedFrames = [], timeStampMap = [], loopThumbElements = [];
let previewTimer, currentLoopIdx = 0, playDirection = 1, selectedRGB = null;
const FPS = 30;
let isMasterEmpty = true;

// --- 1. DRAG & DROP INMERSIVO ---
dropZone.onclick = () => document.getElementById('videoInput').click();

window.addEventListener('dragover', (e) => e.preventDefault(), false);
window.addEventListener('drop', (e) => e.preventDefault(), false);

dropZone.addEventListener('dragenter', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragover', (e) => { 
    e.preventDefault(); 
    e.dataTransfer.dropEffect = 'copy'; 
    dropZone.classList.add('drag-over'); 
});
dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.classList.remove('drag-over'); });
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
});
document.getElementById('videoInput').onchange = (e) => {
    if (e.target.files && e.target.files.length > 0) handleFile(e.target.files[0]);
};

function handleFile(file) {
    if (!file) return; 
    mainVideo.src = URL.createObjectURL(file);
    
    // MAGIA UX: Reconstruimos la caja para indicar que se puede seguir usando
    dropZone.innerHTML = `
        <div class="text-center space-y-3">
            <p class="text-5xl text-emerald-400">✅</p>
            <p class="text-sm font-semibold text-slate-200">🎬 ${file.name}</p>
            <p class="text-xs text-emerald-400 font-medium bg-emerald-900/30 py-1 px-3 rounded-full inline-block border border-emerald-800/50">Haz clic o arrastra para cargar un video nuevo</p>
        </div>
    `;
    
    ['loopSection', 'chromaSection', 'exportSection'].forEach(id => document.getElementById(id).classList.add('panel-disabled'));
}

// --- 2. EXTRACCIÓN ---
generateBtn.onclick = async () => {
    if (!mainVideo.src) return alert("Sube un video primero");
    
    generateBtn.innerText = "Procesando..."; generateBtn.disabled = true;
    originalFramesData = []; processedFrames = []; timeStampMap = []; loopThumbElements = [];
    clearInterval(previewTimer); selectedRGB = null;
    timeline.innerHTML = ""; loopTimeline.innerHTML = "";

    const step = parseInt(document.getElementById('frameStep').value) || 1;
    const procCanvas = document.getElementById('procCanvas');
    const pCtx = procCanvas.getContext('2d');
    
    await new Promise(r => {
        if (mainVideo.readyState >= 2) r();
        else { mainVideo.addEventListener('loadeddata', r, { once: true }); mainVideo.addEventListener('error', r, { once: true }); }
    });

    procCanvas.width = mainVideo.videoWidth; procCanvas.height = mainVideo.videoHeight;
    loopStart.max = mainVideo.duration; loopEnd.max = mainVideo.duration; loopEnd.value = mainVideo.duration;
    
    let currentTime = 0;
    while (currentTime < mainVideo.duration) {
        mainVideo.currentTime = currentTime;
        await new Promise(r => { mainVideo.onseeked = r; setTimeout(r, 80); });
        
        pCtx.drawImage(mainVideo, 0, 0);
        timeStampMap.push(currentTime);

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

        currentTime += (1/FPS * step);
    }
    
    ['loopSection', 'chromaSection', 'exportSection'].forEach(id => document.getElementById(id).classList.remove('panel-disabled'));
    manualFrameStart.max = originalFramesData.length; manualFrameEnd.max = originalFramesData.length;
    manualFrameStart.value = 1; manualFrameEnd.value = originalFramesData.length;
    generateBtn.innerText = "⚡ Extraer Fotogramas"; generateBtn.disabled = false;
    
    syncLoopControls('slider'); updateChromaRef(); updateExportPreview(); startCanvasPreview();
};

// --- 3. EDITOR DE LOOP ---
function syncLoopControls(source) {
    let sVal, eVal, idxS, idxE;
    const step = parseInt(document.getElementById('frameStep').value) || 1;

    if (source === 'slider') {
        sVal = parseFloat(loopStart.value); eVal = parseFloat(loopEnd.value);
        if (sVal >= eVal) { sVal = Math.max(0, eVal - (1/FPS * step)); loopStart.value = sVal.toFixed(2); }
        idxS = findClosestIndex(sVal); idxE = findClosestIndex(eVal);
        manualFrameStart.value = idxS + 1; manualFrameEnd.value = idxE + 1;
    } else {
        idxS = parseInt(manualFrameStart.value) - 1; idxE = parseInt(manualFrameEnd.value) - 1;
        if (idxS < 0 || isNaN(idxS)) idxS = 0;
        if (idxE >= originalFramesData.length || isNaN(idxE)) idxE = originalFramesData.length - 1;
        if (idxS >= idxE) { idxS = Math.max(0, idxE - 1); manualFrameStart.value = idxS + 1; }
        loopStart.value = timeStampMap[idxS]; loopEnd.value = timeStampMap[idxE];
    }

    document.getElementById('fStart').innerText = idxS + 1; document.getElementById('fEnd').innerText = idxE + 1;

    loopThumbElements.forEach((c, i) => {
        c.classList.remove('start-mark', 'end-mark');
        if (i === idxS) c.classList.add('start-mark');
        if (i === idxE) c.classList.add('end-mark');
    });

    currentLoopIdx = 0; 
    updateChromaRef(); updateExportPreview(); startCanvasPreview();
}

function findClosestIndex(t) {
    if(!timeStampMap.length) return 0;
    return timeStampMap.reduce((p, c, i) => Math.abs(c - t) < Math.abs(timeStampMap[p] - t) ? i : p, 0);
}

loopStart.oninput = () => syncLoopControls('slider'); loopEnd.oninput = () => syncLoopControls('slider');
manualFrameStart.onchange = () => syncLoopControls('keyboard'); manualFrameEnd.onchange = () => syncLoopControls('keyboard');

['pingPongMode', 'blendLoopMode', 'blendFramesCount'].forEach(id => document.getElementById(id).onchange = startCanvasPreview);

frameSkip.oninput = () => {
    if (frameSkip.value < 1) frameSkip.value = 1;
    updateExportPreview();
    startCanvasPreview();
};

// --- 4. MOTOR DE PREVIEW (VINCULADO AL FRAME SKIP) ---
function startCanvasPreview() {
    clearInterval(previewTimer); 
    let magicStep = 0;
    
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
        
        if (isBlend && !isPingPong && magicStep > 0) {
            frame = createBlended(processedFrames[activeIndices[maxIdx]], processedFrames[activeIndices[0]], magicStep / (numBlend + 1));
            if (++magicStep > numBlend) { magicStep = 0; reset = true; }
        } else { frame = processedFrames[activeIndices[currentLoopIdx]]; }

        if (frame) {
            loopCanvas.width = frame.width; loopCanvas.height = frame.height;
            loopCtx.clearRect(0, 0, loopCanvas.width, loopCanvas.height);
            loopCtx.imageRendering = 'pixelated'; loopCtx.drawImage(frame, 0, 0);
        }

        if (reset) currentLoopIdx = 0;
        else if (isPingPong) {
            currentLoopIdx += playDirection;
            if (currentLoopIdx >= maxIdx) { currentLoopIdx = maxIdx; playDirection = -1; }
            else if (currentLoopIdx <= 0) { currentLoopIdx = 0; playDirection = 1; }
        } else {
            if (magicStep === 0) {
                if (++currentLoopIdx > maxIdx) {
                    if (isBlend) { currentLoopIdx = maxIdx; magicStep = 1; } else currentLoopIdx = 0;
                }
            }
        }
    }, 1000 / FPS); 
}

function createBlended(e, s, a) {
    const c = document.createElement('canvas'); c.width = e.width; c.height = e.height;
    const ctx = c.getContext('2d'); ctx.imageRendering = 'pixelated';
    ctx.globalAlpha = 1.0; ctx.drawImage(e, 0, 0); ctx.globalAlpha = a; ctx.drawImage(s, 0, 0); return c;
}

// --- 5. CHROMA KEY ---
function updateChromaRef() {
    if(!originalFramesData.length) return;
    const f = originalFramesData[parseInt(manualFrameStart.value) - 1];
    chromaRefCanvas.width = f.width; chromaRefCanvas.height = f.height;
    chromaRefCanvas.getContext('2d').drawImage(f, 0, 0);
}

chromaRefCanvas.onclick = (e) => {
    const rect = chromaRefCanvas.getBoundingClientRect(), scaleX = chromaRefCanvas.width / rect.width, scaleY = chromaRefCanvas.height / rect.height;
    const p = chromaRefCanvas.getContext('2d').getImageData((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY, 1, 1).data;
    selectedRGB = { r: p[0], g: p[1], b: p[2] }; colorPreview.style.background = `rgb(${p[0]},${p[1]},${p[2]})`;
    applyChromaNonDestructive();
};

chromaTolerance.oninput = () => { tolValueLabel.innerText = chromaTolerance.value; if(selectedRGB) applyChromaNonDestructive(); };

function applyChromaNonDestructive() {
    if (!selectedRGB || !originalFramesData.length) return;
    const tolSq = Math.pow(parseInt(chromaTolerance.value), 2);

    originalFramesData.forEach((origCanvas, i) => {
        const procCtx = processedFrames[i].getContext('2d'), w = origCanvas.width, h = origCanvas.height;
        const imgData = origCanvas.getContext('2d').getImageData(0,0,w,h), d = imgData.data;
        for (let j=0; j<d.length; j+=4) {
            if (Math.pow(d[j]-selectedRGB.r, 2) + Math.pow(d[j+1]-selectedRGB.g, 2) + Math.pow(d[j+2]-selectedRGB.b, 2) <= tolSq) d[j+3] = 0;
        }
        procCtx.clearRect(0,0,w,h); procCtx.putImageData(imgData, 0, 0);
        const loopThumbCtx = loopThumbElements[i].getContext('2d');
        loopThumbCtx.clearRect(0,0,w,h); loopThumbCtx.drawImage(processedFrames[i], 0, 0);
    });
    updateExportPreview(); 
}

// --- 6. EXPORTACIÓN OPTIMIZADA (FILA ÚNICA) ---
function updateExportPreview() {
    if(!processedFrames.length) return;
    
    const idxS = parseInt(manualFrameStart.value) - 1;
    const idxE = parseInt(manualFrameEnd.value) - 1;
    if (isNaN(idxS) || isNaN(idxE)) return;

    const framesToExport = processedFrames.slice(idxS, idxE + 1);
    if(framesToExport.length === 0) return;

    const skip = parseInt(frameSkip.value) || 1;
    const totalFrames = framesToExport.length;
    
    if (totalFrames % skip !== 0 && skip !== 1) {
        skipWarning.classList.remove('hidden');
        document.getElementById('totalLoopFrames').innerText = totalFrames;
        document.getElementById('currentSkip').innerText = skip;
        
        btnExportSpriteSheet.disabled = true; btnAppendToMaster.disabled = true;
        btnExportSpriteSheet.style.opacity = "0.5"; btnAppendToMaster.style.opacity = "0.5";
        
        finalExportCanvas.getContext('2d').clearRect(0,0, finalExportCanvas.width, finalExportCanvas.height);
        document.getElementById('finalSpriteCount').innerText = "0";
        return; 
    } else {
        skipWarning.classList.add('hidden');
        btnExportSpriteSheet.disabled = false; btnAppendToMaster.disabled = false;
        btnExportSpriteSheet.style.opacity = "1"; btnAppendToMaster.style.opacity = "1";
    }

    const finalSprites = framesToExport.filter((_, i) => i % skip === 0);
    document.getElementById('finalSpriteCount').innerText = finalSprites.length;

    const frameW = finalSprites[0].width;
    const frameH = finalSprites[0].height;
    
    finalExportCanvas.width = frameW * finalSprites.length;
    finalExportCanvas.height = frameH;
    
    const ctx = finalExportCanvas.getContext('2d');
    ctx.imageRendering = 'pixelated'; 
    ctx.clearRect(0,0, finalExportCanvas.width, finalExportCanvas.height);
    
    finalSprites.forEach((f, index) => { ctx.drawImage(f, index * frameW, 0); });
}

btnExportSpriteSheet.onclick = () => {
    if (btnExportSpriteSheet.disabled) return;
    const link = document.createElement('a');
    link.download = `fila_sprites_${manualFrameStart.value}_to_${manualFrameEnd.value}.png`;
    link.href = finalExportCanvas.toDataURL('image/png'); link.click();
};

// --- 7. MASTER BOARD COMPOSITOR ---
btnAppendToMaster.onclick = () => {
    if (btnAppendToMaster.disabled || finalExportCanvas.width === 0) return alert("Capa de exportación vacía.");

    const newRow = document.createElement('canvas');
    newRow.width = finalExportCanvas.width; newRow.height = finalExportCanvas.height;
    newRow.getContext('2d').drawImage(finalExportCanvas, 0, 0);

    if (isMasterEmpty) {
        masterCanvas.width = newRow.width;
        masterCanvas.height = newRow.height;
        masterCtx.imageRendering = 'pixelated';
        masterCtx.clearRect(0,0, masterCanvas.width, masterCanvas.height);
        masterCtx.drawImage(newRow, 0, 0);
        isMasterEmpty = false;
    } else {
        const oldMaster = document.createElement('canvas');
        oldMaster.width = masterCanvas.width; oldMaster.height = masterCanvas.height;
        oldMaster.getContext('2d').drawImage(masterCanvas, 0, 0);

        masterCanvas.width = Math.max(oldMaster.width, newRow.width);
        masterCanvas.height = oldMaster.height + newRow.height;
        
        masterCtx.imageRendering = 'pixelated';
        masterCtx.clearRect(0,0, masterCanvas.width, masterCanvas.height);
        
        masterCtx.drawImage(oldMaster, 0, 0);
        masterCtx.drawImage(newRow, 0, oldMaster.height);
    }

    masterCanvas.parentElement.scrollTop = masterCanvas.parentElement.scrollHeight;
    document.getElementById('masterSection').scrollIntoView({ behavior: 'smooth' });
};

masterDropZone.onclick = () => masterInput.click();
masterInput.onchange = (e) => { if(e.target.files.length) loadMasterImage(e.target.files[0]); };

masterDropZone.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; masterDropZone.classList.add('drag-over'); });
masterDropZone.addEventListener('dragleave', () => masterDropZone.classList.remove('drag-over'));
masterDropZone.addEventListener('drop', (e) => {
    e.preventDefault(); masterDropZone.classList.remove('drag-over');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) loadMasterImage(e.dataTransfer.files[0]);
});

function loadMasterImage(file) {
    if(!file || !file.type.startsWith('image/')) return alert("Sube un archivo PNG");
    const img = new Image();
    img.onload = () => {
        masterCanvas.width = img.width;
        masterCanvas.height = img.height;
        masterCtx.imageRendering = 'pixelated';
        masterCtx.clearRect(0,0, masterCanvas.width, masterCanvas.height);
        masterCtx.drawImage(img, 0, 0);
        isMasterEmpty = false;
        document.getElementById('masterSection').scrollIntoView({ behavior: 'smooth' });
    };
    img.src = URL.createObjectURL(file);
}

btnDownloadMaster.onclick = () => {
    if(isMasterEmpty) return alert("El Master Board está vacío.");
    const link = document.createElement('a');
    link.download = `spritesheet_master.png`;
    link.href = masterCanvas.toDataURL('image/png');
    link.click();
};

btnClearMaster.onclick = () => {
    if(!confirm("¿Seguro que deseas borrar el Master Board completo?")) return;
    masterCanvas.width = 0; masterCanvas.height = 0;
    isMasterEmpty = true;
};

// Conversión de scroll de la rueda del ratón
document.querySelectorAll('.scroll-h').forEach(container => {
    container.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0) {
            e.preventDefault(); 
            container.scrollLeft += e.deltaY; 
        }
    }, { passive: false });
});