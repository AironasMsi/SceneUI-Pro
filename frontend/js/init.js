// ============================================================================
// GLOBAL EVENTS & INITIALIZATION (MAIN) - init.js
// ============================================================================

// 1. TABS (SKIRTUKŲ) VEIKIMAS SU "SCROLL MEMORY"
const scrollPositions = {};

$$('.nav-item').forEach(b => b.addEventListener('click', e => {
  // 1. Išsaugome dabartinio tab'o scroll poziciją
  const activeTabEl = document.querySelector('.nav-item.active');
  const scrollArea = document.querySelector('.scroll-area');
  if (activeTabEl && scrollArea) {
      scrollPositions[activeTabEl.dataset.tab] = scrollArea.scrollTop;
  }

  const newTab = b.dataset.tab;
  if (!newTab) return;

  // Closes viewer if open and stops background media playback
  if (typeof window.closeViewer === 'function') {
    window.closeViewer();
  }
  // Pause any background monitor video or audio elements
  const monVid = document.getElementById('renderMonitorVideo');
  if (monVid) {
    try { monVid.pause(); monVid.muted = true; } catch(e){}
  }
  const hVid = document.getElementById('hoverVideo');
  if (hVid) {
    try { hVid.pause(); hVid.muted = true; } catch(e){}
  }
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

  // 2. Perjungiame aktyvų mygtuką
  $$('.nav-item').forEach(x => x.classList.remove('active')); 
  b.classList.add('active');
  
  // 3. Perjungiame turinį
  $$('.content').forEach(x => x.classList.add('hidden')); 
  $(`#tab-${newTab}`)?.classList.remove('hidden');
  
  // 4. Atstatome scroll poziciją naujam tab'ui
  if (scrollArea) {
      scrollArea.scrollTop = scrollPositions[newTab] || 0;
  }
  
  // 5. IŠSAUGOME, KAD ŠIS PROJEKTAS MATYTŲ BŪTENT ŠĮ TABĄ
  const proj = typeof window.getProj === 'function' ? window.getProj() : null;
  if (proj) {
      proj.lastActiveTab = newTab;
      if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
      // Išsaugome sesiją serveryje
      fetch('/api/session', { method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ lastProjectId: state.currentProjectId, lastTab: newTab }) }).catch(() => {});
  }

  // 6. Iškviečiame specifinius atvaizdavimus
  if(newTab === 'audio') {
      if(typeof window.renderAudioUI === 'function') window.renderAudioUI();
  }
  else if(newTab === 'script') {
      if(typeof window.renderScriptUI === 'function') window.renderScriptUI();
  }
  else if(newTab === 'workflow') {
      if(typeof window.renderWorkflow === 'function') window.renderWorkflow(); 
  }
  else if(newTab === 'characters') { 
      state.viewerContext = 'char';
      if(typeof window.loadBaseStyles === 'function') window.loadBaseStyles();
      if(typeof window.renderBaseLibrary === 'function') window.renderBaseLibrary(); 
      if(typeof window.renderCharRefs === 'function') window.renderCharRefs(); 
  }
  else if(newTab === 'style_lab') {
      if(typeof window.initStyleLab === 'function') window.initStyleLab();
  } 
  else if(newTab === 'timeline') { 
      state.viewerContext = 'scene';
      if(typeof window.renderTimeline === 'function') window.renderTimeline(); 
  }
  else if(newTab === 'images') { 
      state.viewerContext = 'scene';
      // Priverstinai išvalome paiešką perjungus į šį langą
      const searchInput = document.getElementById('imgSearch');
      const searchWrapper = document.getElementById('imgSearchWrapper');
      if(searchInput) searchInput.value = "";
      if(searchWrapper) searchWrapper.classList.remove('active');
      
      if(typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images');
      else if(typeof window.renderImages === 'function') window.renderImages(); 
  }
  else if(newTab === 'review') {
      state.viewerContext = 'scene';
      if(typeof window.renderReview === 'function') window.renderReview();
  }
  else if(newTab === 'text_writer') {
      try {
          if(typeof window.openKineticWriterModal === 'function') window.openKineticWriterModal();
          else if(typeof window.renderKineticUI === 'function') window.renderKineticUI();
      } catch(e) { console.error("Error switching to text_writer tab:", e); }
  }
  else if(newTab === 'import') {
      try {
          if(typeof window.openExternalImportModal === 'function') window.openExternalImportModal();
      } catch(e) { console.error("Error switching to import tab:", e); }
  }
  else if(newTab === 'render') {
      try {
          if(typeof window.renderRenderStudioUI === 'function') window.renderRenderStudioUI();
      } catch(e) { console.error("Error switching to render tab:", e); }
  }
}));

// ============================================================================
// 1.5 PAIEŠKOS LAUKELIO ANIMACIJA IR VALDYMAS
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    const searchWrapper = $("#imgSearchWrapper");
    const toggleBtn = $("#btnToggleSearch");
    const searchInput = $("#imgSearch");

    if (searchWrapper && toggleBtn && searchInput) {
        toggleBtn.addEventListener("click", (e) => {
            e.preventDefault();
            searchWrapper.classList.toggle("active");
            if (searchWrapper.classList.contains("active")) {
                searchInput.focus();
            } else {
                searchInput.value = "";
                if(typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images'); 
                else if(typeof window.renderImages === 'function') window.renderImages();
            }
        });

        document.addEventListener("click", (e) => {
            if (!searchWrapper.contains(e.target) && searchInput.value.trim() === "") {
                searchWrapper.classList.remove("active");
            }
        });
    }
});

// ============================================================================
// 1.6 ŠONINIO MENIU (SIDEBAR) SUSKLEIDIMAS IR SPARTUSIS KLAVIŠAS (Ctrl+B)
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('appSidebar');
    const toggleBtn = document.getElementById('btnToggleSidebar');
    if (!sidebar) return;

    const setSidebarCollapsed = (collapsed) => {
        if (collapsed) {
            sidebar.classList.add('collapsed');
            if (toggleBtn) {
                toggleBtn.textContent = '▶';
                toggleBtn.title = 'Išskleisti šoninį meniu (Ctrl+B)';
            }
        } else {
            sidebar.classList.remove('collapsed');
            if (toggleBtn) {
                toggleBtn.textContent = '◀';
                toggleBtn.title = 'Suskleisti šoninį meniu (Ctrl+B)';
            }
        }
        try { localStorage.setItem('sidebarCollapsed', collapsed ? 'true' : 'false'); } catch (e) {}
    };

    // Restore saved state
    try {
        if (localStorage.getItem('sidebarCollapsed') === 'true') {
            setSidebarCollapsed(true);
        }
    } catch (e) {}

    if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isCol = sidebar.classList.contains('collapsed');
            setSidebarCollapsed(!isCol);
        });
    }

    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && (e.key === 'b' || e.key === 'B')) {
            const activeTag = document.activeElement ? document.activeElement.tagName : '';
            if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
            e.preventDefault();
            const isCol = sidebar.classList.contains('collapsed');
            setSidebarCollapsed(!isCol);
        }
    });
});

// ============================================================================
// 2. PROJEKTŲ VALDYMAS (WORKSPACE) IR IŠŠOKANTYS MENIU
// ============================================================================
// ============================================================================
// CENTRALIZUOTAS PROJEKTŲ PERJUNGIMAS IR IZOLIACIJA
// ============================================================================
window.switchProject = async function(newPid, options = {}) {
    if (!newPid || !state.projects || !state.projects[newPid]) return;
    
    const oldPid = state.currentProjectId;
    
    // 1. Išsaugome dabartinio projekto būseną prieš perjungiant (jeigu keičiasi)
    if (oldPid && state.projects[oldPid] && oldPid !== newPid) {
        try {
            await window.saveProjectToDB(oldPid);
        } catch(e) {
            console.warn("Klaida išsaugant ankstesnį projektą:", e);
        }
    }

    // 2. Sustabdome visas aktyvias medijas ir peržiūras
    try {
        if (typeof window.closeViewer === 'function') window.closeViewer();
        
        // Sustabdome timeline audio elementą
        const tlPlayer = document.getElementById("tlAudioElement");
        if (tlPlayer) {
            tlPlayer.pause();
            tlPlayer.removeAttribute("src");
            tlPlayer.load();
        }
        window._playingSceneId = null;

        // Sustabdome audio tab grotuvą
        const fullAudioPlayer = document.getElementById("fullAudioPlayer");
        if (fullAudioPlayer) {
            fullAudioPlayer.pause();
            fullAudioPlayer.removeAttribute("src");
            fullAudioPlayer.load();
        }

        // Sustabdome render video grotuvą
        const renderPlayer = document.getElementById("finalRenderVideoPlayer");
        if (renderPlayer) {
            renderPlayer.pause();
            renderPlayer.removeAttribute("src");
            renderPlayer.load();
        }

        // Sustabdome BGM grojimą
        if (typeof window.stopBgmPlayPreview === 'function') {
            window.stopBgmPlayPreview();
        }

        // Uždaryti didžiąją laiko juostą (Visual Timeline Studio)
        if (typeof window.closeVisualTimelineStudio === 'function') {
            window.closeVisualTimelineStudio();
        }
        if (window._vtlState) {
            window._vtlState.audioBuffer = null;
            window._vtlState.audioDuration = 0;
            if (window._vtlState.playheadRaf) {
                cancelAnimationFrame(window._vtlState.playheadRaf);
                window._vtlState.playheadRaf = null;
            }
        }

        // Išvalyti JSON Fixer modal būseną
        if (typeof window.resetJsonFixerState === 'function') {
            window.resetJsonFixerState();
        }

        // Išvalyti Kinetic writer laikinąsias medijas ir parinktą sceną
        if (typeof window.resetKineticActiveScene === 'function') {
            window.resetKineticActiveScene();
        }
    } catch(e) {
        console.warn("Medijos stabdymo klaida perjungiant projektą:", e);
    }

    // 3. Pakeičiame aktyvų projekto ID
    state.currentProjectId = newPid;
    const newProj = window.getProj();

    // 4. Užtikriname, kad naujo projekto duomenų struktūros būtų izoliuotos ir egzistuotų
    if (!newProj.globals) newProj.globals = { w:1920, h:1080, steps:25, cfg:1.0, sampler:'euler', seedMode:'random', fixedSeed:941027876668241, fallbackRef:'', workflowMode:'qwen_2_1', unetName:'qwen_image_2.1_int8_convrot.safetensors', loraName:'none', clipName:'qwen3vl_8b_int8_convrot.safetensors', vaeName:'qwen_image_2.1_vae_bf16.safetensors', charBaseStyle:'default', charSteps:25, charCfg:1.0, charAspectRatio:'tall' };
    if (!Array.isArray(newProj.refs)) newProj.refs = [];
    if (!Array.isArray(newProj.scenes)) newProj.scenes = [];
    if (!newProj.sceneTextById || typeof newProj.sceneTextById !== 'object') newProj.sceneTextById = {};
    if (!Array.isArray(newProj.outputs)) newProj.outputs = [];
    if (!newProj.charRefs || typeof newProj.charRefs !== 'object') newProj.charRefs = {};
    if (!Array.isArray(newProj.timeline)) newProj.timeline = [];
    if (!Array.isArray(newProj.kineticScenes)) newProj.kineticScenes = [];

    // 5. Atnaujiname UI dropdown
    window.updateProjectDropdown();

    // 6. Iškviečiame visų tabų renderius
    if (typeof window.updateRefsSelects === 'function') window.updateRefsSelects();
    if (typeof window.renderWorkflow === 'function') window.renderWorkflow();
    if (typeof window.validateScenes === 'function') window.validateScenes();
    if (typeof window.renderImages === 'function') window.renderImages();
    if (typeof window.renderCharRefs === 'function') window.renderCharRefs();
    if (typeof window.renderReview === 'function') window.renderReview();
    if (typeof window.renderAudioUI === 'function') window.renderAudioUI();
    if (typeof window.renderScriptUI === 'function') window.renderScriptUI();
    if (typeof window.renderTimeline === 'function') window.renderTimeline();
    if (typeof window.syncWorkspaceScenesToKinetic === 'function') window.syncWorkspaceScenesToKinetic(true);
    if (typeof window.renderKineticUI === 'function') window.renderKineticUI();
    if (typeof window.renderRenderStudioUI === 'function') await window.renderRenderStudioUI();

    const logTbody = $("#importLogTbody");
    if (logTbody) logTbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted" style="padding: 20px;">No imports yet in this session.</td></tr>`;

    // 7. Aktyvuojame tabą
    const targetTab = options.targetTab || newProj.lastActiveTab || 'audio';
    const tabBtn = document.querySelector(`.nav-item[data-tab="${targetTab}"]`);
    if (tabBtn) tabBtn.click();

    // 8. Išsaugome sesiją serveryje
    fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastProjectId: newPid, lastTab: targetTab })
    }).catch(() => {});

    if (!options.silent && typeof toast === 'function') {
        toast("Workspace Changed", `Now editing: ${newProj.name || newPid}`, "success");
    }
};

window.updateProjectDropdown = function() {
    const listEl = $("#projectList");
    const currentNameEl = $("#currentProjectName");
    if(!listEl || !currentNameEl) return;
    
    const currentProj = typeof window.getProj === 'function' ? window.getProj() : null;
    if(!currentProj) return;
    
    currentNameEl.textContent = currentProj.name || currentProj.id;
    
    let html = '';
    for (const pid in state.projects) {
        const pName = state.projects[pid].name || pid;
        const isActive = pid === state.currentProjectId;
        html += `<div class="project-item ${isActive ? 'active' : ''}" data-pid="${pid}">
                    ${escapeHtml(pName)}
                 </div>`;
    }
    listEl.innerHTML = html;

    listEl.querySelectorAll('.project-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const newPid = e.currentTarget.dataset.pid;
            if (newPid !== state.currentProjectId) {
                $("#projectList").classList.add("hidden");
                window.switchProject(newPid);
            }
        });
    });
};

if($("#workspaceDropdown")) {
    $("#workspaceDropdown").addEventListener("click", (e) => {
        e.stopPropagation();
        $("#projectList").classList.toggle("hidden");
    });
}

document.addEventListener("click", (e) => {
    const pList = $("#projectList");
    if(pList && !pList.classList.contains("hidden") && !e.target.closest('#workspaceDropdown')) {
        pList.classList.add("hidden");
    }
    
    const sPopover = $("#settingsPopover");
    if(sPopover && !sPopover.classList.contains("hidden") && !e.target.closest('#settingsPopover') && !e.target.closest('#btnOpenSettings')) {
        sPopover.classList.add("hidden");
    }
});

if($("#btnNewProject")) {
    $("#btnNewProject").addEventListener("click", async () => {
        const name = prompt("Enter new project name:", "My Awesome Movie");
        if (!name) return;
        
        // Vartotojo reikalavimas: nustatymai, garsai, priskirti efektai turi išlikti iš paskutinio projekto,
        // kad kuriant naują video nereikėtų visko konfigūruoti iš naujo!
        const prevProj = typeof window.getProj === 'function' ? window.getProj() : null;

        // Kopijuojame paskutinius globalius generavimo nustatymus arba naudojame numatytuosius
        const inheritedGlobals = (prevProj && prevProj.globals) 
            ? JSON.parse(JSON.stringify(prevProj.globals)) 
            : { w:1920, h:1080, steps:25, cfg:1.0, sampler:'euler', seedMode:'random', fixedSeed:941027876668241, fallbackRef:'' };

        // Kopijuojame paskutinius renderio ir efektų nustatymus (rezoliucija, kodekas, kameros judesys, spalvų filtras, subtitrai, garsumai)
        let inheritedRenderSettings = {};
        if (prevProj && prevProj.renderSettings) {
            inheritedRenderSettings = JSON.parse(JSON.stringify(prevProj.renderSettings));
        } else {
            inheritedRenderSettings = {
                resolution: '1080x1920',
                fpsCodec: '30_h264',
                kenBurnsMode: 'constant_speed',
                kenBurnsIntensity: 15,
                transitionMode: 'dissolve',
                transitionDur: 0.6,
                colorFilter: 'vintage',
                zoomMode: 'constant_speed',
                engine: 'ffmpeg_pro',
                subtitleMode: 'tiktok_karaoke',
                bgmVolume: 5,
                masterVideoVolume: 0.27
            };
        }

        // Kopijuojame paskutinę foninę muziką ir jos studijos nustatymus
        const inheritedBgmTrack = (prevProj && prevProj.bgmTrack) ? prevProj.bgmTrack : (inheritedRenderSettings.bgmTrack || null);
        const inheritedBgmSettings = (prevProj && prevProj.bgmSettings) 
            ? JSON.parse(JSON.stringify(prevProj.bgmSettings)) 
            : (inheritedBgmTrack ? { url: inheritedBgmTrack, volume: inheritedRenderSettings.bgmVolume || 5, muted: false, loop: true, fadeIn: 0.5, fadeOut: 1.5 } : null);

        const newId = 'proj_' + rId();
        state.projects[newId] = {
            id: newId, 
            name: name, 
            lastActiveTab: 'audio', // Nauji projektai prasideda nuo Audio
            globals: inheritedGlobals,
            renderSettings: inheritedRenderSettings,
            bgmTrack: inheritedBgmTrack,
            bgmSettings: inheritedBgmSettings,
            audioGenMode: (prevProj && prevProj.audioGenMode) ? prevProj.audioGenMode : 'by_sentences',
            defaultKineticStyle: (prevProj && prevProj.defaultKineticStyle) ? prevProj.defaultKineticStyle : null,
            refs: [], 
            scenes: [], 
            sceneTextById: {}, 
            outputs: [], 
            charRefs: {}, 
            timeline: [], 
            alignedData: null
        };
        
        await window.switchProject(newId, { targetTab: 'audio', silent: true });
        if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
        toast("Created", `Naujas projektas '${name}' sukurtas su išsaugotais nustatymais!`, "success");
    });
}

if($("#btnRenameProject")) {
    $("#btnRenameProject").addEventListener("click", () => {
        const proj = window.getProj();
        const name = prompt("Rename project to:", proj.name);
        if (name && name.trim() !== "") {
            proj.name = name.trim();
            window.updateProjectDropdown();
            if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
        }
    });
}

if($("#btnDeleteProject")) {
    $("#btnDeleteProject").addEventListener("click", async () => {
        const projKeys = Object.keys(state.projects);
        if (projKeys.length <= 1) return toast("Error", "Cannot delete the only remaining project.", "error");
        
        if (confirm(`Are you sure you want to delete project '${window.getProj().name}'?`)) {
            const idToDelete = state.currentProjectId;
            try {
                await fetch('/api/projects/delete', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: idToDelete })
                });
            } catch(e) { console.error("Failed to delete from server", e); }
            
            delete state.projects[idToDelete];
            const nextPid = Object.keys(state.projects)[0];
            await window.switchProject(nextPid, { targetTab: 'audio', silent: true });
            toast("Deleted", "Project removed.", "success");
        }
    });
}

if($("#btnFactoryReset")) {
    $("#btnFactoryReset").addEventListener("click", async () => {
        if(confirm("⚠️ CAUTION! This will permanently reset all projects from the server. Are you sure you want to proceed with Factory Reset?")) {
            toast("Resetting...", "Clearing server data...", "warn");
            try {
                await fetch('/api/factory_reset', { method: 'POST' });
                window.location.reload(true);
            } catch(e) { toast("Error", "Failed to reset system.", "error"); }
        }
    });
}

// ============================================================================
// 3. GLOBALUS IMPORT / EXPORT (DRAG & DROP - SU FIXU SKIRTUKAMS)
// ============================================================================

if ($("#btnGlobalExport")) $("#btnGlobalExport").addEventListener("click", () => { if (typeof window.exportCurrentProject === 'function') window.exportCurrentProject(); });
if ($("#btnGlobalImport")) $("#btnGlobalImport").addEventListener("click", () => { const hi = $("#hiddenGlobalImport"); if (hi) hi.click(); });
if ($("#hiddenGlobalImport")) {
    $("#hiddenGlobalImport").addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file && typeof window.importProjectFile === 'function') window.importProjectFile(file);
        e.target.value = ""; 
    });
}

let dragCounter = 0;

// Global Drag & Drop ir pelytės vilkimo valdymas:
// 1. Blokuojame netyčinį vidinį elementų/nuotraukų tempimą (HTML5 ghost drag), kuris užrakina paspaudimus
document.addEventListener("dragstart", (e) => {
    if (!e.target.closest('[data-draggable="true"]')) {
        e.preventDefault();
    }
}, false);

// 2. Užtikriname, kad jokie netyčiniai dragover įvykiai neužstrigdintų žymeklio
document.addEventListener("dragenter", (e) => {
    e.preventDefault();
});

document.addEventListener("dragover", (e) => {
    e.preventDefault();
});

document.addEventListener("dragleave", (e) => {
    e.preventDefault();
});

document.addEventListener("drop", (e) => {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.types.includes("Files")) {
        const activeTab = document.querySelector('.nav-item.active')?.dataset.tab;
        if (activeTab === 'import' || activeTab === 'audio') {
            return;
        }

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (file.name.endsWith('.sceneui') || file.name.endsWith('.zip')) {
                if (typeof window.importProjectFile === 'function') {
                    window.importProjectFile(file);
                }
            }
        }
    }
});

// 3. Jei pelyte netyčia buvo patempta ir pažymėtas tekstas ne formos laukeliuose,
// atleidus pelytę (mouseup) žymėjimą išvalome, kad paspaudimai ant mygtukų ar kortelių neužstrigtų
window.addEventListener("mouseup", () => {
    const active = document.activeElement ? document.activeElement.tagName : '';
    if (active !== 'INPUT' && active !== 'TEXTAREA') {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) {
            const anchor = sel.anchorNode;
            const parent = anchor ? (anchor.nodeType === 1 ? anchor : anchor.parentElement) : null;
            if (!parent || !parent.closest('.selectable, .text-selectable, pre, code, .script-quote-box')) {
                sel.removeAllRanges();
            }
        }
    }
});

// 4. Lango fokusavimo praradimas (blur) atstato pelytės vilkimo operacijas
window.addEventListener("blur", () => {
    if (typeof window._vtlState !== 'undefined' && window._vtlState.activeDrag) {
        window._vtlState.activeDrag = null;
    }
});

// ============================================================================
// 4. SETTINGS POPOVER & GLOBALS
// ============================================================================

if($("#btnOpenSettings")) {
    $("#btnOpenSettings").addEventListener("click", (e) => {
        e.stopPropagation();
        $("#serverUrl").value = state.serverUrl || "";
        $("#serverKey").value = state.serverKey || "";
        $("#wServerUrl").value = state.wServerUrl || "";
        $("#settingsPopover").classList.toggle("hidden");
    });
}

if($("#btnSaveSettings")) {
    $("#btnSaveSettings").addEventListener("click", () => {
        if(typeof window.formatUrl === 'function') {
            state.serverUrl = window.formatUrl($("#serverUrl").value);
            state.wServerUrl = window.formatUrl($("#wServerUrl").value);
        } else {
            state.serverUrl = $("#serverUrl").value;
            state.wServerUrl = $("#wServerUrl").value;
        }
        state.serverKey = $("#serverKey").value.trim();
        toast("Settings Saved", "Pinging servers...", "info");
        $("#settingsPopover").classList.add("hidden");
    });
}

if($("#btnSaveGlobals")) {
    $("#btnSaveGlobals").addEventListener("click", () => {
      const proj = window.getProj();
      proj.globals.w = parseInt($("#gW").value); proj.globals.h = parseInt($("#gH").value); 
      proj.globals.steps = parseInt($("#gSteps").value); proj.globals.cfg = parseFloat($("#gCfg").value);
      proj.globals.sampler = $("#gSampler").value; proj.globals.seedMode = $("#gSeedMode").value; 
      proj.globals.fixedSeed = parseInt($("#gFixedSeed").value); 
      
      const presetSelect = document.getElementById('gModelPreset');
      if (presetSelect && presetSelect.value !== 'custom') {
        const [wfMode, unet, lora] = presetSelect.value.split('|');
        proj.globals.workflowMode = wfMode;
        proj.globals.unetName = unet;
        proj.globals.loraName = lora;
        if (unet.includes('2.1') || wfMode === 'qwen_2_1') {
          proj.globals.clipName = 'qwen3vl_8b_int8_convrot.safetensors';
          proj.globals.vaeName = 'qwen_image_2.1_vae_bf16.safetensors';
          if (!proj.globals.steps || proj.globals.steps <= 4) proj.globals.steps = 25;
        } else {
          proj.globals.clipName = 'qwen_2.5_vl_7b_fp8_scaled.safetensors';
          proj.globals.vaeName = 'qwen_image_vae.safetensors';
        }
      } else {
        if ($("#gWfMode")) proj.globals.workflowMode = $("#gWfMode").value;
        if ($("#gUnetName")) proj.globals.unetName = $("#gUnetName").value.trim();
        if ($("#gLoraName")) proj.globals.loraName = $("#gLoraName").value.trim();
      }

      if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
      if (typeof window.syncQuickSettings === 'function') window.syncQuickSettings();
      toast("Saved", "Project global settings updated", "success");
    });
}

// Auto-save global settings instantly on change/input
const autoSaveGlobals = () => {
    const proj = window.getProj();
    if (!proj || !proj.globals) return;
    
    if ($("#gW")) proj.globals.w = parseInt($("#gW").value) || 1920;
    if ($("#gH")) proj.globals.h = parseInt($("#gH").value) || 1080;
    if ($("#gSteps")) proj.globals.steps = parseInt($("#gSteps").value) || 4;
    if ($("#gCfg")) proj.globals.cfg = parseFloat($("#gCfg").value) || 1.0;
    if ($("#gSampler")) proj.globals.sampler = $("#gSampler").value;
    if ($("#gSeedMode")) {
        proj.globals.seedMode = $("#gSeedMode").value;
        $("#gFixedSeedDiv").classList.toggle("hidden", $("#gSeedMode").value !== 'fixed');
    }
    if ($("#gFixedSeed")) proj.globals.fixedSeed = parseInt($("#gFixedSeed").value) || 941027876668241;
    
    if ($("#gWfMode")) proj.globals.workflowMode = $("#gWfMode").value;
    if ($("#gUnetName")) proj.globals.unetName = $("#gUnetName").value.trim();
    if ($("#gLoraName")) proj.globals.loraName = $("#gLoraName").value.trim();
    
    window.saveCurrentProject();
    if (typeof window.syncQuickSettings === 'function') window.syncQuickSettings();
};

['#gW', '#gH', '#gSteps', '#gCfg', '#gSampler', '#gSeedMode', '#gFixedSeed', '#gWfMode', '#gUnetName', '#gLoraName'].forEach(sel => {
    const el = $(sel);
    if (el) {
        el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', autoSaveGlobals);
    }
});

// ============================================================================
// 5. KLAVIATŪROS TRUMPINIAI (SHORTCUTS)
// ============================================================================
document.addEventListener("keydown", e => {
  if(e.key === "Escape") { 
      // If review image is zoomed in, ESC first resets review zoom
      if (window.isRevImageZoomed && typeof window.resetRevZoom === 'function') {
          window.resetRevZoom();
          return;
      }
      // If image viewer is zoomed in, ESC first resets the zoom smoothly
      if (window.isViewerZoomed && typeof window.resetViewerZoom === 'function') {
          window.resetViewerZoom();
          return;
      }
      const lightbox = document.getElementById('modalImageLightbox');
      if (lightbox && lightbox.classList.contains('show')) {
          lightbox.classList.remove('show');
          return;
      }
      const refPicker = document.getElementById('modalRefPicker');
      if (refPicker && refPicker.classList.contains('show')) {
          refPicker.classList.remove('show');
          return;
      }
      const viewer = document.getElementById('viewer');
      if (viewer && viewer.classList.contains('show')) {
          if (typeof window.closeViewer === 'function') {
              window.closeViewer();
              return;
          }
      }
      const revDetail = document.getElementById('reviewDetail');
      if (revDetail && !revDetail.classList.contains('hidden')) {
          if (typeof window.closeReviewDetail === 'function') {
              window.closeReviewDetail();
              return;
          }
      }
      if(typeof window.closeEdit === 'function') window.closeEdit(); 
      if(typeof window.closeCharEdit === 'function') window.closeCharEdit(); 
      if(typeof window.resetViewerZoom === 'function') window.resetViewerZoom();
      if(typeof window.closeViewer === 'function') window.closeViewer();
      $$('.modal-overlay, .viewer').forEach(el => el.classList.remove('show')); 
  }
  
  if(e.ctrlKey && e.key === "Enter" && $("#modalEdit") && $("#modalEdit").classList.contains("show")) {
      if(typeof window.applyEdit === 'function') window.applyEdit(true);
  }
  if(e.ctrlKey && e.key === "Enter" && $("#modalCharEdit") && $("#modalCharEdit").classList.contains("show")) {
      if(typeof window.applyCharEdit === 'function') window.applyCharEdit(true);
  }
  
  if($("#viewer") && $("#viewer").classList.contains("show")) {
    if(e.key === "ArrowLeft") { 
        state.viewerIndex = (state.viewerIndex - 1 + state.viewerList.length) % state.viewerList.length; 
        if(typeof window.updateViewer === 'function') window.updateViewer(); 
    }
    if(e.key === "ArrowRight") { 
        state.viewerIndex = (state.viewerIndex + 1) % state.viewerList.length; 
        if(typeof window.updateViewer === 'function') window.updateViewer(); 
    }
    // Action Hotkeys in Viewer (if not typing in input)
    if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        if (e.key === 'r' || e.key === 'R') { if(typeof window.viewerRegenerate === 'function') window.viewerRegenerate(); }
        if (e.key === 'f' || e.key === 'F') { if(typeof window.viewerFurtherEdit === 'function') window.viewerFurtherEdit(); }
        if (e.key === 'i' || e.key === 'I') { if(typeof window.viewerInpaint === 'function') window.viewerInpaint(); }
        if (e.key === 'm' || e.key === 'M') { if(typeof window.viewerToggleFlip === 'function') window.viewerToggleFlip(); }
        if (e.key === 'e' || e.key === 'E') { if(typeof window.viewerEditParams === 'function') window.viewerEditParams(); }
        if (e.key === 'd' || e.key === 'D') { if(typeof window.viewerDownload === 'function') window.viewerDownload(); }
        if (e.key === 'v' || e.key === 'V') { if(typeof window.viewerOpenVars === 'function') window.viewerOpenVars(); }
    }
  }
});

if($("#vwPrev")) {
    $("#vwPrev").addEventListener("click", () => { 
        state.viewerIndex = (state.viewerIndex - 1 + state.viewerList.length) % state.viewerList.length; 
        if(typeof window.updateViewer === 'function') window.updateViewer(); 
    });
}
if($("#vwNext")) {
    $("#vwNext").addEventListener("click", () => { 
        state.viewerIndex = (state.viewerIndex + 1) % state.viewerList.length; 
        if(typeof window.updateViewer === 'function') window.updateViewer(); 
    });
}

// Viewer Glass Action Bar Button Listeners
if ($("#vwBtnRegen")) $("#vwBtnRegen").addEventListener("click", () => { if(typeof window.viewerRegenerate === 'function') window.viewerRegenerate(); });
if ($("#vwBtnFurtherEdit")) $("#vwBtnFurtherEdit").addEventListener("click", () => { if(typeof window.viewerFurtherEdit === 'function') window.viewerFurtherEdit(); });
if ($("#vwBtnInpaint")) $("#vwBtnInpaint").addEventListener("click", () => { if(typeof window.viewerInpaint === 'function') window.viewerInpaint(); });
if ($("#vwBtnVideo")) $("#vwBtnVideo").addEventListener("click", () => { if(typeof window.viewerVideoStudio === 'function') window.viewerVideoStudio(); });
if ($("#vwBtnFlip")) $("#vwBtnFlip").addEventListener("click", () => { if(typeof window.viewerToggleFlip === 'function') window.viewerToggleFlip(); });
if ($("#vwBtnEdit")) $("#vwBtnEdit").addEventListener("click", () => { if(typeof window.viewerEditParams === 'function') window.viewerEditParams(); });
if ($("#vwBtnDownload")) $("#vwBtnDownload").addEventListener("click", () => { if(typeof window.viewerDownload === 'function') window.viewerDownload(); });
if ($("#vwBtnVars")) $("#vwBtnVars").addEventListener("click", () => { if(typeof window.viewerOpenVars === 'function') window.viewerOpenVars(); });
if ($("#vwBtnDelete")) $("#vwBtnDelete").addEventListener("click", () => { if(typeof window.viewerDelete === 'function') window.viewerDelete(); });

// Viewer Backdrop click to close (clicking outside media and controls)
const viewerEl = document.getElementById("viewer");
if (viewerEl) {
  viewerEl.addEventListener("click", (e) => {
    // Only close if clicking directly on the backdrop or top header empty space
    if (e.target === viewerEl || e.target.classList.contains("v-body-container")) {
      if (typeof window.closeViewer === 'function') window.closeViewer();
    }
  });
}

// ============================================================================
// 6. INICIALIZACIJA (Puslapio užkrovimo startas)
// ============================================================================
window.addEventListener("DOMContentLoaded", async () => {
    if (typeof window.setupViewerZoomAndPan === 'function') window.setupViewerZoomAndPan();
    toast("Loading", "Loading projects from database...", "info");
    
    if (typeof window.loadAllProjectsFromDB === 'function') await window.loadAllProjectsFromDB();
    if (typeof window.fetchSystemNodes === 'function') await window.fetchSystemNodes();

    // Atstatome paskutinę sesiją iš serverio
    try {
        const sessionRes = await fetch('/api/session');
        if (sessionRes.ok) {
            const sessionData = await sessionRes.json();
            const lastProjId = sessionData.session && sessionData.session.lastProjectId;
            if (lastProjId && state.projects && state.projects[lastProjId]) {
                state.currentProjectId = lastProjId;
            }
            if (sessionData.session && sessionData.session.wServerUrl) {
                state.wServerUrl = sessionData.session.wServerUrl;
                const wInput = document.getElementById('wServerUrl');
                if (wInput) wInput.value = state.wServerUrl;
            }
        }
    } catch(e) { console.warn('Session restore failed:', e); }

    // Auto-save WhisperX URL on changes
    const wServerInput = document.getElementById('wServerUrl');
    if (wServerInput) {
        if (state.wServerUrl) wServerInput.value = state.wServerUrl;
        const saveWhisperUrl = () => {
            let val = wServerInput.value.trim();
            if (val) {
                if (!val.startsWith('http://') && !val.startsWith('https://')) val = 'http://' + val;
                if (!val.endsWith('/')) val += '/';
                state.wServerUrl = val;
                fetch('/api/session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ wServerUrl: val })
                }).catch(() => {});
            }
        };
        wServerInput.addEventListener('input', saveWhisperUrl);
        wServerInput.addEventListener('change', saveWhisperUrl);
    }

    if (typeof window.getProj === 'function') window.getProj(); 
    if (typeof window.initQuickSettings === 'function') window.initQuickSettings();
    if (typeof window.loadBaseStyles === 'function') await window.loadBaseStyles();
    if (typeof window.updateProjectDropdown === 'function') window.updateProjectDropdown();

    if(typeof window.updateRefsSelects === 'function') window.updateRefsSelects(); 
    if(typeof window.renderWorkflow === 'function') window.renderWorkflow();
    if(typeof window.renderImages === 'function') window.renderImages();
    if(typeof window.renderTimeline === 'function') window.renderTimeline();
    if(typeof window.renderAudioUI === 'function') window.renderAudioUI();
    if(typeof window.renderScriptUI === 'function') window.renderScriptUI();
    if(typeof window.checkBaseTemplates === 'function') window.checkBaseTemplates();

    // ===== AFTER PROJECT DATA IS LOADED: refresh Render Studio + Kinetic Text tabs =====
    if(typeof window.renderRenderStudioUI === 'function') await window.renderRenderStudioUI();
    if(typeof window.syncWorkspaceScenesToKinetic === 'function') window.syncWorkspaceScenesToKinetic(true);
    
    if(typeof loadPromptFiles === 'function') loadPromptFiles();
    if(typeof window.connectWebSocket === 'function') window.connectWebSocket();
    
    const currentProj = typeof window.getProj === 'function' ? window.getProj() : null;
    if (currentProj && currentProj.lastActiveTab) {
        const tabBtn = document.querySelector(`.nav-item[data-tab="${currentProj.lastActiveTab}"]`);
        if (tabBtn) tabBtn.click();
        // If render tab is active, explicitly refresh after click
        if (currentProj.lastActiveTab === 'render' && typeof window.renderRenderStudioUI === 'function') {
            setTimeout(() => window.renderRenderStudioUI(), 200);
        }
    } else {
        document.querySelector('.nav-item[data-tab="audio"]')?.click();
    }
});

    // Whisper Engine Mode Selector Init
    const wEngineSelect = document.getElementById('whisperEngineModeSelect');
    if (wEngineSelect) {
        const savedMode = localStorage.getItem('whisperEngineMode') || 'external';
        wEngineSelect.value = savedMode;
        wEngineSelect.addEventListener('change', (e) => {
            localStorage.setItem('whisperEngineMode', e.target.value);
            if (typeof window.checkWhisperXStatus === 'function') {
                window.checkWhisperXStatus();
            }
            if (typeof toast === 'function') {
                toast("Whisper Variklis", e.target.value === 'external' ? "Aktyvuotas IŠORINIS WhisperX (GPU / Port 8002)!" : "Aktyvuotas INTEGRUOTAS Whisper variklis.", "info");
            }
        });
    }