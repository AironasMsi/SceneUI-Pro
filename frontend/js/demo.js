// ============================================================================
// DEMO SHOWCASE & SANDBOX ENGINE (frontend/js/demo.js)
// ============================================================================

(function() {
    let demoPresetsCache = null;

    // 1. Atidaryti / Uždaryti Demo Pasirinkimo Modalą
    window.openDemoModal = async function() {
        const modal = document.getElementById("modalDemoShowcase");
        if (!modal) return;
        
        modal.classList.add("show");
        await window.loadDemoPresetsUI();
    };

    window.closeDemoModal = function() {
        const modal = document.getElementById("modalDemoShowcase");
        if (modal) modal.classList.remove("show");
    };

    // 2. Užkrauti Presetų Sąrašą iš Serverio
    window.loadDemoPresetsUI = async function() {
        const container = document.getElementById("demoPresetsContainer");
        if (!container) return;

        container.innerHTML = `<div class="text-muted text-sm text-center" style="padding: 30px;">⏳ Kraunami demonstraciniai projektai...</div>`;

        try {
            const res = await fetch('/api/demo/presets');
            const data = await res.json();

            if (!res.ok || data.status !== "success" || !data.presets) {
                throw new Error("Failed to load demo presets list.");
            }

            demoPresetsCache = data.presets;
            renderDemoCards(data.presets);
        } catch (e) {
            container.innerHTML = `
                <div style="background: rgba(255, 68, 68, 0.1); border: 1px solid var(--bad); border-radius: 8px; padding: 20px; text-align: center;">
                    <div style="color: var(--bad); font-weight: bold; font-size: 14px;">Klaida kraunant demo paketus</div>
                    <div class="text-xs text-muted mt-2">${escapeHtml(e.message)}</div>
                    <button class="btn primary text-xs mt-3" onclick="window.loadDemoPresetsUI()">↻ Try Again</button>
                </div>
            `;
        }
    };

    function renderDemoCards(presets) {
        const container = document.getElementById("demoPresetsContainer");
        if (!container) return;

        let html = '';
        presets.forEach(p => {
            const badgeHtml = p.badge ? `<span style="background: linear-gradient(135deg, #00f0ff 0%, #7000ff 100%); color: #000; font-weight: 800; font-size: 10px; padding: 2px 8px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.5px;">${escapeHtml(p.badge)}</span>` : '';
            
            const tagsHtml = (p.tags || []).map(t => `<span class="badge" style="background: rgba(255,255,255,0.06); font-size: 10px; padding: 2px 6px;">${escapeHtml(t)}</span>`).join(' ');

            const actionBtnsHtml = `
                <div style="display: flex; gap: 4px;">
                    <button class="btn icon text-xs" style="padding: 3px 6px; font-size: 11px; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); border: 1px solid rgba(255,255,255,0.2);" onclick="event.stopPropagation(); window.editDemoPreset('${p.id}')" title="Redaguoti pavadinimą / aprašymą">✏️</button>
                    <button class="btn bad icon text-xs" style="padding: 3px 6px; font-size: 11px; background: rgba(255,50,50,0.6); backdrop-filter: blur(4px); border: 1px solid rgba(255,100,100,0.3);" onclick="event.stopPropagation(); window.deleteCustomDemoPreset('${p.id}')" title="Pašalinti demonstracinį paketą">🗑️</button>
                </div>
            `;

            html += `
                <div class="demo-card" style="background: var(--panel2); border: 1px solid ${p.is_custom ? 'rgba(0,255,170,0.3)' : 'var(--border)'}; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; transition: transform 0.2s, border-color 0.2s; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                    <div style="position: relative; height: 150px; background: #0c101c; overflow: hidden; display: flex; align-items: center; justify-content: center;">
                        <img src="${p.thumbnail}" alt="${escapeHtml(p.name)}" style="width: 100%; height: 100%; object-fit: cover; filter: brightness(0.85);" onerror="this.style.display='none'" />
                        <div style="position: absolute; inset: 0; background: linear-gradient(to top, var(--panel2) 0%, transparent 60%);"></div>
                        <div style="position: absolute; top: 10px; left: 10px; display: flex; gap: 6px; align-items: center;">
                            ${badgeHtml}
                        </div>
                        <div style="position: absolute; top: 10px; right: 10px;">
                            ${actionBtnsHtml}
                        </div>
                        <div style="position: absolute; bottom: 8px; right: 10px; background: rgba(0,0,0,0.75); backdrop-filter: blur(6px); padding: 2px 8px; border-radius: 6px; font-size: 11px; font-family: var(--mono); color: #00ffcc; border: 1px solid rgba(0,255,200,0.3);">
                            ⏱ ${p.duration}
                        </div>
                    </div>

                    <div style="padding: 14px; flex: 1; display: flex; flex-direction: column; justify-content: space-between; gap: 10px;">
                        <div>
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2px;">
                                <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: var(--text);">${escapeHtml(p.name)}</h3>
                            </div>
                            <div style="font-size: 11px; color: var(--accent); font-weight: 600; text-transform: uppercase; margin-bottom: 6px;">${escapeHtml(p.genre)}</div>
                            <p style="font-size: 11px; color: var(--muted); line-height: 1.35; margin: 0 0 8px 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${escapeHtml(p.description)}</p>
                            
                            <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">
                                ${tagsHtml}
                            </div>
                        </div>

                        <div style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 10px; display: flex; flex-direction: column; gap: 8px;">
                            <div style="font-size: 11px; color: var(--muted); font-family: var(--mono);">
                                🎬 <b>${p.scene_count}</b> Scenos &nbsp;•&nbsp; 👥 <b>${p.char_count}</b> Veikėjai
                            </div>

                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                                <button class="btn" style="font-weight: 700; font-size: 11px; padding: 7px 8px; background: rgba(0, 240, 255, 0.12); border: 1px solid rgba(0, 240, 255, 0.4); color: #00f0ff; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;" onclick="window.loadDemoPreset('${p.id}', true)" title="Užkrauti veikėjų ir scenų promptus be vaizdų (generavimui su ComfyUI)">
                                    🎯 Starter (ComfyUI)
                                </button>
                                <button class="btn primary" style="font-weight: 800; font-size: 11px; padding: 7px 8px; background: linear-gradient(135deg, #00f0ff 0%, #0077ff 100%); color: #000; border: none; border-radius: 6px; cursor: pointer; box-shadow: 0 2px 8px rgba(0, 240, 255, 0.25); display: flex; align-items: center; justify-content: center; gap: 4px;" onclick="window.loadDemoPreset('${p.id}', false)" title="Užkrauti visus paruoštus vaizdus tiesioginei video peržiūrai ir renderiui">
                                    🚀 Full Ready
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    // 3. Užkrauti Pasirinktą Presetą (Starter arba Full Rendered)
    window.loadDemoPreset = async function(presetId, starterOnly = false) {
        if (!presetId) return;

        const modal = document.getElementById("modalDemoShowcase");
        if (typeof window.toast === 'function') {
            window.toast("Loading Demo...", starterOnly ? "Paruošiami veikėjų ir scenų promptai ComfyUI generavimui..." : "Kraunami pilni vaizdai, garsas ir kinetinis tekstas...", "info");
        }

        try {
            const res = await fetch('/api/demo/load', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ preset_id: presetId, starter_only: starterOnly })
            });

            const data = await res.json();
            if (!res.ok || data.status !== "success" || !data.project) {
                throw new Error(data.message || "Serveris negalėjo suformuoti demo projekto.");
            }

            // Įrašome projektą į vietinę būseną
            data.project.sourceDemoPresetId = presetId;
            state.projects[data.project_id] = data.project;
            if (typeof window.switchProject === 'function') {
                await window.switchProject(data.project_id, { targetTab: 'audio', silent: true });
            } else {
                state.currentProjectId = data.project_id;
            }

            // Atnaujiname Voice & Audio laukus
            const audioFullScript = document.getElementById("audioFullScript");
            if (audioFullScript && data.project.sceneTextById) {
                audioFullScript.value = Object.values(data.project.sceneTextById).join("\n\n");
            }
            const fullAudioPlayer = document.getElementById("fullAudioPlayer");
            const fullAudioResultArea = document.getElementById("fullAudioResultArea");
            const btnDownloadFullAudio = document.getElementById("btnDownloadFullAudio");
            const selectedVoiceBadge = document.getElementById("selectedVoiceBadge");
            const btnGenerateFullAudio = document.getElementById("btnGenerateFullAudio");

            if (data.project.audioTrack) {
                if (fullAudioPlayer) fullAudioPlayer.src = data.project.audioTrack;
                if (btnDownloadFullAudio) btnDownloadFullAudio.href = data.project.audioTrack;
                if (fullAudioResultArea) fullAudioResultArea.classList.remove("hidden");
                if (selectedVoiceBadge) {
                    selectedVoiceBadge.textContent = "Using: Narrator Master Track";
                    selectedVoiceBadge.className = "badge good text-xs";
                }
                if (btnGenerateFullAudio) btnGenerateFullAudio.disabled = false;
            }

            // Atnaujiname Script & LLM laukus
            const rawScriptInput = document.getElementById("rawScriptInput");
            const llmJsonOutput = document.getElementById("llmJsonOutput");
            if (rawScriptInput && data.project.sceneTextById) {
                rawScriptInput.value = `# ${data.project.name}\n\n` + Object.entries(data.project.sceneTextById).map(([scId, txt]) => `[${scId}]: ${txt}`).join("\n");
            }
            if (llmJsonOutput) {
                const charRefs = data.project.charRefs || {};
                const scenes = data.project.scenes || [];
                llmJsonOutput.value = JSON.stringify({
                    characters: Object.keys(charRefs).map(k => {
                        const c = charRefs[k] || {};
                        const p = c.params || c || {};
                        return {
                            id: k,
                            base: c.template || "male",
                            prompt: p.prompt || ""
                        };
                    }),
                    scenes: scenes.map(s => ({
                        id: s.id,
                        name: s.name || s.id,
                        prompt: s.prompt || "",
                        refA: s.refA || "",
                        refB: s.refB || "",
                        isKinetic: s.isKinetic || false
                    }))
                }, null, 2);
            }

            // Uždaryti modalą
            if (modal) modal.classList.remove("show");

            // Perjungiame į atitinkamą kortelę
            const targetTab = starterOnly ? 'characters' : (data.project.lastActiveTab || 'render');
            const tabBtn = document.querySelector(`.nav-item[data-tab="${targetTab}"]`);
            if (tabBtn) tabBtn.click();

            if (typeof window.toast === 'function') {
                if (starterOnly) {
                    window.toast("🎯 Švarus Demo Paruoštas!", `${data.project.name}: eikite į 3. Characters arba 4. Images ir paspauskite 'Generate' su ComfyUI.`, "success");
                } else {
                    window.toast("🚀 Pilnas Demo Užkrautas!", `${data.project.name} paruoštas 9. Video Studio peržiūrai ir renderiui.`, "success");
                }
            }
        } catch (e) {
            if (typeof window.toast === 'function') {
                window.toast("Demo Klaida", e.message, "error");
            } else {
                alert("Demo klaida: " + e.message);
            }
        }
    };

    // 4. Save Esamą Projektą kaip Demonstracinį Paketą (Save as Demo Preset)
    let _activeSaveDemoTab = 'overwrite';

    window.switchSaveDemoTab = function(mode) {
        _activeSaveDemoTab = mode;
        const btnOverwrite = document.getElementById('tabSaveDemoOverwrite');
        const btnNew = document.getElementById('tabSaveDemoNew');
        const areaOverwrite = document.getElementById('saveDemoOverwriteArea');
        const areaNew = document.getElementById('saveDemoNewArea');

        if (mode === 'overwrite') {
            if (btnOverwrite) { btnOverwrite.style.background = 'var(--accent)'; btnOverwrite.style.color = '#000'; }
            if (btnNew) { btnNew.style.background = 'transparent'; btnNew.style.color = 'var(--text)'; }
            if (areaOverwrite) areaOverwrite.style.display = 'flex';
            if (areaNew) areaNew.style.display = 'none';
        } else {
            if (btnOverwrite) { btnOverwrite.style.background = 'transparent'; btnOverwrite.style.color = 'var(--text)'; }
            if (btnNew) { btnNew.style.background = 'var(--accent)'; btnNew.style.color = '#000'; }
            if (areaOverwrite) areaOverwrite.style.display = 'none';
            if (areaNew) areaNew.style.display = 'flex';
        }
    };

    window.closeSaveDemoModal = function() {
        const modal = document.getElementById('modalSaveAsDemo');
        if (modal) modal.classList.remove('show');
    };

    window.saveCurrentAsDemoPreset = async function() {
        const proj = window.getProj ? window.getProj() : null;
        if (!proj) {
            if (typeof window.toast === 'function') window.toast("Klaida", "Nėra atidaryto aktyvaus projekto.", "error");
            return;
        }

        const modal = document.getElementById('modalSaveAsDemo');
        if (!modal) return;

        // Load fresh presets if needed
        if (!demoPresetsCache || demoPresetsCache.length === 0) {
            try {
                const res = await fetch('/api/demo/presets');
                const data = await res.json();
                if (data && data.presets) demoPresetsCache = data.presets;
            } catch(e) {}
        }

        const select = document.getElementById('selectDemoOverwriteTarget');
        const hint = document.getElementById('saveDemoSourceHint');
        const nameInput = document.getElementById('inputSaveDemoName');
        const descInput = document.getElementById('inputSaveDemoDesc');
        const statsEl = document.getElementById('saveDemoSceneStats');

        const scenesCount = proj.scenes ? proj.scenes.length : 0;
        const charCount = proj.charRefs ? Object.keys(proj.charRefs).length : 0;
        if (statsEl) statsEl.textContent = `🎬 Scenes: ${scenesCount} • 👥 Veikėjai: ${charCount}`;

        // Populate dropdown
        if (select) {
            select.innerHTML = '';
            (demoPresetsCache || []).forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                const isSource = (proj.sourceDemoPresetId === p.id || proj.id === p.id || proj.id === `${p.id}_starter`);
                opt.textContent = `${p.name} (${p.genre || 'Preset'}) ${isSource ? '⭐ [Originalus Šaltinis]' : ''}`;
                if (isSource) opt.selected = true;
                select.appendChild(opt);
            });
        }

        const currentSourceId = proj.sourceDemoPresetId || (proj.id && proj.id.replace('_starter', ''));
        const matchedPreset = (demoPresetsCache || []).find(p => p.id === currentSourceId);

        if (matchedPreset) {
            if (hint) {
                hint.textContent = `⭐ Projektas sukurtas iš: "${matchedPreset.name}". Pasirinkus šį, atnaujinsite originalų šaltinį!`;
                hint.style.display = 'block';
            }
            if (descInput) descInput.value = matchedPreset.description || (proj.description || '');
        } else {
            if (hint) {
                hint.textContent = `Pasirinkite bet kurį esamą demo paketą, kurį norite perrašyti šio projekto duomenimis.`;
                hint.style.display = 'block';
            }
            if (descInput) descInput.value = proj.description || `Vartotojo sugeneruotas projektas su ${scenesCount} scenomis.`;
        }

        if (nameInput) {
            nameInput.value = proj.name ? `🌟 Demo: ${proj.name.replace(/^🎯\s*\[Starter\]\s*/i, '').replace(/^[🎬🌈👻🚀✨]\s*/i, '')}` : "🌟 Mano Naujas Demo Paketas";
        }

        window.switchSaveDemoTab('overwrite');
        modal.classList.add('show');
    };

    window.executeSaveAsDemoPreset = async function() {
        const proj = window.getProj ? window.getProj() : null;
        if (!proj) return;

        const btn = document.getElementById('btnConfirmSaveDemoPreset');
        const select = document.getElementById('selectDemoOverwriteTarget');
        const nameInput = document.getElementById('inputSaveDemoName');
        const genreInput = document.getElementById('inputSaveDemoGenre');
        const descInput = document.getElementById('inputSaveDemoDesc');

        let targetPresetId = 'new';
        let targetName = nameInput ? nameInput.value.trim() : proj.name;
        let targetDesc = descInput ? descInput.value.trim() : (proj.description || '');
        let targetGenre = genreInput ? genreInput.value.trim() : 'Custom AI Generation';

        if (_activeSaveDemoTab === 'overwrite') {
            targetPresetId = select ? select.value : 'new';
            const selectedPreset = (demoPresetsCache || []).find(p => p.id === targetPresetId);
            if (selectedPreset) {
                targetName = selectedPreset.name;
                if (!targetDesc) targetDesc = selectedPreset.description;
                if (selectedPreset.genre) targetGenre = selectedPreset.genre;
            }
        }

        if (!targetName) targetName = "🌟 Mano Demo Paketas";

        if (btn) { btn.disabled = true; btn.textContent = '⏳ Įrašoma...'; }

        try {
            const res = await fetch('/api/demo/save_as_preset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: proj.id,
                    project: proj,
                    target_preset_id: targetPresetId,
                    name: targetName,
                    description: targetDesc,
                    genre: targetGenre,
                    badge: _activeSaveDemoTab === 'overwrite' ? "💾 Atnaujintas Demo" : "✨ Naujas Demo"
                })
            });

            const data = await res.json();
            if (!res.ok || data.status !== "success") {
                throw new Error(data.message || "Nepavyko išsaugoti demo paketo.");
            }

            // Update sourceDemoPresetId on current project
            proj.sourceDemoPresetId = data.preset_id;

            if (typeof window.toast === 'function') {
                window.toast("💾 Išsaugota!", `Demo paketas "${targetName}" sėkmingai išsaugotas bibliotekoje!`, "success");
            }

            window.closeSaveDemoModal();

            // Refresh presets list
            await window.loadDemoPresetsUI();
        } catch (e) {
            alert("Klaida: " + e.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '💾 Save Paketą'; }
        }
    };

    // 5. Delete Vartotojo Išsaugotą arba Standartinį Demo Paketą
    window.deleteCustomDemoPreset = async function(presetId) {
        if (!presetId) return;
        if (!confirm("Ar tikrai norite pašalinti šį demonstracinį paketą iš sąrašo?")) return;

        try {
            const res = await fetch(`/api/demo/preset/${presetId}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok || data.status !== "success") {
                throw new Error(data.message || "Nepavyko pašalinti demo paketo.");
            }

            if (typeof window.toast === 'function') {
                window.toast("Pašalinta", "Demo paketas pašalintas iš bibliotekos.", "info");
            }
            await window.loadDemoPresetsUI();
        } catch (e) {
            if (typeof window.toast === 'function') window.toast("Klaida", e.message, "error");
        }
    };

    // 5.1 Redaguoti Demo Paketą (Pavadinimą ir Aprašymą)
    window.editDemoPreset = async function(presetId) {
        const preset = (demoPresetsCache || []).find(p => p.id === presetId);
        const curName = preset ? preset.name : "";
        const curDesc = preset ? preset.description : "";
        
        const newName = prompt("Naujas demonstracinio paketo pavadinimas:", curName);
        if (newName === null) return;
        const newDesc = prompt("Naujas demonstracinio paketo aprašymas:", curDesc);
        if (newDesc === null) return;

        try {
            const res = await fetch('/api/demo/edit_preset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: presetId, name: newName.trim(), description: newDesc.trim() })
            });
            const data = await res.json();
            if (!res.ok || data.status !== "success") {
                throw new Error(data.message || "Nepavyko atnaujinti demo paketo.");
            }

            if (typeof window.toast === 'function') {
                window.toast("Atnaujinta", `Demo paketas "${newName}" sėkmingai atnaujintas!`, "success");
            }
            await window.loadDemoPresetsUI();
        } catch (e) {
            alert("Klaida redaguojant demo paketą: " + e.message);
        }
    };

    // 6. Sukurti Individualų Demo Pagal Temą
    window.createCustomDemo = async function() {
        const themeInput = document.getElementById("customDemoTheme");
        const theme = themeInput ? themeInput.value.trim() : "";
        if (!theme) {
            alert("Prašome įvesti pageidaujamą temą (pvz., 'Space Station Zero' ar 'Samurai Cyberpunk').");
            return;
        }

        const modal = document.getElementById("modalDemoShowcase");
        if (typeof window.toast === 'function') {
            window.toast("Generuojamas Demo...", `Kuriama istorija: "${theme}"...`, "info");
        }

        try {
            const res = await fetch('/api/demo/create_custom', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ theme: theme })
            });

            const data = await res.json();
            if (!res.ok || data.status !== "success" || !data.project) {
                throw new Error(data.message || "Nepavyko sukurti individualaus demo.");
            }

            state.projects[data.project_id] = data.project;
            if (typeof window.switchProject === 'function') {
                await window.switchProject(data.project_id, { targetTab: 'audio', silent: true });
            } else {
                state.currentProjectId = data.project_id;
            }

            // Atnaujiname Voice & Audio ir Script laukus
            const audioFullScript = document.getElementById("audioFullScript");
            if (audioFullScript && data.project.sceneTextById) {
                audioFullScript.value = Object.values(data.project.sceneTextById).join("\n\n");
            }
            const fullAudioPlayer = document.getElementById("fullAudioPlayer");
            const fullAudioResultArea = document.getElementById("fullAudioResultArea");
            if (data.project.audioTrack && fullAudioPlayer) {
                fullAudioPlayer.src = data.project.audioTrack;
                if (fullAudioResultArea) fullAudioResultArea.classList.remove("hidden");
            }

            if (modal) modal.classList.remove("show");

            const tabBtn = document.querySelector(`.nav-item[data-tab="render"]`);
            if (tabBtn) tabBtn.click();

            if (typeof window.toast === 'function') {
                window.toast("✨ Sukurta!", `Demo "${theme}" sėkmingai sugeneruotas ir paruoštas.`, "success");
            }
        } catch (e) {
            alert("Klaida kuriant demo: " + e.message);
        }
    };

    // Mygtukų klausikliai
    document.addEventListener("DOMContentLoaded", () => {
        const btnOpenDemo = document.getElementById("btnOpenDemo");
        if (btnOpenDemo) {
            btnOpenDemo.addEventListener("click", window.openDemoModal);
        }

        const btnTopDemo = document.getElementById("btnTopDemo");
        if (btnTopDemo) {
            btnTopDemo.addEventListener("click", window.openDemoModal);
        }

        const btnSubmitCustomDemo = document.getElementById("btnSubmitCustomDemo");
        if (btnSubmitCustomDemo) {
            btnSubmitCustomDemo.addEventListener("click", window.createCustomDemo);
        }
    });

})();
