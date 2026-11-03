// ============================================================================
// POST-PROD & IMPORT LOGIC (frontend/js/import.js)
// ============================================================================

window.openExternalImportModal = function() {
    const m = document.getElementById("modalExternalImport");
    if (m) m.classList.add("show");
};

window.closeExternalImportModal = function() {
    const m = document.getElementById("modalExternalImport");
    if (m) m.classList.remove("show");
    if (typeof window.triggerUIRefresh === 'function') {
        window.triggerUIRefresh('images');
    } else if (typeof window.renderImages === 'function') {
        window.renderImages();
    }
    if (typeof window.renderReview === 'function') window.renderReview();
    if (typeof window.renderWorkflow === 'function') window.renderWorkflow();
};

let importListenersAttached = false;
function initImportModule() {
    if (importListenersAttached) return;
    const dropzone = document.getElementById("importDropzone");
    const fileInput = document.getElementById("importFileInput");
    const logTbody = document.getElementById("importLogTbody");

    // Mode and Option Elements
    const modeSelect = document.getElementById("importModeSelect");
    const fallbackEmptyCheck = document.getElementById("importFallbackEmptyCheck");
    const onlyEmptyCheck = document.getElementById("importOnlyEmptyCheck");
    const setMainCheck = document.getElementById("importSetMainCheck");

    if (!dropzone || !fileInput || !logTbody) return;
    importListenersAttached = true;

    // APSAUGA: Saugiklis nuo dvigubo ar paralelinio failų apdorojimo vienu metu
    let isImporting = false;

    // --- Drag & Drop efektai su stopPropagation, kad globalūs skriptai neperimtų įvykio ---
    dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.style.background = "rgba(110, 168, 255, 0.15)";
        dropzone.style.borderColor = "var(--accent)";
    });

    dropzone.addEventListener("dragleave", (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.style.background = "rgba(110, 168, 255, 0.05)";
        dropzone.style.borderColor = "var(--accent)";
    });

    dropzone.addEventListener("click", (e) => {
        if (isImporting) return;
        if (e.target !== fileInput) fileInput.click();
    });

    dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.style.background = "rgba(110, 168, 255, 0.05)";
        dropzone.style.borderColor = "var(--accent)";
        
        if (isImporting) return;
        
        const files = e.dataTransfer.files;
        if (files.length > 0) window.handleImportFiles(files);
    });

    fileInput.addEventListener("change", (e) => {
        if (isImporting) return;
        
        const files = e.target.files;
        if (files.length > 0) window.handleImportFiles(files);
        fileInput.value = ""; 
    });

    // --- Pagalbinė funkcija: ar scenoje jau yra atliktas vaizdas? ---
    function isSceneEmpty(proj, sceneId) {
        if (!proj) return true;
        if (!proj.outputs) return true;
        const out = proj.outputs.find(o => o.sceneId === sceneId || String(o.sceneId).toLowerCase() === String(sceneId).toLowerCase());
        if (!out) return true;
        if (!out.variations || out.variations.length === 0) return true;
        return !out.variations.some(v => v && v.status === 'done' && v.url);
    }

    // --- Pagalbinė funkcija: ištraukti scenos ID iš failo pavadinimo pagal įvairius šablonus ---
    function extractSceneIdFromFilename(filename, availableSceneIds) {
        if (!filename || !availableSceneIds || availableSceneIds.length === 0) return null;
        const nameWithoutExt = filename.replace(/\.[^/.]+$/, "").trim();

        const sMatch = nameWithoutExt.match(/(?:^|[-_\s\[\(])([sS]\d+)(?:[-_\s\]\.\)]|$)/i);
        if (sMatch) {
            const num = parseInt(sMatch[1].replace(/^[sS]/i, ""), 10);
            const candidate = `S${num}`;
            const found = availableSceneIds.find(id => id.toUpperCase() === candidate.toUpperCase() || parseInt(id.replace(/^[sS]/i, ""), 10) === num);
            if (found) return found;
        }

        const sceneWordMatch = nameWithoutExt.match(/(?:^|[-_\s\[\(])scene[-_\s]?(\d+)(?:[-_\s\]\.\)]|$)/i);
        if (sceneWordMatch) {
            const num = parseInt(sceneWordMatch[1], 10);
            const candidate = `S${num}`;
            const found = availableSceneIds.find(id => id.toUpperCase() === candidate.toUpperCase() || parseInt(id.replace(/^[sS]/i, ""), 10) === num);
            if (found) return found;
        }

        const numPrefixMatch = nameWithoutExt.match(/^(\d+)(?:[-_\s\.]|$)/);
        if (numPrefixMatch) {
            const num = parseInt(numPrefixMatch[1], 10);
            const candidate = `S${num}`;
            const found = availableSceneIds.find(id => id.toUpperCase() === candidate.toUpperCase() || parseInt(id.replace(/^[sS]/i, ""), 10) === num);
            if (found) return found;
        }

        const genericMatch = nameWithoutExt.match(/(?:img|image|frame|shot|pic|photo)[-_\s]?\(?(\d+)\)?/i);
        if (genericMatch) {
            const num = parseInt(genericMatch[1], 10);
            const candidate = `S${num}`;
            const found = availableSceneIds.find(id => id.toUpperCase() === candidate.toUpperCase() || parseInt(id.replace(/^[sS]/i, ""), 10) === num);
            if (found) return found;
        }

        return null;
    }

    // --- Pagrindinė importavimo funkcija ---
    window.handleImportFiles = async function(files) {
        if (isImporting) return;
        
        const proj = window.getProj();
        if (!proj) return toast("Error", "No active project found.", "error");

        isImporting = true;

        if (logTbody.querySelector("td[colspan]")) {
            logTbody.innerHTML = "";
        }

        const filesArray = Array.from(files);
        filesArray.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

        let successCount = 0;

        const importMode = modeSelect ? modeSelect.value : "smart_match";
        const fallbackEmpty = fallbackEmptyCheck ? fallbackEmptyCheck.checked : true;
        const onlyEmpty = onlyEmptyCheck ? onlyEmptyCheck.checked : false;
        const setAsMain = setMainCheck ? setMainCheck.checked : true;

        if (!proj.outputs) proj.outputs = [];
        if (!proj.scenes) proj.scenes = [];

        let allScenes = proj.scenes && proj.scenes.length > 0 ? proj.scenes : [];
        if (allScenes.length === 0 && proj.outputs.length > 0) {
            allScenes = proj.outputs.map(o => ({ id: o.sceneId, name: o.sceneId }));
        }

        allScenes.forEach(s => {
            const scId = s.id || s;
            if (!proj.outputs.some(o => o.sceneId === scId)) {
                proj.outputs.push({ sceneId: scId, variations: [], mainId: null });
            }
        });

        const allSceneIds = allScenes.map(s => s.id || s);
        const assignedScenesInSession = new Set();

        function getNextUnassignedEmptyScene() {
            for (const s of allScenes) {
                const scId = s.id || s;
                if (!assignedScenesInSession.has(scId) && isSceneEmpty(proj, scId)) {
                    return scId;
                }
            }
            return null;
        }

        const dropzoneChildren = Array.from(dropzone.children).filter(el => el.tagName !== 'INPUT');
        dropzoneChildren.forEach(el => el.classList.add('hidden'));

        const loadingDiv = document.createElement("div");
        loadingDiv.id = "importLoadingTemp";
        loadingDiv.innerHTML = `<div style="font-size: 40px; margin-bottom: 10px; opacity: 0.8;" class="pulse-text">⏳</div>
                              <h3 style="margin: 0 0 5px 0; color: var(--accent);">Processing ${filesArray.length} file(s)...</h3>
                              <div class="text-xs text-muted">Please wait while files are being uploaded to Vault</div>`;
        dropzone.appendChild(loadingDiv);

        try {
            for (let i = 0; i < filesArray.length; i++) {
                const file = filesArray[i];
                const originalName = file.name;
                
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td class="mono text-xs">${escapeHtml(originalName)}</td>
                    <td class="text-center text-muted">⏳ Analyzing...</td>
                    <td class="text-muted pulse-text">Uploading to Vault...</td>
                `;
                logTbody.prepend(tr);

                let targetSceneId = null;
                let assignReason = "";

                if (importMode === "sequential_all") {
                    if (i < allScenes.length) {
                        targetSceneId = allScenes[i].id || allScenes[i];
                        assignReason = `(Sequential #${i + 1})`;
                    }
                } else if (importMode === "fill_empty") {
                    const emptyScId = getNextUnassignedEmptyScene();
                    if (emptyScId) {
                        targetSceneId = emptyScId;
                        assignReason = "(Empty Scene Fill)";
                    }
                } else {
                    const detected = extractSceneIdFromFilename(originalName, allSceneIds);
                    if (detected) {
                        targetSceneId = detected;
                        assignReason = "(Detected)";
                    } else if (fallbackEmpty) {
                        const emptyScId = getNextUnassignedEmptyScene();
                        if (emptyScId) {
                            targetSceneId = emptyScId;
                            assignReason = "(Empty Fallback)";
                        }
                    }
                }

                const tdScene = tr.cells[1];

                if (targetSceneId && onlyEmpty && !isSceneEmpty(proj, targetSceneId)) {
                    tdScene.innerHTML = `<span class="badge warn">${targetSceneId}</span>`;
                    tr.cells[2].innerHTML = `<span style="color: var(--warn)">⚠️ Skipped (Scene already has image & 'Only Empty' is ON)</span>`;
                    tr.cells[2].classList.remove('pulse-text');
                    continue;
                }

                if (targetSceneId) {
                    assignedScenesInSession.add(targetSceneId);
                    tdScene.innerHTML = `<span class="badge ready">${targetSceneId}</span> <span class="text-xs text-muted">${assignReason}</span>`;
                } else {
                    tdScene.innerHTML = `<span class="badge bad">NOT FOUND</span>`;
                    tr.cells[2].innerHTML = `<span style="color: var(--bad)">❌ Skipped (No matching scene or no empty scenes left)</span>`;
                    tr.cells[2].classList.remove('pulse-text');
                    continue; 
                }

                try {
                    const formData = new FormData();
                    const safeOriginal = originalName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
                    const safeFileName = `${targetSceneId}_imported_${Date.now()}_${safeOriginal}`;
                    const newFile = new File([file], safeFileName, { type: file.type });
                    
                    formData.append("file", newFile); 

                    const upRes = await fetch("/api/upload_vault", { 
                        method: "POST", 
                        body: formData 
                    });

                    if (!upRes.ok) throw new Error("Failed to save to Vault API");

                    const responseData = await upRes.json().catch(() => ({}));
                    const localUrl = responseData.url || `/vault/${safeFileName}`;

                    let out = proj.outputs.find(o => o.sceneId === targetSceneId);
                    if (!out) {
                        out = { sceneId: targetSceneId, variations: [], mainId: null };
                        proj.outputs.push(out);
                    }
                    if (!out.variations) out.variations = [];

                    const targetSc = proj.scenes ? proj.scenes.find(s => s.id === targetSceneId || String(s.id).toLowerCase() === String(targetSceneId).toLowerCase()) : null;
                    const isKin = targetSc && (targetSc.isKinetic || targetSc.is_kinetic || (typeof window.isKineticTextScene === 'function' && window.isKineticTextScene(targetSc)));
                    if (targetSc && isKin) {
                        targetSc.isKinetic = true;
                        targetSc.bgMedia = localUrl;
                        if (!proj.kineticScenes) proj.kineticScenes = [];
                        let kSc = proj.kineticScenes.find(k => String(k.id) === String(targetSceneId) || String(k.id).toLowerCase() === String(targetSceneId).toLowerCase());
                        if (!kSc) {
                            kSc = {
                                id: String(targetSceneId),
                                text1: targetSc.text || targetSc.prompt || `Scene ${targetSceneId}`,
                                text2: "",
                                effect: "wiggly_sketch",
                                font: "'Impact', sans-serif",
                                align: "center",
                                weight: "bold",
                                textColor: "#ffffff",
                                bgColor: "#000000",
                                bgMedia: localUrl,
                                bgMediaDim: 0.4,
                                bgMediaOpacity: 1.0,
                                bgMediaBlur: 0,
                                duration: 4,
                                fps: 30,
                                autoFit: true
                            };
                            proj.kineticScenes.push(kSc);
                        } else {
                            kSc.bgMedia = localUrl;
                            if (kSc.bgMediaOpacity === undefined) kSc.bgMediaOpacity = 1.0;
                            if (kSc.bgMediaBlur === undefined) kSc.bgMediaBlur = 0;
                        }
                    }

                    // Išmatuojame tikruosius importuoto vaizdo matmenis
                    let imgW = null;
                    let imgH = null;
                    try {
                        const dims = await new Promise((resolve) => {
                            const img = new Image();
                            const blobUrl = URL.createObjectURL(file);
                            img.onload = () => {
                                const w = img.naturalWidth || img.width;
                                const h = img.naturalHeight || img.height;
                                URL.revokeObjectURL(blobUrl);
                                resolve({ w, h });
                            };
                            img.onerror = () => {
                                URL.revokeObjectURL(blobUrl);
                                resolve(null);
                            };
                            img.src = blobUrl;
                        });
                        if (dims && dims.w && dims.h) {
                            imgW = dims.w;
                            imgH = dims.h;
                        }
                    } catch (eDim) {
                        console.warn("[Import] Failed to measure image dimensions:", eDim);
                    }

                    const globals = proj.globals || { w: 1920, h: 1080, steps: 4, cfg: 1.0 };
                    const varId = 'var_' + Date.now() + Math.floor(Math.random() * 1000);
                    
                    const finalW = imgW || (targetSc ? (targetSc.w || globals.w || 1920) : (globals.w || 1920));
                    const finalH = imgH || (targetSc ? (targetSc.h || globals.h || 1080) : (globals.h || 1080));

                    const newVariation = {
                        id: varId,
                        url: localUrl, 
                        status: 'done',
                        createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
                        rating: setAsMain ? 'good' : 'unlisted',
                        wfMode: 'Imported Vault',
                        params: {
                            prompt: targetSc ? (targetSc.prompt || targetSc.text || '') : '',
                            negative: targetSc ? (targetSc.negative || '') : '',
                            refA: targetSc ? (targetSc.refA || '') : '',
                            refB: targetSc ? (targetSc.refB || '') : '',
                            refC: targetSc ? (targetSc.refC || '') : '',
                            w: finalW,
                            h: finalH,
                            steps: targetSc ? (targetSc.steps || globals.steps || 4) : (globals.steps || 4),
                            cfg: targetSc ? (targetSc.cfg || globals.cfg || 1.0) : (globals.cfg || 1.0),
                            seed: 'Imported'
                        } 
                    };

                    out.variations.push(newVariation);
                    if (setAsMain) {
                        out.mainId = varId;
                    }

                    // Sinchronizuojame laiko juostos statusą
                    if (proj.timeline) {
                        const tlItem = proj.timeline.find(t => t.id === targetSceneId || String(t.id).toLowerCase() === String(targetSceneId).toLowerCase());
                        if (tlItem) {
                            tlItem.status = 'MATCHED';
                        }
                    }

                    successCount++;
                    tr.cells[2].classList.remove('pulse-text');
                    tr.cells[2].innerHTML = `<span style="color: var(--good)">✅ Saved to Vault ${setAsMain ? '& Set as Main' : ''}</span>`;

                } catch (e) {
                    console.error(e);
                    tr.cells[2].classList.remove('pulse-text');
                    tr.cells[2].innerHTML = `<span style="color: var(--bad)">❌ Error: ${e.message}</span>`;
                }
            }
        } catch (globalErr) {
            console.error("Global import error:", globalErr);
        } finally {
            isImporting = false;
            
            const tempDiv = document.getElementById("importLoadingTemp");
            if (tempDiv) tempDiv.remove();
            dropzoneChildren.forEach(el => el.classList.remove('hidden'));
        }

        if (successCount > 0) {
            if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
            
            if (typeof window.triggerUIRefresh === 'function') {
                window.triggerUIRefresh('images');
            } else if (typeof window.renderImages === 'function') {
                window.renderImages();
            }
            
            if (typeof window.renderReview === 'function') window.renderReview();
            if (typeof window.syncWorkspaceScenesToKinetic === 'function') window.syncWorkspaceScenesToKinetic(true);
            if (typeof window.renderTimeline === 'function') window.renderTimeline();
            
            toast("Import Complete", `${successCount} image(s) successfully imported and assigned to scenes.`, "success");
        }
    };

    // Apsauga nuo HTML injection
    function escapeHtml(unsafe) {
        return String(unsafe)
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initImportModule);
} else {
    initImportModule();
}