// ============================================================================
// 6. CHARACTER REFS LOGIC (TAB 2) - MULTI-GPU & JIT READY
// ============================================================================

async function checkBaseTemplates() {
  const proj = window.getProj();
  const style = (proj && proj.globals && proj.globals.charBaseStyle) || 'default';
  
  for(const key of Object.keys(state.baseStatus)) {
     // Tikriname per kelias alternatyvas: /base/{style}/base_{key}.png, arba per state.baseStatus[key].file
     let candidate = `base/${style}/base_${key}.png`;
     let foundUrl = null;
     
     try {
         const r = await fetch(candidate, {method:'HEAD'});
         if (r.ok) foundUrl = candidate;
     } catch(e) {}
     
     if (!foundUrl && state.baseStatus[key] && state.baseStatus[key].file) {
         try {
             const r2 = await fetch(state.baseStatus[key].file, {method:'HEAD'});
             if (r2.ok) foundUrl = state.baseStatus[key].file;
         } catch(e) {}
     }
     
     if (!foundUrl) {
         // Tikriname /prompts/{style}/base/
         const promptCand = `prompts/${style}/base/${style}_base_${key}.png`;
         try {
             const r3 = await fetch(promptCand, {method:'HEAD'});
             if (r3.ok) foundUrl = promptCand;
         } catch(e) {}
     }

     state.baseStatus[key].html = !!foundUrl;
     state.baseStatus[key].url = foundUrl ? (foundUrl.startsWith('/') ? foundUrl : `/${foundUrl}`) : '';
     state.baseStatus[key].comfy = true;
  }
  if (typeof window.renderBaseLibrary === 'function') window.renderBaseLibrary();
  if (typeof window.renderCharRefs === 'function') window.renderCharRefs();
}
window.checkBaseTemplates = checkBaseTemplates;

if($("#btnCheckBases")) {
  $("#btnCheckBases").addEventListener("click", () => {
       checkBaseTemplates();
       toast("Checking", "Checking local base templates...");
   });
}

// Upload button now just confirms JIT is active
if($("#btnUploadBases")) {
  $("#btnUploadBases").addEventListener("click", () => {
     toast("JIT Sync Active", "Base templates will be auto-synced to GPU nodes when needed.", "success");
  });
}

window.renderBaseLibrary = function() {
   const proj = window.getProj();
   const style = (proj && proj.globals && proj.globals.charBaseStyle) || 'default';
   const grid = $("#baseLibraryGrid"); 
   if(!grid) return;
   let html = '';
   for(const [key, data] of Object.entries(state.baseStatus)) {
      const fileName = `base_${key}.png`;
      const imgSrc = data.html ? (data.url || `/base/${style}/base_${key}.png`) : '';
      html += `
      <div class="base-card" style="display: flex; flex-direction: column; gap: 8px; background: var(--panel2); border: 1px solid var(--border); border-radius: var(--r2); padding: 12px;">
        <div class="flex items-center justify-between">
          <div class="font-bold text-xs" style="text-transform: uppercase;">${key} (${fileName})</div>
          <span class="badge ${data.html ? 'good' : ''}" style="font-size: 10px; padding: 2px 6px;">${data.html ? 'FOUND' : 'MISSING'}</span>
        </div>
        <div style="width: 100%; aspect-ratio: 9/16; max-height: 160px; background: #080c12; border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; overflow: hidden; display: flex; align-items: center; justify-content: center;">
          ${data.html ? `<img src="${imgSrc}?t=${Date.now()}" alt="${fileName}" style="width: 100%; height: 100%; object-fit: contain;" />` : `<div class="text-center text-muted" style="padding: 10px; font-size: 11px; opacity: 0.5;">Nėra atvaizdo diske</div>`}
        </div>
        <div class="text-xs text-muted" style="font-size: 11px; display: flex; justify-content: space-between; align-items: center;">
          <span>Active Style: <strong style="color: var(--text);">${escapeHtml(style)}</strong></span>
          <span style="color: var(--good); font-size: 10px;">GPU: JIT Sync</span>
        </div>
      </div>`;
   }
   grid.innerHTML = html;
}

window.extractCharRefs = function() {
  const proj = window.getProj();
  if (!proj.charRefs) proj.charRefs = {};
  
  // Auto-clean any temporary or edit_src_ keys from proj.charRefs
  Object.keys(proj.charRefs).forEach(k => {
    if (k.startsWith('edit_src_') || k.startsWith('mock_edit_') || k === 'empty_scene.png') {
      delete proj.charRefs[k];
    }
  });

  const unique = new Set();
  (proj.scenes || []).forEach(s => {
    ['refA', 'refB', 'refC'].forEach(key => {
      const val = (s[key] || '').trim();
      if (val && val !== 'empty_scene.png' && !val.startsWith('edit_src_') && !val.startsWith('mock_edit_')) {
        unique.add(val);
      }
    });
  });
  unique.forEach(r => {
    if(!proj.charRefs[r]) { proj.charRefs[r] = { template: 'male', params: { prompt: '', negative: '', seed: 941027876668241, randomize: true }, variations: [], mainId: null, generating: false }; }
  });
  window.saveCurrentProject();
}

// ============================================================================
// FIX: MAIN SAFEGUARD FOR "VARS" ARRAY
// ============================================================================
window.getCharMainVariant = function(charData) {
    if (!charData) return null;
    
    // Auto-Heal: If variations is missing but vars exists, migrate it
    if (!charData.variations && charData.vars) {
        charData.variations = charData.vars;
    }

    // If completely missing, create an empty array to prevent crashes
    if (!charData.variations) {
        charData.variations = [];
    }

    if (charData.variations.length === 0) return null;
    let main = charData.variations.find(v => v.id === charData.mainId);
    if (!main || main.status === 'error' || (!main.url && main.status !== 'queued' && main.status !== 'processing')) {
        const lastDone = charData.variations.slice().reverse().find(v => v.status === 'done' && v.url && v.url.trim() !== '');
        if (lastDone) return lastDone;
        const inProgress = charData.variations.slice().reverse().find(v => (v.status === 'queued' || v.status === 'processing') && (v.tempUrl || v.url));
        if (inProgress) return inProgress;
    }
    return main || charData.variations[charData.variations.length-1]; 
}
// ============================================================================

window.sendCharsToLLM = function() {
    const proj = window.getProj();
    const refs = Object.keys(proj.charRefs || {}).filter(r => !r.startsWith('edit_src_') && !r.startsWith('mock_edit_') && r !== 'empty_scene.png');
    if(refs.length === 0) return toast("Error", "No characters found.", "error");
    const exportData = refs.map(r => {
        const c = proj.charRefs[r] || {};
        const p = c.params || c;
        return { id: r, base: c.template || 'male', prompt: p.prompt || '', negative: p.negative || '' };
    });
    $("#llmJsonOutput").value = JSON.stringify({ characters: exportData }, null, 2);
    
    $$('.nav-item').forEach(x=>x.classList.remove('active'));
    document.querySelector('.nav-item[data-tab="script"]').classList.add('active');
    $$('.content').forEach(x=>x.classList.add('hidden')); $("#tab-script").classList.remove('hidden');
    
    $("#btnCommitLlm").disabled = false; state.currentLlmTask = 'A';
    toast("Moved", "Characters moved back to LLM tab for editing.", "success");
}

if ($("#btnClearAllChars")) {
    $("#btnClearAllChars").onclick = () => {
        if(confirm("Are you sure you want to clear ALL Character References? This will NOT delete your scenes.")) {
            window.getProj().charRefs = {};
            window.saveCurrentProject();
            if(typeof window.renderCharRefs === 'function') window.renderCharRefs();
            toast("Cleared", "Character references deleted.", "success");
        }
    };
}

window.renderCharRefs = function() {
  const proj = window.getProj();
  const grid = $("#charRefsGrid"); if(!grid) return;

  // Auto-clean any temporary or edit_src_ keys from proj.charRefs
  if (proj.charRefs) {
    Object.keys(proj.charRefs).forEach(k => {
      if (k.startsWith('edit_src_') || k.startsWith('mock_edit_') || k === 'empty_scene.png') {
        delete proj.charRefs[k];
      }
    });
  }

  if ($("#btnBackToLLMChars")) {
      $("#btnBackToLLMChars").onclick = window.sendCharsToLLM;
  }

  let html = ''; const refs = Object.keys(proj.charRefs || {}).filter(r => !r.startsWith('edit_src_') && !r.startsWith('mock_edit_') && r !== 'empty_scene.png');
  if(refs.length === 0) { grid.innerHTML = `<div class="text-muted" style="grid-column:1/-1; padding:20px">No character references found. Load JSON first.</div>`; return; }

  refs.forEach(refName => {
     const safeRef = refName.replace(/'/g, "\\'");
     const data = proj.charRefs[refName]; const main = window.getCharMainVariant(data); 
     const vCount = data.variations ? data.variations.length : 0;
     
     let status = 'missing'; if(vCount > 0) status = data.mainId ? 'main selected' : 'generated';
     const templateBase = state.baseStatus[data.template];
     const canGen = data.template !== ''; 
     let warnMsg = ''; if(!data.template) warnMsg = "Select template to continue"; else if(!templateBase || !templateBase.html) warnMsg = "Base template missing in Hub";

     const isFlipped = Boolean((main && (main.flipH === true || main.params?.flipH === true)) || (data && (data.flipH === true || data.params?.flipH === true)));
     const flipStyle = isFlipped ? 'transform:scaleX(-1);' : '';

     html += `<div class="card">
        <div class="card-img-wrap portrait">
          ${main && main.status==='done' ? `<img src="${main.url}" alt="${escapeHtml(refName)}" style="${flipStyle}" ondblclick="window.openCharViewer('${safeRef}')" />` : ''}
          ${isFlipped ? `<div class="badge" style="position:absolute;bottom:8px;left:8px;z-index:10;background:rgba(6,182,212,0.85);color:#fff;font-size:10px;font-weight:bold;pointer-events:none;">🪞 MIRROR</div>` : ''}
          ${vCount > 0 ? `<div class="var-badge" onclick="window.openCharVars('${safeRef}')" title="View Variations">VARS: ${vCount}</div>` : ''}
          ${data.generating ? `<div class="placeholder-view" style="background:rgba(0,0,0,0.78); z-index:25;"><div class="mono text-accent" style="font-weight:bold; font-size:11px;" id="char-prog-text-${safeRef}">⏳ Synthesizing 0%...</div><div class="progress-container"><div class="progress-fill" id="char-prog-fill-${safeRef}" style="width:0%"></div></div></div>` : ''}
          ${!main && !data.generating ? `<div class="placeholder-view"><div class="mono text-muted mb-2">672 x 1568</div><div class="text-xs text-warn mb-2">${warnMsg}</div><button class="btn good text-xs" onclick="window.uploadCustomCharRef('${safeRef}')">📤 Upload Ref</button></div>` : ''}
          ${main && (main.status==='queued' || main.status==='processing') ? `<div class="placeholder-view"><div class="mono text-accent" style="font-weight:bold" id="prog-text-${main.id}">${main.status === 'processing' ? '⏳ Kraunamas modelis...' : '⏳ Queued...'}</div><div class="progress-container"><div class="progress-fill" id="prog-fill-${main.id}"></div></div></div>` : ''}
          
          ${main && main.status==='error' ? `<div class="placeholder-view" style="background:rgba(255, 107, 107, 0.1);"><div style="color:var(--bad); font-size:14px; font-weight:bold;">❌ ERROR</div><div class="text-xs text-muted mt-2 text-center mb-2">GPU timed out or<br>failed to fetch file.</div><button class="btn good text-xs" onclick="window.uploadCustomCharRef('${safeRef}')">📤 Upload Ref</button></div>` : ''}

          ${main && (main.status==='done' || main.status==='completed' || main.url) ? `<div class="card-overlay" ondblclick="window.openCharViewer('${safeRef}')">
            <div class="card-overlay-row">
              <button class="btn primary icon" title="Regenerate" onclick="window.doGenerateChar('${safeRef}', { randomize: true, seed: Math.floor(Math.random() * 9999999999) }, {}, 1)" ${canGen?'':'disabled'}>🔄</button>
              <button class="btn warn icon" title="Further Edit" onclick="window.openCharFurtherEdit('${safeRef}')" ${canGen?'':'disabled'}>✏️</button>
              <button class="btn icon" title="Inpaint Studio (Mask / Infill)" style="background: rgba(168, 85, 247, 0.25); color: #c084fc; border-color: rgba(168, 85, 247, 0.45);" onclick="window.openInpaintStudio('${safeRef}', 'char')">🖌️</button>
              <button class="btn icon" title="Video Studio (I2V / Motion)" style="background: rgba(236, 72, 153, 0.25); color: #f472b6; border-color: rgba(236, 72, 153, 0.45);" onclick="window.openVideoStudio('${safeRef}', 'char')">🎥</button>
            </div>
            <div class="card-overlay-row">
              <button class="btn good icon" title="Upload Custom Ref" onclick="window.uploadCustomCharRef('${safeRef}')">📤</button>
              <button class="btn good icon" title="Download Main" onclick="window.downloadCharSingle('${safeRef}')">💾</button>
              <button class="btn icon" title="Fullscreen" onclick="window.openCharViewer('${safeRef}')">⛶</button>
            </div>
          </div>` : ''}
        </div>
        
        <div class="card-body">
           <div class="flex justify-between items-center mb-2">
             <strong class="text-sm" title="${escapeHtml(refName)}" style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${escapeHtml(refName)}</strong>
             <span class="badge ${status==='missing'?'warn':'ready'}">${status.toUpperCase()}</span>
           </div>
           <div class="field mb-2">
             <select onchange="window.updateCharTemplate('${safeRef}', this.value)">
               <option value="">-- Select Template --</option>
               <option value="male" ${data.template==='male'?'selected':''}>Male</option>
               <option value="female" ${data.template==='female'?'selected':''}>Female</option>
               <option value="teen" ${data.template==='teen'?'selected':''}>Teen</option>
               <option value="kid" ${data.template==='kid'?'selected':''}>Kid</option>
             </select>
           </div>
           <div class="flex justify-between items-center mb-2" style="font-size: 11px;">
             <span class="text-xs text-muted" style="font-size: 10.5px;">Balsas:</span>
             ${(() => {
               const voiceKey = data.voice_id || `voice_${refName.replace(/\.[^.]+$/, '').toLowerCase()}`;
               const resVoice = (typeof window.resolveVoiceForRole === 'function' ? window.resolveVoiceForRole(voiceKey) : null) || data.voice_id;
               return resVoice ? `<span class="badge ready" style="font-size: 10px; cursor: pointer; max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" onclick="window.openVoiceCastingStudio()" title="Spustelėkite atidaryti Casting Studio">🎙️ ${escapeHtml(resVoice)}</span>` : `<span class="badge bad" style="font-size: 10px; cursor: pointer;" onclick="window.openVoiceCastingStudio()" title="Spustelėkite sukurti/priskirti balsą Casting Studio">🎙️ Trūksta balso</span>`;
             })()}
           </div>
           <div class="flex gap-10 mt-auto">
             <button class="btn flex-1 ${canGen?'primary':''}" onclick="window.doGenerateChar('${safeRef}', null, {}, 1)" ${canGen?'':'disabled'}>Generate</button>
             <button class="btn good icon" title="Upload Custom Ref" onclick="window.uploadCustomCharRef('${safeRef}')">📤</button>
             <button class="btn icon" title="Edit Params" onclick="window.openCharEdit('${safeRef}')">⚙️</button>
             <button class="btn bad icon" title="Delete Outputs" onclick="if(confirm('Delete outputs for ${safeRef}?')){ window.getProj().charRefs['${safeRef}'].variations=[]; window.getProj().charRefs['${safeRef}'].mainId=null; window.saveCurrentProject(); window.renderCharRefs(); }">❌</button>
           </div>
        </div>
     </div>`;
  });
  grid.innerHTML = html;
}

window.uploadCustomCharRef = function(refName) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        toast("Uploading...", `Uploading custom reference for ${refName}...`, "info");
        
        const proj = window.getProj();
        if (!proj.charRefs[refName]) {
            proj.charRefs[refName] = {
                template: 'male',
                params: { prompt: '', negative: '', seed: 941027876668241, randomize: true },
                variations: [],
                mainId: null,
                generating: false
            };
        }
        const data = proj.charRefs[refName];
        
        try {
            let uploadedUrl = "";
            let targetFilename = refName;
            if (!targetFilename.toLowerCase().match(/\.(png|jpg|jpeg|webp)$/)) {
                const ext = (file.name.split('.').pop() || 'png').toLowerCase();
                targetFilename += '.' + ext;
            }

            if (state.connected) {
                const fd = new FormData();
                fd.append("file", new File([file], targetFilename, { type: file.type || 'image/png' }));
                const res = await fetch("/api/upload_vault", { method: "POST", body: fd });
                if (!res.ok) throw new Error("Upload failed");
                const resData = await res.json();
                uploadedUrl = resData.url;
            } else {
                uploadedUrl = URL.createObjectURL(file);
            }

            const varId = typeof rId === 'function' ? rId() : 'v_' + Math.random().toString(36).substr(2, 9);
            const newVar = {
                id: varId,
                status: "done",
                url: uploadedUrl,
                createdAt: typeof nowIso === 'function' ? nowIso() : new Date().toISOString().replace('T', ' ').substring(0, 19),
                wfMode: "CUSTOM UPLOAD",
                seedUsed: 0,
                params: JSON.parse(JSON.stringify(data.params || {}))
            };
            if (!data.variations) data.variations = [];
            data.variations.push(newVar);
            data.mainId = varId;

            if (!proj.refs.includes(refName)) {
                proj.refs.push(refName);
            }

            window.saveCurrentProject();
            window.renderCharRefs();
            if (typeof window.updateRefsSelects === 'function') window.updateRefsSelects();
            if (typeof window.validateScenes === 'function') window.validateScenes();
            
            toast("Success", `Custom ref uploaded for ${refName}!`, "success");
        } catch (err) {
            console.error("Upload error:", err);
            toast("Error", err.message || "Failed to upload reference", "error");
        }
    };
    input.click();
};

window.updateCharTemplate = (refName, val) => { const proj = window.getProj(); if(proj.charRefs[refName]) { proj.charRefs[refName].template = val; window.saveCurrentProject(); window.renderCharRefs(); } };

window.openCharEdit = (refName) => {
   const proj = window.getProj();
   state.editingCharId = refName;
   const c = (proj.charRefs && proj.charRefs[refName]) || {};
   const main = window.getCharMainVariant ? window.getCharMainVariant(c) : null;
   const p = c.params || (main && main.params) || c || {};
   $("#cEditRefName").textContent = refName;
   $("#cPrompt").value = p.prompt || "";
   $("#cNeg").value = p.negative || "";

   // Automatiniai numatytieji parametrai pagal pasirinktą modelį:
   // Qwen Image Edit 2.1 -> 25 steps, 1.0 CFG
   // Qwen 2509 / 2511 (Lightning) -> 4 steps, 1.0 CFG
   // Kiti -> 20 steps, 3.5 CFG
   const unet = proj.globals?.unetName || '';
   const lora = proj.globals?.loraName || '';
   const wf = proj.globals?.workflowMode || '';
   const charModelVal = document.getElementById('charModel')?.value || proj.globals?.modelPreset || '';
   const combined = `${charModelVal}|${unet}|${lora}|${wf}`;
   const isCloud = combined.includes('nano_banana');
   const is21 = !isCloud && (combined.includes('2.1') || wf === 'qwen_2_1');
   const isLightning = !isCloud && !is21 && (combined.includes('Lightning') || combined.includes('2509') || combined.includes('2511') || combined.includes('2506'));
   const modelDefaultSteps = is21 ? 25 : (isLightning ? 4 : 20);
   const modelDefaultCfg = (is21 || isLightning) ? 1.0 : 3.5;

   const toolbarStepsEl = document.getElementById('charSteps');
   const toolbarCfgEl = document.getElementById('charCfg');
   
   // Užtikriname, kad toolbar ir globalūs parametrai atitinka aktyvų modelį
   let effSteps = (proj.globals?.charSteps !== undefined && proj.globals?.charSteps !== null)
       ? parseInt(proj.globals.charSteps, 10)
       : (toolbarStepsEl?.value ? parseInt(toolbarStepsEl.value, 10) : modelDefaultSteps);
   let effCfg = (proj.globals?.charCfg !== undefined && proj.globals?.charCfg !== null)
       ? parseFloat(proj.globals.charCfg)
       : (toolbarCfgEl?.value ? parseFloat(toolbarCfgEl.value) : modelDefaultCfg);

   if (is21) {
       if (isNaN(effSteps) || effSteps < 10) effSteps = 25;
       if (isNaN(effCfg) || effCfg > 2.0 || effCfg <= 0) effCfg = 1.0;
   } else if (isLightning) {
       if (isNaN(effSteps) || effSteps > 8 || effSteps < 1) effSteps = 4;
       if (isNaN(effCfg) || effCfg > 2.0 || effCfg <= 0) effCfg = 1.0;
   }

   const stepsNote = document.getElementById('cStepsLabelNote');
   const cfgNote = document.getElementById('cCfgLabelNote');
   const cStepsEl = $("#cSteps");
   const cCfgEl = $("#cCfg");

   if (isCloud) {
       if (stepsNote) stepsNote.textContent = '(N/A - Cloud)';
       if (cfgNote) cfgNote.textContent = '(N/A - Cloud)';
       if (cStepsEl) { cStepsEl.disabled = true; cStepsEl.placeholder = 'N/A'; cStepsEl.style.opacity = '0.35'; cStepsEl.style.pointerEvents = 'none'; }
       if (cCfgEl) { cCfgEl.disabled = true; cCfgEl.placeholder = 'N/A'; cCfgEl.style.opacity = '0.35'; cCfgEl.style.pointerEvents = 'none'; }
   } else {
       if (stepsNote) stepsNote.textContent = `(Modelis: ${effSteps})`;
       if (cfgNote) cfgNote.textContent = `(CFG: ${effCfg})`;
       if (cStepsEl) { cStepsEl.disabled = false; cStepsEl.placeholder = `${effSteps}`; cStepsEl.style.opacity = '1'; cStepsEl.style.pointerEvents = 'auto'; }
       if (cCfgEl) { cCfgEl.disabled = false; cCfgEl.placeholder = `${effCfg}`; cCfgEl.style.opacity = '1'; cCfgEl.style.pointerEvents = 'auto'; }
   }

   // Patikriname ar veikėjas turi išsaugotus parametrus ir ar jie suderinami su dabartiniu modeliu
   let curSteps = (p.customSteps !== undefined && p.customSteps !== null && p.customSteps !== '') 
       ? parseInt(p.customSteps, 10) 
       : (p.steps !== undefined && p.steps !== null && p.steps !== '' ? parseInt(p.steps, 10) : effSteps);
   let curCfg = (p.customCfg !== undefined && p.customCfg !== null && p.customCfg !== '') 
       ? parseFloat(p.customCfg) 
       : (p.cfg !== undefined && p.cfg !== null && p.cfg !== '' ? parseFloat(p.cfg) : effCfg);

   if (is21) {
       if (isNaN(curSteps) || curSteps < 10) curSteps = 25;
       if (isNaN(curCfg) || curCfg > 2.0 || curCfg <= 0) curCfg = 1.0;
   } else if (isLightning) {
       if (isNaN(curSteps) || curSteps > 8 || curSteps < 1) curSteps = 4;
       if (isNaN(curCfg) || curCfg > 2.0 || curCfg <= 0) curCfg = 1.0;
   }

   if (!isCloud) {
       if (cStepsEl) cStepsEl.value = curSteps;
       if (cCfgEl) cCfgEl.value = curCfg;
   }
   $("#cSeed").value = p.seed || 1234567;
   $("#cRandomize").checked = p.randomize !== false;
   $("#modalCharEdit").classList.add("show");
}
window.closeCharEdit = () => { $("#modalCharEdit").classList.remove("show"); state.editingCharId = null; };

window.applyCharEdit = (regen = false) => {
   const proj = window.getProj();
   const refName = state.editingCharId;
   const c = (proj.charRefs && proj.charRefs[refName]) || {};
   if (!c.params) c.params = {};
   const p = c.params;
   p.prompt = $("#cPrompt").value;
   p.negative = $("#cNeg").value;

   const unet = proj.globals?.unetName || '';
   const lora = proj.globals?.loraName || '';
   const wf = proj.globals?.workflowMode || '';
   const charModelVal = document.getElementById('charModel')?.value || proj.globals?.modelPreset || '';
   const combined = `${charModelVal}|${unet}|${lora}|${wf}`;
   const isCloud = combined.includes('nano_banana');
   const is21 = !isCloud && (combined.includes('2.1') || wf === 'qwen_2_1');
   const isLightning = !isCloud && !is21 && (combined.includes('Lightning') || combined.includes('2509') || combined.includes('2511') || combined.includes('2506'));
   const modelDefaultSteps = is21 ? 25 : (isLightning ? 4 : 20);
   const modelDefaultCfg = (is21 || isLightning) ? 1.0 : 3.5;

   const stepsRaw = ($("#cSteps")?.value || "").trim();
   const cfgRaw = ($("#cCfg")?.value || "").trim();
   let stepsVal = parseInt(stepsRaw, 10);
   let cfgVal = parseFloat(cfgRaw);

   if (isNaN(stepsVal) || stepsVal <= 0) stepsVal = modelDefaultSteps;
   if (isNaN(cfgVal) || cfgVal <= 0) cfgVal = modelDefaultCfg;

   if (is21) {
       if (stepsVal < 10) stepsVal = 25;
       if (cfgVal > 2.0 || cfgVal <= 0) cfgVal = 1.0;
   } else if (isLightning) {
       if (stepsVal > 8 || stepsVal < 1) stepsVal = 4;
       if (cfgVal > 2.0 || cfgVal <= 0) cfgVal = 1.0;
   }

   p.customSteps = stepsVal;
   p.customCfg = cfgVal;
   p.steps = stepsVal;
   p.cfg = cfgVal;

   p.seed = parseInt($("#cSeed").value) || 1234567;
   p.randomize = $("#cRandomize").checked;
   window.saveCurrentProject();
   window.closeCharEdit();
   if(regen) window.doGenerateChar(refName, null, {}, 1);
}
if($("#btnCharEditSave")) $("#btnCharEditSave").addEventListener("click", () => window.applyCharEdit(false));
if($("#btnCharEditRegen")) $("#btnCharEditRegen").addEventListener("click", () => window.applyCharEdit(true));

window.openCharFurtherEdit = function(refName) {
  state.viewerContext = 'char';
  if (typeof window.openFurtherEdit === 'function') {
    window.openFurtherEdit(refName, 'char');
  }
};

window.openCharVars = function(refName) {
  const proj = window.getProj();
  const data = proj.charRefs[refName]; if(!data) return; state.viewerContext = 'char';
  const safeRef = refName.replace(/'/g, "\\'"); 
  $("#vSceneTitle").textContent = refName + " Variations"; const grid = $("#vGrid"); grid.innerHTML = '';

  const uploadDiv = document.createElement('div');
  uploadDiv.className = 'vcard';
  uploadDiv.style.cssText = 'border:2px dashed var(--border); display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; min-height:140px;';
  uploadDiv.title = 'Upload custom reference for ' + refName;
  uploadDiv.innerHTML = `<div style="font-size:28px">📤</div><div class="text-xs text-accent font-bold mt-1">Upload Ref</div>`;
  uploadDiv.onclick = () => window.uploadCustomCharRef(refName);
  grid.appendChild(uploadDiv);

  data.variations.forEach(v => {
    const div = document.createElement('div'); div.className = `vcard ${v.id===data.mainId?'main':''}`;
    const metaInfo = v.sourceVarId ? `  Re-Edit` : v.wfMode;
    div.innerHTML = (v.status === 'queued' || v.status === 'processing')
         ? `<div style="padding:40px 10px;text-align:center" class="mono text-accent text-xs" id="prog-text-${v.id}">${v.status === 'processing' ? '⏳ Kraunamas modelis...' : '⏳ Queued'}</div><div class="info">Pending</div>`
         : `<img src="${v.url}" onclick="window.selectCharVar('${safeRef}', '${v.id}')"/><div class="info">${v.createdAt.split(' ')[1]} | ${metaInfo}</div>`;
         
    if(v.status === 'done') {
        div.addEventListener('mouseenter', e => { $("#hoverImg").src = v.url; $("#hoverPreview").style.display = 'block'; });
        div.addEventListener('mousemove', e => { if(typeof window.movePreviewHover === 'function') window.movePreviewHover(e); });
        div.addEventListener('mouseleave', () => { if(typeof window.hidePreviewHover === 'function') window.hidePreviewHover(); });
    }
    grid.appendChild(div);
  });
  $("#modalVars").classList.add("show");
}

window.selectCharVar = function(refName, vId) {
  const proj = window.getProj();
  const data = proj.charRefs[refName]; 
  if(data) {
    data.mainId = vId; const v = data.variations.find(x => x.id === vId);
    if(v && v.params) { data.params = JSON.parse(JSON.stringify(v.params)); }
  }
  window.saveCurrentProject();
  $('#modalVars').classList.remove('show'); 
  if(typeof window.renderCharRefs === 'function') window.renderCharRefs();
  if($("#viewer") && $("#viewer").classList.contains("show")) {
    if(typeof window.updateViewer === 'function') window.updateViewer();
  }
}

window.openCharViewer = function(refName) {
  const proj = window.getProj();
  if (!proj || !proj.charRefs) return;
  const list = Object.keys(proj.charRefs).filter(r => {
    const d = proj.charRefs[r];
    if (!d || !d.variations || d.variations.length === 0) return false;
    const m = window.getCharMainVariant ? window.getCharMainVariant(d) : null;
    return Boolean(m && (m.url || m.status === 'done' || m.status === 'completed'));
  });
  if (refName && !list.includes(refName) && proj.charRefs[refName]) {
    list.push(refName);
  }
  if (list.length === 0) return;
  state.viewerContext = 'char';
  state.viewerList = list;
  state.viewerIndex = state.viewerList.indexOf(refName);
  if (state.viewerIndex === -1) state.viewerIndex = 0;
  if (typeof window.resetViewerZoom === 'function') window.resetViewerZoom();
  if (typeof window.updateViewer === 'function') window.updateViewer(); 
  $("#viewer")?.classList.add("show");
  if (typeof window.setupViewerZoomAndPan === 'function') window.setupViewerZoomAndPan();
};

if($("#btnCommitChars")) {
    $("#btnCommitChars").addEventListener("click", () => {
        const proj = window.getProj();
        let count = 0;
        const missing = [];
        Object.keys(proj.charRefs || {}).forEach(refName => {
            const d = proj.charRefs[refName];
            if (!d.variations || d.variations.length === 0) { missing.push(refName); return; }
            const main = (window.getCharMainVariant ? window.getCharMainVariant(d) : null) 
                         || (d.variations && d.mainId && d.variations.find(v => v.id === d.mainId))
                         || (d.variations && d.variations[d.variations.length - 1]);
            
            if (main && (main.status === 'done' || main.url)) {
                if (!d.mainId) d.mainId = main.id;
                if (!proj.refs.includes(refName)) {
                    proj.refs.push(refName);
                }
                count++;
            } else {
                missing.push(refName);
            }
        });
        window.saveCurrentProject();
        if(typeof window.updateRefsSelects === 'function') window.updateRefsSelects(); 
        if(typeof window.validateScenes === 'function') window.validateScenes();
        if(missing.length > 0) toast("Warning", `${missing.length} characters skipped (No generated main image).`, "warn");
        toast("Success", `${count} characters committed & ready as scene references!`, "success");
    });
}

window.doGenerateChar = async (refName, overrideParams = null, extraMeta = {}, priority = 1, silent = false) => {
  const proj = window.getProj();
  const data = proj.charRefs[refName]; if(!data || !data.template) return;
  data.generating = true; window.renderCharRefs();

  if (window.isGlobalDemoMode && window.isGlobalDemoMode()) {
      data.generating = true;
      if (typeof window.renderCharRefs === 'function') window.renderCharRefs();
      
      let targetFile = "ALEX_whitestickman_outfitA.png_b2abbe86.jpg";
      if (refName.toUpperCase().includes("MAYA") || data.template === "female") {
          targetFile = "MAYA_whitestickman_outfitA.png_fc451bed.jpg";
      }
      
      const charSteps = [
          { pct: 14, text: "⏳ Initializing K-Euler [GPU 1] 14%" },
          { pct: 32, text: "⚡ Step 8/28 (32%) [GPU 1]" },
          { pct: 55, text: "⚡ Step 15/28 (55%) [GPU 1]" },
          { pct: 78, text: "⚡ Step 22/28 (78%) [GPU 1]" },
          { pct: 92, text: "⚡ Step 26/28 (92%) [GPU 1]" },
          { pct: 98, text: "⚡ VAE Vector Decode (98%)" },
          { pct: 100, text: "✅ Done (100%)" }
      ];
      
      for (const st of charSteps) {
          const fillEl = document.getElementById(`char-prog-fill-${refName}`);
          const textEl = document.getElementById(`char-prog-text-${refName}`);
          if (fillEl) fillEl.style.width = `${st.pct}%`;
          if (textEl) textEl.textContent = st.text;
          await new Promise(r => setTimeout(r, 280));
      }
      
      const varId = "var_char_" + refName + "_" + Date.now();
      const newVar = {
          id: varId,
          status: "done",
          url: `/vault/${targetFile}`,
          file: targetFile,
          createdAt: new Date().toISOString(),
          params: { ...(data.params || {}) }
      };
      
      if (!data.variations) data.variations = [];
      data.variations.unshift(newVar);
      data.mainId = varId;
      data.generating = false;
      
      if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
      if (typeof window.renderCharRefs === 'function') window.renderCharRefs();
      if (typeof window.renderCharacters === 'function') window.renderCharacters();
      return;
  }
  const p = overrideParams ? { ...data.params, ...overrideParams } : { ...data.params };
  const style = document.getElementById('charBaseStyle')?.value || (proj.globals && proj.globals.charBaseStyle) || 'default';
  const baseFile = `${style}/base_${data.template}.png`; 

  try {
    // Patikriname ar refA yra sena ankstesnio stiliaus nuoroda, kad neįstrigtų senas stilius
    const isStaleBase = p.refA && (
      p.refA.includes('base_') || 
      p.refA.includes('/base/') || 
      p.refA.startsWith('default/') || 
      p.refA.startsWith('master/') || 
      p.refA.startsWith('master_style/') || 
      p.refA.startsWith('peach_skin_style/') || 
      p.refA.startsWith('pixar_3d/') || 
      p.refA.startsWith('stick_figure')
    );

    const refA_val = p.editSrcFile || (p.refA && !isStaleBase ? window.resolveRefImage(p.refA) : baseFile);
    const refB_val = p.refB ? window.resolveRefImage(p.refB) : "";
    const refC_val = p.refC ? window.resolveRefImage(p.refC) : "";
    let refCount = 1; if (refC_val && refC_val !== "") refCount = 3; else if (refB_val && refB_val !== "") refCount = 2;
    
    const activeCharModel = document.getElementById('charModel')?.value || proj.globals.modelPreset || proj.globals.workflowMode || '';
    const isNanoBanana = activeCharModel.includes('nano_banana');
    const isQwen21 = !isNanoBanana && (activeCharModel.includes('2.1') || (proj.globals.unetName && proj.globals.unetName.includes('2.1')) || (proj.globals.workflowMode === 'qwen_2_1'));
    const is2511 = !isNanoBanana && !isQwen21 && (activeCharModel.includes('2511') || (proj.globals.unetName && proj.globals.unetName.includes('2511')));
    const is2509 = !isNanoBanana && !isQwen21 && !is2511;

    if (isNanoBanana) {
        const reqId = rId();
        const paramsSnapshot = JSON.parse(JSON.stringify(p));
        const newVar = { id: reqId, status: "processing", url: "", createdAt: nowIso(), wfMode: "nano_banana_2_flash", seedUsed: 0, params: paramsSnapshot, ...extraMeta };
        data.variations.push(newVar);
        data.mainId = reqId;
        data.generating = true;
        if (!silent) toast("Cloud Generating", `Generating character ${refName} with Nano Banana 2 Flash...`, "info");
        window.saveCurrentProject();
        window.renderCharRefs();

        try {
            const res = await fetch('/api/cloud/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId: state.currentProjectId,
                    sceneId: refName,
                    prompt: p.prompt || '',
                    negativePrompt: p.negative || '',
                    aspectRatio: proj.globals.charAspectRatio || "tall",
                    isChar: true,
                    reqId: reqId
                })
            });
            const cloudData = await res.json();
            if (!res.ok || cloudData.status !== "success") throw new Error(cloudData.detail || cloudData.message || "Cloud generation failed");

            newVar.status = "done";
            newVar.url = cloudData.vaultUrl;
            data.generating = false;
            window.saveCurrentProject();
            if (!silent) toast("Done", `Character ${refName} generated!`, "success");
        } catch(cloudErr) {
            newVar.status = "error";
            data.generating = false;
            window.saveCurrentProject();
            toast("Cloud Error", cloudErr.message, "error");
        }

        window.renderCharRefs();
        return;
    }

    // Pasirinktas proporcijų formatas (Aspect Ratio)
    const arKey = document.getElementById('charAspectRatio')?.value || proj.globals.charAspectRatio || 'tall';
    const AR_MAP = {
      '2:3': { w: 832, h: 1248 },
      '9:16': { w: 768, h: 1344 },
      '1:1': { w: 1024, h: 1024 },
      '3:4': { w: 896, h: 1152 },
      '16:9': { w: 1344, h: 768 },
      'tall': { w: 672, h: 1568 }
    };
    const { w: charW, h: charH } = AR_MAP[arKey] || AR_MAP['tall'];

    let mapping;
    let baseWf;
    if (isQwen21) {
      mapping = MAPPING_QWEN21;
      baseWf = refCount === 3 ? WF_3_REF_QWEN21 : (refCount === 2 ? WF_2_REF_QWEN21 : WF_1_REF_QWEN21);
    } else if (is2511) {
      mapping = MAPPING_2511;
      baseWf = refCount === 3 ? WF_3_REF_2511 : (refCount === 2 ? WF_2_REF_2511 : WF_1_REF_2511);
    } else {
      mapping = MAPPING;
      baseWf = refCount === 3 ? WF_3_REF : (refCount === 2 ? WF_2_REF : WF_1_REF);
    }

    const wf = JSON.parse(JSON.stringify(baseWf));
    
    if (isQwen21) {
      wf[mapping.NODE_PROMPT].inputs.prompt = p.prompt || "";
    } else if (is2511) {
      wf[mapping.NODE_PROMPT].inputs.prompt = p.prompt || "";
    } else {
      wf[mapping.NODE_PROMPT].inputs.value = p.prompt || "";
    }
    
    const CHAR_DEFAULT_NEG = "low quality, blurry, pixelated, bad anatomy, bad hands, extra fingers, extra limbs, deformed body, distorted face, mutated, malformed, long neck, cross-eyed, watermark, text, logo, signature, oversharpened, noisy background";
    const customNeg = p.negative || ""; 
    const fullNeg = customNeg.trim() !== "" ? (CHAR_DEFAULT_NEG + ", " + customNeg) : CHAR_DEFAULT_NEG;
    if (isQwen21) {
      wf[mapping.NODE_NEG].inputs.negative_prompt = fullNeg;
    } else {
      wf[mapping.NODE_NEG].inputs.prompt = fullNeg;
    }
    
    let seed = p.randomize ? Math.floor(Math.random() * 9999999999) : p.seed;
    if (proj.globals.seedMode === 'fixed') {
        seed = parseInt(proj.globals.fixedSeed) || 941027876668241;
    }
    if(p.randomize && proj.globals.seedMode !== 'fixed') { data.params.seed = seed; p.seed = seed; }
    if(overrideParams && overrideParams.seed !== undefined) { seed = overrideParams.seed; p.seed = seed; }
    
    // Automatiniai sampling parametrai pagal aktyvų modelį:
    // Qwen 2.1 -> 25 steps, 1.0 CFG
    // Qwen Lightning (2509 / 2511) -> 4 steps, 1.0 CFG
    // Kiti / Custom -> 20 steps, 3.5 CFG
    const defaultSteps = isQwen21 ? 25 : (is2511 || is2509 ? 4 : 20);
    const defaultCfg = (isQwen21 || is2511 || is2509) ? 1.0 : 3.5;

    // Prioritetas:
    // 1) overrideParams (jei paduota tiesiogiai funkcijos kvietime)
    // 2) p.customSteps / p.customCfg arba p.steps / p.cfg (jei vartotojas nustatė per ⚙️ Edit Params)
    // 3) Modelio numatytasis (proj.globals.charSteps / proj.globals.charCfg arba toolbar / model default)
    const effectiveCustomSteps = (p.customSteps !== undefined && p.customSteps !== null && p.customSteps !== '') 
        ? p.customSteps 
        : (p.steps !== undefined && p.steps !== null && p.steps !== '' ? p.steps : null);
    const effectiveCustomCfg = (p.customCfg !== undefined && p.customCfg !== null && p.customCfg !== '') 
        ? p.customCfg 
        : (p.cfg !== undefined && p.cfg !== null && p.cfg !== '' ? p.cfg : null);

    const toolbarSteps = document.getElementById('charSteps')?.value ? parseInt(document.getElementById('charSteps').value, 10) : null;
    const toolbarCfg = document.getElementById('charCfg')?.value ? parseFloat(document.getElementById('charCfg').value) : null;

    const globalCharSteps = (proj.globals?.charSteps !== undefined && proj.globals?.charSteps !== null)
                            ? parseInt(proj.globals.charSteps, 10)
                            : (toolbarSteps && !isNaN(toolbarSteps) && toolbarSteps > 0 ? toolbarSteps : (proj.globals?.steps || defaultSteps));
    const globalCharCfg = (proj.globals?.charCfg !== undefined && proj.globals?.charCfg !== null)
                          ? parseFloat(proj.globals.charCfg)
                          : (toolbarCfg && !isNaN(toolbarCfg) && toolbarCfg > 0 ? toolbarCfg : (proj.globals?.cfg !== undefined ? proj.globals.cfg : defaultCfg));

    const charSteps = (overrideParams && overrideParams.steps !== undefined) ? parseInt(overrideParams.steps, 10)
                    : (effectiveCustomSteps ? parseInt(effectiveCustomSteps, 10) : globalCharSteps);
    const charCfg = (overrideParams && overrideParams.cfg !== undefined) ? parseFloat(overrideParams.cfg)
                  : (effectiveCustomCfg !== null ? parseFloat(effectiveCustomCfg) : globalCharCfg);

    let finalCharSteps = charSteps;
    let finalCharCfg = charCfg;
    if (isQwen21) {
      if (isNaN(finalCharSteps) || finalCharSteps < 10) finalCharSteps = 25;
      if (isNaN(finalCharCfg) || finalCharCfg > 2.0 || finalCharCfg <= 0) finalCharCfg = 1.0;
    } else if (is2511 || is2509) {
      if (isNaN(finalCharSteps) || finalCharSteps > 8 || finalCharSteps < 1) finalCharSteps = 4;
      if (isNaN(finalCharCfg) || finalCharCfg > 2.0 || finalCharCfg <= 0) finalCharCfg = 1.0;
    }

    p.steps = finalCharSteps;
    p.cfg = finalCharCfg;
    p.customSteps = finalCharSteps;
    p.customCfg = finalCharCfg;

    if (data.params) {
        data.params.steps = finalCharSteps;
        data.params.cfg = finalCharCfg;
        data.params.customSteps = finalCharSteps;
        data.params.customCfg = finalCharCfg;
        data.params.seed = seed;
        data.params.randomize = p.randomize;
    }

    wf[mapping.NODE_SAMPLER].inputs.seed = seed; 
    wf[mapping.NODE_SAMPLER].inputs.steps = finalCharSteps; 
    wf[mapping.NODE_SAMPLER].inputs.cfg = finalCharCfg;
    
    // Set model names from globals
    if (isQwen21) {
      wf["459:451"].inputs.unet_name = (proj.globals.unetName && proj.globals.unetName !== 'none') ? proj.globals.unetName : 'qwen_image_2.1_int8_convrot.safetensors';
      wf["459:453"].inputs.clip_name = 'qwen3vl_8b_int8_convrot.safetensors';
      wf["459:454"].inputs.vae_name = 'qwen_image_2.1_vae_bf16.safetensors';

      // Pasirinktos veikėjo proporcijos (pagal charAspectRatio)
      wf["459:456"].inputs.width = charW;
      wf["459:456"].inputs.height = charH;
      if (wf["459:468"]) {
        if (p.editSrcFile || p.switchMode === false) {
          wf["459:468"].inputs.switch = false;
        } else {
          wf["459:468"].inputs.switch = true;
        }
      }

      wf[mapping.NODE_REFA].inputs.image = refA_val;
      if (refCount >= 2) wf[mapping.NODE_REFB].inputs.image = refB_val || refA_val; else delete wf[mapping.NODE_REFB];
      if (refCount >= 3) wf[mapping.NODE_REFC].inputs.image = refC_val || refB_val || refA_val; else delete wf[mapping.NODE_REFC];
    } else if (is2511) {
      wf["237"].inputs.unet_name = (proj.globals.unetName && proj.globals.unetName !== 'none') ? proj.globals.unetName : 'qwen_image_edit_2511_bf16.safetensors';
      wf["233"].inputs.lora_name = (proj.globals.loraName && proj.globals.loraName !== 'none') ? proj.globals.loraName : 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors';
      wf["238"].inputs.clip_name = 'qwen_2.5_vl_7b_fp8_scaled.safetensors';
      wf["226"].inputs.vae_name = 'qwen_image_vae.safetensors';

      const mode = (proj.globals.workflowMode && proj.globals.workflowMode !== 'nano_banana_2_flash') ? proj.globals.workflowMode : 'latent_upscale';
      if (mode === 'latent_upscale') {
        if (wf["438"]) delete wf["438"];
        wf["247"].inputs.image = ["249", 0];
        wf["250"].inputs.width = charW;
        wf["250"].inputs.height = charH;
        wf["245"].inputs.latent_image = ["250", 0];
      } else {
        wf["438"] = {"inputs": {"target_width": charW, "target_height": charH, "padding_color": "white", "interpolation": "area", "image": ["249", 0]}, "class_type": "ResizeAndPadImage", "_meta": {"title": "ResizeAndPadImage"}};
        if (wf["250"]) delete wf["250"];
        wf["247"].inputs.image = ["438", 0];
        wf["245"].inputs.latent_image = ["236", 0];
      }
      wf[mapping.NODE_REFA].inputs.image = refA_val;
      if (refCount >= 2) wf[mapping.NODE_REFB].inputs.image = refB_val || refA_val; else delete wf[mapping.NODE_REFB]; 
      if (refCount >= 3) wf[mapping.NODE_REFC].inputs.image = refC_val || refB_val || refA_val; else delete wf[mapping.NODE_REFC]; 
    } else {
      wf["433:37"].inputs.unet_name = (proj.globals.unetName && proj.globals.unetName !== 'none') ? proj.globals.unetName : 'qwen_image_edit_2509_fp8_e4m3fn.safetensors';
      wf["433:89"].inputs.lora_name = (proj.globals.loraName && proj.globals.loraName !== 'none') ? proj.globals.loraName : 'Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors';
      wf["433:38"].inputs.clip_name = 'qwen_2.5_vl_7b_fp8_scaled.safetensors';
      wf["433:39"].inputs.vae_name = 'qwen_image_vae.safetensors';

      const mode = (proj.globals.workflowMode && proj.globals.workflowMode !== 'nano_banana_2_flash') ? proj.globals.workflowMode : 'latent_upscale';
      if (mode === 'latent_upscale') {
        if (wf["438"]) delete wf["438"];
        wf["433:117"].inputs.image = ["78", 0];
        wf["439"].inputs.width = charW;
        wf["439"].inputs.height = charH;
        wf["433:3"].inputs.latent_image = ["439", 0];
      } else {
        if (wf["439"]) delete wf["439"];
        wf["438"].inputs.target_width = charW;
        wf["438"].inputs.target_height = charH;
        wf["433:117"].inputs.image = ["438", 0];
        wf["433:3"].inputs.latent_image = ["433:88", 0];
      }
      wf[mapping.NODE_REFA].inputs.image = refA_val;
      if (refCount >= 2) wf[mapping.NODE_REFB].inputs.image = refB_val || refA_val; else delete wf[mapping.NODE_REFB]; 
      if (refCount >= 3) wf[mapping.NODE_REFC].inputs.image = refC_val || refB_val || refA_val; else delete wf[mapping.NODE_REFC]; 
    }
    
    wf[mapping.NODE_SAVE].inputs.filename_prefix = `CharRef_${refName.split('.')[0]}`; 

    const paramsSnapshot = JSON.parse(JSON.stringify(p));
    
    if (!state.connected) {
        const mockUrl = window.mockPortraitImage ? window.mockPortraitImage(refName, seed, `${refCount} REF CHAR`) : "";
        const newVar = { id: rId(), status: "done", url: mockUrl, createdAt: nowIso(), wfMode: `${refCount} REF CHAR`, seedUsed: seed, params: paramsSnapshot, ...extraMeta };
        data.variations.push(newVar); data.mainId = newVar.id; 
        if(!silent) toast("Mock Generated", `Character ${refName} created.`, "success");
        data.generating = false; 
        window.saveCurrentProject();
        window.renderCharRefs();
        return;
    }

    const res = await fetch('/api/queue/add', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority, projectId: state.currentProjectId, sceneId: refName, workflow: wf })
    });
    const resData = await res.json();
    if(resData.status !== "success") throw new Error(resData.message);
    
    const newVar = { id: resData.reqId, status: "queued", url: "", createdAt: nowIso(), wfMode: `${refCount} REF CHAR`, seedUsed: seed, params: paramsSnapshot, ...extraMeta };
    data.variations.push(newVar); data.mainId = resData.reqId; 
    if(!silent) toast("Queued", `Character ${refName} added to Hub DB queue!`, "info");
    window.saveCurrentProject();
  } catch (err) { toast("Error", err.message, "error"); data.generating = false; }
  window.renderCharRefs();
}

if($("#btnGenMissingChars")) {
    $("#btnGenMissingChars").addEventListener("click", async () => {
       const proj = window.getProj();
       if (window.isGlobalDemoMode && window.isGlobalDemoMode()) {
           const allCharKeys = Object.keys(proj.charRefs || {});
           if (!allCharKeys.length) return (typeof toast === 'function' ? toast("Info", "Nothing to generate.") : alert("No characters to generate."));
           for(const m of allCharKeys) await window.doGenerateChar(m, null, {}, 2, true);
           return;
       }
       const missing = Object.keys(proj.charRefs).filter(r => {
          const d = proj.charRefs[r]; const hasTemplate = d.template !== '';
          const isUploaded = hasTemplate && (!state.connected || state.baseStatus[d.template].html);
          return (!d.variations || d.variations.length === 0) && hasTemplate && isUploaded;
       });
       if(missing.length===0) return toast("Info", "Nothing to generate.");

       const activeCharModel = document.getElementById('charModel')?.value || proj.globals.modelPreset || proj.globals.workflowMode || '';
       const isNanoBanana = activeCharModel.includes('nano_banana');
       const isBatch = document.getElementById('charBatchMode')?.checked;

       if (isNanoBanana && isBatch) {
           toast("Cloud Batch (-50%)", `Siunčiama ${missing.length} veikėjų į Google Cloud Batch (-50% kaina)...`, "info");
           const batchItems = [];
           for (const m of missing) {
               const d = proj.charRefs[m];
               const reqId = rId();
               const newVar = { id: reqId, status: "queued", url: "", createdAt: nowIso(), wfMode: "nano_banana_2_flash", seedUsed: 0, params: { prompt: d.prompt, negative: d.negative || '' } };
               if (!d.variations) d.variations = [];
               d.variations.push(newVar);
               d.mainId = reqId;
               d.generating = true;
               batchItems.push({
                   reqId: reqId,
                   sceneId: m,
                   prompt: d.prompt,
                   negativePrompt: d.negative || "",
                   aspectRatio: proj.globals.charAspectRatio || "2:3",
                   isChar: true
               });
           }
           window.saveCurrentProject();
           window.renderCharRefs();

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
                   toast("Batch Started", `Pateikta ${batchItems.length} veikėjų į Cloud Batch (-50% nuolaida)!`, "success");
               } else {
                   throw new Error(resJson.message || "Batch submission failed");
               }
           } catch(err) {
               toast("Batch Error", err.message, "error");
           }
           return;
       }

       toast("Mass Generation", `Queueing ${missing.length} characters...`, "info");
       for(const m of missing) await window.doGenerateChar(m, null, {}, 2, true); 
    });
}

// ============================================================================
// MAIN DATA PARSER FUNCTION
// ============================================================================
window.processCharJson = function(jsonStr) {
    const proj = window.getProj();
    try {
        let cleanStr = jsonStr.replace(/\u00A0/g, ' ').trim();
        cleanStr = cleanStr.replace(/,\s*([\]}])/g, '$1');
        const parsedData = JSON.parse(cleanStr);
        let stats = { created: 0, updated: 0, missingBase: 0, skipped: 0 };
        let charArray = [];
        
        if (Array.isArray(parsedData)) {
            charArray = parsedData;
        } else if (parsedData.characters && Array.isArray(parsedData.characters)) {
            charArray = parsedData.characters;
        } else if (typeof parsedData === 'object') {
            charArray = Object.keys(parsedData).map(k => {
                const obj = parsedData[k];
                return {
                    id: k,
                    base: obj.params ? obj.params.template : (obj.base || 'male'),
                    prompt: obj.params ? obj.params.prompt : (obj.prompt || ''),
                    negative: obj.params ? obj.params.negative : (obj.negative || '')
                };
            });
        } else {
            throw new Error("Failed to parse JSON format. Must be an Array.");
        }

        charArray.forEach(char => {
            const name = char.id || char.name || char.ref || char.filename; 
            if (!name) { stats.skipped++; return; }
            
            let base = (char.base || "").toLowerCase();
            const validBases = ['male', 'female', 'teen', 'kid'];
            
            if (!validBases.includes(base)) {
                const p = (char.prompt || "").toLowerCase();
                if (p.includes('boy') || p.includes('kid')) base = 'kid'; 
                else if (p.includes('teen') || p.includes('girl')) base = 'teen';
                else if (p.includes('woman') || p.includes('female')) base = 'female'; 
                else if (p.includes('man') || p.includes('male')) base = 'male';
                else { base = 'male'; stats.missingBase++; } 
            }
            
            if (!proj.charRefs[name]) {
                proj.charRefs[name] = { 
                    template: base, 
                    voice_id: char.voice_id || char.voice || '',
                    gender: char.gender || '',
                    voice_description: char.voice_description || char.voicePrompt || '',
                    params: { 
                        prompt: char.prompt || '', 
                        negative: char.negative || '', 
                        seed: char.seed !== undefined ? char.seed : 941027876668241, 
                        randomize: char.seed === undefined
                    }, 
                    variations: [], 
                    mainId: null, 
                    generating: false 
                };
                stats.created++;
            } else {
                const c = proj.charRefs[name];
                  
                // Auto-Heal, if character was corrupted
                if (!c.variations && c.vars) c.variations = c.vars;
                if (!c.variations) c.variations = [];
                if (!c.params) c.params = {};

                c.template = base || c.template; 
                if (char.voice_id || char.voice) c.voice_id = char.voice_id || char.voice;
                if (char.gender) c.gender = char.gender;
                if (char.voice_description || char.voicePrompt) c.voice_description = char.voice_description || char.voicePrompt;
                if (char.prompt) c.params.prompt = char.prompt;
                if (char.negative !== undefined) c.params.negative = char.negative;
                if (char.seed !== undefined) { c.params.seed = char.seed; c.params.randomize = false; } 
                stats.updated++;
            }
        });
        
        window.saveCurrentProject();
        window.renderCharRefs(); 
        $("#modalCharJson").classList.remove("show");
        toast("Loaded", `Success! Created: ${stats.created}, Updated: ${stats.updated}`, "success");
        
    } catch(e) { 
        console.error("JSON Parse Error:", e);
        toast("Error", "Error parsing JSON: " + e.message, "error"); 
    }
}

if($("#btnLoadCharJson")) $("#btnLoadCharJson").addEventListener("click", () => {
    if (typeof window.openJsonFixerModal === 'function') window.openJsonFixerModal('characters');
    else if ($("#modalCharJson")) { $("#charJsonInput").value = ""; $("#modalCharJson").classList.add("show"); }
});
if($("#btnApplyCharJson")) $("#btnApplyCharJson").addEventListener("click", () => { window.processCharJson($("#charJsonInput").value); });

if($("#btnLoadCharDemo")) {
    $("#btnLoadCharDemo").addEventListener("click", () => {
        const demoData = [
            { id: "hero.png", base: "male", prompt: "A handsome hero character, highly detailed." },
            { id: "princess.png", base: "female", prompt: "A beautiful princess character, elegant dress." }
        ];
        $("#charJsonInput").value = JSON.stringify(demoData, null, 2); $("#modalCharJson").classList.add("show");
    });
}

if($("#btnDownloadAllChars")) {
    $("#btnDownloadAllChars").addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        const origHtml = btn ? btn.innerHTML : '';
        const proj = window.getProj();
        let zipFiles = [];

        Object.keys(proj.charRefs).forEach(refName => {
            const data = proj.charRefs[refName];
            const main = window.getCharMainVariant(data);
            if (main && main.status === 'done' && main.url) {
                const actualFilename = main.url.split('/').pop();
                if(actualFilename) {
                    const nameWithoutExt = refName.split('.')[0];
                    zipFiles.push({ filename: actualFilename, prefix: `CharRef_${nameWithoutExt}` });
                }
            }
        });
        
        if(zipFiles.length === 0) return toast("Info", "No characters to download.");
        
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<span class="spinner" style="display:inline-block; width:12px; height:12px; border:2px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation:spin 0.6s linear infinite; vertical-align:middle; margin-right:4px;"></span>Ruošiama...`;
        }
        toast("Zipping...", "Preparing archive...");
        
        try {
            const res = await fetch('/api/zip', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ files: zipFiles, name: `Characters_Mains.zip` })
            });
            if(!res.ok) throw new Error("Server error");
            const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
            a.download = `Characters_Mains_${nowIso().replace(/[: ]/g, '')}.zip`;
            document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
            toast("Success", "Characters downloaded!", "success");
        } catch(e) { 
            toast("Error", "Failed to create ZIP", "error"); 
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = origHtml;
            }
        }
    });
}

window.loadBaseStyles = async function() {
    const proj = window.getProj();
    const select = document.getElementById('charBaseStyle');
    if (!select) return;
    try {
        const res = await fetch('/api/base_styles');
        const data = await res.json();
        if (data.status === 'success' && data.styles) {
            let html = '';
            data.styles.forEach(style => {
                const val = typeof style === 'object' ? style.slug : style;
                const label = typeof style === 'object' ? (style.displayName || style.slug) : style;
                html += `<option value="${escapeHtml(val)}">${escapeHtml(label)}</option>`;
            });
            if (html) select.innerHTML = html;
        }
    } catch(e) {
        console.error("Failed to load base styles", e);
    }
    
    if (proj && proj.globals) {
        if (proj.globals.charBaseStyle === undefined) {
            proj.globals.charBaseStyle = 'default';
        }
        select.value = proj.globals.charBaseStyle;
    }
    
    // Add change listener if not already added
    if (!select.dataset.listenerAdded) {
        select.dataset.listenerAdded = 'true';
        select.addEventListener('change', async () => {
            const p = window.getProj();
            if (p && p.globals) {
                p.globals.charBaseStyle = select.value;

                // Išvalome pasenusias ankstesnio stiliaus bazines nuorodas iš charRefs, kad iškart veiktų naujas stilius!
                if (p.charRefs) {
                    Object.values(p.charRefs).forEach(c => {
                        if (c.params && c.params.refA && (
                            c.params.refA.includes('base_') || 
                            c.params.refA.includes('/base/') ||
                            c.params.refA.startsWith('default/') ||
                            c.params.refA.startsWith('master/') ||
                            c.params.refA.startsWith('master_style/') ||
                            c.params.refA.startsWith('peach_skin_style/') ||
                            c.params.refA.startsWith('pixar_3d/') ||
                            c.params.refA.startsWith('stick_figure')
                        )) {
                            delete c.params.refA;
                        }
                    });
                }
                window.saveCurrentProject();

                // Sinchronizuojame su scenarijaus tabo promptTemplateSelect jei yra
                const scSelect = document.getElementById('promptTemplateSelect');
                if (scSelect && scSelect.value !== select.value) {
                    scSelect.value = select.value;
                }

                // Nustatome formatą pagal pasirinktą stilių (pvz., stick_figure -> 1:1, master/pixar/peach -> tall)
                const arSelectEl = document.getElementById('charAspectRatio');
                if (arSelectEl) {
                    const styleVal = select.value || '';
                    const newRatio = styleVal.includes('stick_figure') ? '1:1' : 'tall';
                    arSelectEl.value = newRatio;
                    p.globals.charAspectRatio = newRatio;
                }

                if (typeof window.checkBaseTemplates === 'function') {
                    await window.checkBaseTemplates();
                }
                if (typeof window.renderBaseLibrary === 'function') {
                    window.renderBaseLibrary();
                }
                if (typeof window.renderCharRefs === 'function') {
                    window.renderCharRefs();
                }

                toast("Style Changed", `Character base style set to: ${select.value}`, "success");
            }
        });
    }

    // Inicijuojame Aspect Ratio parinkiklį
    const arSelect = document.getElementById('charAspectRatio');
    if (arSelect) {
        if (proj && proj.globals && proj.globals.charAspectRatio) {
            arSelect.value = proj.globals.charAspectRatio;
        } else {
            arSelect.value = 'tall';
            if (proj && proj.globals) proj.globals.charAspectRatio = 'tall';
        }
        if (!arSelect.dataset.listenerAdded) {
            arSelect.dataset.listenerAdded = 'true';
            arSelect.addEventListener('change', () => {
                const p = window.getProj();
                if (p && p.globals) {
                    p.globals.charAspectRatio = arSelect.value;
                    window.saveCurrentProject();
                    toast("Aspect Ratio", `Character aspect ratio: ${arSelect.value}`, "info");
                }
            });
        }
    }

    // Užtikriname teisingus numatytuosius Steps ir CFG pagal aktyvų modelį
    const activeModel = document.getElementById('charModel')?.value || proj?.globals?.workflowMode || '';
    if (typeof window.syncCharModelSettings === 'function') {
        window.syncCharModelSettings(activeModel);
    }

    // Modelio pasikeitimo sinchronizacija su Steps ir CFG
    const cModelEl = document.getElementById('charModel');
    if (cModelEl && !cModelEl.dataset.charSettingsListenerAdded) {
        cModelEl.dataset.charSettingsListenerAdded = 'true';
        cModelEl.addEventListener('change', () => {
            if (typeof window.applyModelPreset === 'function') {
                window.applyModelPreset(cModelEl.value);
            } else {
                window.syncCharModelSettings(cModelEl.value);
            }
        });
    }
};

window.syncCharModelSettings = function(modelVal) {
    const p = window.getProj ? window.getProj() : null;
    const effModel = modelVal || document.getElementById('charModel')?.value || p?.globals?.modelPreset || p?.globals?.unetName || '';
    const isCloud = effModel.includes('nano_banana');
    const is21 = !isCloud && (effModel.includes('2.1') || (p?.globals?.unetName && p.globals.unetName.includes('2.1')) || p?.globals?.workflowMode === 'qwen_2_1');
    const isLightning = !isCloud && !is21 && (effModel.includes('Lightning') || effModel.includes('2509') || effModel.includes('2511') || effModel.includes('2506') || (p?.globals?.loraName && p.globals.loraName.includes('Lightning')));

    let defaultSteps = 25;
    let defaultCfg = 1.0;
    if (is21) {
        defaultSteps = 25;
        defaultCfg = 1.0;
    } else if (isLightning) {
        defaultSteps = 4;
        defaultCfg = 1.0;
    } else {
        defaultSteps = 20;
        defaultCfg = 3.5;
    }

    const stepsNote = document.getElementById('cStepsLabelNote');
    const cfgNote = document.getElementById('cCfgLabelNote');
    const cStepsEl = document.getElementById('cSteps');
    const cCfgEl = document.getElementById('cCfg');

    const toolbarStepsEl = document.getElementById('charSteps');
    const toolbarCfgEl = document.getElementById('charCfg');

    if (p && p.globals) {
        if (is21) {
            p.globals.charSteps = 25;
            p.globals.charCfg = 1.0;
        } else if (isLightning) {
            p.globals.charSteps = 4;
            p.globals.charCfg = 1.0;
        } else if (!isCloud) {
            if (!p.globals.charSteps) p.globals.charSteps = defaultSteps;
            if (!p.globals.charCfg) p.globals.charCfg = defaultCfg;
        }

        // Sinchronizuojame visų esamų veikėjų parametrus, kad nebūtų senų nesutapimų
        if (p.charRefs) {
            Object.values(p.charRefs).forEach(c => {
                const cp = c.params;
                if (!cp) return;
                if (is21) {
                    if (cp.customSteps !== undefined && cp.customSteps !== null && cp.customSteps < 10) cp.customSteps = 25;
                    if (cp.steps !== undefined && cp.steps !== null && cp.steps < 10) cp.steps = 25;
                    if (cp.customCfg !== undefined && cp.customCfg !== null && cp.customCfg > 2.0) cp.customCfg = 1.0;
                    if (cp.cfg !== undefined && cp.cfg !== null && cp.cfg > 2.0) cp.cfg = 1.0;
                } else if (isLightning) {
                    if (cp.customSteps !== undefined && cp.customSteps !== null && cp.customSteps > 8) cp.customSteps = 4;
                    if (cp.steps !== undefined && cp.steps !== null && cp.steps > 8) cp.steps = 4;
                    if (cp.customCfg !== undefined && cp.customCfg !== null && cp.customCfg > 2.0) cp.customCfg = 1.0;
                    if (cp.cfg !== undefined && cp.cfg !== null && cp.cfg > 2.0) cp.cfg = 1.0;
                }
            });
        }
        if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
    }

    if (isCloud) {
        if (stepsNote) stepsNote.textContent = '(N/A - Cloud)';
        if (cfgNote) cfgNote.textContent = '(N/A - Cloud)';
        if (cStepsEl) { cStepsEl.disabled = true; cStepsEl.placeholder = 'N/A'; cStepsEl.style.opacity = '0.35'; cStepsEl.style.pointerEvents = 'none'; }
        if (cCfgEl) { cCfgEl.disabled = true; cCfgEl.placeholder = 'N/A'; cCfgEl.style.opacity = '0.35'; cCfgEl.style.pointerEvents = 'none'; }
        if (toolbarStepsEl) { toolbarStepsEl.disabled = true; toolbarStepsEl.placeholder = 'N/A'; toolbarStepsEl.style.opacity = '0.35'; toolbarStepsEl.style.pointerEvents = 'none'; }
        if (toolbarCfgEl) { toolbarCfgEl.disabled = true; toolbarCfgEl.placeholder = 'N/A'; toolbarCfgEl.style.opacity = '0.35'; toolbarCfgEl.style.pointerEvents = 'none'; }
    } else {
        const effSteps = (p?.globals?.charSteps !== undefined && p?.globals?.charSteps !== null) ? p.globals.charSteps : defaultSteps;
        const effCfg = (p?.globals?.charCfg !== undefined && p?.globals?.charCfg !== null) ? p.globals.charCfg : defaultCfg;
        if (stepsNote) stepsNote.textContent = `(Modelis: ${effSteps})`;
        if (cfgNote) cfgNote.textContent = `(CFG: ${effCfg})`;
        if (cStepsEl) { cStepsEl.disabled = false; cStepsEl.placeholder = `${effSteps}`; cStepsEl.style.opacity = '1'; cStepsEl.style.pointerEvents = 'auto'; }
        if (cCfgEl) { cCfgEl.disabled = false; cCfgEl.placeholder = `${effCfg}`; cCfgEl.style.opacity = '1'; cCfgEl.style.pointerEvents = 'auto'; }
        if (toolbarStepsEl) {
            toolbarStepsEl.disabled = false;
            toolbarStepsEl.placeholder = `${effSteps}`;
            toolbarStepsEl.style.opacity = '1';
            toolbarStepsEl.style.pointerEvents = 'auto';
            toolbarStepsEl.value = effSteps;
        }
        if (toolbarCfgEl) {
            toolbarCfgEl.disabled = false;
            toolbarCfgEl.placeholder = `${effCfg}`;
            toolbarCfgEl.style.opacity = '1';
            toolbarCfgEl.style.pointerEvents = 'auto';
            toolbarCfgEl.value = effCfg;
        }
    }

    if (toolbarStepsEl && !toolbarStepsEl.dataset.charSettingsListenerAdded) {
        toolbarStepsEl.dataset.charSettingsListenerAdded = 'true';
        toolbarStepsEl.addEventListener('change', () => {
            const val = parseInt(toolbarStepsEl.value, 10);
            const proj = window.getProj ? window.getProj() : null;
            if (proj && proj.globals) {
                proj.globals.charSteps = (!isNaN(val) && val > 0) ? val : defaultSteps;
                if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
            }
        });
    }

    if (toolbarCfgEl && !toolbarCfgEl.dataset.charSettingsListenerAdded) {
        toolbarCfgEl.dataset.charSettingsListenerAdded = 'true';
        toolbarCfgEl.addEventListener('change', () => {
            const val = parseFloat(toolbarCfgEl.value);
            const proj = window.getProj ? window.getProj() : null;
            if (proj && proj.globals) {
                proj.globals.charCfg = (!isNaN(val) && val > 0) ? val : defaultCfg;
                if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
            }
        });
    }
};

window.downloadCharSingle = async function(refName) {
  const proj = window.getProj();
  const data = proj.charRefs[refName]; if(!data) return;
  const main = window.getCharMainVariant(data); if(!main || !main.url) return;
  try {
    const res = await fetch(main.url); const blob = await res.blob();
    let ext = 'png';
    try {
        const cleanUrl = main.url.split('?')[0].split('#')[0];
        if (cleanUrl.includes('.')) {
            ext = cleanUrl.split('.').pop().toLowerCase();
            if (ext === 'jpeg') ext = 'jpg';
        }
    } catch(e) {}
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    const safeName = refName.split('.')[0];
    a.download = `CharRef_${safeName}.${ext}`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  } catch (err) { toast("Error", "Failed to download", "error"); }
};

if($("#btnUploadCustomChar")) {
    $("#btnUploadCustomChar").addEventListener("click", () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = true;
        input.onchange = async (e) => {
            if (!e.target.files || e.target.files.length === 0) return;
            const files = Array.from(e.target.files);
            toast("Uploading...", `Uploading ${files.length} custom character reference(s)...`, "info");
            
            const proj = window.getProj();
            let count = 0;
            
            for (const file of files) {
                const refName = file.name;
                if (!proj.charRefs[refName]) {
                    proj.charRefs[refName] = {
                        template: 'male',
                        params: { prompt: '', negative: '', seed: 941027876668241, randomize: true },
                        variations: [],
                        mainId: null,
                        generating: false
                    };
                }
                const data = proj.charRefs[refName];
                
                try {
                    let uploadedUrl = "";
                    if (state.connected) {
                        const fd = new FormData();
                        fd.append("file", new File([file], refName, { type: file.type || 'image/png' }));
                        const res = await fetch("/api/upload_vault", { method: "POST", body: fd });
                        if (!res.ok) throw new Error("Upload failed");
                        const resData = await res.json();
                        uploadedUrl = resData.url;
                    } else {
                        uploadedUrl = URL.createObjectURL(file);
                    }

                    const varId = typeof rId === 'function' ? rId() : 'v_' + Math.random().toString(36).substr(2, 9);
                    const newVar = {
                        id: varId,
                        status: "done",
                        url: uploadedUrl,
                        createdAt: typeof nowIso === 'function' ? nowIso() : new Date().toISOString().replace('T', ' ').substring(0, 19),
                        wfMode: "CUSTOM UPLOAD",
                        seedUsed: 0,
                        params: JSON.parse(JSON.stringify(data.params || {}))
                    };
                    if (!data.variations) data.variations = [];
                    data.variations.push(newVar);
                    data.mainId = varId;

                    if (!proj.refs.includes(refName)) {
                        proj.refs.push(refName);
                    }
                    count++;
                } catch (err) {
                    console.error("Upload error for " + file.name, err);
                }
            }

            window.saveCurrentProject();
            window.renderCharRefs();
            if (typeof window.updateRefsSelects === 'function') window.updateRefsSelects();
            if (typeof window.validateScenes === 'function') window.validateScenes();
            
            toast("Success", `Uploaded ${count} character reference(s)!`, "success");
        };
        input.click();
    });
}