// audio.js - Valdo 'Voice & Audio' skirtuko logiką ir Chunks valdymą

let selectedVoiceFile = null;
let currentPreviewFilename = null;
let currentPlayingAudio = null; 
let isUploading = false; // APSAUGA: Neleidžia siųsti failo kelis kartus vienu metu
let activeFullAudioAbortController = null;
let currentAudioSessionId = null;
let currentProjectChunks = []; // Saugomi projekto sakiniai/dalys [{id, index, text, audio_url, filename}]
let availableVoicesList = [];
window.availableVoicesList = availableVoicesList;

// ==========================================
// 1. Inicializacija ir DOM Elementai
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    // GPU Node valdymas
    const audioTargetNode = document.getElementById("audioTargetNode");
    
    // Voice Library
    const btnToggleUploadVoice = document.getElementById("btnToggleUploadVoice");
    const voiceDropzone = document.getElementById("voiceDropzone");
    const voiceFileInput = document.getElementById("voiceFileInput");
    const voiceList = document.getElementById("voiceList");
    
    // Preview Generation
    const audioPrompt = document.getElementById("audioPrompt");
    const audioSampleText = document.getElementById("audioSampleText");
    const btnRandomSampleText = document.getElementById("btnRandomSampleText");
    const btnGeneratePreview = document.getElementById("btnGeneratePreview");
    const previewResultArea = document.getElementById("previewResultArea");
    const previewAudioPlayer = document.getElementById("previewAudioPlayer");
    const btnSavePreview = document.getElementById("btnSavePreview");
    const previewLoading = document.getElementById("previewLoading");
    
    // Save Voice Modal
    const modalSaveVoice = document.getElementById("modalSaveVoice");
    const newVoiceName = document.getElementById("newVoiceName");
    const btnConfirmSaveVoice = document.getElementById("btnConfirmSaveVoice");
    
    // Full Script Generation
    const audioFullScript = document.getElementById("audioFullScript");
    const btnGenerateFullAudio = document.getElementById("btnGenerateFullAudio");
    const fullAudioResultArea = document.getElementById("fullAudioResultArea");
    const fullAudioPlayer = document.getElementById("fullAudioPlayer");
    const btnDownloadFullAudio = document.getElementById("btnDownloadFullAudio");
    const fullAudioLoading = document.getElementById("fullAudioLoading");
    const fullAudioStatusText = document.getElementById("fullAudioStatusText");
    const btnCancelFullAudio = document.getElementById("btnCancelFullAudio");
    const fullAudioProgressBarWrap = document.getElementById("fullAudioProgressBarWrap");
    const fullAudioProgressBar = document.getElementById("fullAudioProgressBar");
    const selectedVoiceBadge = document.getElementById("selectedVoiceBadge");
    
    // Audio Generation Mode Controls
    const audioModeByScenes = document.getElementById("audioModeByScenes");
    const audioModeFullScript = document.getElementById("audioModeFullScript");
    const audioModeLockBadge = document.getElementById("audioModeLockBadge");
    const btnUnlockAudioMode = document.getElementById("btnUnlockAudioMode");
    
    // Chunks Buttons & Direct Access
    const btnManageChunks = document.getElementById("btnManageChunks");
    const btnManageChunksTop = document.getElementById("btnManageChunksTop");
    const chunksCountBadge = document.getElementById("chunksCountBadge");
    const topChunksCount = document.getElementById("topChunksCount");
    
    // Modal Audio Chunks elements
    const modalAudioChunks = document.getElementById("modalAudioChunks");
    const audioChunksList = document.getElementById("audioChunksList");
    const modalChunksTotalBadge = document.getElementById("modalChunksTotalBadge");
    const chunksModalVoiceSelect = document.getElementById("chunksModalVoiceSelect");
    const chunksModalSilenceInput = document.getElementById("chunksModalSilenceInput");
    const btnAddChunkInModal = document.getElementById("btnAddChunkInModal");
    const btnRestitchModalAudio = document.getElementById("btnRestitchModalAudio");
    const modalMasterAudioPlayer = document.getElementById("modalMasterAudioPlayer");
    const btnSaveApplyChunks = document.getElementById("btnSaveApplyChunks");
    const modalChunksStatus = document.getElementById("modalChunksStatus");
    
    // Audio Processing & Transitions controls
    const btnToggleAudioProcessing = document.getElementById("btnToggleAudioProcessing");
    const audioProcessingPanel = document.getElementById("audioProcessingPanel");
    const chunksTrimSilence = document.getElementById("chunksTrimSilence");
    const chunksTrimThreshold = document.getElementById("chunksTrimThreshold");
    const chunksTransitionType = document.getElementById("chunksTransitionType");
    const chunksTransitionMs = document.getElementById("chunksTransitionMs");
    const chunksTransitionMsWrap = document.getElementById("chunksTransitionMsWrap");
    const chunksTransitionMsLabel = document.getElementById("chunksTransitionMsLabel");
    const chunksSilenceMsWrap = document.getElementById("chunksSilenceMsWrap");
    const chunksStitchDurationBadge = document.getElementById("chunksStitchDurationBadge");
    
    // Add to Timeline
    const btnAddToTimeline = document.getElementById("btnAddToTimeline");

    // ==========================================
    // 2. GPU Node Užkrovimas
    // ==========================================
    async function loadAudioNodes() {
        try {
            const res = await fetch("/api/nodes");
            const data = await res.json();
            if (!audioTargetNode) return;
            
            audioTargetNode.innerHTML = '<option value="">-- Select Target GPU --</option>';
            
            if (data.nodes && data.nodes.length > 0) {
                data.nodes.forEach(node => {
                    const opt = document.createElement("option");
                    opt.value = node.id;
                    opt.textContent = `${node.name} (${node.status})`;
                    audioTargetNode.appendChild(opt);
                });
                const onlineIdx = data.nodes.findIndex(n => n.status === 'idle' || n.status === 'processing');
                audioTargetNode.selectedIndex = onlineIdx >= 0 ? (onlineIdx + 1) : 1;
            } else {
                audioTargetNode.innerHTML = '<option value="">-- No GPUs Available --</option>';
            }
        } catch (e) {
            console.error("Failed to load nodes for audio", e);
        }
    }
    
    loadAudioNodes();
    setInterval(loadAudioNodes, 15000);

    // ==========================================
    // 3. Voice Library ir Drag & Drop
    // ==========================================
    if (btnToggleUploadVoice && voiceDropzone) {
        btnToggleUploadVoice.addEventListener("click", () => {
            voiceDropzone.classList.toggle("hidden");
        });
    }

    if (voiceDropzone && voiceFileInput) {
        voiceDropzone.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.stopPropagation();
            voiceDropzone.classList.add("dragover");
        });
        
        voiceDropzone.addEventListener("dragleave", (e) => {
            e.preventDefault();
            e.stopPropagation();
            voiceDropzone.classList.remove("dragover");
        });
        
        voiceDropzone.addEventListener("drop", (e) => {
            e.preventDefault();
            e.stopPropagation();
            voiceDropzone.classList.remove("dragover");
            if (isUploading) return;
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                uploadVoiceFile(e.dataTransfer.files[0]);
            }
        });
        
        voiceDropzone.addEventListener("click", () => voiceFileInput.click());
        
        voiceFileInput.addEventListener("change", (e) => {
            if (isUploading) return;
            if (e.target.files.length > 0) uploadVoiceFile(e.target.files[0]);
        });
    }

    async function uploadVoiceFile(file, refText = "") {
        if (isUploading) return;
        if (!file.name.endsWith('.wav') && !file.name.endsWith('.mp3')) {
            alert("Only .wav or .mp3 files are supported!");
            return;
        }
        
        isUploading = true;
        const formData = new FormData();
        formData.append("file", file);
        
        if (refText) {
            formData.append("ref_text", refText);
        }
        
        try {
            const res = await fetch("/api/audio/upload", { method: "POST", body: formData });
            const data = await res.json();
            if (data.status === "success") {
                if (voiceDropzone) voiceDropzone.classList.add("hidden");
                loadVoices();
                if(typeof window.toast === 'function') window.toast("Voice Uploaded", file.name, "success");
            }
        } catch (e) {
            alert("Upload failed: " + e.message);
        } finally {
            isUploading = false;
            if (voiceFileInput) voiceFileInput.value = "";
        }
    }

    async function loadVoices() {
        try {
            const res = await fetch("/api/audio/voices");
            const data = await res.json();
            availableVoicesList = data.voices || [];
            window.availableVoicesList = availableVoicesList;
            if (!voiceList) return availableVoicesList;
            voiceList.innerHTML = "";
            
            if (!data.voices || data.voices.length === 0) {
                voiceList.innerHTML = '<div class="text-muted text-sm text-center mt-4">No voices found. Add one to begin.</div>';
                selectedVoiceFile = null;
                updateVoiceBadge();
                updateModalVoiceSelect();
                return;
            }

            const proj = typeof window.getProj === 'function' ? window.getProj() : null;
            if (proj && proj.selectedVoice && data.voices.includes(proj.selectedVoice)) {
                selectedVoiceFile = proj.selectedVoice;
            } else {
                // Pagal nutylėjimą: Narrator atžymėtas, aktyvus Multi-Voice (By Character Roles)
                selectedVoiceFile = null;
            }
            updateVoiceBadge();
            updateModalVoiceSelect();

            data.voices.forEach(voice => {
                const el = document.createElement("div");
                el.className = "voice-item";
                el.style.display = "flex";
                el.style.justifyContent = "space-between";
                el.style.alignItems = "center";
                
                if (selectedVoiceFile === voice) el.classList.add("active");
                
                el.innerHTML = `
                    <span style="font-weight: 600; font-size: 13px; flex-grow: 1;">${voice}</span>
                    <div style="display: flex; gap: 5px;">
                        <button class="voice-play-btn" title="Play / Pause Reference">▶</button>
                        <button class="voice-delete-btn" title="Delete Voice">🗑️</button>
                    </div>
                `;
                
                el.addEventListener("click", (e) => {
                    if(e.target.tagName === 'BUTTON') return; 
                    
                    const currentProj = typeof window.getProj === 'function' ? window.getProj() : null;

                    // Jei paspaudžiama ant jau pasirinkto balso – jį atžymime (grįžtame į Multi-Voice)
                    if (selectedVoiceFile === voice) {
                        document.querySelectorAll(".voice-item").forEach(i => i.classList.remove("active"));
                        selectedVoiceFile = null;
                        if (currentProj) {
                            currentProj.selectedVoice = null;
                            if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
                        }
                        updateVoiceBadge();
                        updateModalVoiceSelect();
                        if (typeof window.toast === 'function') window.toast("Multi-Voice", "Balsas atžymėtas. Aktyvuotas Multi-Voice režimas (pagal personažus).", "info");
                        return;
                    }

                    // Pažymime konkretų balsą visiems
                    document.querySelectorAll(".voice-item").forEach(i => i.classList.remove("active"));
                    el.classList.add("active");
                    selectedVoiceFile = voice;
                    if (currentProj) {
                        currentProj.selectedVoice = voice;
                        if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
                    }
                    updateVoiceBadge();
                    updateModalVoiceSelect();
                    if (typeof window.toast === 'function') window.toast("Balsas Pasirinktas", `Visiems nustatytas balsas: ${voice}`, "info");
                });
                
                const playBtn = el.querySelector(".voice-play-btn");
                playBtn.addEventListener("click", (e) => {
                    e.stopPropagation(); 
                    
                    if (currentPlayingAudio && currentPlayingAudio.src.includes(encodeURIComponent(voice))) {
                        currentPlayingAudio.pause();
                        currentPlayingAudio = null;
                        playBtn.textContent = "▶";
                        return;
                    }
                    
                    if (currentPlayingAudio) {
                        currentPlayingAudio.pause();
                        document.querySelectorAll(".voice-play-btn").forEach(btn => btn.textContent = "▶");
                    }
                    
                    currentPlayingAudio = new Audio(`/voices/${encodeURIComponent(voice)}`);
                    currentPlayingAudio.play();
                    playBtn.textContent = "⏸";
                    
                    currentPlayingAudio.onended = () => {
                        playBtn.textContent = "▶";
                        currentPlayingAudio = null;
                    };
                });
                
                el.querySelector(".voice-delete-btn").addEventListener("click", async (e) => {
                    e.stopPropagation();
                    if (confirm(`Are you sure you want to delete voice "${voice}"?`)) {
                        try {
                            const res = await fetch(`/api/audio/voices/${encodeURIComponent(voice)}`, {
                                method: "DELETE"
                            });
                            if (res.ok) {
                                if (currentPlayingAudio && currentPlayingAudio.src.includes(encodeURIComponent(voice))) {
                                    currentPlayingAudio.pause();
                                    currentPlayingAudio = null;
                                }
                                if (selectedVoiceFile === voice) {
                                    selectedVoiceFile = null;
                                    updateVoiceBadge();
                                }
                                loadVoices(); 
                            } else {
                                alert("Failed to delete voice.");
                            }
                        } catch (err) {
                            alert("Error deleting voice: " + err.message);
                        }
                    }
                });
                
                voiceList.appendChild(el);
            });
        } catch (e) {
            console.error("Failed to load voices", e);
        }
    }
    window.loadVoices = loadVoices;
    window.fetchVoicesList = loadVoices;
    
    function updateVoiceBadge() {
        if (!selectedVoiceBadge || !btnGenerateFullAudio) return;
        if (selectedVoiceFile) {
            selectedVoiceBadge.innerHTML = `🎙️ Unified Voice: <b style="color:#00ffcc;">${selectedVoiceFile}</b> <span style="opacity:0.75; font-size:10px; margin-left:4px;">(✕ atžymėti)</span>`;
            selectedVoiceBadge.className = "badge info text-xs";
            selectedVoiceBadge.style.cursor = "pointer";
            selectedVoiceBadge.style.background = "rgba(2, 132, 199, 0.22)";
            selectedVoiceBadge.style.border = "1px solid rgba(2, 132, 199, 0.55)";
            selectedVoiceBadge.style.color = "#38bdf8";
            selectedVoiceBadge.title = "Click to unselect this voice and return to Multi-Voice (By Character Roles)";
            btnGenerateFullAudio.disabled = false;
        } else {
            selectedVoiceBadge.innerHTML = `🎭 Multi-Voice <span style="opacity:0.85; font-size:10px; margin-left:4px;">(Pagal Personažus)</span>`;
            selectedVoiceBadge.className = "badge good text-xs";
            selectedVoiceBadge.style.cursor = "pointer";
            selectedVoiceBadge.style.background = "linear-gradient(135deg, rgba(168, 85, 247, 0.25), rgba(6, 182, 212, 0.25))";
            selectedVoiceBadge.style.border = "1px solid rgba(168, 85, 247, 0.6)";
            selectedVoiceBadge.style.color = "#c084fc";
            selectedVoiceBadge.title = "Multi-Voice mode: each scene uses its assigned character voice";
            btnGenerateFullAudio.disabled = false;
        }
    }

    if (selectedVoiceBadge) {
        selectedVoiceBadge.addEventListener("click", () => {
            if (selectedVoiceFile) {
                selectedVoiceFile = null;
                const proj = typeof window.getProj === 'function' ? window.getProj() : null;
                if (proj) {
                    proj.selectedVoice = null;
                    if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
                }
                document.querySelectorAll(".voice-item").forEach(i => i.classList.remove("active"));
                updateVoiceBadge();
                updateModalVoiceSelect();
                if (typeof window.toast === 'function') window.toast("Multi-Voice", "Reverted to Multi-Voice mode (By Character).", "info");
            }
        });
    }

    function updateModalVoiceSelect() {
        if (!chunksModalVoiceSelect) return;
        chunksModalVoiceSelect.innerHTML = "";
        availableVoicesList.forEach(v => {
            const opt = document.createElement("option");
            opt.value = v;
            opt.textContent = v;
            if (v === selectedVoiceFile) opt.selected = true;
            chunksModalVoiceSelect.appendChild(opt);
        });
    }

    function updateChunksUI() {
        const count = currentProjectChunks ? currentProjectChunks.length : 0;
        if (chunksCountBadge) chunksCountBadge.textContent = count;
        if (topChunksCount) topChunksCount.textContent = count;
        if (modalChunksTotalBadge) modalChunksTotalBadge.textContent = `${count} Chunks`;
    }

    window.renderAudioUI = function() {
        const proj = typeof window.getProj === 'function' ? window.getProj() : null;
        if (!proj) return;
        
        if (audioFullScript) {
            if (proj.audioFullScript !== undefined && proj.audioFullScript !== "") {
                audioFullScript.value = proj.audioFullScript;
            } else if (proj.sceneTextById && Object.keys(proj.sceneTextById).length > 0) {
                audioFullScript.value = Object.values(proj.sceneTextById).join("\n\n");
                proj.audioFullScript = audioFullScript.value;
            } else {
                audioFullScript.value = "";
            }
        }
        
        if (audioPrompt) {
            audioPrompt.value = proj.audioPrompt || "";
        }
        if (audioSampleText) {
            audioSampleText.value = proj.audioSampleText || "";
        }
        
        if (proj.selectedVoice) {
            selectedVoiceFile = proj.selectedVoice;
        } else {
            selectedVoiceFile = null;
        }
        updateVoiceBadge();
        document.querySelectorAll(".voice-item").forEach(item => {
            const nameSpan = item.querySelector("span");
            if (selectedVoiceFile && nameSpan && nameSpan.textContent.trim() === selectedVoiceFile) {
                item.classList.add("active");
            } else {
                item.classList.remove("active");
            }
        });

        if (Array.isArray(proj.audioChunks) && proj.audioChunks.length > 0) {
            currentProjectChunks = proj.audioChunks;
            updateChunksUI();
        } else {
            currentProjectChunks = [];
            updateChunksUI();
        }

        if (proj.audioTrack) {
            if (fullAudioPlayer && fullAudioPlayer.src !== proj.audioTrack && !fullAudioPlayer.src.endsWith(proj.audioTrack)) {
                fullAudioPlayer.src = proj.audioTrack;
            }
            if (btnDownloadFullAudio) {
                btnDownloadFullAudio.href = proj.audioTrack;
                btnDownloadFullAudio.classList.remove("hidden");
            }
            if (fullAudioResultArea) fullAudioResultArea.classList.remove("hidden");
        } else {
            if (fullAudioPlayer) {
                fullAudioPlayer.pause();
                fullAudioPlayer.removeAttribute("src");
                fullAudioPlayer.load();
            }
            if (btnDownloadFullAudio) {
                btnDownloadFullAudio.href = "#";
                btnDownloadFullAudio.classList.add("hidden");
            }
            if (fullAudioResultArea) fullAudioResultArea.classList.add("hidden");
        }

        // 4. Audio Generation Mode & būsena
        const allModeRadios = document.querySelectorAll('input[name="audioGenMode"]');
        if (proj.audioGenMode) {
            const currentRadio = document.querySelector(`input[name="audioGenMode"][value="${proj.audioGenMode}"]`);
            if (currentRadio) currentRadio.checked = true;
        } else if (proj.scenes && proj.scenes.length > 0) {
            const byScenesRadio = document.querySelector('input[name="audioGenMode"][value="by_scenes"]');
            if (byScenesRadio) byScenesRadio.checked = true;
        }
        
        const isGenerating = !!activeFullAudioAbortController;
        allModeRadios.forEach(r => r.disabled = isGenerating);
        if (isGenerating) {
            if (audioModeLockBadge) {
                audioModeLockBadge.textContent = "🔒 Vykdomas generavimas...";
                audioModeLockBadge.style.color = "#f59e0b";
            }
        } else {
            if (audioModeLockBadge) {
                audioModeLockBadge.textContent = "🔓 Unlocked";
                audioModeLockBadge.style.color = "var(--muted)";
            }
            if (btnUnlockAudioMode) btnUnlockAudioMode.classList.add("hidden");
        }
    };

    const allModeRadios = document.querySelectorAll('input[name="audioGenMode"]');
    allModeRadios.forEach(radio => {
        radio.addEventListener("change", (e) => {
            if (e.target.checked) {
                const proj = typeof window.getProj === 'function' ? window.getProj() : null;
                if (proj) {
                    proj.audioGenMode = e.target.value;
                    if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
                }
            }
        });
    });

    if (btnUnlockAudioMode) {
        btnUnlockAudioMode.addEventListener("click", () => {
            if (confirm("Are you sure you want to unlock and change audio segmentation mode?")) {
                const radios = document.querySelectorAll('input[name="audioGenMode"]');
                radios.forEach(r => r.disabled = false);
                if (audioModeLockBadge) {
                    audioModeLockBadge.textContent = "🔓 Unlocked";
                    audioModeLockBadge.style.color = "var(--muted)";
                }
                btnUnlockAudioMode.classList.add("hidden");
            }
        });
    }

    if (audioFullScript) {
        audioFullScript.addEventListener("input", (e) => {
            const proj = typeof window.getProj === 'function' ? window.getProj() : null;
            if (proj) {
                proj.audioFullScript = e.target.value;
                if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
            }
        });
    }

    if (audioPrompt) {
        audioPrompt.addEventListener("input", (e) => {
            const proj = typeof window.getProj === 'function' ? window.getProj() : null;
            if (proj) {
                proj.audioPrompt = e.target.value;
                if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
            }
        });
    }

    const RANDOM_SAMPLE_SENTENCES = [
        "Hello! I am testing this new voice design. How do I sound today?",
        "Welcome to the sunny paradise, where turquoise waves meet pink coral sand.",
        "Once upon a time in a forgotten realm, an ancient legend began to awaken.",
        "The countdown is complete. All engines are ignited and ready for launch.",
        "In the quiet shadows of the grand castle, secrets from the past still linger.",
        "Greetings, traveler! What brings you to our humble tavern on this stormy night?",
        "Science and technology are transforming the way we perceive the vast universe.",
        "Take a deep breath and listen closely to the whispering autumn wind.",
        "Labas! Čia yra mano naujo balso pavyzdys. Kaip vertinate skambesį ir intonaciją?",
        "Deep beneath the ocean surface, magnificent creatures glide through the blue abyss.",
        "Beware the dark woods when the harvest moon rises high above the horizon.",
        "Discover the joy of creating something entirely new with the power of artificial intelligence.",
        "Step through the glowing portal and enter a dimension where time stands completely still.",
        "The gentle rain fell softly against the window pane as the fireplace crackled with warmth."
    ];

    if (btnRandomSampleText && audioSampleText) {
        btnRandomSampleText.addEventListener("click", () => {
            const current = audioSampleText.value.trim();
            const pool = RANDOM_SAMPLE_SENTENCES.filter(s => s !== current);
            const randomSentence = pool[Math.floor(Math.random() * pool.length)] || RANDOM_SAMPLE_SENTENCES[0];
            
            audioSampleText.value = randomSentence;
            
            const proj = typeof window.getProj === 'function' ? window.getProj() : null;
            if (proj) {
                proj.audioSampleText = randomSentence;
                if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
            }
            
            // Subtle button animation feedback
            btnRandomSampleText.style.transform = "scale(0.92)";
            setTimeout(() => btnRandomSampleText.style.transform = "scale(1)", 120);
        });
    }

    if (audioSampleText) {
        audioSampleText.addEventListener("input", (e) => {
            const proj = typeof window.getProj === 'function' ? window.getProj() : null;
            if (proj) {
                proj.audioSampleText = e.target.value;
                if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
            }
        });
    }

    loadVoices();

    // ==========================================
    // 4. Preview Generation (AI Voice Design)
    // ==========================================
    if (btnGeneratePreview) {
        btnGeneratePreview.addEventListener("click", async () => {
            const targetNode = audioTargetNode ? audioTargetNode.value : "";
            const text = audioSampleText ? audioSampleText.value.trim() : "";
            const prompt = audioPrompt ? audioPrompt.value.trim() : "";
            
            if (!targetNode) return alert("Please select a Target GPU Node first.");
            if (!text) return alert("Please enter sample text.");
            
            btnGeneratePreview.disabled = true;
            if (previewResultArea) previewResultArea.classList.add("hidden");
            if (previewLoading) previewLoading.classList.remove("hidden");
            
            try {
                const res = await fetch("/api/audio/preview", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text, prompt, targetNode })
                });
                
                const data = await res.json();
                if (res.ok && data.status === "success") {
                    if (previewAudioPlayer) previewAudioPlayer.src = data.url;
                    currentPreviewFilename = data.filename;
                    
                    if (previewLoading) previewLoading.classList.add("hidden");
                    if (previewResultArea) previewResultArea.classList.remove("hidden");
                } else {
                    throw new Error(data.detail || "Unknown error");
                }
            } catch (e) {
                alert("Preview generation failed: " + e.message);
                if (previewLoading) previewLoading.classList.add("hidden");
            } finally {
                btnGeneratePreview.disabled = false;
            }
        });
    }

    // ==========================================
    // 5. Save Preview to Library
    // ==========================================
    if (btnSavePreview) {
        btnSavePreview.addEventListener("click", () => {
            if (modalSaveVoice) modalSaveVoice.classList.add("show");
            if (newVoiceName) {
                newVoiceName.value = "";
                newVoiceName.focus();
            }
        });
    }
    
    if (btnConfirmSaveVoice) {
        btnConfirmSaveVoice.addEventListener("click", async () => {
            let name = newVoiceName ? newVoiceName.value.trim() : "";
            if (!name) return alert("Please enter a name.");
            if (!name.endsWith(".wav")) name += ".wav";
            
            const generatedText = audioSampleText ? audioSampleText.value.trim() : "";
            
            try {
                const response = await fetch(previewAudioPlayer.src);
                const blob = await response.blob();
                const file = new File([blob], name, { type: "audio/wav" });
                
                await uploadVoiceFile(file, generatedText);
                if (modalSaveVoice) modalSaveVoice.classList.remove("show");
            } catch (e) {
                alert("Failed to save voice: " + e.message);
            }
        });
    }

    // WEBSOCKET REAL-TIME CHUNK PROGRESS LISTENER
    window.onAudioChunkProgress = function(data) {
        if (!data) return;
        const currentProjId = (window.state && window.state.currentProjectId) || "demo_proj";
        if (data.projectId && data.projectId !== currentProjId) return;

        if (fullAudioLoading && fullAudioLoading.classList.contains("hidden")) {
            fullAudioLoading.classList.remove("hidden");
        }
        if (fullAudioStatusText) {
            fullAudioStatusText.textContent = `⚡ Generated: ${data.current} / ${data.total} (Remaining: ${data.remaining}) ⏳`;
        }
        if (fullAudioProgressBarWrap && fullAudioProgressBarWrap.classList.contains("hidden")) {
            fullAudioProgressBarWrap.classList.remove("hidden");
        }
        if (fullAudioProgressBar && data.total > 0) {
            const pct = Math.max(5, Math.round((data.current / data.total) * 100));
            fullAudioProgressBar.style.width = `${pct}%`;
        }

        if (data.chunk) {
            const existingIdx = currentProjectChunks.findIndex(c => 
                c.id === data.chunk.id || 
                (data.chunk.sceneId && String(c.sceneId) === String(data.chunk.sceneId))
            );
            if (existingIdx >= 0) {
                currentProjectChunks[existingIdx] = data.chunk;
            } else {
                currentProjectChunks.push(data.chunk);
            }
            updateChunksUI();

            const proj = typeof window.getProj === 'function' ? window.getProj() : null;
            if (proj) {
                proj.audioChunks = currentProjectChunks;
                if (data.chunk.sceneId) {
                    if (!proj.sceneAudioById) proj.sceneAudioById = {};
                    proj.sceneAudioById[data.chunk.sceneId] = data.chunk.audio_url || data.chunk.url;
                }
                if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
            }

            const modalChunks = document.getElementById("modalAudioChunks");
            if (modalChunks && modalChunks.classList.contains("show")) {
                renderChunksModalList();
            }
        }
    };

    // ==========================================
    // 6. Full Script Generation & Cancellation
    // ==========================================
    
    // ==========================================
    // SIMULATED AUDIO GENERATION (Demo Mode)
    // ==========================================
    async function simulateFullAudioGeneration() {
        const proj = typeof window.getProj === 'function' ? window.getProj() : (window.proj || {});
        if (btnGenerateFullAudio) btnGenerateFullAudio.disabled = true;
        if (fullAudioResultArea) fullAudioResultArea.classList.add("hidden");
        if (fullAudioLoading) fullAudioLoading.classList.remove("hidden");
        if (fullAudioProgressBarWrap) fullAudioProgressBarWrap.classList.remove("hidden");
        if (fullAudioProgressBar) fullAudioProgressBar.style.width = "5%";

        const selectedModeInput = document.querySelector('input[name="audioGenMode"]:checked');
        const genMode = selectedModeInput ? selectedModeInput.value : "by_scenes";

        const modeRadios = document.querySelectorAll('input[name="audioGenMode"]');
        modeRadios.forEach(r => r.disabled = true);
        const modeLabels = {
            by_scenes: "🔒 Locked (By Scenes)",
            by_punctuation: "🔒 Locked (By Punctuation)",
            by_sentences: "🔒 Locked (By Sentences)",
            full_script: "🔒 Locked (Free Script)"
        };
        if (audioModeLockBadge) {
            audioModeLockBadge.textContent = modeLabels[genMode] || "🔒 Locked";
            audioModeLockBadge.style.color = "#00ffcc";
        }
        if (btnUnlockAudioMode) btnUnlockAudioMode.classList.add("hidden");

        const steps = [
            { pct: 15, text: "Tokenizing dialogue and allocating GPU audio pipeline... [GPU 1]" },
            { pct: 38, text: "Synthesizing voice tracks (Alex & Maya): Chunks 1-6... ⚡" },
            { pct: 62, text: "Synthesizing voice tracks: Chunks 7-12... ⚡" },
            { pct: 85, text: "Synthesizing voice tracks: Chunks 13-18... ⚡" },
            { pct: 98, text: "Stitching 18 audio segments with seamless crossfades... ⏳" },
            { pct: 100, text: "Audio Synthesis Complete (100%)" }
        ];

        for (const st of steps) {
            if (fullAudioProgressBar) fullAudioProgressBar.style.width = `${st.pct}%`;
            if (fullAudioStatusText) fullAudioStatusText.textContent = st.text;
            await new Promise(r => setTimeout(r, 380));
        }

        const chunkDurations = [4.10, 3.23, 4.39, 3.32, 1.39, 3.85, 3.67, 1.46, 2.68, 4.21, 3.33, 2.36, 2.80, 1.58, 2.94, 3.11, 4.09, 3.49];
        const defaultTexts = [
            "What if gravity completely reversed on Earth",
            "for exactly sixty seconds?",
            "The moment it flips, cars, loose pavement, and pedestrians drift upward into the sky.",
            "At five seconds, unsecured objects accelerate into the atmosphere at 9.8 meters per second squared.",
            "People indoors slam violently into ceilings, turning living rooms into dangerous holding zones.",
            "By fifteen seconds, unanchored buildings and infrastructure begin tearing away from foundations.",
            "Swimming pools, lakes, and coastal waters burst upward in massive floating liquid walls.",
            "At thirty seconds, anything outside is nearly two kilometers up in the freezing troposphere.",
            "Planes lose lift and tumble through a disoriented wall of ascending debris and dust.",
            "Birds and animals panic as atmospheric pressure drops and air starts rushing skyward.",
            "At forty-five seconds, chaos reaches maximum altitude—hundreds of thousands of objects floating.",
            "Suspended mid-air, a breathless moment of eerie silence hangs over the fragmented planet.",
            "Then, at second fifty-nine, countdown begins: three, two, one...",
            "Gravity instantly snaps back.",
            "Everything in the sky plummets downward at terminal velocity toward the shattered ground below.",
            "Skyscrapers, vehicles, and billions of tons of water crash simultaneously in colossal shockwaves.",
            "The sixty-second reversal leaves entire cities leveled in one cataclysmic planetary reset.",
            "Would you have survived sixty seconds without Earth's gravity?"
        ];

        const newChunks = [];
        for (let i = 0; i < 18; i++) {
            const scId = "S" + (i + 1);
            const sc = (proj.scenes && proj.scenes[i]) || {};
            const text = (proj.sceneTextById && proj.sceneTextById[sc.id]) || sc.text || defaultTexts[i];
            const charName = (i % 2 === 0) ? "ALEX" : "MAYA";
            const voiceFile = (i % 2 === 0) ? "ALEX_whitestickman_outfitA.png" : "MAYA_whitestickman_outfitA.png";
            const chunkUrl = `/audio/chunk_s${i + 1}.wav`;
            const dur = chunkDurations[i] || 3.5;

            newChunks.push({
                id: `chunk_${scId}`,
                index: i,
                sceneId: scId,
                name: `${scId} (${charName})`,
                character: charName,
                voice: voiceFile,
                voiceId: voiceFile,
                text: text,
                audio_url: chunkUrl,
                url: chunkUrl,
                filename: `chunk_s${i + 1}.wav`,
                duration: dur,
                variations: [
                    { id: `take_1_s${i+1}`, url: chunkUrl, filename: `chunk_s${i+1}.wav`, duration: dur, isMain: true, createdAt: "Take #1 (Synthesized)" }
                ]
            });
        }

        currentProjectChunks = newChunks;
        const masterUrl = "/audio/default_full_script_dialogue.wav";

        if (fullAudioPlayer) fullAudioPlayer.src = masterUrl;
        if (btnDownloadFullAudio) {
            btnDownloadFullAudio.href = masterUrl;
            btnDownloadFullAudio.classList.remove("hidden");
        }

        if (proj) {
            proj.audioTrack = masterUrl;
            proj.audioChunks = currentProjectChunks;
            if (!proj.sceneAudioById) proj.sceneAudioById = {};
            for (let i = 1; i <= 18; i++) {
                proj.sceneAudioById["S" + i] = `/audio/chunk_s${i}.wav`;
                proj.sceneAudioById[String(i)] = `/audio/chunk_s${i}.wav`;
            }
            if (typeof window.saveProjectToDB === 'function') window.saveProjectToDB(state.currentProjectId);
            if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
        }

        updateChunksUI();

        if (fullAudioLoading) fullAudioLoading.classList.add("hidden");
        if (fullAudioResultArea) fullAudioResultArea.classList.remove("hidden");
        if (btnUnlockAudioMode) btnUnlockAudioMode.classList.remove("hidden");
        if (btnGenerateFullAudio) btnGenerateFullAudio.disabled = false;

        if (typeof window.autoAlignTimeline === "function") {
            window.autoAlignTimeline(masterUrl);
        } else if (typeof window.renderTimeline === "function") {
            window.renderTimeline();
        }
        if (typeof window.renderRenderStudioUI === 'function') window.renderRenderStudioUI();
    }

    if (btnGenerateFullAudio) {
        btnGenerateFullAudio.addEventListener("click", async () => {
            if (typeof window.isGlobalDemoMode === "function" && window.isGlobalDemoMode()) {
                await simulateFullAudioGeneration();
                return;
            }
            const targetNode = audioTargetNode ? audioTargetNode.value : "";
            const text = audioFullScript ? audioFullScript.value.trim() : "";
            const selectedModeInput = document.querySelector('input[name="audioGenMode"]:checked');
            const genMode = selectedModeInput ? selectedModeInput.value : "by_scenes";
            const isByScenes = (genMode === "by_scenes");
            
            let projectId = "demo_proj";
            if (window.state && typeof window.state.currentProjectId === "string" && window.state.currentProjectId.trim() !== "") {
                projectId = window.state.currentProjectId;
            } else if (window.state && typeof window.state.currentProject === "string" && window.state.currentProject.trim() !== "") {
                projectId = window.state.currentProject;
            }
            
            const sceneId = "full_script";
            
            if (!targetNode) return alert("Please select a Target GPU Node first.");

            const isMultiVoice = !selectedVoiceFile;
            const proj = typeof window.getProj === 'function' ? window.getProj() : null;
            let scenesList = [];

            if (isByScenes) {
                // Jei vartotojas jau turi paruoštus chunks, tiesiogiai panaudojame juos!
                if (Array.isArray(currentProjectChunks) && currentProjectChunks.length > 0) {
                    scenesList = currentProjectChunks.map((c, idx) => {
                        const voiceToUse = selectedVoiceFile || c.voice || (typeof window.resolveVoiceForRole === 'function' ? window.resolveVoiceForRole(c.voiceId || c.character) : '') || '';
                        return {
                            id: c.id || `chunk_${idx}`,
                            sceneId: c.sceneId || `S${idx + 1}`,
                            index: idx,
                            name: c.character ? `${c.sceneId || `S${idx+1}`} (${c.character})` : (c.sceneId || `Scene ${idx + 1}`),
                            character: c.character || '',
                            dialogueIndex: c.dialogueIndex,
                            voiceId: c.voiceId || '',
                            text: (c.text || '').trim(),
                            voice: voiceToUse
                        };
                    }).filter(x => x.text.length > 0);
                } else if (proj && proj.scenes && proj.scenes.length > 0) {
                    // Išskleidžiame scenas ir jų dialogue posūkius į atskirus elementus
                    proj.scenes.forEach((sc, scIdx) => {
                        const scId = sc.id || `S${scIdx + 1}`;
                        if (sc.dialogue && Array.isArray(sc.dialogue) && sc.dialogue.length > 0) {
                            sc.dialogue.forEach((turn, tIdx) => {
                                let voiceKey = turn.voice || "";
                                if (!voiceKey || voiceKey.toLowerCase() === "multi") {
                                    if (tIdx === 0 && sc.refA) voiceKey = `voice_${sc.refA.replace(/\.[^.]+$/, '').toLowerCase()}`;
                                    else if (tIdx === 1 && sc.refB) voiceKey = `voice_${sc.refB.replace(/\.[^.]+$/, '').toLowerCase()}`;
                                    else voiceKey = (sc.voice && sc.voice.toLowerCase() !== "multi") ? sc.voice : "voice_narrator";
                                }
                                let charName = turn.character || turn.speaker;
                                if (!charName || charName.toLowerCase() === "multi") {
                                    charName = voiceKey.replace(/^voice_/i, '').replace(/_/g, ' ').toUpperCase();
                                }
                                const resolvedVoice = selectedVoiceFile || (typeof window.resolveVoiceForRole === 'function' ? window.resolveVoiceForRole(voiceKey) : null) || (typeof window.resolveVoiceForRole === 'function' ? window.resolveVoiceForRole(charName) : null) || voiceKey;
                                if (turn.text && turn.text.trim()) {
                                    scenesList.push({
                                        id: `chunk_${scId}_d${tIdx + 1}`,
                                        sceneId: scId,
                                        index: scenesList.length,
                                        name: `${scId} (${charName})`,
                                        character: charName,
                                        dialogueIndex: tIdx + 1,
                                        voiceId: voiceKey,
                                        text: turn.text.trim(),
                                        voice: resolvedVoice || ''
                                    });
                                }
                            });
                        } else {
                            const scText = (proj.sceneTextById && proj.sceneTextById[sc.id]) || sc.text || sc.prompt || '';
                            let voiceKey = sc.voice || "";
                            if (!voiceKey || voiceKey.toLowerCase() === "multi") {
                                if (sc.refA) voiceKey = `voice_${sc.refA.replace(/\.[^.]+$/, '').toLowerCase()}`;
                                else voiceKey = "voice_narrator";
                            }
                            let charName = sc.character;
                            if (!charName || charName.toLowerCase() === "multi") {
                                if (voiceKey && voiceKey.toLowerCase() !== "multi") charName = voiceKey.replace(/^voice_/i, '').replace(/_/g, ' ').toUpperCase();
                                else if (sc.refA) charName = sc.refA.replace(/\.[^.]+$/, '').toUpperCase();
                                else charName = "NARRATOR";
                            }
                            const resolvedVoice = selectedVoiceFile || (typeof window.resolveVoiceForRole === 'function' ? window.resolveVoiceForRole(voiceKey) : null) || (typeof window.resolveVoiceForRole === 'function' ? window.resolveVoiceForRole(charName) : null) || voiceKey;
                            if (scText && scText.trim()) {
                                scenesList.push({
                                    id: `chunk_${scId}`,
                                    sceneId: scId,
                                    index: scenesList.length,
                                    name: `${scId} (${charName})`,
                                    character: charName,
                                    voiceId: voiceKey,
                                    text: scText.trim(),
                                    voice: resolvedVoice || ''
                                });
                            }
                        }
                    });
                }

                if (scenesList.length === 0) {
                    return alert("No text in scenes for generation! Enter text in scenes or select 'Free Script'.");
                }
            } else {
                if (!text) {
                    // Jei tekstas tuščias, patikriname ar yra scenų tekstas
                    if (proj && proj.scenes && proj.scenes.length > 0) {
                        const joined = proj.scenes.map(s => (proj.sceneTextById && proj.sceneTextById[s.id]) || s.text || s.prompt || "").filter(Boolean).join(" ");
                        if (joined) {
                            if (audioFullScript) audioFullScript.value = joined;
                        } else {
                            return alert("Enter script text or select 'By Scenes'.");
                        }
                    } else {
                        return alert("Enter script text.");
                    }
                }
                if (isMultiVoice && Array.isArray(currentProjectChunks) && currentProjectChunks.length > 0) {
                    scenesList = currentProjectChunks.map((c, idx) => ({
                        id: c.id || `chunk_${idx}`,
                        sceneId: c.sceneId || null,
                        index: idx,
                        name: c.character ? `Dalis #${idx+1} (${c.character})` : `Dalis #${idx+1}`,
                        character: c.character || '',
                        dialogueIndex: c.dialogueIndex,
                        voiceId: c.voiceId || '',
                        text: (c.text || '').trim(),
                        voice: c.voice || (typeof window.resolveVoiceForRole === 'function' ? window.resolveVoiceForRole(c.voiceId || c.character) : '') || ''
                    })).filter(x => x.text.length > 0);
                }
            }
            
            // Užrakiname visus pasirinkimus generavimo metu
            const modeRadios = document.querySelectorAll('input[name="audioGenMode"]');
            modeRadios.forEach(r => r.disabled = true);

            const modeLabels = {
                by_scenes: "🔒 Locked (By Scenes)",
                by_punctuation: "🔒 Locked (By Punctuation)",
                by_sentences: "🔒 Locked (By Sentences)",
                full_script: "🔒 Locked (Free Script)"
            };

            if (audioModeLockBadge) {
                audioModeLockBadge.textContent = modeLabels[genMode] || "🔒 Locked";
                audioModeLockBadge.style.color = (genMode === "by_scenes") ? "#00ffcc" : (genMode === "by_punctuation" ? "#f59e0b" : "var(--accent)");
            }
            if (btnUnlockAudioMode) btnUnlockAudioMode.classList.add("hidden");

            if (proj) {
                proj.audioGenMode = genMode;
                if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
            }

            btnGenerateFullAudio.disabled = true;
            if (fullAudioResultArea) fullAudioResultArea.classList.add("hidden");
            if (fullAudioLoading) fullAudioLoading.classList.remove("hidden");
            
            let statusLoadingText = "Segmenting and dispatching to GPU... ⏳";
            if (isByScenes) {
                statusLoadingText = `Ruošiama ${scenesList.length} scenų generavimui į GPU... ⏳`;
            } else if (genMode === "by_punctuation") {
                statusLoadingText = "Splitting by punctuation and dispatching to GPU... ⏳";
            } else if (genMode === "by_sentences") {
                statusLoadingText = "Splitting by sentences and dispatching to GPU... ⏳";
            }
            if (fullAudioStatusText) fullAudioStatusText.textContent = statusLoadingText;
            if (fullAudioProgressBarWrap) fullAudioProgressBarWrap.classList.remove("hidden");
            if (fullAudioProgressBar) fullAudioProgressBar.style.width = "5%";
            
            currentAudioSessionId = "tts_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
            activeFullAudioAbortController = new AbortController();
            
            try {
                const effectiveText = audioFullScript ? audioFullScript.value.trim() : text;
                const res = await fetch("/api/audio/generate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                        text: effectiveText, 
                        voice: selectedVoiceFile || "", 
                        targetNode: targetNode,
                        projectId: projectId,
                        sceneId: sceneId,
                        sessionId: currentAudioSessionId,
                        silenceMs: 300,
                        mode: genMode,
                        scenesList: scenesList
                    }),
                    signal: activeFullAudioAbortController.signal
                });
                
                const data = await res.json();
                
                if (data.status === "cancelled") {
                    if (typeof window.toast === "function") window.toast("Cancelled", "Audio generation was stopped.", "warn");
                    return;
                }
                
                if (res.ok && data.status === "success") {
                    if (fullAudioProgressBar) fullAudioProgressBar.style.width = "100%";
                    if (fullAudioPlayer) fullAudioPlayer.src = data.url;
                    if (btnDownloadFullAudio) btnDownloadFullAudio.href = data.url;
                    
                    if (data.chunks && Array.isArray(data.chunks)) {
                        currentProjectChunks = data.chunks;
                    }
                    updateChunksUI();

                    const currentProj = window.getProj ? window.getProj() : null;
                    if (currentProj) {
                        currentProj.audioTrack = data.url;
                        currentProj.audioChunks = currentProjectChunks;
                        if (isByScenes) {
                            if (!currentProj.sceneAudioById) currentProj.sceneAudioById = {};
                            currentProjectChunks.forEach(c => {
                                if (c.sceneId) currentProj.sceneAudioById[c.sceneId] = c.audio_url || c.url;
                            });
                        }
                        if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
                    }

                    if (fullAudioLoading) fullAudioLoading.classList.add("hidden");
                    if (fullAudioResultArea) fullAudioResultArea.classList.remove("hidden");

                    if (btnUnlockAudioMode) btnUnlockAudioMode.classList.remove("hidden");

                    // Automatiškai atnaujiname laiko juostą (Timeline) fone
                    if (typeof window.autoAlignTimeline === "function") {
                        window.autoAlignTimeline(data.url);
                    } else if (typeof window.renderTimeline === "function") {
                        window.renderTimeline();
                    }
                    
                    if (typeof window.renderRenderStudioUI === 'function') window.renderRenderStudioUI();

                    if (typeof window.toast === "function") {
                        window.toast("Generation Complete", `Synthesized ${currentProjectChunks.length} audio segments (${isByScenes ? 'By Scenes' : 'Free Script'}).`, "success");
                    }
                } else {
                    throw new Error(data.detail || data.message || "Unknown error");
                }
            } catch (e) {
                if (e.name === 'AbortError') {
                    console.log("Audio generation aborted by user.");
                } else {
                    alert("Full audio generation failed: " + e.message);
                }
            } finally {
                btnGenerateFullAudio.disabled = false;
                if (fullAudioLoading) fullAudioLoading.classList.add("hidden");
                if (fullAudioProgressBarWrap) fullAudioProgressBarWrap.classList.add("hidden");
                activeFullAudioAbortController = null;
                const radios = document.querySelectorAll('input[name="audioGenMode"]');
                radios.forEach(r => r.disabled = false);
                if (audioModeLockBadge) {
                    audioModeLockBadge.textContent = "🔓 Unlocked";
                    audioModeLockBadge.style.color = "var(--muted)";
                }
            }
        });
    }

    // CANCEL BUTTON HANDLER
    if (btnCancelFullAudio) {
        btnCancelFullAudio.addEventListener("click", async () => {
            const targetNode = audioTargetNode ? audioTargetNode.value : "";
            if (fullAudioStatusText) fullAudioStatusText.textContent = "🛑 Atšaukiama... Siunčiamas signalas GPU.";
            
            if (activeFullAudioAbortController) {
                activeFullAudioAbortController.abort();
            }
            
            try {
                await fetch("/api/audio/cancel", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                        sessionId: currentAudioSessionId || "", 
                        targetNode: targetNode 
                    })
                });
            } catch (err) {
                console.warn("Cancel request error:", err);
            }
            
            btnGenerateFullAudio.disabled = false;
            if (fullAudioLoading) fullAudioLoading.classList.add("hidden");
            if (fullAudioProgressBarWrap) fullAudioProgressBarWrap.classList.add("hidden");
            const radios = document.querySelectorAll('input[name="audioGenMode"]');
            radios.forEach(r => r.disabled = false);
            if (audioModeLockBadge) {
                audioModeLockBadge.textContent = "🔓 Unlocked";
                audioModeLockBadge.style.color = "var(--muted)";
            }
            if (typeof window.toast === "function") window.toast("Generation Cancelled", "Audio generation was stopped.", "warn");
        });
    }

    // ==========================================
    // 7. PREPARE PROJECT CHUNKS (MULTI-VOICE / SCENES / SCRIPT)
    // ==========================================
    window.prepareProjectChunks = function(preferredMode = null, showModal = true) {
        const proj = typeof window.getProj === 'function' ? window.getProj() : null;
        if (typeof window.detectProjectVoiceRoles === 'function') {
            window.detectProjectVoiceRoles();
        }

        const modeInput = document.querySelector('input[name="audioGenMode"]:checked');
        const genMode = preferredMode || (proj && proj.audioGenMode) || (modeInput ? modeInput.value : "by_scenes");
        const newChunks = [];

        const hasScenes = proj && Array.isArray(proj.scenes) && proj.scenes.length > 0;

        if (genMode === "by_scenes" || hasScenes) {
            if (hasScenes) {
                proj.scenes.forEach((sc, scIdx) => {
                    const scId = sc.id || `S${scIdx + 1}`;
                    if (sc.dialogue && Array.isArray(sc.dialogue) && sc.dialogue.length > 0) {
                        sc.dialogue.forEach((turn, tIdx) => {
                            let voiceKey = turn.voice || "";
                            if (!voiceKey || voiceKey.toLowerCase() === "multi") {
                                if (tIdx === 0 && sc.refA) voiceKey = `voice_${sc.refA.replace(/\.[^.]+$/, '').toLowerCase()}`;
                                else if (tIdx === 1 && sc.refB) voiceKey = `voice_${sc.refB.replace(/\.[^.]+$/, '').toLowerCase()}`;
                                else voiceKey = (sc.voice && sc.voice.toLowerCase() !== "multi") ? sc.voice : "voice_narrator";
                            }
                            let charName = turn.character || turn.speaker;
                            if (!charName || charName.toLowerCase() === "multi") {
                                charName = voiceKey.replace(/^voice_/i, '').replace(/_/g, ' ').toUpperCase();
                            }
                            const resolvedVoice = (typeof window.resolveVoiceForRole === 'function' ? window.resolveVoiceForRole(voiceKey) : null) ||
                                                  (typeof window.resolveVoiceForRole === 'function' ? window.resolveVoiceForRole(charName) : null) ||
                                                  (availableVoicesList.includes(voiceKey + '.wav') ? voiceKey + '.wav' : (availableVoicesList.includes(voiceKey) ? voiceKey : ''));
                            newChunks.push({
                                id: `chunk_${scId}_d${tIdx + 1}`,
                                index: newChunks.length,
                                sceneId: scId,
                                dialogueIndex: tIdx + 1,
                                character: charName,
                                voice: resolvedVoice || "",
                                voiceId: voiceKey,
                                text: (turn.text || "").trim(),
                                audio_url: turn.audioUrl || turn.audio || "",
                                duration: 0,
                                filename: ""
                            });
                        });
                    } else {
                        const scText = (proj.sceneTextById && proj.sceneTextById[sc.id]) || sc.text || sc.prompt || "";
                        let voiceKey = sc.voice || "";
                        if (!voiceKey || voiceKey.toLowerCase() === "multi") {
                            if (sc.refA) voiceKey = `voice_${sc.refA.replace(/\.[^.]+$/, '').toLowerCase()}`;
                            else voiceKey = "voice_narrator";
                        }
                        let charName = sc.character;
                        if (!charName || charName.toLowerCase() === "multi") {
                            if (voiceKey && voiceKey.toLowerCase() !== "multi") charName = voiceKey.replace(/^voice_/i, '').replace(/_/g, ' ').toUpperCase();
                            else if (sc.refA) charName = sc.refA.replace(/\.[^.]+$/, '').toUpperCase();
                            else charName = "NARRATOR";
                        }
                        const resolvedVoice = (typeof window.resolveVoiceForRole === 'function' ? window.resolveVoiceForRole(voiceKey) : null) ||
                                              (typeof window.resolveVoiceForRole === 'function' ? window.resolveVoiceForRole(charName) : null) ||
                                              (availableVoicesList.includes(voiceKey + '.wav') ? voiceKey + '.wav' : (availableVoicesList.includes(voiceKey) ? voiceKey : ''));
                        newChunks.push({
                            id: `chunk_${scId}`,
                            index: newChunks.length,
                            sceneId: scId,
                            character: charName,
                            voice: resolvedVoice || "",
                            voiceId: voiceKey,
                            text: (scText || "").trim(),
                            audio_url: sc.audioUrl || sc.audio || "",
                            duration: 0,
                            filename: ""
                        });
                    }
                });
            }
        }

        // Jei scenų nėra arba jos tuščios, bet yra tekstas laukelyje:
        if (newChunks.length === 0 && audioFullScript && audioFullScript.value.trim()) {
            const fullText = audioFullScript.value.trim();
            const rawLines = fullText.split(/\r?\n+/).map(l => l.trim()).filter(Boolean);
            const dialoguePattern = /^(?:\[([^\]]+)\]|([A-Za-z0-9_\-\s]{2,20})\s*:)\s*(.+)$/;

            const hasDialogueCues = rawLines.some(l => dialoguePattern.test(l));

            if (hasDialogueCues) {
                rawLines.forEach((line, lIdx) => {
                    const match = line.match(dialoguePattern);
                    if (match) {
                        const charName = (match[1] || match[2] || "").trim().toUpperCase();
                        const lineText = (match[3] || "").trim();
                        const voiceKey = `voice_${charName.toLowerCase()}`;
                        const resolvedVoice = (typeof window.resolveVoiceForRole === 'function' ? window.resolveVoiceForRole(voiceKey) : null) ||
                                              (typeof window.resolveVoiceForRole === 'function' ? window.resolveVoiceForRole(charName) : null) ||
                                              (availableVoicesList.includes(voiceKey + '.wav') ? voiceKey + '.wav' : (availableVoicesList.includes(voiceKey) ? voiceKey : ''));
                        newChunks.push({
                            id: `chunk_txt_${lIdx + 1}`,
                            index: newChunks.length,
                            sceneId: null,
                            character: charName,
                            voice: resolvedVoice || "",
                            voiceId: voiceKey,
                            text: lineText,
                            audio_url: "",
                            duration: 0,
                            filename: ""
                        });
                    } else {
                        newChunks.push({
                            id: `chunk_txt_${lIdx + 1}`,
                            index: newChunks.length,
                            sceneId: null,
                            character: "NARRATOR",
                            voice: availableVoicesList.includes("narrator.wav") ? "narrator.wav" : (availableVoicesList[0] || ""),
                            voiceId: "voice_narrator",
                            text: line,
                            audio_url: "",
                            duration: 0,
                            filename: ""
                        });
                    }
                });
            } else {
                const sentences = fullText.split(/(?<=[.!?…])\s+/).filter(Boolean);
                sentences.forEach((sText, sIdx) => {
                    newChunks.push({
                        id: `chunk_sent_${sIdx + 1}`,
                        index: sIdx,
                        sceneId: null,
                        character: "NARRATOR",
                        voice: availableVoicesList.includes("narrator.wav") ? "narrator.wav" : (availableVoicesList[0] || ""),
                        voiceId: "voice_narrator",
                        text: sText.trim(),
                        audio_url: "",
                        duration: 0,
                        filename: ""
                    });
                });
            }
        }

        if (newChunks.length > 0) {
            currentProjectChunks = newChunks;
            if (proj) {
                proj.audioChunks = currentProjectChunks;
                if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
            }
            updateChunksUI();
            if (typeof renderChunksModalList === 'function') {
                renderChunksModalList();
            }
            if (showModal) {
                openAudioChunksModal();
                if (typeof window.toast === 'function') {
                    window.toast("Chunks Paruošti", `Sėkmingai suformuota ${newChunks.length} dalių pagal personažus!`, "success");
                }
            }
        } else {
            if (showModal) {
                alert("No text for chunk formation. Import scenes or type script text.");
            }
        }

        return newChunks;
    };

    // ==========================================
    // 8. AUDIO CHUNKS INSPECTOR & REGENERATION MODAL
    // ==========================================
    function openAudioChunksModal() {
        if (!modalAudioChunks) return;
        updateModalVoiceSelect();

        // Jei chunks sąrašas tuščias, bet turime scenas arba tekstą, automatiškai suformuojame chunks be garso!
        if (!currentProjectChunks || currentProjectChunks.length === 0) {
            const proj = window.getProj ? window.getProj() : null;
            if ((proj && proj.scenes && proj.scenes.length > 0) || (audioFullScript && audioFullScript.value.trim())) {
                window.prepareProjectChunks(null, false);
            }
        }

        renderChunksModalList();
        
        const proj = window.getProj ? window.getProj() : null;
        if (proj && proj.audioTrack && modalMasterAudioPlayer) {
            modalMasterAudioPlayer.src = proj.audioTrack;
        } else if (fullAudioPlayer && fullAudioPlayer.src && modalMasterAudioPlayer) {
            modalMasterAudioPlayer.src = fullAudioPlayer.src;
        }
        
        modalAudioChunks.classList.add("show");
    }

    if (btnManageChunks) {
        btnManageChunks.addEventListener("click", openAudioChunksModal);
    }
    if (btnManageChunksTop) {
        btnManageChunksTop.addEventListener("click", openAudioChunksModal);
    }

    const btnPrepareDirect = document.getElementById("btnPrepareChunksDirect");
    if (btnPrepareDirect) {
        btnPrepareDirect.addEventListener("click", () => {
            window.prepareProjectChunks(null, true);
        });
    }

    // Setup Audio Transitions UI & Toggles
    if (btnToggleAudioProcessing && audioProcessingPanel) {
        btnToggleAudioProcessing.addEventListener("click", () => {
            const isHidden = audioProcessingPanel.style.display === "none";
            audioProcessingPanel.style.display = isHidden ? "flex" : "none";
            btnToggleAudioProcessing.innerHTML = isHidden ? "🎛️ Transitions & Processing ▴" : "🎛️ Transitions & Processing ▾";
        });
    }

    function updateTransitionFieldsVisibility() {
        const tType = chunksTransitionType ? chunksTransitionType.value : "smart_cadence";
        const lbl = document.getElementById("chunksSilenceMsLabel");
        
        if (tType === "smart_cadence") {
            if (chunksTransitionMsWrap) chunksTransitionMsWrap.style.display = "none";
            if (chunksSilenceMsWrap) {
                chunksSilenceMsWrap.style.display = "flex";
                if (lbl) lbl.textContent = "Bazinė pauzė:";
            }
        } else if (tType === "crossfade") {
            if (chunksTransitionMsWrap) {
                chunksTransitionMsWrap.style.display = "flex";
                if (chunksTransitionMsLabel) chunksTransitionMsLabel.textContent = "Crossfade:";
            }
            if (chunksSilenceMsWrap) chunksSilenceMsWrap.style.display = "none";
        } else if (tType === "gap") {
            if (chunksTransitionMsWrap) chunksTransitionMsWrap.style.display = "none";
            if (chunksSilenceMsWrap) {
                chunksSilenceMsWrap.style.display = "flex";
                if (lbl) lbl.textContent = "Tylos tarpas:";
            }
        } else if (tType === "fade") {
            if (chunksTransitionMsWrap) {
                chunksTransitionMsWrap.style.display = "flex";
                if (chunksTransitionMsLabel) chunksTransitionMsLabel.textContent = "Fade trukmė:";
            }
            if (chunksSilenceMsWrap) {
                chunksSilenceMsWrap.style.display = "flex";
                if (lbl) lbl.textContent = "Inter-sentence Pause:";
            }
        }
    }

    if (chunksTransitionType) {
        chunksTransitionType.addEventListener("change", updateTransitionFieldsVisibility);
        updateTransitionFieldsVisibility();
    }

    function getAudioProcessingParams() {
        const trimSilence = chunksTrimSilence ? chunksTrimSilence.checked : true;
        const trimThresholdDb = chunksTrimThreshold ? parseInt(chunksTrimThreshold.value, 10) || -42 : -42;
        const transitionType = chunksTransitionType ? chunksTransitionType.value : "smart_cadence";
        const transitionMs = chunksTransitionMs ? parseInt(chunksTransitionMs.value, 10) || 80 : 80;
        const silenceMs = chunksModalSilenceInput ? parseInt(chunksModalSilenceInput.value, 10) || 380 : 380;
        return { trimSilence, trimThresholdDb, transitionType, transitionMs, silenceMs };
    }

    function detectTextCadence(text) {
        const clean = (text || "").trim().replace(/["'”»\)]+$/, '').trim();
        if (!clean) return { type: "continuous", label: "Tęsinys 🔗 ~40ms", color: "#6ea8ff" };
        if (clean.endsWith("...") || clean.endsWith("…")) {
            return { type: "ellipsis", label: "Daugtaškis ⏳ ~530ms", color: "#f59e0b" };
        }
        if (/[.!?]$/.test(clean)) {
            return { type: "sentence_end", label: "Sentence End 🛑 ~380ms", color: "#10b981" };
        }
        if (/[,;:\—\-]$/.test(clean)) {
            return { type: "clause", label: "Kablelis ⏸️ ~170ms", color: "#00ffcc" };
        }
        return { type: "continuous", label: "Tęsinys 🔗 ~40ms", color: "#6ea8ff" };
    }

    // Helper to silently restitch and update master track
    async function triggerRestitchSilently(customMsg = "") {
        if (!currentProjectChunks || currentProjectChunks.length === 0) return;
        const proc = getAudioProcessingParams();
        let projectId = (window.state && typeof window.state.currentProjectId === "string" && window.state.currentProjectId.trim()) ? window.state.currentProjectId : "demo_proj";
        
        try {
            const res = await fetch("/api/audio/restitch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    projectId: projectId,
                    sceneId: "full_script",
                    chunks: currentProjectChunks,
                    ...proc
                })
            });
            const data = await res.json();
            if (res.ok && data.status === "success") {
                if (modalMasterAudioPlayer) modalMasterAudioPlayer.src = data.masterAudioUrl;
                if (fullAudioPlayer) fullAudioPlayer.src = data.masterAudioUrl;
                if (btnDownloadFullAudio) btnDownloadFullAudio.href = data.masterAudioUrl;
                if (chunksStitchDurationBadge) chunksStitchDurationBadge.textContent = `⏱️ Duration: ${data.durationSec.toFixed(1)}s`;

                const proj = window.getProj ? window.getProj() : null;
                if (proj) {
                    proj.audioTrack = data.masterAudioUrl;
                    proj.audioChunks = currentProjectChunks;
                    if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
                }
                if (modalChunksStatus && customMsg) {
                    modalChunksStatus.innerHTML = `<span style="color:var(--good);">${customMsg}</span>`;
                }
            }
        } catch (e) {
            console.warn("Silent restitch error:", e);
        }
    }

    // Tiksliai nustato personažo vardą, voiceId ir spalvą pagal scenos veikėją
    function resolveChunkCharacterInfo(chunk, matchedScene, proj) {
        let charName = "";
        let voiceId = chunk.voiceId || "";

        // 1. Jei chunk.character jau yra nurodytas ir tai nėra bendrinis 'MULTI'
        if (chunk.character && String(chunk.character).trim().toUpperCase() !== "MULTI") {
            charName = String(chunk.character).trim().toUpperCase();
        }

        // 2. Jei turime dialogue scenoje (pvz. S5 multi scena su keliais veikėjais)
        if ((!charName || charName === "MULTI") && matchedScene && Array.isArray(matchedScene.dialogue) && matchedScene.dialogue.length > 0) {
            // Bandome pagal dialogueIndex arba id (pvz. chunk_S5_d1 -> 1)
            const dMatch = String(chunk.id || '').match(/_d(\d+)$/i);
            const dIdx = (chunk.dialogueIndex !== undefined && chunk.dialogueIndex !== null) 
                ? (parseInt(chunk.dialogueIndex) - 1) 
                : (dMatch ? (parseInt(dMatch[1]) - 1) : -1);

            if (dIdx >= 0 && matchedScene.dialogue[dIdx]) {
                const turn = matchedScene.dialogue[dIdx];
                const turnKey = turn.voice || turn.character || turn.speaker || "";
                if (turnKey && turnKey.toLowerCase() !== "multi") {
                    voiceId = turn.voice || voiceId;
                    charName = (turn.character || turn.speaker || turnKey.replace(/^voice_/i, '')).replace(/_/g, ' ').toUpperCase();
                }
            }

            // Jei vis dar neradome, bandome pagal sutampantį tekstą
            if (!charName || charName === "MULTI") {
                const cleanText = (chunk.text || "").trim().toLowerCase();
                if (cleanText) {
                    const foundTurn = matchedScene.dialogue.find(t => {
                        const tText = (t.text || "").trim().toLowerCase();
                        return tText && (tText === cleanText || tText.includes(cleanText) || cleanText.includes(tText));
                    });
                    if (foundTurn) {
                        const turnKey = foundTurn.voice || foundTurn.character || foundTurn.speaker || "";
                        if (turnKey && turnKey.toLowerCase() !== "multi") {
                            voiceId = foundTurn.voice || voiceId;
                            charName = (foundTurn.character || foundTurn.speaker || turnKey.replace(/^voice_/i, '')).replace(/_/g, ' ').toUpperCase();
                        }
                    }
                }
            }
        }

        // 3. Jei turime voiceId (pvz. voice_ethan, voice_maya, voice_narrator) ir tai ne multi
        if ((!charName || charName === "MULTI") && voiceId && voiceId.toLowerCase() !== "multi") {
            charName = voiceId.replace(/^voice_/i, '').replace(/_/g, ' ').toUpperCase();
        }

        // 4. Jei chunk.voice yra sugeneruotas Take (pvz. chunk_906d32de.wav), patikriname proj.characterVoices
        if ((!charName || charName === "MULTI") && proj && proj.characterVoices && chunk.voice) {
            const vFile = String(chunk.voice).split('?')[0];
            for (const [rId, rData] of Object.entries(proj.characterVoices)) {
                if (rData.assignedVoice === vFile || (rData.variations && rData.variations.some(v => v.filename === vFile || v.url === chunk.voice))) {
                    charName = (rData.name || rId.replace(/^voice_/i, '')).replace(/_/g, ' ').toUpperCase();
                    if (!voiceId || voiceId === "multi") voiceId = rId;
                    break;
                }
            }
        }

        // 5. Jei chunk.voice pats nurodo personažo vardą (pvz. ethan.wav, narrator.wav)
        if ((!charName || charName === "MULTI") && chunk.voice) {
            const vBase = String(chunk.voice).replace(/\.[^.]+$/, '').replace(/^voice_/i, '').trim();
            if (vBase && vBase.toLowerCase() !== "multi" && !vBase.startsWith("chunk_") && !vBase.startsWith("take_")) {
                charName = vBase.replace(/_/g, ' ').toUpperCase();
            }
        }

        // 6. Jei matchedScene turi aiškų voice (ir tai ne 'multi')
        if ((!charName || charName === "MULTI") && matchedScene && matchedScene.voice && matchedScene.voice.toLowerCase() !== "multi") {
            charName = matchedScene.voice.replace(/^voice_/i, '').replace(/_/g, ' ').toUpperCase();
            if (!voiceId || voiceId === "multi") voiceId = matchedScene.voice;
        }

        // 7. Jei matchedScene turi refA (pvz. ETHAN_lead.png -> ETHAN)
        if ((!charName || charName === "MULTI") && matchedScene && matchedScene.refA) {
            charName = matchedScene.refA.replace(/\.[^.]+$/, '').replace(/_lead|_tech|_ref/gi, '').replace(/_/g, ' ').toUpperCase();
            if (!voiceId || voiceId === "multi") voiceId = `voice_${charName.toLowerCase()}`;
        }

        // 8. Galutinis fallback
        if (!charName || charName === "MULTI") {
            charName = "NARRATOR";
            if (!voiceId || voiceId === "multi") voiceId = "voice_narrator";
        }

        return { charName, voiceId };
    }

    function populateChunkCard(card, chunk, index) {
        card.id = `chunk-card-${index}`;
        card.className = "audio-chunk-card";

        // Užtikriname, kad chunk turi variacijų struktūrą
        if (!chunk.variations || !Array.isArray(chunk.variations)) {
            chunk.variations = [];
            if (chunk.audio_url) {
                chunk.variations.push({
                    id: `var_orig_${chunk.id || index}`,
                    url: chunk.audio_url,
                    filename: chunk.filename || '',
                    duration: chunk.duration || 0,
                    createdAt: 'Take #1',
                    isMain: true
                });
            }
        }

        const hasAudio = !!chunk.audio_url;
        const proj = typeof window.getProj === 'function' ? window.getProj() : null;
        const allScenes = proj ? (proj.scenes || []) : [];

        const matchedScene = allScenes.find((s, sIdx) => 
            (chunk.sceneId && (String(s.id) === String(chunk.sceneId) || String(s.id).replace(/^S/i,'') === String(chunk.sceneId).replace(/^S/i,''))) ||
            (chunk.index !== undefined ? chunk.index === sIdx : index === sIdx)
        );
        const sceneBadge = matchedScene ? `<span class="badge" style="background:rgba(0,255,204,0.12); color:#00ffcc; border:1px solid rgba(0,255,204,0.3); font-size:10.5px; font-weight:800;">Scene #${matchedScene.id}${chunk.dialogueIndex ? ` (${chunk.dialogueIndex} dalis)` : ''}</span>` : '';
        
        // Tiksliai išsprendžiame personažo tapatybę ir spalvą pagal ID (vietoj 'MULTI')
        const { charName, voiceId } = resolveChunkCharacterInfo(chunk, matchedScene, proj);
        chunk.character = charName;
        if (!chunk.voiceId || chunk.voiceId.toLowerCase() === "multi") chunk.voiceId = voiceId;

        const charStyle = (typeof window.getCharacterVoiceStyle === 'function') 
            ? window.getCharacterVoiceStyle(voiceId || charName) 
            : { color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)', border: 'rgba(56, 189, 248, 0.4)' };

        const charBadge = `<span class="badge" style="background: ${charStyle.bg}; color: ${charStyle.color}; border: 1px solid ${charStyle.border}; font-weight: 800; font-size: 11px; padding: 2px 7px;">🎭 ${charName}</span>`;

        card.style.borderLeft = `4px solid ${charStyle.color}`;

        const curVoice = chunk.voice || (typeof window.resolveVoiceForRole === 'function' ? window.resolveVoiceForRole(chunk.voiceId || charName) : '') || (chunksModalVoiceSelect ? chunksModalVoiceSelect.value : (selectedVoiceFile || ''));
        if (!chunk.voice && curVoice) {
            chunk.voice = curVoice;
        }
        const voicesList = Array.isArray(availableVoicesList) ? availableVoicesList : [];
        let voiceOptionsHtml = `<option value="">-- Auto (${chunksModalVoiceSelect ? chunksModalVoiceSelect.value || 'Default' : 'Default'}) --</option>`;
        voicesList.forEach(v => {
            const isSel = (chunk.voice === v) || (!chunk.voice && curVoice === v);
            voiceOptionsHtml += `<option value="${v}" ${isSel ? 'selected' : ''}>🎙️ ${v}</option>`;
        });
        if (chunk.voice && !voicesList.includes(chunk.voice)) {
            voiceOptionsHtml += `<option value="${chunk.voice}" selected>🎙️ ${chunk.voice} (Take / Personažas)</option>`;
        }
        const voiceSelectHtml = `
            <div class="flex items-center" style="gap: 5px;">
                <span class="text-xs text-muted" style="font-size: 10px; font-weight: 700;">Balsas:</span>
                <select class="chunk-voice-select" style="max-width: 140px; padding: 2px 6px; font-size: 11px; background: rgba(0,0,0,0.5); border: 1px solid var(--border); border-radius: 4px; color: #fff;">
                    ${voiceOptionsHtml}
                </select>
            </div>
        `;

        const cadence = detectTextCadence(chunk.text || "");
        const cadenceBadge = `<span class="badge" style="background: rgba(255,255,255,0.05); color: ${cadence.color}; border: 1px solid ${cadence.color}40; font-size: 10px; font-weight: 700;" title="Smart transition based on punctuation">${cadence.label}</span>`;

        // Variacijų (Takes) HTML
        let variationsHtml = '';
        if (chunk.variations && chunk.variations.length > 0) {
            const chipsHtml = chunk.variations.map((v, vIdx) => {
                const isMain = v.isMain || (v.url === chunk.audio_url);
                const durLabel = v.duration ? `<span class="mono" style="opacity: 0.8; font-size: 10px;">${v.duration}s</span>` : '';
                return `
                    <div class="chunk-take-chip ${isMain ? 'active-main' : ''}" data-take-idx="${vIdx}">
                        <span style="font-weight: 700;">${v.createdAt || `Take #${vIdx + 1}`}</span>
                        ${durLabel}
                        <button type="button" class="chunk-take-btn btn-take-play" title="Perklausyti Take #${vIdx + 1}">▶️</button>
                        ${isMain ? `
                            <span style="color: #10b981; font-size: 10px; font-weight: 800;">⭐ MAIN</span>
                        ` : `
                            <button type="button" class="chunk-take-btn btn-take-set-main" style="color: var(--accent); font-weight: 700;" title="Pasirinkti šį Take kaip pagrindinį">⭐ Pasirinkti</button>
                            <button type="button" class="chunk-take-btn btn-take-delete" style="color: var(--bad); opacity: 0.7;" title="Delete šį Take">✕</button>
                        `}
                    </div>
                `;
            }).join('');

            variationsHtml = `
                <div class="chunk-variations-container">
                    <div class="flex items-center justify-between" style="margin-bottom: 2px;">
                        <span class="text-xs text-muted" style="font-weight: 700; font-size: 11px;">
                            🎙️ Variacijos / Takes (${chunk.variations.length}):
                        </span>
                        <span class="text-xs text-muted" style="font-size: 10.5px;">Pasirinkite, kurį Take naudoti galutiniame takelyje</span>
                    </div>
                    <div class="chunk-variations-list">
                        ${chipsHtml}
                    </div>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="chunk-card-header">
                <div class="flex items-center" style="gap: 8px; flex-wrap: wrap;">
                    <span class="chunk-num-badge">#${index + 1}</span>
                    ${sceneBadge}
                    ${charBadge}
                    <span class="badge ${hasAudio ? 'ready' : 'warn'} text-xs">${hasAudio ? 'Paruošta 🟢' : 'Reikia Generate ⚠️'}</span>
                    <span class="chunk-cadence-badge-wrap">${cadenceBadge}</span>
                    ${chunk.duration ? `<span class="mono text-muted text-xs" style="font-size: 11px;">(${chunk.duration}s)</span>` : ''}
                </div>
                <div class="flex items-center" style="gap: 8px; flex-wrap: wrap;">
                    ${voiceSelectHtml}
                    <button class="btn icon text-xs btn-chunk-up" title="Pakelti aukštyn" ${index === 0 ? 'disabled' : ''} style="width: 26px; height: 26px; padding: 0;">⬆</button>
                    <button class="btn icon text-xs btn-chunk-down" title="Nuleisti žemyn" ${index === currentProjectChunks.length - 1 ? 'disabled' : ''} style="width: 26px; height: 26px; padding: 0;">⬇</button>
                    <button class="btn bad icon text-xs btn-chunk-del" title="Delete dalį" style="width: 26px; height: 26px; padding: 0;">🗑️</button>
                </div>
            </div>

            <textarea class="chunk-textarea" placeholder="Įveskite šios dalies tekstą...">${chunk.text || ""}</textarea>

            ${variationsHtml}

            <div class="chunk-card-controls">
                <div class="chunk-player-wrap">
                    ${hasAudio ? `
                        <audio controls src="${chunk.audio_url}" style="height: 30px; flex: 1; outline: none; border-radius: 15px;"></audio>
                    ` : `
                        <span class="text-xs text-muted"><em>Audio not synthesized yet</em></span>
                    `}
                </div>

                <button class="btn primary text-xs btn-chunk-regen" style="padding: 6px 14px; font-weight: bold;">
                    <span class="regen-icon">🔄</span> Regenerate Chunk
                </button>
            </div>
        `;

        // Textarea input event (ir reaktyvus skyrybos atpažinimas)
        const textarea = card.querySelector(".chunk-textarea");
        textarea.addEventListener("input", (e) => {
            chunk.text = e.target.value;
            const currentProj = window.getProj ? window.getProj() : null;
            if (currentProj) {
                currentProj.audioChunks = currentProjectChunks;
            }
            const newCadence = detectTextCadence(e.target.value);
            const badgeWrap = card.querySelector(".chunk-cadence-badge-wrap");
            if (badgeWrap) {
                badgeWrap.innerHTML = `<span class="badge" style="background: rgba(255,255,255,0.05); color: ${newCadence.color}; border: 1px solid ${newCadence.color}40; font-size: 10px; font-weight: 700;" title="Smart transition based on punctuation">${newCadence.label}</span>`;
            }
        });

        // Per-chunk Voice Select listener
        const chunkVoiceSelect = card.querySelector(".chunk-voice-select");
        if (chunkVoiceSelect) {
            chunkVoiceSelect.addEventListener("change", (e) => {
                chunk.voice = e.target.value;
                const currentProj = window.getProj ? window.getProj() : null;
                if (currentProj) {
                    currentProj.audioChunks = currentProjectChunks;
                    if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
                }
            });
        }

        // Variations events
        card.querySelectorAll(".chunk-take-chip").forEach(chip => {
            const takeIdx = parseInt(chip.getAttribute("data-take-idx"), 10);
            const targetVar = chunk.variations[takeIdx];
            if (!targetVar) return;

            // Play preview
            const btnPlay = chip.querySelector(".btn-take-play");
            if (btnPlay) {
                btnPlay.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const cardAudio = card.querySelector("audio");
                    if (cardAudio) {
                        cardAudio.src = targetVar.url;
                        cardAudio.play();
                        if (typeof window.toast === "function") {
                            window.toast("Perklausoma variacija", `Grojamas ${targetVar.createdAt || `Take #${takeIdx + 1}`}`, "info");
                        }
                    }
                });
            }

            // Set as Main
            const btnSetMain = chip.querySelector(".btn-take-set-main");
            if (btnSetMain) {
                btnSetMain.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    chunk.variations.forEach(v => v.isMain = false);
                    targetVar.isMain = true;
                    chunk.audio_url = targetVar.url;
                    chunk.filename = targetVar.filename;
                    chunk.duration = targetVar.duration;
                    chunk.mainId = targetVar.id;

                    const curProj = window.getProj ? window.getProj() : null;
                    if (curProj) {
                        curProj.audioChunks = currentProjectChunks;
                        if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
                    }

                    populateChunkCard(card, chunk, index);
                    if (typeof window.toast === "function") {
                        window.toast("Set as Main", `Dalis #${index + 1}: activated ${targetVar.createdAt || `Take #${takeIdx + 1}`}.`, "success");
                    }
                    await triggerRestitchSilently(`✓ Aktyvuotas ${targetVar.createdAt || 'Take'} ir persiūtas master audio!`);
                });
            }

            // Delete Take
            const btnDelTake = chip.querySelector(".btn-take-delete");
            if (btnDelTake) {
                btnDelTake.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    if (!confirm(`Are you sure you want to delete ${targetVar.createdAt || `Take #${takeIdx + 1}`}?`)) return;

                    chunk.variations.splice(takeIdx, 1);
                    if (targetVar.isMain && chunk.variations.length > 0) {
                        chunk.variations[0].isMain = true;
                        chunk.audio_url = chunk.variations[0].url;
                        chunk.filename = chunk.variations[0].filename;
                        chunk.duration = chunk.variations[0].duration;
                    } else if (chunk.variations.length === 0) {
                        chunk.audio_url = "";
                        chunk.filename = "";
                        chunk.duration = 0;
                    }

                    const curProj = window.getProj ? window.getProj() : null;
                    if (curProj) {
                        curProj.audioChunks = currentProjectChunks;
                        if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
                    }

                    populateChunkCard(card, chunk, index);
                    await triggerRestitchSilently("✓ Variation removed, audio track updated.");
                });
            }
        });

        // Move Up
        card.querySelector(".btn-chunk-up").addEventListener("click", () => {
            if (index > 0) {
                const temp = currentProjectChunks[index];
                currentProjectChunks[index] = currentProjectChunks[index - 1];
                currentProjectChunks[index - 1] = temp;
                currentProjectChunks.forEach((c, idx) => c.index = idx);
                renderChunksModalList();
            }
        });

        // Move Down
        card.querySelector(".btn-chunk-down").addEventListener("click", () => {
            if (index < currentProjectChunks.length - 1) {
                const temp = currentProjectChunks[index];
                currentProjectChunks[index] = currentProjectChunks[index + 1];
                currentProjectChunks[index + 1] = temp;
                currentProjectChunks.forEach((c, idx) => c.index = idx);
                renderChunksModalList();
            }
        });

        // Delete Chunk
        card.querySelector(".btn-chunk-del").addEventListener("click", () => {
            if (confirm(`Ar tikrai ištrinti dalį #${index + 1}?`)) {
                currentProjectChunks.splice(index, 1);
                currentProjectChunks.forEach((c, idx) => c.index = idx);
                renderChunksModalList();
                triggerRestitchSilently("✓ Segment removed, track re-stitched.");
            }
        });

        // Single Chunk Regenerate (Saugi asinchroninė generacija be kitų kortelių naikinimo)
        const btnRegen = card.querySelector(".btn-chunk-regen");
        btnRegen.addEventListener("click", () => {
            window.regenerateChunkByIndex(index);
        });
    }

    window.regenerateChunkByIndex = async function(index) {
        const card = document.getElementById(`chunk-card-${index}`);
        if (typeof window.isGlobalDemoMode === "function" && window.isGlobalDemoMode()) {
            const btnRegen = card ? card.querySelector(".btn-chunk-regen") : null;
            if (btnRegen) {
                btnRegen.disabled = true;
                btnRegen.innerHTML = '<span class="spin-anim">⏳</span> Synthesizing...';
            }
            if (card) card.classList.add("generating");
            if (modalChunksStatus) modalChunksStatus.innerHTML = `<span style="color:var(--accent);">Synthesizing Segment #${index + 1}... ⏳</span>`;
            await new Promise(r => setTimeout(r, 450));

            const chunk = currentProjectChunks[index];
            if (chunk) {
                const chunkUrl = `/audio/chunk_s${index + 1}.wav`;
                chunk.audio_url = chunkUrl;
                chunk.url = chunkUrl;
                chunk.filename = `chunk_s${index + 1}.wav`;
                if (!chunk.variations) chunk.variations = [];
                chunk.variations.forEach(v => v.isMain = false);
                const newTake = {
                    id: "take_" + Date.now(),
                    url: chunkUrl,
                    filename: chunk.filename,
                    duration: chunk.duration || 3.5,
                    isMain: true,
                    createdAt: `Take #${chunk.variations.length + 1} (Synthesized)`
                };
                chunk.variations.push(newTake);
                if (card) populateChunkCard(card, chunk, index);
            }

            const masterUrl = "/audio/default_full_script_dialogue.wav";
            if (modalMasterAudioPlayer) modalMasterAudioPlayer.src = masterUrl;
            if (fullAudioPlayer) fullAudioPlayer.src = masterUrl;
            if (btnDownloadFullAudio) btnDownloadFullAudio.href = masterUrl;
            if (chunksStitchDurationBadge) chunksStitchDurationBadge.textContent = "⏱️ Duration: 56.0s";

            const curProj = window.getProj ? window.getProj() : null;
            if (curProj) {
                curProj.audioTrack = masterUrl;
                curProj.audioChunks = currentProjectChunks;
                if (!curProj.sceneAudioById) curProj.sceneAudioById = {};
                curProj.sceneAudioById["S" + (index + 1)] = `/audio/chunk_s${index + 1}.wav`;
                curProj.sceneAudioById[String(index + 1)] = `/audio/chunk_s${index + 1}.wav`;
                if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
            }

            updateChunksUI();
            if (btnRegen) {
                btnRegen.disabled = false;
                btnRegen.innerHTML = '<span class="regen-icon">🔄</span> Regenerate Chunk';
            }
            if (card) card.classList.remove("generating");
            if (modalChunksStatus) modalChunksStatus.innerHTML = `<span style="color:var(--good);">✓ Segment #${index + 1} updated!</span>`;
            return { status: "success" };
        }
        if (!card) return;
        const textarea = card.querySelector(".chunk-textarea");
        const btnRegen = card.querySelector(".btn-chunk-regen");
        const chunk = currentProjectChunks[index];
        if (!chunk) return;

        const targetNode = audioTargetNode ? audioTargetNode.value : "";
        const voice = chunk.voice || (typeof window.resolveVoiceForRole === 'function' ? window.resolveVoiceForRole(chunk.voiceId || chunk.character) : '') || (chunksModalVoiceSelect ? chunksModalVoiceSelect.value : (selectedVoiceFile || ""));
        const chunkText = textarea ? textarea.value.trim() : (chunk.text || "").trim();
        const procParams = getAudioProcessingParams();
        
        if (!targetNode) {
            alert("Please select a Target GPU Node.");
            throw new Error("No target GPU node selected");
        }
        if (!voice) {
            alert(`Please select a voice for segment #${index + 1}`);
            throw new Error(`No voice assigned to chunk #${index + 1}`);
        }
        if (!chunkText) {
            alert(`Text field cannot be empty (Segment #${index + 1}).`);
            throw new Error("Chunk text is empty");
        }

        let projectId = "demo_proj";
        if (window.state && typeof window.state.currentProjectId === "string" && window.state.currentProjectId.trim() !== "") {
            projectId = window.state.currentProjectId;
        }
        const sceneId = "full_script";

        if (btnRegen) {
            btnRegen.disabled = true;
            btnRegen.innerHTML = '<span class="spin-anim">⏳</span> Generuojama...';
        }
        card.classList.add("generating");
        if (modalChunksStatus) modalChunksStatus.innerHTML = `<span style="color:var(--accent);">Synthesizing segment #${index + 1} (${chunk.character || 'Personažas'})... ⏳</span>`;

        try {
            const res = await fetch("/api/audio/regenerate_chunk", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    projectId: projectId,
                    sceneId: sceneId,
                    chunkIndex: index,
                    text: chunkText,
                    voice: voice,
                    targetNode: targetNode,
                    allChunks: currentProjectChunks,
                    ...procParams
                })
            });

            const data = await res.json();
            if (res.ok && data.status === "success") {
                if (data.chunk) {
                    currentProjectChunks[index] = data.chunk;
                }
                
                // Atnaujiname TIK šios vienintelės kortelės DOM
                populateChunkCard(card, currentProjectChunks[index], index);
                
                if (data.masterAudioUrl) {
                    if (modalMasterAudioPlayer) modalMasterAudioPlayer.src = data.masterAudioUrl;
                    if (fullAudioPlayer) fullAudioPlayer.src = data.masterAudioUrl;
                    if (btnDownloadFullAudio) btnDownloadFullAudio.href = data.masterAudioUrl;
                }
                if (chunksStitchDurationBadge && data.durationSec) {
                    chunksStitchDurationBadge.textContent = `⏱️ Duration: ${data.durationSec.toFixed(1)}s`;
                }

                const curProj = window.getProj ? window.getProj() : null;
                if (curProj) {
                    if (data.masterAudioUrl) curProj.audioTrack = data.masterAudioUrl;
                    curProj.audioChunks = currentProjectChunks;
                    if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
                }

                updateChunksUI();

                const anyOtherGenerating = !!audioChunksList.querySelector('.audio-chunk-card.generating');
                if (!anyOtherGenerating) {
                    await triggerRestitchSilently(`✓ All chunks synthesized and master track stitched!`);
                } else {
                    if (modalChunksStatus) modalChunksStatus.innerHTML = `<span style="color:var(--good);">✓ Dalis #${index + 1} updated. Other segments still generating... ⏳</span>`;
                }

                if (typeof window.toast === "function") {
                    window.toast("New Take Created", `Dalis #${index + 1} successfully updated.`, "success");
                }
                return data;
            } else {
                throw new Error(data.detail || data.message || "Regeneration failed");
            }
        } catch (e) {
            if (modalChunksStatus) modalChunksStatus.innerHTML = `<span style="color:var(--bad);">Klaida: ${e.message}</span>`;
            if (typeof window.toast === "function") {
                window.toast("Generation Error", e.message, "error");
            }
            throw e;
        } finally {
            if (btnRegen) {
                btnRegen.disabled = false;
                btnRegen.innerHTML = '<span class="regen-icon">🔄</span> Regenerate Chunk';
            }
            card.classList.remove("generating");
        }
    }

    function renderChunksModalList() {
        if (!audioChunksList) return;
        audioChunksList.innerHTML = "";
        
        if (!currentProjectChunks || currentProjectChunks.length === 0) {
            audioChunksList.innerHTML = `
                <div class="text-center text-muted" style="padding: 40px 20px;">
                    <div style="font-size: 32px; margin-bottom: 8px;">🧩</div>
                    <div style="font-weight: 600; font-size: 14px;">No audio segments synthesized yet.</div>
                    <div class="text-xs mt-1">Synthesize script audio or click '+ Add Sentence'.</div>
                </div>
            `;
            updateChunksUI();
            return;
        }

        updateChunksUI();

        currentProjectChunks.forEach((chunk, index) => {
            const card = document.createElement("div");
            populateChunkCard(card, chunk, index);
            audioChunksList.appendChild(card);
        });
    }

    // Add Chunk in Modal
    if (btnAddChunkInModal) {
        btnAddChunkInModal.addEventListener("click", () => {
            const nextIdx = currentProjectChunks.length;
            currentProjectChunks.push({
                id: `chunk_${nextIdx}`,
                index: nextIdx,
                text: "",
                audio_url: "",
                filename: ""
            });
            renderChunksModalList();
            
            // Focus on new chunk textarea
            setTimeout(() => {
                const newCard = document.getElementById(`chunk-card-${nextIdx}`);
                if (newCard) {
                    const ta = newCard.querySelector(".chunk-textarea");
                    if (ta) ta.focus();
                }
            }, 50);
        });
    }

    // Greita Chunks Paieška pagal tekstą arba sceną
    const searchInput = document.getElementById("chunksModalSearchInput");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            const query = e.target.value.toLowerCase().trim();
            document.querySelectorAll(".audio-chunk-card").forEach(card => {
                const txt = card.querySelector(".chunk-textarea")?.value.toLowerCase() || "";
                const header = card.querySelector(".chunk-card-header")?.textContent.toLowerCase() || "";
                if (!query || txt.includes(query) || header.includes(query)) {
                    card.style.display = "";
                } else {
                    card.style.display = "none";
                }
            });
        });
    }

    // Suformuoti Chunks tiesiogiai pagal scenas (1:1 santykis)
    const btnLoadFromScenes = document.getElementById("btnLoadChunksFromScenes");
    if (btnLoadFromScenes) {
        btnLoadFromScenes.addEventListener("click", () => {
            const proj = window.getProj ? window.getProj() : null;
            if (!proj || !proj.scenes || proj.scenes.length === 0) {
                return alert("No scenes in current project.");
            }
            if (currentProjectChunks.length > 0 && !confirm("Do you want to re-distribute audio segments directly from each scene's text (1 scene = 1 segment)?")) {
                return;
            }
            const newChunks = [];
            proj.scenes.forEach((sc, scIdx) => {
                const scId = sc.id || `S${scIdx + 1}`;
                if (sc.dialogue && Array.isArray(sc.dialogue) && sc.dialogue.length > 0) {
                    sc.dialogue.forEach((turn, tIdx) => {
                        let voiceKey = turn.voice || "";
                        if (!voiceKey || voiceKey.toLowerCase() === "multi") {
                            if (tIdx === 0 && sc.refA) voiceKey = `voice_${sc.refA.replace(/\.[^.]+$/, '').toLowerCase()}`;
                            else if (tIdx === 1 && sc.refB) voiceKey = `voice_${sc.refB.replace(/\.[^.]+$/, '').toLowerCase()}`;
                            else voiceKey = (sc.voice && sc.voice.toLowerCase() !== "multi") ? sc.voice : "voice_narrator";
                        }
                        let charName = turn.character || turn.speaker;
                        if (!charName || charName.toLowerCase() === "multi") {
                            charName = voiceKey.replace(/^voice_/i, '').replace(/_/g, ' ').toUpperCase();
                        }
                        const resolvedVoice = (typeof window.resolveVoiceForRole === 'function' ? window.resolveVoiceForRole(voiceKey) : voiceKey) || voiceKey;
                        newChunks.push({
                            id: `chunk_${scId}_d${tIdx + 1}`,
                            index: newChunks.length,
                            sceneId: scId,
                            dialogueIndex: tIdx + 1,
                            character: charName,
                            voice: resolvedVoice,
                            voiceId: voiceKey,
                            text: turn.text || "",
                            audio_url: "",
                            filename: ""
                        });
                    });
                } else {
                    const scText = (proj.sceneTextById && proj.sceneTextById[sc.id]) || sc.text || sc.prompt || "";
                    let voiceKey = sc.voice || "";
                    if (!voiceKey || voiceKey.toLowerCase() === "multi") {
                        if (sc.refA) voiceKey = `voice_${sc.refA.replace(/\.[^.]+$/, '').toLowerCase()}`;
                        else voiceKey = "voice_narrator";
                    }
                    let charName = sc.character;
                    if (!charName || charName.toLowerCase() === "multi") {
                        if (voiceKey && voiceKey.toLowerCase() !== "multi") charName = voiceKey.replace(/^voice_/i, '').replace(/_/g, ' ').toUpperCase();
                        else if (sc.refA) charName = sc.refA.replace(/\.[^.]+$/, '').toUpperCase();
                        else charName = "NARRATOR";
                    }
                    const resolvedVoice = (typeof window.resolveVoiceForRole === 'function' ? window.resolveVoiceForRole(voiceKey) : voiceKey) || voiceKey;
                    newChunks.push({
                        id: `chunk_${scId}`,
                        index: newChunks.length,
                        sceneId: scId,
                        character: charName,
                        voice: resolvedVoice,
                        voiceId: voiceKey,
                        text: scText,
                        audio_url: sc.audioUrl || sc.audio || "",
                        filename: ""
                    });
                }
            });
            currentProjectChunks = newChunks;
            proj.audioChunks = currentProjectChunks;
            if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
            renderChunksModalList();
            if (typeof window.toast === 'function') {
                window.toast("By Scenes (1:1)", `Successfully formed ${currentProjectChunks.length} segments from scenes!`, "success");
            }
        });
    }

    // Perskirstyti Chunks pagal skyrybos ženklus (. , ! ? ; : — …)
    const btnSplitByPunctuation = document.getElementById("btnSplitByPunctuation");
    if (btnSplitByPunctuation) {
        btnSplitByPunctuation.addEventListener("click", async () => {
            let fullText = (audioFullScript && audioFullScript.value.trim()) || "";
            const proj = window.getProj ? window.getProj() : null;
            if (!fullText && proj && proj.scenes && proj.scenes.length > 0) {
                fullText = proj.scenes.map(s => (proj.sceneTextById && proj.sceneTextById[s.id]) || s.text || s.prompt || "").filter(Boolean).join(" ");
            }
            if (!fullText && currentProjectChunks.length > 0) {
                fullText = currentProjectChunks.map(c => c.text).filter(Boolean).join(" ");
            }
            if (!fullText) {
                return alert("No text to split. Enter script text or create scenes.");
            }
            if (currentProjectChunks.length > 0 && !confirm("Do you want to split text strictly by punctuation marks (. , ! ? ; : — ...)?")) {
                return;
            }
            btnSplitByPunctuation.disabled = true;
            try {
                const res = await fetch("/api/audio/split_preview", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text: fullText, mode: "by_punctuation" })
                });
                const data = await res.json();
                if (res.ok && data.chunks) {
                    currentProjectChunks = data.chunks;
                    if (proj) {
                        proj.audioChunks = currentProjectChunks;
                        if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
                    }
                    renderChunksModalList();
                    if (typeof window.toast === 'function') {
                        window.toast("Skaidymas pagal skyrybą", `Text successfully split into ${data.chunks.length} segments!`, "success");
                    }
                } else {
                    throw new Error(data.detail || "Error splitting text");
                }
            } catch (err) {
                alert("Nepavyko suskaidyti teksto: " + err.message);
            } finally {
                btnSplitByPunctuation.disabled = false;
            }
        });
    }

    // Generate visus trūkstamus Chunks
    const btnGenerateAllChunks = document.getElementById("btnGenerateAllChunks");
    if (btnGenerateAllChunks) {
        btnGenerateAllChunks.addEventListener("click", async () => {
            if (typeof window.isGlobalDemoMode === "function" && window.isGlobalDemoMode()) {
                if (!currentProjectChunks || currentProjectChunks.length === 0) {
                    await simulateFullAudioGeneration();
                    return;
                }
                btnGenerateAllChunks.disabled = true;
                for (let i = 0; i < currentProjectChunks.length; i++) {
                    btnGenerateAllChunks.innerHTML = `<span class="spin-anim">⏳</span> Synthesizing (${i + 1}/${currentProjectChunks.length})...`;
                    await window.regenerateChunkByIndex(i);
                }
                btnGenerateAllChunks.disabled = false;
                btnGenerateAllChunks.innerHTML = '⚡ Generate All Segments';
                if (modalChunksStatus) modalChunksStatus.innerHTML = `<span style="color:var(--good);">✓ All ${currentProjectChunks.length} audio chunks generated & stitched!</span>`;
                return;
            }
            if (!currentProjectChunks || currentProjectChunks.length === 0) {
                return alert("No segments to generate.");
            }
            let toGen = currentProjectChunks.map((c, idx) => ({ c, idx })).filter(x => !x.c.audio_url || x.c.audio_url.trim() === "");
            if (toGen.length === 0) {
                if (!confirm("All chunks already have synthesized audio. Do you want to regenerate all?")) return;
                toGen = currentProjectChunks.map((c, idx) => ({ c, idx }));
            }
            btnGenerateAllChunks.disabled = true;
            let successCount = 0;
            let errorCount = 0;
            
            for (let i = 0; i < toGen.length; i++) {
                const item = toGen[i];
                btnGenerateAllChunks.innerHTML = `<span class="spin-anim">⏳</span> Generuojama (${i + 1}/${toGen.length})...`;
                try {
                    await window.regenerateChunkByIndex(item.idx);
                    successCount++;
                } catch (err) {
                    console.warn(`Error generating segment #${item.idx + 1}:`, err);
                    errorCount++;
                }
            }
            btnGenerateAllChunks.disabled = false;
            btnGenerateAllChunks.innerHTML = '⚡ Generate All Segments';
            if (typeof window.toast === "function") {
                if (errorCount === 0) {
                    window.toast("Generation Complete", `Successfully generated all ${successCount} chunks!`, "success");
                } else {
                    window.toast("Generation Complete", `Generated: ${successCount}, failed: ${errorCount}`, "warning");
                }
            }
        });
    }

    // Užkrauti viso scenarijaus tekstą sujungiant iš visų scenų
    const btnLoadScriptScenes = document.getElementById("btnLoadScriptFromScenes");
    if (btnLoadScriptScenes) {
        btnLoadScriptScenes.addEventListener("click", () => {
            const proj = window.getProj ? window.getProj() : null;
            if (!proj || !proj.scenes || proj.scenes.length === 0) {
                return alert("Project has no scenes.");
            }
            const full = proj.scenes.map(s => (proj.sceneTextById && proj.sceneTextById[s.id]) || s.text || s.prompt || "").filter(Boolean).join("\n\n");
            const ta = document.getElementById("audioFullScript");
            if (ta) {
                ta.value = full;
                const charCount = document.getElementById("scriptCharCount");
                if (charCount) charCount.textContent = `${full.length} simb.`;
                if (typeof window.toast === 'function') {
                    window.toast("Scenerijus", "All scene texts successfully merged into script input.", "success");
                }
            }
        });
    }

    // Re-stitch all chunks button
    if (btnRestitchModalAudio) {
        btnRestitchModalAudio.addEventListener("click", async () => {
            if (typeof window.isGlobalDemoMode === "function" && window.isGlobalDemoMode()) {
                btnRestitchModalAudio.disabled = true;
                btnRestitchModalAudio.innerHTML = '<span class="spin-anim">⏳</span> Stitching...';
                if (modalChunksStatus) modalChunksStatus.innerHTML = `<span style="color:var(--accent);">Stitching master audio track... ⏳</span>`;
                await new Promise(r => setTimeout(r, 450));
                btnRestitchModalAudio.disabled = false;
                btnRestitchModalAudio.innerHTML = '🔄 Re-stitch Master Track';
                const masterUrl = "/audio/default_full_script_dialogue.wav";
                if (modalMasterAudioPlayer) modalMasterAudioPlayer.src = masterUrl;
                if (fullAudioPlayer) fullAudioPlayer.src = masterUrl;
                if (btnDownloadFullAudio) btnDownloadFullAudio.href = masterUrl;
                if (chunksStitchDurationBadge) chunksStitchDurationBadge.textContent = "⏱️ Duration: 56.0s";
                if (modalChunksStatus) modalChunksStatus.innerHTML = `<span style="color:var(--good);">✓ All ${currentProjectChunks.length} segments unified into master track!</span>`;
                return;
            }
            if (!currentProjectChunks || currentProjectChunks.length === 0) {
                return alert("No segments to stitch.");
            }
            const proc = getAudioProcessingParams();
            
            let projectId = "demo_proj";
            if (window.state && typeof window.state.currentProjectId === "string" && window.state.currentProjectId.trim() !== "") {
                projectId = window.state.currentProjectId;
            }
            
            btnRestitchModalAudio.disabled = true;
            btnRestitchModalAudio.innerHTML = '<span class="spin-anim">⏳</span> Jungiama...';
            if (modalChunksStatus) modalChunksStatus.innerHTML = `<span style="color:var(--accent);">Stitching track with selected transitions... ⏳</span>`;
            
            try {
                const res = await fetch("/api/audio/restitch", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        projectId: projectId,
                        sceneId: "full_script",
                        chunks: currentProjectChunks,
                        ...proc
                    })
                });
                
                const data = await res.json();
                if (res.ok && data.status === "success") {
                    if (modalMasterAudioPlayer) modalMasterAudioPlayer.src = data.masterAudioUrl;
                    if (fullAudioPlayer) fullAudioPlayer.src = data.masterAudioUrl;
                    if (btnDownloadFullAudio) btnDownloadFullAudio.href = data.masterAudioUrl;
                    if (chunksStitchDurationBadge && data.durationSec) {
                        chunksStitchDurationBadge.textContent = `⏱️ Duration: ${data.durationSec.toFixed(1)}s`;
                    }
                    
                    const proj = window.getProj ? window.getProj() : null;
                    if (proj) {
                        proj.audioTrack = data.masterAudioUrl;
                        proj.audioChunks = currentProjectChunks;
                        if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
                    }
                    
                    if (typeof window.autoAlignTimeline === "function") {
                        window.autoAlignTimeline(data.masterAudioUrl);
                    } else if (typeof window.renderTimeline === "function") {
                        window.renderTimeline();
                    }
                    
                    if (modalChunksStatus) modalChunksStatus.innerHTML = `<span style="color:var(--good);">✓ Visi ${currentProjectChunks.length} chunks sujungti (${data.durationSec.toFixed(1)}s) su perėjimais!</span>`;
                    if (typeof window.toast === "function") {
                        window.toast("Audio Sujungtas", `Sėkmingai persiūta ${currentProjectChunks.length} dalių (${data.durationSec.toFixed(1)}s).`, "success");
                    }
                } else {
                    throw new Error(data.detail || "Stitch error");
                }
            } catch (e) {
                alert("Stitching Error: " + e.message);
                if (modalChunksStatus) modalChunksStatus.innerHTML = `<span style="color:var(--bad);">Klaida: ${e.message}</span>`;
            } finally {
                btnRestitchModalAudio.disabled = false;
                btnRestitchModalAudio.innerHTML = '🔄 Re-stitch Master Track';
            }
        });
    }

    // Save & Update Timeline button in Modal
    if (btnSaveApplyChunks) {
        btnSaveApplyChunks.addEventListener("click", () => {
            const proj = window.getProj ? window.getProj() : null;
            if (proj) {
                proj.audioChunks = currentProjectChunks;
                if (modalMasterAudioPlayer && modalMasterAudioPlayer.src) {
                    proj.audioTrack = modalMasterAudioPlayer.src;
                }
                if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
            }
            
            if (proj && proj.audioTrack) {
                if (typeof window.autoAlignTimeline === "function") {
                    window.autoAlignTimeline(proj.audioTrack);
                } else if (typeof window.renderTimeline === "function") {
                    window.renderTimeline();
                }
            }

            if (modalAudioChunks) modalAudioChunks.classList.remove("show");
            if (typeof window.renderRenderStudioUI === 'function') window.renderRenderStudioUI();
            if (typeof window.toast === "function") {
                window.toast("Saved to Timeline", "Audio segments and soundtrack successfully moved to timeline! 🎬", "success");
            }
        });
    }

    // ==========================================
    // ==========================================
    // 8. Add Full Script to Timeline (Guaranteed Event Delegation)
    // ==========================================
    document.addEventListener("click", (e) => {
        const btn = e.target.closest("#btnAddToTimeline");
        if (!btn) return;

        const fullAudio = document.getElementById("fullAudioPlayer");
        const btnDownload = document.getElementById("btnDownloadFullAudio");
        const audioSrc = (fullAudio && (fullAudio.src || fullAudio.currentSrc)) || (btnDownload && btnDownload.href) || "";

        if (!audioSrc || audioSrc === window.location.href) {
            return (typeof toast === 'function' ? toast("Audio Error", "Please generate audio track first.", "error") : alert("Please generate audio track first."));
        }

        const proj = typeof window.getProj === 'function' ? window.getProj() : null;
        if (proj) {
            proj.audioTrack = audioSrc;
            if (typeof currentProjectChunks !== 'undefined' && currentProjectChunks && currentProjectChunks.length > 0) {
                proj.audioChunks = currentProjectChunks;
            }
            if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
        }

        if (typeof window.autoAlignTimeline === "function") {
            window.autoAlignTimeline(audioSrc);
        } else if (typeof window.renderTimeline === "function") {
            window.renderTimeline();
        }

        if (typeof window.renderRenderStudioUI === 'function') window.renderRenderStudioUI();

        // Switch to Timeline tab automatically so the user immediately sees the result
        const navTimeline = document.querySelector('.nav-item[data-tab="timeline"]');
        if (navTimeline) {
            navTimeline.click();
        }

        if (typeof window.toast === "function") {
            window.toast("Added to Timeline", "Audio track successfully added to timeline! 🎵", "success");
        }
    });
});
