
// ============================================================================
// GLOBAL SYSTEM SIMULATION / ZERO-GPU DEMO SHOWCASE MANAGER
// ============================================================================
window.isGlobalDemoMode = function() {
    const chk = document.getElementById("chkGlobalDemoMode");
    if (chk) return chk.checked;
    const stored = localStorage.getItem("sceneui_global_demo_mode");
    if (stored !== null) return stored === "true";
    return true; // Default ON
};

window.setGlobalDemoMode = function(enabled) {
    localStorage.setItem("sceneui_global_demo_mode", String(enabled));
    const chk = document.getElementById("chkGlobalDemoMode");
    if (chk) chk.checked = enabled;
    const badge = document.getElementById("demoModeActiveBadge");
    if (badge) {
        badge.style.display = enabled ? "inline-block" : "none";
    }
    const chkScript = document.getElementById("chkLlmSandboxMode");
    if (chkScript) chkScript.checked = enabled;
};

document.addEventListener("DOMContentLoaded", () => {
    const initial = window.isGlobalDemoMode();
    const chk = document.getElementById("chkGlobalDemoMode");
    if (chk) chk.checked = initial;
    const badge = document.getElementById("demoModeActiveBadge");
    if (badge) badge.style.display = initial ? "inline-block" : "none";
});

// ============================================================================

// API & POLLING (SERVER CONNECTION & STATE RECOVERY)

// ============================================================================



function formatUrl(url) { 

    return url.endsWith('/') ? url : url + '/'; 

}



// Tikrina tiesioginį ryšį su ComfyUI (naudojama ping'ui, kad žinotume ar variklis gyvas)

async function apiGet(endpoint) {

    const res = await fetch(state.serverUrl + endpoint);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    return await res.json();

}



function updateConnUI() {

    const pill = $("#connPill");

    const text = $("#connText");

    if (pill && text) {

        pill.className = state.connected ? "pill good" : "pill bad";

        text.textContent = state.connected ? "Connected" : "Offline (Mock)";

    }

}



// Nauja dinaminė funkcija Multi-GPU indikatoriaus atnaujinimui

window.updateSystemNodesUI = function() {

    const pill = $("#connPill");

    const text = $("#connText");

    if (!pill || !text) return;



    const nodes = state.renderNodes || [];

    const onlineCount = nodes.filter(n => n.status !== 'offline' && n.status !== 'error' && n.is_active).length;

    const totalCount = nodes.filter(n => n.is_active).length;



    if (!state.connected) {

        pill.className = "pill bad";

        text.textContent = "Hub Offline";

        return;

    }



    // Atnaujiname patį indikatorių

    if (totalCount === 0) {

        pill.className = "pill warn";

        text.innerHTML = "No GPUs Configured";

    } else if (onlineCount > 0) {

        pill.className = "pill good";

        text.innerHTML = `GPU: ${onlineCount}/${totalCount} Online`;

    } else {

        pill.className = "pill bad";

        text.innerHTML = `GPU: 0/${totalCount} Online`;

    }



    // Generuojame išmanųjį Hover Tooltip (Progressive Disclosure)

    let tooltip = $("#gpuHoverTooltip");

    if (!tooltip) {

        tooltip = document.createElement("div");

        tooltip.id = "gpuHoverTooltip";

        tooltip.style.cssText = "position:absolute; top:100%; right:0; margin-top:8px; background:rgba(16, 23, 35, 0.95); border:1px solid var(--border); border-radius:8px; padding:12px; z-index:9999; display:none; flex-direction:column; gap:8px; min-width:220px; backdrop-filter:blur(10px); box-shadow:var(--shadow);";

        pill.parentNode.style.position = "relative";

        pill.parentNode.appendChild(tooltip);



        pill.parentNode.addEventListener("mouseenter", () => tooltip.style.display = "flex");

        pill.parentNode.addEventListener("mouseleave", () => tooltip.style.display = "none");

    }



    let tooltipHtml = `<div style="font-size:10px; color:var(--muted); font-weight:bold; letter-spacing:1px; border-bottom:1px solid var(--border); padding-bottom:6px;">RENDER FARM STATUS</div>`;

    

    if (nodes.length === 0) {

        tooltipHtml += `<div class="text-xs text-muted">No nodes available. Go to Settings ⚙️.</div>`;

    } else {

        nodes.forEach(n => {

            let statusIcon = "🔴";

            let statusText = "Offline/Error";

            if (n.status === "idle") { statusIcon = "🟢"; statusText = "Idle (Ready)"; }

            else if (n.status === "processing") { statusIcon = "🔵"; statusText = "Working..."; }

            // NAUJA: Pataisytas tooltip, atpažįstantis Audio generavimo užraktą

            else if (n.status === "paused_audio") { statusIcon = "🟪"; statusText = "Audio Engine Active"; }

            

            if (!n.is_active) { statusIcon = "⚪"; statusText = "Paused"; }



            let lockHtml = n.locked_proj ? `<span style="color:var(--warn); font-size:12px; margin-left:4px;" title="Locked to Project: ${n.locked_proj}">🔒</span>` : "";



            tooltipHtml += `<div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; padding: 2px 0;">

                <span style="color:var(--text); display:flex; align-items:center;">${statusIcon} <span style="margin-left:6px">${escapeHtml(n.name)}</span> ${lockHtml}</span>

                <span style="color:var(--muted); font-size:10px; font-family:var(--mono)">${statusText}</span>

            </div>`;

        });

    }

    tooltip.innerHTML = tooltipHtml;

};



// ============================================================================

// UI ATNAUJINIMO KONTROLĖ (DEBOUNCE) - APSAUGA NUO MIRKČIOJIMO

// ============================================================================

let uiRefreshTimer = null;

let pendingRefreshes = new Set();



window.triggerUIRefresh = function(target) {

    pendingRefreshes.add(target);

    if (uiRefreshTimer) clearTimeout(uiRefreshTimer);

    

    uiRefreshTimer = setTimeout(() => {

        if (pendingRefreshes.has('images') && typeof window.renderImages === 'function') {

            window.renderImages();

        }

        if (pendingRefreshes.has('chars') && typeof window.renderCharRefs === 'function') {

            window.renderCharRefs();

        }

        pendingRefreshes.clear();

    }, 150);

};



// ============================================================================

// AUTO-SAVE IR PROJEKTŲ KROVIMO FUNKCIJOS

// ============================================================================

window.saveProjectToDB = async function(projectId) {

    const projData = state.projects[projectId];

    if (!projData) return;

    try {

        await fetch('/api/projects/save', {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify(projData)

        });

    } catch(e) {

        console.warn(`Nepavyko automatiškai išsaugoti projekto ${projectId}:`, e);

    }

};



window.saveCurrentProject = function() {

    window.saveProjectToDB(state.currentProjectId);

};



window.loadAllProjectsFromDB = async function() {

    try {

        const res = await fetch('/api/projects');

        if (res.ok) {

            const data = await res.json();

            if (data.projects && Object.keys(data.projects).length > 0) {

                state.projects = data.projects;

                if (!state.projects[state.currentProjectId]) {

                    state.currentProjectId = Object.keys(state.projects)[0];

                }

            }

        }

    } catch(e) {

        console.warn("Nepavyko užkrauti projektų iš DB:", e);

    }

};



// ============================================================================

// PROJEKTŲ EKSPORTAS IR IMPORTAS (.sceneui)

// ============================================================================

window.exportCurrentProject = async function() {

    const projId = state.currentProjectId;

    if (!projId) return toast("Error", "No project to export.", "error");



    const btn = document.getElementById("btnGlobalExport");

    const originalHtml = btn ? btn.innerHTML : "";

    

    if (btn) { btn.disabled = true; btn.innerHTML = `<span class="pulse-text">⏳ Packing...</span>`; }

    toast("Exporting...", "Zipping project files...", "info");



    try {

        await window.saveProjectToDB(projId);

        const res = await fetch(`/api/projects/export/${projId}`);

        if (!res.ok) throw new Error("Server failed to export project.");

        

        const blob = await res.blob();

        const contentDisposition = res.headers.get('Content-Disposition');

        let filename = `${window.getProj().name.replace(/\s+/g, '_')}_backup.sceneui`;

        if (contentDisposition && contentDisposition.includes('filename=')) {

            filename = contentDisposition.split('filename=')[1].replace(/"/g, '');

        }



        const a = document.createElement('a');

        a.href = URL.createObjectURL(blob);

        a.download = filename;

        document.body.appendChild(a);

        a.click();

        a.remove();

        URL.revokeObjectURL(a.href);

        

        toast("Success", "Project exported successfully!", "success");

    } catch (e) {

        toast("Error", e.message, "error");

    } finally {

        if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }

    }

};



window.importProjectFile = async function(file) {

    if (!file) return;

    toast("Importing...", "Uploading and extracting project...", "info");

    

    const formData = new FormData();

    formData.append("file", file);



    try {

        const res = await fetch('/api/projects/import', { method: 'POST', body: formData });

        const data = await res.json();

        if (!res.ok || data.status !== "success") throw new Error(data.message || "Failed to import project.");



        await window.loadAllProjectsFromDB();

        const impProj = state.projects[data.project_id];

        if (typeof window.switchProject === 'function') {

            await window.switchProject(data.project_id, { targetTab: impProj?.lastActiveTab || 'script', silent: true });

        } else {

            state.currentProjectId = data.project_id;

            if(typeof window.updateProjectDropdown === 'function') window.updateProjectDropdown();

            if(typeof window.renderWorkflow === 'function') window.renderWorkflow();

            if(typeof window.renderImages === 'function') window.renderImages();

            if(typeof window.renderTimeline === 'function') window.renderTimeline();

        }

        toast("Success", data.message, "success");

        

    } catch(e) {

        toast("Import Error", e.message, "error");

    }

};



// ============================================================================

// WEBSOCKETS (Gauna pranešimus iš Python Orkestratoriaus)

// ============================================================================

let ws;

let wsReconnectTimer;

let sessionCompletedTasks = 0; 



window.connectWebSocket = function() {

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    ws = new WebSocket(`${protocol}//${window.location.host}/ws`);



    ws.onopen = () => {

        console.log("Connected to System Hub WebSocket!");

        clearTimeout(wsReconnectTimer); 

        fetchQueueStatusOnce();

    };



    ws.onclose = () => {

        console.log("WebSocket disconnected. Reconnecting in 3s...");

        wsReconnectTimer = setTimeout(window.connectWebSocket, 3000);

    };



    ws.onerror = (err) => {

        console.error("WebSocket error", err);

        ws.close(); 

    };



    ws.onmessage = (event) => {

        const data = JSON.parse(event.data);

        

        if (data.type === "system_update") {

            // Atnaujiname globalią Nodes (GPU) būseną

            if (data.nodes) state.renderNodes = data.nodes;



            // Atnaujiname užduočių eilę šiam projektui

            const activeProjTasks = (data.active_tasks && data.active_tasks[state.currentProjectId]) ? Object.assign({}, data.active_tasks[state.currentProjectId]) : {};

            if (data.active_tasks) {

                Object.values(data.active_tasks).forEach(ptasks => {

                    Object.keys(ptasks).forEach(rid => {

                        if (rid.startsWith('sfx_')) {

                            activeProjTasks[rid] = ptasks[rid];

                        }

                    });

                });

            }

            applyQueueState(activeProjTasks);

        }

        else if (data.type === "task_progress") {

            if (data.sceneId && data.sceneId.startsWith('style_')) {

                if (typeof window.onStyleLabTaskProgress === 'function') {

                    window.onStyleLabTaskProgress(data);

                }

                return;

            }

            if (data.projectId === state.currentProjectId && data.max > 0) {

                const pct = Math.round((data.step / data.max) * 100);

                const fillEl = document.getElementById(`prog-fill-${data.reqId}`) ||

                               document.querySelector(`[data-scene-id="${data.sceneId}"] .card-prog-fill`) ||

                               document.getElementById(`prog-fill-sc-${data.sceneId}`);

                const textEl = document.getElementById(`prog-text-${data.reqId}`) ||

                               document.querySelector(`[data-scene-id="${data.sceneId}"] .card-prog-text`) ||

                               document.getElementById(`prog-text-sc-${data.sceneId}`);

                

                const nodeInfo = data.nodeId ? ` [${data.nodeId}]` : '';



                if (fillEl) fillEl.style.width = `${pct}%`;

                if (textEl) {

                    textEl.textContent = `⚡ Gen: ${pct}% [${data.step}/${data.max}]${nodeInfo}`;

                }



                // Live progress in Review tab

                if (window.reviewList && window.reviewList[window.reviewIndex]) {

                    const curRevItem = window.reviewList[window.reviewIndex];

                    if (curRevItem.sceneId === data.sceneId || String(curRevItem.sceneId) === String(data.sceneId)) {

                        const actionType = (window.lastGenActionByScene && window.lastGenActionByScene[curRevItem.sceneId]) || 'regen';

                        const btnRegen = document.getElementById('btnRevRegenNow');

                        const btnEdit = document.getElementById('btnRevEditPrompt');

                        const btnFurther = document.getElementById('btnRevFurtherEdit');



                        if (btnRegen) { btnRegen.disabled = true; btnRegen.style.opacity = '0.65'; }

                        if (btnEdit) { btnEdit.disabled = true; btnEdit.style.opacity = '0.65'; }

                        if (btnFurther) { btnFurther.disabled = true; btnFurther.style.opacity = '0.65'; }



                        if (actionType === 'edit' && btnEdit) {

                            btnEdit.innerHTML = `<span class="spin-anim">⚡</span> Redaguojama: ${pct}%${nodeInfo}`;

                        } else if (actionType === 'further_edit' && btnFurther) {

                            btnFurther.innerHTML = `<span class="spin-anim">⚡</span> Taisoma: ${pct}%${nodeInfo}`;

                        } else if (btnRegen) {

                            btnRegen.innerHTML = `<span class="spin-anim">⚡</span> Gen: ${pct}%${nodeInfo}`;

                        }

                    }

                }

            }

        }

        else if (data.type === "task_stage") {

            if (data.projectId === state.currentProjectId) {

                const textEl = document.getElementById(`prog-text-${data.reqId}`) ||

                               document.querySelector(`[data-scene-id="${data.sceneId}"] .card-prog-text`) ||

                               document.getElementById(`prog-text-sc-${data.sceneId}`);

                const nodeInfo = data.nodeId ? ` [${data.nodeId}]` : '';

                const stageText = data.stage || 'Kraunamas modelis...';

                if (textEl && !textEl.textContent.includes('%')) {

                    textEl.textContent = `${stageText}${nodeInfo}`;

                }



                // Live progress in Review tab

                if (window.reviewList && window.reviewList[window.reviewIndex]) {

                    const curRevItem = window.reviewList[window.reviewIndex];

                    if (curRevItem.sceneId === data.sceneId || String(curRevItem.sceneId) === String(data.sceneId)) {

                        const actionType = (window.lastGenActionByScene && window.lastGenActionByScene[curRevItem.sceneId]) || 'regen';

                        const btnRegen = document.getElementById('btnRevRegenNow');

                        const btnEdit = document.getElementById('btnRevEditPrompt');

                        const btnFurther = document.getElementById('btnRevFurtherEdit');



                        if (btnRegen) { btnRegen.disabled = true; btnRegen.style.opacity = '0.65'; }

                        if (btnEdit) { btnEdit.disabled = true; btnEdit.style.opacity = '0.65'; }

                        if (btnFurther) { btnFurther.disabled = true; btnFurther.style.opacity = '0.65'; }



                        if (actionType === 'edit' && btnEdit) {

                            btnEdit.innerHTML = `<span class="spin-anim">⏳</span> ${stageText}${nodeInfo}`;

                        } else if (actionType === 'further_edit' && btnFurther) {

                            btnFurther.innerHTML = `<span class="spin-anim">⏳</span> ${stageText}${nodeInfo}`;

                        } else if (btnRegen) {

                            btnRegen.innerHTML = `<span class="spin-anim">⏳</span> ${stageText}${nodeInfo}`;

                        }

                    }

                }

            }

        }

        else if (data.type === "audio_chunk_progress") {

            if (typeof window.onAudioChunkProgress === 'function') {

                window.onAudioChunkProgress(data);

            }

        }

        else if (data.type === "sfx_progress") {

            const scId = String(data.sceneId || '');

            if (!window._generatingSfxByScene) window._generatingSfxByScene = {};

            if (data.status === "processing" || data.status === "queued") {

                window._generatingSfxByScene[scId] = true;

                window._generatingSfxByScene[scId.replace(/^S/i, '')] = true;

                window._generatingSfxByScene['s' + scId.replace(/^S/i, '')] = true;

                window._generatingSfxByScene['S' + scId.replace(/^S/i, '')] = true;

            } else {

                delete window._generatingSfxByScene[scId];

                delete window._generatingSfxByScene[scId.replace(/^S/i, '')];

                delete window._generatingSfxByScene['s' + scId.replace(/^S/i, '')];

                delete window._generatingSfxByScene['S' + scId.replace(/^S/i, '')];

                if (data.status === "done" && data.sfxUrl) {

                    const proj = typeof window.getProj === 'function' ? window.getProj() : null;

                    if (proj) {

                        if (!proj.sceneSfxById) proj.sceneSfxById = {};

                        if (!proj.sceneSfxVarsById) proj.sceneSfxVarsById = {};

                        const numId = scId.replace(/^S/i, '');

                        [scId, scId.toLowerCase(), scId.toUpperCase(), numId, 's' + numId, 'S' + numId].forEach(k => {

                            proj.sceneSfxById[k] = data.sfxUrl;

                            if (data.variations) proj.sceneSfxVarsById[k] = data.variations;

                        });

                    }

                    if (typeof toast === 'function') toast("SFX Sukurtas", "Scenos fono garsai sėkmingai sugeneruoti!", "success");

                }

            }

            if (typeof window.triggerUIRefresh === 'function') {

                window.triggerUIRefresh('images');

            }

            const viewerEl = document.getElementById('viewer');

            const currentViewerId = (state.viewerList && state.viewerList[state.viewerIndex]) ? String(state.viewerList[state.viewerIndex]) : '';

            const isViewingThisScene = currentViewerId && (currentViewerId === scId || currentViewerId.replace(/^S/i, '') === scId.replace(/^S/i, ''));

            if (typeof window.updateViewer === 'function' && viewerEl?.classList.contains('show') && isViewingThisScene && !document.hidden) {

                window.updateViewer();

            }

        }

        else if (data.type === "task_complete") {

            // Style Lab hook

            if (data.sceneId && data.sceneId.startsWith('style_')) {

                if (typeof window.onStyleLabTaskComplete === 'function') {

                    window.onStyleLabTaskComplete(data);

                }

                return;

            }



            const targetProj = state.projects[data.projectId];

            if (!targetProj) return;



            let found = false;

            for (let out of targetProj.outputs) {

                let v = out.variations.find(x => x.id === data.reqId);

                if (v) {

                    v.url = data.vaultUrl; 

                    v.status = "done";

                    out.mainId = v.id;

                    out.generating = out.variations.some(x => x.status === "queued" || x.status === "processing");

                    if (data.projectId === state.currentProjectId) window.triggerUIRefresh('images');

                    found = true; 

                    break;

                }

            }

            if (!found && data.sceneId) {

                const cleanSid = String(data.sceneId).replace(/^S/i, '');

                const out = targetProj.outputs.find(o => String(o.sceneId).replace(/^S/i, '') === cleanSid);

                if (out) {

                    let v = out.variations.find(x => x.id === data.reqId);

                    if (!v) {

                        v = out.variations.find(x => x.status === 'processing' || x.status === 'queued') || out.variations[out.variations.length - 1];

                    }

                    if (v) {

                        v.url = data.vaultUrl;

                        v.status = "done";

                        out.mainId = v.id;

                    }

                    out.generating = out.variations.some(x => x.status === "queued" || x.status === "processing");

                    if (data.projectId === state.currentProjectId) window.triggerUIRefresh('images');

                    found = true;

                }

            }

            if (!found) {

                for (let ref in targetProj.charRefs) {

                    let c = targetProj.charRefs[ref];

                    let v = c.variations.find(x => x.id === data.reqId);

                    if (v) {

                        v.url = data.vaultUrl; 

                        v.status = "done";

                        c.mainId = v.id;

                        if (v.params) {

                            c.params = JSON.parse(JSON.stringify(v.params));

                        }

                        if (!targetProj.refs) targetProj.refs = [];

                        if (!targetProj.refs.includes(ref) && !ref.startsWith('edit_src_') && ref !== 'empty_scene.png') {

                            targetProj.refs.push(ref);

                        }

                        c.generating = c.variations.some(x => x.status === "queued" || x.status === "processing");

                        if (data.projectId === state.currentProjectId) {

                            window.triggerUIRefresh('chars');

                            if (typeof window.updateRefsSelects === 'function') window.updateRefsSelects();

                        }

                        found = true;

                        break;

                    }

                }

            }

                        if (data.sfxUrl && targetProj) {
                if (!targetProj.sceneSfxById) targetProj.sceneSfxById = {};
                if (!targetProj.sceneSfxVarsById) targetProj.sceneSfxVarsById = {};
                const sIdStr = String(data.sceneId || '');
                const nIdStr = sIdStr.replace(/^S/i, '');
                [sIdStr, sIdStr.toLowerCase(), sIdStr.toUpperCase(), nIdStr, 's' + nIdStr, 'S' + nIdStr].forEach(k => {
                    targetProj.sceneSfxById[k] = data.sfxUrl;
                    if (data.sfxVariations && data.sfxVariations.length > 0) {
                        targetProj.sceneSfxVarsById[k] = data.sfxVariations;
                    }
                });
            }

            if (found) {

                window.saveProjectToDB(data.projectId);

                if (data.projectId === state.currentProjectId) {

                    sessionCompletedTasks++;

                    toast("✅ Task Complete", `GPU rendered task. (Scene: ${data.sceneId})`, "success", "mass-done");

                    

                    if (window.lastGenActionByScene) {

                        delete window.lastGenActionByScene[data.sceneId];

                    }



                    // Real-time update in Review tab / Review detail if open!

                    const revDetail = document.getElementById('reviewDetail');

                    if (revDetail && !revDetail.classList.contains('hidden')) {

                        if (window.reviewList && window.reviewList[window.reviewIndex]) {

                            const curRevItem = window.reviewList[window.reviewIndex];

                            if (curRevItem.sceneId === data.sceneId || String(curRevItem.sceneId) === String(data.sceneId)) {

                                curRevItem.url = data.vaultUrl;

                                curRevItem.isGenerating = false;

                            }

                        }

                        if (typeof window.updateReviewUI === 'function') window.updateReviewUI();

                    }

                    const revTab = document.getElementById('tab-review');

                    if (revTab && !revTab.classList.contains('hidden')) {

                        if (typeof window.renderReview === 'function') window.renderReview();

                    }



                    // Real-time update in Image Viewer if open!

                    const viewer = document.getElementById('viewer');

                    if (viewer && viewer.classList.contains('show')) {

                        if (typeof window.updateViewer === 'function') window.updateViewer();

                    }

                }

            }



        } else if (data.type === "task_error") {

            if (data.sceneId && data.sceneId.startsWith('style_')) {

                if (typeof window.onStyleLabTaskError === 'function') {

                    window.onStyleLabTaskError(data);

                }

                return;

            }



            const targetProj = state.projects[data.projectId];

            if (!targetProj) return;



            let found = false;

            for (let out of targetProj.outputs) {

                let vIdx = out.variations ? out.variations.findIndex(x => x.id === data.reqId) : -1;

                if (vIdx !== -1) { 

                    // Pašaliname nepavykusią užduotį, kad neliktų klaidų kortelių variacijų sąraše

                    out.variations.splice(vIdx, 1);

                    out.generating = out.variations.some(x => x.status === "queued" || x.status === "processing"); 

                    if (out.mainId === data.reqId) {

                        const prevDone = out.variations.slice().reverse().find(x => x.status === "done" && x.url);

                        out.mainId = prevDone ? prevDone.id : (out.variations[out.variations.length - 1]?.id || null);

                    }

                    found = true; 

                    if(data.projectId === state.currentProjectId) window.triggerUIRefresh('images'); 

                    break; 

                }

            }

            if(!found) {

                for (let ref in targetProj.charRefs) {

                    let c = targetProj.charRefs[ref];

                    let vIdx = c.variations ? c.variations.findIndex(x => x.id === data.reqId) : -1;

                    if (vIdx !== -1) { 

                        c.variations.splice(vIdx, 1); 

                        c.generating = c.variations.some(x => x.status === "queued" || x.status === "processing"); 

                        if (c.mainId === data.reqId) {

                            const prevDone = c.variations.slice().reverse().find(x => x.status === "done" && x.url);

                            c.mainId = prevDone ? prevDone.id : (c.variations[c.variations.length - 1]?.id || null);

                        }

                        found = true; 

                        if(data.projectId === state.currentProjectId) window.triggerUIRefresh('chars'); 

                        break; 

                    }

                }

            }

                        if (data.sfxUrl && targetProj) {
                if (!targetProj.sceneSfxById) targetProj.sceneSfxById = {};
                if (!targetProj.sceneSfxVarsById) targetProj.sceneSfxVarsById = {};
                const sIdStr = String(data.sceneId || '');
                const nIdStr = sIdStr.replace(/^S/i, '');
                [sIdStr, sIdStr.toLowerCase(), sIdStr.toUpperCase(), nIdStr, 's' + nIdStr, 'S' + nIdStr].forEach(k => {
                    targetProj.sceneSfxById[k] = data.sfxUrl;
                    if (data.sfxVariations && data.sfxVariations.length > 0) {
                        targetProj.sceneSfxVarsById[k] = data.sfxVariations;
                    }
                });
            }

            if (found) {

                window.saveProjectToDB(data.projectId); 

                if (data.projectId === state.currentProjectId) {

                    toast("❌ Generation Error", `Failed: ${data.sceneId} (${data.error})`, "error", "mass-error");

                }

            }

        }

    };

};



// ============================================================================

// DB SYNC IR IŠTRINTŲ UŽDUOČIŲ (CANCEL) GAVIMAS

// ============================================================================

async function fetchQueueStatusOnce() {

    try {

        const res = await fetch('/api/queue/status'); 

    } catch(e) {

        console.warn("Nepavyko nuskaityti serverio eilės statuso:", e);

    }

}



// Pataisyta funkcija, kuri žino, ką daryti, kai užduotis ištrinama iš serverio

function applyQueueState(activeTasks) {

    const proj = window.getProj();

    let needsRender = false;

    let needsCharRender = false;



    // Track active SFX tasks from queue

    if (!window._generatingSfxByScene) window._generatingSfxByScene = {};

    const activeSfxSceneIds = new Set();

    Object.keys(activeTasks || {}).forEach(reqId => {

        if (reqId.startsWith('sfx_')) {

            const t = activeTasks[reqId];

            if (t && t.scene_id) {

                const sId = String(t.scene_id);

                activeSfxSceneIds.add(sId);

                activeSfxSceneIds.add(sId.toLowerCase());

                activeSfxSceneIds.add(sId.toUpperCase());

                activeSfxSceneIds.add(sId.replace(/^S/i, ''));

                activeSfxSceneIds.add('s' + sId.replace(/^S/i, ''));

                activeSfxSceneIds.add('S' + sId.replace(/^S/i, ''));

            }

        }

    });

    // Add new and remove finished

    activeSfxSceneIds.forEach(id => { window._generatingSfxByScene[id] = true; });

    Object.keys(window._generatingSfxByScene).forEach(id => {

        if (!activeSfxSceneIds.has(id)) delete window._generatingSfxByScene[id];

    });



    proj.outputs.forEach(out => {

        let changed = false;

        if (out.variations) {

            const beforeLen = out.variations.length;

            out.variations = out.variations.filter(v => {

                if (v.status === 'queued' || v.status === 'processing') {

                    if (activeTasks[v.id]) {

                        if (v.status !== activeTasks[v.id].status) {

                            v.status = activeTasks[v.id].status; 

                            changed = true;

                        }

                        if (v.status === 'processing') {

                            const textEl = document.getElementById(`prog-text-${v.id}`) ||

                                           document.querySelector(`[data-scene-id="${out.sceneId}"] .card-prog-text`);

                            if (textEl && !textEl.textContent.includes('%')) {

                                const nodeName = activeTasks[v.id].node_name || activeTasks[v.id].node_id;

                                const nodeInfo = nodeName ? ` [${nodeName}]` : '';

                                textEl.textContent = `⏳ Kraunamas modelis...${nodeInfo}`;

                            }

                        }

                        return true;

                    } else {

                        // Užduoties nebėra eilėje (pvz. atšaukta arba pašalinta)

                        changed = true;

                        // Nelaikome klaidų ar atšauktų užduočių kaip variacijų

                        return false;

                    }

                }

                return true;

            });



            if (out.variations.length !== beforeLen) {

                changed = true;

            }



            const currentMain = out.variations.find(v => v.id === out.mainId);

            if (!currentMain || (!currentMain.url && currentMain.status !== 'queued' && currentMain.status !== 'processing')) {

                const prevDone = out.variations.slice().reverse().find(x => x.status === 'done' && x.url && x.url.trim() !== '');

                out.mainId = prevDone ? prevDone.id : (out.variations[out.variations.length - 1]?.id || null);

                changed = true;

            }

        }

        if (changed) {

            out.generating = (out.variations || []).some(x => x.status === 'queued' || x.status === 'processing');

            needsRender = true;

        }

    });



    Object.values(proj.charRefs || {}).forEach(c => {

        let changed = false;

        if (c.variations) {

            const beforeLen = c.variations.length;

            c.variations = c.variations.filter(v => {

                if (v.status === 'queued' || v.status === 'processing') {

                    if (activeTasks[v.id]) {

                        if (v.status !== activeTasks[v.id].status) {

                            v.status = activeTasks[v.id].status;

                            changed = true;

                        }

                        if (v.status === 'processing') {

                            const textEl = document.getElementById(`prog-text-${v.id}`) ||

                                           document.querySelector(`[data-scene-id="${out.sceneId}"] .card-prog-text`);

                            if (textEl && !textEl.textContent.includes('%')) {

                                const nodeName = activeTasks[v.id].node_name || activeTasks[v.id].node_id;

                                const nodeInfo = nodeName ? ` [${nodeName}]` : '';

                                textEl.textContent = `⏳ Kraunamas modelis...${nodeInfo}`;

                            }

                        }

                        return true;

                    } else {

                        changed = true;

                        // Nelaikome klaidu ar atsauktu uzduociu kaip variaciju

                        return false;

                    }

                }

                return true;

            });



            if (c.variations.length !== beforeLen) {

                changed = true;

            }



            const currentMain = c.variations.find(v => v.id === c.mainId);

            if (!currentMain || (!currentMain.url && currentMain.status !== 'queued' && currentMain.status !== 'processing')) {

                const prevDone = c.variations.slice().reverse().find(x => x.status === 'done' && x.url && x.url.trim() !== '');

                c.mainId = prevDone ? prevDone.id : (c.variations[c.variations.length - 1]?.id || null);

                changed = true;

            }

        }

        if (changed) {

            c.generating = (c.variations || []).some(x => x.status === 'queued' || x.status === 'processing');

            needsCharRender = true;

        }

    });



    if (needsRender) window.triggerUIRefresh('images');

    if (needsCharRender) window.triggerUIRefresh('chars');

}



// ============================================================================

// SYSTEM NODES FETCHING

// ============================================================================

window.fetchSystemNodes = async function() {

    try {

        const res = await fetch('/api/nodes');

        if (res.ok) {

            const data = await res.json();

            if (data.nodes) {

                state.renderNodes = data.nodes;

                state.connected = true;

                if (typeof window.updateSystemNodesUI === 'function') window.updateSystemNodesUI();

                if (typeof window.renderSystemNodes === 'function') window.renderSystemNodes();

            }

        }

    } catch(e) {

        console.warn("Failed to fetch system nodes:", e);

    }

};



// ============================================================================

// POLLING LOOP (Tikrina Python Hub'ą ir WhisperX)

// ============================================================================

// Auto-check WhisperX Status

setInterval(async () => {

    try {

        const res = await fetch('/api/nodes');

        if(res.ok) {

            const data = await res.json();

            if (data.nodes) state.renderNodes = data.nodes;

            if(!state.connected) { 

                state.connected = true; 

                toast("Connected", "Hub Server is online", "success", "hub-status"); 

                if (typeof window.checkBaseTemplates === "function") window.checkBaseTemplates(); 

            }

            window.updateSystemNodesUI();

        } else throw new Error();

    } catch(e) { 

        if(state.connected) { 

            state.connected = false; 

            window.updateSystemNodesUI();

            toast("Offline", "Hub Server disconnected!", "error", "hub-status"); 

        } 

    }

    

    // Check WhisperX status

    try {

        let isExtOnline = false;

        let hasCuda = false;

        try {

            const statusRes = await fetch("/api/whisper/status");

            if (statusRes.ok) {

                const statusData = await statusRes.json();

                if (statusData.online === true) {

                    isExtOnline = true;

                    hasCuda = statusData.cuda === true;

                }

            }

        } catch(eExt) {}



        const wPill = $("#wConnPill");

        const wText = $("#wConnText");



        if (isExtOnline) {

            window.isWhisperXStarting = false;

            if (window.whisperXPollingInterval) {

                clearInterval(window.whisperXPollingInterval);

                window.whisperXPollingInterval = null;

            }

            state.wConnected = true;

            if (wPill) wPill.className = "pill good";

            if (wText) wText.textContent = hasCuda ? "WhisperX: GPU ✓" : "WhisperX: Online (8002)";

            updateWhisperXCard(true, hasCuda);

        } else {

            // Jei šiuo metu vyksta paleidimas, neperrašome būsenos atgal į Offline

            if (window.isWhisperXStarting) {

                if (wPill) wPill.className = "pill warn";

                if (wText) wText.textContent = "WhisperX: Paleidžiama...";

                return;

            }

            state.wConnected = false;

            if (wPill) wPill.className = "pill bad";

            if (wText) wText.textContent = "WhisperX: Offline";

            updateWhisperXCard(false, false);

        }

    } catch(e) {

        if (!window.isWhisperXStarting) {

            state.wConnected = false;

            updateWhisperXCard(false, false);

        }

    }

}, 3500);



// ============================================================================

// WHISPERX STATUS CARD SYNC & CONTROLS

// ============================================================================

window.isWhisperXStarting = false;

window.whisperXPollingInterval = null;



function updateWhisperXCard(status, cuda) {

    const dot = document.getElementById("whisperxDot");

    const statusText = document.getElementById("whisperxStatusText");

    const statusSub = document.getElementById("whisperxStatusSub");

    const btnLaunch = document.getElementById("btnLaunchWhisperX");

    const btnStop = document.getElementById("btnStopWhisperX");

    const btnCheck = document.getElementById("btnCheckWhisperX");

    const btnIcon = document.getElementById("whisperxBtnIcon");

    const btnLabel = document.getElementById("whisperxBtnLabel");



    if (!dot) return;



    if (status === "starting" || window.isWhisperXStarting === true) {

        dot.style.background = "#f59e0b";

        dot.style.boxShadow = "0 0 14px rgba(245, 158, 11, 0.9)";

        if (statusText) statusText.innerHTML = '<span style="color:#f59e0b; font-weight:800;">WhisperX: Starting... ⏳</span>';

        if (statusSub) statusSub.textContent = "WhisperX engine loading in background (initializing Python and GPU Large-v3 model)...";

        if (btnLaunch) {

            btnLaunch.className = "btn text-xs";

            btnLaunch.style.cssText = "padding: 8px 16px; font-weight: 700; opacity: 0.75; cursor: not-allowed; gap: 8px; display: flex; align-items: center; background: rgba(245, 158, 11, 0.2); border: 1px solid #f59e0b; color: #fbbf24; pointer-events: none;";

            btnLaunch.disabled = true;

            if (btnIcon) btnIcon.innerHTML = '<span class="spin-anim">⏳</span>';

            if (btnLabel) btnLabel.textContent = "Starting in background...";

        }

        if (btnStop) btnStop.style.display = "inline-flex";

        if (btnCheck) {

            btnCheck.disabled = true;

            btnCheck.style.opacity = "0.5";

        }

        return;

    }



    if (status === true) {

        dot.style.background = "#10b981";

        dot.style.boxShadow = "0 0 0 4px rgba(16, 185, 129, 0.3)";

        if (statusText) statusText.innerHTML = cuda ? '<span style="color:#10b981; font-weight:800;">WhisperX: GPU Active ✓</span>' : '<span style="color:#10b981; font-weight:800;">WhisperX: Online (8002)</span>';

        if (statusSub) statusSub.textContent = cuda ? "WhisperX GPU engine ready for inference (127.0.0.1:8002). 🚀" : "WhisperX server running in background (127.0.0.1:8002).";

        if (btnLaunch) {

            btnLaunch.className = "btn text-xs";

            btnLaunch.style.cssText = "padding: 8px 14px; font-weight: 700; background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; color: #10b981; cursor: default; pointer-events: none;";

            if (btnIcon) btnIcon.textContent = "✓";

            if (btnLabel) btnLabel.textContent = "Online (8002)";

            btnLaunch.disabled = true;

        }

        if (btnStop) btnStop.style.display = "inline-flex";

        if (btnCheck) {

            btnCheck.disabled = false;

            btnCheck.style.opacity = "1";

        }

    } else {

        dot.style.background = "#ef4444";

        dot.style.boxShadow = "0 0 0 0 rgba(239,68,68,0.5)";

        if (statusText) statusText.innerHTML = '<span style="color:#f87171; font-weight:800;">WhisperX: Offline</span>';

        if (statusSub) statusSub.textContent = "Click '▶ Launch WhisperX' or start alignment (launches automatically).";

        if (btnLaunch) {

            btnLaunch.className = "btn primary";

            btnLaunch.style.cssText = "padding: 8px 16px; font-weight: 800; font-size: 13px; gap: 6px; display: flex; align-items: center; opacity: 1; cursor: pointer; pointer-events: auto;";

            if (btnIcon) btnIcon.textContent = "▶";

            if (btnLabel) btnLabel.textContent = "Launch WhisperX";

            btnLaunch.disabled = false;

        }

        if (btnStop) btnStop.style.display = "none";

        if (btnCheck) {

            btnCheck.disabled = false;

            btnCheck.style.opacity = "1";

        }

    }

}



// ============================================================================

// WHISPERX LAUNCH / STOP CONTROLS

// ============================================================================

window.launchWhisperX = async function() {
    if (typeof window.isGlobalDemoMode === 'function' && window.isGlobalDemoMode()) {
        const dot = document.getElementById("whisperxDot");
        const statusText = document.getElementById("whisperxStatusText");
        const statusSub = document.getElementById("whisperxStatusSub");
        const btnIcon = document.getElementById("whisperxBtnIcon");
        const btnLabel = document.getElementById("whisperxBtnLabel");
        const btnStop = document.getElementById("btnStopWhisperX");
        const wText = document.getElementById("wConnText");
        const wPill = document.getElementById("wConnPill");

        if (dot) dot.style.background = "#f59e0b";
        if (statusText) statusText.innerHTML = '<span style="color:#f59e0b; font-weight:800;">WhisperX: Starting GPU Engine... ⏳</span>';
        if (statusSub) statusSub.textContent = "Initializing WhisperX Large-v3 container in GPU VRAM...";
        if (btnIcon) btnIcon.innerHTML = '<span class="spin-anim">⏳</span>';
        if (btnLabel) btnLabel.textContent = "Launching...";

        await new Promise(r => setTimeout(r, 550));

        const timeStr = new Date().toLocaleTimeString();
        if (dot) {
            dot.style.background = "#10b981";
            dot.style.boxShadow = "0 0 10px rgba(16,185,129,0.5)";
        }
        if (statusText) statusText.innerHTML = '<span style="color:#10b981; font-weight:800;">WhisperX: GPU Active ✓</span>';
        if (statusSub) statusSub.textContent = `WhisperX GPU Large-v3 engine ready for inference (127.0.0.1:8002) • Synced at ${timeStr}`;
        if (btnIcon) btnIcon.textContent = "✓";
        if (btnLabel) btnLabel.textContent = "WhisperX Online";
        if (btnStop) btnStop.style.display = "inline-flex";
        if (wText) wText.textContent = "WhisperX: GPU ✓";
        if (wPill) {
            wPill.className = "pill good";
            wPill.style.background = "rgba(16, 185, 129, 0.15)";
            wPill.style.borderColor = "rgba(16, 185, 129, 0.4)";
            wPill.style.color = "#10b981";
        }
        return;
    }

    // Apsauga nuo pakartotinio paspaudimo (double-click protection)

    if (window.isWhisperXStarting) {

        if (typeof toast === "function") toast("WhisperX jau startuoja", "Serveris kraunamas fone, prašome palaukti...", "info");

        return;

    }



    window.isWhisperXStarting = true;

    updateWhisperXCard("starting", false);



    const wPill = $("#wConnPill");

    const wText = $("#wConnText");

    if (wPill) wPill.className = "pill warn";

    if (wText) wText.textContent = "WhisperX: Paleidžiama...";



    if (typeof toast === "function") toast("WhisperX", "Paleidžiamas WhisperX serveris... Prašome palaukti kelias sekundes.", "info");



    // Aktyvus poller tikrinimas kas 1.5s

    if (window.whisperXPollingInterval) clearInterval(window.whisperXPollingInterval);

    let pollCount = 0;

    const maxPolls = 40; // ~60 sek.



    window.whisperXPollingInterval = setInterval(async () => {

        pollCount++;

        try {

            const checkRes = await fetch("/api/whisper/status");

            if (checkRes.ok) {

                const sData = await checkRes.json();

                if (sData.online === true) {

                    clearInterval(window.whisperXPollingInterval);

                    window.whisperXPollingInterval = null;

                    window.isWhisperXStarting = false;

                    state.wConnected = true;

                    const hasCuda = sData.cuda === true;

                    updateWhisperXCard(true, hasCuda);

                    if (wPill) wPill.className = "pill good";

                    if (wText) wText.textContent = hasCuda ? "WhisperX: GPU ✓" : "WhisperX: Online";

                    if (typeof toast === "function") toast("WhisperX Online! 🚀", "WhisperX serveris paruoštas darbui.", hasCuda ? "success" : "info");

                    return;

                }

            }

        } catch(e) {}



        const statusSub = document.getElementById("whisperxStatusSub");

        if (statusSub && window.isWhisperXStarting) {

            statusSub.textContent = `WhisperX serveris kraunasi fone (${Math.round(pollCount * 1.5)}s)... Prašome palaukti.`;

        }



        if (pollCount >= maxPolls) {

            clearInterval(window.whisperXPollingInterval);

            window.whisperXPollingInterval = null;

            window.isWhisperXStarting = false;

            updateWhisperXCard(false, false);

            if (wPill) wPill.className = "pill bad";

            if (wText) wText.textContent = "WhisperX: Offline";

            if (typeof toast === "function") toast("Laikas baigėsi", "WhisperX serveris per ilgai neatsakė. Patikrinkite konsolę arba bandykite vėl.", "error");

        }

    }, 1500);



    try {

        const res = await fetch("/api/whisper/start", { method: "POST" });

        const data = await res.json();

        if (data.online || data.status === "success") {

            if (window.whisperXPollingInterval) {

                clearInterval(window.whisperXPollingInterval);

                window.whisperXPollingInterval = null;

            }

            window.isWhisperXStarting = false;

            state.wConnected = true;

            const hasCuda = data.cuda === true;

            updateWhisperXCard(true, hasCuda);

            if (wPill) wPill.className = "pill good";

            if (wText) wText.textContent = hasCuda ? "WhisperX: GPU ✓" : "WhisperX: Online";

            if (typeof toast === "function") toast("WhisperX Online! 🚀", data.message || "Serveris paruoštas.", hasCuda ? "success" : "info");

        } else if (data.status === "starting") {

            // Serverio procesas paleistas, aktyvus poller toliau stebi, kada uvicorn pradės atsakyti

            console.log("WhisperX process launched successfully, awaiting initialization...");

        } else {

            throw new Error(data.detail || data.message || "Nepavyko paleisti.");

        }

    } catch(err) {

        console.error("WhisperX launch error:", err);

        setTimeout(() => {

            if (window.isWhisperXStarting && !state.wConnected) {

                if (window.whisperXPollingInterval) {

                    clearInterval(window.whisperXPollingInterval);

                    window.whisperXPollingInterval = null;

                }

                window.isWhisperXStarting = false;

                updateWhisperXCard(false, false);

                if (typeof toast === "function") toast("Klaida", `Nepavyko paleisti WhisperX: ${err.message}`, "error");

            }

        }, 5000);

    }

};



window.stopWhisperX = async function() {

    if (window.whisperXPollingInterval) {

        clearInterval(window.whisperXPollingInterval);

        window.whisperXPollingInterval = null;

    }

    window.isWhisperXStarting = false;

    if (typeof toast === "function") toast("WhisperX", "Sustabdomas WhisperX serveris...", "info");

    try {

        await fetch("/api/whisper/stop", { method: "POST" });

        state.wConnected = false;

        updateWhisperXCard(false, false);

        const wPill = $("#wConnPill");

        const wText = $("#wConnText");

        if (wPill) wPill.className = "pill bad";

        if (wText) wText.textContent = "WhisperX: Offline";

        if (typeof toast === "function") toast("WhisperX sustabdytas", "Serveris sėkmingai išjungtas.", "info");

    } catch(err) {

        if (typeof toast === "function") toast("Klaida", `Nepavyko sustabdyti: ${err.message}`, "error");

    }

};



window.checkWhisperXStatus = async function() {
    if (typeof window.isGlobalDemoMode === 'function' && window.isGlobalDemoMode()) {
        const timeStr = new Date().toLocaleTimeString();
        const dot = document.getElementById("whisperxDot");
        const statusText = document.getElementById("whisperxStatusText");
        const statusSub = document.getElementById("whisperxStatusSub");
        const wText = document.getElementById("wConnText");
        const wPill = document.getElementById("wConnPill");
        if (dot) {
            dot.style.background = "#10b981";
            dot.style.boxShadow = "0 0 10px rgba(16,185,129,0.5)";
        }
        if (statusText) statusText.innerHTML = '<span style="color:#10b981; font-weight:800;">WhisperX: GPU Active ✓</span>';
        if (statusSub) statusSub.textContent = `WhisperX GPU Large-v3 engine responsive (127.0.0.1:8002) • Ping OK at ${timeStr}`;
        if (wText) wText.textContent = "WhisperX: GPU ✓";
        if (wPill) {
            wPill.className = "pill good";
            wPill.style.background = "rgba(16, 185, 129, 0.15)";
            wPill.style.borderColor = "rgba(16, 185, 129, 0.4)";
            wPill.style.color = "#10b981";
        }
        return;
    }

    const statusSub = document.getElementById("whisperxStatusSub");

    if (statusSub) statusSub.textContent = "Tikrinamas ryšys...";

    try {

        const res = await fetch("/api/whisper/status");

        const data = await res.json();

        if (data.online) {

            if (window.whisperXPollingInterval) {

                clearInterval(window.whisperXPollingInterval);

                window.whisperXPollingInterval = null;

            }

            window.isWhisperXStarting = false;

            state.wConnected = true;

            updateWhisperXCard(true, data.cuda);

            const wPill = $("#wConnPill");

            const wText = $("#wConnText");

            if (wPill) wPill.className = "pill good";

            if (wText) wText.textContent = data.cuda ? "WhisperX: GPU ✓" : "WhisperX: Online";

            if (typeof toast === "function") toast("WhisperX Online ✓", data.cuda ? "Serveris veikia su GPU!" : "Serveris veikia (CPU).", "success");

        } else {

            if (!window.isWhisperXStarting) {

                state.wConnected = false;

                updateWhisperXCard(false, false);

                if (typeof toast === "function") toast("WhisperX Offline", "Serveris neprieinamas. Paspausk ▶ Paleisti.", "warn");

            } else {

                if (typeof toast === "function") toast("WhisperX kraunasi...", "Serveris dar startuoja, prašome palaukti kelias sekundes.", "info");

            }

        }

    } catch(err) {

        if (!window.isWhisperXStarting) {

            updateWhisperXCard(false, false);

            if (typeof toast === "function") toast("Klaida", "Nepavyko patikrinti WhisperX statuso.", "error");

        }

    }

};