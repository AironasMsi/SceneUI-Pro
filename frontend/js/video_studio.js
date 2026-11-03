// ============================================================================

// VIDEO STUDIO CONTROLLER (IMAGE-TO-VIDEO / I2V FOR SCENEUI)

// ============================================================================



(function() {

  // ============================================================================
  // ZERO-GPU VIDEO GENERATION SIMULATION HELPER
  // ============================================================================
  window.simulateSceneVideoGen = async function(targetId) {
    const proj = window.getProj ? window.getProj() : (window.proj || {});
    if (!proj) return;
    
    const cleanId = String(targetId).replace(/^S/i, '').trim();
    const demoVideoMap = {
      "1": "s1_video_0d1ff0d2_1080p.mp4",
      "2": "s2_video_41501ebe_1080p.mp4",
      "3": "s3_video_a46f4705_1080p.mp4",
      "4": "s4_video_24a54aa2_1080p.mp4",
      "5": "s5_video_37d7ec5f_1080p.mp4",
      "6": "s6_video_d98eac94_1080p.mp4",
      "7": "s7_video_ecf8ed80_1080p.mp4",
      "8": "s8_video_2dc64ee9_1080p.mp4",
      "9": "s9_video_0326f095_1080p.mp4",
      "10": "s10_dfssfdsffsdsd.mp4",
      "11": "s11_video_dcdc5b9a_1080p.mp4",
      "12": "s12_2123132.mp4",
      "13": "s13_video_33254fba_1080p.mp4",
      "14": "s14_video_16756731_1080p.mp4",
      "15": "s15_video_53f6f01b_1080p.mp4",
      "16": "s16_video_e0ce5826_1080p.mp4",
      "17": "s17_video_d3ce6b04_1080p.mp4",
      "18": "s18_video_e8f5f16e_1080p.mp4"
    };
    
    let targetVideo = demoVideoMap[cleanId];
    if (!targetVideo) {
      const num = parseInt(cleanId) || 1;
      const modKey = String(((num - 1) % 18) + 1);
      targetVideo = demoVideoMap[modKey] || "s1_video_0d1ff0d2_1080p.mp4";
    }
    
    if (!proj.outputs) proj.outputs = [];
    let out = proj.outputs.find(o => String(o.sceneId) === String(targetId) || String(o.sceneId).replace(/^S/i, '') === cleanId);
    if (!out) {
      out = { sceneId: targetId, variations: [], mainId: null, params: {} };
      proj.outputs.push(out);
    }
    
    const prevMain = (window.getMainVariant ? window.getMainVariant(out) : (out.variations && out.variations[0])) || {};
    const prevImg = prevMain.url || "";
    
    const varId = "var_vid_" + cleanId + "_" + Date.now();
    const newVar = {
      id: varId,
      type: "video",
      status: "processing",
      url: "",
      tempUrl: prevImg,
      createdAt: window.nowIso ? window.nowIso() : new Date().toISOString(),
      wfMode: "I2V (MiniMax H3 Turbo)",
      soundEnabled: true,
      soundVolume: 1.0,
      params: { prompt: "Cinematic vector stickman movement, 24fps", seconds: 4.0, fps: 24.0 }
    };
    
    if (!out.variations) out.variations = [];
    out.variations.unshift(newVar);
    out.mainId = varId;
    out.generating = true;
    
    if (typeof window.saveProjectToDB === 'function') window.saveProjectToDB(state.currentProjectId);
    if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
    if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images'); 
    else if (typeof window.renderImages === 'function') window.renderImages();
    
    const vidSteps = [
      { pct: 15, text: `🎬 MiniMax I2V: 15% [GPU 1]` },
      { pct: 38, text: `⚡ Motion Flow: 38% [GPU 1]` },
      { pct: 60, text: `⚡ Frame Diffusion: 60% [GPU 1]` },
      { pct: 82, text: `⚡ Temporal Denoising: 82%` },
      { pct: 96, text: `⚡ Audio Sync Mux: 96%` },
      { pct: 100, text: `✅ Video Complete (100%)` }
    ];
    
    for (const st of vidSteps) {
      const fillEl = document.getElementById(`prog-fill-${varId}`) ||
                     document.querySelector(`[data-scene-id="${targetId}"] .card-prog-fill`) ||
                     document.querySelector(`[data-scene-id="${cleanId}"] .card-prog-fill`);
      const textEl = document.getElementById(`prog-text-${varId}`) ||
                     document.querySelector(`[data-scene-id="${targetId}"] .card-prog-text`) ||
                     document.querySelector(`[data-scene-id="${cleanId}"] .card-prog-text`);
      if (fillEl) fillEl.style.width = `${st.pct}%`;
      if (textEl) textEl.textContent = st.text;
      await new Promise(r => setTimeout(r, 360));
    }
    
    newVar.status = "done";
    newVar.url = `/vault/${targetVideo}`;
    newVar.videoUrl = `/vault/${targetVideo}`;
    newVar.file = targetVideo;
    out.generating = false;
    
    if (typeof window.saveProjectToDB === 'function') window.saveProjectToDB(state.currentProjectId);
    if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
    if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images'); 
    else if (typeof window.renderImages === 'function') window.renderImages();
  };



  // ============================================================================

  // SCENE AUDIO RESOLVER (Suranda tikrąjį sugeneruotą garso failą LipSync ir Video)

  // ============================================================================

  window.resolveSceneAudioFilename = function(sc, targetId) {

    const proj = (typeof window.getProj === 'function' ? window.getProj() : null) || window.proj || {};

    const cleanId = String((sc && sc.id) || targetId || '').trim();

    const numId = cleanId.replace(/^S/i, '');

    const normId = `S${numId}`;



    if (sc) {

      const directUrl = sc.audioFilename || sc.audio_url || sc.audioUrl || sc.audio;

      if (directUrl && typeof directUrl === 'string' && directUrl.trim()) {

        return directUrl.split('/').pop().split('?')[0];

      }

    }



    if (proj.sceneAudioById) {

      for (const k of [cleanId, numId, normId, cleanId.toLowerCase(), normId.toLowerCase()]) {

        if (proj.sceneAudioById[k]) {

          return String(proj.sceneAudioById[k]).split('/').pop().split('?')[0];

        }

      }

    }



    const allChunks = [...(proj.audioChunks || []), ...(proj.chunks || []), ...(window.currentProjectChunks || [])];

    for (const c of allChunks) {

      if (!c) continue;

      const cSceneId = String(c.sceneId || '').trim();

      const cId = String(c.id || '').trim();

      if (

        cSceneId === cleanId ||

        cSceneId === numId ||

        cSceneId === normId ||

        cSceneId.toLowerCase() === cleanId.toLowerCase() ||

        cId === `chunk_${cleanId}` ||

        cId === `chunk_${numId}` ||

        cId === `chunk_${normId}` ||

        cId.toLowerCase() === `chunk_${cleanId.toLowerCase()}`

      ) {

        const aUrl = c.filename || c.audio_url || c.url || c.audioUrl || c.file || c.audio;

        if (aUrl && typeof aUrl === 'string' && aUrl.trim()) {

          return aUrl.split('/').pop().split('?')[0];

        }

      }

    }



    if (numId && !isNaN(parseInt(numId))) {

      const scIdx = parseInt(numId) - 1;

      if (allChunks[scIdx]) {

        const c = allChunks[scIdx];

        const aUrl = c.filename || c.audio_url || c.url || c.audioUrl || c.file || c.audio;

        if (aUrl && typeof aUrl === 'string' && aUrl.trim()) {

          return aUrl.split('/').pop().split('?')[0];

        }

      }

    }



    return null;

  };



  const videoStudioState = {

    targetId: null,

    contextType: 'scene', // 'scene' arba 'char'

    sourceVarId: null,

    baseImgUrl: null,

    baseFilename: null,

    sourceImgW: null,

    sourceImgH: null,

    isSubmitting: false

  };



  const MOTION_PRESETS = {

    subtle: "cinematic idle motion, subtle natural breathing, eye blinking, gentle head shift, ambient atmospheric light, masterpiece, ultra-detailed 4k",

    pan: "slow cinematic camera pan, smooth slider movement, parallax depth, majestic atmosphere, ultra-detailed 4k 24fps",

    action: "dynamic action movement, energetic cinematic angle, fluid character motion, dramatic perspective, 4k 24fps",

    atmosphere: "atmospheric environmental movement, neon lights flickering, rain dripping down window, rising mist and smoke, cinematic breeze, 4k 24fps"

  };



  // Asinchroniškai išmatuoja tikrus paveikslėlio failo išmatavimus

  function getImageDimensionsAsync(url) {

    return new Promise((resolve) => {

      if (!url) return resolve(null);

      // 1. Patikriname ar paveikslėlis jau egzistuoja DOM medyje

      const fn = url.split('/').pop().split('?')[0];

      const domImgs = document.querySelectorAll(`img[src="${url}"], img[src*="${fn}"]`);

      for (const dImg of domImgs) {

        if (dImg.naturalWidth && dImg.naturalHeight) {

          return resolve({ w: dImg.naturalWidth, h: dImg.naturalHeight });

        }

      }

      // 2. Užkrauname per Image objektą

      const img = new Image();

      img.onload = () => {

        if (img.naturalWidth && img.naturalHeight) {

          resolve({ w: img.naturalWidth, h: img.naturalHeight });

        } else {

          resolve(null);

        }

      };

      img.onerror = () => resolve(null);

      img.src = url;

    });

  }



  // Apskaičiuoja tikslius video išmatavimus ir aspektą pagal tikrą šaltinio paveikslėlį

  function resolveVideoDimensions(resChoice, selectedEngine, targetScene, baseImgVar, explicitImgDims) {

    let imgW = null;

    let imgH = null;



    // 1. Tiesiogiai perduoti tikri išmatavimai iš paveikslėlio

    if (explicitImgDims && explicitImgDims.w && explicitImgDims.h) {

      imgW = explicitImgDims.w;

      imgH = explicitImgDims.h;

    }



    // 2. Iš variacijos tikrų išmatavimų (išmatuotų naršyklėje)

    if (!imgW && baseImgVar && (baseImgVar.realW || baseImgVar.naturalWidth)) {

      imgW = baseImgVar.realW || baseImgVar.naturalWidth;

      imgH = baseImgVar.realH || baseImgVar.naturalHeight;

    }



    // 3. Iš DOM elemento pagal paveikslėlio URL / failo pavadinimą

    if (!imgW && baseImgVar && baseImgVar.url) {

      const fn = baseImgVar.url.split('/').pop().split('?')[0];

      const domImg = document.querySelector(`img[src="${baseImgVar.url}"], img[src*="${fn}"]`);

      if (domImg && domImg.naturalWidth && domImg.naturalHeight) {

        imgW = domImg.naturalWidth;

        imgH = domImg.naturalHeight;

        if (baseImgVar) {

          baseImgVar.realW = imgW;

          baseImgVar.realH = imgH;

          baseImgVar.naturalWidth = imgW;

          baseImgVar.naturalHeight = imgH;

        }

      }

    }



    // 4. Iš Video Studio esamos būsenos (tik jei ši scena atidaryta Video Studio)

    if (!imgW && targetScene && String(videoStudioState.targetId) === String(targetScene.id) && videoStudioState.sourceImgW && videoStudioState.sourceImgH) {

      imgW = videoStudioState.sourceImgW;

      imgH = videoStudioState.sourceImgH;

    }



    // 5. Iš variacijos parametrų

    if (!imgW && baseImgVar && baseImgVar.params && baseImgVar.params.w && baseImgVar.params.h) {

      imgW = baseImgVar.params.w;

      imgH = baseImgVar.params.h;

    }



    // 6. Iš scenos objekto

    if (!imgW && targetScene && targetScene.params && targetScene.params.w && targetScene.params.h) {

      imgW = targetScene.params.w;

      imgH = targetScene.params.h;

    }



    // 7. Numatytosios projekto reikšmės (jei visai nieko nepavyko rasti)

    const proj = window.getProj ? window.getProj() : (window.proj || {});

    if (!imgW) imgW = proj?.globals?.w || 1920;

    if (!imgH) imgH = proj?.globals?.h || 1080;



    const ratio = imgW / imgH;



    // Nustatome kraštinių santykio tipą

    let isVertical = false;

    let isSquare = false;



    if (ratio <= 0.85) {

      isVertical = true;

    } else if (ratio >= 0.85 && ratio <= 1.18) {

      isSquare = true;

    }



    // Fiksuoti rankiniai vartotojo pasirinkimai

    if (resChoice === "1080x1920" || resChoice === "720x1280") {

      isVertical = true;

      isSquare = false;

    } else if (resChoice === "1x1") {

      isVertical = false;

      isSquare = true;

    } else if (resChoice === "720P" || resChoice === "1080P") {

      isVertical = false;

      isSquare = false;

    }



    // Nustatome artimiausią MiniMax H3 standartinį kraštinių santykį

    const supportedARs = [

      { label: "16:9", val: 16 / 9 },

      { label: "9:16", val: 9 / 16 },

      { label: "1:1",  val: 1.0 },

      { label: "4:3",  val: 4 / 3 },

      { label: "3:4",  val: 3 / 4 },

      { label: "3:2",  val: 3 / 2 },

      { label: "2:3",  val: 2 / 3 },

      { label: "21:9", val: 21 / 9 }

    ];



    let closestAR = isVertical ? "9:16" : (isSquare ? "1:1" : "16:9");

    if (resChoice === "1080x1920" || resChoice === "720x1280") closestAR = "9:16";

    else if (resChoice === "1x1") closestAR = "1:1";

    else if (resChoice === "720P" || resChoice === "1080P") closestAR = "16:9";

    else {

      let bestDiff = 999;

      for (const item of supportedARs) {

        const diff = Math.abs(item.val - ratio);

        if (diff < bestDiff) {

          bestDiff = diff;

          closestAR = item.label;

        }

      }

    }



    const isH3 = (selectedEngine === "minimax_h3" || selectedEngine === "minimax_h3_lipsync");

    let vW = 1280;

    let vH = 720;



    // Rezoliucijos pakopos: 1080P, 480P, arba 720P

    if (resChoice === "1080x1920" || (resChoice.includes("1080") && isVertical)) {

      vW = isH3 ? 1080 : 720;

      vH = isH3 ? 1920 : 1280;

    } else if (resChoice.includes("1080") && isSquare) {

      vW = isH3 ? 1024 : 768;

      vH = isH3 ? 1024 : 768;

    } else if (resChoice.includes("1080")) {

      vW = 1920;

      vH = 1080;

    } else if (resChoice.includes("480") && isVertical) {

      vW = 480;

      vH = 832;

    } else if (resChoice.includes("480") && isSquare) {

      vW = 512;

      vH = 512;

    } else if (resChoice.includes("480")) {

      vW = 832;

      vH = 480;

    } else {

      // 720P pakopa (numatytoji)

      if (isVertical) {

        vW = 720;

        vH = 1280;

      } else if (isSquare) {

        vW = 768;

        vH = 768;

      } else if (closestAR === "4:3") {

        vW = 960;

        vH = 720;

      } else if (closestAR === "3:4") {

        vW = 720;

        vH = 960;

      } else if (closestAR === "21:9") {

        vW = 1344;

        vH = 576;

      } else {

        vW = 1280;

        vH = 720;

      }

    }



    // Visi neuroniniai video modeliai reikalauja, kad matmenys dalintųsi iš 16

    vW = Math.round(vW / 16) * 16;

    vH = Math.round(vH / 16) * 16;



    const aspectRatioLabel = closestAR;

    return { vW, vH, isVertical, isSquare, aspectRatioLabel, detectedW: imgW, detectedH: imgH, ratio };

  }



  // Atnaujina realaus laiko informacinį pranešimą Video Studio modale

  function updateDetectedVideoResolutionUI() {

    const infoEl = document.getElementById("videoResDetectedInfo");

    if (!infoEl) return;

    const resSelect = document.getElementById("videoResSelect");

    const resChoice = resSelect ? resSelect.value : "auto_720";

    const engineSelect = document.getElementById("videoEngineSelect");

    const selectedEngine = engineSelect ? engineSelect.value : "minimax_h3";



    const dim = resolveVideoDimensions(resChoice, selectedEngine, null, null, {

      w: videoStudioState.sourceImgW,

      h: videoStudioState.sourceImgH

    });



    const arName = dim.isVertical ? "9:16 Vertikalus" : (dim.isSquare ? "1:1 Kvadratas" : `${dim.aspectRatioLabel} Horizontalus`);

    const icon = dim.isVertical ? "📱" : (dim.isSquare ? "⏹️" : "🖥️");



    if (resChoice.startsWith("auto")) {

      const srcText = (dim.detectedW && dim.detectedH) ? ` (${dim.detectedW}×${dim.detectedH})` : "";

      infoEl.innerHTML = `${icon} <span style="color:var(--muted)">Aptiktas kadras:</span> <strong>${arName}${srcText}</strong> ➔ Video: <strong>${dim.vW}×${dim.vH}</strong>`;

    } else {

      infoEl.innerHTML = `${icon} <span style="color:var(--muted)">Fiksuota:</span> <strong>${dim.vW}×${dim.vH} (${dim.aspectRatioLabel})</strong>`;

    }

  }



  // --- Atidaryti Video Studio ---

  window.openVideoStudio = function(targetId, forceContext = null, targetVarId = null) {

    const proj = window.getProj();

    if (!proj || !targetId) return;



    let isChar = false;

    if (forceContext) {

      isChar = (forceContext === 'char');

    } else if (proj.charRefs && proj.charRefs[targetId] && (!proj.scenes || !proj.scenes.some(s => String(s.id) === String(targetId)))) {

      isChar = true;

    } else if (proj.scenes && proj.scenes.some(s => String(s.id) === String(targetId))) {

      isChar = false;

    } else if (proj.charRefs && proj.charRefs[targetId]) {

      isChar = true;

    } else {

      isChar = (state.viewerContext === 'char');

    }



    videoStudioState.targetId = targetId;

    videoStudioState.contextType = isChar ? 'char' : 'scene';

    videoStudioState.sourceVarId = targetVarId;



    let baseImgUrl = "";

    let defaultMotionPrompt = "";

    let hasDialogue = false;

    let activeVar = null;

    let sc = null;



    const isVideoVar = (v) => Boolean(v && ((v.type === 'video') || (v.url && (v.url.toLowerCase().endsWith('.mp4') || v.url.toLowerCase().endsWith('.webm'))) || (v.wfMode && v.wfMode.includes('I2V'))));



    function findSourceImageVar(variations, currentVar) {

      if (!variations || variations.length === 0) return null;

      const isStaticImg = (v) => Boolean(v && v.url && !isVideoVar(v) && !v.url.toLowerCase().endsWith('.mp4') && !v.url.toLowerCase().endsWith('.webm') && !v.url.includes('empty_scene.png'));



      if (currentVar && isStaticImg(currentVar)) {

        return currentVar;

      }



      // 1. Sekame sourceVarId grandine atgal, kol randame tikrą statinį vaizdą

      let cursor = currentVar;

      let depth = 0;

      while (cursor && cursor.sourceVarId && depth < 25) {

        const parent = variations.find(v => v.id === cursor.sourceVarId);

        if (parent && isStaticImg(parent)) {

          return parent;

        }

        cursor = parent;

        depth++;

      }



      // 2. Jei grandinėje nėra, imame vėliausią sėkmingą statinį vaizdą

      const recentImg = variations.slice().reverse().find(v => v.status === 'done' && isStaticImg(v));

      if (recentImg) return recentImg;



      // 3. Bet koks tinkamas statinis vaizdas

      return variations.find(v => isStaticImg(v)) || null;

    }



    if (isChar) {

      const charData = proj.charRefs[targetId];

      if (!charData) {

        if (typeof toast === 'function') toast("Error", "Character data not found.", "error");

        return;

      }

      activeVar = (targetVarId && charData.variations ? charData.variations.find(v => v.id === targetVarId) : null)

                  || (window.getCharMainVariant ? window.getCharMainVariant(charData) : null);

      

      const srcImgVar = findSourceImageVar(charData.variations, activeVar);

      if (srcImgVar && srcImgVar.url) {

        baseImgUrl = srcImgVar.url;

        videoStudioState.sourceVarId = srcImgVar.id;

      } else if (activeVar && activeVar.url && !isVideoVar(activeVar)) {

        baseImgUrl = activeVar.url;

        videoStudioState.sourceVarId = activeVar.id;

      }

      defaultMotionPrompt = `cinematic character motion, idle breathing, eye blinking, looking around, highly detailed, 4k 24fps`;

    } else {

      sc = proj.scenes.find(s => String(s.id) === String(targetId) || String(s.id) === String(targetId).replace(/^S/i, ''));

      const out = window.getOutput ? window.getOutput(targetId) : null;

      if (out && out.variations && out.variations.length > 0) {

        activeVar = (targetVarId ? out.variations.find(v => v.id === targetVarId) : null)

                    || (window.getMainVariant ? window.getMainVariant(out) : out.variations[out.variations.length - 1]);

        

        const srcImgVar = findSourceImageVar(out.variations, activeVar);

        if (srcImgVar && srcImgVar.url) {

          baseImgUrl = srcImgVar.url;

          videoStudioState.sourceVarId = srcImgVar.id;

        } else if (activeVar && activeVar.url && !isVideoVar(activeVar)) {

          baseImgUrl = activeVar.url;

          videoStudioState.sourceVarId = activeVar.id;

        }

      }



      if (!baseImgUrl && sc && sc.refA && typeof window.resolveRefImage === 'function') {

        const resolved = window.resolveRefImage(sc.refA);

        if (resolved && !resolved.includes('empty_scene.png')) {

          baseImgUrl = resolved;

          videoStudioState.sourceVarId = null;

        }

      }



      hasDialogue = Boolean(sc && (sc.h3_prompt || (sc.speaker && sc.text) || sc.dialogue));

      if (sc && sc.h3_prompt) {

        defaultMotionPrompt = sc.h3_prompt;

      } else if (sc && sc.video_prompt) {

        defaultMotionPrompt = sc.video_prompt;

      } else if (activeVar && activeVar.params && (activeVar.params.video_prompt || activeVar.params.prompt)) {

        defaultMotionPrompt = activeVar.params.video_prompt || activeVar.params.prompt;

      } else {

        defaultMotionPrompt = "cinematic idle motion, subtle natural breathing, eye blinking, gentle atmospheric movement, masterpiece, ultra-detailed 4k";

      }

    }



    if (!baseImgUrl || baseImgUrl.includes('empty_scene.png')) {

      if (typeof toast === 'function') {

        toast("Keyframe Missing", "Generate initial scene image before creating video!", "warn");

      }

      return;

    }



    videoStudioState.baseImgUrl = baseImgUrl;

    videoStudioState.baseFilename = baseImgUrl.split('/').pop().split('?')[0];



    // Auto-parenkame tinkamiausią modelį (LipSync jei yra dialogas, kitaip H3 Turbo)

    const engineSelect = document.getElementById("videoEngineSelect");

    if (engineSelect) {

      const curVal = engineSelect.value;

      if (hasDialogue) {

        engineSelect.value = "minimax_h3_lipsync";

      } else if (curVal === "minimax_h3_lipsync") {

        engineSelect.value = "minimax_h3";

      }

      const lipsyncWrap = document.getElementById("videoLipsyncRefWrap");

      if (lipsyncWrap) lipsyncWrap.style.display = (engineSelect.value === "minimax_h3_lipsync") ? "flex" : "none";

    }



    // UI užpildymas

    const badge = document.getElementById("videoTargetBadge");

    if (badge) badge.textContent = targetId;



    const isExistingVideo = isVideoVar(activeVar);

    const existingVideoUrl = (isExistingVideo && activeVar.url) ? activeVar.url : null;



    const sourceInfo = document.getElementById("videoSourceInfo");

    if (sourceInfo) {

      if (isExistingVideo) {

        sourceInfo.innerHTML = `Source: <strong>${videoStudioState.baseFilename}</strong> <span style="color:#00ffcc; font-size:10.5px; font-weight:700; background:rgba(0,255,204,0.15); padding:1px 6px; border-radius:3px; margin-left:4px;">(Pradinis kadras)</span>`;

      } else {

        sourceInfo.textContent = `Source: ${videoStudioState.baseFilename}`;

      }

    }



    const promptArea = document.getElementById("videoMotionPrompt");

    if (promptArea) promptArea.value = defaultMotionPrompt;



    const bgImg = document.getElementById("videoBgImg");

    const previewPlayer = document.getElementById("videoPreviewPlayer");



    videoStudioState.sourceImgW = null;

    videoStudioState.sourceImgH = null;



    if (bgImg) {

      const onImgReady = () => {

        if (bgImg.naturalWidth && bgImg.naturalHeight) {

          videoStudioState.sourceImgW = bgImg.naturalWidth;

          videoStudioState.sourceImgH = bgImg.naturalHeight;

          updateDetectedVideoResolutionUI();

        }

      };

      bgImg.onload = onImgReady;

      bgImg.src = baseImgUrl;

      bgImg.style.display = "block";

      if (bgImg.complete && bgImg.naturalWidth > 0) {

        onImgReady();

      }

    }



    getImageDimensionsAsync(baseImgUrl).then((dims) => {

      if (dims && dims.w && dims.h) {

        videoStudioState.sourceImgW = dims.w;

        videoStudioState.sourceImgH = dims.h;

        updateDetectedVideoResolutionUI();

      }

    }).catch(() => {});



    if (previewPlayer) {

      previewPlayer.pause();

      previewPlayer.src = "";

      previewPlayer.style.display = "none";

    }



    // 1. Surandame scenos trukmę iš timeline arba audioChunks

    let detectedSceneDur = 2.5;

    let foundDur = false;

    let hasAudio = false;



    if (!isChar) {

      const cleanId = String(targetId);

      const numId = cleanId.replace(/^S/i, '');

      const scIndex = (proj.scenes || []).findIndex(s => String(s.id) === cleanId || String(s.id) === numId);

      const sc = (proj.scenes || []).find(s => String(s.id) === cleanId || String(s.id) === numId);



      const tItem = (proj.timeline || []).find(t => String(t.id) === cleanId || String(t.id) === numId || String(t.id) === `S${numId}`);

      if (tItem && (tItem.dur || tItem.duration)) {

        detectedSceneDur = parseFloat(tItem.dur || tItem.duration);

        foundDur = true;

      } else if (sc && sc.duration) {

        detectedSceneDur = parseFloat(sc.duration);

        foundDur = true;

      }



      // Tikriname ar yra scenos balso takelis (audioChunks / sceneAudioById)

      let foundAudioUrl = null;

      if (proj.sceneAudioById) {

        foundAudioUrl = proj.sceneAudioById[cleanId] || 

                       proj.sceneAudioById[numId] || 

                       proj.sceneAudioById[`S${numId}`] || 

                       proj.sceneAudioById[`scene_${numId}`] || 

                       (scIndex >= 0 ? proj.sceneAudioById[scIndex] : null);

      }



      let chunk = (proj.audioChunks || []).find(c => 

        String(c.sceneId) === cleanId || 

        String(c.sceneId) === numId || 

        String(c.sceneId) === `S${numId}` ||

        c.index === scIndex ||

        String(c.id) === `chunk_${scIndex}` ||

        String(c.id) === cleanId

      );



      if (!chunk && scIndex >= 0 && proj.audioChunks && proj.audioChunks[scIndex]) {

        chunk = proj.audioChunks[scIndex];

      }



      if (chunk) {

        hasAudio = true;

        if (!foundAudioUrl && (chunk.filename || chunk.audio_url || chunk.url || chunk.audioUrl || chunk.file || chunk.audio)) {

          foundAudioUrl = chunk.filename || chunk.audio_url || chunk.url || chunk.audioUrl || chunk.file || chunk.audio;

        }

        if (!foundDur && chunk.duration) {

          detectedSceneDur = parseFloat(chunk.duration);

          foundDur = true;

        }

      }



      if (!foundAudioUrl && sc && (sc.audioFilename || sc.audioUrl || sc.audio || sc.audio_url)) {

        foundAudioUrl = sc.audioFilename || sc.audioUrl || sc.audio || sc.audio_url;

      }



      if (!foundAudioUrl) {

        foundAudioUrl = window.resolveSceneAudioFilename(sc, targetId);

      }



      if (foundAudioUrl) {

        hasAudio = true;

      }



      videoStudioState.audioFilename = foundAudioUrl ? String(foundAudioUrl).split('/').pop().split('?')[0] : null;

      videoStudioState.hasAudio = hasAudio;

    }



    // Perėjimų buferis (0.5s pradžioje + 0.5s pabaigoje = +1.0s)

    const transitionBuffer = 1.0;

    const calculatedDur = Math.round((detectedSceneDur + transitionBuffer) * 10) / 10;



    videoStudioState.sceneDuration = detectedSceneDur;

    videoStudioState.calculatedVideoDur = calculatedDur;

    videoStudioState.transitionBuffer = transitionBuffer;



    // Atnaujiname UI indikatorius

    const durBadge = document.getElementById("videoSceneDurationBadge");

    if (durBadge) durBadge.textContent = foundDur ? `${detectedSceneDur.toFixed(1)}s` : `${detectedSceneDur.toFixed(1)}s (standartinė)`;



    const bufBadge = document.getElementById("videoBufferBadge");

    if (bufBadge) bufBadge.textContent = `+${transitionBuffer.toFixed(1)}s (0.5s head + 0.5s tail handles)`;



    const calcBadge = document.getElementById("videoCalculatedDurBadge");

    if (calcBadge) calcBadge.textContent = `~${calculatedDur.toFixed(1)}s (with transition padding)`;



    // Checkbox "su garsu" ir "sulėtinti jei per trumpas"

    const audioCheckbox = document.getElementById("videoWithAudio");

    const audioSettingsWrap = document.getElementById("videoAudioSettingsWrap");

    const audioVolSlider = document.getElementById("videoAudioVolume");

    const audioVolLabel = document.getElementById("videoAudioVolumeLabel");



    if (audioCheckbox) {

      audioCheckbox.checked = Boolean(hasDialogue && hasAudio);

    }

    if (audioSettingsWrap) {

      audioSettingsWrap.style.display = (hasDialogue && hasAudio) ? "block" : "none";

    }

    if (audioCheckbox && audioSettingsWrap) {

      audioCheckbox.onchange = () => {

        audioSettingsWrap.style.display = audioCheckbox.checked ? "block" : "none";

      };

    }

    if (audioVolSlider && audioVolLabel) {

      audioVolSlider.oninput = () => {

        audioVolLabel.textContent = `${audioVolSlider.value}%`;

      };

    }



    // SFX Nustatymai (Workflow 19 - MMAudio)

    const sfxInput = document.getElementById("videoSfxPromptInput");

    const withSfxCheck = document.getElementById("videoWithSfx");

    if (sfxInput) {

      sfxInput.value = (sc && sc.sfx_prompt) ? sc.sfx_prompt : "";

    }

    if (withSfxCheck) {

      withSfxCheck.checked = Boolean((sc && sc.sfx_prompt) || hasDialogue);

    }



    // Mygtukas "🔄 Pergeneruoti tik SFX garsą"

    const btnRegenSfx = document.getElementById("btnRegenerateSfxOnly");

    if (btnRegenSfx) {

      if (isExistingVideo) {

        btnRegenSfx.style.display = "block";

        btnRegenSfx.onclick = () => window.regenerateSfxOnly(targetId);

      } else {

        btnRegenSfx.style.display = "none";

      }

    }



    const slowdownCheckbox = document.getElementById("videoSlowdownIfShort");

    if (slowdownCheckbox) {

      slowdownCheckbox.checked = !hasDialogue; // LipSync scenose sulėtinimas nereikalingas

    }



    // Trukmės pasirinkimo nustatymas

    const durSelect = document.getElementById("videoDurationSelect");

    const customWrap = document.getElementById("videoCustomDurationWrap");

    const customInput = document.getElementById("videoCustomSeconds");

    if (durSelect) {

      const optExact = durSelect.querySelector('option[value="exact_scene"]');

      if (optExact) optExact.textContent = `🎯 Exact Scene Duration (${detectedSceneDur.toFixed(1)}s - Native, no retiming)`;

      const optExactBuf = durSelect.querySelector('option[value="exact_scene_buf"]');

      if (optExactBuf) optExactBuf.textContent = `🎯 Scene Duration + Buffer (${calculatedDur.toFixed(1)}s - Native)`;

      const opt3 = durSelect.querySelector('option[value="auto_cap_3"]');

      if (opt3) opt3.textContent = `🎯 Auto (max 3.0s ComfyUI + tolygus sulėtinimas iki ${calculatedDur.toFixed(1)}s)`;

      const opt25 = durSelect.querySelector('option[value="auto_cap_25"]');

      if (opt25) opt25.textContent = `🎯 Auto (max 2.5s ComfyUI + tolygus sulėtinimas iki ${calculatedDur.toFixed(1)}s)`;



      if (customInput) {

        customInput.value = detectedSceneDur.toFixed(1);

      }



      if (!durSelect._boundChange) {

        durSelect._boundChange = true;

        durSelect.addEventListener("change", () => {

          const v = durSelect.value;

          const isCustom = (v === "custom");

          if (customWrap) {

            customWrap.style.display = isCustom ? "flex" : "none";

            if (isCustom && customInput) {

              customInput.focus();

              customInput.select();

            }

          }

          const slowdownEl = document.getElementById("videoSlowdownIfShort");

          if (slowdownEl) {

            if (v === "auto_cap_3" || v === "auto_cap_25") {

              slowdownEl.checked = true;

            } else {

              slowdownEl.checked = false;

            }

          }

        });

      }



      // Numatytoji reikšmė: tiksliai pagal scenos trukmę (Native, be dirbtinio sulėtinimo)

      durSelect.value = "exact_scene";

      if (customWrap) customWrap.style.display = "none";

      if (slowdownCheckbox) slowdownCheckbox.checked = false;

    }



    // Atnaujiname aptiktos rezoliucijos indikatorių

    updateDetectedVideoResolutionUI();



    const resSelectEl = document.getElementById("videoResSelect");

    if (resSelectEl && !resSelectEl._boundDetectChange) {

      resSelectEl._boundDetectChange = true;

      resSelectEl.addEventListener("change", () => updateDetectedVideoResolutionUI());

    }

    const engineSelectEl = document.getElementById("videoEngineSelect");

    if (engineSelectEl && !engineSelectEl._boundDetectChange) {

      engineSelectEl._boundDetectChange = true;

      engineSelectEl.addEventListener("change", () => {

        updateDetectedVideoResolutionUI();

        const lipsyncWrap = document.getElementById("videoLipsyncRefWrap");

        if (lipsyncWrap) lipsyncWrap.style.display = (engineSelectEl.value === "minimax_h3_lipsync") ? "flex" : "none";

        const promptArea = document.getElementById("videoMotionPrompt");

        const proj = window.getProj();

        const sc = proj && proj.scenes ? proj.scenes.find(s => s.id === videoStudioState.targetId) : null;

        if (engineSelectEl.value === "minimax_h3_lipsync") {

          if (sc && sc.h3_prompt && promptArea) promptArea.value = sc.h3_prompt;

          const slowEl = document.getElementById("videoSlowdownIfShort");

          if (slowEl) slowEl.checked = false;

        } else if (sc && sc.video_prompt && promptArea) {

          promptArea.value = sc.video_prompt;

        }

      });

    }



    const modal = document.getElementById("modalVideoStudio");

    if (modal) {

      modal.classList.add("show");

    }



    const statusMsg = document.getElementById("videoStatusMsg");

    if (statusMsg) statusMsg.textContent = "Pasiruošę. Pasirinkite modelį ir spauskite generuoti.";



    const submitBtn = document.getElementById("btnVideoGenerate");

    if (submitBtn) {

      submitBtn.disabled = false;

      submitBtn.style.opacity = "1";

    }

  };



  // --- Uždaryti Video Studio ---

  window.closeVideoStudio = function() {

    const modal = document.getElementById("modalVideoStudio");

    if (modal) modal.classList.remove("show");

    const previewPlayer = document.getElementById("videoPreviewPlayer");

    if (previewPlayer) {

      previewPlayer.pause();

      previewPlayer.src = "";

    }

    videoStudioState.targetId = null;

  };



  // --- Judesio Presetų Pritaikymas ---

  window.applyVideoMotionPreset = function(presetKey) {

    const promptArea = document.getElementById("videoMotionPrompt");

    if (promptArea && MOTION_PRESETS[presetKey]) {

      promptArea.value = MOTION_PRESETS[presetKey];

      if (typeof toast === 'function') {

        toast("Preset pritaikytas", `Pasirinktas „${presetKey}“ judesio šablonas`, "info");

      }

    }

  };



  // --- Reset Prompt Mygtukas ---

  const btnReset = document.getElementById("btnResetVideoPrompt");

  if (btnReset) {

    btnReset.addEventListener("click", () => {

      const proj = window.getProj();

      const sc = proj && proj.scenes ? proj.scenes.find(s => s.id === videoStudioState.targetId) : null;

      const promptArea = document.getElementById("videoMotionPrompt");

      const curEngine = document.getElementById("videoEngineSelect")?.value;

      if (promptArea) {

        if (curEngine === "minimax_h3_lipsync" && sc && sc.h3_prompt) {

          promptArea.value = sc.h3_prompt;

        } else {

          promptArea.value = (sc && sc.video_prompt) ? sc.video_prompt : MOTION_PRESETS.subtle;

        }

      }

    });

  }



  // --- Generate Video (I2V) ---

  window.generateVideoFromStudio = async function() {
    if (typeof window.isGlobalDemoMode === 'function' && window.isGlobalDemoMode()) {
      const targetId = videoStudioState.targetId;
      if (!targetId) return;
      window.closeVideoStudio();
      await window.simulateSceneVideoGen(targetId);
      return;
    }

    if (videoStudioState.isSubmitting) return;



    const targetId = videoStudioState.targetId;

    const baseFilename = videoStudioState.baseFilename;

    const statusMsg = document.getElementById("videoStatusMsg");

    const submitBtn = document.getElementById("btnVideoGenerate");



    if (!targetId || !baseFilename) {

      if (typeof toast === 'function') toast("Error", "No source keyframe selected!", "error");

      return;

    }



    try {

      videoStudioState.isSubmitting = true;

      if (submitBtn) {

        submitBtn.disabled = true;

        submitBtn.style.opacity = "0.6";

      }

      if (statusMsg) statusMsg.textContent = "⚡ Initializing I2V task...";



      const engineSelect = document.getElementById("videoEngineSelect");

      const selectedEngine = engineSelect ? engineSelect.value : "minimax_h3";



      const resSelect = document.getElementById("videoResSelect");

      const resChoice = resSelect ? resSelect.value : "720P";



      const durSelect = document.getElementById("videoDurationSelect");

      const durVal = durSelect ? durSelect.value : "exact_scene";

      const customInput = document.getElementById("videoCustomSeconds");

      let seconds = 3.0;

      let fps = 24.0;



      if (durVal === "exact_scene") {

        seconds = (videoStudioState.sceneDuration && videoStudioState.sceneDuration > 0.5)

          ? Math.round(videoStudioState.sceneDuration * 10) / 10

          : 3.0;

        fps = 24.0;

      } else if (durVal === "exact_scene_buf") {

        seconds = (videoStudioState.calculatedVideoDur && videoStudioState.calculatedVideoDur > 0.5)

          ? Math.round(videoStudioState.calculatedVideoDur * 10) / 10

          : 4.0;

        fps = 24.0;

      } else if (durVal === "custom") {

        const val = customInput ? parseFloat(customInput.value) : 0;

        seconds = (val && val >= 0.5) ? Math.round(val * 10) / 10 : 3.0;

        fps = 24.0;

      } else if (durVal === "auto_cap_3") {

        seconds = Math.min(3.0, videoStudioState.calculatedVideoDur || 3.0);

        fps = 24.0;

      } else if (durVal === "auto_cap_25") {

        seconds = Math.min(2.5, videoStudioState.calculatedVideoDur || 2.5);

        fps = 24.0;

      } else if (durVal.includes('_')) {

        const [secStr, fpsStr] = durVal.split('_');

        seconds = parseFloat(secStr) || 3.0;

        fps = parseFloat(fpsStr) || 24.0;

      }



      const motionPromptEl = document.getElementById("videoMotionPrompt");

      const motionPrompt = (motionPromptEl && motionPromptEl.value.trim()) 

        ? motionPromptEl.value.trim() 

        : MOTION_PRESETS.subtle;



      const randomizeSeed = document.getElementById("videoRandomizeSeed");

      const seed = (randomizeSeed && randomizeSeed.checked)

        ? Math.floor(Math.random() * 9999999999)

        : 42;



      const withAudioCheck = document.getElementById("videoWithAudio");

      const withAudio = withAudioCheck ? withAudioCheck.checked : false;

      const audioOffset = 0.5; // perėjimo buferis pradžioje

      const volSlider = document.getElementById("videoAudioVolume");

      const soundVolume = volSlider ? (parseFloat(volSlider.value) / 100.0) : 1.0;



      const slowdownCheck = document.getElementById("videoSlowdownIfShort");

      const slowdownIfShort = slowdownCheck ? slowdownCheck.checked : true;

      const transitionBuffer = videoStudioState.transitionBuffer || 1.0;



      let wfTemplate = null;

      let modelLabel = "";



      if (selectedEngine === "minimax_h3_lipsync") {

        wfTemplate = WF_VIDEO_MINIMAX_H3_LIPSYNC;

        modelLabel = "MiniMax H3 LipSync (Workflow 18)";

      } else if (selectedEngine === "minimax_h3") {

        wfTemplate = withAudio ? WF_VIDEO_MINIMAX_H3 : (typeof WF_VIDEO_MINIMAX_H3_NO_AUDIO !== 'undefined' ? WF_VIDEO_MINIMAX_H3_NO_AUDIO : WF_VIDEO_MINIMAX_H3);

        modelLabel = withAudio ? "MiniMax H3 Turbo (+ Audio)" : "MiniMax H3 Turbo";

      } else if (selectedEngine === "wan_22") {

        wfTemplate = (withAudio && typeof WF_VIDEO_WAN22_TURBO_AUDIO !== 'undefined') ? WF_VIDEO_WAN22_TURBO_AUDIO : WF_VIDEO_WAN22_TURBO;

        modelLabel = withAudio ? "Wan 2.2 Turbo + Audio" : "Wan 2.2 Turbo";

      } else {

        wfTemplate = (withAudio && typeof WF_VIDEO_WAN21_NATIVE_AUDIO !== 'undefined') ? WF_VIDEO_WAN21_NATIVE_AUDIO : WF_VIDEO_WAN21_NATIVE;

        modelLabel = withAudio ? "Wan 2.1 Native + Audio" : "Wan 2.1 Native";

      }



      const wf = JSON.parse(JSON.stringify(wfTemplate));



      // Workflow parametrų konfigūracija

      const codecEl = document.getElementById("videoCodecSelect");

      const codecChoice = codecEl ? codecEl.value : "auto";



      const currentProj = window.getProj ? window.getProj() : (window.proj || {});

      const targetScene = currentProj?.scenes?.find(s => String(s.id) === String(targetId));

      let explicitDims = null;

      if (videoStudioState.sourceImgW && videoStudioState.sourceImgH) {

        explicitDims = { w: videoStudioState.sourceImgW, h: videoStudioState.sourceImgH };

      } else if (videoStudioState.baseImgUrl) {

        explicitDims = await getImageDimensionsAsync(videoStudioState.baseImgUrl);

      }

      const dim = resolveVideoDimensions(resChoice, selectedEngine, targetScene, null, explicitDims);

      const vW = dim.vW;

      const vH = dim.vH;



      if (selectedEngine === "minimax_h3_lipsync") {

        // Node 910: Bendra scenos nuotrauka

        wf["910"].inputs.image = baseFilename;



        // Node 911: Kalbančio veikėjo nuotrauka (Speaker reference)

        // SVARBU: Pagal nutylėjimą animuojamas pats scenos kadras (baseFilename),

        // kad MiniMax H3 neiškreiptų fono ir apšvietimo į balto fono veikėjo kortelę!

        const lipsyncRefModeEl = document.getElementById("videoLipsyncRefMode");

        const useExternalRef = lipsyncRefModeEl && lipsyncRefModeEl.value === "external_ref";

        let spkRefFile = baseFilename;

        if (useExternalRef) {

          let spkRef = (targetScene && targetScene.speaker) || "refA";

          let rawSpk = spkRef;

          if (spkRef === "refA" && targetScene && targetScene.refA) rawSpk = targetScene.refA;

          else if (spkRef === "refB" && targetScene && targetScene.refB) rawSpk = targetScene.refB;

          else if (spkRef === "refC" && targetScene && targetScene.refC) rawSpk = targetScene.refC;



          let resolvedSpk = typeof window.resolveRefImage === 'function' ? window.resolveRefImage(rawSpk) : rawSpk;

          if (resolvedSpk && !resolvedSpk.includes('empty_scene.png') && !resolvedSpk.includes('empty_character.png')) {

            spkRefFile = resolvedSpk.split('/').pop().split('?')[0];

          }

        }

        wf["911"].inputs.image = spkRefFile;



        // Node 940: Scenos balso garso takelis

        let audioFname = videoStudioState.audioFilename || window.resolveSceneAudioFilename(targetScene, targetId);

        if (!audioFname) {

          alert(`⚠️ Scene ${targetId} neturi sugeneruoto kalbos garso failo!\n\nLipSync lūpų sinchronizacijai (Workflow 18) būtinas garso takelis. Pirmiausia sugeneruokite šios scenos veikėjo balsą Audio skiltyje.`);

          const btnGen = document.getElementById("btnGenerateVideo");

          if (btnGen) btnGen.disabled = false;

          return;

        }

        wf["940"].inputs.audio = audioFname;



        // Node 110: Promptas (H3 prompt arba judesio promptas)

        wf["110"].inputs.prompt = motionPrompt;



        // Node 101: Tiksli trukmė sekundėmis (iš audio, jokio sulėtinimo!)

        const exactDur = videoStudioState.sceneDuration > 0.5 ? Math.round(videoStudioState.sceneDuration * 10) / 10 : seconds;

        wf["101"].inputs.value = exactDur;



        // Node 120: Triukšmo sėkla

        wf["120"].inputs.noise_seed = seed;



        // Node 2293: Galutinis failo prefiksas

        wf["2293"].inputs.filename_prefix = `video/SceneUI_LipSync_${targetId}`;

      } else if (selectedEngine === "minimax_h3") {

        // Tikslūs mazgai pagal video minimax3.json

        wf["15"].inputs.image = baseFilename;

        wf["2"].inputs.mode = "image";

        wf["2"].inputs.prompt = motionPrompt;

        wf["2"].inputs.resolution = "custom";

        wf["2"].inputs.aspect_ratio = dim.aspectRatioLabel;

        wf["2"].inputs.width = vW;

        wf["2"].inputs.height = vH;

        wf["2"].inputs.seconds = seconds;

        wf["2"].inputs.fps = fps;

        wf["6"].inputs.noise_seed = seed;

        if (codecChoice !== "auto" && wf["12"] && wf["12"].inputs) wf["12"].inputs.codec = codecChoice;

        wf["12"].inputs.filename_prefix = `video/SceneUI_MiniMax_${targetId}`;

      } else if (selectedEngine === "wan_22") {

        wf["1"].inputs.image = baseFilename;

        wf["6"].inputs.text = motionPrompt;

        wf["8"].inputs.width = vW;

        wf["8"].inputs.height = vH;

        wf["8"].inputs.length = Math.max(17, Math.round(seconds * fps) + 1);

        wf["9"].inputs.seed = seed;

        wf["11"].inputs.fps = fps;

        if (codecChoice !== "auto" && wf["12"] && wf["12"].inputs) wf["12"].inputs.codec = codecChoice;

        wf["12"].inputs.filename_prefix = `video/SceneUI_Wan22_${targetId}`;

      } else {

        // Wan 2.1 Native

        wf["1"].inputs.image = baseFilename;

        wf["5"].inputs.text = motionPrompt;

        wf["7"].inputs.width = vW;

        wf["7"].inputs.height = vH;

        wf["7"].inputs.length = Math.max(17, Math.round(seconds * fps) + 1);

        wf["8"].inputs.seed = seed;

        wf["10"].inputs.fps = fps;

        if (codecChoice !== "auto" && wf["11"] && wf["11"].inputs) wf["11"].inputs.codec = codecChoice;

        wf["11"].inputs.filename_prefix = `video/SceneUI_Wan21_${targetId}`;

      }



      // Jei generuojama su garsu ir workflow turi LoadAudio mazgą ("21")

      if (withAudio && wf["21"]) {

        let audioFname = videoStudioState.audioFilename;

        if (!audioFname) {

          const cleanId = String(targetId);

          const numId = cleanId.replace(/^S/i, '');

          const scIndex = (proj.scenes || []).findIndex(s => String(s.id) === cleanId || String(s.id) === numId);

          const sc = (proj.scenes || []).find(s => String(s.id) === cleanId || String(s.id) === numId);

          let foundAudioUrl = null;

          if (proj.sceneAudioById) {

            foundAudioUrl = proj.sceneAudioById[cleanId] || 

                           proj.sceneAudioById[numId] || 

                           proj.sceneAudioById[`S${numId}`] || 

                           proj.sceneAudioById[`scene_${numId}`] || 

                           (scIndex >= 0 ? proj.sceneAudioById[scIndex] : null);

          }

          let chunk = (proj.audioChunks || []).find(c => 

            String(c.sceneId) === cleanId || 

            String(c.sceneId) === numId || 

            String(c.sceneId) === `S${numId}` ||

            c.index === scIndex ||

            String(c.id) === `chunk_${scIndex}` ||

            String(c.id) === cleanId

          );

          if (!chunk && scIndex >= 0 && proj.audioChunks && proj.audioChunks[scIndex]) {

            chunk = proj.audioChunks[scIndex];

          }

          if (!foundAudioUrl && chunk && (chunk.url || chunk.audioUrl || chunk.file || chunk.audio)) {

            foundAudioUrl = chunk.url || chunk.audioUrl || chunk.file || chunk.audio;

          }

          if (!foundAudioUrl && sc && (sc.audioUrl || sc.audio || sc.audio_url)) {

            foundAudioUrl = sc.audioUrl || sc.audio || sc.audio_url;

          }

          if (foundAudioUrl) {

            audioFname = foundAudioUrl.split('/').pop().split('?')[0];

          } else {

            audioFname = `chunk_${scIndex >= 0 ? scIndex : numId}.wav`;

          }

        }

        wf["21"].inputs.audio = audioFname;

      }



      const isAudioAvailable = Boolean(withAudio);

      const isLipsync = (selectedEngine === "minimax_h3_lipsync");

      const withSfxCheck = document.getElementById("videoWithSfx");

      const withSfx = withSfxCheck ? withSfxCheck.checked : false;

      const sfxPrompt = document.getElementById("videoSfxPromptInput")?.value.trim() || (targetScene?.sfx_prompt || "");



      // Siunčiame užduotį į fermos eilę

      const queuePayload = {

        priority: 1,

        projectId: state.currentProjectId,

        sceneId: targetId,

        withAudio: isAudioAvailable,

        audioOffset: audioOffset,

        soundVolume: soundVolume,

        soundEnabled: isAudioAvailable,

        sceneDuration: isLipsync ? (videoStudioState.sceneDuration || seconds) : (videoStudioState.sceneDuration || seconds),

        slowdownIfShort: isLipsync ? false : slowdownIfShort,

        transitionBuffer: isLipsync ? 0.0 : transitionBuffer,

        isLipsync: isLipsync,

        withSfx: withSfx,

        sfxPrompt: sfxPrompt,

        workflow: wf

      };



      const qRes = await fetch('/api/queue/add', {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify(queuePayload)

      });



      const qData = await qRes.json();

      if (qData.status !== "success") {

        throw new Error(qData.message || "Nepavyko pridėti į GPU eilę.");

      }



      const reqId = qData.reqId;

      const proj = window.getProj();



      // Sukuriame naują video variaciją

      const newVar = {

        id: reqId,

        url: "",

        tempUrl: videoStudioState.baseImgUrl, // Rodo pradinį kadrą su blur filtru, kol generuojamas video

        createdAt: window.nowIso ? window.nowIso() : new Date().toISOString().replace('T', ' ').slice(0, 19),

        wfMode: `I2V (${modelLabel})`,

        type: 'video',

        status: 'processing',

        soundVolume: soundVolume,

        soundEnabled: isAudioAvailable,

        sourceVarId: videoStudioState.sourceVarId,

        params: {

          prompt: motionPrompt,

          video_prompt: motionPrompt,

          model: selectedEngine,

          resolution: resChoice,

          seconds: seconds,

          fps: fps,

          seed: seed,

          withAudio: isAudioAvailable,

          soundVolume: soundVolume,

          soundEnabled: isAudioAvailable,

          audioOffset: audioOffset,

          slowdownIfShort: slowdownIfShort,

          transitionBuffer: transitionBuffer

        }

      };



      if (videoStudioState.contextType === 'char') {

        const charData = proj.charRefs[targetId];

        if (charData) {

          if (!charData.variations) charData.variations = [];

          charData.variations.push(newVar);

          charData.mainId = newVar.id;

          charData.generating = true;

        }

        window.saveProjectToDB(state.currentProjectId);

        if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('chars');

      } else {

        let out = proj.outputs.find(o => o.sceneId === targetId);

        if (!out) {

          out = { sceneId: targetId, variations: [], mainId: null, params: {} };

          proj.outputs.push(out);

        }

        out.variations.push(newVar);

        out.mainId = newVar.id;

        out.generating = true;

        window.saveProjectToDB(state.currentProjectId);

        if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images');

      }



      if (typeof toast === 'function') {

        toast("🎬 Video Started", `Synthesizing I2V video (${modelLabel}) for scene ${targetId}.`, "success");

      }



      window.closeVideoStudio();



    } catch (err) {

      console.error("[Video Studio Error]:", err);

      if (statusMsg) statusMsg.textContent = `❌ Error: ${err.message}`;

      if (typeof toast === 'function') toast("Video Generation Error", err.message, "error");

    } finally {

      videoStudioState.isSubmitting = false;

      if (submitBtn) {

        submitBtn.disabled = false;

        submitBtn.style.opacity = "1";

      }

    }

  };



  // Prijungiame Submit mygtuką

  const submitBtn = document.getElementById("btnVideoGenerate");

  if (submitBtn) {

    submitBtn.addEventListener("click", () => window.generateVideoFromStudio());

  }



  // --- Video pergeneravimas (Regenerate Video / Adds New Variation) ---

  window.doRegenerateVideo = async function(targetId, sourceVideoVar, contextType = 'scene') {
    if (typeof window.isGlobalDemoMode === 'function' && window.isGlobalDemoMode()) {
      await window.simulateSceneVideoGen(targetId);
      return;
    }

    const proj = window.getProj();

    if (!proj || !targetId) return;



    const isChar = (contextType === 'char');

    const variations = (isChar ? (proj.charRefs && proj.charRefs[targetId] ? proj.charRefs[targetId].variations : []) : (window.getOutput ? window.getOutput(targetId)?.variations : null)) || [];



    const isVideoVar = (v) => Boolean(v && ((v.type === 'video') || (v.url && (v.url.toLowerCase().endsWith('.mp4') || v.url.toLowerCase().endsWith('.webm'))) || (v.wfMode && v.wfMode.includes('I2V'))));



    const isStaticImg = (v) => Boolean(v && v.url && !isVideoVar(v) && !v.url.toLowerCase().endsWith('.mp4') && !v.url.toLowerCase().endsWith('.webm') && !v.url.includes('empty_scene.png'));



    // 1. Randame šaltinio pradinį vaizdo kadrą

    let baseImgVar = null;

    if (sourceVideoVar && sourceVideoVar.sourceVarId) {

      let cursor = variations.find(v => v.id === sourceVideoVar.sourceVarId);

      let depth = 0;

      while (cursor && depth < 25) {

        if (isStaticImg(cursor)) {

          baseImgVar = cursor;

          break;

        }

        cursor = cursor.sourceVarId ? variations.find(v => v.id === cursor.sourceVarId) : null;

        depth++;

      }

    }

    if (!baseImgVar) {

      baseImgVar = variations.slice().reverse().find(v => v.status === 'done' && isStaticImg(v));

    }

    if (!baseImgVar) {

      baseImgVar = variations.find(v => isStaticImg(v));

    }



    let baseImgUrl = baseImgVar ? baseImgVar.url : null;

    if (!baseImgUrl && !isChar) {

      const sc = (proj.scenes || []).find(s => String(s.id) === String(targetId) || String(s.id) === String(targetId).replace(/^S/i, ''));

      if (sc && sc.refA && typeof window.resolveRefImage === 'function') {

        const resolved = window.resolveRefImage(sc.refA);

        if (resolved && !resolved.includes('empty_scene.png') && !resolved.toLowerCase().endsWith('.mp4') && !resolved.toLowerCase().endsWith('.webm')) {

          baseImgUrl = resolved;

        }

      }

    }



    if (!baseImgUrl || baseImgUrl.toLowerCase().endsWith('.mp4') || baseImgUrl.toLowerCase().endsWith('.webm')) {

      if (typeof toast === 'function') {

        toast("Nėra pradinio kadro", "Nepavyko rasti šaltinio vaizdo kadro šio video pergeneravimui.", "warn");

      }

      return;

    }



    const baseFilename = baseImgUrl.split('/').pop().split('?')[0];



    // 2. Parametrai pagal buvusį video

    const p = (sourceVideoVar && sourceVideoVar.params) || {};

    const selectedEngine = p.model || "minimax_h3";

    const resChoice = p.resolution || "720P";

    const seconds = parseFloat(p.seconds) || 2.5;

    const fps = parseFloat(p.fps) || 24.0;

    const newSeed = Math.floor(Math.random() * 9999999999);

    const withAudio = (p.withAudio !== undefined) ? Boolean(p.withAudio) : false;

    const soundVolume = (p.soundVolume !== undefined) ? parseFloat(p.soundVolume) : 1.0;

    const soundEnabled = (p.soundEnabled !== undefined) ? Boolean(p.soundEnabled) : withAudio;

    const audioOffset = (p.audioOffset !== undefined) ? p.audioOffset : 0.5;

    const slowdownIfShort = (p.slowdownIfShort !== undefined) ? Boolean(p.slowdownIfShort) : true;

    const transitionBuffer = (p.transitionBuffer !== undefined) ? parseFloat(p.transitionBuffer) : 1.0;



    let motionPrompt = p.prompt || p.video_prompt;

    if (!motionPrompt) {

      if (!isChar) {

        const sc = (proj.scenes || []).find(s => String(s.id) === String(targetId) || String(s.id) === String(targetId).replace(/^S/i, ''));

        motionPrompt = sc?.video_prompt || MOTION_PRESETS.subtle;

      } else {

        motionPrompt = "cinematic character motion, subtle natural breathing, looking around, highly detailed, 4k 24fps";

      }

    }



    let wfTemplate = null;

    let modelLabel = "";



    if (selectedEngine === "minimax_h3_lipsync") {

      wfTemplate = WF_VIDEO_MINIMAX_H3_LIPSYNC;

      modelLabel = "MiniMax H3 LipSync (Tikslus)";

    } else if (selectedEngine === "minimax_h3") {

      wfTemplate = withAudio ? WF_VIDEO_MINIMAX_H3 : (typeof WF_VIDEO_MINIMAX_H3_NO_AUDIO !== 'undefined' ? WF_VIDEO_MINIMAX_H3_NO_AUDIO : WF_VIDEO_MINIMAX_H3);

      modelLabel = withAudio ? "MiniMax H3 Turbo (+ Audio)" : "MiniMax H3 Turbo";

    } else if (selectedEngine === "wan_22") {

      wfTemplate = (withAudio && typeof WF_VIDEO_WAN22_TURBO_AUDIO !== 'undefined') ? WF_VIDEO_WAN22_TURBO_AUDIO : WF_VIDEO_WAN22_TURBO;

      modelLabel = withAudio ? "Wan 2.2 Turbo + Audio" : "Wan 2.2 Turbo";

    } else {

      wfTemplate = (withAudio && typeof WF_VIDEO_WAN21_NATIVE_AUDIO !== 'undefined') ? WF_VIDEO_WAN21_NATIVE_AUDIO : WF_VIDEO_WAN21_NATIVE;

      modelLabel = withAudio ? "Wan 2.1 Native + Audio" : "Wan 2.1 Native";

    }



    const wf = JSON.parse(JSON.stringify(wfTemplate));



    const targetScene = (proj.scenes || []).find(s => String(s.id) === String(targetId) || String(s.id) === String(targetId).replace(/^S/i, ''));

    let explicitDims = null;

    if (baseImgVar && baseImgVar.params && baseImgVar.params.w && baseImgVar.params.h) {

      explicitDims = { w: baseImgVar.params.w, h: baseImgVar.params.h };

    }

    if (!explicitDims && baseImgUrl) {

      explicitDims = await getImageDimensionsAsync(baseImgUrl);

    }

    const dim = resolveVideoDimensions(resChoice, selectedEngine, targetScene, baseImgVar, explicitDims);

    const vW = dim.vW;

    const vH = dim.vH;



    if (selectedEngine === "minimax_h3_lipsync") {

      const h3PromptVal = p.h3Prompt || targetScene?.h3_prompt || motionPrompt;

      let speakerFinalFile = baseFilename;

      if (p.useExternalRef) {

        let speakerCharImg = null;

        if (targetScene && targetScene.speaker) {

          const spk = targetScene.speaker.trim();

          if (spk === 'refA' && targetScene.refA) speakerCharImg = window.resolveRefImage(targetScene.refA);

          else if (spk === 'refB' && targetScene.refB) speakerCharImg = window.resolveRefImage(targetScene.refB);

          else if (spk === 'refC' && targetScene.refC) speakerCharImg = window.resolveRefImage(targetScene.refC);

          else speakerCharImg = window.resolveRefImage(spk);

        }

        if (!speakerCharImg && targetScene?.refA) {

          speakerCharImg = window.resolveRefImage(targetScene.refA);

        }

        if (speakerCharImg && !speakerCharImg.includes('empty_scene.png') && !speakerCharImg.includes('empty_character.png')) {

          speakerFinalFile = speakerCharImg.split('/').pop().split('?')[0];

        }

      }



      let dialogueAudioFile = p.audioFilename || window.resolveSceneAudioFilename(targetScene, targetId);

      if (!dialogueAudioFile) {

        throw new Error(`Scene ${targetId} neturi sugeneruoto garso failo LipSync animacijai! Pirmiausia sugeneruokite balsą Audio skiltyje.`);

      }



      if (wf["910"]) wf["910"].inputs.image = baseFilename;

      if (wf["911"]) wf["911"].inputs.image = speakerFinalFile;

      if (wf["940"]) wf["940"].inputs.audio = dialogueAudioFile;

      if (wf["110"]) {

        wf["110"].inputs.width = vW;

        wf["110"].inputs.height = vH;

        wf["110"].inputs.prompt = h3PromptVal; // PATAISYTA: promptas eina tiesiai į Node 110!

      }

      if (wf["101"]) {

        const exactDur = (p.duration && p.duration > 0.5) ? Math.round(p.duration * 10) / 10 : (videoStudioState?.sceneDuration > 0.5 ? Math.round(videoStudioState.sceneDuration * 10) / 10 : 3.0);

        wf["101"].inputs.value = exactDur;

      }

      if (wf["120"]) wf["120"].inputs.noise_seed = newSeed;

      if (wf["2293"]) wf["2293"].inputs.filename_prefix = `video/SceneUI_LipSync_${targetId}`;

    } else if (selectedEngine === "minimax_h3") {

      // Tikslūs mazgai pagal video minimax3.json

      wf["15"].inputs.image = baseFilename;

      wf["2"].inputs.mode = "image";

      wf["2"].inputs.prompt = motionPrompt;

      wf["2"].inputs.resolution = "custom";

      wf["2"].inputs.aspect_ratio = dim.aspectRatioLabel;

      wf["2"].inputs.width = vW;

      wf["2"].inputs.height = vH;

      wf["2"].inputs.seconds = seconds;

      wf["2"].inputs.fps = fps;

      wf["6"].inputs.noise_seed = newSeed;

      wf["12"].inputs.filename_prefix = `video/SceneUI_MiniMax_${targetId}`;

    } else if (selectedEngine === "wan_22") {

      wf["1"].inputs.image = baseFilename;

      wf["6"].inputs.text = motionPrompt;

      wf["8"].inputs.width = vW;

      wf["8"].inputs.height = vH;

      wf["8"].inputs.length = Math.max(17, Math.round(seconds * fps) + 1);

      wf["9"].inputs.seed = newSeed;

      wf["11"].inputs.fps = fps;

      wf["12"].inputs.filename_prefix = `video/SceneUI_Wan22_${targetId}`;

    } else {

      wf["1"].inputs.image = baseFilename;

      wf["5"].inputs.text = motionPrompt;

      wf["7"].inputs.width = vW;

      wf["7"].inputs.height = vH;

      wf["7"].inputs.length = Math.max(17, Math.round(seconds * fps) + 1);

      wf["8"].inputs.seed = newSeed;

      wf["10"].inputs.fps = fps;

      wf["11"].inputs.filename_prefix = `video/SceneUI_Wan21_${targetId}`;

    }



    if (withAudio && wf["21"]) {

      let audioFname = null;

      const cleanId = String(targetId);

      const numId = cleanId.replace(/^S/i, '');

      const scIndex = (proj.scenes || []).findIndex(s => String(s.id) === cleanId || String(s.id) === numId);

      const sc = (proj.scenes || []).find(s => String(s.id) === cleanId || String(s.id) === numId);

      let foundAudioUrl = null;

      if (proj.sceneAudioById) {

        foundAudioUrl = proj.sceneAudioById[cleanId] || 

                       proj.sceneAudioById[numId] || 

                       proj.sceneAudioById[`S${numId}`] || 

                       proj.sceneAudioById[`scene_${numId}`] || 

                       (scIndex >= 0 ? proj.sceneAudioById[scIndex] : null);

      }

      let chunk = (proj.audioChunks || []).find(c => 

        String(c.sceneId) === cleanId || 

        String(c.sceneId) === numId || 

        String(c.sceneId) === `S${numId}` ||

        c.index === scIndex ||

        String(c.id) === `chunk_${scIndex}` ||

        String(c.id) === cleanId

      );

      if (!chunk && scIndex >= 0 && proj.audioChunks && proj.audioChunks[scIndex]) {

        chunk = proj.audioChunks[scIndex];

      }

      if (!foundAudioUrl && chunk && (chunk.url || chunk.audioUrl || chunk.file || chunk.audio)) {

        foundAudioUrl = chunk.url || chunk.audioUrl || chunk.file || chunk.audio;

      }

      if (!foundAudioUrl && sc && (sc.audioUrl || sc.audio || sc.audio_url)) {

        foundAudioUrl = sc.audioUrl || sc.audio || sc.audio_url;

      }

      if (foundAudioUrl) {

        audioFname = foundAudioUrl.split('/').pop().split('?')[0];

      } else {

        audioFname = `chunk_${scIndex >= 0 ? scIndex : numId}.wav`;

      }

      wf["21"].inputs.audio = audioFname;

    }



    const isAudioAvailable = (selectedEngine === 'minimax_h3') || withAudio || soundEnabled;



    try {

      const isLipsync = (selectedEngine === "minimax_h3_lipsync");

      const withSfx = (p.withSfx !== undefined) ? Boolean(p.withSfx) : (isLipsync || withAudio);

      const sfxPrompt = p.sfxPrompt || targetScene?.sfx_prompt || "";



      const queuePayload = {

        priority: 1,

        projectId: state.currentProjectId,

        sceneId: targetId,

        withAudio: isAudioAvailable,

        audioOffset: audioOffset,

        soundVolume: soundVolume,

        soundEnabled: isAudioAvailable,

        sceneDuration: seconds,

        slowdownIfShort: isLipsync ? false : slowdownIfShort,

        transitionBuffer: transitionBuffer,

        workflow: wf,

        isLipsync: isLipsync,

        withSfx: withSfx,

        sfxPrompt: sfxPrompt

      };



      const qRes = await fetch('/api/queue/add', {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify(queuePayload)

      });

      const qData = await qRes.json();

      if (qData.status !== "success") {

        throw new Error(qData.message || "Nepavyko pateikti į GPU eilę");

      }



      const reqId = qData.reqId;



      const newVar = {

        id: reqId,

        url: "",

        tempUrl: baseImgUrl,

        createdAt: window.nowIso ? window.nowIso() : new Date().toISOString().replace('T', ' ').slice(0, 19),

        wfMode: `I2V (${modelLabel})`,

        type: 'video',

        status: 'processing',

        soundVolume: soundVolume,

        soundEnabled: isAudioAvailable,

        sourceVarId: baseImgVar ? baseImgVar.id : null,

        params: {

          prompt: motionPrompt,

          video_prompt: motionPrompt,

          model: selectedEngine,

          resolution: resChoice,

          seconds: seconds,

          fps: fps,

          seed: newSeed,

          withAudio: isAudioAvailable,

          soundVolume: soundVolume,

          soundEnabled: isAudioAvailable,

          audioOffset: audioOffset,

          slowdownIfShort: isLipsync ? false : slowdownIfShort,

          transitionBuffer: transitionBuffer,

          isLipsync: isLipsync,

          withSfx: withSfx,

          sfxPrompt: sfxPrompt,

          h3Prompt: p.h3Prompt || targetScene?.h3_prompt || ""

        }

      };



      if (isChar) {

        const charData = proj.charRefs[targetId];

        if (charData) {

          if (!charData.variations) charData.variations = [];

          charData.variations.push(newVar);

          charData.mainId = newVar.id;

          charData.generating = true;

        }

        window.saveProjectToDB(state.currentProjectId);

        if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('chars');

      } else {

        let out = window.getOutput ? window.getOutput(targetId) : null;

        if (!out) {

          out = { sceneId: targetId, variations: [], mainId: null, params: {} };

          proj.outputs.push(out);

        }

        out.variations.push(newVar);

        out.mainId = newVar.id;

        out.generating = true;

        window.saveProjectToDB(state.currentProjectId);

        if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images');

      }



      if ($("#viewer") && $("#viewer").classList.contains("show")) {

        if (typeof window.updateViewer === 'function') window.updateViewer();

      }



      if (typeof toast === 'function') {

        toast("🎬 Video pergeneruojamas", `Pradėta nauja ${modelLabel} variacija (${seconds}s) scenai ${targetId}.`, "success");

      }

    } catch (err) {

      console.error("[doRegenerateVideo Error]:", err);

      if (typeof toast === 'function') toast("Video Regeneration Error", err.message, "error");

    }

  };



  // ==========================================

  // BATCH VIDEO GENERATION (MASINIS GENERAVIMAS)

  // ==========================================

  // MASINIS VIDEO GENERAVIMAS (BATCH GENERATE)

  // ==========================================

  window.openBatchVideoModal = function() {

    const proj = window.getProj ? window.getProj() : null;

    if (!proj || !proj.scenes || !proj.scenes.length) {

      if (typeof toast === 'function') toast("Masinis generavimas", "Projekte nerasta jokių scenų.", "warning");

      return;

    }



    const scenes = proj.scenes;

    let withVideo = 0;

    let missingVideo = 0;

    let missingBaseImg = 0;

    let verticalCount = 0;

    let horizontalCount = 0;

    let squareCount = 0;



    for (const s of scenes) {

      const out = window.getOutput ? window.getOutput(s.id) : (proj.outputs || []).find(o => o.sceneId === s.id);

      const main = out ? (window.getMainVariant ? window.getMainVariant(out) : (out.variations && out.variations.find(v => v.id === out.mainId)) || (out.variations && out.variations[out.variations.length - 1])) : null;

      const isMainVideo = Boolean(

        main && (main.type === 'video' || (main.url && (main.url.toLowerCase().endsWith('.mp4') || main.url.toLowerCase().endsWith('.webm')))) &&

        (main.status === 'done' || main.status === 'queued' || main.status === 'processing')

      );



      if (isMainVideo) {

        withVideo++;

      } else {

        missingVideo++;

      }



      let baseImgVar = null;

      if (out && out.variations) {

        if (out.mainId) {

          baseImgVar = out.variations.find(v => v.id === out.mainId && v.url && !v.url.toLowerCase().endsWith('.mp4') && !v.url.toLowerCase().endsWith('.webm') && !v.url.includes('empty_scene.png'));

        }

        if (!baseImgVar) {

          baseImgVar = out.variations.slice().reverse().find(v => v.url && !v.url.toLowerCase().endsWith('.mp4') && !v.url.toLowerCase().endsWith('.webm') && !v.url.includes('empty_scene.png') && v.status === 'done') ||

                       out.variations.slice().reverse().find(v => v.url && !v.url.toLowerCase().endsWith('.mp4') && !v.url.toLowerCase().endsWith('.webm') && !v.url.includes('empty_scene.png'));

        }

      }



      if (!baseImgVar || !baseImgVar.url) {

        missingBaseImg++;

      } else {

        let w = baseImgVar.naturalWidth || baseImgVar.realW;

        let h = baseImgVar.naturalHeight || baseImgVar.realH;

        if (!w || !h) {

          const fn = (baseImgVar.url || '').split('/').pop().split('?')[0];

          const domImg = document.querySelector(`img[src="${baseImgVar.url}"], img[src*="${fn}"]`);

          if (domImg && domImg.naturalWidth && domImg.naturalHeight) {

            w = domImg.naturalWidth;

            h = domImg.naturalHeight;

            baseImgVar.realW = w;

            baseImgVar.realH = h;

          }

        }

        if (w && h) {

          const r = w / h;

          if (r <= 0.85) verticalCount++;

          else if (r >= 0.85 && r <= 1.18) squareCount++;

          else horizontalCount++;

        }

      }

    }



    let arHtml = '';

    if (verticalCount > 0 || horizontalCount > 0 || squareCount > 0) {

      const parts = [];

      if (verticalCount > 0) parts.push(`📱 <strong>${verticalCount}</strong> vertikalių (9:16 Shorts)`);

      if (horizontalCount > 0) parts.push(`🖥️ <strong>${horizontalCount}</strong> horizontalių (16:9)`);

      if (squareCount > 0) parts.push(`⏹️ <strong>${squareCount}</strong> kvadratinių (1:1)`);

      arHtml = `<div style="margin-top: 6px; font-size: 11px; color: #38bdf8;">📐 <strong>Aptiktos kadrų proporcijos:</strong> ${parts.join(', ')}</div>`;

    }



    const statusBox = document.getElementById("batchVideoStatusBox");

    if (statusBox) {

      statusBox.innerHTML = `

        <div style="margin-bottom: 4px;">📊 <strong>Projekte iš viso:</strong> ${scenes.length} scenų</div>

        <div>🎬 <strong>Jau su video:</strong> ${withVideo} &nbsp;|&nbsp; <strong>Trūksta video:</strong> <span style="color:#ec4899; font-weight:bold;">${missingVideo}</span></div>

        ${arHtml}

        ${missingBaseImg > 0 ? `<div style="margin-top: 6px; color: #fbbf24; font-size: 11px;">⚠️ Dėmesio: ${missingBaseImg} scenų dar neturi pradinio vaizdo (bus praleistos, kol nesugeneruotas vaizdas).</div>` : ''}

      `;

    }



    const modal = document.getElementById("modalBatchVideoGen");

    if (modal) modal.classList.add("show");

    if (typeof updateBatchResHint === 'function') updateBatchResHint();

    if (typeof updateBatchDurationHint === 'function') updateBatchDurationHint();

  };



  window.startBatchVideoGeneration = async function() {
    if (typeof window.isGlobalDemoMode === 'function' && window.isGlobalDemoMode()) {
      const proj = window.getProj ? window.getProj() : null;
      if (!proj || !proj.scenes || !proj.scenes.length) return;
      const modal = document.getElementById("modalBatchVideoGen");
      if (modal) modal.classList.remove("show");
      
      const scenesToGen = proj.scenes;
      for (const sc of scenesToGen) {
        await window.simulateSceneVideoGen(sc.id);
      }
      return;
    }

    if (videoStudioState.isBatchSubmitting) {

      console.warn("[startBatchVideoGeneration] Jau vyksta masinis generavimas, antras paspaudimas blokuojamas.");

      return;

    }



    const proj = window.getProj ? window.getProj() : null;

    if (!proj || !proj.scenes || !proj.scenes.length) {

      if (typeof toast === 'function') toast("Error", "No project scenes found.", "error");

      return;

    }



    videoStudioState.isBatchSubmitting = true;



    const startBtn = document.getElementById("btnStartBatchVideoGen");

    const audioModeInput = document.querySelector('input[name="batchAudioMode"]:checked');

    const audioMode = audioModeInput ? audioModeInput.value : "no_audio";



    const scopeInput = document.querySelector('input[name="batchScope"]:checked');

    const scope = scopeInput ? scopeInput.value : "missing";



    const selectedEngine = document.getElementById("batchVideoModel")?.value || "minimax_h3";

    const resChoice = document.getElementById("batchVideoRes")?.value || "auto_720";



    const fpsInput = document.getElementById("batchVideoFps");

    const fps = fpsInput ? (parseFloat(fpsInput.value) || 24.0) : 24.0;



    const durModeInput = document.querySelector('input[name="batchDurationMode"]:checked');

    const durMode = durModeInput ? durModeInput.value : "auto";



    const fixedDurInput = document.getElementById("batchVideoFixedDur");

    const fixedDur = fixedDurInput ? (parseFloat(fixedDurInput.value) || 3.0) : 3.0;



    const capAsMax = document.getElementById("batchVideoCapAsMax") ? document.getElementById("batchVideoCapAsMax").checked : true;



    const bufferInput = document.getElementById("batchTransitionBuffer");

    const transitionBuffer = bufferInput ? parseFloat(bufferInput.value) : 1.0;



    let targetScenes = proj.scenes.filter(s => {

      const out = window.getOutput ? window.getOutput(s.id) : (proj.outputs || []).find(o => o.sceneId === s.id);

      if (scope === "missing") {

        const main = out ? (window.getMainVariant ? window.getMainVariant(out) : (out.variations && out.variations.find(v => v.id === out.mainId)) || (out.variations && out.variations[out.variations.length - 1])) : null;

        const isMainVideo = Boolean(

          main && (main.type === 'video' || (main.url && (main.url.toLowerCase().endsWith('.mp4') || main.url.toLowerCase().endsWith('.webm')))) &&

          (main.status === 'done' || main.status === 'queued' || main.status === 'processing')

        );

        if (isMainVideo) return false;

      }

      return true;

    });



    if (targetScenes.length === 0) {

      videoStudioState.isBatchSubmitting = false;

      if (typeof toast === 'function') toast("Batch Generation", "No scenes matched filter criteria.", "info");

      return;

    }



    try {

      if (startBtn) {

        startBtn.disabled = true;

        startBtn.innerHTML = `⏳ Staging batch tasks (0 / ${targetScenes.length})...`;

      }



      let enqueued = 0;

      let skippedNoImage = 0;



      for (let i = 0; i < targetScenes.length; i++) {

        const sc = targetScenes[i];

        if (startBtn) {

          startBtn.innerHTML = `⏳ Staging batch tasks (${i + 1} / ${targetScenes.length})...`;

        }



        let out = window.getOutput ? window.getOutput(sc.id) : (proj.outputs || []).find(o => o.sceneId === sc.id);

        if (!out) {

          out = { sceneId: sc.id, variations: [], mainId: null, params: {} };

          proj.outputs.push(out);

        }



        let baseImgVar = null;

        if (out.mainId) {

          baseImgVar = out.variations.find(v => v.id === out.mainId && v.url && !v.url.toLowerCase().endsWith('.mp4'));

        }

        if (!baseImgVar) {

          baseImgVar = out.variations.find(v => v.url && !v.url.toLowerCase().endsWith('.mp4') && v.status === 'completed') ||

                       out.variations.find(v => v.url && !v.url.toLowerCase().endsWith('.mp4'));

        }



        if (!baseImgVar || !baseImgVar.url) {

          skippedNoImage++;

          continue;

        }



        const baseImgUrl = baseImgVar.url;

        const baseFilename = baseImgUrl.split('/').pop().split('?')[0];



        let withAudio = false;

        if (audioMode === "with_audio") {

          withAudio = true;

        } else if (audioMode === "no_audio") {

          withAudio = false;

        } else if (audioMode === "individual") {

          withAudio = Boolean(sc.video_with_audio || sc.withAudio);

        }



        const isAudioAvailable = Boolean(withAudio);

        const soundVolume = isAudioAvailable ? 1.0 : 0.0;



        let audioFname = null;

        let detectedDur = 2.5;

        const cleanId = String(sc.id);

        const numId = cleanId.replace(/^S/i, '');

        const scIndex = proj.scenes.findIndex(s => String(s.id) === cleanId || String(s.id) === numId);



        let chunk = (proj.audioChunks || []).find(c =>

          String(c.sceneId) === cleanId ||

          String(c.sceneId) === numId ||

          String(c.sceneId) === `S${numId}` ||

          c.index === scIndex ||

          String(c.id) === `chunk_${scIndex}` ||

          String(c.id) === cleanId

        );

        if (!chunk && scIndex >= 0 && proj.audioChunks && proj.audioChunks[scIndex]) {

          chunk = proj.audioChunks[scIndex];

        }



        if (chunk && chunk.duration) {

          detectedDur = parseFloat(chunk.duration);

        }



        if (isAudioAvailable) {

          let foundAudioUrl = null;

          if (proj.sceneAudioById) {

            foundAudioUrl = proj.sceneAudioById[cleanId] || proj.sceneAudioById[numId] || (scIndex >= 0 ? proj.sceneAudioById[scIndex] : null);

          }

          if (!foundAudioUrl && chunk && (chunk.url || chunk.audioUrl || chunk.file || chunk.audio)) {

            foundAudioUrl = chunk.url || chunk.audioUrl || chunk.file || chunk.audio;

          }

          if (!foundAudioUrl && (sc.audioUrl || sc.audio || sc.audio_url)) {

            foundAudioUrl = sc.audioUrl || sc.audio || sc.audio_url;

          }

          if (foundAudioUrl) {

            audioFname = foundAudioUrl.split('/').pop().split('?')[0];

          } else {

            audioFname = `chunk_${scIndex >= 0 ? scIndex : numId}.wav`;

          }

        }



        let baseSceneDur = 2.5;

        if (durMode === "fixed") {

          if (capAsMax) {

            let scDur = 2.5;

            if (chunk && chunk.duration) {

              scDur = parseFloat(chunk.duration);

            } else if (sc.duration) {

              scDur = parseFloat(sc.duration);

            }

            baseSceneDur = Math.min(fixedDur, scDur);

          } else {

            baseSceneDur = fixedDur;

          }

        } else {

          if (chunk && chunk.duration) {

            baseSceneDur = parseFloat(chunk.duration);

          } else if (sc.duration) {

            baseSceneDur = parseFloat(sc.duration);

          } else {

            baseSceneDur = 2.5;

          }

        }



        const calculatedDur = Math.round((baseSceneDur + transitionBuffer) * 10) / 10;

        const seconds = Math.max(2.0, Math.min(6.0, calculatedDur));

        const audioOffset = transitionBuffer > 0 ? Math.round((transitionBuffer / 2.0) * 100) / 100 : 0.0;

        const seed = Math.floor(Math.random() * 9999999999);

        const motionPrompt = (sc.video_prompt || sc.motion_prompt || MOTION_PRESETS.subtle).trim();



        const hasDialogue = Boolean(sc && (sc.h3_prompt || (sc.speaker && sc.text) || sc.dialogue));

        let sceneEngine = selectedEngine;

        if (selectedEngine === "auto_dialogue") {

          sceneEngine = hasDialogue ? "minimax_h3_lipsync" : "minimax_h3";

        }

        const isSceneLipsync = (sceneEngine === "minimax_h3_lipsync");



        let wfTemplate = null;

        let modelLabel = "";

        if (sceneEngine === "minimax_h3_lipsync") {

          wfTemplate = WF_VIDEO_MINIMAX_H3_LIPSYNC;

          modelLabel = "MiniMax H3 LipSync";

        } else if (sceneEngine === "minimax_h3") {

          wfTemplate = isAudioAvailable ? WF_VIDEO_MINIMAX_H3 : (typeof WF_VIDEO_MINIMAX_H3_NO_AUDIO !== 'undefined' ? WF_VIDEO_MINIMAX_H3_NO_AUDIO : WF_VIDEO_MINIMAX_H3);

          modelLabel = isAudioAvailable ? "MiniMax H3 Turbo (su garsu)" : "MiniMax H3 Turbo";

        } else if (sceneEngine === "wan_22") {

          wfTemplate = (isAudioAvailable && typeof WF_VIDEO_WAN22_TURBO_AUDIO !== 'undefined') ? WF_VIDEO_WAN22_TURBO_AUDIO : WF_VIDEO_WAN22_TURBO;

          modelLabel = isAudioAvailable ? "Wan 2.2 Turbo + Audio" : "Wan 2.2 Turbo";

        } else {

          wfTemplate = (isAudioAvailable && typeof WF_VIDEO_WAN21_NATIVE_AUDIO !== 'undefined') ? WF_VIDEO_WAN21_NATIVE_AUDIO : WF_VIDEO_WAN21_NATIVE;

          modelLabel = isAudioAvailable ? "Wan 2.1 Native + Audio" : "Wan 2.1 Native";

        }



        let explicitDims = null;

        if (baseImgVar && (baseImgVar.realW || baseImgVar.naturalWidth)) {

          explicitDims = { w: baseImgVar.realW || baseImgVar.naturalWidth, h: baseImgVar.realH || baseImgVar.naturalHeight };

        }

        if (!explicitDims && baseImgUrl) {

          explicitDims = await getImageDimensionsAsync(baseImgUrl);

          if (explicitDims && baseImgVar) {

            baseImgVar.realW = explicitDims.w;

            baseImgVar.realH = explicitDims.h;

            baseImgVar.naturalWidth = explicitDims.w;

            baseImgVar.naturalHeight = explicitDims.h;

          }

        }

        if (!explicitDims && baseImgVar && baseImgVar.params && baseImgVar.params.w && baseImgVar.params.h) {

          explicitDims = { w: baseImgVar.params.w, h: baseImgVar.params.h };

        }



        const dim = resolveVideoDimensions(resChoice, sceneEngine, sc, baseImgVar, explicitDims);

        const vW = dim.vW;

        const vH = dim.vH;



        const wf = JSON.parse(JSON.stringify(wfTemplate));

        if (sceneEngine === "minimax_h3_lipsync") {

          wf["910"].inputs.image = baseFilename;

          // Pagal nutylėjimą animuojamas pats scenos kadras, kad išlaikytų foną ir apšvietimą

          wf["911"].inputs.image = baseFilename;



          let aName = audioFname || window.resolveSceneAudioFilename(sc, sc.id);

          if (!aName) {

            console.warn(`Scene ${sc.id} neturi garso failo LipSync modeliui.`);

            alert(`⚠️ Scene ${sc.id} neturi sugeneruoto garso failo! LipSync modeliui būtinas garso takelis. Pirmiausia sugeneruokite balsą Audio skiltyje.`);

            return;

          }

          wf["940"].inputs.audio = aName;



          wf["110"].inputs.prompt = (sc.h3_prompt || motionPrompt);

          const exactDur = baseSceneDur > 0.5 ? Math.round(baseSceneDur * 10) / 10 : 3.0;

          wf["101"].inputs.value = exactDur;

          wf["120"].inputs.noise_seed = seed;

          wf["2293"].inputs.filename_prefix = `video/SceneUI_LipSync_${sc.id}`;

        } else if (sceneEngine === "minimax_h3") {

          wf["15"].inputs.image = baseFilename;

          wf["2"].inputs.mode = "image";

          wf["2"].inputs.prompt = motionPrompt;

          wf["2"].inputs.resolution = "custom";

          wf["2"].inputs.aspect_ratio = dim.aspectRatioLabel;

          wf["2"].inputs.width = vW;

          wf["2"].inputs.height = vH;

          wf["2"].inputs.seconds = seconds;

          wf["2"].inputs.fps = fps;

          wf["6"].inputs.noise_seed = seed;

          wf["12"].inputs.filename_prefix = `video/SceneUI_MiniMax_${sc.id}`;

        } else if (sceneEngine === "wan_22") {

          wf["1"].inputs.image = baseFilename;

          wf["6"].inputs.text = motionPrompt;

          wf["8"].inputs.width = vW;

          wf["8"].inputs.height = vH;

          wf["8"].inputs.length = Math.max(17, Math.round(seconds * fps) + 1);

          wf["9"].inputs.seed = seed;

          wf["11"].inputs.fps = fps;

          wf["12"].inputs.filename_prefix = `video/SceneUI_Wan22_${sc.id}`;

        } else {

          wf["1"].inputs.image = baseFilename;

          wf["5"].inputs.text = motionPrompt;

          wf["7"].inputs.width = vW;

          wf["7"].inputs.height = vH;

          wf["7"].inputs.length = Math.max(17, Math.round(seconds * fps) + 1);

          wf["8"].inputs.seed = seed;

          wf["10"].inputs.fps = fps;

          wf["11"].inputs.filename_prefix = `video/SceneUI_Wan21_${sc.id}`;

        }



        if (isAudioAvailable && wf["21"]) {

          wf["21"].inputs.audio = audioFname;

        }



        const queuePayload = {

          priority: 1,

          projectId: state.currentProjectId,

          sceneId: sc.id,

          withAudio: isAudioAvailable,

          audioOffset: audioOffset,

          soundVolume: soundVolume,

          soundEnabled: isAudioAvailable,

          sceneDuration: baseSceneDur,

          slowdownIfShort: isSceneLipsync ? false : true,

          transitionBuffer: isSceneLipsync ? 0.0 : transitionBuffer,

          isLipsync: isSceneLipsync,

          withSfx: isSceneLipsync || Boolean(sc.sfx_prompt),

          sfxPrompt: sc.sfx_prompt || "",

          fps: fps,

          workflow: wf

        };



        const qRes = await fetch('/api/queue/add', {

          method: 'POST',

          headers: { 'Content-Type': 'application/json' },

          body: JSON.stringify(queuePayload)

        });



        const qData = await qRes.json();

        if (qData.status !== "success") {

          console.warn(`Nepavyko pridėti scenos ${sc.id}:`, qData.message);

          continue;

        }



        const reqId = qData.reqId;

        const newVar = {

          id: reqId,

          url: "",

          tempUrl: baseImgVar.url,

          createdAt: window.nowIso ? window.nowIso() : new Date().toISOString().replace('T', ' ').slice(0, 19),

          wfMode: `I2V (${modelLabel})`,

          type: 'video',

          status: 'queued',

          soundVolume: soundVolume,

          soundEnabled: isAudioAvailable,

          sourceVarId: baseImgVar.id,

          params: {

            prompt: motionPrompt,

            video_prompt: motionPrompt,

            model: selectedEngine,

            resolution: resChoice,

            w: vW,

            h: vH,

            aspect_ratio: dim.aspectRatioLabel,

            seconds: seconds,

            fps: fps,

            seed: seed,

            withAudio: isAudioAvailable,

            soundVolume: soundVolume,

            soundEnabled: isAudioAvailable,

            audioOffset: audioOffset,

            slowdownIfShort: true,

            transitionBuffer: transitionBuffer,

            sceneDuration: baseSceneDur,

            targetDuration: calculatedDur,

            durationMode: durMode

          }

        };



        out.variations.push(newVar);

        out.mainId = newVar.id;

        out.generating = true;

        enqueued++;

      }



      window.saveProjectToDB(state.currentProjectId);

      if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images');



      document.getElementById("modalBatchVideoGen")?.classList.remove("show");



      if (typeof toast === 'function') {

        const msg = `Sėkmingai sukurta ${enqueued} video užduočių!${skippedNoImage > 0 ? ` (${skippedNoImage} praleista be vaizdo)` : ''}`;

        toast("🎬 Masinis video paleistas", msg, "success");

      }

    } catch (err) {

      console.error("[startBatchVideoGeneration Error]:", err);

      if (typeof toast === 'function') toast("Masinio generavimo klaida", err.message, "error");

    } finally {

      videoStudioState.isBatchSubmitting = false;

      if (startBtn) {

        startBtn.disabled = false;

        startBtn.innerHTML = `🚀 Pradėti masinį generavimą`;

      }

    }

  };



  // Dinaminis paaiškinimas pagal pasirinktą rezoliucijos režimą

  function updateBatchResHint() {

    const resSel = document.getElementById("batchVideoRes");

    const hint = document.getElementById("batchVideoResHint");

    if (!resSel || !hint) return;

    const v = resSel.value;

    if (v === "auto_720") {

      hint.innerHTML = "💡 <strong>Auto 720P HD:</strong> Kiekvienas kadras bus generuojamas pagal TIKRĄ savo pradinio paveikslėlio proporciją (vertikaliems ➔ 720×1280, horizontaliems ➔ 1280×720).";

      hint.style.color = "#38bdf8";

    } else if (v === "auto_1080") {

      hint.innerHTML = "💡 <strong>Auto 1080P Full HD:</strong> Kiekvienas kadras bus Full HD pagal TIKRĄ savo proporciją (vertikaliems ➔ 1080×1920, horizontaliems ➔ 1920×1080).";

      hint.style.color = "#a855f7";

    } else if (v === "auto_480") {

      hint.innerHTML = "💡 <strong>Auto 480P:</strong> Greitas testas pagal proporciją (vertikaliems ➔ 480×848, horizontaliems ➔ 848×480).";

      hint.style.color = "#fbbf24";

    } else if (v.includes("1280") || (v.includes("1920") && v.startsWith("1080x"))) {

      hint.innerHTML = "📱 <strong>Fiksuotas Shorts režimas:</strong> Visi video bus griežtai vertikalūs (9:16).";

      hint.style.color = "#ec4899";

    } else if (v === "720P" || v === "1080P") {

      hint.innerHTML = "🖥️ <strong>Fiksuotas Horizontalus:</strong> Visi video bus griežtai horizontalūs (16:9).";

      hint.style.color = "#10b981";

    } else if (v === "1x1") {

      hint.innerHTML = "⏹️ <strong>Fiksuotas Kvadratas:</strong> Visi video bus 768×768 (1:1).";

      hint.style.color = "#f59e0b";

    }

  }

  window.updateBatchResHint = updateBatchResHint;



  // Wire events (strictly once)

  function setupBatchVideoEvents() {

    if (window._batchVideoEventsBound) return;

    window._batchVideoEventsBound = true;



    const btnBatch = document.getElementById("btnBatchGenerateVideos");

    if (btnBatch) {

      btnBatch.onclick = () => window.openBatchVideoModal();

    }

    const btnStart = document.getElementById("btnStartBatchVideoGen");

    if (btnStart) {

      btnStart.onclick = () => window.startBatchVideoGeneration();

    }

    const resSel = document.getElementById("batchVideoRes");

    if (resSel) {

      resSel.onchange = updateBatchResHint;

      updateBatchResHint();

    }



    const fpsSel = document.getElementById("batchVideoFps");

    if (fpsSel) {

      fpsSel.onchange = updateBatchDurationHint;

    }



    const durRadios = document.querySelectorAll('input[name="batchDurationMode"]');

    durRadios.forEach(r => {

      r.onchange = updateBatchDurationHint;

    });



    const fixedInput = document.getElementById("batchVideoFixedDur");

    if (fixedInput) {

      fixedInput.oninput = updateBatchDurationHint;

      fixedInput.onchange = updateBatchDurationHint;

    }



    const bufSel = document.getElementById("batchTransitionBuffer");

    if (bufSel) {

      bufSel.onchange = updateBatchDurationHint;

    }



    const capCb = document.getElementById("batchVideoCapAsMax");

    if (capCb) {

      capCb.onchange = updateBatchDurationHint;

    }



    updateBatchDurationHint();

  }



  function updateBatchDurationHint() {

    const fpsSel = document.getElementById("batchVideoFps");

    const fps = fpsSel ? (parseFloat(fpsSel.value) || 24.0) : 24.0;

    const fpsHint = document.getElementById("batchFpsHint");

    if (fpsHint) {

      if (fps <= 8) {

        fpsHint.innerHTML = "🧱 <strong>8 FPS (Claymation / Stop-motion):</strong> Autentiškas plastilino ir lėlių animacijos kadrų judesys.";

        fpsHint.style.color = "#ec4899";

      } else if (fps <= 12) {

        fpsHint.innerHTML = "✏️ <strong>12 FPS (Klasikinė animacija):</strong> Kas antras kadras (on twos) – puikiai tinka Anime ir animuotiems personažams.";

        fpsHint.style.color = "#fbbf24";

      } else if (fps === 16) {

        fpsHint.innerHTML = "🤖 <strong>16 FPS (Wan Native):</strong> Gimtasis Wan modelių kadrų dažnis.";

        fpsHint.style.color = "#38bdf8";

      } else if (fps === 60) {

        fpsHint.innerHTML = "⚡ <strong>60 FPS (HFR):</strong> Ypatingai glotnus, sportinis ir skaitmeninis judesys.";

        fpsHint.style.color = "#10b981";

      } else {

        fpsHint.innerHTML = `🎬 <strong>${fps} FPS:</strong> Standartinis kino judesio formatas.`;

        fpsHint.style.color = "#38bdf8";

      }

    }



    const durModeInput = document.querySelector('input[name="batchDurationMode"]:checked');

    const durMode = durModeInput ? durModeInput.value : "auto";

    const fixedWrap = document.getElementById("batchFixedDurWrap");

    if (fixedWrap) {

      fixedWrap.style.display = durMode === "fixed" ? "block" : "none";

    }



    const bufSel = document.getElementById("batchTransitionBuffer");

    const buf = bufSel ? parseFloat(bufSel.value) : 1.0;

    const fixedInput = document.getElementById("batchVideoFixedDur");

    const fixedVal = fixedInput ? (parseFloat(fixedInput.value) || 3.0) : 3.0;



    const capAsMax = document.getElementById("batchVideoCapAsMax") ? document.getElementById("batchVideoCapAsMax").checked : true;

    const calcInfo = document.getElementById("batchDurationCalcInfo");

    if (calcInfo) {

      if (durMode === "fixed") {

        const totalFixed = Math.round((fixedVal + buf) * 10) / 10;

        if (capAsMax) {

          calcInfo.innerHTML = `

            <div style="color: #38bdf8; font-weight: 700; margin-bottom: 3px;">

              ⏱️ Maksimali trukmė (Lubos): iki <strong>${totalFixed.toFixed(1)}s</strong> (${fixedVal.toFixed(1)}s bazinė + ${buf.toFixed(1)}s buferis @ ${fps} fps)

            </div>

            <div style="font-size: 10.5px; color: #94a3b8; line-height: 1.35;">

              ✂️ Jei scenos balsui reikia mažiau – video bus atitinkamai trumpesnis (niekada neviršys ${totalFixed.toFixed(1)}s).<br/>

              🐢 Trūkstamas laikas sklandžiai <strong>sulėtinamas</strong>, o jei video ilgesnis – <strong>apkerpamas</strong> (jokio pagreitinimo).

            </div>

          `;

        } else {

          calcInfo.innerHTML = `

            <div style="color: #38bdf8; font-weight: 700; margin-bottom: 3px;">

              ⏱️ Griežtai fiksuota trukmė: visiems lygiai <strong>${totalFixed.toFixed(1)}s</strong> (${fixedVal.toFixed(1)}s bazinė + ${buf.toFixed(1)}s buferis @ ${fps} fps)

            </div>

            <div style="font-size: 10.5px; color: #94a3b8; line-height: 1.35;">

              🐢 Visi projekto video bus identiškos trukmės.<br/>

              Trūkstamas laikas sklandžiai <strong>sulėtinamas</strong>, o jei video ilgesnis – <strong>apkerpamas</strong> (jokio pagreitinimo).

            </div>

          `;

        }

      } else {

        calcInfo.innerHTML = `

          <div style="color: #38bdf8; font-weight: 700; margin-bottom: 3px;">

            🎯 Auto trukmė: [Kiekvienos scenos audio] + ${buf.toFixed(1)}s perėjimų buferis (@ ${fps} fps)

          </div>

          <div style="font-size: 10.5px; color: #94a3b8; line-height: 1.35;">

            Kiekvienas kadras prisitaiko prie balso įrašo ilgio.<br/>

            🐢 Per trumpi sugeneruoti video <strong>sulėtinami</strong> iki tikslinės trukmės, o per ilgi – <strong>apkerpami</strong> (jokio pagreitinimo).

          </div>

        `;

      }

    }

  }

  // ============================================================================

  // REGENERATE SFX ONLY (MMAUDIO WORKFLOW 19)

  // ============================================================================

  window.regenerateSfxOnly = async function(sceneId) {

    const sfxInput = document.getElementById("videoSfxPromptInput");

    const sfxPrompt = sfxInput ? sfxInput.value.trim() : "";

    const statusMsg = document.getElementById("videoStatusMsg");

    const btn = document.getElementById("btnRegenerateSfxOnly");



    try {

      if (btn) {

        btn.disabled = true;

        btn.innerHTML = "⏳ Generuojami SFX garsai...";

      }

      if (statusMsg) statusMsg.textContent = "🔊 Generuojamas SFX fono garsas per MMAudio (Workflow 19)...";



      const res = await fetch('/api/video/regenerate_sfx', {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({

          projectId: state.currentProjectId || "default",

          sceneId: sceneId,

          sfxPrompt: sfxPrompt

        })

      });

      const data = await res.json();

      if (data.status === "success") {

        if (typeof toast === 'function') toast("SFX atnaujintas", "Scenos fono garsai sėkmingai sugeneruoti!", "success");

        if (statusMsg) statusMsg.textContent = "✅ SFX garsas atnaujintas!";

        const previewPlayer = document.getElementById("videoPreviewPlayer");

        if (previewPlayer && data.video) {

          previewPlayer.src = `/api/vault/${data.video}?t=${Date.now()}`;

          previewPlayer.load();

          const studioModal = document.getElementById("modalVideoStudio");

          const isStudioVisible = studioModal && studioModal.classList.contains("show") && !document.hidden;

          if (isStudioVisible) {

            previewPlayer.play().catch(() => {});

          } else {

            try { previewPlayer.pause(); } catch(e){}

          }

        }

      } else {

        throw new Error(data.message || "SFX generavimo klaida.");

      }

    } catch (err) {

      console.error("[regenerateSfxOnly] Klaida:", err);

      if (typeof toast === 'function') toast("Klaida", err.message, "error");

      if (statusMsg) statusMsg.textContent = `❌ Error: ${err.message}`;

    } finally {

      if (btn) {

        btn.disabled = false;

        btn.innerHTML = "🔄 Pergeneruoti tik SFX garsą (MMAudio)";

      }

    }

  };



  window.updateBatchDurationHint = updateBatchDurationHint;



  if (document.readyState === "loading") {

    document.addEventListener("DOMContentLoaded", setupBatchVideoEvents);

  } else {

    setupBatchVideoEvents();

  }



})();



