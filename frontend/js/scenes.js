// ============================================================================

// 7. SCENES LOGIC (TAB 1 & 3) - scenes.js

// ============================================================================



// --- empty_scene.png sinchronizacijos funkcija (Dabar valdo Python Hub'as fone) ---

window.emptySceneUploaded = true;

window.ensureEmptySceneUploaded = async function() {

    // Hub'as (Orkestratorius) dabar naudoja JIT failų sinchronizaciją.

    // Frontend'ui nebereikia rūpintis šio failo siuntimu.

    return Promise.resolve();

};

// --------------------------------------------------------



function getRefCount(params) { 

    if (!params) return 0;

    return [params.refA, params.refB, params.refC].filter(x => x && typeof x === 'string' && x.trim() !== "" && x.trim() !== "empty_scene.png" && x.trim() !== "empty_character.png").length; 

}



window.resolveRefImage = function(refName) {

    if (!refName || typeof refName !== 'string' || refName.trim() === "" || refName === "empty_scene.png") {

        return "empty_scene.png";

    }

    const cleanRef = refName.trim();

    const proj = window.getProj ? window.getProj() : (state.projects ? state.projects[state.currentProjectId] : null);

    if (!proj) return cleanRef.includes('.') ? cleanRef : `${cleanRef}.png`;



    // 1. Fuzzy match against proj.charRefs

    if (proj.charRefs) {

        const lowerClean = cleanRef.toLowerCase();

        const lowerStem = lowerClean.replace(/\.[^/.]+$/, "");

        

        let matchedKey = Object.keys(proj.charRefs).find(k => {

            const lk = k.toLowerCase();

            const lkStem = lk.replace(/\.[^/.]+$/, "");

            return lk === lowerClean || lkStem === lowerStem || lk === `${lowerStem}.png` || `${lkStem}.png` === lowerClean;

        });



        if (matchedKey) {

            const charData = proj.charRefs[matchedKey];

            const main = (window.getCharMainVariant ? window.getCharMainVariant(charData) : null) 

                         || (charData.variations && charData.mainId && charData.variations.find(v => v.id === charData.mainId))

                         || (charData.variations && charData.variations.find(v => v.status === 'done' && v.url))

                         || (charData.variations && charData.variations.length > 0 && charData.variations[charData.variations.length - 1]);

            if (main && main.url) {

                const cleanUrl = main.url.split('?')[0];

                const parts = cleanUrl.split('/');

                return decodeURIComponent(parts[parts.length - 1]);

            }

            // If character has no generated variations, but is a direct reference file in proj.refs:

            if (proj.refs && proj.refs.includes(cleanRef) && cleanRef !== 'empty_scene.png') {

                return cleanRef;

            }

            // Fallback to base template image if character is not yet generated

            const style = proj.globals ? (proj.globals.charBaseStyle || 'default') : 'default';

            const template = charData.template || 'male';

            return `${style}/base_${template}.png`;

        }

    }



    // 2. If it is already a file path or has extension

    if (cleanRef.includes('/') || cleanRef.endsWith('.png') || cleanRef.endsWith('.jpg') || cleanRef.endsWith('.jpeg') || cleanRef.endsWith('.webp')) {

        return cleanRef;

    }



    // 3. Fallback

    return `${cleanRef}.png`;

};



function buildWorkflow(params) {

  const proj = window.getProj();

  const fallback = proj.globals.fallbackRef; 



  let rawRefA = params.refA;

  let rawRefB = params.refB;

  let rawRefC = params.refC;



  const unetName = params.unetName || proj.globals.unetName || '';

  const workflowMode = params.workflowMode || proj.globals.workflowMode || 'latent_upscale';

  const isQwen21 = unetName.includes('2.1') || workflowMode === 'qwen_2_1';

  const is2511 = !isQwen21 && unetName.includes('2511');



  // If this is Further Edit, refA is the editSrcFile (Image 1)

  if (params.editSrcFile) {

    rawRefA = params.editSrcFile;

    rawRefB = params.refB || '';

    rawRefC = params.refC || '';

  } else {

    // Normal scene generation: Compact non-empty references to avoid empty gaps in Image 1/2/3

    const validRefs = [params.refA, params.refB, params.refC].filter(r => r && typeof r === 'string' && r.trim() !== '' && r.trim() !== 'empty_scene.png');

    if (validRefs.length > 0) {

      rawRefA = validRefs[0];

      rawRefB = validRefs[1] || '';

      rawRefC = validRefs[2] || '';

    } else {

      if (isQwen21) {

        // Pure Text-to-Image for empty/environmental scenes in Qwen 2.1: zero reference images passed

        rawRefA = '';

        rawRefB = '';

        rawRefC = '';

      } else {

        let defaultStyleRef = fallback;

        if (!defaultStyleRef || defaultStyleRef === 'empty_scene.png') {

          const candidateRef = (proj.refs || []).find(r => r && r !== 'empty_scene.png' && r !== 'empty_character.png');

          if (candidateRef) defaultStyleRef = candidateRef;

          else if (proj.charRefs) {

            const charKeys = Object.keys(proj.charRefs).filter(k => k && !k.startsWith('edit_src_') && k !== 'empty_scene.png');

            if (charKeys.length > 0) defaultStyleRef = `${charKeys[0]}.png`;

          }

        }

        rawRefA = defaultStyleRef || 'empty_scene.png';

        rawRefB = '';

        rawRefC = '';

      }

    }

  }



  const refA_val = rawRefA ? window.resolveRefImage(rawRefA) : "";

  const refB_val = rawRefB ? window.resolveRefImage(rawRefB) : "";

  const refC_val = rawRefC ? window.resolveRefImage(rawRefC) : "";



  let refCount = 1;

  const hasRefA = refA_val && refA_val !== "" && refA_val !== "empty_scene.png" && refA_val !== "empty_character.png";

  const hasRefB = refB_val && refB_val !== "" && refB_val !== "empty_scene.png" && refB_val !== "empty_character.png";

  const hasRefC = refC_val && refC_val !== "" && refC_val !== "empty_scene.png" && refC_val !== "empty_character.png";



  if (isQwen21) {

    if (hasRefC && hasRefB && hasRefA) refCount = 3;

    else if (hasRefB && hasRefA) refCount = 2;

    else if (hasRefA) refCount = 1;

    else refCount = 0; // Pure Text-to-Image

  } else {

    if (refC_val && refC_val !== "" && refC_val !== "empty_scene.png") refCount = 3; 

    else if (refB_val && refB_val !== "" && refB_val !== "empty_scene.png") refCount = 2;

  }

  

  let mapping;

  let baseWf;

  if (isQwen21) {

    mapping = MAPPING_QWEN21;

    if (refCount === 3) baseWf = WF_3_REF_QWEN21;

    else if (refCount === 2) baseWf = WF_2_REF_QWEN21;

    else if (refCount === 1) baseWf = WF_1_REF_QWEN21;

    else baseWf = WF_0_REF_QWEN21;

  } else if (is2511) {

    mapping = MAPPING_2511;

    baseWf = refCount === 3 ? WF_3_REF_2511 : (refCount === 2 ? WF_2_REF_2511 : WF_1_REF_2511);

  } else {

    mapping = MAPPING;

    baseWf = refCount === 3 ? WF_3_REF : (refCount === 2 ? WF_2_REF : WF_1_REF);

  }



  const wf = JSON.parse(JSON.stringify(baseWf)); 

  

  if (isQwen21) {

    wf[mapping.NODE_PROMPT].inputs.prompt = params.prompt || "";

    wf[mapping.NODE_NEG].inputs.negative_prompt = params.negative || "";

  } else if (is2511) {

    wf[mapping.NODE_PROMPT].inputs.prompt = params.prompt || "";

    wf[mapping.NODE_NEG].inputs.prompt = params.negative || "";

  } else {

    wf[mapping.NODE_PROMPT].inputs.value = params.prompt || "";

    wf[mapping.NODE_NEG].inputs.prompt = params.negative || "";

  }

  

  let seed = proj.globals.seedMode === 'fixed' ? parseInt(proj.globals.fixedSeed) : Math.floor(Math.random() * 9999999999);

  if(params.seed !== undefined) seed = params.seed;



  const isLightning = !isQwen21 && (unetName.includes('2509') || unetName.includes('2511') || (proj.globals.loraName && proj.globals.loraName.includes('Lightning')));

  const defaultSteps = isQwen21 ? 25 : (isLightning ? 4 : 20);

  const defaultCfg = (isQwen21 || isLightning) ? 1.0 : 3.5;



  const toolbarSteps = document.getElementById('quickSteps')?.value ? parseInt(document.getElementById('quickSteps').value, 10) : null;

  const toolbarCfg = document.getElementById('quickCfg')?.value ? parseFloat(document.getElementById('quickCfg').value) : null;



  const effGlobalSteps = (toolbarSteps && !isNaN(toolbarSteps) && toolbarSteps > 0) ? toolbarSteps : (proj.globals?.steps || defaultSteps);

  const effGlobalCfg = (toolbarCfg && !isNaN(toolbarCfg) && toolbarCfg > 0) ? toolbarCfg : (proj.globals?.cfg !== undefined && proj.globals?.cfg !== null ? proj.globals.cfg : defaultCfg);



  let stepsVal = parseInt(params.steps, 10);

  if (isNaN(stepsVal) || stepsVal <= 0) {

    stepsVal = effGlobalSteps;

  }



  let cfgVal = parseFloat(params.cfg);

  if (isNaN(cfgVal) || cfgVal <= 0) {

    cfgVal = effGlobalCfg;

  }



  // Model-specific safeguards for sampling parameters:

  if (isQwen21) {

    if (stepsVal < 10) stepsVal = defaultSteps;

  } else if (isLightning) {

    if (cfgVal > 2.0) cfgVal = 1.0;

    if (stepsVal > 8) stepsVal = 4;

  }



  wf[mapping.NODE_SAMPLER].inputs.seed = seed; 

  wf[mapping.NODE_SAMPLER].inputs.steps = stepsVal;

  wf[mapping.NODE_SAMPLER].inputs.cfg = cfgVal;

  wf[mapping.NODE_SAMPLER].inputs.sampler_name = params.sampler || proj.globals.sampler || "euler";



  const w = parseInt(params.w) || proj.globals.w || 1920;

  const h = parseInt(params.h) || proj.globals.h || 1080;



  if (isQwen21) {

    wf["459:451"].inputs.unet_name = (params.unetName && params.unetName !== 'none') ? params.unetName : 'qwen_image_2.1_int8_convrot.safetensors';

    wf["459:453"].inputs.clip_name = 'qwen3vl_8b_int8_convrot.safetensors';

    wf["459:454"].inputs.vae_name = 'qwen_image_2.1_vae_bf16.safetensors';

    

    // Set target dimensions in EmptyLatentImage

    if (wf["459:456"]) {

      wf["459:456"].inputs.width = w;

      wf["459:456"].inputs.height = h;

    }



    // ComfySwitchNode: switch = true routes EmptyLatentImage (w x h)

    // switch = false routes reference latent [459:474, 2] (for further edit / latent modification)

    if (wf["459:468"]) {

      if (params.editSrcFile || params.switchMode === false) {

        wf["459:468"].inputs.switch = false;

      } else {

        wf["459:468"].inputs.switch = true;

      }

    }



    if (refCount >= 1 && wf[mapping.NODE_REFA]) {

      wf[mapping.NODE_REFA].inputs.image = refA_val;

    }

    if (refCount >= 2 && wf[mapping.NODE_REFB]) {

      wf[mapping.NODE_REFB].inputs.image = refB_val || refA_val;

    }

    if (refCount >= 3 && wf[mapping.NODE_REFC]) {

      wf[mapping.NODE_REFC].inputs.image = refC_val || refB_val || refA_val;

    }

  } else if (is2511) {

    wf["237"].inputs.unet_name = (params.unetName && params.unetName !== 'none') ? params.unetName : 'qwen_image_edit_2511_bf16.safetensors';

    wf["233"].inputs.lora_name = (params.loraName && params.loraName !== 'none') ? params.loraName : 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors';

    wf["238"].inputs.clip_name = 'qwen_2.5_vl_7b_fp8_scaled.safetensors';

    wf["226"].inputs.vae_name = 'qwen_image_vae.safetensors';

    

    const mode = (params.workflowMode && params.workflowMode !== 'nano_banana_2_flash') ? params.workflowMode : ((proj.globals.workflowMode && proj.globals.workflowMode !== 'nano_banana_2_flash') ? proj.globals.workflowMode : 'latent_upscale');

    if (mode === 'latent_upscale') {

      if (wf["438"]) delete wf["438"];

      wf["247"].inputs.image = ["249", 0];

      wf["250"].inputs.width = w;

      wf["250"].inputs.height = h;

      wf["245"].inputs.latent_image = ["250", 0];

    } else {

      wf["438"] = {"inputs": {"target_width": w, "target_height": h, "padding_color": "white", "interpolation": "area", "image": ["249", 0]}, "class_type": "ResizeAndPadImage", "_meta": {"title": "ResizeAndPadImage"}};

      if (wf["250"]) delete wf["250"];

      wf["247"].inputs.image = ["438", 0];

      wf["245"].inputs.latent_image = ["236", 0];

    }

    wf[mapping.NODE_REFA].inputs.image = refA_val;

    if (refCount >= 2) wf[mapping.NODE_REFB].inputs.image = refB_val || refA_val; else delete wf[mapping.NODE_REFB]; 

    if (refCount >= 3) wf[mapping.NODE_REFC].inputs.image = refC_val || refB_val || refA_val; else delete wf[mapping.NODE_REFC]; 

  } else {

    const rawUnet = (params.unetName && params.unetName !== 'none') ? params.unetName : ((proj.globals.unetName && proj.globals.unetName !== 'none') ? proj.globals.unetName : 'qwen_image_edit_2509_fp8_e4m3fn.safetensors');

    wf["433:37"].inputs.unet_name = rawUnet;

    const rawLora = (params.loraName && params.loraName !== 'none') ? params.loraName : ((proj.globals.loraName && proj.globals.loraName !== 'none') ? proj.globals.loraName : 'Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors');

    wf["433:89"].inputs.lora_name = rawLora;

    wf["433:38"].inputs.clip_name = 'qwen_2.5_vl_7b_fp8_scaled.safetensors';

    wf["433:39"].inputs.vae_name = 'qwen_image_vae.safetensors';

    

    const mode = (params.workflowMode && params.workflowMode !== 'nano_banana_2_flash') ? params.workflowMode : ((proj.globals.workflowMode && proj.globals.workflowMode !== 'nano_banana_2_flash') ? proj.globals.workflowMode : 'latent_upscale');

    if (mode === 'latent_upscale') {

      if (wf["438"]) delete wf["438"];

      wf["433:117"].inputs.image = ["78", 0];

      wf["439"].inputs.width = w;

      wf["439"].inputs.height = h;

      wf["433:3"].inputs.latent_image = ["439", 0];

    } else {

      if (wf["439"]) delete wf["439"];

      wf["438"].inputs.target_width = w;

      wf["438"].inputs.target_height = h;

      wf["433:117"].inputs.image = ["438", 0];

      wf["433:3"].inputs.latent_image = ["433:88", 0];

    }

    wf[mapping.NODE_REFA].inputs.image = refA_val;

    if (refCount >= 2) wf[mapping.NODE_REFB].inputs.image = refB_val || refA_val; else delete wf[mapping.NODE_REFB]; 

    if (refCount >= 3) wf[mapping.NODE_REFC].inputs.image = refC_val || refB_val || refA_val; else delete wf[mapping.NODE_REFC]; 

  }

  

  wf[mapping.NODE_SAVE].inputs.filename_prefix = params.prefix || `Scene_${params.sceneId}`;

  

  return { workflow: wf, seedUsed: seed, mode: refCount === 0 ? '0 REF (T2I)' : `${refCount} REF` };

}

window.buildWorkflow = buildWorkflow;



function getOutput(sceneId) { 

    const proj = typeof window.getProj === 'function' ? window.getProj() : null;

    if (!proj || !proj.outputs) return null;

    const cleanId = String(sceneId).replace(/^S/i, '');

    return proj.outputs.find(o => o && (o.sceneId === sceneId || String(o.sceneId).replace(/^S/i, '') === cleanId)); 

}

window.getOutput = getOutput;



function getMainVariant(out) { 

    if (!out || !out.variations || out.variations.length === 0) return null;

    let main = out.variations.find(v => v.id === out.mainId);

    // Jei esamas mainId rodo į nepavykusią (error) arba tuščią variaciją, ieškome paskutinės sėkmingos

    if (!main || main.status === 'error' || (!main.url && main.status !== 'queued' && main.status !== 'processing')) {

        const lastDone = out.variations.slice().reverse().find(v => v.status === 'done' && v.url && v.url.trim() !== '');

        if (lastDone) return lastDone;

        const inProgress = out.variations.slice().reverse().find(v => (v.status === 'queued' || v.status === 'processing') && (v.tempUrl || v.url));

        if (inProgress) return inProgress;

    }

    return main || out.variations[out.variations.length - 1]; 

}

window.getMainVariant = getMainVariant;



window.isKineticTextScene = function(sc) {

    if (!sc) return false;

    // Explicit flags

    if (sc.isKinetic || sc.is_kinetic || sc.type === 'kinetic' || sc.type === 'text_writer') return true;



    // Check proj.kineticScenes

    const proj = typeof window.getProj === 'function' ? window.getProj() : null;

    if (proj && proj.kineticScenes) {

        const scNum = parseInt(String(sc.id).replace(/\D/g, ''), 10);

        const kSc = proj.kineticScenes.find(k => {

            if (String(k.id) === String(sc.id) || String(k.id).toLowerCase() === String(sc.id).toLowerCase()) return true;

            const kNum = parseInt(String(k.id).replace(/\D/g, ''), 10);

            return !isNaN(scNum) && !isNaN(kNum) && scNum === kNum;

        });

        if (kSc && (kSc.isCustom || kSc.isKinetic || kSc.enabled || sc.isKinetic)) return true;

    }



    const p = (sc.prompt || '').toLowerCase();

    const t = (sc.text || '').trim().toLowerCase();

    

    if (p.includes('kinetic typography') || p.includes('pure black background') || p.includes('pitch-black screen') || p.includes('solid black screen') ||

        p.includes('solid black background') || 

        p.includes('charcoal-black background') || 

        p.includes('charcoal black background') || 

        p.includes('black background, no texture') || 

        p.includes('white sans-serif text') || 

        p.includes('white sans-serif typography') || 

        p.includes('title card') || 

        p.includes('chapter card') || 

        p.includes('kinetic text') ||

        (p.includes('first line:') && p.includes('second line:')) ||

        t.startsWith('chapter ') || 

        t.startsWith('[chapter')) {

        return true;

    }

    return false;

};



window.openInKineticWriter = function(sceneId) {

    if (typeof window.openKineticWriterModal === 'function') {

        window.openKineticWriterModal(sceneId);

    } else {

        const modal = document.getElementById('modalKineticWriter');

        if (modal) {

            modal.classList.add('show');

            if (typeof window.renderKineticUI === 'function') window.renderKineticUI();

            if (typeof window.openKineticSceneById === 'function') window.openKineticSceneById(sceneId);

        }

    }

};



window.doGenerate = async function(sceneId, overrideParams = null, extraMeta = {}, priority = 1, silent = false) {

  const proj = window.getProj();

  const cleanId = String(sceneId).replace(/^S/i, '');

  const sc = proj.scenes.find(s => s && (s.id === sceneId || String(s.id) === String(sceneId) || String(s.id).replace(/^S/i, '') === cleanId)); 

  if(!sc) return;

  if (window.isGlobalDemoMode && window.isGlobalDemoMode()) {
      let out = getOutput(sceneId);
      if(!out) {
          out = { sceneId, params: { ...sc }, variations: [], mainId: null, generating: true };
          proj.outputs.push(out);
      } else {
          out.generating = true;
      }
      
      const varId = "var_sc_" + cleanId + "_" + Date.now();
      const prevDone = (out.variations || []).find(v => v.status === 'done' && v.url);
      const placeholderVar = {
          id: varId,
          type: "image",
          status: "processing",
          url: "",
          tempUrl: prevDone ? prevDone.url : "",
          createdAt: new Date().toISOString()
      };
      if (!out.variations) out.variations = [];
      out.variations.unshift(placeholderVar);
      out.mainId = varId;
      out.generating = true;
      
      if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images'); 
      else if (typeof window.renderImages === 'function') window.renderImages();
      
      const demoSceneMap = {
          "1": "s1_09a45efa.jpg", "2": "s2_3fdc3996.jpg", "3": "s3_4c67576d.jpg", "4": "s4_5f890927.jpg",
          "5": "s5_c0371cfb.jpg", "6": "s6_bb31523e.jpg", "7": "s7_fa027050.jpg", "8": "s8_84e8e67b.jpg",
          "9": "s9_ce1ad82e.jpg", "10": "s10_1297e609.jpg", "11": "s11_e3eeadce.jpg", "12": "s12_5e94c8fd.jpg",
          "13": "s13_e0e73488.jpg", "14": "s14_a59da841.jpg", "15": "s15_ef924e8d.jpg", "16": "s16_213773a6.jpg",
          "17": "s17_bda6e53b.jpg", "18": "s18_c3e71728.jpg"
      };
      
      const targetFile = demoSceneMap[cleanId] || "s1_09a45efa.jpg";
      
      const scSteps = [
          { pct: 15, text: `⚡ Gen: 15% [5/30] [GPU 1]` },
          { pct: 36, text: `⚡ Gen: 36% [11/30] [GPU 1]` },
          { pct: 58, text: `⚡ Gen: 58% [17/30] [GPU 1]` },
          { pct: 76, text: `⚡ Gen: 76% [23/30] [GPU 1]` },
          { pct: 90, text: `⚡ Gen: 90% [27/30] [GPU 1]` },
          { pct: 98, text: `⚡ VAE Decode (98%)` },
          { pct: 100, text: `✅ Done 100%` }
      ];
      
      for (const st of scSteps) {
          const fillEl = document.getElementById(`prog-fill-${varId}`) ||
                         document.querySelector(`[data-scene-id="${sceneId}"] .card-prog-fill`) ||
                         document.querySelector(`[data-scene-id="${cleanId}"] .card-prog-fill`);
          const textEl = document.getElementById(`prog-text-${varId}`) ||
                         document.querySelector(`[data-scene-id="${sceneId}"] .card-prog-text`) ||
                         document.querySelector(`[data-scene-id="${cleanId}"] .card-prog-text`);
          if (fillEl) fillEl.style.width = `${st.pct}%`;
          if (textEl) textEl.textContent = st.text;
          await new Promise(r => setTimeout(r, 260));
      }
      
      placeholderVar.status = "done";
      placeholderVar.type = "image";
      placeholderVar.url = `/vault/${targetFile}`;
      placeholderVar.file = targetFile;
      placeholderVar.params = { ...(sc || {}) };
      out.generating = false;
      out.mainId = varId;
      
      if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
      if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images'); 
      else if (typeof window.renderImages === 'function') window.renderImages();
      if (typeof window.renderWorkflow === 'function') window.renderWorkflow();
      return;
  }

  if (window.isKineticTextScene(sc)) {

      let outKin = getOutput(sceneId);

      if(!outKin) {

          outKin = { sceneId, params: { ...sc }, variations: [], mainId: null, generating: false, isKineticText: true };

          proj.outputs.push(outKin);

      }

      outKin.generating = false;

      outKin.isKineticText = true;

      if (!silent) toast("Kinetic Text Scene", `Scene #${sceneId} yra kinetinio teksto scena (praleista AI generacija).`, "info");

      if (!silent) {

          if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images'); else window.renderImages();

      }

      return;

  }

  

  let out = getOutput(sceneId);

  if(!out) {

    out = { sceneId, params: { ...sc, w:proj.globals.w, h:proj.globals.h, steps:proj.globals.steps, cfg:proj.globals.cfg, sampler:proj.globals.sampler }, variations: [], mainId: null, generating: true };

    proj.outputs.push(out);

  } else {

    out.generating = true;

  }

  

  try {

    // Svarbu: Prieš pradedant generuoti naują variaciją, paimame parametrus iš senos (Regenerate mygtuko atvejis)

    let baseParams = { ...(sc || {}), w: proj.globals.w, h: proj.globals.h, steps: proj.globals.steps, cfg: proj.globals.cfg, sampler: proj.globals.sampler, ...(out.params || {}) };

    if (extraMeta.sourceVarId) {

        const sourceVar = out.variations.find(v => v.id === extraMeta.sourceVarId);

        if (sourceVar && sourceVar.params) {

            baseParams = { ...baseParams, ...sourceVar.params };

        }

    }



    // Pritaikius overrides, priskiriame juos dabartiniam generavimui

    const currentParams = { ...baseParams, ...(overrideParams || {}) };

    

    // Dabartinės scenos kortelės tekstas ir refai turi aukštesnį prioritetą nei sena variacija (jei neperrašyta per overrideParams)

    if (sc) {

        if (!overrideParams?.prompt && sc.prompt) currentParams.prompt = sc.prompt;

        if (!overrideParams?.negative && sc.negative !== undefined) currentParams.negative = sc.negative;

        if ((!overrideParams || overrideParams.refA === undefined) && sc.refA !== undefined) currentParams.refA = sc.refA;

        if ((!overrideParams || overrideParams.refB === undefined) && sc.refB !== undefined) currentParams.refB = sc.refB;

        if ((!overrideParams || overrideParams.refC === undefined) && sc.refC !== undefined) currentParams.refC = sc.refC;

    }

    

    // Jei seedMode yra fixed, privalomai naudojame fixed seed.

    // Priešingu atveju, jei seedMode yra random ir seed nebuvo primygtinai perduotas per overrideParams (pvz., paprastas Generate arba Generate Missing paspaudimas), generuojame naują random seed.

    if (proj.globals.seedMode === 'fixed') {

        currentParams.seed = parseInt(proj.globals.fixedSeed) || 941027876668241;

    } else if (!overrideParams || overrideParams.seed === undefined) {

        delete currentParams.seed;

    }

    

    // UI Atnaujinimas prieš prasidedant skaičiavimams

    if (!silent) {

        if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images');

        else window.renderImages(); 

    }



    const quickModelVal = document.getElementById('quickModel')?.value || '';

    const activeModel = overrideParams?.modelPreset || sc?.modelPreset || currentParams.modelPreset || quickModelVal || proj.globals.modelPreset || proj.globals.workflowMode || '';

    const isNanoBanana = activeModel.includes('nano_banana');



    if (!isNanoBanana && activeModel && activeModel.includes('|')) {

        const parts = activeModel.split('|');

        if (!overrideParams?.workflowMode && !sc?.workflowMode) currentParams.workflowMode = parts[0];

        if (!overrideParams?.unetName && !sc?.unetName) currentParams.unetName = parts[1];

        if (!overrideParams?.loraName && !sc?.loraName) currentParams.loraName = parts[2] !== 'none' ? parts[2] : '';

    }



    // Sinchronizuojame steps ir cfg iš toolbar, jei nėra individualių parametrų

    const toolbarStepsVal = document.getElementById('quickSteps')?.value ? parseInt(document.getElementById('quickSteps').value, 10) : null;

    const toolbarCfgVal = document.getElementById('quickCfg')?.value ? parseFloat(document.getElementById('quickCfg').value) : null;

    if (overrideParams?.steps !== undefined) currentParams.steps = overrideParams.steps;

    else if (!currentParams.customSteps && toolbarStepsVal && !isNaN(toolbarStepsVal) && toolbarStepsVal > 0) currentParams.steps = toolbarStepsVal;



    if (overrideParams?.cfg !== undefined) currentParams.cfg = overrideParams.cfg;

    else if (!currentParams.customCfg && toolbarCfgVal && !isNaN(toolbarCfgVal) && toolbarCfgVal > 0) currentParams.cfg = toolbarCfgVal;



    if (isNanoBanana) {

        let tempOldUrl = "";

        const oldMain = getMainVariant(out);

        if (oldMain && oldMain.url) tempOldUrl = oldMain.url;



        const reqId = rId();

        const paramsSnapshot = JSON.parse(JSON.stringify(currentParams));

        const newVar = { id: reqId, status: "processing", url: "", tempUrl: tempOldUrl, createdAt: nowIso(), wfMode: "nano_banana_2_flash", seedUsed: 0, params: paramsSnapshot, rating: "unlisted", ...extraMeta };

        out.variations.push(newVar);

        out.mainId = reqId;

        out.generating = true;

        if (!silent) toast("Cloud Generating", `Generating scene ${sceneId} with Nano Banana 2 Flash...`, "info");

        window.saveCurrentProject();

        if (!silent) {

            if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images'); else window.renderImages();

        }



        try {

            const res = await fetch('/api/cloud/generate', {

                method: 'POST',

                headers: { 'Content-Type': 'application/json' },

                body: JSON.stringify({

                    projectId: state.currentProjectId,

                    sceneId: sceneId,

                    prompt: currentParams.prompt || sc?.prompt || '',

                    negativePrompt: currentParams.negative || '',

                    width: currentParams.w || proj.globals.w || 1920,

                    height: currentParams.h || proj.globals.h || 1080,

                    reqId: reqId

                })

            });

            const cloudData = await res.json();

            if (!res.ok || cloudData.status !== "success") throw new Error(cloudData.detail || cloudData.message || "Cloud generation failed");



            newVar.status = "done";

            newVar.url = cloudData.vaultUrl;

            out.generating = false;

            window.saveCurrentProject();

            if (!silent) toast("Done", `Scene ${sceneId} generated via Nano Banana!`, "success");

        } catch (cloudErr) {

            newVar.status = "error";

            out.generating = false;

            window.saveCurrentProject();

            toast("Cloud Error", cloudErr.message, "error");

        }



        if (!silent) {

            if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images'); else window.renderImages();

        }

        return;

    }



    const { workflow, seedUsed, mode } = buildWorkflow({ ...currentParams, sceneId });

    currentParams.seed = seedUsed; 

    const paramsSnapshot = JSON.parse(JSON.stringify(currentParams));



    if (!state.connected) {

        // DEMO SYNTHESIS MODE: Hub'as išjungtas

        await new Promise(resolve => setTimeout(resolve, 5));

        

        const mockUrl = window.mockImage ? window.mockImage(`SCENE ${sceneId}`, seedUsed, mode) : "";

        const newVar = { id: rId(), status: "done", url: mockUrl, createdAt: nowIso(), wfMode: mode, seedUsed: seedUsed, params: paramsSnapshot, rating: "unlisted", isDemo: true, ...extraMeta };

        out.variations.push(newVar); out.mainId = newVar.id; 

        

        if(!silent) toast("Mock Generated", `Scene ${sceneId} created.`, "success");

        out.generating = false; 

        window.saveCurrentProject(); 

        if(!silent) {

            if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images'); else window.renderImages();

        }

        return;

    }

    

    // SERVERIO REŽIMAS (Siunčiame Python Orkestratoriui)

    const res = await fetch('/api/queue/add', {

        method: 'POST', headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ priority, projectId: state.currentProjectId, sceneId, workflow })

    });

    const data = await res.json();

    if(data.status !== "success") throw new Error(data.message);

    

    // Išsaugome laikiną seną nuotrauką, kad galėtume rodyti blur filtrą UI

    let tempOldUrl = "";

    const oldMain = getMainVariant(out);

    if (oldMain && oldMain.url) tempOldUrl = oldMain.url;



    out.params = paramsSnapshot;

    const newVar = { id: data.reqId, status: "queued", url: "", tempUrl: tempOldUrl, createdAt: nowIso(), wfMode: mode, seedUsed: seedUsed, params: paramsSnapshot, rating: "unlisted", ...extraMeta };

    out.variations.push(newVar); out.mainId = data.reqId; 

    

    if(!silent) toast("Queued", `Scene ${sceneId} added to System Queue!`, "info");

    window.saveCurrentProject();

  } catch (err) { 

      toast("Error", err.message, "error"); 

      out.generating = false; 

  }

  

  if (!silent) {

      if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images'); else window.renderImages();

  }

}



// Nauja funkcija, skirta gražiai apdoroti mygtuko "Regenerate" paspaudimą iš HTML

window.doRegenerate = function(sceneId, sourceVarId) {

    const proj = window.getProj();

    const out = window.getOutput ? window.getOutput(sceneId) : null;

    let targetVar = null;

    if (out && out.variations && out.variations.length > 0) {

        targetVar = (sourceVarId ? out.variations.find(v => v.id === sourceVarId) : null)

                 || (window.getMainVariant ? window.getMainVariant(out) : out.variations[out.variations.length - 1]);

    }



    const isTargetVarImg = targetVar && targetVar.url && (
        targetVar.url.toLowerCase().endsWith('.jpg') ||
        targetVar.url.toLowerCase().endsWith('.jpeg') ||
        targetVar.url.toLowerCase().endsWith('.png') ||
        targetVar.url.toLowerCase().endsWith('.webp')
    );
    const isVideo = Boolean(
        targetVar && !isTargetVarImg && (
            targetVar.type === 'video' ||
            (targetVar.url && (targetVar.url.toLowerCase().endsWith('.mp4') || targetVar.url.toLowerCase().endsWith('.webm'))) ||
            (targetVar.wfMode && targetVar.wfMode.includes('I2V'))
        )
    );



    if (isVideo && typeof window.doRegenerateVideo === 'function') {

        window.doRegenerateVideo(sceneId, targetVar, 'scene');

        return;

    }



    const seed = proj.globals.seedMode === 'fixed' ? parseInt(proj.globals.fixedSeed) : Math.floor(Math.random() * 9999999999);

    window.doGenerate(sceneId, { seed: seed }, { sourceVarId: sourceVarId }, 1, false);

};



if($("#btnGenMissing")) {

    $("#btnGenMissing").addEventListener("click", async () => {

      const proj = window.getProj();

      const btn = $("#btnGenMissing");

      if (window.isGlobalDemoMode && window.isGlobalDemoMode()) {
          const toGen = (proj.scenes && proj.scenes.length) ? proj.scenes : [];
          if (!toGen.length) return (typeof toast === 'function' ? toast("Info", "No scenes available to generate.") : alert("No scenes to generate."));
          const origHtml = btn.innerHTML;
          btn.innerHTML = `<span class="pulse-text">⏳ Generating...</span>`;
          btn.disabled = true;
          for (const s of toGen) {
              await window.doGenerate(s.id, null, {}, 2, true);
          }
          btn.innerHTML = origHtml;
          btn.disabled = false;
          if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images'); 
          else window.renderImages();
          return;
      }


      

      const missing = proj.scenes.filter(s => { 

          const out = getOutput(s.id); 

          if (!out || out.variations.length === 0) return true; // Nėra visai

          

          const main = getMainVariant(out);

          if (main && main.isDemo && state.connected) return true; // Jei yra Demo vaizdas

          if (main && main.status === 'error') return true; // Jei paskutinis bandymas lūžo

          

          return false; // Jau sugeneruota

      });



      if(missing.length === 0) return toast("Done", "No missing outputs", "success");

      

      const activeModel = document.getElementById('quickModel')?.value || proj.globals.modelPreset || proj.globals.workflowMode || '';

      const isNanoBanana = activeModel.includes('nano_banana');

      const isBatch = document.getElementById('quickBatchMode')?.checked;



      if (isNanoBanana && isBatch) {

          toast("Cloud Batch (-50%)", `Siunčiama ${missing.length} kadrų į Google Cloud Batch (-50% kaina)...`, "info");

          const origHtml = btn.innerHTML;

          btn.innerHTML = `<span class="pulse-text">⏳ Batching (-50%)...</span>`;

          btn.disabled = true;



          const batchItems = [];

          for (const s of missing) {

              const out = getOutput(s.id);

              let tempOldUrl = "";

              const oldMain = getMainVariant(out);

              if (oldMain && oldMain.url) tempOldUrl = oldMain.url;

              const reqId = rId();

              const newVar = { id: reqId, status: "queued", url: "", tempUrl: tempOldUrl, createdAt: nowIso(), wfMode: "nano_banana_2_flash", seedUsed: 0, params: { prompt: s.prompt, negative: s.negative || '' }, rating: "unlisted" };

              out.variations.push(newVar);

              out.mainId = reqId;

              out.generating = true;

              batchItems.push({

                  reqId: reqId,

                  sceneId: s.id,

                  prompt: s.prompt,

                  negativePrompt: s.negative || "",

                  width: proj.globals.w || 1920,

                  height: proj.globals.h || 1080

              });

          }

          window.saveCurrentProject();

          if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images'); 

          else window.renderImages();



          try {

              const res = await fetch('/api/cloud/batch/submit', {

                  method: 'POST',

                  headers: { 'Content-Type': 'application/json' },

                  body: JSON.stringify({

                      projectId: state.currentProjectId,

                      items: batchItems

                  })

              });

              const resJson = await res.json();

              if (resJson.status === "success") {

                  toast("Batch Started", `Pateikta ${batchItems.length} kadrų į Cloud Batch (-50% nuolaida)!`, "success");

              } else {

                  throw new Error(resJson.message || "Batch submission failed");

              }

          } catch(err) {

              toast("Batch Error", err.message, "error");

          } finally {

              btn.innerHTML = origHtml;

              btn.disabled = false;

          }

          return;

      }



      toast("Mass Generation", `Queueing ${missing.length} scenes...`, "info");

      

      const origHtml = btn.innerHTML;

      btn.innerHTML = `<span class="pulse-text">⏳ Generating...</span>`;

      btn.disabled = true;



      // Siunčiame vieną po kito (tyliuoju režimu)

      for(const s of missing) {

          await window.doGenerate(s.id, null, {}, 2, true); 

          await new Promise(r => setTimeout(r, 10)); // Leidžiame naršyklei atsikvėpti

      }

      

      btn.innerHTML = origHtml;

      btn.disabled = false;



      if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images'); 

      else window.renderImages();



      toast("Complete", "Missing generation process finished.", "success");

    });

}



// ============================================================================

// 8. RENDER FUNCTIONS

// ============================================================================

window.sendScenesToLLM = function() {

    const proj = window.getProj();

    if(proj.scenes.length === 0) return toast("Error", "No scenes available", "error");

    const exportData = proj.scenes.map(s => {

        return { id: s.id, prompt: s.prompt, text: proj.sceneTextById[s.id] || "", refA: s.refA, refB: s.refB, refC: s.refC };

    });

    $("#llmJsonOutput").value = JSON.stringify({ scenes: exportData }, null, 2);

    

    $$('.nav-item').forEach(x=>x.classList.remove('active'));

    document.querySelector('.nav-item[data-tab="script"]').classList.add('active');

    $$('.content').forEach(x=>x.classList.add('hidden')); $("#tab-script").classList.remove('hidden');

    

    $("#btnCommitLlm").disabled = false; state.currentLlmTask = 'B';

    toast("Moved", "Scenes moved back to LLM tab for editing.", "success");

};



window.renderWorkflow = function() {

  const proj = window.getProj();

  $("#gW").value = proj.globals.w; $("#gH").value = proj.globals.h;

  $("#gSteps").value = proj.globals.steps; $("#gCfg").value = proj.globals.cfg;

  $("#gSampler").value = proj.globals.sampler; $("#gSeedMode").value = proj.globals.seedMode;

  $("#gFixedSeed").value = proj.globals.fixedSeed;

  $("#gFixedSeedDiv").classList.toggle("hidden", proj.globals.seedMode !== 'fixed');

  

  if ($("#gWfMode")) $("#gWfMode").value = proj.globals.workflowMode || 'latent_upscale';

  if ($("#gUnetName")) $("#gUnetName").value = proj.globals.unetName || 'qwen_image_edit_2511_bf16.safetensors';

  if ($("#gLoraName")) $("#gLoraName").value = proj.globals.loraName || 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors';



  const presetSelect = document.getElementById('gModelPreset');

  if (presetSelect) {

    const matchingVal = `${proj.globals.workflowMode}|${proj.globals.unetName}|${proj.globals.loraName}`;

    let matched = false;

    for (let i = 0; i < presetSelect.options.length; i++) {

        if (presetSelect.options[i].value === matchingVal) {

            presetSelect.value = matchingVal;

            matched = true;

            break;

        }

    }

    if (!matched) {

        presetSelect.value = 'custom';

    }

    const customModelDiv = document.getElementById('gCustomModelDiv');

    if (customModelDiv) {

        customModelDiv.classList.toggle('hidden', presetSelect.value !== 'custom');

    }

  }

  

  const headerDiv = $("#sceneCount")?.parentNode?.parentNode;

  if(headerDiv && !$("#btnBackToLLM")) {

      const btn = document.createElement("button");

      btn.id = "btnBackToLLM"; btn.className = "btn warn text-xs"; btn.textContent = "⬅️ Back to LLM";

      btn.onclick = window.sendScenesToLLM;

      const flexDiv = headerDiv.querySelector('.flex');

      if(flexDiv) flexDiv.prepend(btn);

  }

  

  const tbody = $("#scenesTbody"); 

  if($("#sceneCount")) $("#sceneCount").textContent = `(${proj.scenes.length})`;

  

  if(proj.scenes.length === 0) {

      if(tbody) tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding:40px">No scenes loaded. Load JSON or click <strong>🎯 Demo Showcase</strong> in topbar to begin.</td></tr>`;

      return;

  }

  

  if(tbody) {

      tbody.innerHTML = proj.scenes.map(s => {

        const isKinetic = typeof window.isKineticTextScene === 'function' && window.isKineticTextScene(s);

        const sStatus = s.status || 'ready';

        const bd = isKinetic ? 'badge' : (sStatus === 'ready' ? 'badge ready' : 'badge warn');

        const statusText = isKinetic ? '✨ TITLE CARD' : sStatus.toUpperCase();

        const uiText = proj.sceneTextById[s.id] || s.text || '';

        return `<tr>

          <td class="mono font-bold">${escapeHtml(s.id)}</td>

          <td>

            <div class="font-bold text-xs mb-1" style="color:var(--accent)">P: ${escapeHtml(s.prompt).substring(0,80)}${s.prompt && s.prompt.length>80?'...':''}</div>

            ${(s.speaker || s.text) ? `<div class="text-xs font-bold" style="color:#38bdf8; margin-bottom:2px;">🗣️ ${s.speaker ? `[${escapeHtml(s.speaker)}] ` : ''}${escapeHtml(s.text||'').substring(0,60)}</div>` : ''}

            ${s.sfx_prompt ? `<div class="text-xs" style="color:#c084fc; margin-bottom:2px;">🔊 SFX: ${escapeHtml(s.sfx_prompt).substring(0,60)}</div>` : ''}

            <div class="text-xs text-muted" title="${escapeHtml(uiText)}">T: ${escapeHtml(uiText).substring(0,80)}${uiText && uiText.length>80?'...':'-'}</div>

          </td>

          <td class="text-xs mono text-muted">${isKinetic ? '<span style="color:#00ffcc; font-weight:700;">Kinetic Typo</span>' : `A: ${escapeHtml(s.refA||'-')}<br/>B: ${escapeHtml(s.refB||'-')}<br/>C: ${escapeHtml(s.refC||'-')}`}</td>

          <td>

            <span class="badge mode">${isKinetic ? 'Text Writer' : s.mode}</span> 

            <span class="${bd}" style="${isKinetic ? 'background: rgba(0, 255, 204, 0.15); color: #00ffcc; border: 1px solid rgba(0, 255, 204, 0.3); font-weight:750;' : ''}">${statusText}</span>

          </td>

          <td>

            <div class="flex" style="gap: 4px; align-items: center;">

              <button class="btn text-xs" onclick="window.openEdit('${s.id}')" title="Redaguoti scenos nustatymus">Edit</button>

              <button class="btn text-xs" style="background: rgba(0, 255, 204, 0.12); color: #00ffcc; border: 1px solid rgba(0, 255, 204, 0.3); font-weight:700;" onclick="if(typeof window.openKineticWriterModal==='function') window.openKineticWriterModal('${s.id}');" title="Redaguoti kinetinį titrą šiai scenai">✨ Titras</button>

              ${isKinetic ? `

              <button class="btn text-xs" style="font-weight:700; font-size:10px; padding: 2px 6px; background: ${s.kineticHideText ? 'rgba(234, 179, 8, 0.15)' : 'rgba(0, 255, 204, 0.15)'}; color: ${s.kineticHideText ? '#fde047' : '#00ffcc'}; border: 1px solid ${s.kineticHideText ? 'rgba(234, 179, 8, 0.4)' : 'rgba(0, 255, 204, 0.3)'};" onclick="if(typeof window.toggleKineticSceneMode==='function') window.toggleKineticSceneMode('${s.id}');" title="Perjungti: Tekstas + Fonas <-> Tik Vaizdas">

                ${s.kineticHideText ? '🖼️ Visual Only' : '🎬 Tekstas'}

              </button>` : ''}

            </div>

          </td>

        </tr>`;

      }).join('');

  }

}



window.updateImagesProgressStats = function() {

  const proj = typeof window.getProj === 'function' ? window.getProj() : null;

  if (!proj) return;

  const scenes = proj.scenes || [];

  const totalCount = scenes.length;



  let doneCount = 0;

  let missingCount = 0;



  scenes.forEach(sc => {

    const out = getOutput(sc.id);

    const isDone = (out && out.variations && out.variations.some(v => v.status === 'done' || v.url)) || 

                   (typeof window.isKineticTextScene === 'function' && window.isKineticTextScene(sc));

    if (isDone) doneCount++;

    else missingCount++;

  });



  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;



  const filledEl = document.getElementById("imagesFilledCount");

  const barEl = document.getElementById("imagesProgressBar");

  const pctEl = document.getElementById("imagesPercentLabel");

  const navBadgeEl = document.getElementById("navImagesBadge");

  const filterEl = document.getElementById("imgFilter");

  const progressBox = document.getElementById("imagesProgressBox");



  if (filledEl) filledEl.textContent = `${doneCount} / ${totalCount}`;

  if (barEl) {

    barEl.style.width = `${pct}%`;

    if (pct === 100) {

      barEl.style.background = 'linear-gradient(90deg, #10b981, #2ecc71)';

    } else if (pct >= 50) {

      barEl.style.background = 'linear-gradient(90deg, #38bdf8, #00ffcc)';

    } else {

      barEl.style.background = 'linear-gradient(90deg, #f59e0b, #38bdf8)';

    }

  }

  if (pctEl) {

    pctEl.textContent = `${pct}%`;

    pctEl.className = pct === 100 ? 'badge good' : (pct > 0 ? 'badge accent' : 'badge');

  }

  if (navBadgeEl) {

    navBadgeEl.textContent = `${doneCount}/${totalCount}`;

    navBadgeEl.style.color = (pct === 100 && totalCount > 0) ? '#2ecc71' : (doneCount > 0 ? '#38bdf8' : 'var(--muted)');

    navBadgeEl.style.background = (pct === 100 && totalCount > 0) ? 'rgba(46, 204, 113, 0.15)' : (doneCount > 0 ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 255, 255, 0.08)');

  }



  if (filterEl && filterEl.options && filterEl.options.length >= 3) {

    filterEl.options[0].text = `All Scenes (${totalCount})`;

    filterEl.options[1].text = `Missing (${missingCount})`;

    filterEl.options[2].text = `Generated (${doneCount})`;

  }



  if (progressBox && !progressBox._hasClickListener) {

    progressBox._hasClickListener = true;

    progressBox.onclick = () => {

      const fEl = document.getElementById("imgFilter");

      if (!fEl) return;

      if (missingCount > 0 && fEl.value !== 'missing') {

        fEl.value = 'missing';

      } else {

        fEl.value = 'all';

      }

      if (typeof window.renderImages === 'function') window.renderImages();

    };

  }

};



window.renderImages = function() {

  if (typeof window.syncQuickSettings === 'function') window.syncQuickSettings();

  if (typeof window.updateImagesProgressStats === 'function') window.updateImagesProgressStats();

  const proj = window.getProj();

  const grid = $("#imagesGrid"); if(!grid) return;

  const filter = $("#imgFilter").value; const q = $("#imgSearch").value.toLowerCase();

  let html = '';

  

  proj.scenes.forEach(sc => {

    const out = getOutput(sc.id);

    

    // Griežtesnis filtravimas: jei nuotrauka tik eilėje, nerodome jos prie "done"

    const isDone = (out && out.variations && out.variations.some(v => v.status === 'done' || v.url)) || 

                   (typeof window.isKineticTextScene === 'function' && window.isKineticTextScene(sc));

    if(filter === 'missing' && isDone) return;

    if(filter === 'done' && !isDone) return;

    if(q && !sc.id.toLowerCase().includes(q) && !(sc.prompt||'').toLowerCase().includes(q)) return;



    const uiText = proj.sceneTextById[sc.id] || sc.text || '';



    // Kinetinio teksto scena (Visada atvaizduojame kaip Kinetinį Titrą!)

    if (window.isKineticTextScene(sc)) {

      const kSc = (proj.kineticScenes || []).find(k => 

        String(k.id) === String(sc.id) || 

        String(k.id).toLowerCase() === String(sc.id).toLowerCase() || 

        parseInt(String(k.id).replace(/\D/g, ''), 10) === parseInt(String(sc.id).replace(/\D/g, ''), 10)

      );

      let l1 = (kSc && kSc.text1) ? kSc.text1 : "";

      let l2 = (kSc && kSc.text2 !== undefined) ? kSc.text2 : "";

      if (!l1) {

        const m1 = sc.prompt ? sc.prompt.match(/First line:\s*['"](.*?)['"]/i) : null;

        const m2 = sc.prompt ? sc.prompt.match(/Second line:\s*['"](.*?)['"]/i) : null;

        if (m1 && m1[1]) l1 = m1[1];

        if (m2 && m2[1]) l2 = m2[1];

      }

      if (!l1) {

        let parts = (uiText || sc.prompt || '').split(/:\s*|\n| - /);

        l1 = parts[0] || sc.text || sc.id;

        l2 = parts.slice(1).join(' ') || "";

      }



      const bgMedia = sc.bgMedia || (kSc && kSc.bgMedia) || (out && out.variations && out.variations.some(v => v.status === 'done' || v.url) ? getMainVariant(out)?.url : '') || '';

      const isTextHidden = Boolean(sc.kineticHideText || (kSc && kSc.hideText));

      const bgOpacity = (kSc && kSc.bgMediaOpacity !== undefined) ? kSc.bgMediaOpacity : 1.0;

      const bgBlur = (kSc && kSc.bgMediaBlur !== undefined) ? kSc.bgMediaBlur : 0;



      html += `<div class="card flex-col" style="border: 1.5px dashed rgba(0, 255, 204, 0.45); background: #06060d; cursor: pointer; position: relative;" ondblclick="if(event.target.tagName !== 'BUTTON' && !event.target.closest('button')) window.openViewer('${sc.id}')">

        <div class="card-img-wrap" style="background: radial-gradient(circle at center, #151525 0%, #050508 100%); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16px; text-align: center; position: relative; overflow: hidden; min-height: 180px;" ondblclick="if(event.target.tagName !== 'BUTTON' && !event.target.closest('button')) window.openViewer('${sc.id}')">

          ${bgMedia ? `

            <img src="${bgMedia}" alt="" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: ${isTextHidden ? 1.0 : Math.max(0.15, bgOpacity)}; filter: ${isTextHidden ? 'none' : `blur(${bgBlur}px)`}; z-index: 1; pointer-events: none;" />

            ${!isTextHidden ? `<div style="position: absolute; inset: 0; background: rgba(0,0,0,0.45); z-index: 2; pointer-events: none;"></div>` : ''}

          ` : ''}

          <div class="badge" style="position:absolute; top:8px; left:8px; z-index: 3; background: rgba(0, 255, 204, 0.2); color: #00ffcc; border: 1px solid rgba(0, 255, 204, 0.5); font-size: 9px; font-weight: 700; backdrop-filter: blur(4px);">🎬 KINETIC TEXT SCENE</div>

          <button class="btn icon text-xs" style="position:absolute; top:8px; right:8px; z-index: 3; padding: 2px 6px; background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.2);" onclick="window.openViewer('${sc.id}')" title="Fullscreen">⛶</button>

          

          ${!isTextHidden ? `

            <div style="position: relative; z-index: 3; max-width: 90%;">

              <div style="font-weight: 800; font-size: 15px; color: #ffffff; text-shadow: 0 0 12px rgba(0,0,0,0.9), 0 0 16px rgba(0,255,204,0.35); margin-top: 15px; line-height: 1.25;">${escapeHtml(l1)}</div>

              ${l2 ? `<div style="font-size: 11px; color: #d1d5db; text-shadow: 0 0 8px rgba(0,0,0,0.9); margin-top: 4px;">${escapeHtml(l2)}</div>` : ''}

            </div>

          ` : `

            <div style="position: relative; z-index: 3; margin-top: 15px;">

              <span class="badge" style="background: rgba(0, 0, 0, 0.75); color: #00ffcc; border: 1px solid rgba(0, 255, 204, 0.4); font-size: 10px; padding: 4px 10px; font-weight: 700; backdrop-filter: blur(4px);">🖼️ VISUAL ONLY (Text Hidden)</span>

            </div>

          `}



          <div style="display:flex; flex-wrap: wrap; justify-content: center; gap:6px; margin-top: 14px; position: relative; z-index: 3;">

            <button class="btn primary text-xs" style="font-weight: bold; border-radius: 20px;" onclick="window.openInKineticWriter('${sc.id}')">

              🎬 Open in Text Writer

            </button>

            ${bgMedia ? `

              <button class="btn text-xs" style="font-weight: bold; border-radius: 20px; ${isTextHidden ? 'background: rgba(0, 255, 204, 0.2); color: #00ffcc; border: 1px solid rgba(0, 255, 204, 0.5);' : 'background: rgba(255, 255, 255, 0.1); color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.2);'}" onclick="window.toggleKineticSceneMode('${sc.id}'); event.stopPropagation();" title="${isTextHidden ? 'Toggle to Text + Background' : 'Toggle to Visual Only'}">

                ${isTextHidden ? '🖼️ Visual Only' : '🎬 Text + Background'}

              </button>

            ` : ''}

            <button class="btn icon text-xs" style="border-radius: 20px; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.2);" onclick="window.openViewer('${sc.id}')" title="Fullscreen">⛶</button>

          </div>

        </div>

        <div class="card-body">

          <div class="flex justify-between items-center mb-1">

            <strong class="text-sm">${sc.id}</strong>

            <div style="display: flex; gap: 4px; align-items: center;">

              ${bgMedia ? `<span class="badge" style="font-size: 8.5px; background: rgba(0, 255, 204, 0.12); color: #00ffcc; border: 1px solid rgba(0, 255, 204, 0.3);">${isTextHidden ? 'BACKGROUND ONLY' : 'BACKGROUND + TEXT'}</span>` : ''}

              <span class="badge mode" style="font-size: 9px; background: rgba(255,255,255,0.1);">SKIPPED AI GEN</span>

            </div>

          </div>

          <div class="text-xs text-muted" title="${escapeHtml(uiText||sc.prompt)}" style="display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${escapeHtml(uiText||sc.prompt)}</div>

        </div>

      </div>`;

      return;

    }



    // Tuščios (niekada negeneruotos) scenos

    if (!out || out.variations.length === 0) {

      const hasDlg = sc.speaker || sc.h3_prompt;

      const hasSfx = sc.sfx_prompt;

      html += `<div class="card flex-col" ondblclick="if(event.target.tagName !== 'BUTTON' && !event.target.closest('button')) window.openViewer('${sc.id}')"><div class="card-img-wrap" style="background:var(--panel)"><div class="placeholder-view">

            <div class="mono text-muted mb-2">#${sc.id}</div>

            ${hasDlg ? `<span class="badge" style="background:rgba(56,189,248,0.2);color:#38bdf8;border:1px solid rgba(56,189,248,0.4);font-size:9.5px;margin-bottom:4px;font-weight:700;">🗣️ ${escapeHtml(sc.speaker ? `SPEAKER: ${sc.speaker}` : 'LIPSYNC')}</span>` : ''}

            ${hasSfx ? `<span class="badge" style="background:rgba(168,85,247,0.2);color:#c084fc;border:1px solid rgba(168,85,247,0.4);font-size:9.5px;margin-bottom:6px;font-weight:700;">🔊 SFX</span>` : ''}

            ${out?.generating ? `<div class="mono text-accent font-bold">⏳ Queued...</div>` : `<button class="btn primary" onclick="window.doGenerate('${sc.id}')">Generate</button>`}

          </div></div><div class="card-body"><div class="text-xs font-bold text-muted">${sc.id}</div>

          ${sc.speaker || sc.text ? `<div class="text-xs" style="color:#38bdf8; margin-top:4px;">🗣️ ${sc.speaker ? `<strong>${escapeHtml(sc.speaker)}:</strong> ` : ''}${escapeHtml(sc.text || '')}</div>` : ''}

          <div class="text-xs text-muted mt-2" title="${escapeHtml(uiText)}" style="display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${escapeHtml(uiText||'-')}</div>

          </div></div>`;

      return;

    }



    const main = getMainVariant(out) || (out.variations && out.variations[0]) || {}; 

    const vCount = out.variations ? out.variations.length : 0;

    const activeVar = (out.variations || []).find(v => v.status === 'processing' || v.status === 'queued');

    const activeReqId = (activeVar && activeVar.id) || (main && main.id) || sc.id; 

    const p = (main && main.params) || (out && out.params) || sc || {};

    const globals = proj.globals || { w: 1920, h: 1080, steps: 4, cfg: 1.0 };

    

    // Nustatome, ką rodome fone, jei dabar generuojama

    let displayUrl = main.url || sc.bgMedia || "";

    let isBlurry = false;

    

    if (main.status === 'queued' || main.status === 'processing') {

        if (main.tempUrl && main.tempUrl !== "") {

            displayUrl = main.tempUrl;

            isBlurry = true; 

        } else {

            // Saugiklis: jei tempUrl nėra, ieškome ankstesnės sėkmingos variacijos URL, kad nebūtų juodas tuščias fonas

            const prevDone = out.variations ? out.variations.slice().reverse().find(v => v.id !== main.id && v.status === 'done' && v.url) : null;

            if (prevDone && prevDone.url) {

                displayUrl = prevDone.url;

                isBlurry = true; 

            } else {

                displayUrl = ""; 

            }

        }

    }



    const isImageFile = Boolean(displayUrl && (
        displayUrl.toLowerCase().endsWith('.jpg') ||
        displayUrl.toLowerCase().endsWith('.jpeg') ||
        displayUrl.toLowerCase().endsWith('.png') ||
        displayUrl.toLowerCase().endsWith('.webp')
    ));
    const isVideoFile = Boolean(displayUrl && (
        displayUrl.toLowerCase().endsWith('.mp4') ||
        displayUrl.toLowerCase().endsWith('.webm')
    ));
    const isVideoMedia = Boolean(displayUrl && !isImageFile && (isVideoFile || (main && main.type === 'video')));



    // Timeline duration & timestamp calculation

    const tlItem = (proj.timeline || []).find(t => String(t.id) === String(sc.id) || String(t.id) === String(sc.id).replace(/^S/i, ''));

    let timeBadge = '';

    if (tlItem && (tlItem.dur || tlItem.duration)) {

        const dVal = parseFloat(tlItem.dur || tlItem.duration);

        const hasRange = (tlItem.start !== null && tlItem.start !== undefined && tlItem.end !== null && tlItem.end !== undefined);

        const rangeText = hasRange ? `${parseFloat(tlItem.start).toFixed(1)}s - ${parseFloat(tlItem.end).toFixed(1)}s` : '';

        timeBadge = `<span class="badge" title="${rangeText ? 'Laiko juosta: ' + rangeText : 'Numatyta trukmė'}" style="background: rgba(0, 255, 204, 0.12); color: #00ffcc; border: 1px solid rgba(0, 255, 204, 0.35); font-weight: 800; font-size: 11px; padding: 2px 7px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;">⏱️ ${dVal.toFixed(1)}s ${rangeText ? `<span style="opacity:0.75; font-size:9.5px; font-weight:600;">(${rangeText})</span>` : ''}</span>`;

    } else if (sc.duration) {

        timeBadge = `<span class="badge" title="Scenos trukmė" style="background: rgba(255, 255, 255, 0.06); color: var(--text); border: 1px solid var(--border); font-size: 10.5px; padding: 2px 6px;">⏱️ ${parseFloat(sc.duration).toFixed(1)}s</span>`;

    }



    const isFlipped = Boolean(

        (main && (main.flipH === true || main.params?.flipH === true)) || 

        (out && (out.flipH === true || out.params?.flipH === true)) || 

        (sc && (sc.flipH === true || sc.params?.flipH === true))

    );

    const flipStyle = isFlipped ? 'transform:scaleX(-1);' : '';



    html += `<div class="card ${out.generating ? 'generating' : ''}" data-scene-id="${sc.id}" ondblclick="if(event.target.tagName !== 'BUTTON' && !event.target.closest('button')) window.openViewer('${sc.id}')">

      <div class="card-img-wrap">

        ${displayUrl ? (isVideoMedia 

            ? `<video src="${displayUrl}" autoplay loop muted playsinline style="width:100%;height:100%;object-fit:cover;display:block;${flipStyle}" ondblclick="${!isBlurry ? `window.openViewer('${sc.id}')` : ''}"></video>` 

            : `<img src="${displayUrl}" alt="${sc.id}" class="${isBlurry ? 'blur-placeholder' : ''}" style="${flipStyle}" ondblclick="${!isBlurry ? `window.openViewer('${sc.id}')` : ''}" />`

        ) : ''}

        ${!displayUrl && (main.status === 'queued' || main.status === 'processing') ? `<div class="placeholder-view" style="background:var(--panel)"></div>` : ''}

        

        <div class="badge mode" style="position:absolute;top:8px;left:8px;z-index:10;pointer-events:none">MODE: ${main.wfMode || 'DIRECT'}</div>

        ${(sc.speaker || sc.h3_prompt || p.speaker || p.h3_prompt) ? `<div class="badge" style="position:absolute;top:28px;left:8px;z-index:10;background:rgba(56,189,248,0.88);color:#fff;font-size:9.5px;font-weight:700;pointer-events:none;">🗣️ ${escapeHtml((sc.speaker || p.speaker) ? `SPEAKER: ${sc.speaker || p.speaker}` : 'LIPSYNC')}</div>` : ''}

        ${(() => {

            const cleanSid = String(sc.id).replace(/^S/i, '');

            const sfxVars = (proj.sceneSfxVarsById && (

                proj.sceneSfxVarsById[sc.id] ||

                proj.sceneSfxVarsById[sc.id.toLowerCase()] ||

                proj.sceneSfxVarsById[sc.id.toUpperCase()] ||

                proj.sceneSfxVarsById[cleanSid] ||

                proj.sceneSfxVarsById['s' + cleanSid] ||

                proj.sceneSfxVarsById['S' + cleanSid]

            )) || [];

            const hasSfxPrompt = Boolean(sc.sfx_prompt || p.sfx_prompt);

            if (!hasSfxPrompt && sfxVars.length === 0) return '';

            const topPos = (sc.speaker || sc.h3_prompt || p.speaker || p.h3_prompt) ? '48px' : '28px';

            return `<div class="badge" style="position:absolute;top:${topPos};left:8px;z-index:12;background:rgba(168,85,247,0.92);color:#fff;font-size:9.5px;font-weight:700;cursor:pointer;" onclick="event.stopPropagation(); window.openSfxVariationsModal('${sc.id}')" title="Atidaryti SFX variacijas (perklausa užvedus pelyte)">🔊 SFX${sfxVars.length > 0 ? ` [${sfxVars.length}]` : ''}</div>`;

        })()}

        ${isFlipped ? `<div class="badge" style="position:absolute;bottom:8px;left:8px;z-index:10;background:rgba(6,182,212,0.85);color:#fff;font-size:10px;font-weight:bold;pointer-events:none;">🪞 MIRROR</div>` : ''}

        ${isVideoMedia ? (() => {

            const numId = String(sc.id).replace(/^S/i, '');

            const mixEntry = (proj.renderSettings?.sceneVolumes && (proj.renderSettings.sceneVolumes[numId] || proj.renderSettings.sceneVolumes[String(sc.id)])) || null;

            const hasSnd = mixEntry ? (mixEntry.enabled !== false && mixEntry.volume > 0) : Boolean(main && (main.soundEnabled || main.params?.withAudio || main.params?.soundEnabled));

            const bg = hasSnd ? 'rgba(16, 185, 129, 0.95)' : 'rgba(236, 72, 153, 0.95)';

            const isTrimmed = Boolean((main && main.trim && main.trim.enabled) || (sc && sc.video_trim && sc.video_trim.enabled));

            const trimDur = isTrimmed ? ((main?.trim?.end || sc?.video_trim?.end || 3) - (main?.trim?.start || sc?.video_trim?.start || 0)).toFixed(1) : null;

            return `<div class="badge" style="position:absolute;top:8px;right:8px;z-index:10;background:${bg};color:#fff;font-size:10px;font-weight:bold;pointer-events:none;">🎬 VIDEO${hasSnd ? ' 🔊' : ''}${isTrimmed ? ` (✂️${trimDur}s)` : ''}</div>`;

        })() : ''}

        ${vCount > 0 && !out.generating ? `<div class="var-badge" onclick="window.openVars('${sc.id}')" title="View Variations" style="${isVideoMedia ? 'top:32px;' : ''}">VARS: ${vCount}</div>` : ''}

        

        ${!out.generating ? `

        <div class="card-overlay" ondblclick="window.openViewer('${sc.id}')">

          <div class="card-overlay-row">

            <button class="btn primary icon" title="${isVideoMedia ? 'Regenerate Video (Nauja video variacija)' : 'Regenerate (Adds Var)'}" onclick="window.doRegenerate('${sc.id}', '${main.id}')">↻</button>

            <button class="btn warn icon" title="Further Edit" onclick="window.openFurtherEdit('${sc.id}')">✨</button>

            <button class="btn icon" title="Inpaint Studio (Kaukė / Delete)" style="background: rgba(168, 85, 247, 0.25); color: #c084fc; border-color: rgba(168, 85, 247, 0.45);" onclick="window.openInpaintStudio('${sc.id}', 'scene')">🖌️</button>

            <button class="btn icon" title="Video Studio (I2V / Judesys)" style="background: rgba(236, 72, 153, 0.25); color: #f472b6; border-color: rgba(236, 72, 153, 0.45);" onclick="window.openVideoStudio('${sc.id}', 'scene')">🎥</button>

            ${isVideoMedia ? `<button class="btn icon" title="Apkirpti video (Trim / Atkarpa)" style="background: rgba(16, 185, 129, 0.25); color: #34d399; border-color: rgba(16, 185, 129, 0.45);" onclick="window.openVideoTrimmer('${sc.id}')">✂️</button>` : ''}

          </div>

          <div class="card-overlay-row">

            <button class="btn icon" title="Edit Params" onclick="window.openEdit('${sc.id}')">✎</button>

            <button class="btn good icon" title="Download Main" onclick="window.downloadSingle('${sc.id}')">⬇</button>

            <button class="btn icon" title="Fullscreen" onclick="window.openViewer('${sc.id}')">⛶</button>

          </div>

        </div>` : ''}

        

        ${out.generating ? `<div class="placeholder-view" style="background:rgba(0,0,0,0.7); z-index:25;"><div class="mono text-accent card-prog-text" style="font-weight:bold" id="prog-text-${activeReqId}" data-scene-id="${sc.id}">${main && main.status === 'processing' ? '⏳ Kraunamas modelis / Gen...' : '⏳ Eilėje (Queued)...'}</div><div class="progress-container"><div class="progress-fill card-prog-fill" id="prog-fill-${activeReqId}" data-scene-id="${sc.id}"></div></div></div>` : ''}

        ${!out.generating && (window._generatingSfxByScene && (

          window._generatingSfxByScene[sc.id] ||

          window._generatingSfxByScene[String(sc.id).toLowerCase()] ||

          window._generatingSfxByScene[String(sc.id).toUpperCase()] ||

          window._generatingSfxByScene[String(sc.id).replace(/^S/i,'')] ||

          window._generatingSfxByScene['s' + String(sc.id).replace(/^S/i,'')] ||

          window._generatingSfxByScene['S' + String(sc.id).replace(/^S/i,'')]

        )) ? `<div class="placeholder-view" style="background:rgba(16, 23, 35, 0.88); backdrop-filter:blur(6px); z-index:25;"><div class="mono" style="font-weight:bold; color:#fbbf24; font-size:12px; display:flex; align-items:center; gap:6px;"><span class="spin-anim">⏳</span> 🔊 Generuojamas SFX...</div><div class="progress-container" style="margin-top:8px; width:75%;"><div class="progress-fill" style="width:100%; background:linear-gradient(90deg, #f59e0b, #fbbf24); animation:pulse 1.5s infinite;"></div></div></div>` : ''}

      </div>

      <div class="card-body">

        <div class="flex justify-between items-center mb-2">

          <div class="flex items-center" style="gap: 8px;">

            <strong class="text-sm">${sc.id}</strong>

            ${timeBadge}

            ${(window._generatingSfxByScene && (

              window._generatingSfxByScene[sc.id] ||

              window._generatingSfxByScene[String(sc.id).toLowerCase()] ||

              window._generatingSfxByScene[String(sc.id).toUpperCase()] ||

              window._generatingSfxByScene[String(sc.id).replace(/^S/i,'')] ||

              window._generatingSfxByScene['s' + String(sc.id).replace(/^S/i,'')] ||

              window._generatingSfxByScene['S' + String(sc.id).replace(/^S/i,'')]

            )) ? `<span class="badge warn" style="background: rgba(245, 158, 11, 0.2); border: 1px solid #fbbf24; color: #fbbf24; font-size: 10px; display: inline-flex; align-items: center; gap: 4px;"><span class="spin-anim">⏳</span> SFX Gen...</span>` : ''}

          </div>

          ${!out.generating ? `<button class="btn bad text-xs" style="padding:4px 8px" onclick="if(confirm('Delete outputs for ${sc.id}?')){ window.getProj().outputs = window.getProj().outputs.filter(o=>o.sceneId!=='${sc.id}'); window.saveCurrentProject(); window.triggerUIRefresh('images'); }">Del</button>` : ''}

        </div>

        <div class="text-xs" style="color:var(--accent); margin-bottom:4px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">P: ${escapeHtml(p.prompt || sc.prompt || '-')}</div>

        ${(sc.speaker || p.speaker || sc.text) ? `<div class="text-xs" style="color:#38bdf8; margin-bottom:3px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">🗣️ ${(sc.speaker || p.speaker) ? `<strong>${escapeHtml(sc.speaker || p.speaker)}:</strong> ` : ''}${escapeHtml(sc.text || sc.dialogue || '')}</div>` : ''}

        ${(sc.sfx_prompt || p.sfx_prompt) ? `<div class="text-xs text-muted" style="color:#c084fc; margin-bottom:3px; display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden;" title="${escapeHtml(sc.sfx_prompt || p.sfx_prompt)}">🔊 SFX: ${escapeHtml(sc.sfx_prompt || p.sfx_prompt)}</div>` : ''}

        <div class="text-xs text-muted mb-2" title="${escapeHtml(uiText)}" style="display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">T: ${escapeHtml(uiText||'-')}</div>

        <div class="meta-grid"><div>W:${p.w || globals.w || 1920} H:${p.h || globals.h || 1080}</div><div class="text-right">S:${p.steps || globals.steps || 4} C:${p.cfg || globals.cfg || 1.0}</div><div style="grid-column:1/-1">Seed: ${p.seed || (main && main.seedUsed) || 'Auto'}</div></div>

      </div>

    </div>`;

  });

  grid.innerHTML = html || `<div class="text-muted" style="grid-column:1/-1; padding:20px">No outputs match.</div>`;



  // Explicitly enforce muted state on all rendered card videos

  grid.querySelectorAll('video').forEach(v => {

    v.muted = true;

    v.volume = 0;

  });

}



// ============================================================================

// 9. MODALS (EDIT / FURTHER EDIT / VIEWER)

// ============================================================================

window.openEdit = function(sceneId) {

  const proj = window.getProj();

  state.editingId = sceneId;

  const sc = proj.scenes.find(s=>s.id === sceneId);

  const out = getOutput(sceneId);

  const main = out ? (getMainVariant(out) || (out.variations && out.variations[out.variations.length - 1])) : null;

  const src = (main && main.params) || (out ? out.params : sc) || sc || {}; 

  $("#eSceneId").textContent = sceneId;

  $("#ePrompt").value = src.prompt || (sc ? sc.prompt : '') || '';

  $("#eNeg").value = src.negative || (sc ? sc.negative : '') || '';

  $("#eRefA").value = src.refA || (sc ? sc.refA : '') || '';

  $("#eRefB").value = src.refB || (sc ? sc.refB : '') || '';

  $("#eRefC").value = src.refC || (sc ? sc.refC : '') || '';

  $("#eW").value = src.w || proj.globals.w || 1920;

  $("#eH").value = src.h || proj.globals.h || 1080;



  // Set Model in eModel

  const eModel = document.getElementById('eModel');

  const quickModelVal = document.getElementById('quickModel')?.value || '';

  const targetPreset = src.modelPreset || '';

  const targetUnet = src.unetName || proj.globals.unetName || '';

  const targetWfMode = src.workflowMode || proj.globals.workflowMode || 'latent_upscale';

  const targetLora = src.loraName || proj.globals.loraName || '';

  const curModelKey = `${targetWfMode}|${targetUnet}|${targetLora}`;

  const isCloudSrc = (targetPreset && targetPreset.includes('nano_banana')) || targetWfMode === 'nano_banana_2_flash';

  const is21Src = !isCloudSrc && (targetWfMode === 'qwen_2_1' || (targetUnet && targetUnet.includes('2.1')));



  if (eModel) {

    let matched = false;

    for (let i = 0; i < eModel.options.length; i++) {

      const optVal = eModel.options[i].value;

      if (targetPreset && optVal === targetPreset) {

        eModel.value = optVal;

        matched = true;

        break;

      }

    }

    if (!matched && !isCloudSrc) {

      for (let i = 0; i < eModel.options.length; i++) {

        const optVal = eModel.options[i].value;

        if (is21Src && optVal.includes('2.1')) {

          eModel.value = optVal; matched = true; break;

        } else if (!is21Src && targetUnet && optVal.includes(targetUnet)) {

          eModel.value = optVal; matched = true; break;

        }

      }

    }

    if (!matched) {

      const fallbackVal = quickModelVal || proj.globals.modelPreset || '';

      for (let i = 0; i < eModel.options.length; i++) {

        if (fallbackVal && eModel.options[i].value === fallbackVal) {

          eModel.value = fallbackVal;

          matched = true;

          break;

        }

      }

    }

    if (!matched && eModel.options.length > 0) {

      eModel.selectedIndex = 0; // Default: Qwen 2509

    }



    const updateEditStepsCfgState = () => {

      const isCloud = eModel.value.includes('nano_banana');

      const is21 = !isCloud && eModel.value.includes('2.1');

      const isLightning = !isCloud && !is21 && (eModel.value.includes('Lightning') || eModel.value.includes('2509') || eModel.value.includes('2511') || eModel.value.includes('2506'));

      const stepsIn = document.getElementById('eSteps');

      const cfgIn = document.getElementById('eCfg');

      if (isCloud) {

        if (stepsIn) { stepsIn.disabled = true; stepsIn.style.opacity = '0.35'; stepsIn.style.pointerEvents = 'none'; stepsIn.placeholder = 'N/A'; }

        if (cfgIn) { cfgIn.disabled = true; cfgIn.style.opacity = '0.35'; cfgIn.style.pointerEvents = 'none'; cfgIn.placeholder = 'N/A'; }

      } else {

        if (stepsIn) { 

          stepsIn.disabled = false; stepsIn.style.opacity = '1'; stepsIn.style.pointerEvents = 'auto'; stepsIn.placeholder = '';

          stepsIn.value = is21 ? 25 : (isLightning ? 4 : 20);

        }

        if (cfgIn) { 

          cfgIn.disabled = false; cfgIn.style.opacity = '1'; cfgIn.style.pointerEvents = 'auto'; cfgIn.placeholder = '';

          cfgIn.value = (is21 || isLightning) ? 1.0 : 3.5;

        }

      }

    };



    if (!eModel.dataset.editModelListener) {

      eModel.dataset.editModelListener = 'true';

      eModel.addEventListener('change', updateEditStepsCfgState);

    }

  }



  // Determine active model architecture to display correct steps & cfg

  const activeModelVal = eModel ? eModel.value : curModelKey;

  const isCloud = activeModelVal.includes('nano_banana');

  const is21 = !isCloud && activeModelVal.includes('2.1');

  const isLightning = !isCloud && !is21 && (activeModelVal.includes('Lightning') || activeModelVal.includes('2509') || activeModelVal.includes('2511') || activeModelVal.includes('2506') || true);

  const defaultSteps = is21 ? 25 : (isLightning ? 4 : 20);

  const defaultCfg = (is21 || isLightning) ? 1.0 : 3.5;



  let curSteps = src.steps;

  if (!curSteps || (isLightning && (curSteps === 25 || curSteps === 20)) || (is21 && curSteps <= 4)) {

    curSteps = proj.globals.steps || defaultSteps;

  }

  let curCfg = src.cfg;

  if (curCfg === undefined || isNaN(curCfg) || (isLightning && curCfg >= 3.0)) {

    curCfg = (proj.globals.cfg !== undefined && proj.globals.cfg !== null) ? proj.globals.cfg : defaultCfg;

  }



  const eStepsEl = $("#eSteps");

  const eCfgEl = $("#eCfg");

  if (isCloud) {

    if (eStepsEl) { eStepsEl.disabled = true; eStepsEl.style.opacity = '0.35'; eStepsEl.style.pointerEvents = 'none'; eStepsEl.placeholder = 'N/A'; }

    if (eCfgEl) { eCfgEl.disabled = true; eCfgEl.style.opacity = '0.35'; eCfgEl.style.pointerEvents = 'none'; eCfgEl.placeholder = 'N/A'; }

  } else {

    if (eStepsEl) { eStepsEl.disabled = false; eStepsEl.style.opacity = '1'; eStepsEl.style.pointerEvents = 'auto'; eStepsEl.value = curSteps; }

    if (eCfgEl) { eCfgEl.disabled = false; eCfgEl.style.opacity = '1'; eCfgEl.style.pointerEvents = 'auto'; eCfgEl.value = curCfg; }

  }

  $("#eText").value = proj.sceneTextById[sceneId] || (sc ? sc.text : '') || '';

  const eSpeaker = $("#eSpeaker");

  if (eSpeaker) eSpeaker.value = src.speaker || (sc ? sc.speaker : '') || '';

  const eVoice = $("#eVoice");

  if (eVoice) eVoice.value = src.voice || (sc ? sc.voice : '') || '';

  const eH3Prompt = $("#eH3Prompt");

  if (eH3Prompt) eH3Prompt.value = src.h3_prompt || (sc ? sc.h3_prompt : '') || '';

  const eSfxPrompt = $("#eSfxPrompt");

  if (eSfxPrompt) eSfxPrompt.value = src.sfx_prompt || (sc ? sc.sfx_prompt : '') || '';

  $("#modalEdit").classList.add("show"); 

  if(typeof window.updateEditRefDisplays === 'function') window.updateEditRefDisplays();

  else if(typeof window.syncCustomSelects === 'function') window.syncCustomSelects(['eRefA', 'eRefB', 'eRefC']);

}

window.closeEdit = function() { $("#modalEdit").classList.remove("show"); state.editingId = null; }



window.applyEdit = function(regen = false) {

  const proj = window.getProj();

  const sceneId = state.editingId; const sc = proj.scenes.find(s=>s.id === sceneId);

  const eModel = document.getElementById('eModel');

  let modelParams = {};

  if (eModel && eModel.value) {

    const parts = eModel.value.split('|');

    const isCloud = eModel.value.includes('nano_banana');

    const is21 = !isCloud && (parts[0] === 'qwen_2_1' || parts[1].includes('2.1'));

    modelParams = {

      modelPreset: eModel.value,

      workflowMode: parts[0],

      unetName: isCloud ? 'none' : parts[1],

      loraName: (isCloud || parts[2] === 'none') ? '' : parts[2],

      clipName: isCloud ? 'none' : (is21 ? 'qwen3vl_8b_int8_convrot.safetensors' : 'qwen_2.5_vl_7b_fp8_scaled.safetensors'),

      vaeName: isCloud ? 'none' : (is21 ? 'qwen_image_2.1_vae_bf16.safetensors' : 'qwen_image_vae.safetensors')

    };

  }

  const speakerVal = $("#eSpeaker") ? $("#eSpeaker").value.trim() : (sc?.speaker || "");

  const voiceVal = $("#eVoice") ? $("#eVoice").value.trim() : (sc?.voice || "");

  const h3PromptVal = $("#eH3Prompt") ? $("#eH3Prompt").value.trim() : (sc?.h3_prompt || "");

  const sfxPromptVal = $("#eSfxPrompt") ? $("#eSfxPrompt").value.trim() : (sc?.sfx_prompt || "");



  const newParams = { 

    prompt: $("#ePrompt").value, 

    negative: $("#eNeg").value, 

    refA: $("#eRefA").value, 

    refB: $("#eRefB").value, 

    refC: $("#eRefC").value, 

    w: parseInt($("#eW").value) || proj.globals.w || 1920, 

    h: parseInt($("#eH").value) || proj.globals.h || 1080, 

    steps: parseInt($("#eSteps").value) || (is21 ? 25 : 4), 

    cfg: parseFloat($("#eCfg").value) || 1.0,

    speaker: speakerVal,

    voice: voiceVal,

    h3_prompt: h3PromptVal,

    sfx_prompt: sfxPromptVal,

    ...modelParams

  };

  if ($("#eApplyToScene").checked && sc) { 

    Object.assign(sc, { 

      prompt: newParams.prompt, 

      negative: newParams.negative, 

      refA: newParams.refA, 

      refB: newParams.refB, 

      refC: newParams.refC,

      speaker: speakerVal,

      voice: voiceVal,

      h3_prompt: h3PromptVal,

      sfx_prompt: sfxPromptVal,

      ...modelParams

    }); 

    window.validateScenes(); 

  }

  let out = getOutput(sceneId); 

  if (out) Object.assign(out.params, newParams);

  

  window.saveCurrentProject();

  window.closeEdit(); 

  if(regen) {

    window.lastGenActionByScene = window.lastGenActionByScene || {};

    window.lastGenActionByScene[sceneId] = 'edit';

    if (out) out.generating = true;

    if (typeof window.updateReviewUI === 'function') window.updateReviewUI();

    window.doGenerate(sceneId, newParams, {}, 1);

  } else { 

    if(typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images'); else window.renderImages(); 

  }

}



if($("#btnEditSave")) $("#btnEditSave").addEventListener("click", () => window.applyEdit(false));

if($("#btnEditRegen")) $("#btnEditRegen").addEventListener("click", () => window.applyEdit(true));



window.openFurtherEdit = function(id, forceContext = null, targetVarId = null) {

  const proj = window.getProj();

  if (!proj || !id) return;



  // Intelligent Context Auto-Detection

  let isChar = false;

  if (forceContext) {

    isChar = (forceContext === 'char');

  } else if (proj.charRefs && proj.charRefs[id] && (!proj.scenes || !proj.scenes.some(s => String(s.id) === String(id)))) {

    isChar = true;

  } else if (proj.scenes && proj.scenes.some(s => String(s.id) === String(id))) {

    isChar = false;

  } else if (proj.charRefs && proj.charRefs[id]) {

    isChar = true;

  } else {

    isChar = (state.viewerContext === 'char');

  }



  state.viewerContext = isChar ? 'char' : 'scene';

  state.editingId = isChar ? null : id;

  state.editingCharId = isChar ? id : null;



  let mainUrl = "";

  let promptVal = "";

  let varId = "";

  let ref1Val = "";

  let ref2Val = "";



  if (isChar) {

    const data = proj.charRefs && proj.charRefs[id];

    if (!data) {

      if (typeof toast === 'function') toast("Warning", `Veikėjas "${id}" nerastas.`, "warn");

      return;

    }

    const main = (targetVarId && data.variations ? data.variations.find(v => v.id === targetVarId) : null)

                 || (window.getCharMainVariant ? window.getCharMainVariant(data) : null);

    if (!main || !main.url) {

      if (typeof toast === 'function') toast("Negalima redaguoti", `Veikėjas "${id}" dar neturi sugeneruoto atvaizdo.`, "warn");

      return;

    }

    mainUrl = main.url;

    varId = main.id || '';

    promptVal = main.editPrompt || (main.params && main.params.editPrompt) || "";

    ref1Val = (main.params && (main.params.refB || main.params.extraRef1)) || main.refB || main.extraRef1 || "";

    ref2Val = (main.params && (main.params.refC || main.params.extraRef2)) || main.refC || main.extraRef2 || "";

  } else {

    const out = getOutput(id);

    const sc = proj.scenes && proj.scenes.find(s => String(s.id) === String(id));

    if (!out || !out.variations || out.variations.length === 0) {

      if (typeof toast === 'function') toast("Negalima redaguoti", `Scene "${id}" dar neturi sugeneruoto vaizdo. Pirmiausia sugeneruokite.`, "warn");

      return;

    }

    const main = (targetVarId && out.variations ? out.variations.find(v => v.id === targetVarId) : null)

                 || getMainVariant(out) || out.variations.find(v => v.status === 'done') || out.variations[0];

    if (!main || !main.url) {

      if (typeof toast === 'function') toast("Negalima redaguoti", `Scene "${id}" dar neturi paruošto vaizdo.`, "warn");

      return;

    }

    mainUrl = main.url;

    varId = main.id || '';

    promptVal = main.editPrompt || (main.params && main.params.editPrompt) || "";

    ref1Val = (main.params && (main.params.refB || main.params.extraRef1)) || main.refB || main.extraRef1 || "";

    ref2Val = (main.params && (main.params.refC || main.params.extraRef2)) || main.refC || main.extraRef2 || "";

  }



  const feSceneIdEl = $("#feSceneId");

  if (feSceneIdEl) feSceneIdEl.textContent = id; 

  

  const previewImg = $("#feImgPreview");

  if (previewImg) {

    previewImg.src = mainUrl; 

    previewImg.dataset.varId = varId; 

    previewImg.onclick = () => {

      if (previewImg.src) {

        if (typeof window.openImageLightbox === 'function') {

          window.openImageLightbox(previewImg.src, `Further Edit - ${id}`);

        }

      }

    };

  }

  

  const promptInput = $("#fePrompt");

  if (promptInput) promptInput.value = promptVal;

  

  const feRef1 = $("#feRef1"); if (feRef1) feRef1.value = ref1Val;

  const feRef2 = $("#feRef2"); if (feRef2) feRef2.value = ref2Val;



  const modal = $("#modalFurtherEdit");

  if (modal) modal.classList.add("show"); 

  

  if (typeof window.updateFeRefDisplays === 'function') window.updateFeRefDisplays();

  else if (typeof window.syncCustomSelects === 'function') window.syncCustomSelects(['feRef1', 'feRef2']);

};



async function handleFeUpload(fileInputId, selectId) {

  const proj = window.getProj();

  const fileInput = $(`#${fileInputId}`); if(fileInput.files.length === 0) return; 

  const file = fileInput.files[0]; toast("Uploading...", file.name);

  

  let uploadedName = "";

  

  if(state.connected) {

     const fd = new FormData(); 

     fd.append("file", file); 

     try { 

         // Siunčiame failą į naująjį Python Hub Vault'ą

         const res = await fetch("/api/upload_vault", { method: "POST", body: fd }); 

         if(!res.ok) throw new Error("Upload failed"); 

         const data = await res.json(); 

         uploadedName = data.url.split('/').pop(); 

     } catch(e) { return toast("Error", e.message, "error"); }

  } else {

      uploadedName = file.name; 

  }

  

  if(!proj.refs.includes(uploadedName)) proj.refs.push(uploadedName);

  window.saveCurrentProject();

  

  if(typeof window.updateRefsSelects === 'function') window.updateRefsSelects(); 

  const el = $(`#${selectId}`);

  if(el) {

    el.value = uploadedName;

    el.dispatchEvent(new Event('change'));

  }

  if(typeof window.updateFeRefDisplays === 'function') window.updateFeRefDisplays();

  if(typeof window.updateEditRefDisplays === 'function') window.updateEditRefDisplays();

  else if(typeof window.syncCustomSelects === 'function') window.syncCustomSelects([selectId]); 

  toast("Success", "Reference added to Vault.", "success");

}



if($("#fileFe1")) $("#fileFe1").addEventListener("change", () => handleFeUpload("fileFe1", "feRef1"));

if($("#fileFe2")) $("#fileFe2").addEventListener("change", () => handleFeUpload("fileFe2", "feRef2"));

if($("#fileEditRefA")) $("#fileEditRefA").addEventListener("change", () => handleFeUpload("fileEditRefA", "eRefA"));

if($("#fileEditRefB")) $("#fileEditRefB").addEventListener("change", () => handleFeUpload("fileEditRefB", "eRefB"));

if($("#fileEditRefC")) $("#fileEditRefC").addEventListener("change", () => handleFeUpload("fileEditRefC", "eRefC"));



if($("#btnGenerateEdit")) {

    $("#btnGenerateEdit").addEventListener("click", async () => {

      const proj = window.getProj();

      try {

          const isStyleLab = (state.viewerContext === 'style_lab') || (window.styleLabEditContext && window.styleLabEditContext.active);

          if (isStyleLab) {

            $("#modalFurtherEdit").classList.remove("show");

            if (typeof window.executeStyleLabFurtherEdit === 'function') {

              const imgEl = $("#feImgPreview");

              const prompt = $("#fePrompt") ? $("#fePrompt").value : '';

              const extraRef1 = $("#feRef1") ? $("#feRef1").value : '';

              const extraRef2 = $("#feRef2") ? $("#feRef2").value : '';

              await window.executeStyleLabFurtherEdit({

                imgSrc: imgEl ? imgEl.src : '',

                varId: imgEl ? imgEl.dataset.varId : '',

                editPrompt: prompt.trim(),

                extraRef1,

                extraRef2

              });

              return;

            }

          }



          const isChar = state.viewerContext === 'char' || !!state.editingCharId; 

          const id = isChar ? state.editingCharId : state.editingId;

          if (!id) throw new Error("Nerastas redaguojamo objekto ID.");

          const imgEl = $("#feImgPreview"); 

          const varId = imgEl ? imgEl.dataset.varId : '';

          const prompt = $("#fePrompt") ? $("#fePrompt").value : ''; 

          const extraRef1 = $("#feRef1") ? $("#feRef1").value : ''; 

          const extraRef2 = $("#feRef2") ? $("#feRef2").value : '';



          $("#modalFurtherEdit").classList.remove("show"); 

          toast("Uploading edit reference...", "Please wait...");



          const res = await fetch(imgEl.src); 

          if (!res.ok) throw new Error("Nepavyko nuskaityti nuotraukos (HTTP " + res.status + ")");

          const blob = await res.blob();

          

          const file = new File([blob], `edit_src_${id}_${rId()}.png`, {type: blob.type || 'image/png'});

          let uploadedName = "empty.png";

          

          if (state.connected) {

            const formData = new FormData(); 

            formData.append("file", file); 

            

            // Editinama nuotrauka keliauja tiesiai atgal į Vault, Hub'as ją perduos reikiamam GPU

            const upRes = await fetch("/api/upload_vault", { method: "POST", body: formData });

            if (!upRes.ok) throw new Error("Failed to upload back to Vault.");

            const upData = await upRes.json(); 

            uploadedName = upData.url.split('/').pop();

          } else {

            uploadedName = `mock_edit_${rId()}.png`;

          }



          let finalPrompt = prompt.trim();

          if (extraRef1 && !finalPrompt.toLowerCase().includes('image 2') && !finalPrompt.toLowerCase().includes('picture 2')) {

              finalPrompt = `Image 1 is the base image. Image 2 is the character reference. In Image 1, modify: ${finalPrompt} (referencing the character in Image 2).`;

          }

          if (extraRef2 && !finalPrompt.toLowerCase().includes('image 3') && !finalPrompt.toLowerCase().includes('picture 3')) {

              finalPrompt += ` Also use Image 3 as additional reference.`;

          }



          const overrideParams = { editSrcFile: uploadedName, editPrompt: prompt.trim(), refA: uploadedName, refB: extraRef1 || "", refC: extraRef2 || "", prompt: finalPrompt };

          

          if(isChar) {

              if(typeof window.doGenerateChar === 'function') await window.doGenerateChar(id, overrideParams, { sourceVarId: varId, editPrompt: prompt.trim() }, 1);

          } else {

              window.lastGenActionByScene = window.lastGenActionByScene || {};

              window.lastGenActionByScene[id] = 'further_edit';

              const out = getOutput(id);

              if (out) out.generating = true;

              if (typeof window.updateReviewUI === 'function') window.updateReviewUI();

              await window.doGenerate(id, overrideParams, { sourceVarId: varId, editPrompt: prompt.trim() }, 1);

          }

      } catch(e) { 

          toast("Error", e.message, "error"); 

      }

    });

}



window.openVars = function(sceneId) {

  const out = getOutput(sceneId); if(!out) return; state.viewerContext = 'scene';

  $("#vSceneTitle").textContent = sceneId; const grid = $("#vGrid"); grid.innerHTML = '';

  const validVars = (out.variations || []).filter(v => (v.url && v.url.trim() !== '' && v.status !== 'error') || v.status === 'queued' || v.status === 'processing');

  validVars.forEach(v => {

    const div = document.createElement('div'); div.className = `vcard ${v.id===out.mainId?'main':''}`;

    div.style.position = 'relative';

    const isCut = Boolean(v.wfMode && v.wfMode.includes('Cut'));

    const metaInfo = isCut ? v.wfMode : (v.sourceVarId ? `✨ Re-Edit` : (v.wfMode || 'DIRECT'));

    const isVarImg = v.url && (
        v.url.toLowerCase().endsWith('.jpg') ||
        v.url.toLowerCase().endsWith('.jpeg') ||
        v.url.toLowerCase().endsWith('.png') ||
        v.url.toLowerCase().endsWith('.webp')
    );
    const isVid = !isVarImg && ((v.url && (v.url.toLowerCase().endsWith('.mp4') || v.url.toLowerCase().endsWith('.webm'))) || v.type === 'video' || (v.wfMode && v.wfMode.includes('I2V')));

    const hasVarSnd = Boolean(v.soundEnabled || v.params?.withAudio || v.params?.soundEnabled);

    let vidBadge = '';

    if (isCut) {

      vidBadge = `<span class="badge" style="position:absolute;top:6px;right:6px;background:linear-gradient(135deg, #10b981, #06b6d4);color:#fff;font-size:10px;padding:2px 6px;font-weight:bold;z-index:10;border-radius:4px;box-shadow:0 2px 6px rgba(0,0,0,0.5);">✂️ CUT</span>`;

    } else if (isVid) {

      vidBadge = `<span class="badge" style="position:absolute;top:6px;right:6px;background:${hasVarSnd ? 'rgba(16, 185, 129, 0.95)' : 'rgba(236, 72, 153, 0.95)'};color:#fff;font-size:10px;padding:2px 6px;font-weight:bold;z-index:10;border-radius:4px;box-shadow:0 2px 6px rgba(0,0,0,0.5);">🎬 VID${hasVarSnd ? ' 🔊' : ''}</span>`;

    }



    const isVarFlipped = Boolean(v.flipH === true || (v.params && v.params.flipH === true));

    const flipStyle = isVarFlipped ? 'transform:scaleX(-1);' : '';



    const isBrokenError = (v.status === 'error' && (!v.url || v.url.endsWith('.jpg') || v.url.endsWith('.png')) && v.type === 'video');

    const deleteBtn = `<button type="button" class="btn icon bad" style="position:absolute;top:6px;left:6px;z-index:15;width:22px;height:22px;padding:0;font-size:11px;border-radius:4px;display:flex;align-items:center;justify-content:center;background:rgba(239,68,68,0.85);color:#fff;" title="Delete šią variaciją" onclick="event.stopPropagation(); window.deleteVar('${sceneId}', '${v.id}')">✕</button>`;



    if (v.status === 'queued' || v.status === 'processing') {

      const displayPendingImg = v.tempUrl || v.url || '';

      div.innerHTML = `${vidBadge}${deleteBtn}${displayPendingImg ? `<img src="${displayPendingImg}" style="filter:blur(3px);opacity:0.4;position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1;" />` : ''}<div style="padding:40px 10px;text-align:center;position:relative;z-index:2;" class="mono text-accent text-xs" id="prog-text-${v.id}">${v.status === 'processing' ? '⏳ Kraunamas modelis...' : '⏳ Queued'}</div><div class="info" style="position:relative;z-index:2;">Pending</div>`;

    } else if (v.status === 'error') {

      div.innerHTML = `${vidBadge}${deleteBtn}<div style="padding:30px 10px;text-align:center;color:#ef4444;display:flex;flex-direction:column;align-items:center;gap:4px;" class="mono text-xs"><span style="font-size:20px;">⚠️</span><span>Klaida / Atšaukta</span></div><div class="info">${(v.createdAt||'').split(' ')[1] || ''} | Klaida</div>`;

    } else if (isVid) {

      div.innerHTML = `${vidBadge}${deleteBtn}<video src="${v.url}" muted loop playsinline onmouseenter="this.play()" onmouseleave="this.pause()" onclick="window.selectVar('${sceneId}', '${v.id}')" style="width:100%;height:100%;object-fit:cover;cursor:pointer;display:block;${flipStyle}"></video><div class="info">${(v.createdAt||'').split(' ')[1] || ''} | ${metaInfo}</div>`;

    } else {

      div.innerHTML = `${deleteBtn}<img src="${v.url}" style="${flipStyle}" onclick="window.selectVar('${sceneId}', '${v.id}')"/><div class="info">${(v.createdAt||'').split(' ')[1] || ''} | ${metaInfo}</div>`;

    }



    if(v.status === 'done') {

        div.addEventListener('mouseenter', e => { if(typeof window.showPreviewHover === 'function') window.showPreviewHover(e, v.url); });

        div.addEventListener('mousemove', e => { if(typeof window.movePreviewHover === 'function') window.movePreviewHover(e); });

        div.addEventListener('mouseleave', () => { if(typeof window.hidePreviewHover === 'function') window.hidePreviewHover(); });

    }

    grid.appendChild(div);

  });

  $("#modalVars").classList.add("show");

}



window.selectVar = function(sId, vId) {

  const proj = window.getProj();

  const out = getOutput(sId); 

  if(out) {

    out.mainId = vId; 

    out.generating = out.variations ? out.variations.some(x => x.status === 'queued' || x.status === 'processing') : false;

    const v = out.variations.find(x => x.id === vId);

    if(v) {

      if (v.params) {

        out.params = JSON.parse(JSON.stringify(v.params));

      }

      const isSelectVarImg = v.url && (
          v.url.toLowerCase().endsWith('.jpg') ||
          v.url.toLowerCase().endsWith('.jpeg') ||
          v.url.toLowerCase().endsWith('.png') ||
          v.url.toLowerCase().endsWith('.webp')
      );
      const isVid = !isSelectVarImg && ((v.type === 'video') || (v.url && (v.url.toLowerCase().endsWith('.mp4') || v.url.toLowerCase().endsWith('.webm'))));

      if (isVid) {

        out.params = out.params || {};

        out.params.video_url = v.url;

        if (v.trim) out.params.trim = v.trim;

      } else {

        if (out.params) {

          delete out.params.video_url;

          delete out.params.trim;

        }

      }



      const sc = proj.scenes.find(s => s.id === sId || String(s.id).replace(/^S/i, '') === String(sId).replace(/^S/i, '')); 

      if(sc) {

        Object.assign(sc, out.params);

        if (isVid) {

          sc.video_url = v.url;

          if (v.trim) sc.video_trim = v.trim;

        } else {

          delete sc.video_url;

          delete sc.video_trim;

        }

        window.validateScenes(); 

      }

    }

  }

  window.saveCurrentProject();

  $('#modalVars').classList.remove('show'); 

  if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images'); else if (typeof window.renderImages === 'function') window.renderImages();

  if($("#viewer") && $("#viewer").classList.contains("show")) {

    if(typeof window.updateViewer === 'function') window.updateViewer();

  }

};



window.deleteVar = function(sId, vId) {

  const proj = window.getProj();

  const out = getOutput(sId);

  if (!out || !out.variations || out.variations.length === 0) return;



  const idx = out.variations.findIndex(x => x.id === vId);

  if (idx < 0) return;



  if (!confirm("Ar tikrai norite pašalinti šią variaciją?")) return;



  out.variations.splice(idx, 1);

  if (out.mainId === vId) {

    const nextDone = out.variations.slice().reverse().find(x => x.status === 'done' && x.url) || out.variations[out.variations.length - 1];

    out.mainId = nextDone ? nextDone.id : null;

  }



  window.saveCurrentProject();

  if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images'); else window.renderImages();

  if (out.variations.length > 0) {

    window.openVars(sId);

  } else {

    $('#modalVars').classList.remove('show');

  }

  toast("Pašalinta", "Variacija pašalinta.", "info");

};



// ============================================================================

// VIEWER ZOOM & PAN CONTROLLER (CLICK-TO-ZOOM / GLIDE PAN / RESET / HORIZONTAL FLIP)

// ============================================================================

window.isViewerZoomed = false;

window.viewerZoomScale = 2.5;



window.isCurrentViewerFlipped = function() {

  const proj = typeof window.getProj === 'function' ? window.getProj() : null;

  if (!proj || !state.viewerList || state.viewerList.length === 0) return false;

  const currentId = state.viewerList[state.viewerIndex];

  if (!currentId) return false;

  const isChar = state.viewerContext === 'char';

  if (isChar) {

    const charData = proj.charRefs ? proj.charRefs[currentId] : null;

    if (!charData) return false;

    const main = window.getCharMainVariant ? window.getCharMainVariant(charData) : null;

    return Boolean(

      (main && (main.flipH === true || main.params?.flipH === true)) ||

      (charData && (charData.flipH === true || charData.params?.flipH === true))

    );

  } else {

    const cleanId = String(currentId).replace(/^S/i, '');

    const out = window.getOutput ? window.getOutput(currentId) : (proj.outputs ? proj.outputs.find(o => o && (o.sceneId === currentId || String(o.sceneId).replace(/^S/i, '') === cleanId)) : null);

    const sc = proj.scenes ? proj.scenes.find(s => s && (s.id === currentId || String(s.id).replace(/^S/i, '') === cleanId)) : null;

    const main = (out && out.variations && out.variations.length > 0) ? (window.getMainVariant ? window.getMainVariant(out) : out.variations[out.variations.length - 1]) : null;

    return Boolean(

      (main && (main.flipH === true || main.params?.flipH === true)) ||

      (out && (out.flipH === true || out.params?.flipH === true)) ||

      (sc && (sc.flipH === true || sc.params?.flipH === true))

    );

  }

};



window.getActiveViewerMedia = function() {

  const vid = document.getElementById('vwVideo');

  if (vid && vid.style.display !== 'none') return vid;

  return document.getElementById('vwImg');

};



window.applyViewerTransform = function(scaleVal = 1) {

  const img = document.getElementById('vwImg');

  const vid = document.getElementById('vwVideo');

  const isFlipped = typeof window.isCurrentViewerFlipped === 'function' ? window.isCurrentViewerFlipped() : false;

  const flipPrefix = isFlipped ? 'scaleX(-1)' : '';

  const scalePart = (scaleVal && scaleVal !== 1) ? `scale(${scaleVal})` : '';

  const transform = [flipPrefix, scalePart].filter(Boolean).join(' ') || 'none';



  if (img) {

    img.style.transform = transform;

    img.style.webkitTransform = transform;

  }

  if (vid) {

    vid.style.transform = transform;

    vid.style.webkitTransform = transform;

  }

};



window.resetViewerZoom = function() {

  window.isViewerZoomed = false;

  const img = document.getElementById('vwImg');

  const vid = document.getElementById('vwVideo');

  const wrap = document.getElementById('vwImgWrap');

  const hint = document.getElementById('vwZoomHint');

  if (img) img.style.transformOrigin = 'center center';

  if (vid) vid.style.transformOrigin = 'center center';

  if (typeof window.applyViewerTransform === 'function') {

    window.applyViewerTransform(1);

  }

  if (wrap) {

    wrap.classList.remove('is-zoomed');

  }

  if (hint) {

    hint.textContent = '🔍 Paspauskite norimoje vietoje prisiartinimui';

  }

};



window.setupViewerZoomAndPan = function() {

  const wrap = document.getElementById('vwImgWrap');

  const img = document.getElementById('vwImg');

  const hint = document.getElementById('vwZoomHint');

  if (!wrap || !img || wrap.__zoomInit) return;

  wrap.__zoomInit = true;



  img.addEventListener('dragstart', (e) => e.preventDefault());

  wrap.addEventListener('dragstart', (e) => e.preventDefault());



  function toggleViewerZoomAt(clientX, clientY) {

    const media = window.getActiveViewerMedia ? window.getActiveViewerMedia() : img;

    if (!media) return;



    // Zoom is strictly for image viewing to allow seamless video control

    if (media.tagName === 'VIDEO') return;



    if (!window.isViewerZoomed) {

      const rect = media.getBoundingClientRect();

      if (rect.width === 0 || rect.height === 0) return;

      const isFlipped = typeof window.isCurrentViewerFlipped === 'function' ? window.isCurrentViewerFlipped() : false;

      const rawXPct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));

      const xPct = isFlipped ? (100 - rawXPct) : rawXPct;

      const yPct = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));



      window.isViewerZoomed = true;

      media.style.transformOrigin = `${xPct.toFixed(1)}% ${yPct.toFixed(1)}%`;

      if (typeof window.applyViewerTransform === 'function') {

        window.applyViewerTransform(window.viewerZoomScale);

      }

      wrap.classList.add('is-zoomed');

      if (hint) hint.textContent = `🔍 Prisiartinta ${window.viewerZoomScale.toFixed(1)}x • Judinkite pelytę peržiūrai • Paspauskite atstatymui`;

    } else {

      window.resetViewerZoom();

    }

  }



  let downPos = null;



  wrap.addEventListener('mousedown', (e) => {

    if (e.button !== 0) return;

    downPos = { x: e.clientX, y: e.clientY };

  });



  wrap.addEventListener('mouseup', (e) => {

    if (e.button !== 0 || !downPos) return;

    const dist = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);

    downPos = null;



    if (e.target && e.target.tagName === 'VIDEO') {

      const rect = e.target.getBoundingClientRect();

      // If clicking bottom controls bar, let browser native controls handle it

      if (e.clientY > rect.bottom - 45) {

        return;

      }

      // Click on video toggles play / pause smoothly

      if (dist <= 10) {

        if (e.target.paused) {

          e.target.play().catch(() => {});

        } else {

          e.target.pause();

        }

      }

      return;

    }



    if (dist <= 10) {

      toggleViewerZoomAt(e.clientX, e.clientY);

    }

  });



  // When zoomed, smoothly pan across the image as the mouse moves

  wrap.addEventListener('mousemove', (e) => {

    if (!window.isViewerZoomed) return;

    const media = window.getActiveViewerMedia ? window.getActiveViewerMedia() : img;

    if (!media || media.tagName === 'VIDEO') return;



    const wrapRect = wrap.getBoundingClientRect();

    if (wrapRect.width === 0 || wrapRect.height === 0) return;



    const isFlipped = typeof window.isCurrentViewerFlipped === 'function' ? window.isCurrentViewerFlipped() : false;

    const rawXPct = Math.max(0, Math.min(100, ((e.clientX - wrapRect.left) / wrapRect.width) * 100));

    const xPct = isFlipped ? (100 - rawXPct) : rawXPct;

    const yPct = Math.max(0, Math.min(100, ((e.clientY - wrapRect.top) / wrapRect.height) * 100));



    media.style.transformOrigin = `${xPct.toFixed(1)}% ${yPct.toFixed(1)}%`;

  });



  // Mouse wheel to dynamically adjust zoom level (for images only)

  wrap.addEventListener('wheel', (e) => {

    if (!window.isViewerZoomed) return;

    const media = window.getActiveViewerMedia ? window.getActiveViewerMedia() : img;

    if (!media || media.tagName === 'VIDEO') return;



    e.preventDefault();

    if (e.deltaY < 0) {

      window.viewerZoomScale = Math.min(5.0, window.viewerZoomScale + 0.3);

    } else {

      window.viewerZoomScale = Math.max(1.4, window.viewerZoomScale - 0.3);

    }

    if (typeof window.applyViewerTransform === 'function') {

      window.applyViewerTransform(window.viewerZoomScale);

    }

    if (hint) hint.textContent = `🔍 Prisiartinta ${window.viewerZoomScale.toFixed(1)}x • Judinkite pelytę peržiūrai • Paspauskite atstatymui`;

  }, { passive: false });

};



window.openViewer = function(sceneId) {

  const proj = window.getProj();

  if (!proj) return;

  const list = (proj.scenes || []).filter(s => {

    const o = getOutput(s.id);

    if (!o || !o.variations || o.variations.length === 0) return false;

    const main = getMainVariant(o);

    return Boolean(main && (main.url || main.status === 'done' || main.status === 'completed'));

  });



  // Ensure requested sceneId is included even if it has custom structure

  const cleanTarget = String(sceneId).replace(/^S/i, '');

  let listIds = list.map(s => s.id);

  if (sceneId && !listIds.some(id => id === sceneId || String(id).replace(/^S/i, '') === cleanTarget)) {

    const directSc = (proj.scenes || []).find(s => s.id === sceneId || String(s.id).replace(/^S/i, '') === cleanTarget);

    if (directSc) {

      listIds.push(directSc.id);

    } else {

      listIds.push(sceneId);

    }

  }



  if (listIds.length === 0) return;

  state.viewerContext = 'scene'; 

  state.viewerList = listIds;

  const foundIdx = state.viewerList.findIndex(id => id === sceneId || String(id).replace(/^S/i, '') === cleanTarget);

  state.viewerIndex = foundIdx !== -1 ? foundIdx : 0;

  if (typeof window.resetViewerZoom === 'function') window.resetViewerZoom();

  window.updateViewer(); 

  $("#viewer")?.classList.add("show");

  if (typeof window.setupViewerZoomAndPan === 'function') window.setupViewerZoomAndPan();

};



window.closeViewer = function() {

  const viewer = $("#viewer");

  if (viewer) viewer.classList.remove("show");

  if (typeof window.resetViewerZoom === 'function') window.resetViewerZoom();

  const vwVideo = $("#vwVideo");

  if (vwVideo) {

    try {

      vwVideo.pause();

      vwVideo.muted = true;

    } catch(e){}

    vwVideo.removeAttribute('data-active-src');

    vwVideo.removeAttribute('src');

    vwVideo.src = "";

    vwVideo.style.display = "none";

    try { vwVideo.load(); } catch(e){}

  }

  const vwImg = $("#vwImg");

  if (vwImg) {

    vwImg.removeAttribute('src');

    vwImg.src = "";

  }



  // Also stop any SFX audio or synchronized video audio

  if (window._viewerSfxAudio) {

    try {

      window._viewerSfxAudio.pause();

      window._viewerSfxAudio.currentTime = 0;

    } catch(e) {}

    window._viewerSfxAudio = null;

  }

  if (window._standaloneSfxAudio) {

    try {

      window._standaloneSfxAudio.pause();

    } catch(e) {}

    window._standaloneSfxAudio = null;

  }

  document.querySelectorAll('.btn-scene-sfx').forEach(b => {

    b.innerHTML = '🔊 Klausytis SFX';

    b.dataset.isPlaying = 'false';

  });



  // Also stop any narration / speech synthesis or scene audio triggered from inside the viewer

  if (window._currentPlayingAudio) {

    try {

      window._currentPlayingAudio.pause();

      window._currentPlayingAudio.ontimeupdate = null;

      window._currentPlayingAudio.onended = null;

    } catch(e) {}

    window._currentPlayingAudio = null;

  }

  if ('speechSynthesis' in window) {

    try { window.speechSynthesis.cancel(); } catch(e) {}

  }

  document.querySelectorAll('.btn-scene-audio').forEach(b => {

    b.classList.remove('btn-scene-audio-playing');

    b.innerHTML = '🔊 Klausytis';

    b.dataset.isPlaying = 'false';

  });



  // Scroll to and highlight the active scene card when exiting full screen viewer

  if (state.viewerList && state.viewerList.length > 0 && state.viewerIndex >= 0) {

    const activeId = state.viewerList[state.viewerIndex];

    if (activeId) {

      setTimeout(() => {

        const cleanId = String(activeId).replace(/^S/i, '');

        const card = document.querySelector(`[data-scene-id="${activeId}"]`) || 

                     document.querySelector(`[data-scene-id="${cleanId}"]`) || 

                     document.querySelector(`[data-scene-id="S${cleanId}"]`) ||

                     document.getElementById(`scene-card-${activeId}`) ||

                     document.getElementById(`scene-card-${cleanId}`) ||

                     document.getElementById(`char-card-${activeId}`);

        if (card) {

          card.scrollIntoView({ behavior: 'smooth', block: 'center' });

          card.style.transition = 'box-shadow 0.3s ease, transform 0.3s ease';

          card.style.boxShadow = '0 0 25px #00ffcc';

          card.style.transform = 'scale(1.02)';

          setTimeout(() => {

            card.style.boxShadow = '';

            card.style.transform = '';

          }, 2500);

        }

      }, 60);

    }

  }

};



window.viewerRegenerate = function() {

  if (!state.viewerList || state.viewerList.length === 0) return;

  const currentId = state.viewerList[state.viewerIndex];

  if (state.viewerContext === 'char') {

    const proj = window.getProj();

    const charData = (proj && proj.charRefs) ? proj.charRefs[currentId] : null;

    const main = charData ? (window.getCharMainVariant ? window.getCharMainVariant(charData) : null) : null;

    const isMainImg = main && main.url && (
        main.url.toLowerCase().endsWith('.jpg') ||
        main.url.toLowerCase().endsWith('.jpeg') ||
        main.url.toLowerCase().endsWith('.png') ||
        main.url.toLowerCase().endsWith('.webp')
    );
    const isVideo = Boolean(main && !isMainImg && ((main.type === 'video') || (main.url && (main.url.toLowerCase().endsWith('.mp4') || main.url.toLowerCase().endsWith('.webm'))) || (main.wfMode && main.wfMode.includes('I2V'))));

    if (isVideo && typeof window.doRegenerateVideo === 'function') {

      window.doRegenerateVideo(currentId, main, 'char');

    } else if (typeof window.doGenerateChar === 'function') {

      window.doGenerateChar(currentId, { randomize: true, seed: Math.floor(Math.random() * 9999999999) }, {}, 1);

    }

  } else {

    const out = getOutput(currentId);

    if (out) {

      const main = getMainVariant(out);

      window.doRegenerate(currentId, main ? main.id : null);

    }

  }

};



window.viewerFurtherEdit = function() {

  if (!state.viewerList || state.viewerList.length === 0) return;

  const currentId = state.viewerList[state.viewerIndex];

  if (!currentId) return;

  const vwVideo = $("#vwVideo");

  if (vwVideo) { try { vwVideo.pause(); } catch(e){} }

  const isChar = state.viewerContext === 'char';

  window.openFurtherEdit(currentId, isChar ? 'char' : 'scene');

};



window.viewerInpaint = function() {

  if (!state.viewerList || state.viewerList.length === 0) return;

  const currentId = state.viewerList[state.viewerIndex];

  if (!currentId) return;

  const vwVideo = $("#vwVideo");

  if (vwVideo) { try { vwVideo.pause(); } catch(e){} }

  const isChar = state.viewerContext === 'char';

  if (typeof window.openInpaintStudio === 'function') {

    window.openInpaintStudio(currentId, isChar ? 'char' : 'scene');

  }

};



window.viewerVideoStudio = function() {

  if (!state.viewerList || state.viewerList.length === 0) return;

  const currentId = state.viewerList[state.viewerIndex];

  if (!currentId) return;

  const vwVideo = $("#vwVideo");

  if (vwVideo) { try { vwVideo.pause(); } catch(e){} }

  const isChar = state.viewerContext === 'char';

  if (typeof window.openVideoStudio === 'function') {

    window.openVideoStudio(currentId, isChar ? 'char' : 'scene');

  }

};



window.viewerToggleFlip = function() {

  const proj = window.getProj();

  if (!proj || !state.viewerList || state.viewerList.length === 0) return;

  const currentId = state.viewerList[state.viewerIndex];

  if (!currentId) return;

  const isChar = state.viewerContext === 'char';

  const cleanId = String(currentId).replace(/^S/i, '');



  const currentlyFlipped = typeof window.isCurrentViewerFlipped === 'function' ? window.isCurrentViewerFlipped() : false;

  const newFlipped = !currentlyFlipped;



  if (isChar) {

    const charData = proj.charRefs ? proj.charRefs[currentId] : null;

    if (charData) {

      charData.flipH = newFlipped;

      if (!charData.params) charData.params = {};

      charData.params.flipH = newFlipped;

      if (charData.variations) {

        charData.variations.forEach(v => {

          if (v.id === charData.mainId) {

            v.flipH = newFlipped;

            if (!v.params) v.params = {};

            v.params.flipH = newFlipped;

          }

        });

      }

    }

  } else {

    const out = window.getOutput ? window.getOutput(currentId) : (proj.outputs ? proj.outputs.find(o => o && (o.sceneId === currentId || String(o.sceneId).replace(/^S/i, '') === cleanId)) : null);

    if (out) {

      out.flipH = newFlipped;

      if (!out.params) out.params = {};

      out.params.flipH = newFlipped;

      if (out.variations && out.variations.length > 0) {

        const main = (window.getMainVariant ? window.getMainVariant(out) : null) || out.variations.find(v => v.id === out.mainId) || out.variations[out.variations.length - 1];

        if (main) {

          main.flipH = newFlipped;

          if (!main.params) main.params = {};

          main.params.flipH = newFlipped;

        }

      }

    }

    const sc = proj.scenes ? proj.scenes.find(s => s && (s.id === currentId || String(s.id).replace(/^S/i, '') === cleanId)) : null;

    if (sc) {

      sc.flipH = newFlipped;

      if (!sc.params) sc.params = {};

      sc.params.flipH = newFlipped;

    }

  }



  // Save to DB

  window.saveProjectToDB(state.currentProjectId);



  // Update viewer visual transform immediately

  if (typeof window.applyViewerTransform === 'function') {

    window.applyViewerTransform(window.isViewerZoomed ? window.viewerZoomScale : 1);

  }



  // Update button state in action bar

  const btnFlip = document.getElementById("vwBtnFlip");

  const lblFlip = document.getElementById("vwFlipLbl");

  if (btnFlip) {

    if (newFlipped) {

      btnFlip.style.background = "rgba(6, 182, 212, 0.45)";

      btnFlip.style.borderColor = "#22d3ee";

      btnFlip.style.boxShadow = "0 0 14px rgba(34, 211, 238, 0.6)";

      btnFlip.style.color = "#fff";

      if (lblFlip) lblFlip.textContent = "Veidrodis: ĮJ";

    } else {

      btnFlip.style.background = "rgba(6, 182, 212, 0.15)";

      btnFlip.style.borderColor = "rgba(6, 182, 212, 0.4)";

      btnFlip.style.boxShadow = "none";

      btnFlip.style.color = "#22d3ee";

      if (lblFlip) lblFlip.textContent = "Veidrodis (M)";

    }

  }



  // Refresh scene / char cards so thumbnails and badges immediately update

  if (typeof window.triggerUIRefresh === 'function') {

    window.triggerUIRefresh(isChar ? 'chars' : 'images');

  }



  if (typeof toast === 'function') {

    toast("Veidrodinis efektas", newFlipped ? "Veidrodis ĮJUNGTAS (Horizontal Flip ✓)" : "Veidrodis IŠJUNGTAS (Originalas)", "info");

  }

};



window.viewerEditParams = function() {

  if (!state.viewerList || state.viewerList.length === 0) return;

  const currentId = state.viewerList[state.viewerIndex];

  const vwVideo = $("#vwVideo");

  if (vwVideo) { try { vwVideo.pause(); } catch(e){} }

  if (state.viewerContext === 'char') {

    if (typeof window.openCharEdit === 'function') window.openCharEdit(currentId);

  } else {

    window.openEdit(currentId);

  }

};



window.viewerDownload = function() {

  if (!state.viewerList || state.viewerList.length === 0) return;

  const currentId = state.viewerList[state.viewerIndex];

  if (state.viewerContext === 'char') {

    const proj = window.getProj();

    const data = proj.charRefs[currentId];

    if (data) {

      const main = window.getCharMainVariant ? window.getCharMainVariant(data) : null;

      if (main && main.url) {

        fetch(main.url).then(r => r.blob()).then(blob => {

          let ext = 'png';

          try {

            const clean = main.url.split('?')[0].split('#')[0];

            if (clean.includes('.')) ext = clean.split('.').pop().toLowerCase();

          } catch(e) {}

          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${currentId}_char.${ext}`;

          document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);

        });

      }

    }

  } else {

    window.downloadSingle(currentId);

  }

};



window.viewerOpenVars = function() {

  if (!state.viewerList || state.viewerList.length === 0) return;

  const currentId = state.viewerList[state.viewerIndex];

  if (state.viewerContext === 'char') {

    if (typeof window.openCharVars === 'function') window.openCharVars(currentId);

  } else {

    window.openVars(currentId);

  }

};



window.viewerDelete = function() {

  if (!state.viewerList || state.viewerList.length === 0) return;

  const currentId = state.viewerList[state.viewerIndex];

  if (confirm(`Delete output for ${currentId}?`)) {

    if (state.viewerContext === 'char') {

      const proj = window.getProj();

      delete proj.charRefs[currentId];

      window.saveCurrentProject();

      if (typeof window.renderCharRefs === 'function') window.renderCharRefs();

    } else {

      window.getProj().outputs = window.getProj().outputs.filter(o => o.sceneId !== currentId);

      window.saveCurrentProject();

      if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images'); else window.renderImages();

    }

    state.viewerList.splice(state.viewerIndex, 1);

    if (state.viewerList.length === 0) {

      if (typeof window.closeViewer === 'function') window.closeViewer();

      else $("#viewer").classList.remove("show");

    } else {

      if (state.viewerIndex >= state.viewerList.length) state.viewerIndex = state.viewerList.length - 1;

      window.updateViewer();

    }

  }

};



window.updateViewer = function() {

  const proj = window.getProj();

  const isChar = state.viewerContext === 'char'; 

  if (!state.viewerList || state.viewerList.length === 0) return;

  const currentId = state.viewerList[state.viewerIndex];

  let main, p, uiText = '', titleStr = '', wfMode = '', extraMetaHtml = '', vCount = 0;

  let scObj = null, isKinetic = false, kSc = null;



  if (isChar) {

     const data = proj.charRefs[currentId]; if(!data) return; 

     main = window.getCharMainVariant ? window.getCharMainVariant(data) : null; 

     if(!main) return;

     p = data.params; titleStr = `Character Ref: ${currentId}`; wfMode = main.wfMode;

     vCount = data.variations ? data.variations.length : 0;

     if(main.sourceVarId) extraMetaHtml = `<div class="mb-2" style="color:var(--warn)"><strong>✨ EDITED FROM:</strong> Var ${main.sourceVarId}</div>`;

  } else {

     const out = getOutput(currentId);

     scObj = proj.scenes.find(s => s.id === currentId || String(s.id) === String(currentId).replace(/^S/i, ''));

     isKinetic = Boolean(scObj && window.isKineticTextScene(scObj));



     kSc = (proj.kineticScenes || []).find(k => String(k.id) === String(currentId) || String(k.id) === String(currentId).replace(/^S/i, ''));

     const kinBg = (scObj && scObj.bgMedia) || (kSc && kSc.bgMedia) || '';



     if (out && out.variations && out.variations.length > 0) {

         main = getMainVariant(out);

         p = out.params || scObj || {};

         if (isKinetic && kinBg && (!main || !main.url || main.url === '/base/empty_scene.png')) {

             main = { ...(main || {}), url: kinBg, createdAt: main?.createdAt || 'Text Writer' };

         }

     } else if (isKinetic) {

         main = { url: kinBg || '/base/empty_scene.png', createdAt: 'Text Writer' };

         p = scObj || {};

     } else if (out) {

         main = getMainVariant(out);

         p = out.params || scObj || {};

     } else {

         main = { url: '/base/empty_scene.png', createdAt: '-' };

         p = scObj || {};

     }

     

     const cleanCId = String(currentId);

     const numCId = cleanCId.replace(/^S/i, '');

     uiText = (proj.sceneTextById && (proj.sceneTextById[cleanCId] || proj.sceneTextById[numCId] || proj.sceneTextById[`S${numCId}`])) || (scObj ? scObj.text : '') || ''; 

     titleStr = `Scene ${currentId}`; 

     wfMode = main?.wfMode || (isKinetic ? 'Kinetic Text' : 'Standard');

     vCount = out?.variations ? out.variations.length : 0;

     if(main?.sourceVarId) extraMetaHtml = `<div class="mb-2" style="color:var(--warn)"><strong>✨ EDITED FROM:</strong> Var ${main.sourceVarId}</div>`;

  }



  if (typeof window.resetViewerZoom === 'function') window.resetViewerZoom();

  const vwImg = $("#vwImg");

  const vwVideo = $("#vwVideo");

  const isImg = main && main.url && (
      main.url.toLowerCase().endsWith('.jpg') ||
      main.url.toLowerCase().endsWith('.jpeg') ||
      main.url.toLowerCase().endsWith('.png') ||
      main.url.toLowerCase().endsWith('.webp')
  );
  const isVid = main && main.url && !isImg && (
      main.url.toLowerCase().endsWith('.mp4') ||
      main.url.toLowerCase().endsWith('.webm') ||
      main.type === 'video'
  );



  const isFlipped = typeof window.isCurrentViewerFlipped === 'function' ? window.isCurrentViewerFlipped() : false;

  if (typeof window.applyViewerTransform === 'function') {

    window.applyViewerTransform(1);

  }



  const btnFlip = document.getElementById("vwBtnFlip");

  const lblFlip = document.getElementById("vwFlipLbl");

  if (btnFlip) {

      if (isFlipped) {

          btnFlip.style.background = "rgba(6, 182, 212, 0.45)";

          btnFlip.style.borderColor = "#22d3ee";

          btnFlip.style.boxShadow = "0 0 14px rgba(34, 211, 238, 0.6)";

          btnFlip.style.color = "#fff";

          if (lblFlip) lblFlip.textContent = "Veidrodis: ĮJ";

      } else {

          btnFlip.style.background = "rgba(6, 182, 212, 0.15)";

          btnFlip.style.borderColor = "rgba(6, 182, 212, 0.4)";

          btnFlip.style.boxShadow = "none";

          btnFlip.style.color = "#22d3ee";

          if (lblFlip) lblFlip.textContent = "Veidrodis (M)";

      }

  }



  const vwAudioMixerWrap = document.getElementById("vwAudioMixerWrap");

  const vwVoiceMuteBtn = document.getElementById("vwVoiceMuteBtn");

  const vwVoiceSlider = document.getElementById("vwVoiceSlider");

  const vwVoiceVolLbl = document.getElementById("vwVoiceVolLbl");

  const vwSfxMuteBtn = document.getElementById("vwSfxMuteBtn");

  const vwSfxSlider = document.getElementById("vwSfxSlider");

  const vwSfxVolLbl = document.getElementById("vwSfxVolLbl");



  const vwBtnTrim = document.getElementById("vwBtnTrim");



  const cleanScId = String(currentId || '');

  const numScId = cleanScId.replace(/^S/i, '');

  const sfxUrl = (proj.sceneSfxById && (

      proj.sceneSfxById[cleanScId] ||

      proj.sceneSfxById[cleanScId.toLowerCase()] ||

      proj.sceneSfxById[cleanScId.toUpperCase()] ||

      proj.sceneSfxById[numScId] ||

      proj.sceneSfxById['s' + numScId] ||

      proj.sceneSfxById['S' + numScId]

  )) || (scObj && (scObj.sfx_audio || scObj.sfxUrl)) || (main && (main.sfxUrl || main.sfx_audio)) || null;



  if (isVid && vwVideo) {

      if (vwBtnTrim) {

          vwBtnTrim.style.display = "inline-flex";

          vwBtnTrim.onclick = () => {

              if (typeof window.openVideoTrimmer === 'function') {

                  window.openVideoTrimmer(currentId);

              }

          };

      }

      if (vwImg) vwImg.style.display = "none";

      vwVideo.style.display = "block";

      const targetSrc = (main && main.url) ? main.url : '';

      const curSrc = vwVideo.getAttribute('src') || '';

      if (!curSrc || curSrc !== targetSrc || vwVideo.getAttribute('data-active-src') !== targetSrc) {

          vwVideo.setAttribute('data-active-src', targetSrc);

          vwVideo.src = targetSrc;

          try { vwVideo.load(); } catch(e){}

      }

      vwVideo.currentTime = 0;



      // 1. Voice Settings (Video dialogue)

      const mixEntry = (proj.renderSettings?.sceneVolumes && (proj.renderSettings.sceneVolumes[numScId] || proj.renderSettings.sceneVolumes[cleanScId] || proj.renderSettings.sceneVolumes[`S${numScId}`])) || null;

      let isVoiceEnabled = true;

      let voiceVol = 1.0;

      if (mixEntry) {

          isVoiceEnabled = mixEntry.enabled !== false;

          voiceVol = typeof mixEntry.volume === 'number' ? mixEntry.volume : 1.0;

      } else {

          isVoiceEnabled = (main && main.soundEnabled !== undefined) ? Boolean(main.soundEnabled) : true;

          voiceVol = (main && typeof main.soundVolume === 'number') ? main.soundVolume : 1.0;

      }

      voiceVol = Math.max(0, Math.min(1, voiceVol));



            const hasDialogue = Boolean(scObj?.speaker || scObj?.text || scObj?.h3_prompt || main?.params?.isLipSync || main?.wfMode?.includes('LipSync'));

      // Jei scena neturi dialogo, paslepiame Balso slankiklį ir skirtuką
      if (vwVoiceSlider && vwVoiceSlider.parentElement) {
          vwVoiceSlider.parentElement.style.display = hasDialogue ? "flex" : "none";
      }
      const vwSep = document.getElementById("vwAudioSep") || document.querySelector("#vwAudioMixerWrap > div[style*='width: 1px']");
      if (vwSep) {
          vwSep.style.display = hasDialogue ? "block" : "none";
      }

      // 2. SFX Settings (MMAudio ambient background OR Native Video SFX)
      let isSfxEnabled = true;
      let sfxVol = 0.70;
      if (mixEntry && mixEntry.sfxVolume !== undefined) {
          sfxVol = typeof mixEntry.sfxVolume === 'number' ? mixEntry.sfxVolume : 0.70;
          isSfxEnabled = mixEntry.sfxEnabled !== false;
      }
      sfxVol = Math.max(0, Math.min(1, sfxVol));

      // Patikriname, kuri SFX variacija (Native ar MMAudio) aktyvi
      const sfxVarsListForMix = (proj.sceneSfxVarsById && (
          proj.sceneSfxVarsById[cleanScId] ||
          proj.sceneSfxVarsById[cleanScId.toLowerCase()] ||
          proj.sceneSfxVarsById[cleanScId.toUpperCase()] ||
          proj.sceneSfxVarsById[numScId] ||
          proj.sceneSfxVarsById['s' + numScId] ||
          proj.sceneSfxVarsById['S' + numScId]
      )) || [];
      const activeSfxVarForMix = sfxVarsListForMix.find(v => v.isMain) || sfxVarsListForMix[0] || null;
      const isNativeActive = Boolean(activeSfxVarForMix && (activeSfxVarForMix.isNative || activeSfxVarForMix.name?.includes('Native')));

      if (hasDialogue) {
          vwVideo.muted = !isVoiceEnabled;
          vwVideo.volume = isVoiceEnabled ? voiceVol : 0;
      } else {
          // Scene be dialogo: garsą valdo SFX nustatymai!
          if (isNativeActive || !sfxUrl) {
              vwVideo.muted = !isSfxEnabled;
              vwVideo.volume = isSfxEnabled ? sfxVol : 0;
          } else {
              // Vartotojas pasirinko išorinį MMAudio dublį (Take #2): nutildome paties video garsą, kad jie nesimaišytų!
              vwVideo.muted = true;
              vwVideo.volume = 0;
          }
      }

      // Manage synchronized SFX Audio instance (tik jei tai išorinis SFX, o ne pats video)
      if (window._viewerSfxAudio) {
          try {
              window._viewerSfxAudio.pause();
              window._viewerSfxAudio.currentTime = 0;
          } catch(e) {}
      }
      if (sfxUrl && (hasDialogue || !isNativeActive)) {
          const freshSfxUrl = sfxUrl + (sfxUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
          window._viewerSfxAudio = new Audio(freshSfxUrl);
          window._viewerSfxAudio.loop = true;
          window._viewerSfxAudio.volume = isSfxEnabled ? sfxVol : 0;
          window._viewerSfxAudio.muted = !isSfxEnabled;
      } else {
          window._viewerSfxAudio = null;
      }

      // Sync video playback events with _viewerSfxAudio in real-time
      vwVideo.onplay = () => {
          if (window._viewerSfxAudio && (hasDialogue || !isNativeActive)) {
              if (isSfxEnabled && sfxVol > 0 && !window._viewerSfxAudio.muted && !document.hidden) {
                  window._viewerSfxAudio.currentTime = vwVideo.currentTime;
                  window._viewerSfxAudio.play().catch(e => console.warn("[SFX play]", e));
              } else {
                  try { window._viewerSfxAudio.pause(); } catch(e){}
              }
          }
      };
      vwVideo.onpause = () => {
          if (window._viewerSfxAudio) {
              window._viewerSfxAudio.pause();
          }
      };
      vwVideo.onseeking = () => {
          if (window._viewerSfxAudio) {
              window._viewerSfxAudio.currentTime = vwVideo.currentTime;
          }
      };
      vwVideo.onseeked = () => {
          if (window._viewerSfxAudio) {
              window._viewerSfxAudio.currentTime = vwVideo.currentTime;
          }
      };
      vwVideo.ontimeupdate = () => {
          if (window._viewerSfxAudio && Math.abs(window._viewerSfxAudio.currentTime - vwVideo.currentTime) > 0.3) {
              window._viewerSfxAudio.currentTime = vwVideo.currentTime;
          }
      };
      vwVideo.onended = () => {
          if (window._viewerSfxAudio) {
              window._viewerSfxAudio.currentTime = 0;
          }
      };

      // UI Controls:

      if (vwAudioMixerWrap) {

          vwAudioMixerWrap.style.display = "flex";

      }



      // Voice Controls

      if (vwVoiceSlider) {

          vwVoiceSlider.value = isVoiceEnabled ? Math.round(voiceVol * 100) : 0;

          vwVoiceSlider.oninput = (e) => {

              const val = parseInt(e.target.value, 10);

              const vol = val / 100.0;

              vwVideo.volume = vol;

              vwVideo.muted = (val === 0);

              isVoiceEnabled = (val > 0);

              voiceVol = vol;

              if (vwVoiceVolLbl) vwVoiceVolLbl.textContent = `${val}%`;

              if (vwVoiceMuteBtn) vwVoiceMuteBtn.style.opacity = (val === 0) ? "0.4" : "1";

              

              if (!proj.renderSettings) proj.renderSettings = {};

              if (!proj.renderSettings.sceneVolumes) proj.renderSettings.sceneVolumes = {};

              const curEntry = proj.renderSettings.sceneVolumes[cleanScId] || {};

              curEntry.volume = vol;

              curEntry.enabled = (val > 0);

              proj.renderSettings.sceneVolumes[cleanScId] = curEntry;

              proj.renderSettings.sceneVolumes[numScId] = curEntry;

          };

          vwVoiceSlider.onchange = () => {

              if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();

          };

      }

      if (vwVoiceMuteBtn) {

          vwVoiceMuteBtn.style.opacity = isVoiceEnabled && voiceVol > 0 ? "1" : "0.4";

          vwVoiceMuteBtn.onclick = () => {

              if (vwVideo.muted || vwVideo.volume === 0) {

                  const restore = voiceVol > 0 ? voiceVol : 1.0;

                  vwVideo.muted = false;

                  vwVideo.volume = restore;

                  if (vwVoiceSlider) vwVoiceSlider.value = Math.round(restore * 100);

                  if (vwVoiceVolLbl) vwVoiceVolLbl.textContent = `${Math.round(restore * 100)}%`;

                  vwVoiceMuteBtn.style.opacity = "1";

              } else {

                  vwVideo.muted = true;

                  if (vwVoiceSlider) vwVoiceSlider.value = 0;

                  if (vwVoiceVolLbl) vwVoiceVolLbl.textContent = "0%";

                  vwVoiceMuteBtn.style.opacity = "0.4";

              }

              if (vwVoiceSlider) vwVoiceSlider.dispatchEvent(new Event('input'));

              if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();

          };

      }

      if (vwVoiceVolLbl) {

          vwVoiceVolLbl.textContent = isVoiceEnabled ? `${Math.round(voiceVol * 100)}%` : "0%";

      }



      // SFX Controls
      if (vwSfxSlider) {
          vwSfxSlider.value = isSfxEnabled ? Math.round(sfxVol * 100) : 0;
          vwSfxSlider.oninput = (e) => {
              const val = parseInt(e.target.value, 10);
              const vol = val / 100.0;
              sfxVol = vol;
              isSfxEnabled = (val > 0);
              if (window._viewerSfxAudio) {
                  window._viewerSfxAudio.volume = vol;
                  window._viewerSfxAudio.muted = (val === 0);
              }
              // Jei scena neturi dialogo ARBA jei aktyvus Take yra Native:
              // Reguliuojame paties video grotuvo garsą!
              if (vwVideo && (!hasDialogue || isNativeActive || !sfxUrl)) {
                  vwVideo.volume = vol;
                  vwVideo.muted = (val === 0);
              }
              if (vwSfxVolLbl) vwSfxVolLbl.textContent = `${val}%`;
              if (vwSfxMuteBtn) vwSfxMuteBtn.style.opacity = (val === 0) ? "0.4" : "1";
              
              if (!proj.renderSettings) proj.renderSettings = {};
              if (!proj.renderSettings.sceneVolumes) proj.renderSettings.sceneVolumes = {};
              const curEntry = proj.renderSettings.sceneVolumes[cleanScId] || {};
              curEntry.sfxVolume = vol;
              curEntry.sfxEnabled = (val > 0);
              proj.renderSettings.sceneVolumes[cleanScId] = curEntry;
              proj.renderSettings.sceneVolumes[numScId] = curEntry;
          };
          vwSfxSlider.onchange = () => {
              if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
          };
      }
      if (vwSfxMuteBtn) {
          vwSfxMuteBtn.style.opacity = isSfxEnabled && sfxVol > 0 ? "1" : "0.4";
          vwSfxMuteBtn.onclick = () => {
              const isCurrentlyMuted = (!isSfxEnabled || sfxVol === 0 || 
                                       (window._viewerSfxAudio && window._viewerSfxAudio.muted) ||
                                       (vwVideo && (!hasDialogue || isNativeActive || !sfxUrl) && vwVideo.muted));
              if (isCurrentlyMuted) {
                  const restore = sfxVol > 0 ? sfxVol : 0.70;
                  isSfxEnabled = true;
                  sfxVol = restore;
                  if (window._viewerSfxAudio) {
                      window._viewerSfxAudio.muted = false;
                      window._viewerSfxAudio.volume = restore;
                  }
                  if (vwVideo && (!hasDialogue || isNativeActive || !sfxUrl)) {
                      vwVideo.muted = false;
                      vwVideo.volume = restore;
                  }
                  if (vwSfxSlider) vwSfxSlider.value = Math.round(restore * 100);
                  if (vwSfxVolLbl) vwSfxVolLbl.textContent = `${Math.round(restore * 100)}%`;
                  vwSfxMuteBtn.style.opacity = "1";
              } else {
                  isSfxEnabled = false;
                  if (window._viewerSfxAudio) {
                      window._viewerSfxAudio.muted = true;
                  }
                  if (vwVideo && (!hasDialogue || isNativeActive || !sfxUrl)) {
                      vwVideo.muted = true;
                  }
                  if (vwSfxSlider) vwSfxSlider.value = 0;
                  if (vwSfxVolLbl) vwSfxVolLbl.textContent = "0%";
                  vwSfxMuteBtn.style.opacity = "0.4";
              }
              if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
          };
      }

      if (vwSfxVolLbl) {

          vwSfxVolLbl.textContent = isSfxEnabled ? `${Math.round(sfxVol * 100)}%` : "0%";

      }



      const isViewerOpen = document.getElementById('viewer')?.classList.contains('show');

      const shouldAutoplay = !document.hidden && Boolean(isViewerOpen);



      if (shouldAutoplay) {

          const playPromise = vwVideo.play();

          if (playPromise !== undefined) {

              playPromise.catch(err => {

                  console.warn("[Viewer Video AutoPlay blocked]", err);

                  if (!vwVideo.muted) {

                      vwVideo.muted = true;

                      vwVideo.play().catch(()=>{});

                  }

              });

          }

      } else {

          try { vwVideo.pause(); } catch(e){}

          if (window._viewerSfxAudio) {

              try { window._viewerSfxAudio.pause(); } catch(e){}

          }

      }

  } else {

      if (vwBtnTrim) vwBtnTrim.style.display = "none";

      if (vwAudioMixerWrap) vwAudioMixerWrap.style.display = "none";

      if (window._viewerSfxAudio) {

          try {

              window._viewerSfxAudio.pause();

              window._viewerSfxAudio.currentTime = 0;

          } catch(e) {}

          window._viewerSfxAudio = null;

      }

      if (vwVideo) {

          try { vwVideo.pause(); } catch(e){}

          vwVideo.removeAttribute('data-active-src');

          vwVideo.removeAttribute('src');

          vwVideo.src = "";

          vwVideo.style.display = "none";

          try { vwVideo.load(); } catch(e){}

      }

      if (vwImg && main && main.url) {

          vwImg.style.display = "block";

          vwImg.src = main.url;

      }

  }



  const btnRegen = document.getElementById("vwBtnRegen");

  const lblRegen = document.getElementById("vwRegenLbl");

  if (btnRegen) {

    if (isVid) {

      btnRegen.title = "Regenerate Video / Nauja video variacija (R)";

      if (lblRegen) lblRegen.textContent = "Regen Video (R)";

    } else {

      btnRegen.title = "Regenerate / Add Variation (R)";

      if (lblRegen) lblRegen.textContent = "Regen (R)";

    }

  }



  const hintEl = document.getElementById("vwZoomHint");

  if (hintEl && !window.isViewerZoomed) {

    if (isVid) {

      hintEl.textContent = '🔍 Spustelėkite arba naudokite ratuką video priartinimui • M veidrodžiui';

    } else {

      hintEl.textContent = '🔍 Paspauskite norimoje vietoje prisiartinimui';

    }

  }



  $("#vwTitle").textContent = titleStr; 

  $("#vwSub").textContent = `${state.viewerIndex+1} / ${state.viewerList.length} • ${main?.createdAt || '-'}`;



  const varsLblEl = $("#vwVarsLbl");

  if (varsLblEl) varsLblEl.textContent = `Vars (V): ${vCount}`;



  // FX properties for this scene

  let dur = scObj ? (scObj.duration || 4.0) : 4.0;

  const tlItem = (proj.timeline || []).find(t => String(t.id) === String(currentId) || String(t.id) === String(currentId).replace(/^S/i, ''));

  if (tlItem && (tlItem.dur || tlItem.duration)) {

      dur = parseFloat(tlItem.dur || tlItem.duration);

  }

  const curMotion = scObj ? (scObj.cameraMotion || scObj.kenBurns || 'constant_speed') : 'constant_speed';

  const curTrans = scObj ? (scObj.transition || 'dissolve') : 'dissolve';

  if (!kSc) kSc = (proj.kineticScenes || []).find(k => String(k.id) === String(currentId) || String(k.id) === String(currentId).replace(/^S/i, ''));

  let curKinetic = 'none';

  if (isKinetic) {

      curKinetic = scObj?.kineticEffect || (kSc ? kSc.effect : 'typewriter') || 'typewriter';

  } else {

      curKinetic = scObj?.kineticEffect || scObj?.textEffect || 'none';

  }



  const isSfxGen = !!(window._generatingSfxByScene && (

      window._generatingSfxByScene[currentId] || 

      window._generatingSfxByScene[String(currentId).toLowerCase()] || 

      window._generatingSfxByScene[String(currentId).toUpperCase()] || 

      window._generatingSfxByScene[String(currentId).replace(/^S/i,'')] ||

      window._generatingSfxByScene['s' + String(currentId).replace(/^S/i,'')] ||

      window._generatingSfxByScene['S' + String(currentId).replace(/^S/i,'')]

  ));



  const sfxVarsList = (proj.sceneSfxVarsById && (

      proj.sceneSfxVarsById[cleanScId] ||

      proj.sceneSfxVarsById[cleanScId.toLowerCase()] ||

      proj.sceneSfxVarsById[cleanScId.toUpperCase()] ||

      proj.sceneSfxVarsById[numScId] ||

      proj.sceneSfxVarsById['s' + numScId] ||

      proj.sceneSfxVarsById['S' + numScId]

  )) || [];



  const metaHtml = `

    <div style="display:flex; flex-direction:column; gap:10px;">

      

      ${!isChar ? `

      <!-- AUDIO & SCRIPT CONTROLS -->

      <div style="background: rgba(0,255,204,0.05); border: 1px solid rgba(0,255,204,0.25); border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">

        <div class="flex justify-between items-center">

          <span style="font-size: 10px; font-weight: 800; color: #00ffcc; text-transform: uppercase;">🎙️ Įgarsinimas & Tekstas</span>

          <button type="button" class="btn-scene-audio" onclick="if(typeof window.playSceneAudio==='function') window.playSceneAudio('${currentId}', this);">

            🔊 Klausytis

          </button>

        </div>

        <div style="font-size: 12px; font-weight: 700; color: #fff; line-height: 1.4; padding-top: 2px;">

          ${escapeHtml(uiText || scObj?.text || '(Be scenarijaus teksto)')}

        </div>

      </div>



            <!-- SFX AUDIO (MMAUDIO) & REGEN CONTROLS -->

      <div style="background: rgba(245, 158, 11, 0.05); border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">

        <div class="flex justify-between items-center">

          <span style="font-size: 10px; font-weight: 800; color: #fbbf24; text-transform: uppercase;">🔊 SFX Garsas (MMAudio)</span>

          <div class="flex items-center" style="gap: 6px;">

            <button type="button" class="btn-scene-sfx" id="vwBtnPlaySfx" style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.4); color: #fbbf24; font-size: 10.5px; padding: 2px 7px; border-radius: 5px; cursor: pointer;" onclick="if(typeof window.playSceneSfxAudio==='function') window.playSceneSfxAudio('${currentId}', this);">

              🔊 Klausytis SFX

            </button>

            ${isSfxGen 

              ? `<button type="button" id="vwBtnRegenSfx" disabled style="background: rgba(245, 158, 11, 0.25); border: 1px solid #fbbf24; color: #fbbf24; font-size: 10.5px; padding: 2px 7px; border-radius: 5px; cursor: not-allowed; font-weight: 700; opacity: 0.85;"><span class="spin-anim">⏳</span> Generuojamas SFX...</button>`

              : `<button type="button" id="vwBtnRegenSfx" style="background: rgba(245, 158, 11, 0.25); border: 1px solid #fbbf24; color: #fff; font-size: 10.5px; padding: 2px 7px; border-radius: 5px; cursor: pointer; font-weight: 700;" onclick="if(typeof window.viewerRegenerateSfx==='function') window.viewerRegenerateSfx('${currentId}', this);" title="Iš naujo sugeneruoti šios scenos fono garsus pagal SFX promptą">🔄 Pergeneruoti</button>`

            }

          </div>

        </div>

        <div style="display: flex; gap: 6px; align-items: center; margin-top: 2px;">

          <input type="text" id="vwSfxPromptInput" value="${escapeHtml(scObj?.sfx_prompt || '')}" placeholder="pvz. footsteps in snow, heavy wind, coat rustling" style="flex: 1; padding: 4px 8px; font-size: 11px; background: rgba(0,0,0,0.3); border: 1px solid rgba(245,158,11,0.3); border-radius: 5px; color: #fff;" />

          <button type="button" class="btn text-xs" style="padding: 4px 8px; font-size: 10px;" onclick="if(typeof window.saveSceneSfxPrompt==='function') window.saveSceneSfxPrompt('${currentId}');" title="Save SFX promptą">💾</button>

        </div>

        <label class="flex items-center text-xs cursor-pointer" style="gap: 5px; margin-top: 2px; user-select: none;" title="Kai įjungta, modelis nežiūri į lūpų judesius, todėl nebandys kalbėti ar murmėti, o sugeneruos švarius aplinkos foley garsus!">

          <input type="checkbox" id="vwSfxIgnoreLips" checked />

          <span style="font-size: 10px; color: #fbbf24; font-weight: 600;">🚫 Ignoruoti lūpas (Grynas SFX garsas be bandymo kalbėti)</span>

        </label>



        <!-- SFX VARIATIONS BUTTON (COMPACT POPUP) -->

        <div class="flex items-center justify-between" style="margin-top: 6px; border-top: 1px solid rgba(245, 158, 11, 0.2); padding-top: 6px;">

          <button type="button" class="btn text-xs" style="background: rgba(245, 158, 11, 0.2); border: 1px solid #fbbf24; color: #fbbf24; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 6px; display: inline-flex; align-items: center; gap: 6px; cursor: pointer;" onclick="window.openSfxVariationsModal('${currentId}');" title="Atidaryti SFX variacijų langą su perklausa">

            🎵 SFX Variacijos <span class="badge" style="background: #fbbf24; color: #000; font-size: 10px; font-weight: 800; padding: 1px 6px; border-radius: 10px;">${sfxVarsList.length}</span>

          </button>

          <span style="font-size: 10px; color: #94a3b8;">Spustelėkite peržiūrėti / pasirinkti</span>

        </div>

      </div>



      <!-- LIVE SCENE EFFECTS & MOTION CONTROLS -->

      <div class="viewer-fx-box">

        <div style="font-size: 10.5px; font-weight: 800; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">

          🎬 Scenes Efektai & Judėjimas

        </div>



        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">

          <div>

            <label style="font-size: 9px; text-transform: uppercase; color: var(--muted); font-weight: 700; display: block; margin-bottom: 2px;">🎥 Kamera</label>

            <select id="vwSceneCameraSelect" style="width: 100%; padding: 4px 6px; font-size: 10.5px;">

              <option value="constant_speed" ${curMotion === 'constant_speed' ? 'selected' : ''}>⚡ Constant Zoom</option>

              <option value="constant_speed_out" ${curMotion === 'constant_speed_out' ? 'selected' : ''}>⚡ Constant Out</option>

              <option value="cinematic" ${curMotion === 'cinematic' ? 'selected' : ''}>🎯 Cinematic</option>

              <option value="zoom_out" ${curMotion === 'zoom_out' ? 'selected' : ''}>🔍 Zoom Out</option>

              <option value="zoom_in_out" ${curMotion === 'zoom_in_out' ? 'selected' : ''}>🔄 Pulse</option>

              <option value="pan_left" ${curMotion === 'pan_left' ? 'selected' : ''}>⬅️ Pan Left</option>

              <option value="pan_right" ${curMotion === 'pan_right' ? 'selected' : ''}>➡️ Pan Right</option>

              <option value="pan_up" ${curMotion === 'pan_up' ? 'selected' : ''}>⬆️ Pan Up</option>

              <option value="pan_down" ${curMotion === 'pan_down' ? 'selected' : ''}>⬇️ Pan Down</option>

              <option value="drift" ${curMotion === 'drift' ? 'selected' : ''}>💫 Drift</option>

              <option value="random" ${curMotion === 'random' ? 'selected' : ''}>🌀 Random</option>

              <option value="disabled" ${curMotion === 'disabled' ? 'selected' : ''}>🚫 Static</option>

            </select>

          </div>



          <div>

            <label style="font-size: 9px; text-transform: uppercase; color: var(--muted); font-weight: 700; display: block; margin-bottom: 2px;">🎭 Perėjimas</label>

            <select id="vwSceneTransSelect" style="width: 100%; padding: 4px 6px; font-size: 10.5px;">

              <option value="dissolve" ${curTrans === 'dissolve' ? 'selected' : ''}>🌊 Dissolve</option>

              <option value="cut" ${curTrans === 'cut' ? 'selected' : ''}>✂️ Cut</option>

              <option value="fade_black" ${curTrans === 'fade_black' ? 'selected' : ''}>🌑 Fade Black</option>

              <option value="fade_white" ${curTrans === 'fade_white' ? 'selected' : ''}>⚪ Fade White</option>

              <option value="slide_left" ${curTrans === 'slide_left' ? 'selected' : ''}>⬅️ Slide L</option>

              <option value="slide_right" ${curTrans === 'slide_right' ? 'selected' : ''}>➡️ Slide R</option>

              <option value="smooth_left" ${curTrans === 'smooth_left' ? 'selected' : ''}>💨 Smooth L</option>

              <option value="wipe_left" ${curTrans === 'wipe_left' ? 'selected' : ''}>🪟 Wipe L</option>

              <option value="circle_crop" ${curTrans === 'circle_crop' ? 'selected' : ''}>⭕ Circle</option>

              <option value="zoom_in" ${curTrans === 'zoom_in' ? 'selected' : ''}>🔭 Push</option>

            </select>

          </div>

        </div>



        <div style="display: grid; grid-template-columns: 1fr 70px; gap: 8px;">

          <div>

            <label style="font-size: 9px; text-transform: uppercase; color: var(--muted); font-weight: 700; display: block; margin-bottom: 2px;">⚡ Kinetinis Tekstas</label>

            <select id="vwSceneKineticSelect" style="width: 100%; padding: 4px 6px; font-size: 10.5px;">

              <option value="none" ${curKinetic === 'none' ? 'selected' : ''}>🚫 Be teksto (Originalas)</option>

              <option value="typewriter" ${curKinetic === 'typewriter' ? 'selected' : ''}>⌨️ Typewriter</option>

              <option value="wiggly_sketch" ${curKinetic === 'wiggly_sketch' ? 'selected' : ''}>✏️ Wiggly Sketch</option>

              <option value="stopmotion_sketch" ${curKinetic === 'stopmotion_sketch' ? 'selected' : ''}>🎬 Stopmotion</option>

              <option value="cia_intro" ${curKinetic === 'cia_intro' ? 'selected' : ''}>🕵️ CIA Intro</option>

              <option value="vhs_glitch" ${curKinetic === 'vhs_glitch' ? 'selected' : ''}>📼 VHS Glitch</option>

              <option value="neon_glow" ${curKinetic === 'neon_glow' ? 'selected' : ''}>💡 Neon Glow</option>

              <option value="matrix" ${curKinetic === 'matrix' ? 'selected' : ''}>📟 Matrix</option>

            </select>

          </div>



          <div>

            <label style="font-size: 9px; text-transform: uppercase; color: var(--muted); font-weight: 700; display: block; margin-bottom: 2px;">⏱️ Trukmė</label>

            <input type="number" id="vwSceneDurInput" value="${dur.toFixed(1)}" min="0.5" max="60" step="0.1" style="width: 100%; padding: 4px 6px; font-size: 10.5px; text-align: center;" />

          </div>

        </div>

      </div>

      ` : ''}



      <div>

        <span class="text-muted text-xs font-bold">SCENE PROMPT:</span>

        <div style="background:rgba(255,255,255,0.05); padding:8px 10px; border-radius:6px; margin-top:4px; font-family:var(--sans); line-height:1.4; color:var(--text); font-size: 11px;">${escapeHtml(p?.prompt || '-')}</div>

      </div>

      

      ${extraMetaHtml}



      <div>

        <span class="text-muted text-xs font-bold">NEGATIVE PROMPT:</span>

        <div style="background:rgba(255,255,255,0.03); padding:6px 8px; border-radius:6px; margin-top:4px; font-size:10px; color:var(--muted);">${escapeHtml(p?.negative || 'None')}</div>

      </div>



      <div style="border-top:1px solid rgba(255,255,255,0.1); padding-top:8px; display:grid; grid-template-columns: 1fr 1fr; gap:6px; font-size:10.5px;">

        <div><strong>Resolution:</strong> ${isChar ? '672x1568' : `${p?.w || 1280}x${p?.h || 720}`}</div>

        <div><strong>Steps:</strong> ${p?.steps || 30}</div>

        <div><strong>CFG:</strong> ${p?.cfg || 7.5}</div>

        <div><strong>Seed:</strong> ${p?.seed || '-'}</div>

        <div style="grid-column: 1 / -1;"><strong>Workflow Mode:</strong> ${wfMode}</div>

      </div>



      ${isKinetic ? `

      <div style="margin-top:4px; display:flex; gap:6px;">

        <button class="btn accent text-xs" style="flex:1;" onclick="window.openInKineticWriter('${currentId}')">✍️ Edit in Kinetic Text Writer</button>

        <button class="btn text-xs ${scObj?.kineticHideText ? 'warn' : 'accent'}" style="flex:1; font-weight:700;" onclick="if(typeof window.toggleKineticSceneMode==='function') window.toggleKineticSceneMode('${currentId}');" title="Perjungti režimą: Tekstas + Fonas <-> Tik Vaizdas">

          ${scObj?.kineticHideText ? '🖼️ Režimas: Tik Vaizdas' : '🎬 Režimas: Tekstas + Fonas'}

        </button>

      </div>` : ''}

    </div>

  `;



  $("#vwMeta").innerHTML = metaHtml;



  // Bind live change listeners to viewer scene fx controls

  if (!isChar && scObj) {

      const camSel = $("#vwSceneCameraSelect");

      if (camSel) {

          camSel.addEventListener('change', (e) => {

              scObj.cameraMotion = e.target.value;

              window.saveCurrentProject();

              if (typeof window.updateStudioCockpitChips === 'function') window.updateStudioCockpitChips();

              if (typeof toast === 'function') toast("Kamera Atnaujinta", `Scenos judėjimas: ${e.target.value}`, "info");

          });

      }



      const trSel = $("#vwSceneTransSelect");

      if (trSel) {

          trSel.addEventListener('change', (e) => {

              scObj.transition = e.target.value;

              window.saveCurrentProject();

              if (typeof window.updateStudioCockpitChips === 'function') window.updateStudioCockpitChips();

              if (typeof toast === 'function') toast("Perėjimas Atnaujintas", `Perėjimas: ${e.target.value}`, "info");

          });

      }



      const kinSel = $("#vwSceneKineticSelect");

      if (kinSel) {

          kinSel.addEventListener('change', (e) => {

              const effect = e.target.value;

              scObj.kineticEffect = effect;

              if (!proj.kineticScenes) proj.kineticScenes = [];

              let kSc = proj.kineticScenes.find(k => String(k.id) === String(currentId) || String(k.id) === String(currentId).replace(/^S/i, ''));

              if (effect === 'none') {

                  if (kSc && !scObj.isKinetic) {

                      proj.kineticScenes = proj.kineticScenes.filter(k => String(k.id) !== String(currentId) && String(k.id) !== String(currentId).replace(/^S/i, ''));

                  }

              } else {

                  if (!kSc) {

                      kSc = {

                          id: String(currentId),

                          text1: scObj.text || scObj.prompt || `Scene ${currentId}`,

                          text2: "",

                          effect: effect,

                          speed: 1.0,

                          duration: scObj.duration || 4.0

                      };

                      proj.kineticScenes.push(kSc);

                  } else {

                      kSc.effect = effect;

                  }

              }

              window.saveCurrentProject();

              if (typeof toast === 'function') toast("Teksto Efektas", `Nustatytas efektas: ${effect}`, "info");

          });

      }



      const durInp = $("#vwSceneDurInput");

      if (durInp) {

          durInp.addEventListener('change', (e) => {

              const d = parseFloat(e.target.value) || 4.0;

              scObj.duration = d;

              if (proj.timeline) {

                  const tl = proj.timeline.find(t => String(t.id) === String(currentId) || String(t.id) === String(currentId).replace(/^S/i, ''));

                  if (tl) { tl.dur = d; tl.duration = d; }

              }

              window.saveCurrentProject();

              if (typeof window.renderRenderStudioUI === 'function') window.renderRenderStudioUI();

          });

      }

  }

};



// ============================================================================

// 11. DOWNLOADS & HELPERS (SCENES)

// ============================================================================

window.downloadSingle = async function(sceneId) {

  const out = getOutput(sceneId); if(!out) return; const main = getMainVariant(out);

  try {

    const res = await fetch(main.url); const blob = await res.blob();

    

    // DINAMINIS IR SAUGUS PLĖTINIO ATPAŽINIMAS ATSISIUNČIANT failus iš išorinių šaltinių

    let ext = 'png';

    try {

        const cleanUrl = main.url.split('?')[0].split('#')[0];

        if (cleanUrl.includes('.')) {

            ext = cleanUrl.split('.').pop().toLowerCase();

            if (ext === 'jpeg') ext = 'jpg';

        }

    } catch(e) { console.error("Error parsing download extension", e); }



    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${sceneId}_main.${ext}`;

    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);

  } catch (err) { toast("Error", "Failed to download", "error"); }

};



window.downloadZip = async function(includeVars, triggerBtn = null) {

  const btn = triggerBtn || (includeVars ? document.getElementById("btnDownloadVars") : document.getElementById("btnDownloadAll"));

  const origHtml = btn ? btn.innerHTML : '';

  const proj = window.getProj();

  const filter = $("#imgFilter").value; const q = $("#imgSearch").value.toLowerCase();

  

  const scenesToDownload = proj.scenes.filter(sc => {

    const out = getOutput(sc.id); 

    if(!out || out.variations.length === 0) return false;

    

    const isDone = out.variations.some(v => v.status === 'done');

    if(filter === 'missing' && isDone) return false;

    if(filter === 'done' && !isDone) return false;

    

    if(q && !sc.id.toLowerCase().includes(q) && !(sc.prompt||'').toLowerCase().includes(q)) return false;

    return true;

  });



  if(scenesToDownload.length === 0) return toast("Info", "Nothing to download with current filters");

  

  if (btn) {

    btn.disabled = true;

    btn.innerHTML = `<span class="spinner" style="display:inline-block; width:12px; height:12px; border:2px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation:spin 0.6s linear infinite; vertical-align:middle; margin-right:6px;"></span>Ruošiama ZIP...`;

  }

  toast("Zipping...", `Server is preparing the archive...`);

  const filesToZip = [];



  for (const sc of scenesToDownload) {

    const out = getOutput(sc.id); 

    if (includeVars) {

      for (let i = 0; i < out.variations.length; i++) {

        const v = out.variations[i]; if(v.status !== 'done') continue;

        const suffix = (v.id === out.mainId) ? "main" : `var${String(i+1).padStart(3, '0')}`;

        const actualFilename = v.url.split('/').pop().split('?')[0];

        if(actualFilename && actualFilename !== "view") filesToZip.push({ filename: actualFilename, prefix: `${sc.id}_${suffix}` });

      }

    } else {

      const main = getMainVariant(out);

      if(main && main.status === 'done') {

        const actualFilename = main.url.split('/').pop().split('?')[0];

        if(actualFilename && actualFilename !== "view") filesToZip.push({ filename: actualFilename, prefix: `${sc.id}_main` });

      }

    }

  }



  try {

      const res = await fetch('/api/zip', {

          method: 'POST', headers: {'Content-Type': 'application/json'},

          body: JSON.stringify({ files: filesToZip, name: `Scenes_${includeVars?'All_Vars':'Mains'}.zip` })

      });

      if(!res.ok) throw new Error("Server error");

      const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob);

      a.download = `Scenes_${includeVars?'All_Vars':'Mains'}_${nowIso().replace(/[: ]/g, '')}.zip`;

      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);

      toast("Success", "ZIP archive downloaded!", "success");

  } catch(e) { 

      toast("Error", "Failed to create ZIP", "error"); 

  } finally {

      if (btn) {

          btn.disabled = false;

          btn.innerHTML = origHtml;

      }

  }

}



window.initCustomSelect = function(selectId) {

    if (['feRef1', 'feRef2', 'eRefA', 'eRefB', 'eRefC'].includes(selectId)) return;

    const proj = window.getProj();

    const selectEl = $(`#${selectId}`);

    if (!selectEl || selectEl.tagName !== 'SELECT') return;

    let wrap = selectEl.nextElementSibling;

    if(!wrap || !wrap.classList.contains('custom-select-wrapper')) {

        selectEl.style.display = 'none'; wrap = document.createElement('div'); wrap.className = 'custom-select-wrapper';

        wrap.innerHTML = `<div class="custom-select-display"><span class="val"></span><span class="arr" style="font-size:10px; color:var(--muted)">▼</span></div><div class="custom-select-options"></div>`;

        selectEl.parentNode.insertBefore(wrap, selectEl.nextSibling);

    }

    const displayBox = wrap.querySelector('.custom-select-display'); const optionsBox = wrap.querySelector('.custom-select-options');

    let optsHtml = `<div class="custom-select-option" data-val="">-- None --</div>`;

    proj.refs.forEach(r => { optsHtml += `<div class="custom-select-option" data-val="${escapeHtml(r)}">${escapeHtml(r)}</div>`; });

    optionsBox.innerHTML = optsHtml; displayBox.querySelector('.val').textContent = selectEl.value || '-- None --';

    

    const newDisplayBox = displayBox.cloneNode(true); displayBox.parentNode.replaceChild(newDisplayBox, displayBox);

    const newOptionsBox = optionsBox.cloneNode(true); optionsBox.parentNode.replaceChild(newOptionsBox, optionsBox);



    newDisplayBox.addEventListener('click', (e) => { e.stopPropagation(); $$('.custom-select-options').forEach(o => { if(o !== newOptionsBox) o.classList.remove('show'); }); newOptionsBox.classList.toggle('show'); });

    newDisplayBox.addEventListener('mouseenter', e => { if(typeof window.showPreviewHover === 'function') window.showPreviewHover(e, selectEl.value); });

    newDisplayBox.addEventListener('mousemove', e => { if(typeof window.movePreviewHover === 'function') window.movePreviewHover(e); });

    newDisplayBox.addEventListener('mouseleave', () => { if(typeof window.hidePreviewHover === 'function') window.hidePreviewHover(); });



    newOptionsBox.querySelectorAll('.custom-select-option').forEach(opt => {

        opt.addEventListener('click', (e) => {

            e.stopPropagation(); const val = opt.dataset.val; selectEl.value = val; newDisplayBox.querySelector('.val').textContent = val || '-- None --';

            newOptionsBox.classList.remove('show'); selectEl.dispatchEvent(new Event('change'));

        });

        opt.addEventListener('mouseenter', e => { if(typeof window.showPreviewHover === 'function') window.showPreviewHover(e, opt.dataset.val); });

        opt.addEventListener('mousemove', e => { if(typeof window.movePreviewHover === 'function') window.movePreviewHover(e); });

        opt.addEventListener('mouseleave', () => { if(typeof window.hidePreviewHover === 'function') window.hidePreviewHover(); });

    });

}



window.syncCustomSelects = function(ids) { 

    ids.forEach(id => { 

        if (id === 'feRef1' || id === 'feRef2') {

            if (typeof window.updateFeRefDisplays === 'function') window.updateFeRefDisplays();

            return;

        }

        if (id === 'eRefA' || id === 'eRefB' || id === 'eRefC') {

            if (typeof window.updateEditRefDisplays === 'function') window.updateEditRefDisplays();

            return;

        }

        const el = $(`#${id}`); 

        if (el && el.nextElementSibling && el.nextElementSibling.classList.contains('custom-select-wrapper')) { 

            const disp = el.nextElementSibling.querySelector('.custom-select-display .val'); 

            if(disp) disp.textContent = el.value || '-- None --'; 

        } 

    }); 

}



document.addEventListener('click', () => { $$('.custom-select-options').forEach(o => o.classList.remove('show')); });



window.updateRefsSelects = function() {

  const proj = window.getProj();

  if (!proj.refs) proj.refs = [];



  // Filter out any temporary edit_src_ and mock_edit_ files

  proj.refs = proj.refs.filter(r => !r.startsWith('edit_src_') && !r.startsWith('mock_edit_'));



  if (!proj.refs.includes('empty_scene.png')) {

      proj.refs.unshift('empty_scene.png');

  }



  // Ensure all characters from proj.charRefs are in proj.refs

  if (proj.charRefs) {

      Object.keys(proj.charRefs).forEach(charName => {

          if (!charName.startsWith('edit_src_') && !charName.startsWith('mock_edit_') && charName !== 'empty_scene.png') {

              if (!proj.refs.includes(charName)) {

                  proj.refs.push(charName);

              }

          }

      });

  }



  const options = `<option value="">-- None --</option>` + proj.refs.map(r => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');

  const fallback = $("#gFallbackRef"); if(fallback) { fallback.innerHTML = options; fallback.value = proj.globals.fallbackRef; }

  const refA = $("#eRefA"); if(refA && refA.tagName === 'SELECT') refA.innerHTML = options;

  const refB = $("#eRefB"); if(refB && refB.tagName === 'SELECT') refB.innerHTML = options;

  const refC = $("#eRefC"); if(refC && refC.tagName === 'SELECT') refC.innerHTML = options;

  const feRef1 = $("#feRef1"); if(feRef1 && feRef1.tagName === 'SELECT') feRef1.innerHTML = options;

  const feRef2 = $("#feRef2"); if(feRef2 && feRef2.tagName === 'SELECT') feRef2.innerHTML = options;

  

  const refList = $("#refList");

  if(refList) {

      if(proj.refs.length===0) { refList.innerHTML = `<div class="text-muted text-xs">No references.</div>`; } 

      else {

          refList.innerHTML = proj.refs.map(r => `<div class="mono text-xs flex justify-between ref-item" style="cursor:pointer; padding:2px 0;" data-ref="${escapeHtml(r)}"><span>${escapeHtml(r)}</span></div>`).join('');

          $$('.ref-item').forEach(el => { 

              const ref = el.dataset.ref; 

              let url = (ref === 'empty_scene.png') ? `/base/${ref}` : `/vault/${ref}`;

              if (proj.charRefs && proj.charRefs[ref]) {

                  const cData = proj.charRefs[ref];

                  const main = window.getCharMainVariant ? window.getCharMainVariant(cData) : null;

                  if (main && main.url) url = main.url;

              }

              if(url) { 

                  el.addEventListener('mouseenter', e => { $("#hoverImg").src = url; $("#hoverPreview").style.display = 'block'; }); 

                  el.addEventListener('mousemove', e => { if(typeof window.movePreviewHover === 'function') window.movePreviewHover(e); }); 

                  el.addEventListener('mouseleave', () => { if(typeof window.hidePreviewHover === 'function') window.hidePreviewHover(); }); 

              }

          });

      }

  }

  

  const refCount = $("#refCount"); if(refCount) refCount.textContent = `(${proj.refs.length})`;

  ['gFallbackRef'].forEach(id => window.initCustomSelect(id));

  if(typeof window.updateFeRefDisplays === 'function') window.updateFeRefDisplays();

  if(typeof window.updateEditRefDisplays === 'function') window.updateEditRefDisplays();

}



window.validateScenes = function() {

  const proj = window.getProj();

  if (!proj.refs.includes('empty_scene.png')) {

      proj.refs.push('empty_scene.png');

  }



  const isQwen21 = (proj.globals && ((proj.globals.unetName || '').includes('2.1') || proj.globals.workflowMode === 'qwen_2_1'));

  const isNanoBanana = (proj.globals && proj.globals.workflowMode === 'nano_banana_2_flash');



  proj.scenes.forEach(s => {

    if (!s.refA && proj.refs.some(r => r.includes(s.id))) s.refA = proj.refs.find(r => r.includes(s.id));

    if (s.refA && s.refA !== 'empty_scene.png' && !s.refB && s.refB !== "") s.refB = s.refA; 

    const count = getRefCount(s);

    if (count > 0) {

      s.mode = `${count} REF`;

      s.status = 'ready';

    } else if (isQwen21) {

      s.mode = '0 REF (T2I)';

      s.status = 'ready';

    } else if (isNanoBanana) {

      s.mode = '0 REF (Cloud)';

      s.status = 'ready';

    } else {

      s.mode = proj.globals.fallbackRef ? '1 REF (FB)' : 'ERR';

      s.status = s.mode !== 'ERR' ? 'ready' : 'missing refs';

    }

  });



  if(typeof window.extractCharRefs === 'function') {

      window.extractCharRefs(); 

      if (proj.charRefs && proj.charRefs['empty_scene.png']) {

          delete proj.charRefs['empty_scene.png'];

      }

  }

  

  window.saveCurrentProject();

  window.renderWorkflow();

  if(document.getElementById('tab-characters') && !document.getElementById('tab-characters').classList.contains('hidden')) { 

      if(typeof window.renderCharRefs === 'function') window.renderCharRefs(); 

  }

}



// Global Image Actions (Clear/Download)

if($("#btnClearAllImages")) {

    $("#btnClearAllImages").addEventListener("click", () => {

        if(confirm("Are you sure you want to clear all generated scenes and variations?")) { 

            window.getProj().outputs = []; 

            window.saveCurrentProject();

            if(typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images'); else window.renderImages(); 

            toast("Deleted", "All scene outputs cleared for this project.", "success"); 

        }

    });

}



if($("#btnDownloadAll")) $("#btnDownloadAll").addEventListener("click", (e) => window.downloadZip(false, e.currentTarget));

if($("#btnDownloadVars")) $("#btnDownloadVars").addEventListener("click", (e) => window.downloadZip(true, e.currentTarget));



// Base Reference File Uploads (Su papildomu užraktu saugumui)

let isUploadingRefs = false;

if($("#btnUploadRef")) $("#btnUploadRef").addEventListener("click", () => $("#fileUploadRef").click());

if($("#fileUploadRef")) {

    $("#fileUploadRef").addEventListener("change", async (e) => {

      if (isUploadingRefs) return;

      const proj = window.getProj();

      if(!e.target.files.length) return; 

      const files = Array.from(e.target.files);

      

      isUploadingRefs = true;

      toast("Uploading...", `Uploading ${files.length} files to Vault...`);

      for(let file of files) {

        const formData = new FormData(); 

        formData.append("file", file); 

        try { 

            const res = await fetch("/api/upload_vault", { method: "POST", body: formData }); 

            if(!res.ok) throw new Error("API error");

            const data = await res.json(); 

            const safeName = data.url.split('/').pop();

            if (!proj.refs.includes(safeName)) proj.refs.push(safeName);

        } catch (err) {

            console.error("Error uploading reference:", err);

        }

      }

      window.saveCurrentProject();

      toast("Success", "All files uploaded to Vault.", "success"); 

      window.updateRefsSelects(); 

      window.validateScenes(); 

      e.target.value = "";

      isUploadingRefs = false;

    });

}



// Load JSON (Scenes)

if($("#btnLoadJson")) $("#btnLoadJson").addEventListener("click", () => {

    if (typeof window.openJsonFixerModal === 'function') window.openJsonFixerModal('scenes');

    else if ($("#modalJson")) $("#modalJson").classList.add("show");

});



if($("#btnLoadDemoJson")) {

    $("#btnLoadDemoJson").addEventListener("click", () => {

        if (typeof window.openDemoModal === 'function') {

            window.openDemoModal();

        } else if (typeof window.loadDemoPreset === 'function') {

            window.loadDemoPreset('colorful_paradise', false);

        } else {

            $("#jsonInput").value = JSON.stringify([

              { id: "S01", prompt: "Sunny tropical lagoon beach, crystal clear turquoise water, pink coral sand, golden sunlight.", text: "Welcome to the sunny paradise.", refA: "Luna Bright" },

              { id: "S02", prompt: "Luna Bright and Milo Spark exploring magical blooming pastel meadow with butterflies.", text: "Luna and Milo explore the magical rainbow meadow.", refA: "Luna Bright", refB: "Milo Spark" }

            ], null, 2); 

            $("#modalJson").classList.add("show");

        }

    });

}



if($("#btnApplyJson")) {

    $("#btnApplyJson").addEventListener("click", () => {

      const proj = window.getProj();

      try {

        const data = JSON.parse($("#jsonInput").value);

        data.forEach(d => { 

            let sc = proj.scenes.find(s=>s.id==d.id);

            if(!sc) { 

                proj.scenes.push({

                    id:d.id, 

                    prompt:d.prompt||'', 

                    video_prompt:d.video_prompt||'', 

                    negative:d.negative||'', 

                    refA:d.refA||'', 

                    refB:d.refB||'', 

                    refC:d.refC||'',

                    voice: d.voice || '',

                    dialogue: d.dialogue || null

                }); 

            } else {

                if(d.prompt) sc.prompt = d.prompt;

                if(d.video_prompt) sc.video_prompt = d.video_prompt;

                if(d.negative) sc.negative = d.negative;

                if(d.refA !== undefined) sc.refA = d.refA;

                if(d.refB !== undefined) sc.refB = d.refB;

                if(d.refC !== undefined) sc.refC = d.refC;

                if(d.voice !== undefined) sc.voice = d.voice;

                if(d.dialogue !== undefined) sc.dialogue = d.dialogue;

            }

            if(d.text) proj.sceneTextById[d.id] = d.text; 

        });

        window.saveCurrentProject();

        $("#modalJson").classList.remove("show"); 

        window.validateScenes(); 

        if(typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images'); else window.renderImages(); 

        toast("Loaded", `${data.length} scenes loaded`, "success");

      } catch(e) { toast("Error", "Invalid JSON", "error"); }

    });

}



if($("#btnValidateScenes")) $("#btnValidateScenes").addEventListener("click", () => { window.validateScenes(); toast("Validated", "References checked"); });

if($("#btnClearScenes")) {

    $("#btnClearScenes").addEventListener("click", () => { 

        const proj = window.getProj();

        if(confirm("Are you sure you want to clear SCENES? This will NOT delete your characters.")) {

            proj.scenes=[]; 

            proj.sceneTextById={}; 

            proj.timeline=[]; 

            window.saveCurrentProject();

            window.renderWorkflow(); 

            if(typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images'); else window.renderImages(); 

            if(typeof window.renderTimeline === 'function') window.renderTimeline(); 

            toast("Cleared", "Scenes cleared.", "success");

        } 

    });

}



if($("#imgFilter")) $("#imgFilter").addEventListener("change", () => { if(typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images'); else window.renderImages(); }); 

if($("#imgSearch")) $("#imgSearch").addEventListener("input", () => { if(typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images'); else window.renderImages(); });

if($("#gFallbackRef")) $("#gFallbackRef").addEventListener("change", e => { window.getProj().globals.fallbackRef = e.target.value; window.saveCurrentProject(); window.validateScenes(); window.syncCustomSelects(['gFallbackRef']); });



// ============================================================================

// QUICK SETTINGS SYNCHRONIZATION AND LISTENERS

// ============================================================================



window.syncQuickSettings = function() {

    const proj = window.getProj();

    if (!proj || !proj.globals) return;

    

    // Initialize properties if they don't exist

    if (proj.globals.workflowMode === undefined) proj.globals.workflowMode = 'qwen_2_1';

    if (proj.globals.unetName === undefined) proj.globals.unetName = 'qwen_image_2.1_int8_convrot.safetensors';

    if (proj.globals.loraName === undefined) proj.globals.loraName = 'none';

    if (proj.globals.clipName === undefined) proj.globals.clipName = 'qwen3vl_8b_int8_convrot.safetensors';

    if (proj.globals.vaeName === undefined) proj.globals.vaeName = 'qwen_image_2.1_vae_bf16.safetensors';



    // 1. Sync Model Select

    const modelSelect = document.getElementById('quickModel');

    const charModel = document.getElementById('charModel');

    const styleLabModel = document.getElementById('styleLabModel');

    const matchingVal = proj.globals.modelPreset || (proj.globals.workflowMode === 'nano_banana_2_flash' ? 'nano_banana_2_flash|nano_banana_2_flash|none' : `${proj.globals.workflowMode}|${proj.globals.unetName}|${proj.globals.loraName}`);



    if (modelSelect) {

        let matched = false;

        for (let i = 0; i < modelSelect.options.length; i++) {

            if (modelSelect.options[i].value === matchingVal) {

                modelSelect.value = matchingVal;

                matched = true;

                break;

            }

        }

        if (!matched) {

            modelSelect.value = 'custom';

        }

        

        // Show/hide custom inputs

        const customModelDiv = document.getElementById('quickCustomModelDiv');

        if (customModelDiv) {

            customModelDiv.classList.toggle('hidden', modelSelect.value !== 'custom');

        }

    }



    if (charModel) {

        let matched = false;

        for (let i = 0; i < charModel.options.length; i++) {

            if (charModel.options[i].value === matchingVal) {

                charModel.value = matchingVal;

                matched = true;

                break;

            }

        }

        if (!matched) {

            charModel.value = 'custom';

        }

    }



    if (styleLabModel) {

        for (let i = 0; i < styleLabModel.options.length; i++) {

            if (styleLabModel.options[i].value === matchingVal) {

                styleLabModel.value = matchingVal;

                break;

            }

        }

    }



    // Populate custom model inputs if custom

    const quickUnet = document.getElementById('quickUnet');

    const quickLora = document.getElementById('quickLora');

    const quickWfMode = document.getElementById('quickWfMode');

    if (quickUnet) quickUnet.value = proj.globals.unetName || '';

    if (quickLora) quickLora.value = proj.globals.loraName || '';

    if (quickWfMode) quickWfMode.value = proj.globals.workflowMode || 'latent_upscale';



    // 2. Sync Resolution Select

    const resSelect = document.getElementById('quickRes');

    if (resSelect) {

        const currentResVal = `${proj.globals.w}x${proj.globals.h}`;

        let matched = false;

        for (let i = 0; i < resSelect.options.length; i++) {

            if (resSelect.options[i].value === currentResVal) {

                resSelect.value = currentResVal;

                matched = true;

                break;

            }

        }

        if (!matched) {

            resSelect.value = 'custom';

        }

        

        // Show/hide custom resolution inputs

        const customResDiv = document.getElementById('quickCustomResDiv');

        if (customResDiv) {

            customResDiv.classList.toggle('hidden', resSelect.value !== 'custom');

        }

    }

    

    const quickW = document.getElementById('quickW');

    const quickH = document.getElementById('quickH');

    if (quickW) quickW.value = proj.globals.w || 1920;

    if (quickH) quickH.value = proj.globals.h || 1080;



    // 3. Sync Steps and CFG

    const is21Model = (proj.globals?.unetName && proj.globals.unetName.includes('2.1')) || proj.globals?.workflowMode === 'qwen_2_1';

    const isLightningModel = !is21Model && ((proj.globals?.unetName && (proj.globals.unetName.includes('2509') || proj.globals.unetName.includes('2511'))) || (proj.globals?.loraName && proj.globals.loraName.includes('Lightning')));

    const defaultStepsVal = is21Model ? 25 : (isLightningModel ? 4 : 20);

    const defaultCfgVal = (is21Model || isLightningModel) ? 1.0 : 3.5;



    const quickSteps = document.getElementById('quickSteps');

    if (quickSteps) quickSteps.value = proj.globals.steps || defaultStepsVal;

    const quickCfg = document.getElementById('quickCfg');

    if (quickCfg) quickCfg.value = proj.globals.cfg !== undefined ? proj.globals.cfg : defaultCfgVal;

    const charSteps = document.getElementById('charSteps');

    if (charSteps) charSteps.value = proj.globals.charSteps || defaultStepsVal;

    const charCfg = document.getElementById('charCfg');

    if (charCfg) charCfg.value = proj.globals.charCfg !== undefined ? proj.globals.charCfg : defaultCfgVal;

};



window.initQuickSettings = function() {

    const modelSelect = document.getElementById('quickModel');

    const resSelect = document.getElementById('quickRes');

    const quickW = document.getElementById('quickW');

    const quickH = document.getElementById('quickH');

    const quickSteps = document.getElementById('quickSteps');

    const quickCfg = document.getElementById('quickCfg');

    

    const quickUnet = document.getElementById('quickUnet');

    const quickLora = document.getElementById('quickLora');

    const quickWfMode = document.getElementById('quickWfMode');



    let statusTimer = null;

    function updateStatusLabel() {

        const label = document.getElementById('quickStatusLabel');

        if (label) {

            label.innerHTML = '✨ Settings saved & synced';

            label.style.color = 'var(--good)';

            if (statusTimer) clearTimeout(statusTimer);

            statusTimer = setTimeout(() => {

                if (label) {

                    label.innerHTML = 'Settings synced';

                    label.style.color = 'var(--muted)';

                }

            }, 1500);

        }

    }



    window.updateModelParamControls = function(modelVal) {

        const isCloud = (modelVal || '').includes('nano_banana');

        

        // Quick / Images tab controls

        const quickSteps = document.getElementById('quickSteps');

        const quickCfg = document.getElementById('quickCfg');

        const quickStepsWrapper = quickSteps ? quickSteps.closest('.flex') : null;

        const quickCfgWrapper = quickCfg ? quickCfg.closest('.flex') : null;

        

        if (quickSteps) {

            quickSteps.disabled = isCloud;

            if (isCloud) {

                quickSteps.style.opacity = '0.35';

                quickSteps.style.pointerEvents = 'none';

                quickSteps.title = 'Nano Banana (Cloud API) nenaudoja KSampler žingsnių';

            } else {

                quickSteps.style.opacity = '1';

                quickSteps.style.pointerEvents = 'auto';

                quickSteps.title = '';

            }

        }

        if (quickCfg) {

            quickCfg.disabled = isCloud;

            if (isCloud) {

                quickCfg.style.opacity = '0.35';

                quickCfg.style.pointerEvents = 'none';

                quickCfg.title = 'Nano Banana (Cloud API) nenaudoja CFG';

            } else {

                quickCfg.style.opacity = '1';

                quickCfg.style.pointerEvents = 'auto';

                quickCfg.title = '';

            }

        }

        if (quickStepsWrapper) quickStepsWrapper.style.opacity = isCloud ? '0.45' : '1';

        if (quickCfgWrapper) quickCfgWrapper.style.opacity = isCloud ? '0.45' : '1';



        // Characters tab controls

        const charSteps = document.getElementById('charSteps');

        const charCfg = document.getElementById('charCfg');

        const charStepsWrapper = charSteps ? charSteps.closest('.flex') : null;

        const charCfgWrapper = charCfg ? charCfg.closest('.flex') : null;



        if (charSteps) {

            charSteps.disabled = isCloud;

            if (isCloud) {

                charSteps.style.opacity = '0.35';

                charSteps.style.pointerEvents = 'none';

                charSteps.title = 'Nano Banana (Cloud API) nenaudoja KSampler žingsnių';

            } else {

                charSteps.style.opacity = '1';

                charSteps.style.pointerEvents = 'auto';

                charSteps.title = '';

            }

        }

        if (charCfg) {

            charCfg.disabled = isCloud;

            if (isCloud) {

                charCfg.style.opacity = '0.35';

                charCfg.style.pointerEvents = 'none';

                charCfg.title = 'Nano Banana (Cloud API) nenaudoja CFG';

            } else {

                charCfg.style.opacity = '1';

                charCfg.style.pointerEvents = 'auto';

                charCfg.title = '';

            }

        }

        if (charStepsWrapper) charStepsWrapper.style.opacity = isCloud ? '0.45' : '1';

        if (charCfgWrapper) charCfgWrapper.style.opacity = isCloud ? '0.45' : '1';



        // Workflow tab controls

        const gSteps = document.getElementById('gSteps');

        const gCfg = document.getElementById('gCfg');

        const gSampler = document.getElementById('gSampler');

        const gStepsWrapper = gSteps ? gSteps.closest('.field') : null;

        const gCfgWrapper = gCfg ? gCfg.closest('.field') : null;

        const gSamplerWrapper = gSampler ? gSampler.closest('.field') : null;



        if (gSteps) {

            gSteps.disabled = isCloud;

            gSteps.style.opacity = isCloud ? '0.35' : '1';

            gSteps.style.pointerEvents = isCloud ? 'none' : 'auto';

        }

        if (gCfg) {

            gCfg.disabled = isCloud;

            gCfg.style.opacity = isCloud ? '0.35' : '1';

            gCfg.style.pointerEvents = isCloud ? 'none' : 'auto';

        }

        if (gSampler) {

            gSampler.disabled = isCloud;

            gSampler.style.opacity = isCloud ? '0.35' : '1';

            gSampler.style.pointerEvents = isCloud ? 'none' : 'auto';

        }

        if (gStepsWrapper) gStepsWrapper.style.opacity = isCloud ? '0.45' : '1';

        if (gCfgWrapper) gCfgWrapper.style.opacity = isCloud ? '0.45' : '1';

        if (gSamplerWrapper) gSamplerWrapper.style.opacity = isCloud ? '0.45' : '1';



        // Edit modal controls (if currently open)

        const eSteps = document.getElementById('eSteps');

        const eCfg = document.getElementById('eCfg');

        if (eSteps) {

            eSteps.disabled = isCloud;

            eSteps.style.opacity = isCloud ? '0.35' : '1';

            eSteps.style.pointerEvents = isCloud ? 'none' : 'auto';

            if (isCloud) eSteps.placeholder = 'N/A';

        }

        if (eCfg) {

            eCfg.disabled = isCloud;

            eCfg.style.opacity = isCloud ? '0.35' : '1';

            eCfg.style.pointerEvents = isCloud ? 'none' : 'auto';

            if (isCloud) eCfg.placeholder = 'N/A';

        }

    };



    function applyModelPreset(val) {

        const proj = window.getProj();

        if (!proj || !proj.globals) return;

        

        proj.globals.modelPreset = val;



        const isCloud = (val || '').includes('nano_banana');

        if (isCloud) {

            proj.globals.workflowMode = 'nano_banana_2_flash';

            proj.globals.unetName = 'none';

            proj.globals.loraName = 'none';

        } else {

            const [wfMode, unet, lora] = val.split('|');

            proj.globals.workflowMode = wfMode || 'latent_upscale';

            proj.globals.unetName = unet || 'qwen_image_edit_2509_fp8_e4m3fn.safetensors';

            proj.globals.loraName = (lora && lora !== 'none') ? lora : 'none';



            const isQwen21 = (unet && unet.includes('2.1')) || wfMode === 'qwen_2_1';

            const isLightning = lora && (lora.includes('Lightning') || lora.includes('2509') || lora.includes('2511'));



            if (isQwen21) {

                proj.globals.clipName = 'qwen3vl_8b_int8_convrot.safetensors';

                proj.globals.vaeName = 'qwen_image_2.1_vae_bf16.safetensors';

                proj.globals.steps = 25;

                proj.globals.cfg = 1.0;

                proj.globals.charSteps = 25;

                proj.globals.charCfg = 1.0;

            } else if (isLightning) {

                proj.globals.clipName = 'qwen_2.5_vl_7b_fp8_scaled.safetensors';

                proj.globals.vaeName = 'qwen_image_vae.safetensors';

                proj.globals.steps = 4;

                proj.globals.cfg = 1.0;

                proj.globals.charSteps = 4;

                proj.globals.charCfg = 1.0;

            } else {

                proj.globals.clipName = 'qwen_2.5_vl_7b_fp8_scaled.safetensors';

                proj.globals.vaeName = 'qwen_image_vae.safetensors';

                proj.globals.steps = 20;

                proj.globals.cfg = 3.5;

                proj.globals.charSteps = 20;

                proj.globals.charCfg = 3.5;

            }

        }



        // Update inputs

        const gWfMode = document.getElementById('gWfMode');

        const gUnet = document.getElementById('gUnetName');

        const gLora = document.getElementById('gLoraName');

        const gSteps = document.getElementById('gSteps');

        const gCfg = document.getElementById('gCfg');

        const quickSteps = document.getElementById('quickSteps');

        const quickCfg = document.getElementById('quickCfg');

        if (gWfMode) gWfMode.value = proj.globals.workflowMode;

        if (gUnet) gUnet.value = proj.globals.unetName;

        if (gLora) gLora.value = proj.globals.loraName;

        if (gSteps && !isCloud) gSteps.value = proj.globals.steps;

        if (gCfg && !isCloud) gCfg.value = proj.globals.cfg;

        if (quickSteps && !isCloud) quickSteps.value = proj.globals.steps;

        if (quickCfg && !isCloud) quickCfg.value = proj.globals.cfg;



        // Sync dropdowns

        const mSelect = document.getElementById('quickModel');

        const gPreset = document.getElementById('gModelPreset');

        const cModel = document.getElementById('charModel');

        const sLabModel = document.getElementById('styleLabModel');

        if (mSelect) mSelect.value = val;

        if (gPreset) gPreset.value = val;

        if (cModel) cModel.value = val;

        if (sLabModel) sLabModel.value = val;

        if (typeof window.syncCharModelSettings === 'function') {

            window.syncCharModelSettings(val);

        }



        window.updateModelParamControls(val);



        document.getElementById('quickCustomModelDiv')?.classList.add('hidden');

        document.getElementById('gCustomModelDiv')?.classList.add('hidden');



        window.saveCurrentProject();

        updateStatusLabel();

    }

    window.applyModelPreset = applyModelPreset;



    if (modelSelect) {

        modelSelect.addEventListener('change', () => {

            if (modelSelect.value === 'custom') {

                const proj = window.getProj();

                document.getElementById('quickCustomModelDiv')?.classList.remove('hidden');

                if (quickUnet) quickUnet.value = proj.globals.unetName || '';

                if (quickLora) quickLora.value = proj.globals.loraName || '';

                if (quickWfMode) quickWfMode.value = proj.globals.workflowMode || 'latent_upscale';

                

                const gModelPreset = document.getElementById('gModelPreset');

                if (gModelPreset) {

                    gModelPreset.value = 'custom';

                    document.getElementById('gCustomModelDiv')?.classList.remove('hidden');

                }

                const cModel = document.getElementById('charModel');

                if (cModel) cModel.value = 'custom';

            } else {

                applyModelPreset(modelSelect.value);

            }

        });

    }



    const gModelPreset = document.getElementById('gModelPreset');

    if (gModelPreset) {

        gModelPreset.addEventListener('change', () => {

            if (gModelPreset.value === 'custom') {

                const proj = window.getProj();

                document.getElementById('gCustomModelDiv')?.classList.remove('hidden');

                const gWfMode = document.getElementById('gWfMode');

                const gUnet = document.getElementById('gUnetName');

                const gLora = document.getElementById('gLoraName');

                if (gWfMode) gWfMode.value = proj.globals.workflowMode || 'latent_upscale';

                if (gUnet) gUnet.value = proj.globals.unetName || '';

                if (gLora) gLora.value = proj.globals.loraName || '';



                if (modelSelect) {

                    modelSelect.value = 'custom';

                    document.getElementById('quickCustomModelDiv')?.classList.remove('hidden');

                }

                const cModel = document.getElementById('charModel');

                if (cModel) cModel.value = 'custom';

            } else {

                applyModelPreset(gModelPreset.value);

            }

        });

    }



    const cModel = document.getElementById('charModel');

    if (cModel) {

        cModel.addEventListener('change', () => {

            if (cModel.value === 'custom') {

                if (modelSelect) {

                    modelSelect.value = 'custom';

                    document.getElementById('quickCustomModelDiv')?.classList.remove('hidden');

                }

                const gPreset = document.getElementById('gModelPreset');

                if (gPreset) {

                    gPreset.value = 'custom';

                    document.getElementById('gCustomModelDiv')?.classList.remove('hidden');

                }

            } else {

                applyModelPreset(cModel.value);

            }

        });

    }



    const sLabModel = document.getElementById('styleLabModel');

    if (sLabModel) {

        sLabModel.addEventListener('change', () => {

            applyModelPreset(sLabModel.value);

        });

    }



    if (quickUnet) {

        quickUnet.addEventListener('change', () => {

            const proj = window.getProj();

            if (proj && proj.globals) {

                proj.globals.unetName = quickUnet.value.trim();

                const gUnet = document.getElementById('gUnetName');

                if (gUnet) gUnet.value = quickUnet.value.trim();

                window.saveCurrentProject();

                updateStatusLabel();

            }

        });

    }

    if (quickLora) {

        quickLora.addEventListener('change', () => {

            const proj = window.getProj();

            if (proj && proj.globals) {

                proj.globals.loraName = quickLora.value.trim();

                const gLora = document.getElementById('gLoraName');

                if (gLora) gLora.value = quickLora.value.trim();

                window.saveCurrentProject();

                updateStatusLabel();

            }

        });

    }

    if (quickWfMode) {

        quickWfMode.addEventListener('change', () => {

            const proj = window.getProj();

            if (proj && proj.globals) {

                proj.globals.workflowMode = quickWfMode.value;

                const gWfMode = document.getElementById('gWfMode');

                if (gWfMode) gWfMode.value = quickWfMode.value;

                window.saveCurrentProject();

                updateStatusLabel();

            }

        });

    }



    if (resSelect) {

        resSelect.addEventListener('change', () => {

            const proj = window.getProj();

            if (!proj || !proj.globals) return;



            if (resSelect.value === 'custom') {

                document.getElementById('quickCustomResDiv')?.classList.remove('hidden');

            } else {

                document.getElementById('quickCustomResDiv')?.classList.add('hidden');

                const [w, h] = resSelect.value.split('x').map(Number);

                proj.globals.w = w;

                proj.globals.h = h;

                

                if (quickW) quickW.value = w;

                if (quickH) quickH.value = h;

                

                const gW = document.getElementById('gW');

                const gH = document.getElementById('gH');

                if (gW) gW.value = w;

                if (gH) gH.value = h;



                window.saveCurrentProject();

                updateStatusLabel();

            }

        });

    }



    const onCustomResChange = () => {

        const proj = window.getProj();

        if (proj && proj.globals) {

            const w = parseInt(quickW.value) || 1920;

            const h = parseInt(quickH.value) || 1080;

            proj.globals.w = w;

            proj.globals.h = h;

            

            const gW = document.getElementById('gW');

            const gH = document.getElementById('gH');

            if (gW) gW.value = w;

            if (gH) gH.value = h;



            window.saveCurrentProject();

            updateStatusLabel();

        }

    };

    if (quickW) quickW.addEventListener('change', onCustomResChange);

    if (quickH) quickH.addEventListener('change', onCustomResChange);



    if (quickSteps) {

        quickSteps.addEventListener('change', () => {

            const proj = window.getProj();

            if (proj && proj.globals) {

                const val = parseInt(quickSteps.value) || 4;

                proj.globals.steps = val;

                

                const gSteps = document.getElementById('gSteps');

                if (gSteps) gSteps.value = val;



                window.saveCurrentProject();

                updateStatusLabel();

            }

        });

    }



    if (quickCfg) {

        quickCfg.addEventListener('change', () => {

            const proj = window.getProj();

            if (proj && proj.globals) {

                const val = parseFloat(quickCfg.value) || 1.0;

                proj.globals.cfg = val;

                

                const gCfg = document.getElementById('gCfg');

                if (gCfg) gCfg.value = val;



                window.saveCurrentProject();

                updateStatusLabel();

            }

        });

    }



    const charSteps = document.getElementById('charSteps');

    if (charSteps) {

        charSteps.addEventListener('change', () => {

            const proj = window.getProj();

            if (proj && proj.globals) {

                const unet = proj.globals?.unetName || '';

                const wf = proj.globals?.workflowMode || '';

                const is21 = unet.includes('2.1') || wf === 'qwen_2_1';

                const defaultFallback = is21 ? 25 : 4;

                const val = parseInt(charSteps.value) || defaultFallback;

                proj.globals.charSteps = val;

                window.saveCurrentProject();

            }

        });

    }



    const charCfg = document.getElementById('charCfg');

    if (charCfg) {

        charCfg.addEventListener('change', () => {

            const proj = window.getProj();

            if (proj && proj.globals) {

                const val = parseFloat(charCfg.value) || 1.0;

                proj.globals.charCfg = val;

                window.saveCurrentProject();

            }

        });

    }

};



// ============================================================================

// REFERENCE URL & LIGHTBOX HELPERS

// ============================================================================

window.getRefImageUrl = function(ref) {

    if (!ref) return null;

    const proj = window.getProj();

    if (ref === 'empty_scene.png') return '/base/empty_scene.png';

    if (proj && proj.charRefs && proj.charRefs[ref]) {

        const data = proj.charRefs[ref];

        const main = window.getCharMainVariant ? window.getCharMainVariant(data) : null;

        if (main && main.url) return main.url;

        const style = proj.globals?.charBaseStyle || 'default';

        const tmpl = data.template || 'male';

        return `/base/${style}/base_${tmpl}.png`;

    }

    return `/vault/${ref}`;

};



window.openImageLightbox = function(url, title = '') {

    if (!url) return;

    const modal = document.getElementById('modalImageLightbox');

    const img = document.getElementById('lightboxImg');

    const titleEl = document.getElementById('lightboxTitle');

    if (!modal || !img) return;

    img.src = url;

    if (titleEl) titleEl.textContent = title || url.split('/').pop();

    modal.classList.add('show');

};



window.closeImageLightbox = function() {

    const modal = document.getElementById('modalImageLightbox');

    if (modal) modal.classList.remove('show');

};



window.clearRefSlot = function(slotInputId) {

    const el = document.getElementById(slotInputId);

    if (el) {

        el.value = '';

        el.dispatchEvent(new Event('change'));

    }

    if (typeof window.updateFeRefDisplays === 'function') window.updateFeRefDisplays();

    if (typeof window.updateEditRefDisplays === 'function') window.updateEditRefDisplays();

    if (typeof toast === 'function') toast("Removed", "Referencas pašalintas", "info");

};

window.clearFeRef = window.clearRefSlot;



window.formatRefLabel = function(val) {

    if (!val) return '';

    let name = val.trim().split('?')[0];

    if (name.includes('/') || name.includes('\\')) {

        const parts = name.split(/[/\\]/);

        name = parts[parts.length - 1];

    }

    name = name.replace(/\.(png|jpg|jpeg|webp)$/i, '');

    

    // Clean edit_src_S2_uuid -> edit_src_S2

    const mEdit = name.match(/^edit_src_([^_]+)/i);

    if (mEdit) {

        return `edit_src_${mEdit[1]}`;

    }

    

    // Truncate if long to prevent layout overflow

    if (name.length > 15) {

        return name.substring(0, 13) + '…';

    }

    return name;

};



window.updateFeRefDisplays = function() {

    const modalFe = document.getElementById('modalFurtherEdit');

    if (modalFe) {

        modalFe.querySelectorAll('.custom-select-wrapper').forEach(w => w.remove());

    }



    const slots = [

        { inputId: 'feRef1', displayId: 'feRefSlot1Display', uploadBtnId: 'btnFeUpload1', fileInputId: 'fileFe1', num: 1, letter: 'B' },

        { inputId: 'feRef2', displayId: 'feRefSlot2Display', uploadBtnId: 'btnFeUpload2', fileInputId: 'fileFe2', num: 2, letter: 'C' }

    ];

    slots.forEach(s => {

        const inputEl = document.getElementById(s.inputId);

        const displayEl = document.getElementById(s.displayId);

        if (!displayEl) return;

        const val = inputEl ? (inputEl.value || '').trim() : '';

        if (val) {

            const url = window.getRefImageUrl ? window.getRefImageUrl(val) : `/vault/${val}`;

            const shortLabel = window.formatRefLabel(val);

            displayEl.innerHTML = `

                <div class="fe-ref-box assigned" style="border: 1px solid rgba(0,255,204,0.35); border-radius: 8px; padding: 4px 6px; background: rgba(0,255,204,0.05); display: flex; align-items: center; justify-content: space-between; min-height: 44px; gap: 6px; width: 100%; box-sizing: border-box; min-width: 0; overflow: hidden;">

                  <div style="display: flex; align-items: center; gap: 6px; flex: 1 1 0; min-width: 0; overflow: hidden;">

                    <div style="position: relative; width: 34px; height: 34px; min-width: 34px; border-radius: 6px; overflow: hidden; border: 1px solid rgba(255,255,255,0.15); cursor: pointer; background: #06090e; flex-shrink: 0;" 

                         onclick="window.openImageLightbox('${url}', '${escapeHtml(val)}')" 

                         title="Spauskite, kad padidintumėte į pilno ekrano režimą">

                      <img src="${url}" style="width: 100%; height: 100%; object-fit: cover; object-position: top center; display: block;" onerror="this.src='/base/empty_scene.png';" />

                      <span class="fe-zoom-hint" style="position: absolute; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.15s ease; font-size: 11px;">🔍</span>

                    </div>

                    <div style="flex: 1 1 0; min-width: 0; overflow: hidden; display: flex; flex-direction: column; justify-content: center;">

                      <span style="display: block; font-size: 11px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;" title="${escapeHtml(val)}">${escapeHtml(shortLabel)}</span>

                      <span style="display: block; font-size: 9px; color: var(--accent-secondary, #00ffcc); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Ref ${s.letter}</span>

                    </div>

                  </div>

                  <div style="display: flex; align-items: center; gap: 3px; flex-shrink: 0;">

                    <button type="button" class="btn text-xs icon" style="padding: 3px 5px; font-size: 11px; min-width: 24px;" onclick="window.openRefPicker('${s.inputId}')" title="Change referencą (${escapeHtml(val)})">🖼️</button>

                    <button type="button" class="btn text-xs icon bad" style="padding: 3px 5px; font-size: 11px; min-width: 24px;" onclick="window.clearRefSlot('${s.inputId}')" title="Pašalinti referencą">✕</button>

                  </div>

                </div>

            `;

        } else {

            displayEl.innerHTML = `

                <div class="fe-ref-box empty" style="border: 1px dashed var(--border, #28283a); border-radius: 8px; padding: 4px 6px; background: rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: space-between; min-height: 44px; gap: 6px; width: 100%; box-sizing: border-box; min-width: 0; overflow: hidden;">

                  <div style="display: flex; align-items: center; gap: 4px; flex: 1 1 0; min-width: 0; overflow: hidden;" class="text-xs text-muted">

                    <span style="font-size: 13px; opacity: 0.6; flex-shrink: 0;">🖼️</span>

                    <span style="font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Nepriskirta</span>

                  </div>

                  <div style="display: flex; align-items: center; gap: 3px; flex-shrink: 0;">

                    <button type="button" class="btn text-xs icon primary" style="padding: 3px 6px; font-size: 10px; font-weight: 600; white-space: nowrap;" onclick="window.openRefPicker('${s.inputId}')" title="Pasirinkti iš bibliotekos">🖼️ Pick</button>

                    <button type="button" class="btn text-xs icon" style="padding: 3px 6px; font-size: 10px; white-space: nowrap;" onclick="document.getElementById('${s.fileInputId}').click()" title="Įkelti iš kompiuterio">📤</button>

                  </div>

                </div>

            `;

        }

    });

};



window.updateEditRefDisplays = function() {

    const modalEdit = document.getElementById('modalEdit');

    if (modalEdit) {

        modalEdit.querySelectorAll('.custom-select-wrapper').forEach(w => w.remove());

    }



    const slots = [

        { inputId: 'eRefA', displayId: 'eRefSlotADisplay', fileInputId: 'fileEditRefA', letter: 'A' },

        { inputId: 'eRefB', displayId: 'eRefSlotBDisplay', fileInputId: 'fileEditRefB', letter: 'B' },

        { inputId: 'eRefC', displayId: 'eRefSlotCDisplay', fileInputId: 'fileEditRefC', letter: 'C' }

    ];

    slots.forEach(s => {

        const inputEl = document.getElementById(s.inputId);

        const displayEl = document.getElementById(s.displayId);

        if (!displayEl) return;

        const val = inputEl ? (inputEl.value || '').trim() : '';

        if (val) {

            const url = window.getRefImageUrl ? window.getRefImageUrl(val) : `/vault/${val}`;

            const shortLabel = window.formatRefLabel(val);

            displayEl.innerHTML = `

                <div class="fe-ref-box assigned" style="border: 1px solid rgba(0,255,204,0.35); border-radius: 8px; padding: 4px 6px; background: rgba(0,255,204,0.05); display: flex; align-items: center; justify-content: space-between; min-height: 44px; gap: 6px; width: 100%; box-sizing: border-box; min-width: 0; overflow: hidden;">

                  <div style="display: flex; align-items: center; gap: 6px; flex: 1 1 0; min-width: 0; overflow: hidden;">

                    <div style="position: relative; width: 34px; height: 34px; min-width: 34px; border-radius: 6px; overflow: hidden; border: 1px solid rgba(255,255,255,0.15); cursor: pointer; background: #06090e; flex-shrink: 0;" 

                         onclick="window.openImageLightbox('${url}', '${escapeHtml(val)}')" 

                         title="Spauskite, kad padidintumėte į pilno ekrano režimą">

                      <img src="${url}" style="width: 100%; height: 100%; object-fit: cover; object-position: top center; display: block;" onerror="this.src='/base/empty_scene.png';" />

                      <span class="fe-zoom-hint" style="position: absolute; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.15s ease; font-size: 11px;">🔍</span>

                    </div>

                    <div style="flex: 1 1 0; min-width: 0; overflow: hidden; display: flex; flex-direction: column; justify-content: center;">

                      <span style="display: block; font-size: 11px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;" title="${escapeHtml(val)}">${escapeHtml(shortLabel)}</span>

                      <span style="display: block; font-size: 9px; color: var(--accent-secondary, #00ffcc); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Ref ${s.letter}</span>

                    </div>

                  </div>

                  <div style="display: flex; align-items: center; gap: 3px; flex-shrink: 0;">

                    <button type="button" class="btn text-xs icon" style="padding: 3px 5px; font-size: 11px; min-width: 24px;" onclick="window.openRefPicker('${s.inputId}')" title="Change referencą (${escapeHtml(val)})">🖼️</button>

                    <button type="button" class="btn text-xs icon bad" style="padding: 3px 5px; font-size: 11px; min-width: 24px;" onclick="window.clearRefSlot('${s.inputId}')" title="Pašalinti referencą">✕</button>

                  </div>

                </div>

            `;

        } else {

            displayEl.innerHTML = `

                <div class="fe-ref-box empty" style="border: 1px dashed var(--border, #28283a); border-radius: 8px; padding: 4px 6px; background: rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: space-between; min-height: 44px; gap: 6px; width: 100%; box-sizing: border-box; min-width: 0; overflow: hidden;">

                  <div style="display: flex; align-items: center; gap: 4px; flex: 1 1 0; min-width: 0; overflow: hidden;" class="text-xs text-muted">

                    <span style="font-size: 13px; opacity: 0.6; flex-shrink: 0;">🖼️</span>

                    <span style="font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Nepriskirta</span>

                  </div>

                  <div style="display: flex; align-items: center; gap: 3px; flex-shrink: 0;">

                    <button type="button" class="btn text-xs icon primary" style="padding: 3px 6px; font-size: 10px; font-weight: 600; white-space: nowrap;" onclick="window.openRefPicker('${s.inputId}')" title="Pasirinkti iš bibliotekos">🖼️ Pick</button>

                    <button type="button" class="btn text-xs icon" style="padding: 3px 6px; font-size: 10px; white-space: nowrap;" onclick="document.getElementById('${s.fileInputId}').click()" title="Įkelti iš kompiuterio">📤</button>

                  </div>

                </div>

            `;

        }

    });

};



// ============================================================================

// VISUAL REFERENCE PICKER MODAL (Single Select, Shift+Multi-Select, Upload)

// ============================================================================

let currentRefPickerTarget = 'eRefA';

let refPickerSelected = [];



window.openRefPicker = function(targetSelectId = 'eRefA') {

    currentRefPickerTarget = targetSelectId;

    refPickerSelected = [];

    const currentEl = document.getElementById(targetSelectId);

    const currentVal = currentEl ? currentEl.value : '';

    if (currentVal && currentVal !== 'empty_scene.png') {

        refPickerSelected = [currentVal];

    }

    

    const badge = document.getElementById('refPickerTargetBadge');

    if (badge) {

        let label = targetSelectId;

        if (targetSelectId === 'eRefA') label = 'Ref A';

        else if (targetSelectId === 'eRefB') label = 'Ref B';

        else if (targetSelectId === 'eRefC') label = 'Ref C';

        else if (targetSelectId === 'feRef1') label = 'Further Edit Ref 1';

        else if (targetSelectId === 'feRef2') label = 'Further Edit Ref 2';

        else if (targetSelectId === 'gFallbackRef') label = 'Fallback Ref';

        badge.textContent = `Target: ${label}`;

    }

    

    const searchInput = document.getElementById('refPickerSearch');

    if (searchInput) searchInput.value = '';

    

    window.renderRefPickerGrid();

    const modal = document.getElementById('modalRefPicker');

    if (modal) modal.classList.add('show');

};



window.renderRefPickerGrid = function() {

    const proj = window.getProj();

    const grid = document.getElementById('refPickerGrid');

    if (!grid || !proj) return;

    

    const query = (document.getElementById('refPickerSearch')?.value || '').toLowerCase().trim();

    grid.innerHTML = '';

    

    // 1. Character references

    const charEntries = Object.keys(proj.charRefs || {})

        .filter(k => !k.startsWith('edit_src_') && !k.startsWith('mock_edit_') && k !== 'empty_scene.png')

        .map(k => {

            const data = proj.charRefs[k];

            const main = window.getCharMainVariant ? window.getCharMainVariant(data) : null;

            let url = (main && main.url) ? main.url : null;

            if (!url) {

                const style = proj.globals?.charBaseStyle || 'default';

                const tmpl = data.template || 'male';

                url = `/base/${style}/base_${tmpl}.png`;

            }

            return {

                id: k,

                name: k,

                type: 'Character',

                badgeClass: 'ready',

                url: url,

                generated: !!(main && main.url)

            };

        });

        

    // 2. Custom vault references in proj.refs

    const vaultEntries = (proj.refs || [])

        .filter(r => !r.startsWith('edit_src_') && !r.startsWith('mock_edit_') && r !== 'empty_scene.png' && !proj.charRefs?.[r])

        .map(r => ({

            id: r,

            name: r,

            type: 'Vault',

            badgeClass: 'mode',

            url: `/vault/${r}`,

            generated: true

        }));

        

    // 3. Base templates & Empty scene

    const baseEntries = [

        { id: 'empty_scene.png', name: 'empty_scene.png (No Char)', type: 'Special', badgeClass: 'warn', url: '/base/empty_scene.png', generated: true }

    ];

    

    const allRefs = [...charEntries, ...vaultEntries, ...baseEntries];

    

    const filtered = allRefs.filter(item => {

        if (!query) return true;

        return item.name.toLowerCase().includes(query) || item.type.toLowerCase().includes(query);

    });

    

    if (filtered.length === 0) {

        grid.innerHTML = `<div class="text-muted text-center" style="grid-column: 1 / -1; padding: 40px;">Nerasta referencų pagal paiešką.</div>`;

        return;

    }

    

    filtered.forEach(item => {

        const isSelected = refPickerSelected.includes(item.id);

        const card = document.createElement('div');

        card.className = `card flex-col ${isSelected ? 'selected-ref' : ''}`;

        card.style.cssText = `

            cursor: pointer; border: 2px solid ${isSelected ? 'var(--accent-secondary, #00ffcc)' : 'var(--border, #28283a)'};

            border-radius: 8px; overflow: hidden; background: #0c1017; transition: all 0.2s ease;

            box-shadow: ${isSelected ? '0 0 14px rgba(0,255,204,0.35)' : 'none'};

            position: relative;

        `;

        

        card.onclick = (e) => {

            if (e.shiftKey) {

                // Multi-select with Shift

                if (refPickerSelected.includes(item.id)) {

                    refPickerSelected = refPickerSelected.filter(x => x !== item.id);

                } else {

                    const maxAllowed = currentRefPickerTarget.startsWith('feRef') ? 2 : 3;

                    if (refPickerSelected.length < maxAllowed) {

                        refPickerSelected.push(item.id);

                    } else {

                        refPickerSelected = [...refPickerSelected.slice(1), item.id];

                    }

                }

                window.renderRefPickerGrid();

                window.updateRefPickerSelectionStatus();

            } else {

                // Single select: immediately apply and close without needing extra clicks

                refPickerSelected = [item.id];

                window.applyRefPicker();

            }

        };

        

        card.ondblclick = () => {

            refPickerSelected = [item.id];

            window.applyRefPicker();

        };

        

        // Cards have object-position: top center so faces/heads are prominently framed at top

        card.innerHTML = `

            <div style="height: 135px; width: 100%; background: #06090e; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative;">

                <img src="${item.url}" style="width: 100%; height: 100%; object-fit: cover; object-position: top center;" onerror="this.src='/base/empty_scene.png';" />

                <span class="badge ${item.badgeClass}" style="position: absolute; top: 6px; left: 6px; font-size: 9px; padding: 2px 5px;">${item.type}</span>

                ${isSelected ? `<span style="position: absolute; top: 6px; right: 6px; background: #00ffcc; color: #000; font-size: 10px; font-weight: 800; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; box-shadow:0 2px 6px rgba(0,0,0,0.5);">✓</span>` : ''}

            </div>

            <div style="padding: 8px;">

                <div style="font-weight: 700; font-size: 11px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>

            </div>

        `;

        

        grid.appendChild(card);

    });

    

    window.updateRefPickerSelectionStatus();

};



window.updateRefPickerSelectionStatus = function() {

    const statusEl = document.getElementById('refPickerSelectionStatus');

    if (!statusEl) return;

    if (refPickerSelected.length === 0) {

        statusEl.textContent = "Pasirinkta: nėra (paspauskite kortelę arba Shift+click kelioms)";

    } else {

        statusEl.innerHTML = `Pasirinkta (<strong>${refPickerSelected.length}</strong>): <span style="color:var(--accent-secondary, #00ffcc); font-weight:bold;">${refPickerSelected.join(', ')}</span>`;

    }

};



window.applyRefPicker = function() {

    if (refPickerSelected.length === 0) {

        const modal = document.getElementById('modalRefPicker');

        if (modal) modal.classList.remove('show');

        return;

    }

    

    const isEditRef = ['eRefA', 'eRefB', 'eRefC'].includes(currentRefPickerTarget);

    const isFeRef = ['feRef1', 'feRef2'].includes(currentRefPickerTarget);



    // Assign to inputs

    if (refPickerSelected.length === 1) {

        const targetEl = document.getElementById(currentRefPickerTarget);

        if (targetEl) {

            targetEl.value = refPickerSelected[0];

            targetEl.dispatchEvent(new Event('change'));

            if (!isEditRef && !isFeRef) {

                if (typeof window.initCustomSelect === 'function') window.initCustomSelect(currentRefPickerTarget);

            }

            if (typeof window.updateFeRefDisplays === 'function') window.updateFeRefDisplays();

            if (typeof window.updateEditRefDisplays === 'function') window.updateEditRefDisplays();

        }

    } else {

        // Multi-select assigned sequentially

        if (currentRefPickerTarget.startsWith('eRef')) {

            if (refPickerSelected[0] && document.getElementById('eRefA')) { 

                document.getElementById('eRefA').value = refPickerSelected[0]; 

                document.getElementById('eRefA').dispatchEvent(new Event('change')); 

            }

            if (refPickerSelected[1] && document.getElementById('eRefB')) { 

                document.getElementById('eRefB').value = refPickerSelected[1]; 

                document.getElementById('eRefB').dispatchEvent(new Event('change')); 

            }

            if (refPickerSelected[2] && document.getElementById('eRefC')) { 

                document.getElementById('eRefC').value = refPickerSelected[2]; 

                document.getElementById('eRefC').dispatchEvent(new Event('change')); 

            }

            if (typeof window.updateEditRefDisplays === 'function') window.updateEditRefDisplays();

        } else if (currentRefPickerTarget.startsWith('feRef')) {

            if (refPickerSelected[0] && document.getElementById('feRef1')) { 

                document.getElementById('feRef1').value = refPickerSelected[0]; 

                document.getElementById('feRef1').dispatchEvent(new Event('change')); 

            }

            if (refPickerSelected[1] && document.getElementById('feRef2')) { 

                document.getElementById('feRef2').value = refPickerSelected[1]; 

                document.getElementById('feRef2').dispatchEvent(new Event('change')); 

            }

            if (typeof window.updateFeRefDisplays === 'function') window.updateFeRefDisplays();

        } else {

            const targetEl = document.getElementById(currentRefPickerTarget);

            if (targetEl) {

                targetEl.value = refPickerSelected[0];

                targetEl.dispatchEvent(new Event('change'));

                if (typeof window.initCustomSelect === 'function') window.initCustomSelect(currentRefPickerTarget);

            }

        }

    }

    

    const modal = document.getElementById('modalRefPicker');

    if (modal) modal.classList.remove('show');

    if (typeof toast === 'function') toast("Reference Applied", `Pritaikyta: ${refPickerSelected.join(', ')}`, "success");

};



// Initialize Reference Picker controls

document.addEventListener('DOMContentLoaded', () => {

    const btnApply = document.getElementById('btnRefPickerApply');

    if (btnApply) btnApply.addEventListener('click', () => window.applyRefPicker());



    const searchInput = document.getElementById('refPickerSearch');

    if (searchInput) searchInput.addEventListener('input', () => window.renderRefPickerGrid());



    const btnUpload = document.getElementById('btnRefPickerUpload');

    const fileInput = document.getElementById('refPickerFileInput');

    if (btnUpload && fileInput) {

        btnUpload.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', async () => {

            const files = Array.from(fileInput.files);

            if (!files || files.length === 0) return;

            const proj = window.getProj();

            toast("Uploading...", `Įkeliama ${files.length} failas(-ai)...`);

            

            for (const file of files) {

                try {

                    let uploadedName = file.name;

                    if (state.connected) {

                        const fd = new FormData();

                        fd.append("file", file);

                        const res = await fetch("/api/upload_vault", { method: "POST", body: fd });

                        if (res.ok) {

                            const data = await res.json();

                            uploadedName = data.url.split('/').pop();

                        }

                    }

                    if (proj && proj.refs) {

                        if (!proj.refs.includes(uploadedName)) {

                            proj.refs.push(uploadedName);

                        }

                        refPickerSelected = [uploadedName];

                    }

                } catch(e) {

                    console.error("Ref picker upload error:", e);

                }

            }

            fileInput.value = '';

            window.saveCurrentProject();

            if (typeof window.updateRefsSelects === 'function') window.updateRefsSelects();

            window.renderRefPickerGrid();

            if (typeof toast === 'function') toast("Uploaded", "Naujas referencas sėkmingai įkeltas!", "success");

        });

    }

    

    if (typeof window.updateFeRefDisplays === 'function') window.updateFeRefDisplays();

    if (typeof window.updateEditRefDisplays === 'function') window.updateEditRefDisplays();



    // Google Cloud Settings & Status

    const btnSaveKey = document.getElementById('btnSaveCloudKey');

    if (btnSaveKey) btnSaveKey.addEventListener('click', () => window.saveCloudKeyFromUi());

    if (typeof window.checkCloudStatus === 'function') window.checkCloudStatus();



    // Initial sync of model controls visibility

    const activeModel = document.getElementById('quickModel')?.value || document.getElementById('gModelPreset')?.value || '';

    if (typeof window.updateModelParamControls === 'function') {

        window.updateModelParamControls(activeModel);

    }

});



window.checkCloudStatus = async function() {

    try {

        const res = await fetch('/api/cloud/status');

        if (res.ok) {

            const data = await res.json();

            const statusEl = document.getElementById('cloudApiKeyStatus');

            if (statusEl) {

                if (data.hasKey) {

                    statusEl.innerHTML = `<span style="color:#00ffcc; font-weight:700;">✅ Google API Key Active (${data.keyMask})</span>`;

                } else {

                    statusEl.innerHTML = `<span style="color:#ffb74d; font-weight:700;">⚠️ Raktas nenustatytas. Įveskite raktą aukščiau.</span>`;

                }

            }

            const modalBadge = document.getElementById('cloudModalStatusBadge');

            if (modalBadge) {

                if (data.hasKey) {

                    modalBadge.innerHTML = `<span style="color:#00ffcc; font-weight:700;">✅ Aktyvus (${data.keyMask})</span>`;

                } else {

                    modalBadge.innerHTML = `<span style="color:#ffb74d; font-weight:700;">⚠️ Nėra rakto</span>`;

                }

            }

            const modalIn = document.getElementById('cloudApiKeyModalInput');

            if (modalIn && data.hasKey) {

                modalIn.placeholder = `Raktas sukonfigūruotas (${data.keyMask})`;

            }

        }

    } catch(e) {}

};



window.saveCloudKeyFromUi = async function(customInputId) {

    const targetId = customInputId || 'cloudApiKeyInput';

    const input = document.getElementById(targetId);

    if (!input || !input.value.trim()) return toast("Klaida", "Įveskite API raktą", "warn");

    try {

        const res = await fetch('/api/cloud/key', {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ apiKey: input.value.trim() })

        });

        const data = await res.json();

        if (res.ok && data.status === 'success') {

            toast("Išsaugota", data.message, "success");

            input.value = '';

            const otherIn = document.getElementById(targetId === 'cloudApiKeyModalInput' ? 'cloudApiKeyInput' : 'cloudApiKeyModalInput');

            if (otherIn) otherIn.value = '';

            window.checkCloudStatus();

        } else {

            toast("Klaida", data.detail || "Nepavyko išsaugoti", "error");

        }

    } catch(e) {

        toast("Klaida", e.message, "error");

    }

};



// ============================================================================

// VIEWER SFX CONTROLS & MANAGEMENT (MMAUDIO WORKFLOW 19)

// ============================================================================

window.saveSceneSfxPrompt = function(sceneId) {

    const input = document.getElementById("vwSfxPromptInput");

    if (!input) return;

    const val = input.value.trim();

    const proj = typeof window.getProj === 'function' ? window.getProj() : null;

    if (proj && proj.scenes) {

        const sc = proj.scenes.find(s => String(s.id) === String(sceneId) || String(s.id) === String(sceneId).replace(/^S/i, ''));

        if (sc) {

            sc.sfx_prompt = val;

            if (typeof window.saveCurrentProject === 'function') {

                window.saveCurrentProject();

            }

            if (typeof toast === 'function') toast("SFX Promptas", "Promptas sėkmingai išsaugotas!", "success");

        }

    }

};



window.playSceneSfxAudio = function(sceneId, btnEl) {

    const proj = typeof window.getProj === 'function' ? window.getProj() : null;

    if (!proj) return;

    const cleanId = String(sceneId);

    const numId = cleanId.replace(/^S/i, '');

    const scObj = (proj.scenes || []).find(s => String(s.id) === cleanId || String(s.id) === numId);

    const sfxUrl = (proj.sceneSfxById && (

        proj.sceneSfxById[cleanId] ||

        proj.sceneSfxById[cleanId.toLowerCase()] ||

        proj.sceneSfxById[cleanId.toUpperCase()] ||

        proj.sceneSfxById[numId] ||

        proj.sceneSfxById['s' + numId] ||

        proj.sceneSfxById['S' + numId]

    )) || (scObj && (scObj.sfx_audio || scObj.sfxUrl)) || null;



    if (!sfxUrl) {

        if (typeof toast === 'function') toast("SFX Nėra", "Ši scena dar neturi sugeneruoto SFX garso takelio. Paspauskite '🔄 Pergeneruoti'!", "warning");

        return;

    }



    const isCurrentlyPlaying = btnEl && (btnEl.dataset.isPlaying === 'true' || window._playingSfxSceneId === String(sceneId));



    if (window._standaloneSfxAudio) {

        try {

            window._standaloneSfxAudio.pause();

            window._standaloneSfxAudio.ontimeupdate = null;

            window._standaloneSfxAudio.onended = null;

        } catch(e) {}

        window._standaloneSfxAudio = null;

    }



    document.querySelectorAll('.btn-scene-sfx').forEach(b => {

        b.innerHTML = '🔊 Klausytis SFX';

        b.dataset.isPlaying = 'false';

        b.style.borderColor = 'rgba(245, 158, 11, 0.4)';

    });



    if (isCurrentlyPlaying) {

        window._playingSfxSceneId = null;

        return;

    }



    window._playingSfxSceneId = String(sceneId);

    const audio = new Audio(sfxUrl + (sfxUrl.includes('?') ? '&' : '?') + 't=' + Date.now());

    window._standaloneSfxAudio = audio;



    if (btnEl) {

        btnEl.innerHTML = '⏹️ Sustabdyti';

        btnEl.dataset.isPlaying = 'true';

        btnEl.style.borderColor = '#fbbf24';

    }



    audio.onended = () => {

        if (btnEl) {

            btnEl.innerHTML = '🔊 Klausytis SFX';

            btnEl.dataset.isPlaying = 'false';

            btnEl.style.borderColor = 'rgba(245, 158, 11, 0.4)';

        }

        window._playingSfxSceneId = null;

        window._standaloneSfxAudio = null;

    };



    audio.play().catch(e => {

        console.warn("[playSceneSfxAudio] play error", e);

        if (btnEl) {

            btnEl.innerHTML = '🔊 Klausytis SFX';

            btnEl.dataset.isPlaying = 'false';

        }

        window._playingSfxSceneId = null;

    });

};



window.viewerRegenerateSfx = async function(sceneId, btnEl) {

    const input = document.getElementById("vwSfxPromptInput");

    const sfxPrompt = input ? input.value.trim() : "";

    const ignoreLipsCheck = document.getElementById("vwSfxIgnoreLips");

    const ignoreLips = ignoreLipsCheck ? ignoreLipsCheck.checked : true;

    const origHtml = btnEl ? btnEl.innerHTML : "";



    const sId = String(sceneId || '');

    if (!window._generatingSfxByScene) window._generatingSfxByScene = {};

    window._generatingSfxByScene[sId] = true;

    window._generatingSfxByScene[sId.replace(/^S/i, '')] = true;

    window._generatingSfxByScene['s' + sId.replace(/^S/i, '')] = true;

    window._generatingSfxByScene['S' + sId.replace(/^S/i, '')] = true;



    // Atnaujiname kortelę fone, kad iškart rodytų generavimo būseną

    if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images');



    try {

        if (btnEl) {

            btnEl.disabled = true;

            btnEl.innerHTML = "<span class='spin-anim'>⏳</span> Generuojamas SFX...";

            btnEl.style.opacity = "0.75";

        }

        if (typeof toast === 'function') toast("SFX Generavimas", "Pradėtas SFX fono garso generavimas per MMAudio...", "info");



        if (window._standaloneSfxAudio) {

            try { window._standaloneSfxAudio.pause(); } catch(e){}

            window._standaloneSfxAudio = null;

        }



        const res = await fetch('/api/video/regenerate_sfx', {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({

                projectId: (state && state.currentProjectId) || "default",

                sceneId: sceneId,

                sfxPrompt: sfxPrompt,

                ignoreLips: ignoreLips

            })

        });

        const data = await res.json();

        if (data.status === "success") {

            if (typeof toast === 'function') toast("SFX Sukurtas", "Scenos fono garsai sėkmingai sugeneruoti!", "success");

            const proj = typeof window.getProj === 'function' ? window.getProj() : null;

            if (proj) {

                if (!proj.sceneSfxById) proj.sceneSfxById = {};

                if (!proj.sceneSfxVarsById) proj.sceneSfxVarsById = {};

                const cleanId = String(sceneId);

                const numId = cleanId.replace(/^S/i, '');

                const finalUrl = data.sfxUrl || `/audio/sfx_${data.video.split('.')[0]}.wav`;

                [cleanId, cleanId.toLowerCase(), cleanId.toUpperCase(), numId, 's' + numId, 'S' + numId].forEach(k => {

                    proj.sceneSfxById[k] = finalUrl;

                    if (data.variations) proj.sceneSfxVarsById[k] = data.variations;

                });

                if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();

            }

            const viewerEl = document.getElementById('viewer');

            const currentViewerId = (state.viewerList && state.viewerList[state.viewerIndex]) ? String(state.viewerList[state.viewerIndex]) : '';

            const isViewingThisScene = currentViewerId && (currentViewerId === String(sceneId) || currentViewerId.replace(/^S/i, '') === String(sceneId).replace(/^S/i, ''));

            if (typeof window.updateViewer === 'function' && viewerEl?.classList.contains('show') && isViewingThisScene && !document.hidden) {

                window.updateViewer();

            }

        } else {

            throw new Error(data.message || "SFX generavimo klaida.");

        }

    } catch(err) {

        console.error("[viewerRegenerateSfx] Klaida:", err);

        if (typeof toast === 'function') toast("Klaida", err.message, "error");

    } finally {

        delete window._generatingSfxByScene[sId];

        delete window._generatingSfxByScene[sId.replace(/^S/i, '')];

        delete window._generatingSfxByScene['s' + sId.replace(/^S/i, '')];

        delete window._generatingSfxByScene['S' + sId.replace(/^S/i, '')];

        if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images');

        if (btnEl) {

            btnEl.disabled = false;

            btnEl.innerHTML = "🔄 Pergeneruoti";

            btnEl.style.opacity = "1";

        }

    }

};





window.openSfxVariationsModal = function(sceneId) {

    window._activeSfxModalSceneId = String(sceneId);

    window.renderSfxVariationsModal(sceneId);

    const modal = document.getElementById("modalSfxVariations");

    if (modal) modal.classList.add("show");

};



window.closeSfxVariationsModal = function() {

    window.hoverStopSfx();

    if (window._modalPlayAudio) {

        try { window._modalPlayAudio.pause(); } catch(e){}

        window._modalPlayAudio = null;

        window._modalPlayVarId = null;

    }

    const modal = document.getElementById("modalSfxVariations");

    if (modal) modal.classList.remove("show");

};



window.playSfxVariation = function(sceneId, varId, url, btnEl) {

    if (!url) return;

    if (window._modalPlayAudio && !window._modalPlayAudio.paused && window._modalPlayVarId === varId) {

        window._modalPlayAudio.pause();

        window._modalPlayAudio = null;

        window._modalPlayVarId = null;

        if (btnEl) btnEl.textContent = '▶';

        return;

    }

    if (window._modalPlayAudio) {

        try { window._modalPlayAudio.pause(); } catch(e){}

    }

    document.querySelectorAll('.btn-sfx-var-play').forEach(b => b.textContent = '▶');

    const freshUrl = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();

    window._modalPlayAudio = new Audio(freshUrl);

    window._modalPlayVarId = varId;

    if (btnEl) btnEl.textContent = '⏹';

    window._modalPlayAudio.onended = () => {

        if (btnEl) btnEl.textContent = '▶';

        window._modalPlayAudio = null;

        window._modalPlayVarId = null;

    };

    window._modalPlayAudio.play().catch(e => console.warn("[playSfxVariation]", e));

};



window.setMainSfxVariation = async function(sceneId, varId) {

    window.hoverStopSfx();

    if (window._modalPlayAudio) {

        try { window._modalPlayAudio.pause(); } catch(e){}

        window._modalPlayAudio = null;

        window._modalPlayVarId = null;

    }

    const proj = typeof window.getProj === 'function' ? window.getProj() : null;

    const projId = proj ? (proj.id || 'default') : 'default';

    try {

        const res = await fetch('/api/video/sfx_variations/set_main', {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ projectId: projId, sceneId: sceneId, varId: varId })

        });

        const data = await res.json();

        if (data.status === 'success') {

            if (proj) {

                if (!proj.sceneSfxById) proj.sceneSfxById = {};

                if (!proj.sceneSfxVarsById) proj.sceneSfxVarsById = {};

                const cleanId = String(sceneId);

                const numId = cleanId.replace(/^S/i, '');

                [cleanId, cleanId.toLowerCase(), cleanId.toUpperCase(), numId, 's' + numId, 'S' + numId].forEach(k => {

                    proj.sceneSfxById[k] = data.sfxUrl;

                    if (data.variations) proj.sceneSfxVarsById[k] = data.variations;

                });

            }

            window.renderSfxVariationsModal(sceneId);

            if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images');

            if (typeof window.updateViewer === 'function' && document.getElementById('viewer')?.classList.contains('show')) {

                window.updateViewer();

            }

            if (typeof toast === 'function') toast("Pagrindinis SFX", "SFX variacija sėkmingai pažymėta kaip pagrindinė!", "success");

        } else {

            throw new Error(data.message || "Nepavyko nustatyti variacijos");

        }

    } catch(err) {

        console.error("setMainSfxVariation error:", err);

        if (typeof toast === 'function') toast("Klaida", err.message, "error");

    }

};



window.deleteSfxVariation = async function(sceneId, varId) {

    window.hoverStopSfx();

    if (window._modalPlayAudio) {

        try { window._modalPlayAudio.pause(); } catch(e){}

        window._modalPlayAudio = null;

        window._modalPlayVarId = null;

    }

    if (!confirm("Ar tikrai norite ištrinti šią SFX variaciją?")) return;

    const proj = typeof window.getProj === 'function' ? window.getProj() : null;

    const projId = proj ? (proj.id || 'default') : 'default';

    try {

        const res = await fetch('/api/video/sfx_variations/delete', {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ projectId: projId, sceneId: sceneId, varId: varId })

        });

        const data = await res.json();

        if (data.status === 'success') {

            if (proj) {

                if (!proj.sceneSfxById) proj.sceneSfxById = {};

                if (!proj.sceneSfxVarsById) proj.sceneSfxVarsById = {};

                const cleanId = String(sceneId);

                const numId = cleanId.replace(/^S/i, '');

                [cleanId, cleanId.toLowerCase(), cleanId.toUpperCase(), numId, 's' + numId, 'S' + numId].forEach(k => {

                    proj.sceneSfxById[k] = data.sfxUrl;

                    if (data.variations) proj.sceneSfxVarsById[k] = data.variations;

                });

            }

            window.renderSfxVariationsModal(sceneId);

            if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images');

            if (typeof window.updateViewer === 'function' && document.getElementById('viewer')?.classList.contains('show')) {

                window.updateViewer();

            }

            if (typeof toast === 'function') toast("Ištrinta", "SFX variacija pašalinta.", "info");

        } else {

            throw new Error(data.message || "Nepavyko ištrinti variacijos");

        }

    } catch(err) {

        console.error("deleteSfxVariation error:", err);

        if (typeof toast === 'function') toast("Klaida", err.message, "error");

    }

};



window.hoverPlaySfx = function(url) {

    if (!url) return;

    if (window._sfxHoverAudio) {

        try {

            window._sfxHoverAudio.pause();

            window._sfxHoverAudio.currentTime = 0;

        } catch(e) {}

    }

    const freshUrl = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();

    window._sfxHoverAudio = new Audio(freshUrl);

    window._sfxHoverAudio.volume = 0.85;

    window._sfxHoverAudio.play().catch(e => console.warn("[hoverPlaySfx]", e));

};



window.hoverStopSfx = function() {

    if (window._sfxHoverAudio) {

        try {

            window._sfxHoverAudio.pause();

            window._sfxHoverAudio.currentTime = 0;

        } catch(e) {}

        window._sfxHoverAudio = null;

    }

    document.querySelectorAll('.btn-sfx-var-play').forEach(b => {

        b.innerHTML = '▶';

        b.dataset.isPlaying = 'false';

    });

};



window.renderSfxVariationsModal = function(sceneId) {

    const sId = String(sceneId || window._activeSfxModalSceneId || '');

    const numId = sId.replace(/^S/i, '');

    const titleEl = document.getElementById("sfxModalTitle");

    if (titleEl) titleEl.textContent = `🎵 SFX Garso Variacijos (Scene ${sId.toUpperCase()})`;



    const proj = typeof window.getProj === 'function' ? window.getProj() : null;

    const container = document.getElementById("sfxVariationsListContainer");

    if (!container) return;



    if (!proj) {

        container.innerHTML = '<div class="text-muted text-sm">Projektas nerastas.</div>';

        return;

    }



    const vars = (proj.sceneSfxVarsById && (

        proj.sceneSfxVarsById[sId] ||

        proj.sceneSfxVarsById[sId.toLowerCase()] ||

        proj.sceneSfxVarsById[sId.toUpperCase()] ||

        proj.sceneSfxVarsById[numId] ||

        proj.sceneSfxVarsById['s' + numId] ||

        proj.sceneSfxVarsById['S' + numId]

    )) || [];



    if (vars.length === 0) {

        container.innerHTML = `

        <div style="text-align: center; padding: 30px; background: rgba(0,0,0,0.3); border-radius: 8px; color: #94a3b8; font-size: 13px;">

          Šiai scenai dar nėra papildomų SFX variacijų.<br><br>

          Spustelėkite mygtuką žemiau <strong>„🔄 Sugeneruoti naują įrašą (Take)“</strong>!

        </div>`;

        return;

    }



    let html = '';

    vars.forEach((v, idx) => {

        const isMain = !!v.isMain;

        html += `

        <div class="sfx-variation-card" 

             style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-radius: 8px; cursor: pointer; transition: all 0.2s; background: ${isMain ? 'rgba(245, 158, 11, 0.16)' : 'rgba(255, 255, 255, 0.03)'}; border: ${isMain ? '2px solid #fbbf24' : '1px solid rgba(255, 255, 255, 0.1)'}; ${isMain ? 'box-shadow: 0 0 15px rgba(245, 158, 11, 0.2);' : ''}"

             onmouseenter="window.hoverPlaySfx('${v.url}'); this.style.background='rgba(245, 158, 11, 0.28)';"

             onmouseleave="window.hoverStopSfx(); this.style.background='${isMain ? 'rgba(245, 158, 11, 0.16)' : 'rgba(255, 255, 255, 0.03)'}';"

             onclick="window.setMainSfxVariation('${sId}', '${v.id}');"

             title="Užveskite pelytę paklausyti, spustelėkite pažymėti kaip pagrindinę">

          

          <div class="flex items-center" style="gap: 12px; min-width: 0;">

            <button type="button" class="btn icon btn-sfx-var-play" data-var-id="${v.id}" 

                    style="width: 32px; height: 32px; border-radius: 50%; font-size: 13px; background: rgba(245, 158, 11, 0.25); border: 1px solid #fbbf24; color: #fbbf24; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;"

                    onclick="event.stopPropagation(); window.playSfxVariation('${sId}', '${v.id}', '${v.url}', this);" title="Paklausyti">

              ▶

            </button>

            <div style="min-width: 0;">

              <div class="flex items-center" style="gap: 8px;">

                <strong style="color: ${isMain ? '#fbbf24' : '#fff'}; font-size: 13px;">${escapeHtml(v.name || `Take #${idx + 1}`)}</strong>

                ${v.createdAt ? `<span style="font-size: 11px; color: #94a3b8;">${escapeHtml(v.createdAt)}</span>` : ''}

              </div>

              ${v.prompt ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 320px;" title="${escapeHtml(v.prompt)}">📝 ${escapeHtml(v.prompt)}</div>` : ''}

            </div>

          </div>



          <div class="flex items-center" style="gap: 10px; flex-shrink: 0;" onclick="event.stopPropagation();">

            ${isMain 

              ? `<span style="font-size: 11px; font-weight: 800; color: #fbbf24; background: rgba(245, 158, 11, 0.25); border: 1px solid #fbbf24; padding: 4px 10px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px;">★ PAGRINDINIS</span>`

              : `<button type="button" class="btn text-xs" style="padding: 4px 10px; font-size: 11px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.2); color: #fff;" onclick="window.setMainSfxVariation('${sId}', '${v.id}');">Pasirinkti</button>`

            }

            <button type="button" class="btn bad icon text-xs" style="width: 26px; height: 26px; padding: 0; font-size: 11px; display: inline-flex; align-items: center; justify-content: center;" onclick="window.deleteSfxVariation('${sId}', '${v.id}');" title="Delete šią variaciją">🗑</button>

          </div>

        </div>`;

    });

    container.innerHTML = html;

};



window.triggerSfxRegenFromModal = function() {

    const sId = window._activeSfxModalSceneId;

    if (!sId) return;

    const btn = document.getElementById("vwBtnRegenSfx");

    if (typeof window.viewerRegenerateSfx === 'function') {

        window.viewerRegenerateSfx(sId, btn);

        window.closeSfxVariationsModal();

    }

};



// AUTOMATINIS GARSO / VIDEO SUSTABDYMAS KAI VARTOTOJAS PAKEIČIA TABĄ ARBA MINIMIZUOJA LANGĄ
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (window._viewerSfxAudio) {
            try { window._viewerSfxAudio.pause(); } catch(e){}
        }
        if (window._sfxHoverAudio) {
            try { window._sfxHoverAudio.pause(); } catch(e){}
        }
        if (window._standaloneSfxAudio) {
            try { window._standaloneSfxAudio.pause(); } catch(e){}
        }
        const vwVideo = document.getElementById('vwVideo');
        if (vwVideo && !vwVideo.paused) {
            try { vwVideo.pause(); } catch(e){}
        }
        const previewPlayer = document.getElementById('videoPreviewPlayer');
        if (previewPlayer && !previewPlayer.paused) {
            try { previewPlayer.pause(); } catch(e){}
        }
    }
});
