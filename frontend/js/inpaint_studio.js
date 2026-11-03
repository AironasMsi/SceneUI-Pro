// ============================================================================
// INPAINT STUDIO MODULE (frontend/js/inpaint_studio.js)
// Qwen 2509 4-Step Lightning + MaskBlur+ Boundary Elimination
// ============================================================================

(function() {
  const inpaintState = {
    targetId: null,
    contextType: 'scene', // 'scene' | 'char'
    originalImgUrl: '',
    imgElement: null,
    naturalWidth: 1920,
    naturalHeight: 1080,
    brushSize: 35,
    isErasing: false,
    isDrawing: false,
    mode: 0, // 0 = Custom Prompt, 1 = Universal Erase
    undoStack: [],
    maxUndo: 15
  };

  const UNIVERSAL_ERASE_PROMPT = "seamless background texture, empty scenery, natural ambient lighting, clean continuous surface, pristine background without any person or object";

  // --- Modal Open & Close ---
  window.openInpaintStudio = function(targetId, forceContext = null, targetVarId = null) {
    const proj = window.getProj();
    if (!proj || !targetId) return;

    // Determine context (character vs scene)
    let isChar = false;
    if (forceContext) {
      isChar = (forceContext === 'char');
    } else if (proj.charRefs && proj.charRefs[targetId]) {
      isChar = true;
    } else {
      isChar = (state.viewerContext === 'char');
    }

    inpaintState.targetId = targetId;
    inpaintState.contextType = isChar ? 'char' : 'scene';

    let mainUrl = '';
    let promptVal = '';

    if (isChar) {
      const data = proj.charRefs && proj.charRefs[targetId];
      if (!data) {
        if (typeof toast === 'function') toast("Warning", `Veikėjas "${targetId}" nerastas.`, "warn");
        return;
      }
      const main = (targetVarId && data.variations ? data.variations.find(v => v.id === targetVarId) : null)
                   || (window.getCharMainVariant ? window.getCharMainVariant(data) : null)
                   || (data.variations && data.mainId && data.variations.find(v => v.id === data.mainId))
                   || (data.variations && data.variations[data.variations.length - 1]);
      if (!main || (!main.url && main.status !== 'done')) {
        if (typeof toast === 'function') toast("Negalima atlikti inpaint", `Veikėjas "${targetId}" dar neturi sugeneruoto vaizdo.`, "warn");
        return;
      }
      mainUrl = main.url;
      promptVal = (main.params && main.params.prompt) || (data.params && data.params.prompt) || "";
    } else {
      const out = proj.outputs && proj.outputs.find(o => String(o.sceneId) === String(targetId));
      if (!out || !out.variations || out.variations.length === 0) {
        if (typeof toast === 'function') toast("Negalima atlikti inpaint", `Scene "${targetId}" dar neturi sugeneruoto vaizdo.`, "warn");
        return;
      }
      const main = (targetVarId ? out.variations.find(v => v.id === targetVarId) : null)
                   || (out.mainId && out.variations.find(v => v.id === out.mainId))
                   || out.variations[out.variations.length - 1];
      if (!main || (!main.url && main.status !== 'done')) {
        if (typeof toast === 'function') toast("Negalima atlikti inpaint", `Scene "${targetId}" dar neturi paruošto vaizdo.`, "warn");
        return;
      }
      mainUrl = main.url;
      const sc = proj.scenes && proj.scenes.find(s => String(s.id) === String(targetId));
      promptVal = (main.params && main.params.prompt) || (sc && sc.prompt) || "";
    }

    inpaintState.originalImgUrl = mainUrl;

    // Update UI Elements
    const badge = document.getElementById("inpaintTargetBadge");
    if (badge) badge.textContent = `${isChar ? 'VEIKĖJAS' : 'SCENA'}: ${targetId}`;

    const promptInput = document.getElementById("inpaintPromptInput");
    if (promptInput) {
      if (!promptInput.value || promptInput.value.trim() === '') {
        promptInput.value = promptVal;
      }
    }

    const eraseInput = document.getElementById("inpaintEraseInput");
    if (eraseInput) {
      if (!eraseInput.value || eraseInput.value.trim() === '') {
        eraseInput.value = UNIVERSAL_ERASE_PROMPT;
      }
    }

    // Set Default Mode to 0 (Custom Prompt)
    setInpaintMode(0);

    // Reset status
    const statusMsg = document.getElementById("inpaintStatusMsg");
    if (statusMsg) statusMsg.textContent = "Pasiruošę. Nupieškite kaukę ir spauskite generuoti.";

    // Load Image into Canvas
    setupInpaintCanvas(mainUrl);

    // Show Modal
    const modal = document.getElementById("modalInpaintStudio");
    if (modal) modal.classList.add("show");
  };

  window.closeInpaintStudio = function() {
    const modal = document.getElementById("modalInpaintStudio");
    if (modal) modal.classList.remove("show");
  };

  window.resetInpaintErasePrompt = function() {
    const eraseInput = document.getElementById("inpaintEraseInput");
    if (eraseInput) {
      eraseInput.value = UNIVERSAL_ERASE_PROMPT;
      if (typeof toast === 'function') toast("Atstatyta", "Ištrynimo promptas atstatytas į numatytąjį fono atkūrimą.", "info");
    }
  };

  // --- Canvas Setup & Drawing Logic ---
  function setupInpaintCanvas(imageUrl) {
    const bgImg = document.getElementById("inpaintBgImg");
    const canvas = document.getElementById("inpaintCanvas");
    const resInfo = document.getElementById("inpaintResolutionInfo");
    if (!bgImg || !canvas) return;

    inpaintState.undoStack = [];

    bgImg.onload = function() {
      inpaintState.naturalWidth = bgImg.naturalWidth || 1920;
      inpaintState.naturalHeight = bgImg.naturalHeight || 1080;
      
      // Match canvas internal resolution to real image dimensions
      canvas.width = inpaintState.naturalWidth;
      canvas.height = inpaintState.naturalHeight;

      if (resInfo) {
        resInfo.textContent = `${inpaintState.naturalWidth} × ${inpaintState.naturalHeight} px`;
      }

      // Clear canvas
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      saveCanvasState();
    };

    bgImg.src = imageUrl;
  }

  function saveCanvasState() {
    const canvas = document.getElementById("inpaintCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (inpaintState.undoStack.length >= inpaintState.maxUndo) {
      inpaintState.undoStack.shift();
    }
    inpaintState.undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  }

  function undoLastStroke() {
    if (inpaintState.undoStack.length <= 1) {
      clearMask();
      return;
    }
    inpaintState.undoStack.pop(); // Pop current
    const prevState = inpaintState.undoStack[inpaintState.undoStack.length - 1];
    const canvas = document.getElementById("inpaintCanvas");
    if (canvas && prevState) {
      const ctx = canvas.getContext('2d');
      ctx.putImageData(prevState, 0, 0);
    }
  }

  function clearMask() {
    const canvas = document.getElementById("inpaintCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    inpaintState.undoStack = [];
    saveCanvasState();
  }

  function getCanvasCoords(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX = e.clientX;
    let clientY = e.clientY;

    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  let lastX = 0;
  let lastY = 0;

  function startDrawing(e) {
    const canvas = document.getElementById("inpaintCanvas");
    if (!canvas) return;
    inpaintState.isDrawing = true;
    const pos = getCanvasCoords(e, canvas);
    lastX = pos.x;
    lastY = pos.y;
    drawStroke(pos.x, pos.y, false);
  }

  function continueDrawing(e) {
    if (!inpaintState.isDrawing) return;
    const canvas = document.getElementById("inpaintCanvas");
    if (!canvas) return;
    e.preventDefault();
    const pos = getCanvasCoords(e, canvas);
    drawStroke(pos.x, pos.y, true);
    lastX = pos.x;
    lastY = pos.y;
  }

  function stopDrawing() {
    if (inpaintState.isDrawing) {
      inpaintState.isDrawing = false;
      saveCanvasState();
    }
  }

  function drawStroke(x, y, isLine) {
    const canvas = document.getElementById("inpaintCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const rect = canvas.getBoundingClientRect();
    const scaleRatio = canvas.width / rect.width;
    const actualBrush = inpaintState.brushSize * scaleRatio;

    ctx.save();
    ctx.lineWidth = actualBrush;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (inpaintState.isErasing) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.fillStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.75)'; // Translucent vivid red
      ctx.fillStyle = 'rgba(239, 68, 68, 0.75)';
    }

    ctx.beginPath();
    if (isLine) {
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      ctx.arc(x, y, actualBrush / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function setInpaintMode(modeIndex) {
    inpaintState.mode = modeIndex;
    const btnPrompt = document.getElementById("btnInpaintPresetPrompt");
    const btnErase = document.getElementById("btnInpaintPresetErase");
    const promptBox = document.getElementById("inpaintPromptBox");
    const eraseBox = document.getElementById("inpaintEraseBox");

    if (modeIndex === 1) {
      // Erase mode
      if (btnErase) btnErase.classList.add("active");
      if (btnPrompt) btnPrompt.classList.remove("active");
      if (promptBox) promptBox.style.display = "none";
      if (eraseBox) eraseBox.style.display = "flex";
    } else {
      // Prompt mode
      if (btnPrompt) btnPrompt.classList.add("active");
      if (btnErase) btnErase.classList.remove("active");
      if (promptBox) promptBox.style.display = "flex";
      if (eraseBox) eraseBox.style.display = "none";
    }
  }

  // Check if mask has any painted pixels
  function hasDrawnMask(canvas) {
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    // Step by 16 for quick verification
    for (let i = 3; i < data.length; i += 16) {
      if (data[i] > 15) return true;
    }
    return false;
  }

  // --- Submission & Generation ---
  async function submitInpaint() {
    const canvas = document.getElementById("inpaintCanvas");
    const bgImg = document.getElementById("inpaintBgImg");
    const statusMsg = document.getElementById("inpaintStatusMsg");
    const submitBtn = document.getElementById("btnInpaintGenerate");

    if (!canvas || !bgImg) return;

    if (!hasDrawnMask(canvas)) {
      if (typeof toast === 'function') {
        toast("Kaukė nenupiešta", "Prašome teptuku pažymėti norimą pakeisti arba ištrinti zoną!", "warn");
      }
      if (statusMsg) statusMsg.textContent = "⚠️ Prašome teptuku pažymėti kaukę ant vaizdo!";
      return;
    }

    try {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.style.opacity = "0.6";
      }
      if (statusMsg) statusMsg.textContent = "⏳ Ruošiama kaukė ir siunčiama į serverį...";

      const w = canvas.width;
      const h = canvas.height;

      // 1. Sukuriame švarią gryną kaukę (Mask):
      // Juodas fonas (0) = nekeičiama sritis, Balta spalva (255) = vartotojo nupiešta kaukė
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = w;
      maskCanvas.height = h;
      const maskCtx = maskCanvas.getContext("2d");
      maskCtx.fillStyle = "#000000";
      maskCtx.fillRect(0, 0, w, h);

      // Paimame vartotojo nupieštos kaukės sluoksnį
      const userCanvas = document.getElementById("inpaintCanvas");
      const userCtx = userCanvas.getContext("2d");
      const userImgData = userCtx.getImageData(0, 0, w, h);
      const maskImgData = maskCtx.getImageData(0, 0, w, h);

      const ud = userImgData.data;
      const md = maskImgData.data;
      const totalPixels = w * h;
      for (let i = 0; i < totalPixels; i++) {
        const idx = i * 4;
        if (ud[idx + 3] > 15) {
          md[idx] = 255;     // R
          md[idx + 1] = 255; // G
          md[idx + 2] = 255; // B
          md[idx + 3] = 255; // A
        }
      }
      maskCtx.putImageData(maskImgData, 0, 0);

      // 2. Eksportuojame švarią kaukę į PNG Blob
      const maskBlob = await new Promise(resolve => maskCanvas.toBlob(resolve, 'image/png'));
      if (!maskBlob) throw new Error("Nepavyko sukurti kaukės failo.");

      // 3. Įkeliame švarią kaukę į SceneUI Vault per /api/upload_vault
      const cleanTarget = String(inpaintState.targetId).replace(/[^a-zA-Z0-9_\-]/g, '_');
      const maskFilename = `inpaint_mask_${cleanTarget}_${Date.now()}.png`;

      const fd = new FormData();
      fd.append("file", new File([maskBlob], maskFilename, { type: "image/png" }));

      if (statusMsg) statusMsg.textContent = "⏳ Siunčiama kaukė į Vault...";
      const uploadRes = await fetch("/api/upload_vault", { method: "POST", body: fd });
      if (!uploadRes.ok) throw new Error("Nepavyko įkelti kaukės į serverį.");

      // 4. Paruošiame ComfyUI Inpaint Workflow
      if (statusMsg) statusMsg.textContent = "⚡ Formuojama užduotis ComfyUI eilutei...";

      const baseFilename = inpaintState.originalImgUrl.split('/').pop().split('?')[0];

      const modelSelect = document.getElementById("inpaintModelSelect");
      const selectedModel = modelSelect ? modelSelect.value : "2509";
      const isQwen21 = (selectedModel === "21");

      const stepsSelect = document.getElementById("inpaintStepsSelect");
      const steps = stepsSelect ? parseInt(stepsSelect.value, 10) : (isQwen21 ? 12 : 4);

      const blurSelect = document.getElementById("inpaintBlurSelect");
      const maskBlur = blurSelect ? parseInt(blurSelect.value, 10) : 12;

      const seedInput = document.getElementById("inpaintSeed");
      const randomizeInput = document.getElementById("inpaintRandomize");
      const isRandom = randomizeInput ? randomizeInput.checked : true;
      const seed = isRandom ? Math.floor(Math.random() * 9999999999) : (parseInt(seedInput ? seedInput.value : 1234567, 10) || 1234567);

      const promptInput = document.getElementById("inpaintPromptInput");
      const customPrompt = (promptInput && promptInput.value.trim()) ? promptInput.value.trim() : "high quality, natural details";

      const eraseInput = document.getElementById("inpaintEraseInput");
      const erasePrompt = (eraseInput && eraseInput.value.trim()) ? eraseInput.value.trim() : UNIVERSAL_ERASE_PROMPT;

      // Klonavimas pasirinkto modelio šablono
      const template = isQwen21 ? WF_INPAINT_21 : WF_INPAINT_2509;
      const wf = JSON.parse(JSON.stringify(template));

      // Konfigūracija
      wf["7"].inputs.image = baseFilename; // Pristine untouched base image (NO black pixels)
      if (wf["20"]) wf["20"].inputs.image = maskFilename; // Pure mask loader
      wf["6"].inputs.index = inpaintState.mode === 1 ? 1 : 0;
      wf["1"].inputs.value = customPrompt;
      wf["2"].inputs.value = erasePrompt;
      wf["15"].inputs.steps = steps;
      wf["15"].inputs.seed = seed;
      if (wf["19"]) wf["19"].inputs.amount = maskBlur;

      const prefix = inpaintState.contextType === 'char' 
        ? `CharRef_${cleanTarget}_inpaint` 
        : `Scene_${cleanTarget}_inpaint`;
      wf["18"].inputs.filename_prefix = prefix;

      // 5. Pridedame užduotį į fermos eilę per /api/queue/add
      const priority = 1; // High priority for manual inpaint interactive edits
      const queuePayload = {
        priority: priority,
        projectId: state.currentProjectId,
        sceneId: inpaintState.targetId,
        workflow: wf
      };

      const qRes = await fetch('/api/queue/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(queuePayload)
      });
      const qData = await qRes.json();
      if (qData.status !== "success") throw new Error(qData.message || "Eilės klaida");

      const reqId = qData.reqId;
      const modePrefix = inpaintState.mode === 1 ? "INPAINT ERASE" : "INPAINT EDIT";
      const modeLabel = isQwen21 ? `${modePrefix} (QWEN 2.1)` : modePrefix;
      const activePrompt = inpaintState.mode === 1 ? erasePrompt : customPrompt;

      // 6. Įrašome naują variaciją į projektą ir iškart nustatome kaip MAIN!
      const proj = window.getProj();
      const newVar = {
        id: reqId,
        status: "queued",
        url: "",
        createdAt: typeof nowIso === 'function' ? nowIso() : new Date().toISOString(),
        wfMode: modeLabel,
        seedUsed: seed,
        params: {
          prompt: activePrompt,
          model: selectedModel,
          steps: steps,
          maskBlur: maskBlur,
          inpaintMode: inpaintState.mode,
          baseImage: inpaintState.originalImgUrl
        }
      };

      if (inpaintState.contextType === 'char') {
        const cData = proj.charRefs[inpaintState.targetId];
        if (cData) {
          if (!cData.variations) cData.variations = [];
          cData.variations.push(newVar);
          cData.mainId = reqId; // Set as main immediately so card shows progress!
          cData.generating = true;
        }
        window.saveCurrentProject();
        if (typeof window.renderCharRefs === 'function') window.renderCharRefs();
      } else {
        let out = proj.outputs && proj.outputs.find(o => String(o.sceneId) === String(inpaintState.targetId));
        if (out) {
          if (!out.variations) out.variations = [];
          out.variations.push(newVar);
          out.mainId = reqId; // Set as main immediately so card shows progress!
          out.generating = true;
        }
        window.saveCurrentProject();
        if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images');
      }

      if (typeof toast === 'function') {
        toast("Inpaint paleistas", `Užduotis ${cleanTarget} (${modeLabel}) pradėta! Rezultatas netrukus pasirodys variacijose.`, "success");
      }

      window.closeInpaintStudio();

    } catch (err) {
      console.error("Inpaint klaida:", err);
      if (statusMsg) statusMsg.textContent = `❌ Klaida: ${err.message}`;
      if (typeof toast === 'function') toast("Klaida", err.message, "error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.style.opacity = "1";
      }
    }
  }

  // --- Initializer for Events ---
  function initInpaintStudioModule() {
    // Toolbar elements
    const brushSizeSlider = document.getElementById("inpaintBrushSize");
    const brushSizeVal = document.getElementById("inpaintBrushSizeVal");
    if (brushSizeSlider) {
      brushSizeSlider.addEventListener("input", (e) => {
        inpaintState.brushSize = parseInt(e.target.value, 10);
        if (brushSizeVal) brushSizeVal.textContent = `${inpaintState.brushSize}px`;
      });
    }

    const btnDraw = document.getElementById("btnInpaintModeDraw");
    const btnErase = document.getElementById("btnInpaintModeErase");
    if (btnDraw && btnErase) {
      btnDraw.addEventListener("click", () => {
        inpaintState.isErasing = false;
        btnDraw.classList.add("active");
        btnErase.classList.remove("active");
      });
      btnErase.addEventListener("click", () => {
        inpaintState.isErasing = true;
        btnErase.classList.add("active");
        btnDraw.classList.remove("active");
      });
    }

    const btnUndo = document.getElementById("btnInpaintUndo");
    if (btnUndo) btnUndo.addEventListener("click", undoLastStroke);

    const btnClear = document.getElementById("btnInpaintClear");
    if (btnClear) btnClear.addEventListener("click", () => {
      if (confirm("Ar tikrai norite išvalyti visą nupieštą kaukę?")) {
        clearMask();
      }
    });

    // Preset Segmented Controls
    const btnPresetPrompt = document.getElementById("btnInpaintPresetPrompt");
    const btnPresetErase = document.getElementById("btnInpaintPresetErase");
    if (btnPresetPrompt) btnPresetPrompt.addEventListener("click", () => setInpaintMode(0));
    if (btnPresetErase) btnPresetErase.addEventListener("click", () => setInpaintMode(1));

    // Model Selector Change Listener (Qwen 2509 vs Qwen 2.1 Native)
    const modelSelect = document.getElementById("inpaintModelSelect");
    const stepsSelect = document.getElementById("inpaintStepsSelect");
    const btnGenerate = document.getElementById("btnInpaintGenerate");

    if (modelSelect && stepsSelect) {
      modelSelect.addEventListener("change", () => {
        const is21 = modelSelect.value === '21';
        if (is21) {
          stepsSelect.innerHTML = `
            <option value="8">8 žingsniai (Greitesnis)</option>
            <option value="12" selected>⚡ 12 žingsnių (Rekomenduojama Qwen 2.1, ~45s)</option>
            <option value="16">16 žingsnių (Aukšta kokybė)</option>
            <option value="20">20 žingsnių (Maksimalus detalumas)</option>
          `;
          if (btnGenerate) btnGenerate.textContent = "💎 Generate su Qwen 2.1 Native";
        } else {
          stepsSelect.innerHTML = `
            <option value="4" selected>⚡ 4 žingsniai (Lightning - greičiausias, ~30s)</option>
            <option value="6">6 žingsniai (Rekomenduojama aukštai raiškai)</option>
            <option value="8">8 žingsniai (Maksimalus tikslumas)</option>
          `;
          if (btnGenerate) btnGenerate.textContent = "⚡ Generate Inpaint (~30s)";
        }
      });
    }

    // Submit button
    if (btnGenerate) btnGenerate.addEventListener("click", submitInpaint);

    // Canvas Mouse & Touch Listeners
    const canvas = document.getElementById("inpaintCanvas");
    if (canvas) {
      canvas.addEventListener("mousedown", startDrawing);
      window.addEventListener("mousemove", continueDrawing);
      window.addEventListener("mouseup", stopDrawing);

      canvas.addEventListener("touchstart", startDrawing, { passive: false });
      window.addEventListener("touchmove", continueDrawing, { passive: false });
      window.addEventListener("touchend", stopDrawing);
    }
  }

  // DOM Content Loaded Listener
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initInpaintStudioModule);
  } else {
    initInpaintStudioModule();
  }
})();
