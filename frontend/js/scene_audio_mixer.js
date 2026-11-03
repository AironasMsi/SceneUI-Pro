// ============================================================================

// SCENE AUDIO MIXER & MASTER CONTROLLER (RENDER TAB COMPONENT)

// ============================================================================



(function() {

  const mixerState = {

    tracks: {},

    currentPlayingId: null,

    previewAudioEl: null

  };



  window.openSceneAudioMixer = function() {

    const proj = window.getProj ? window.getProj() : (window.proj || {});

    if (!proj || !proj.scenes || proj.scenes.length === 0) {

      if (typeof toast === 'function') toast("Mikseris", "No scenes created in active project!", "warn");

      return;

    }



    mixerState.tracks = {};

    if (mixerState.previewAudioEl) {

      try { mixerState.previewAudioEl.pause(); } catch(e){}

      mixerState.previewAudioEl = null;

    }

    mixerState.currentPlayingId = null;



    const countBadge = document.getElementById("mixerSceneCountBadge");

    if (countBadge) countBadge.textContent = `${proj.scenes.length} Scenų`;



    const container = document.getElementById("mixerTrackList");

    if (!container) return;



    let html = "";



    proj.scenes.forEach((sc, idx) => {

      const scId = String(sc.id);

      const normId = scId.replace(/^S/i, '');

      const out = window.getOutput ? window.getOutput(sc.id) : (proj.outputs || []).find(o => String(o.sceneId) === scId || String(o.sceneId) === normId);

      const mainVar = out && out.variations ? (out.variations.find(v => v.id === out.mainId) || out.variations[0]) : null;



      const hasVideo = Boolean(mainVar && (mainVar.type === 'video' || (mainVar.url && mainVar.url.toLowerCase().endsWith('.mp4'))));

      const thumbUrl = (mainVar && mainVar.url) ? mainVar.url : ((sc.img || sc.url) ? (sc.img || sc.url) : '');



      // Sound settings: prioritize existing saved mixer state in renderSettings.sceneVolumes, fallback to mainVar / scene

      const mixEntry = (proj.renderSettings?.sceneVolumes && (proj.renderSettings.sceneVolumes[normId] || proj.renderSettings.sceneVolumes[scId] || proj.renderSettings.sceneVolumes[`S${normId}`])) || null;



      let isMuted = false;

      let vol = 1.0;



      if (mixEntry) {

        isMuted = mixEntry.enabled === false;

        vol = typeof mixEntry.volume === 'number' ? mixEntry.volume : 1.0;

      } else if (mainVar) {

        if (mainVar.soundEnabled !== undefined) isMuted = !mainVar.soundEnabled;

        else if (mainVar.params && mainVar.params.soundEnabled !== undefined) isMuted = !mainVar.params.soundEnabled;

        else if (sc.soundEnabled !== undefined) isMuted = !sc.soundEnabled;



        if (typeof mainVar.soundVolume === 'number') vol = mainVar.soundVolume;

        else if (mainVar.params && typeof mainVar.params.soundVolume === 'number') vol = mainVar.params.soundVolume;

        else if (typeof sc.soundVolume === 'number') vol = sc.soundVolume;

      } else if (sc.soundEnabled !== undefined || typeof sc.soundVolume === 'number') {

        if (sc.soundEnabled !== undefined) isMuted = !sc.soundEnabled;

        if (typeof sc.soundVolume === 'number') vol = sc.soundVolume;

      }



      const volPct = Math.round(vol * 100);



      // Tikriname, ar scena turi dialogą/kalbą

      const hasDialogue = Boolean(

        (sc.speaker && sc.speaker.trim() && sc.speaker.toLowerCase() !== 'pasakotojas' && sc.speaker.toLowerCase() !== 'narrator' && sc.text && sc.text.trim()) ||

        (sc.dialogue && sc.dialogue.trim()) ||

        (sc.h3_prompt && sc.h3_prompt.trim()) ||

        (mainVar && (mainVar.isLipsync || (mainVar.params && mainVar.params.isLipsync)))

      );



      // SFX takelio atranka:

      // Vartotojo reikalavimas: šiame mikseryje reguliuojame TIK SFX (aplinkos / foley garsus arba nedialoginio video garsą)!

      // Veikėjo balsas ar video dialogas čia NIEKADA negali patekti.

      let sfxUrl = null;

      let sfxBadge = "";



      // 1. Pirmas prioritetas: atskiras SFX failas iš sceneSfxById (MMAudio arba ištrauktas Native SFX)

      if (proj.sceneSfxById) {

        sfxUrl = proj.sceneSfxById[normId] || proj.sceneSfxById[scId] || proj.sceneSfxById[`s${normId}`] || proj.sceneSfxById[`S${normId}`] || null;

      }



      if (sfxUrl) {

        sfxBadge = `<span class="badge" style="font-size: 9px; padding: 1px 5px; background: rgba(245,158,11,0.2); color: #fbbf24; border: 1px solid rgba(245,158,11,0.4);">🔊 SFX</span>`;

      } else if (!hasDialogue && hasVideo && mainVar && mainVar.url) {

        // 2. Nedialoginė scena: video integruotas garsas yra grynas SFX fonas

        sfxUrl = mainVar.url;

        sfxBadge = `<span class="badge" style="font-size: 9px; padding: 1px 5px; background: rgba(56,189,248,0.2); color: #38bdf8; border: 1px solid rgba(56,189,248,0.35);">🎬 Video SFX</span>`;

      } else if (hasDialogue) {

        // Scene su dialogu, bet neturi atskiro SFX - dialogas eina per Voice, čia SFX nėra

        sfxBadge = `<span class="badge" style="font-size: 9px; padding: 1px 5px; background: rgba(168,85,247,0.15); color: #c084fc; border: 1px solid rgba(168,85,247,0.3);">🗣️ Tik balsas (be SFX)</span>`;

      } else {

        sfxBadge = `<span class="badge" style="font-size: 9px; padding: 1px 5px; background: rgba(255,255,255,0.06); color: var(--muted);">Tyla</span>`;

      }



      const audioUrl = sfxUrl;



      mixerState.tracks[scId] = {

        scId: scId,

        normId: normId,

        baseVol: volPct,

        curVol: volPct,

        isMuted: isMuted,

        audioUrl: audioUrl,

        mainVar: mainVar,

        scene: sc,

        hasDialogue: hasDialogue

      };



      const titleText = sc.text || sc.prompt || `Scene #${idx + 1}`;



      html += `

        <div class="mixer-track-row flex items-center justify-between" data-scene-id="${scId}" style="background: rgba(16,23,35,0.7); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 8px 12px; gap: 12px;">

          <!-- Left: Thumbnail & Scene Info -->

          <div class="flex items-center" style="gap: 10px; width: 230px; min-width: 210px;">

            <div style="width: 44px; height: 32px; border-radius: 4px; overflow: hidden; background: #000; border: 1px solid rgba(255,255,255,0.1); flex-shrink: 0; display: flex; align-items: center; justify-content: center;">

              ${thumbUrl ? (hasVideo ? `<video src="${thumbUrl}" muted style="width:100%; height:100%; object-fit:cover;"></video>` : `<img src="${thumbUrl}" style="width:100%; height:100%; object-fit:cover;" />`) : `<span style="font-size:12px;">🎬</span>`}

            </div>

            <div style="overflow: hidden;">

              <div class="flex items-center" style="gap: 6px;">

                <strong style="color: #fff; font-size: 12px;">S${normId}</strong>

                <span class="badge" style="font-size: 9px; padding: 0 4px; background: ${hasVideo ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.06)'}; color: ${hasVideo ? '#38bdf8' : 'var(--muted)'};">

                  ${hasVideo ? '🎬 Video' : '🖼️ Foto'}

                </span>

                ${sfxBadge}

              </div>

              <div class="text-muted" style="font-size: 10.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 155px;" title="${escapeHtml(titleText)}">${escapeHtml(titleText)}</div>

            </div>

          </div>



          <!-- Center: Audio Play Preview Button & Mute Toggle -->

          <div class="flex items-center" style="gap: 6px;">

            ${audioUrl ? `

              <button type="button" class="btn text-xs mixer-play-btn" data-scene-id="${scId}" onclick="window.mixerPlayAudio('${scId}')" style="padding: 4px 10px; background: rgba(245,158,11,0.15); border: 1px solid rgba(245,158,11,0.35); color: #fbbf24; font-weight: 600;">

                ▶ Klausytis SFX

              </button>

            ` : `

              <button type="button" class="btn text-xs" disabled style="padding: 4px 8px; opacity: 0.5; cursor: not-allowed; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); color: var(--muted); font-size: 10px;" title="Ši scena neturi atskiro SFX garso takelio (dialogas automatiškai eina per Voice)">

                🔇 Nėra SFX

              </button>

            `}

            <button type="button" class="btn text-xs mixer-mute-btn" data-scene-id="${scId}" onclick="window.mixerToggleMute('${scId}')" style="padding: 4px 8px; font-weight: 700; background: ${isMuted ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)'}; border: 1px solid ${isMuted ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}; color: ${isMuted ? '#f87171' : '#34d399'};">

              ${isMuted ? '🔇 Nutildyta' : '🔊 Įjungtas'}

            </button>

          </div>



          <!-- Right: Volume Slider & Val -->

          <div class="flex items-center" style="gap: 10px; flex: 1; max-width: 260px;">

            <input type="range" class="mixer-vol-slider" data-scene-id="${scId}" min="0" max="150" value="${volPct}" oninput="window.mixerUpdateSceneVol('${scId}', this.value)" style="flex: 1; height: 4px; accent-color: #fbbf24; cursor: pointer;" ${!audioUrl ? 'disabled style="flex: 1; height: 4px; accent-color: #fbbf24; cursor: not-allowed; opacity: 0.4;"' : ''} />

            <span class="mono text-xs mixer-vol-val" data-scene-id="${scId}" style="width: 40px; text-align: right; font-weight: 700; color: #fbbf24;">${volPct}%</span>

          </div>

        </div>

      `;

    });



    container.innerHTML = html;



    // Reset master sliders

    const absSlider = document.getElementById("mixerAbsVolSlider");

    const absLabel = document.getElementById("mixerAbsVolLabel");

    if (absSlider) absSlider.value = "100";

    if (absLabel) absLabel.textContent = "100%";



    const relSlider = document.getElementById("mixerRelVolSlider");

    const relLabel = document.getElementById("mixerRelVolLabel");

    if (relSlider) relSlider.value = "0";

    if (relLabel) relLabel.textContent = "0%";



    const modal = document.getElementById("modalSceneAudioMixer");

    if (modal) modal.classList.add("show");

  };



  window.closeSceneAudioMixer = function() {

    if (mixerState.previewAudioEl) {

      try { mixerState.previewAudioEl.pause(); } catch(e){}

      mixerState.previewAudioEl = null;

    }

    mixerState.currentPlayingId = null;

    const modal = document.getElementById("modalSceneAudioMixer");

    if (modal) modal.classList.remove("show");

  };



  // 1. Mute/Unmute All

  window.mixerSetAllMute = function(shouldMute) {

    Object.keys(mixerState.tracks).forEach(id => {

      const t = mixerState.tracks[id];

      t.isMuted = shouldMute;

      const btn = document.querySelector(`.mixer-mute-btn[data-scene-id="${id}"]`);

      if (btn) {

        btn.textContent = shouldMute ? "🔇 Nutildyta" : "🔊 Įjungtas";

        btn.style.background = shouldMute ? "rgba(239,68,68,0.15)" : "rgba(16,185,129,0.15)";

        btn.style.borderColor = shouldMute ? "rgba(239,68,68,0.3)" : "rgba(16,185,129,0.3)";

        btn.style.color = shouldMute ? "#f87171" : "#34d399";

      }

    });

    if (typeof toast === 'function') {

      toast("Mikseris", shouldMute ? "Visi kadrai nutildyti!" : "Visiems kadrams įjungtas garsas!", "info");

    }

  };



  // 2. Absolute Volume (Visiems vienodai)

  window.mixerApplyAbsolute = function(valStr) {

    const val = parseInt(valStr, 10);

    const label = document.getElementById("mixerAbsVolLabel");

    if (label) label.textContent = `${val}%`;



    Object.keys(mixerState.tracks).forEach(id => {

      const t = mixerState.tracks[id];

      t.curVol = val;

      t.baseVol = val;

      const slider = document.querySelector(`.mixer-vol-slider[data-scene-id="${id}"]`);

      if (slider) slider.value = val;

      const valSpan = document.querySelector(`.mixer-vol-val[data-scene-id="${id}"]`);

      if (valSpan) valSpan.textContent = `${val}%`;

    });



    // Reset relative shift slider

    const relSlider = document.getElementById("mixerRelVolSlider");

    const relLabel = document.getElementById("mixerRelVolLabel");

    if (relSlider) relSlider.value = "0";

    if (relLabel) relLabel.textContent = "0%";

  };



  // 3. Relative Shift Volume (Tolygus poslinkis ±delta)

  window.mixerApplyRelative = function(deltaStr) {

    const delta = parseInt(deltaStr, 10);

    const label = document.getElementById("mixerRelVolLabel");

    if (label) label.textContent = (delta > 0 ? `+${delta}%` : `${delta}%`);



    Object.keys(mixerState.tracks).forEach(id => {

      const t = mixerState.tracks[id];

      const newVol = Math.max(0, Math.min(150, t.baseVol + delta));

      t.curVol = newVol;

      const slider = document.querySelector(`.mixer-vol-slider[data-scene-id="${id}"]`);

      if (slider) slider.value = newVol;

      const valSpan = document.querySelector(`.mixer-vol-val[data-scene-id="${id}"]`);

      if (valSpan) valSpan.textContent = `${newVol}%`;

    });

  };



  window.mixerResetRelative = function() {

    const relSlider = document.getElementById("mixerRelVolSlider");

    if (relSlider) {

      relSlider.value = "0";

      window.mixerApplyRelative(0);

    }

  };



  // 4. Per-Scene Controls

  window.mixerToggleMute = function(sceneId) {

    const t = mixerState.tracks[sceneId];

    if (!t) return;

    t.isMuted = !t.isMuted;



    const btn = document.querySelector(`.mixer-mute-btn[data-scene-id="${sceneId}"]`);

    if (btn) {

      btn.textContent = t.isMuted ? "🔇 Nutildyta" : "🔊 Įjungtas";

      btn.style.background = t.isMuted ? "rgba(239,68,68,0.15)" : "rgba(16,185,129,0.15)";

      btn.style.borderColor = t.isMuted ? "rgba(239,68,68,0.3)" : "rgba(16,185,129,0.3)";

      btn.style.color = t.isMuted ? "#f87171" : "#34d399";

    }



    if (mixerState.currentPlayingId === sceneId && mixerState.previewAudioEl) {

      mixerState.previewAudioEl.volume = t.isMuted ? 0 : Math.min(1, t.curVol / 100.0);

    }

  };



  window.mixerUpdateSceneVol = function(sceneId, valStr) {

    const val = parseInt(valStr, 10);

    const t = mixerState.tracks[sceneId];

    if (!t) return;

    t.curVol = val;

    t.baseVol = val; // Direct adjustment updates base



    const valSpan = document.querySelector(`.mixer-vol-val[data-scene-id="${sceneId}"]`);

    if (valSpan) valSpan.textContent = `${val}%`;



    if (mixerState.currentPlayingId === sceneId && mixerState.previewAudioEl) {

      mixerState.previewAudioEl.volume = t.isMuted ? 0 : Math.min(1, val / 100.0);

    }

  };



  // 5. Audio Preview Playback

  window.mixerPlayAudio = function(sceneId) {

    const t = mixerState.tracks[sceneId];

    if (!t || !t.audioUrl) {

      if (typeof toast === 'function') toast("Mikseris", "Ši scena neturi atskiro SFX garso takelio! Dialogas eina per Voice takelį.", "info");

      return;

    }



    // If already playing this scene, toggle pause

    if (mixerState.currentPlayingId === sceneId && mixerState.previewAudioEl) {

      if (!mixerState.previewAudioEl.paused) {

        mixerState.previewAudioEl.pause();

        const btn = document.querySelector(`.mixer-play-btn[data-scene-id="${sceneId}"]`);

        if (btn) btn.innerHTML = "▶ Klausytis SFX";

        return;

      } else {

        mixerState.previewAudioEl.play();

        const btn = document.querySelector(`.mixer-play-btn[data-scene-id="${sceneId}"]`);

        if (btn) btn.innerHTML = "⏸ Pauzė";

        return;

      }

    }



    // Stop previously playing audio

    if (mixerState.previewAudioEl) {

      try { mixerState.previewAudioEl.pause(); } catch(e){}

      if (mixerState.currentPlayingId) {

        const prevBtn = document.querySelector(`.mixer-play-btn[data-scene-id="${mixerState.currentPlayingId}"]`);

        if (prevBtn) prevBtn.innerHTML = "▶ Klausytis SFX";

      }

    }



    const audio = new Audio(t.audioUrl);

    audio.volume = t.isMuted ? 0 : Math.min(1, t.curVol / 100.0);

    mixerState.previewAudioEl = audio;

    mixerState.currentPlayingId = sceneId;



    const playBtn = document.querySelector(`.mixer-play-btn[data-scene-id="${sceneId}"]`);

    if (playBtn) playBtn.innerHTML = "⏸ Pauzė";



    audio.onended = () => {

      if (playBtn) playBtn.innerHTML = "▶ Klausytis SFX";

      mixerState.currentPlayingId = null;

    };



    audio.onerror = () => {

      if (playBtn) playBtn.innerHTML = "▶ Klausytis SFX";

      mixerState.currentPlayingId = null;

    };



    audio.play().catch(err => {

      console.warn("Mixer audio playback failed:", err);

      if (playBtn) playBtn.innerHTML = "▶ Klausytis SFX";

      mixerState.currentPlayingId = null;

    });

  };



  // Automatinis pauzavimas perjungus naršyklės skirtuką (Tab)

  document.addEventListener("visibilitychange", () => {

    if (document.hidden && mixerState.previewAudioEl && !mixerState.previewAudioEl.paused) {

      mixerState.previewAudioEl.pause();

      if (mixerState.currentPlayingId) {

        const btn = document.querySelector(`.mixer-play-btn[data-scene-id="${mixerState.currentPlayingId}"]`);

        if (btn) btn.innerHTML = "▶ Klausytis SFX";

      }

    }

  });



  // 6. Save Audio Mixer Settings

  window.saveSceneAudioMixer = function() {

    const proj = window.getProj ? window.getProj() : (window.proj || {});

    if (!proj) return;



    if (!proj.renderSettings) proj.renderSettings = {};

    if (!proj.renderSettings.sceneVolumes) proj.renderSettings.sceneVolumes = {};



    let modifiedCount = 0;



    Object.keys(mixerState.tracks).forEach(id => {

      const t = mixerState.tracks[id];

      const volFloat = Math.round((t.curVol / 100.0) * 100) / 100;

      const isEnabled = !t.isMuted;



      // Update in mainVar

      if (t.mainVar) {

        t.mainVar.soundVolume = volFloat;

        t.mainVar.soundEnabled = isEnabled;

        if (!t.mainVar.params) t.mainVar.params = {};

        t.mainVar.params.soundVolume = volFloat;

        t.mainVar.params.soundEnabled = isEnabled;

      }



      // Update in scene

      if (t.scene) {

        t.scene.soundVolume = volFloat;

        t.scene.soundEnabled = isEnabled;

      }



      // Update in renderSettings map

      proj.renderSettings.sceneVolumes[t.normId] = {

        volume: volFloat,

        enabled: isEnabled

      };

      proj.renderSettings.sceneVolumes[t.scId] = {

        volume: volFloat,

        enabled: isEnabled

      };



      modifiedCount++;

    });



    if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();

    if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images');



    if (typeof toast === 'function') {

      toast("Garso mikseris", `Sėkmingai išsaugoti garso lygiai ${modifiedCount} scenų!`, "success");

    }



    window.closeSceneAudioMixer();

  };



  function escapeHtml(str) {

    if (!str) return "";

    return String(str).replace(/[&<>"']/g, function(m) {

      switch(m) {

        case "&": return "&amp;";

        case "<": return "&lt;";

        case ">": return "&gt;";

        case '"': return "&quot;";

        case "'": return "&#039;";

        default: return m;

      }

    });

  }

})();

