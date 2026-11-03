// ============================================================================
// SCENE VOICE CASTING STUDIO & AI VOICE DESIGNER (frontend/js/voice_casting.js)
// ============================================================================
// Valdo scenarijaus personažų balsų atpažinimą iš scenų / veikėjų JSON,
// AI Voice Design bandomųjų variacijų generavimą, perklausą, Main pasirinkimą,
// išsaugojimą į bendrą Voice Library ir automatinį sinchronizavimą su Chunks.

(function() {
    let currentVoiceRoles = [];
    let selectedRoleId = null;
    let sampleIndexByRole = {};

    // ------------------------------------------------------------------------
    // 1. DINAMINĖ PERSONAŽŲ SPALVŲ PALETĖ
    // ------------------------------------------------------------------------
    const PRESET_PALETTES = {
        "narrator": { color: "#10b981", bg: "rgba(16, 185, 129, 0.15)", border: "rgba(16, 185, 129, 0.45)" }, // Emerald
        "voice_narrator": { color: "#10b981", bg: "rgba(16, 185, 129, 0.15)", border: "rgba(16, 185, 129, 0.45)" },
        "ethan": { color: "#0284c7", bg: "rgba(2, 132, 199, 0.15)", border: "rgba(2, 132, 199, 0.45)" }, // Sky Blue
        "voice_ethan": { color: "#0284c7", bg: "rgba(2, 132, 199, 0.15)", border: "rgba(2, 132, 199, 0.45)" },
        "maya": { color: "#f59e0b", bg: "rgba(245, 158, 11, 0.15)", border: "rgba(245, 158, 11, 0.45)" }, // Amber
        "voice_maya": { color: "#f59e0b", bg: "rgba(245, 158, 11, 0.15)", border: "rgba(245, 158, 11, 0.45)" }
    };

    const DYNAMIC_PALETTES = [
        { color: "#38bdf8", bg: "rgba(56, 189, 248, 0.15)", border: "rgba(56, 189, 248, 0.45)" },
        { color: "#f97316", bg: "rgba(249, 115, 22, 0.15)", border: "rgba(249, 115, 22, 0.45)" },
        { color: "#a855f7", bg: "rgba(168, 85, 247, 0.15)", border: "rgba(168, 85, 247, 0.45)" },
        { color: "#ec4899", bg: "rgba(236, 72, 153, 0.15)", border: "rgba(236, 72, 153, 0.45)" },
        { color: "#06b6d4", bg: "rgba(6, 182, 212, 0.15)", border: "rgba(6, 182, 212, 0.45)" },
        { color: "#84cc16", bg: "rgba(132, 204, 22, 0.15)", border: "rgba(132, 204, 22, 0.45)" },
        { color: "#f43f5e", bg: "rgba(244, 63, 94, 0.15)", border: "rgba(244, 63, 94, 0.45)" },
        { color: "#eab308", bg: "rgba(234, 179, 8, 0.15)", border: "rgba(234, 179, 8, 0.45)" },
        { color: "#6366f1", bg: "rgba(99, 102, 241, 0.15)", border: "rgba(99, 102, 241, 0.45)" }
    ];

    window.getCharacterVoiceStyle = function(nameOrId) {
        if (!nameOrId) return DYNAMIC_PALETTES[0];
        const key = String(nameOrId).trim().toLowerCase();
        if (PRESET_PALETTES[key]) return PRESET_PALETTES[key];
        
        const cleanKey = key.replace(/^voice_/i, '').replace(/\.[^.]+$/, '');
        if (PRESET_PALETTES[cleanKey]) return PRESET_PALETTES[cleanKey];

        // Deterministinis hash
        let hash = 0;
        for (let i = 0; i < cleanKey.length; i++) {
            hash = (hash << 5) - hash + cleanKey.charCodeAt(i);
            hash |= 0;
        }
        const idx = Math.abs(hash) % DYNAMIC_PALETTES.length;
        return DYNAMIC_PALETTES[idx];
    };

    // ------------------------------------------------------------------------
    // 2. SCENŲ IR VEIKĖJŲ SKENAVIMAS (ROLES DETECTION)
    // ------------------------------------------------------------------------
    window.detectProjectVoiceRoles = function() {
        const proj = typeof window.getProj === 'function' ? window.getProj() : null;
        if (!proj) return [];

        if (!proj.characterVoices) proj.characterVoices = {};

        const scenes = proj.scenes || [];
        const charRefs = proj.charRefs || {};
        const availableVoices = Array.isArray(window.availableVoicesList) ? window.availableVoicesList : [];

        const rolesMap = {};

        function getOrCreateRole(voiceId, fallbackName) {
            const cleanId = (voiceId || "voice_narrator").trim();
            if (!rolesMap[cleanId]) {
                const normName = fallbackName || cleanId.replace(/^voice_/i, '').replace(/\.[^.]+$/, '').replace(/_/g, ' ');
                const capitalized = normName.charAt(0).toUpperCase() + normName.slice(1);
                
                rolesMap[cleanId] = {
                    id: cleanId,
                    name: capitalized,
                    gender: "male",
                    description: "",
                    sampleQuotes: [],
                    scenes: new Set(),
                    lineCount: 0,
                    assignedVoice: null,
                    variations: []
                };
            }
            return rolesMap[cleanId];
        }

        // A. Skenuojame visas scenas
        scenes.forEach((sc, scIdx) => {
            const scId = sc.id || `S${scIdx + 1}`;
            const scText = (proj.sceneTextById && proj.sceneTextById[sc.id]) || sc.text || sc.prompt || "";

            // Tikriname, ar scena turi dialogue masyvą
            if (sc.dialogue && Array.isArray(sc.dialogue) && sc.dialogue.length > 0) {
                sc.dialogue.forEach((turn, tIdx) => {
                    let voiceKey = turn.voice || "";
                    if (!voiceKey || voiceKey.toLowerCase() === "multi") {
                        if (tIdx === 0 && sc.refA) voiceKey = `voice_${sc.refA.replace(/\.[^.]+$/, '').toLowerCase()}`;
                        else if (tIdx === 1 && sc.refB) voiceKey = `voice_${sc.refB.replace(/\.[^.]+$/, '').toLowerCase()}`;
                        else voiceKey = (sc.voice && sc.voice.toLowerCase() !== "multi") ? sc.voice : "voice_narrator";
                    }
                    const charName = turn.character || turn.speaker || voiceKey.replace(/^voice_/i, '');
                    const role = getOrCreateRole(voiceKey, charName);
                    role.scenes.add(scId);
                    role.lineCount++;
                    if (turn.text && turn.text.trim()) {
                        role.sampleQuotes.push({ sceneId: scId, text: turn.text.trim() });
                    }
                });
            } else {
                // Vieno balso scena
                let voiceKey = sc.voice;
                let charName = sc.character;

                if (!voiceKey || voiceKey.toLowerCase() === "multi") {
                    if (sc.refA) {
                        const baseChar = String(sc.refA).replace(/\.[^.]+$/, '');
                        charName = baseChar;
                        voiceKey = `voice_${baseChar.toLowerCase()}`;
                    } else {
                        voiceKey = "voice_narrator";
                        charName = "Narrator";
                    }
                }

                const role = getOrCreateRole(voiceKey, charName);
                role.scenes.add(scId);
                role.lineCount++;
                if (scText && scText.trim()) {
                    role.sampleQuotes.push({ sceneId: scId, text: scText.trim() });
                }
            }
        });

        // B. Skenuojame Veikėjų biblioteką (proj.charRefs)
        Object.keys(charRefs).forEach(refKey => {
            const charObj = charRefs[refKey];
            if (!charObj) return;

            const baseRefName = refKey.replace(/\.[^.]+$/, '');
            const candidateVoiceId = charObj.voice_id || `voice_${baseRefName.toLowerCase()}`;

            let role = rolesMap[candidateVoiceId];
            if (!role) {
                // Galbūt atitinka pagal vardą
                const matchingKey = Object.keys(rolesMap).find(k => 
                    k.toLowerCase() === candidateVoiceId.toLowerCase() || 
                    k.toLowerCase().includes(baseRefName.toLowerCase())
                );
                if (matchingKey) role = rolesMap[matchingKey];
            }

            if (role) {
                if (charObj.voice_description && !role.description) {
                    role.description = charObj.voice_description;
                }
                if (charObj.gender) {
                    role.gender = charObj.gender;
                } else if (charObj.template) {
                    role.gender = (charObj.template === 'female' || charObj.template === 'teen') ? 'female' : 'male';
                }
            }
        });

        // C. Nustatome numatytus aprašymus ir patikriname esamus išsaugotus nustatymus
        const rolesList = Object.values(rolesMap).map(role => {
            role.scenes = Array.from(role.scenes);

            // Jei aprašymo nėra, suteikiame protingą numatytąjį pagal tipą
            if (!role.description) {
                if (role.id.toLowerCase().includes('narrator')) {
                    role.description = "Deep cinematic movie trailer voice, calm, atmospheric baritone";
                    role.gender = "male";
                } else if (role.gender === 'female' || role.name.toLowerCase().includes('maya')) {
                    role.description = "Sharp, intelligent female voice, 20s, clear diction, urgent tone";
                    role.gender = "female";
                } else {
                    role.description = "Gravelly, cautious male voice, 30s, low pitch, focused tone";
                    role.gender = "male";
                }
            }

            // Jei nėra pavyzdinio teksto iš scenų, duodame numatytąjį
            if (role.sampleQuotes.length === 0) {
                role.sampleQuotes.push({
                    sceneId: "Demo",
                    text: `Hello, this is ${role.name}. I am testing my character voice for this production.`
                });
            }

            // Sujungiame su proj.characterVoices (kad išsaugotos variacijos ir priskirti balsai nepradingtų)
            const saved = proj.characterVoices[role.id] || {};
            if (saved.assignedVoice) role.assignedVoice = saved.assignedVoice;
            if (saved.description) role.description = saved.description;
            if (saved.gender) role.gender = saved.gender;
            if (Array.isArray(saved.variations)) role.variations = saved.variations;

            // Automatinis Voice Library sutikrinimas (jei bibliotekoje yra to paties pavadinimo failas)
            if (!role.assignedVoice && availableVoices.length > 0) {
                const exactMatch = availableVoices.find(v => 
                    v.toLowerCase() === `${role.id.toLowerCase()}.wav` || 
                    v.toLowerCase() === `${role.id.toLowerCase()}.mp3` ||
                    v.toLowerCase() === `${role.name.toLowerCase()}.wav` ||
                    v.toLowerCase().startsWith(role.name.toLowerCase())
                );
                if (exactMatch) {
                    role.assignedVoice = exactMatch;
                }
            }

            // Įrašome atgal į proj.characterVoices
            proj.characterVoices[role.id] = {
                id: role.id,
                name: role.name,
                gender: role.gender,
                description: role.description,
                assignedVoice: role.assignedVoice,
                variations: role.variations
            };

            return role;
        });

        currentVoiceRoles = rolesList;
        return rolesList;
    };

    // ------------------------------------------------------------------------
    // 3. VOICE RESOLVER HELPER (Iškviečiamas iš audio.js / chunks)
    // ------------------------------------------------------------------------
    window.resolveVoiceForRole = function(voiceIdOrName) {
        if (!voiceIdOrName) return null;
        const proj = typeof window.getProj === 'function' ? window.getProj() : null;
        if (!proj || !proj.characterVoices) return null;

        const cleanKey = String(voiceIdOrName).trim();
        const saved = proj.characterVoices[cleanKey];
        if (saved && saved.assignedVoice) return saved.assignedVoice;

        // Galbūt sutampa be 'voice_'
        const altKey = `voice_${cleanKey.toLowerCase()}`;
        if (proj.characterVoices[altKey] && proj.characterVoices[altKey].assignedVoice) {
            return proj.characterVoices[altKey].assignedVoice;
        }

        return null;
    };

    // ------------------------------------------------------------------------
    // 4. CASTING STUDIO MODAL VALDYMAS
    // ------------------------------------------------------------------------
    window.openVoiceCastingStudio = async function() {
        const modal = document.getElementById("modalVoiceCastingStudio");
        if (!modal) return;

        // Užtikriname, kad turime naujausią Voice Library sąrašą
        if (!Array.isArray(window.availableVoicesList) || window.availableVoicesList.length === 0) {
            if (typeof window.loadVoices === 'function') {
                await window.loadVoices();
            } else {
                try {
                    const res = await fetch('/api/audio/voices');
                    if (res.ok) {
                        const data = await res.json();
                        window.availableVoicesList = data.voices || [];
                    }
                } catch(e) {}
            }
        }

        // 1. Sinchronizuojame GPU mazgą iš audioTargetNode
        const mainTargetNode = document.getElementById("audioTargetNode");
        const castingTargetNode = document.getElementById("castingTargetNode");
        if (mainTargetNode && castingTargetNode) {
            castingTargetNode.innerHTML = mainTargetNode.innerHTML;
            castingTargetNode.value = mainTargetNode.value;
        }

        // 2. Nuskenuojame vaidmenis
        const roles = window.detectProjectVoiceRoles();
        
        // 3. Atnaujiname skaičių badge'us
        const castingCountBadge = document.getElementById("voiceCastingCountBadge");
        if (castingCountBadge) castingCountBadge.textContent = roles.length;
        const castingTotalBadge = document.getElementById("castingTotalBadge");
        if (castingTotalBadge) castingTotalBadge.textContent = `${roles.length} Voices`;

        // 4. Užpildome Library pasirinkimo dropdown
        populateLibrarySelect();

        // 5. Atvaizduojame kairį sąrašą
        renderCastingRoster(roles);

        // 6. Pasirenkame pirmąjį arba esamą
        if (roles.length > 0) {
            const targetId = (selectedRoleId && roles.some(r => r.id === selectedRoleId)) ? selectedRoleId : roles[0].id;
            selectRole(targetId);
        } else {
            selectedRoleId = null;
            showEmptyState();
        }

        modal.classList.add("show");
    };

    window.closeVoiceCastingStudio = function() {
        stopLibraryAudio();
        const modal = document.getElementById("modalVoiceCastingStudio");
        if (modal) modal.classList.remove("show");
    };

    let currentPreviewAudio = null;
    let currentPreviewVoice = null;
    let currentActivePlayButton = null;
    let currentCastingMode = 'design'; // 'design' | 'clone'

    function stopLibraryAudio() {
        if (currentPreviewAudio) {
            try { currentPreviewAudio.pause(); } catch(e) {}
            currentPreviewAudio = null;
        }
        if (currentActivePlayButton) {
            currentActivePlayButton.innerHTML = '▶️ Perklausyti';
            currentActivePlayButton.style.background = 'rgba(59, 130, 246, 0.2)';
            currentActivePlayButton.style.color = '#93c5fd';
            currentActivePlayButton = null;
        }
        currentPreviewVoice = null;
    }

    function togglePlayLibraryVoice(voiceFilename, btnEl) {
        if (!voiceFilename) {
            alert("Please select a voice profile from the list first.");
            return;
        }
        if (currentPreviewAudio && currentPreviewVoice === voiceFilename) {
            if (!currentPreviewAudio.paused) {
                currentPreviewAudio.pause();
                btnEl.innerHTML = '▶️ Perklausyti';
                btnEl.style.background = 'rgba(59, 130, 246, 0.2)';
                btnEl.style.color = '#93c5fd';
                return;
            } else {
                currentPreviewAudio.play();
                btnEl.innerHTML = '⏸️ Sustabdyti';
                btnEl.style.background = 'rgba(239, 68, 68, 0.25)';
                btnEl.style.color = '#fca5a5';
                currentActivePlayButton = btnEl;
                return;
            }
        }

        stopLibraryAudio();

        const audioUrl = `/voices/${encodeURIComponent(voiceFilename)}`;
        const audio = new Audio(audioUrl);
        currentPreviewAudio = audio;
        currentPreviewVoice = voiceFilename;
        currentActivePlayButton = btnEl;

        btnEl.innerHTML = '⏳ Kraunama...';

        audio.addEventListener('play', () => {
            btnEl.innerHTML = '⏸️ Sustabdyti';
            btnEl.style.background = 'rgba(239, 68, 68, 0.25)';
            btnEl.style.color = '#fca5a5';
        });

        audio.addEventListener('ended', () => {
            stopLibraryAudio();
        });

        audio.addEventListener('pause', () => {
            if (currentPreviewAudio === audio && audio.currentTime !== audio.duration) {
                btnEl.innerHTML = '▶️ Perklausyti';
                btnEl.style.background = 'rgba(59, 130, 246, 0.2)';
                btnEl.style.color = '#93c5fd';
            }
        });

        audio.addEventListener('error', (e) => {
            console.warn('Audio playback error:', e);
            alert(`Failed to play voice '${voiceFilename}'. Please check file.`);
            stopLibraryAudio();
        });

        audio.play().catch(err => {
            console.warn('Audio play() failed:', err);
            stopLibraryAudio();
        });
    }

    function setCastingMode(mode) {
        currentCastingMode = mode;
        const btnDesign = document.getElementById("btnCastingModeDesign");
        const btnClone = document.getElementById("btnCastingModeClone");
        const contDesign = document.getElementById("castingModeDesignContainer");
        const contClone = document.getElementById("castingModeCloneContainer");
        const btnGen = document.getElementById("btnCastingGenerateTake");

        if (mode === 'clone') {
            if (btnDesign) {
                btnDesign.style.background = "transparent";
                btnDesign.style.color = "var(--text-muted)";
                btnDesign.style.border = "none";
            }
            if (btnClone) {
                btnClone.style.background = "var(--accent)";
                btnClone.style.color = "#fff";
                btnClone.style.border = "none";
            }
            if (contDesign) contDesign.classList.add("hidden");
            if (contClone) contClone.classList.remove("hidden");
            if (btnGen) {
                btnGen.innerHTML = '🎭 Sugeneruoti Take (Klonavimas)';
                btnGen.style.background = "linear-gradient(135deg, #3b82f6, #06b6d4)";
                btnGen.style.boxShadow = "0 4px 15px rgba(59, 130, 246, 0.35)";
            }
        } else {
            if (btnDesign) {
                btnDesign.style.background = "var(--accent)";
                btnDesign.style.color = "#fff";
                btnDesign.style.border = "none";
            }
            if (btnClone) {
                btnClone.style.background = "transparent";
                btnClone.style.color = "var(--text-muted)";
                btnClone.style.border = "none";
            }
            if (contDesign) contDesign.classList.remove("hidden");
            if (contClone) contClone.classList.add("hidden");
            if (btnGen) {
                btnGen.innerHTML = '✨ Sugeneruoti Take (Balso Dizainas)';
                btnGen.style.background = "linear-gradient(135deg, #a855f7, #3b82f6)";
                btnGen.style.boxShadow = "0 4px 15px rgba(168, 85, 247, 0.35)";
            }
        }
    }

    async function populateLibrarySelect() {
        const selLib = document.getElementById("castingLibraryVoiceSelect");
        const selClone = document.getElementById("castingCloneVoiceSelect");
        if (!selLib && !selClone) return;

        let available = Array.isArray(window.availableVoicesList) ? window.availableVoicesList : [];
        if (available.length === 0) {
            if (typeof window.loadVoices === 'function') {
                await window.loadVoices();
                available = Array.isArray(window.availableVoicesList) ? window.availableVoicesList : [];
            } else {
                try {
                    const res = await fetch('/api/audio/voices');
                    if (res.ok) {
                        const data = await res.json();
                        available = data.voices || [];
                        window.availableVoicesList = available;
                    }
                } catch(e) {}
            }
        }
        let html = '<option value="">-- Select Voice Profile --</option>';
        available.forEach(v => {
            const cleanName = v.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
            html += `<option value="${escapeHtml(v)}">🎤 ${escapeHtml(cleanName)} (${escapeHtml(v)})</option>`;
        });
        if (selLib) selLib.innerHTML = html;
        if (selClone) selClone.innerHTML = html;
    }

    function renderCastingRoster(roles) {
        const list = document.getElementById("castingRosterList");
        const summary = document.getElementById("castingRosterSummary");
        if (!list) return;

        list.innerHTML = "";

        const query = (document.getElementById("castingSearchInput")?.value || "").trim().toLowerCase();
        const filtered = roles.filter(r => 
            r.name.toLowerCase().includes(query) || 
            r.id.toLowerCase().includes(query) || 
            (r.assignedVoice && r.assignedVoice.toLowerCase().includes(query))
        );

        if (filtered.length === 0) {
            list.innerHTML = `<div class="text-muted text-xs text-center" style="padding: 20px;">No characters found.</div>`;
            if (summary) summary.innerHTML = `<span>Rasta: 0</span>`;
            return;
        }

        let readyCount = 0;

        filtered.forEach(role => {
            const style = window.getCharacterVoiceStyle(role.id);
            const isSelected = role.id === selectedRoleId;
            const hasAssigned = !!role.assignedVoice;
            const takeCount = role.variations ? role.variations.length : 0;
            if (hasAssigned) readyCount++;

            let statusBadge = '';
            if (hasAssigned) {
                statusBadge = `<span class="badge ready" style="font-size: 10px;" title="Priskirtas: ${escapeHtml(role.assignedVoice)}">🟢 ${escapeHtml(role.assignedVoice)}</span>`;
            } else if (takeCount > 0) {
                statusBadge = `<span class="badge warn" style="font-size: 10px;">🟡 ${takeCount} Takes</span>`;
            } else {
                statusBadge = `<span class="badge bad" style="font-size: 10px;">⚠️ Reikia sugeneruoti</span>`;
            }

            const card = document.createElement("div");
            card.className = `casting-roster-card ${isSelected ? 'active' : ''}`;
            card.style.cssText = `
                padding: 10px 12px;
                border-radius: 8px;
                background: ${isSelected ? 'rgba(168, 85, 247, 0.18)' : 'rgba(255, 255, 255, 0.03)'};
                border: 1px solid ${isSelected ? 'rgba(168, 85, 247, 0.6)' : 'rgba(255, 255, 255, 0.07)'};
                border-left: 4px solid ${style.color};
                cursor: pointer;
                transition: 0.15s ease;
                display: flex;
                flex-direction: column;
                gap: 5px;
            `;

            card.innerHTML = `
                <div class="flex justify-between items-center">
                    <strong style="color: ${isSelected ? '#fff' : '#e2e8f0'}; font-size: 13px;">${escapeHtml(role.name)}</strong>
                    ${statusBadge}
                </div>
                <div class="flex justify-between items-center text-xs text-muted" style="font-size: 11px;">
                    <span class="mono" style="opacity: 0.8;">${escapeHtml(role.id)}</span>
                    <span>${role.scenes.length} scen. / ${role.lineCount} replik.</span>
                </div>
            `;

            card.addEventListener("click", () => selectRole(role.id));
            list.appendChild(card);
        });

        if (summary) {
            summary.innerHTML = `
                <span>Total: <strong>${roles.length}</strong> Voices</span>
                <span style="color: #10b981;">🟢 Ready: ${readyCount} / ${roles.length}</span>
            `;
        }
    }

    function showEmptyState() {
        const empty = document.getElementById("castingEmptyState");
        const active = document.getElementById("castingActiveContent");
        if (empty) empty.classList.remove("hidden");
        if (active) active.classList.add("hidden");
    }

    function selectRole(roleId) {
        selectedRoleId = roleId;
        const role = currentVoiceRoles.find(r => r.id === roleId);
        if (!role) return showEmptyState();

        const empty = document.getElementById("castingEmptyState");
        const active = document.getElementById("castingActiveContent");
        if (empty) empty.classList.add("hidden");
        if (active) active.classList.remove("hidden");

        const style = window.getCharacterVoiceStyle(role.id);

        // Header
        const avatar = document.getElementById("castingRoleAvatar");
        if (avatar) {
            avatar.style.background = style.bg;
            avatar.style.borderColor = style.border;
            avatar.style.color = style.color;
            avatar.textContent = role.name.charAt(0).toUpperCase();
        }

        const nameEl = document.getElementById("castingRoleName");
        if (nameEl) nameEl.textContent = role.name;

        const idBadge = document.getElementById("castingRoleIdBadge");
        if (idBadge) idBadge.textContent = role.id;

        const genderBadge = document.getElementById("castingRoleGenderBadge");
        if (genderBadge) {
            genderBadge.textContent = (role.gender || "MALE").toUpperCase();
            genderBadge.className = `badge ${(role.gender || '').toLowerCase() === 'female' ? 'mode' : 'ready'}`;
        }

        const statsEl = document.getElementById("castingRoleStats");
        if (statsEl) {
            statsEl.innerHTML = `Scenos: <strong>${role.scenes.join(', ')}</strong> | Dialogo replikos: <strong>${role.lineCount}</strong>`;
        }

        // Library assign dropdown & clone select
        const libSel = document.getElementById("castingLibraryVoiceSelect");
        if (libSel) libSel.value = role.assignedVoice || "";
        const cloneSel = document.getElementById("castingCloneVoiceSelect");
        if (cloneSel) cloneSel.value = role.assignedVoice || "";

        // Active Voice Notice
        updateActiveVoiceBadge(role);

        // Inputs
        const promptTa = document.getElementById("castingVoicePrompt");
        if (promptTa) promptTa.value = role.description || "";

        // Sample text
        if (sampleIndexByRole[role.id] === undefined) sampleIndexByRole[role.id] = 0;
        updateSampleTextDisplay(role);

        // Variations List
        renderTakesList(role);

        // Re-highlight left list
        renderCastingRoster(currentVoiceRoles);
    }

    function updateActiveVoiceBadge(role) {
        const badge = document.getElementById("castingActiveVoiceBadge");
        if (!badge) return;
        if (role.assignedVoice) {
            badge.className = "badge ready";
            badge.textContent = `🟢 ${role.assignedVoice}`;
            badge.title = `Priskirtas failas: ${role.assignedVoice}`;
        } else {
            badge.className = "badge bad";
            badge.textContent = "No Voice ⚠️";
            badge.title = "Balsas dar nepriskirtas";
        }
    }

    function updateSampleTextDisplay(role) {
        const sampleTa = document.getElementById("castingSampleText");
        const sourceEl = document.getElementById("castingSampleSource");
        if (!sampleTa) return;

        const quotes = role.sampleQuotes || [];
        if (quotes.length === 0) {
            sampleTa.value = `Hello, this is ${role.name}. I am testing my new AI voice design.`;
            if (sourceEl) sourceEl.textContent = "Source: Default";
            return;
        }

        const idx = (sampleIndexByRole[role.id] || 0) % quotes.length;
        const q = quotes[idx];
        sampleTa.value = q.text;
        if (sourceEl) {
            sourceEl.textContent = `Source: Scene ${q.sceneId} (${idx + 1} of ${quotes.length})`;
        }
    }

    // ------------------------------------------------------------------------
    // 5. VARIACIJŲ (TAKES) RENDERERIS
    // ------------------------------------------------------------------------
    function renderTakesList(role) {
        const list = document.getElementById("castingTakesList");
        const countBadge = document.getElementById("castingTakesCount");
        if (!list) return;

        const vars = role.variations || [];
        if (countBadge) countBadge.textContent = vars.length;

        if (vars.length === 0) {
            list.innerHTML = `<div class="text-muted text-xs text-center" style="padding: 25px;">Dar nesugeneruota jokių bandomųjų variacijų šiam personažui. Paspauskite 'Sugeneruoti naują Take'.</div>`;
            return;
        }

        list.innerHTML = "";

        vars.forEach((v, vIdx) => {
            const isMain = v.isMain || (v.filename === role.assignedVoice) || (role.assignedVoice && v.url && v.url.includes(role.assignedVoice));
            const card = document.createElement("div");
            card.className = "casting-take-card";
            card.style.cssText = `
                padding: 10px 14px;
                border-radius: 8px;
                background: ${isMain ? 'rgba(16, 185, 129, 0.08)' : 'rgba(0, 0, 0, 0.35)'};
                border: 1px solid ${isMain ? 'rgba(16, 185, 129, 0.45)' : 'var(--border)'};
                display: flex;
                flex-direction: column;
                gap: 8px;
                transition: 0.15s ease;
            `;

            const modeBadge = (v.mode === 'clone' || v.voiceRef)
                ? `<span class="badge" style="font-size: 10px; background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4);">🎭 Klonuotas${v.voiceRef ? ` (${escapeHtml(v.voiceRef)})` : ''}</span>`
                : `<span class="badge" style="font-size: 10px; background: rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.4);">✨ Dizainas</span>`;

            card.innerHTML = `
                <div class="flex justify-between items-center" style="flex-wrap: wrap; gap: 8px;">
                    <div class="flex items-center" style="gap: 8px;">
                        <strong style="color: ${isMain ? '#10b981' : '#fff'}; font-size: 13px;">${escapeHtml(v.createdAt || `Take #${vIdx + 1}`)}</strong>
                        ${modeBadge}
                        ${v.duration ? `<span class="mono text-muted text-xs">(${v.duration}s)</span>` : ''}
                        ${isMain ? `<span class="badge ready" style="font-size: 10px; font-weight: 800;">⭐ MAIN BALSAS</span>` : ''}
                    </div>
                    <div class="flex items-center" style="gap: 6px;">
                        ${!isMain ? `
                            <button type="button" class="btn text-xs btn-set-main-take" style="background: rgba(168, 85, 247, 0.15); border-color: rgba(168, 85, 247, 0.4); color: #c084fc; font-weight: 700; padding: 3px 10px;" title="Pasirinkti šį Take kaip pagrindinį šio personažo balsą">
                                ⭐ Nustatyti kaip Main
                            </button>
                        ` : ''}
                        <button type="button" class="btn good text-xs btn-save-to-lib" style="padding: 3px 10px; font-weight: 700;" title="Save šį garso pavyzdį į nuolatinę Voice Library">
                            💾 Į Voice Library
                        </button>
                        <button type="button" class="btn bad icon text-xs btn-del-take" style="width: 24px; height: 24px; padding: 0;" title="Delete Take">✕</button>
                    </div>
                </div>

                <div class="flex items-center" style="gap: 10px;">
                    <audio controls src="${v.url}" style="height: 30px; flex: 1; outline: none; border-radius: 15px;"></audio>
                </div>
            `;

            // Set as Main Take
            const btnSetMain = card.querySelector(".btn-set-main-take");
            if (btnSetMain) {
                btnSetMain.addEventListener("click", () => {
                    vars.forEach(x => x.isMain = false);
                    v.isMain = true;
                    role.assignedVoice = v.filename;
                    saveProjectVoices();
                    selectRole(role.id);
                    if (typeof window.toast === "function") {
                        window.toast("Main Balsas Pasirinktas", `${role.name} balsu nustatytas ${v.createdAt || 'Take'}.`, "success");
                    }
                });
            }

            // Save to Library
            const btnSaveLib = card.querySelector(".btn-save-to-lib");
            if (btnSaveLib) {
                btnSaveLib.addEventListener("click", async () => {
                    let defaultName = `${role.id}.wav`;
                    let chosenName = prompt("Įveskite balso failo pavadinimą (išsaugoma į Voice Library):", defaultName);
                    if (!chosenName) return;
                    if (!chosenName.toLowerCase().endsWith(".wav") && !chosenName.toLowerCase().endsWith(".mp3")) {
                        chosenName += ".wav";
                    }

                    btnSaveLib.disabled = true;
                    btnSaveLib.textContent = "⏳ Saugoma...";

                    try {
                        const res = await fetch("/api/audio/save_preview_as_voice", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                preview_filename: v.filename,
                                voice_name: chosenName,
                                ref_text: v.sampleText || ""
                            })
                        });

                        const data = await res.json();
                        if (res.ok && data.status === "success") {
                            role.assignedVoice = data.filename;
                            saveProjectVoices();
                            
                            // Atnaujiname globalią Voice Library
                            if (typeof window.fetchVoicesList === "function") {
                                await window.fetchVoicesList();
                            }
                            populateLibrarySelect();
                            selectRole(role.id);

                            if (typeof window.toast === "function") {
                                window.toast("Balsas Išsaugotas", `Balsas '${data.filename}' sėkmingai pridėtas į Voice Library!`, "success");
                            }
                        } else {
                            throw new Error(data.detail || "Nepavyko išsaugoti balso");
                        }
                    } catch (err) {
                        alert("Klaida išsaugant balsą: " + err.message);
                    } finally {
                        btnSaveLib.disabled = false;
                        btnSaveLib.textContent = "💾 Į Voice Library";
                    }
                });
            }

            // Delete Take
            const btnDel = card.querySelector(".btn-del-take");
            if (btnDel) {
                btnDel.addEventListener("click", () => {
                    if (confirm("Delete šį Take?")) {
                        role.variations.splice(vIdx, 1);
                        if (v.isMain && role.variations.length > 0) {
                            role.variations[0].isMain = true;
                            role.assignedVoice = role.variations[0].filename;
                        } else if (role.variations.length === 0) {
                            role.assignedVoice = null;
                        }
                        saveProjectVoices();
                        selectRole(role.id);
                    }
                });
            }

            list.appendChild(card);
        });
    }

    function saveProjectVoices() {
        const proj = typeof window.getProj === 'function' ? window.getProj() : null;
        if (!proj) return;
        if (!proj.characterVoices) proj.characterVoices = {};

        currentVoiceRoles.forEach(r => {
            proj.characterVoices[r.id] = {
                id: r.id,
                name: r.name,
                gender: r.gender,
                description: r.description,
                assignedVoice: r.assignedVoice,
                variations: r.variations
            };
        });

        if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
    }

    // ------------------------------------------------------------------------
    // 6. ĮVYKIŲ KLAUSYTOJAI (INITIALIZATION)
    // ------------------------------------------------------------------------
    let castingInitialized = false;

    function initVoiceCasting() {
        if (castingInitialized) return;
        castingInitialized = true;

        // Atidarymo mygtukas Audio tabe
        const btnOpen = document.getElementById("btnOpenVoiceCastingStudio");
        if (btnOpen) {
            btnOpen.addEventListener("click", window.openVoiceCastingStudio);
        }

        // Rescan mygtukas
        const btnRescan = document.getElementById("btnCastingRescan");
        if (btnRescan) {
            btnRescan.addEventListener("click", () => {
                const roles = window.detectProjectVoiceRoles();
                renderCastingRoster(roles);
                if (roles.length > 0) selectRole(roles[0].id);
                if (typeof window.toast === "function") {
                    window.toast("Nuskaitymas Atliktas", `Aptikta ${roles.length} skirtingų personažų balsų.`, "success");
                }
            });
        }

        // Paieška kairėje
        const searchInput = document.getElementById("castingSearchInput");
        if (searchInput) {
            searchInput.addEventListener("input", () => {
                renderCastingRoster(currentVoiceRoles);
            });
        }

        // Quick Preset tag mygtukai
        document.querySelectorAll(".btn-preset-tag").forEach(btn => {
            btn.addEventListener("click", () => {
                const promptTa = document.getElementById("castingVoicePrompt");
                const p = btn.getAttribute("data-prompt");
                if (promptTa && p) {
                    promptTa.value = p;
                    const role = currentVoiceRoles.find(r => r.id === selectedRoleId);
                    if (role) {
                        role.description = p;
                        saveProjectVoices();
                    }
                }
            });
        });

        // Prompt input autosave
        const promptTa = document.getElementById("castingVoicePrompt");
        if (promptTa) {
            promptTa.addEventListener("input", (e) => {
                const role = currentVoiceRoles.find(r => r.id === selectedRoleId);
                if (role) {
                    role.description = e.target.value;
                    saveProjectVoices();
                }
            });
        }

        // Kita frazė iš scenarijaus
        const btnNextSample = document.getElementById("btnCastingNextSample");
        if (btnNextSample) {
            btnNextSample.addEventListener("click", () => {
                const role = currentVoiceRoles.find(r => r.id === selectedRoleId);
                if (!role) return;
                sampleIndexByRole[role.id] = (sampleIndexByRole[role.id] || 0) + 1;
                updateSampleTextDisplay(role);
            });
        }

        // Quick Library Assign
        const btnApplyLib = document.getElementById("btnCastingApplyLibraryVoice");
        if (btnApplyLib) {
            btnApplyLib.addEventListener("click", () => {
                const sel = document.getElementById("castingLibraryVoiceSelect");
                const val = sel ? sel.value : "";
                if (!val) return alert("Pasirinkite balsą iš sąrašo.");
                const role = currentVoiceRoles.find(r => r.id === selectedRoleId);
                if (!role) return;

                role.assignedVoice = val;
                saveProjectVoices();
                selectRole(role.id);
                if (typeof window.toast === "function") {
                    window.toast("Balsas Priskirtas", `${role.name} dabar naudoja '${val}'.`, "success");
                }
            });
        }

        // Clear All Takes
        const btnClearTakes = document.getElementById("btnClearTakes");
        if (btnClearTakes) {
            btnClearTakes.addEventListener("click", () => {
                const role = currentVoiceRoles.find(r => r.id === selectedRoleId);
                if (!role) return;
                if (confirm(`Ar tikrai ištrinti visas ${role.name} bandomąsias variacijas?`)) {
                    role.variations = [];
                    role.assignedVoice = null;
                    saveProjectVoices();
                    selectRole(role.id);
                }
            });
        }

        // Preview Audio Buttons
        const btnPlayLib = document.getElementById("btnCastingPlayLibraryVoice");
        if (btnPlayLib) {
            btnPlayLib.addEventListener("click", () => {
                const sel = document.getElementById("castingLibraryVoiceSelect");
                const val = sel ? sel.value : "";
                togglePlayLibraryVoice(val, btnPlayLib);
            });
        }

        const btnPlayClone = document.getElementById("btnCastingPlayCloneVoice");
        if (btnPlayClone) {
            btnPlayClone.addEventListener("click", () => {
                const sel = document.getElementById("castingCloneVoiceSelect") || document.getElementById("castingLibraryVoiceSelect");
                const val = sel ? sel.value : "";
                togglePlayLibraryVoice(val, btnPlayClone);
            });
        }

        // Library & Clone Select Synchronization
        const libSel = document.getElementById("castingLibraryVoiceSelect");
        const cloneSel = document.getElementById("castingCloneVoiceSelect");
        if (libSel && cloneSel) {
            libSel.addEventListener("change", () => {
                cloneSel.value = libSel.value;
                stopLibraryAudio();
            });
            cloneSel.addEventListener("change", () => {
                libSel.value = cloneSel.value;
                stopLibraryAudio();
            });
        }

        // Mode switch buttons (Design vs Clone)
        const btnModeDesign = document.getElementById("btnCastingModeDesign");
        const btnModeClone = document.getElementById("btnCastingModeClone");
        if (btnModeDesign) {
            btnModeDesign.addEventListener("click", () => setCastingMode('design'));
        }
        if (btnModeClone) {
            btnModeClone.addEventListener("click", () => setCastingMode('clone'));
        }

        // Generate naują Take (Palaiko abu režimus: Balso Dizainą per prompt arba Balso Klonavimą per reference failą)
        const btnGenTake = document.getElementById("btnCastingGenerateTake");
        if (btnGenTake) {
            btnGenTake.addEventListener("click", async () => {
                const role = currentVoiceRoles.find(r => r.id === selectedRoleId);
                if (!role) return;

                const targetNodeSel = document.getElementById("castingTargetNode");
                const targetNode = targetNodeSel ? targetNodeSel.value : "";
                if (!targetNode) return alert("Pasirinkite Target GPU mazgą.");

                const sampleText = (document.getElementById("castingSampleText")?.value || "").trim();
                if (!sampleText) return alert("Įveskite bandomąjį tekstą.");

                let promptText = "";
                let voiceRef = "";

                if (currentCastingMode === 'clone') {
                    const cSel = document.getElementById("castingCloneVoiceSelect") || document.getElementById("castingLibraryVoiceSelect");
                    voiceRef = cSel ? cSel.value.trim() : "";
                    if (!voiceRef) return alert("Pasirinkite balsą iš bibliotekos, kurį norite klonuoti.");
                } else {
                    promptText = (document.getElementById("castingVoicePrompt")?.value || "").trim();
                    if (!promptText) return alert("Įveskite balso aprašymą (prompt).");
                }

                const indicator = document.getElementById("castingGeneratingIndicator");
                const genText = document.getElementById("castingGeneratingText");
                btnGenTake.disabled = true;
                if (indicator) indicator.classList.remove("hidden");
                if (genText) {
                    genText.textContent = currentCastingMode === 'clone' 
                        ? `GPU klonuoja balsą '${voiceRef}'... ⏳`
                        : "GPU kuria balsą pagal aprašymą... ⏳";
                }

                const randomizeSeed = document.getElementById("castingRandomizeSeed")?.checked;
                const seedVal = randomizeSeed ? Math.floor(Math.random() * 9999999999) : 123456789;

                try {
                    const payload = {
                        text: sampleText,
                        prompt: promptText,
                        voice: voiceRef,
                        targetNode: targetNode,
                        seed: seedVal
                    };

                    const res = await fetch("/api/audio/preview", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload)
                    });

                    const data = await res.json();
                    if (res.ok && data.status === "success") {
                        if (!role.variations) role.variations = [];

                        const takeNum = role.variations.length + 1;
                        const now = new Date();
                        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

                        // Nuimame isMain nuo ankstesnių
                        role.variations.forEach(v => v.isMain = false);

                        const isClone = data.mode === "clone" || !!voiceRef;

                        const newTake = {
                            id: `take_${Date.now()}_${takeNum}`,
                            url: data.url,
                            filename: data.filename,
                            sampleText: sampleText,
                            prompt: promptText,
                            voiceRef: isClone ? voiceRef : null,
                            mode: isClone ? 'clone' : 'design',
                            seed: seedVal,
                            createdAt: `${isClone ? '🎭 Clone' : '✨ Design'} Take #${takeNum} (${timeStr})`,
                            isMain: true
                        };

                        role.variations.unshift(newTake);
                        role.assignedVoice = data.filename;
                        saveProjectVoices();

                        selectRole(role.id);

                        if (typeof window.toast === "function") {
                            window.toast("Naujas Take Paruoštas", `${role.name}: sugeneruotas Take #${takeNum} (${isClone ? 'Klonavimas' : 'Dizainas'})!`, "success");
                        }
                    } else {
                        throw new Error(data.detail || "Generavimo klaida");
                    }
                } catch (err) {
                    alert("Nepavyko sugeneruoti balso: " + err.message);
                } finally {
                    btnGenTake.disabled = false;
                    if (indicator) indicator.classList.add("hidden");
                }
            });
        }

        // Confirm ir Atnaujinti Scenes / Chunks
        const btnSaveAndSync = document.getElementById("btnCastingSaveAndSync");
        if (btnSaveAndSync) {
            btnSaveAndSync.addEventListener("click", () => {
                saveProjectVoices();

                const proj = typeof window.getProj === 'function' ? window.getProj() : null;
                let chunksUpdated = 0;

                if (proj && (!Array.isArray(proj.audioChunks) || proj.audioChunks.length === 0)) {
                    if (typeof window.prepareProjectChunks === 'function') {
                        window.prepareProjectChunks(null, false);
                    }
                }

                if (proj && Array.isArray(proj.audioChunks)) {
                    proj.audioChunks.forEach(chunk => {
                        const voiceKey = chunk.voiceId || chunk.voice;
                        const charName = chunk.character;

                        // Ieškome sutapimo tarp sukonfigūruotų balsų
                        const matchedRole = currentVoiceRoles.find(r => 
                            (voiceKey && r.id.toLowerCase() === voiceKey.toLowerCase()) ||
                            (charName && r.name.toLowerCase() === charName.toLowerCase()) ||
                            (charName && r.id.toLowerCase().includes(charName.toLowerCase()))
                        );

                        if (matchedRole && matchedRole.assignedVoice) {
                            chunk.voice = matchedRole.assignedVoice;
                            chunksUpdated++;
                        }
                    });
                }

                if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();

                // Atnaujiname Chunks sąrašą, jei jis egzistuoja
                if (typeof window.renderChunksModalList === 'function') {
                    window.renderChunksModalList();
                }

                window.closeVoiceCastingStudio();

                if (typeof window.toast === "function") {
                    window.toast(
                        "Sinchronizacija Baigta", 
                        `Personažų balsai patvirtinti! Atnaujinta ${chunksUpdated} garso dalių (chunks).`, 
                        "success"
                    );
                }
            });
        }
    }

    // Paleidžiame inicializaciją užkrovus DOM
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initVoiceCasting);
    } else {
        setTimeout(initVoiceCasting, 100);
    }

})();
