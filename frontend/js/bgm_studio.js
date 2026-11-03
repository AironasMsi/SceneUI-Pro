// ============================================================================
// BGM STUDIO (FONINĖS MUZIKOS STUDIJA, ADVANCED RANGE TRIMMER, SCENE SYNC & DB)
// ============================================================================
(function() {
  "use strict";

  const bgmState = {
    audioElement: new Audio(),
    voiceAudioElement: new Audio(),
    isPlaying: false,
    playWithVoice: true,
    hasVoiceTrack: false,
    voiceTrackUrl: null,
    currentTrackId: null,
    currentTrackUrl: null,
    currentTrackName: null,
    trackDuration: 0.0,
    totalProjectDuration: 0.0,
    trackIn: 0.0,
    trackOut: 0.0,
    videoStart: 0.0, // When music starts in the film timeline (default 0.0s = Scene 1)
    videoEnd: 0.0,   // When music stops in the film timeline (0.0 = until end of movie)
    volume: 15,
    loop: true,
    fadeIn: 0.5,
    fadeOut: 1.5,
    libraryTracks: [],
    filterQuery: "",
    previewRaf: null,
    libraryPreviewAudio: null,
    libraryPreviewUrl: null,
    draggingHandle: null, // 'in' | 'out' | null
    moviePlayheadTime: 0.0,
    draggingPlayhead: false,
    wasPlayingBeforeDrag: false,
    draggingMovieClip: false,
    draggingMovieHandle: null, // 'left' | 'right' | null
    movieDragStartX: 0,
    movieDragStartVideoStart: 0,
    movieDragStartVideoEnd: 0,
    sceneDataList: [],
    activeSceneIndex: 0
  };

  // DOM element accessors
  const modal = () => document.getElementById("modalBgmStudio");
  const sceneStrip = () => document.getElementById("bgmSceneStrip");
  const libraryList = () => document.getElementById("bgmLibraryList");
  const musicLane = () => document.getElementById("bgmTimelineMusicLane");
  const markersTrack = () => document.getElementById("bgmSceneMarkersTrack");
  const moviePlacementLane = () => document.getElementById("bgmMoviePlacementLane");
  const movieDividers = () => document.getElementById("bgmMovieSceneDividers");
  const movieClipBlock = () => document.getElementById("bgmMovieClipBlock");
  const movieClipLabel = () => document.getElementById("bgmMovieClipLabel");
  const moviePlayheadNeedle = () => document.getElementById("bgmMoviePlayheadNeedle");
  const moviePlayheadCap = () => document.getElementById("bgmMoviePlayheadCap");
  const movieRulerLane = () => document.getElementById("bgmMovieRulerLane");
  const rulerTicks = () => document.getElementById("bgmRulerTicks");


  // Open BGM Studio Modal
  window.openBgmStudio = async function() {
    const proj = window.getProj ? window.getProj() : (window.proj || {});
    if (!proj) return;

    // Show modal immediately for instant feedback
    const m = modal();
    if (m) m.classList.add("show");

    // Reset preview playback
    window.stopBgmPlayPreview();

    // 1. Calculate Movie Duration & Parse Scene Data
    parseScenesData(proj);
    renderSceneTimelineStrip();
    renderMoviePlacementLane();
    updateActiveSceneMonitor(0);

    // 2. Load existing project BGM settings
    const activeBgm = proj.bgmTrack || (proj.renderSettings && proj.renderSettings.bgmTrack) || (proj.bgmSettings && proj.bgmSettings.url) || null;
    bgmState.currentTrackUrl = activeBgm;
    bgmState.currentTrackName = proj.bgmSettings?.name || (activeBgm ? activeBgm.split("/").pop().replace(/^bgm_[a-f0-9]+_/, "") : null);
    
    // In and Out points
    bgmState.trackIn = Math.max(0, parseFloat(proj.bgmSettings?.trackStart ?? proj.bgmSettings?.start ?? 0.0));
    bgmState.trackOut = Math.max(0, parseFloat(proj.bgmSettings?.trackEnd ?? proj.bgmSettings?.end ?? 0.0));
    
    // Video timeline placement (movie start / end)
    bgmState.videoStart = Math.max(0, parseFloat(proj.bgmSettings?.videoStart ?? proj.renderSettings?.bgmVideoStart ?? 0.0));
    bgmState.videoEnd = Math.max(0, parseFloat(proj.bgmSettings?.videoEnd ?? proj.renderSettings?.bgmVideoEnd ?? 0.0));

    bgmState.isMuted = Boolean(proj.bgmSettings?.muted || proj.renderSettings?.bgmMuted);
    bgmState.volume = parseInt(proj.bgmSettings?.volume ?? proj.renderSettings?.bgmVolume ?? 15, 10);
    bgmState.loop = proj.bgmSettings?.loop !== undefined ? Boolean(proj.bgmSettings.loop) : true;
    bgmState.fadeIn = parseFloat(proj.bgmSettings?.fadeIn ?? 0.5);
    bgmState.fadeOut = parseFloat(proj.bgmSettings?.fadeOut ?? 1.5);

    // Check project voiceover audio availability
    initVoiceTrackState(proj);

    // Synchronize UI inputs and scene dropdown
    syncInputsFromState();
    populateSceneStartDropdown();

    // 3. Initialize Drag listeners once
    initLaneDragHandlers();
    initMovieLaneDragHandlers();

    // 4. Fetch Library Tracks from Server (Dedicated DB)
    await loadBgmLibrary();

    // 5. Update track timeline, scenes mapping & inspector
    updateActiveTrackDisplay();
  };


  // Close BGM Studio Modal
  window.closeBgmStudio = function() {
    window.stopBgmPlayPreview();
    if (bgmState.libraryPreviewAudio) {
      try { bgmState.libraryPreviewAudio.pause(); } catch(e){}
      bgmState.libraryPreviewAudio = null;
      bgmState.libraryPreviewUrl = null;
    }
    const m = modal();
    if (m) m.classList.remove("show");
  };

  // Setup Voiceover Track State
  function initVoiceTrackState(proj) {
    const voiceTrack = proj.audioTrack || (proj.renderSettings && proj.renderSettings.audioTrack) || proj.masterAudioUrl || null;
    const voiceCheck = document.getElementById("bgmPlayWithVoiceCheck");
    const voiceLabel = document.getElementById("bgmVoiceToggleLabel");
    const voiceWrap = document.getElementById("bgmVoiceToggleWrap");

    if (voiceTrack) {
      bgmState.hasVoiceTrack = true;
      bgmState.voiceTrackUrl = voiceTrack;
      bgmState.voiceAudioElement.src = voiceTrack;
      if (voiceCheck) {
        voiceCheck.disabled = false;
        voiceCheck.checked = bgmState.playWithVoice;
      }
      if (voiceLabel) voiceLabel.textContent = "🎙️ Groti su balsu";
      if (voiceWrap) {
        voiceWrap.style.opacity = "1";
        voiceWrap.style.cursor = "pointer";
        voiceWrap.title = "Listen to background music along with voiceover dialogue track";
      }
    } else {
      bgmState.hasVoiceTrack = false;
      bgmState.voiceTrackUrl = null;
      if (voiceCheck) {
        voiceCheck.checked = false;
        voiceCheck.disabled = true;
      }
      if (voiceLabel) voiceLabel.textContent = "🎙️ Voiceover (None)";
      if (voiceWrap) {
        voiceWrap.style.opacity = "0.5";
        voiceWrap.style.cursor = "not-allowed";
        voiceWrap.title = "No voiceover track generated yet (Audio tab)";
      }
    }
  }

  // Toggle Voiceover Playback on/off
  window.toggleBgmPlayWithVoice = function(checked) {
    bgmState.playWithVoice = Boolean(checked);
    if (!bgmState.hasVoiceTrack) return;

    if (bgmState.isPlaying) {
      if (bgmState.playWithVoice) {
        const cur = bgmState.audioElement.currentTime;
        const elapsedInRange = Math.max(0, cur - bgmState.trackIn);
        const targetVoiceTime = bgmState.videoStart + elapsedInRange;
        bgmState.voiceAudioElement.currentTime = targetVoiceTime;
        bgmState.voiceAudioElement.volume = 1.0;
        bgmState.voiceAudioElement.play().catch(() => {});
      } else {
        try { bgmState.voiceAudioElement.pause(); } catch(e){}
      }
    }
  };

  function syncInputsFromState() {
    const inInp = document.getElementById("bgmStartOffsetInput");
    if (inInp) inInp.value = bgmState.trackIn.toFixed(1);

    const outInp = document.getElementById("bgmEndOffsetInput");
    if (outInp) outInp.value = bgmState.trackOut > 0 ? bgmState.trackOut.toFixed(1) : (bgmState.trackDuration ? bgmState.trackDuration.toFixed(1) : "0.0");

    const volSlider = document.getElementById("bgmStudioVolSlider");
    const volLbl = document.getElementById("bgmStudioVolLabel");
    if (volSlider) volSlider.value = bgmState.volume;
    if (volLbl) volLbl.textContent = `${bgmState.volume}%`;

    const loopCheck = document.getElementById("bgmStudioLoopCheck");
    if (loopCheck) loopCheck.checked = bgmState.loop;

    const fiInp = document.getElementById("bgmFadeInInput");
    if (fiInp) fiInp.value = bgmState.fadeIn.toFixed(1);

    const foInp = document.getElementById("bgmFadeOutInput");
    if (foInp) foInp.value = bgmState.fadeOut.toFixed(1);

    const muteBtn = document.getElementById("btnToggleBgmMute");
    if (muteBtn) {
      if (bgmState.isMuted) {
        muteBtn.textContent = "🔇 Nutildyta";
        muteBtn.style.background = "rgba(239, 68, 68, 0.15)";
        muteBtn.style.borderColor = "rgba(239, 68, 68, 0.35)";
        muteBtn.style.color = "#f87171";
      } else {
        muteBtn.textContent = "🔊 Music Enabled";
        muteBtn.style.background = "rgba(16, 185, 129, 0.15)";
        muteBtn.style.borderColor = "rgba(16, 185, 129, 0.35)";
        muteBtn.style.color = "#34d399";
      }
    }

    updateRangeDurationDisplay();
  }

  function updateRangeDurationDisplay() {
    const badge = document.getElementById("bgmSelectedRangeDuration");
    if (badge) {
      const dur = Math.max(0, (bgmState.trackOut || bgmState.trackDuration) - bgmState.trackIn);
      badge.textContent = `${dur.toFixed(1)}s`;
    }
  }

  // Parse Scene Data from Project
  function parseScenesData(proj) {
    const scenes = proj.scenes || [];
    let totalDur = 0;

    bgmState.sceneDataList = scenes.map((sc, idx) => {
      const cleanId = String(sc.id);
      const numId = cleanId.replace(/^S/i, '');

      let dur = 3.0;
      const chunk = (proj.audioChunks || []).find(c => String(c.sceneId) === cleanId || String(c.sceneId) === numId || c.index === idx);
      if (chunk && chunk.duration) {
        dur = parseFloat(chunk.duration);
      } else if (sc.duration) {
        dur = parseFloat(sc.duration);
      }
      dur = Math.max(0.5, Math.round(dur * 100) / 100);

      const words = (chunk && chunk.text) ? chunk.text : (sc.narration || sc.text || sc.prompt || "");

      let thumbUrl = null;
      const out = window.getOutput ? window.getOutput(sc.id) : (proj.outputs || []).find(o => String(o.sceneId) === cleanId || String(o.sceneId) === numId);
      if (out && out.variations && out.variations.length > 0) {
        const mainVar = (window.getMainVariant ? window.getMainVariant(out) : null) ||
                        out.variations.find(v => v.id === out.mainId) ||
                        out.variations.find(v => v.status === 'done') ||
                        out.variations[0];
        if (mainVar && mainVar.url) thumbUrl = mainVar.url;
      }
      if (!thumbUrl && sc.image_url) thumbUrl = sc.image_url;

      const scStartTime = totalDur;
      totalDur += dur;

      return {
        index: idx,
        id: sc.id,
        cleanId: `S${numId}`,
        dur,
        movieStart: scStartTime,
        movieEnd: totalDur,
        thumbUrl,
        words,
        prompt: sc.prompt || sc.text || sc.narration || ""
      };
    });

    bgmState.totalProjectDuration = Math.round(totalDur * 100) / 100;
    updateDurationBadge(bgmState.totalProjectDuration, scenes.length);
  }

  function updateDurationBadge(dur, sceneCount = 0) {
    const badge = document.getElementById("bgmTimelineDurationBadge");
    if (badge) {
      badge.textContent = `Duration: ${dur.toFixed(1)}s${sceneCount ? ` (${sceneCount} Scenes)` : ''}`;
    }
  }

  // Populate Dropdown for Scene Start Selection
  function populateSceneStartDropdown() {
    const sel = document.getElementById("bgmStartSceneSelect");
    if (!sel) return;
    sel.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "0";
    opt0.textContent = "Timeline Start (0.0s)";
    sel.appendChild(opt0);

    bgmState.sceneDataList.forEach(sc => {
      const opt = document.createElement("option");
      opt.value = sc.movieStart.toFixed(1);
      opt.textContent = `${sc.cleanId} (${sc.movieStart.toFixed(1)}s)`;
      if (Math.abs(sc.movieStart - bgmState.videoStart) < 0.1) {
        opt.selected = true;
      }
      sel.appendChild(opt);
    });
  }

  window.updateBgmMovieStartScene = function(val) {
    window.setBgmMovieStart(parseFloat(val) || 0.0);
    if (typeof toast === 'function') {
      const sc = bgmState.sceneDataList.find(s => Math.abs(s.movieStart - bgmState.videoStart) < 0.1);
      toast("Music Start", `Music aligned to start at ${sc ? sc.cleanId : bgmState.videoStart + 's'}`, "info");
    }
  };

  // Render Scene Storyboard Strip with Direct Music-to-Scene Timecodes & Spoken Words
  function renderSceneTimelineStrip() {
    const strip = sceneStrip();
    if (!strip) return;
    strip.innerHTML = "";

    if (bgmState.sceneDataList.length === 0) {
      strip.innerHTML = `<div class="text-muted text-xs p-3">Project has no scenes yet.</div>`;
      return;
    }

    const totalDur = bgmState.totalProjectDuration || 1;

    bgmState.sceneDataList.forEach((item, idx) => {
      // Calculate what segment of music plays in this scene
      let musicBadgeHtml = '';
      let isMusicActive = false;
      let mStart = 0;
      let mEnd = 0;

      if (bgmState.currentTrackUrl) {
        if (item.movieEnd <= bgmState.videoStart) {
          musicBadgeHtml = `<div style="position:absolute;bottom:3px;left:4px;right:4px;background:rgba(0,0,0,0.85);border:1px solid rgba(255,255,255,0.12);border-radius:4px;padding:2px 4px;font-size:8.5px;color:#94a3b8;text-align:center;font-weight:600;">🔇 Be muzikos</div>`;
        } else {
          const relMovieStart = Math.max(0, item.movieStart - bgmState.videoStart);
          const relMovieEnd = item.movieEnd - bgmState.videoStart;

          mStart = bgmState.trackIn + relMovieStart;
          mEnd = bgmState.trackIn + relMovieEnd;

          if (bgmState.trackOut > 0 && mStart >= bgmState.trackOut) {
            musicBadgeHtml = `<div style="position:absolute;bottom:3px;left:4px;right:4px;background:rgba(0,0,0,0.85);border:1px solid rgba(255,255,255,0.12);border-radius:4px;padding:2px 4px;font-size:8.5px;color:#94a3b8;text-align:center;font-weight:600;">🔇 Pasibaigė</div>`;
          } else {
            isMusicActive = true;
            const effEnd = bgmState.trackOut > 0 ? Math.min(bgmState.trackOut, mEnd) : mEnd;
            musicBadgeHtml = `
              <div style="position:absolute;bottom:3px;left:4px;right:4px;background:rgba(8,14,24,0.92);border:1px solid rgba(56,189,248,0.6);border-radius:4px;padding:2px 4px;font-size:8.5px;font-family:monospace;color:#38bdf8;font-weight:800;display:flex;align-items:center;justify-content:space-between;box-shadow:0 1px 4px rgba(0,0,0,0.8);">
                <span>🎵</span>
                <span>${mStart.toFixed(1)}s - ${effEnd.toFixed(1)}s</span>
              </div>
            `;
          }
        }
      } else {
        musicBadgeHtml = `<div style="position:absolute;bottom:3px;left:4px;right:4px;background:rgba(0,0,0,0.85);border:1px solid rgba(255,255,255,0.1);border-radius:4px;padding:2px 4px;font-size:8.5px;color:#64748b;text-align:center;">Pasirinkite dainą</div>`;
      }

      // Store in item for quick lookup
      item.isMusicActive = isMusicActive;
      item.mStart = mStart;
      item.mEnd = mEnd;

      const block = document.createElement("div");
      block.id = `bgmSceneCard_${idx}`;
      const widthPx = Math.max(90, Math.round((item.dur / totalDur) * 750));
      block.style.flex = `0 0 ${widthPx}px`;
      block.style.height = "76px";
      block.style.position = "relative";
      block.style.borderRadius = "8px";
      block.style.overflow = "hidden";
      block.style.border = idx === bgmState.activeSceneIndex ? "2px solid #00ffcc" : "1px solid rgba(255,255,255,0.12)";
      block.style.background = "#0c1017";
      block.style.cursor = "pointer";
      block.style.transition = "all 0.15s ease";
      if (idx === bgmState.activeSceneIndex) {
        block.style.boxShadow = "0 0 14px rgba(0,255,204,0.5)";
      }

      const isVideo = item.thumbUrl && (item.thumbUrl.endsWith(".mp4") || item.thumbUrl.endsWith(".webm"));
      let mediaHtml = '';
      if (isVideo) {
        mediaHtml = `<video src="${item.thumbUrl}" muted playsinline style="width:100%;height:100%;object-fit:cover;display:block;opacity:${isMusicActive ? '0.85' : '0.5'};pointer-events:none;"></video>`;
      } else if (item.thumbUrl) {
        mediaHtml = `<img src="${item.thumbUrl}" style="width:100%;height:100%;object-fit:cover;display:block;opacity:${isMusicActive ? '0.9' : '0.55'};pointer-events:none;" />`;
      } else {
        mediaHtml = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.04);color:var(--muted);font-size:12px;font-weight:700;">${item.cleanId}</div>`;
      }

      const wordsCaption = item.words ? `"${item.words.replace(/"/g, '&quot;')}"` : '';

      block.innerHTML = `
        ${mediaHtml}
        <div style="position:absolute;inset:0;background:linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.15) 45%, rgba(0,0,0,0.7) 100%);pointer-events:none;"></div>
        <div style="position:absolute;top:3px;left:4px;background:rgba(0,0,0,0.75);border:1px solid rgba(255,255,255,0.25);padding:1px 5px;border-radius:4px;font-size:9.5px;font-weight:800;color:${isMusicActive ? '#38bdf8' : '#94a3b8'};">
          ${item.cleanId}
        </div>
        <div style="position:absolute;top:3px;right:4px;background:rgba(0,0,0,0.75);padding:1px 4px;border-radius:3px;font-size:9px;font-family:monospace;color:#fff;">
          ${item.dur.toFixed(1)}s
        </div>
        ${wordsCaption ? `
          <div style="position:absolute;bottom:18px;left:3px;right:3px;background:rgba(0,0,0,0.78);border-radius:3px;padding:1px 4px;font-size:7.5px;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;font-style:italic;" title="${item.words}">
            ${wordsCaption}
          </div>
        ` : ''}
        ${musicBadgeHtml}
      `;

      // Hover to preview in monitor
      block.onmouseenter = () => {
        updateActiveSceneMonitor(idx);
      };

      // Click to jump movie playback to this scene's start time
      block.onclick = () => {
        bgmState.activeSceneIndex = idx;
        highlightActiveSceneInStrip(idx);
        updateActiveSceneMonitor(idx);
        seekPreviewToMovieTime(item.movieStart);
      };

      strip.appendChild(block);
    });
  }

  // Render Movie Timeline Placement Lane & Draggable Music Clip Block
  function renderMoviePlacementLane() {
    const lane = moviePlacementLane();
    const dividers = movieDividers();
    const clip = movieClipBlock();
    const label = movieClipLabel();
    if (!lane || !dividers || !clip) return;

    const totalDur = bgmState.totalProjectDuration || 1;

    // 1. Populate Scene Dividers across Movie Lane
    dividers.innerHTML = "";
    bgmState.sceneDataList.forEach(sc => {
      const pct = (sc.movieStart / totalDur) * 100;
      const d = document.createElement("div");
      d.style.position = "absolute";
      d.style.left = `${pct}%`;
      d.style.top = "0";
      d.style.bottom = "0";
      d.style.width = "1px";
      d.style.borderLeft = "1px dashed rgba(255,255,255,0.22)";
      d.style.pointerEvents = "none";
      d.innerHTML = `
        <span style="position:absolute;top:1px;left:2px;font-size:7.5px;font-weight:800;color:rgba(255,255,255,0.45);user-select:none;">
          ${sc.cleanId}
        </span>
      `;
      dividers.appendChild(d);
    });

    // 2. Populate Ruler Ticks
    const ticksContainer = rulerTicks();
    if (ticksContainer) {
      ticksContainer.innerHTML = "";
      const step = totalDur <= 30 ? 5 : (totalDur <= 120 ? 10 : 30);
      for (let s = 0; s <= totalDur; s += step) {
        const pct = (s / totalDur) * 100;
        const tick = document.createElement("div");
        tick.style.position = "absolute";
        tick.style.left = `${pct}%`;
        tick.style.top = "0";
        tick.style.bottom = "0";
        tick.style.width = "1px";
        tick.style.borderLeft = "1px solid rgba(255,255,255,0.22)";
        tick.style.pointerEvents = "none";
        tick.innerHTML = `
          <span style="position:absolute;top:1px;left:3px;font-size:8px;font-family:monospace;font-weight:700;color:rgba(255,255,255,0.6);user-select:none;">
            ${s}s
          </span>
        `;
        ticksContainer.appendChild(tick);
      }
    }

    // 3. Position Scrubber Cap and Needle to current movie playhead time
    const curTime = bgmState.moviePlayheadTime || 0;
    const curPct = `${Math.min(100, Math.max(0, (curTime / totalDur) * 100))}%`;
    const cap = moviePlayheadCap();
    const needle = moviePlayheadNeedle();
    if (cap) cap.style.left = curPct;
    if (needle) needle.style.left = curPct;

    // 4. Position Draggable Music Clip Block
    if (!bgmState.currentTrackUrl) {
      clip.style.display = "none";
      return;
    }

    clip.style.display = "flex";
    const songClipDur = Math.max(0.5, (bgmState.trackOut || bgmState.trackDuration) - bgmState.trackIn);
    const leftPct = Math.min(99, Math.max(0, (bgmState.videoStart / totalDur) * 100));
    const effEnd = (bgmState.videoEnd > bgmState.videoStart) ? bgmState.videoEnd : Math.min(totalDur, bgmState.videoStart + songClipDur);
    const widthPct = Math.max(1.5, Math.min(100 - leftPct, ((effEnd - bgmState.videoStart) / totalDur) * 100));

    clip.style.left = `${leftPct}%`;
    clip.style.width = `${widthPct}%`;

    const trackName = bgmState.currentTrackName || "Muzika";
    if (label) {
      label.textContent = `🎵 ${trackName}: ${bgmState.videoStart.toFixed(1)}s ➔ ${effEnd.toFixed(1)}s (${(effEnd - bgmState.videoStart).toFixed(1)}s)`;
    }

    // Sync input field
    const vidInp = document.getElementById("bgmVideoStartOffsetInput");
    if (vidInp && document.activeElement !== vidInp) {
      vidInp.value = bgmState.videoStart.toFixed(1);
    }
  }

  // Render Scene Divider Markers Directly Over the Music Track Lane
  function renderSceneMarkersOnMusicLane() {
    const container = markersTrack();
    if (!container) return;
    container.innerHTML = "";

    if (!bgmState.currentTrackUrl || bgmState.sceneDataList.length === 0) return;

    const totalTrack = bgmState.trackDuration || (bgmState.trackOut > 0 ? bgmState.trackOut : (bgmState.trackIn + bgmState.totalProjectDuration)) || 60;

    bgmState.sceneDataList.forEach((sc, idx) => {
      if (sc.movieEnd <= bgmState.videoStart) return;

      const relStart = Math.max(0, sc.movieStart - bgmState.videoStart);
      const mStart = bgmState.trackIn + relStart;

      if (mStart > totalTrack || (bgmState.trackOut > 0 && mStart >= bgmState.trackOut)) return;


      const pct = (mStart / totalTrack) * 100;

      // Divider element
      const marker = document.createElement("div");
      marker.style.position = "absolute";
      marker.style.left = `${pct}%`;
      marker.style.top = "0";
      marker.style.bottom = "0";
      marker.style.width = "1px";
      marker.style.borderLeft = "1px dashed rgba(255,255,255,0.45)";
      marker.style.pointerEvents = "none";
      marker.style.zIndex = "4";

      // Tag pill
      marker.innerHTML = `
        <div style="position:absolute;top:2px;left:2px;background:rgba(0,0,0,0.85);border:1px solid rgba(56,189,248,0.5);border-radius:3px;padding:0px 3px;font-size:8px;font-weight:800;color:#38bdf8;line-height:11px;user-select:none;white-space:nowrap;">
          ${sc.cleanId}
        </div>
      `;
      container.appendChild(marker);
    });
  }

  // Highlight active scene in storyboard strip
  function highlightActiveSceneInStrip(idx) {
    bgmState.sceneDataList.forEach((_, i) => {
      const card = document.getElementById(`bgmSceneCard_${i}`);
      if (card) {
        if (i === idx) {
          card.style.border = "2px solid #00ffcc";
          card.style.boxShadow = "0 0 16px rgba(0,255,204,0.6)";
          card.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        } else {
          card.style.border = "1px solid rgba(255,255,255,0.12)";
          card.style.boxShadow = "none";
        }
      }
    });
  }

  // Update Live Synchronized Scene Monitor Card
  function updateActiveSceneMonitor(idx) {
    if (idx < 0 || idx >= bgmState.sceneDataList.length) return;
    const sc = bgmState.sceneDataList[idx];
    bgmState.activeSceneIndex = idx;

    const thumbBox = document.getElementById("bgmMonitorThumb");
    const titleEl = document.getElementById("bgmMonitorSceneTitle");
    const movieTimeEl = document.getElementById("bgmMonitorMovieTime");
    const musicTimeEl = document.getElementById("bgmMonitorMusicTime");
    const scriptEl = document.getElementById("bgmMonitorScriptText");

    if (thumbBox) {
      if (sc.thumbUrl) {
        const isVid = sc.thumbUrl.endsWith(".mp4") || sc.thumbUrl.endsWith(".webm");
        if (isVid) {
          thumbBox.innerHTML = `<video src="${sc.thumbUrl}" muted playsinline style="width:100%;height:100%;object-fit:cover;display:block;"></video>`;
        } else {
          thumbBox.innerHTML = `<img src="${sc.thumbUrl}" style="width:100%;height:100%;object-fit:cover;display:block;" />`;
        }
      } else {
        thumbBox.innerHTML = `<span style="font-size:12px;font-weight:800;color:#38bdf8;">${sc.cleanId}</span>`;
      }
    }

    if (titleEl) titleEl.textContent = `🎬 Scene ${sc.cleanId}`;
    if (movieTimeEl) movieTimeEl.textContent = `${sc.movieStart.toFixed(1)}s - ${sc.movieEnd.toFixed(1)}s (Filme, ${sc.dur.toFixed(1)}s)`;

    if (musicTimeEl) {
      if (sc.isMusicActive) {
        const effEnd = bgmState.trackOut > 0 ? Math.min(bgmState.trackOut, sc.mEnd) : sc.mEnd;
        musicTimeEl.textContent = `🎵 Dainos laikas: ${sc.mStart.toFixed(1)}s - ${effEnd.toFixed(1)}s`;
        musicTimeEl.style.background = "rgba(168,85,247,0.2)";
        musicTimeEl.style.color = "#c084fc";
      } else {
        musicTimeEl.textContent = `🔇 Šioje scenoje muzika negroja`;
        musicTimeEl.style.background = "rgba(255,255,255,0.06)";
        musicTimeEl.style.color = "#94a3b8";
      }
    }

    if (scriptEl) {
      const wordsText = sc.words ? `🗣️ Diktoriaus žodžiai: "${sc.words}"` : (sc.prompt ? `"${sc.prompt}"` : `Scenos ${sc.cleanId} kadras ir trukmė: ${sc.dur.toFixed(1)}s.`);
      scriptEl.textContent = wordsText;
      scriptEl.title = sc.words || sc.prompt || "";
    }
  }

  // Seek movie and preview to start of active scene
  window.seekToActiveSceneStart = function() {
    const sc = bgmState.sceneDataList[bgmState.activeSceneIndex];
    if (!sc) return;
    seekPreviewToMovieTime(sc.movieStart);
  };

  // Set music to start playing right at this scene
  window.alignBgmInToActiveScene = function() {
    const sc = bgmState.sceneDataList[bgmState.activeSceneIndex];
    if (!sc) return;
    window.setBgmMovieStart(sc.movieStart);
    if (typeof toast === 'function') {
      toast("Suderinta", `Muzika prasidės ties scena ${sc.cleanId} (${sc.movieStart.toFixed(1)}s)`, "success");
    }
  };


  // Update visual timeline trimmer lane (Handles, Active Band, Dims)
  function updateTimelineLaneVisuals() {
    const total = bgmState.trackDuration || 1;
    const inPct = Math.min(100, Math.max(0, (bgmState.trackIn / total) * 100));
    const outPct = Math.min(100, Math.max(inPct, (bgmState.trackOut / total) * 100));

    const handleIn = document.getElementById("bgmHandleIn");
    const handleOut = document.getElementById("bgmHandleOut");
    const activeBand = document.getElementById("bgmActiveMusicBand");
    const dimLeft = document.getElementById("bgmDimLeft");
    const dimRight = document.getElementById("bgmDimRight");
    const waveLbl = document.getElementById("bgmMiniWaveLabel");

    if (handleIn) handleIn.style.left = `${inPct}%`;
    if (handleOut) handleOut.style.left = `${outPct}%`;

    if (activeBand) {
      activeBand.style.left = `${inPct}%`;
      activeBand.style.width = `${Math.max(0.5, outPct - inPct)}%`;
      activeBand.style.display = bgmState.currentTrackUrl ? "flex" : "none";
    }

    if (dimLeft) dimLeft.style.width = `${inPct}%`;
    if (dimRight) dimRight.style.width = `${100 - outPct}%`;

    if (waveLbl) {
      const dur = Math.max(0, bgmState.trackOut - bgmState.trackIn);
      waveLbl.textContent = bgmState.currentTrackName ? `🎵 ${bgmState.trackIn.toFixed(1)}s ➔ ${bgmState.trackOut.toFixed(1)}s (${dur.toFixed(1)}s)` : "Nėra parinktos muzikos";
    }

    updateRangeDurationDisplay();
    renderMoviePlacementLane();
    renderSceneTimelineStrip();
    renderSceneMarkersOnMusicLane();
  }


  // Update active track label, load audio metadata
  function updateActiveTrackDisplay() {
    const activeBadge = document.getElementById("bgmStudioActiveBadge");
    const trackInfo = document.getElementById("bgmTrackInfoLabel");
    const totalBadge = document.getElementById("bgmTrackDurationTotalBadge");

    if (bgmState.currentTrackUrl) {
      const cleanName = bgmState.currentTrackName || bgmState.currentTrackUrl.split("/").pop().replace(/^bgm_[a-f0-9]+_/, "");
      bgmState.currentTrackName = cleanName;

      if (activeBadge) {
        activeBadge.textContent = `🎵 ${cleanName}`;
        activeBadge.style.color = "#a5b4fc";
        activeBadge.style.background = "rgba(165,180,252,0.15)";
      }

      // Check if duration is already known from library
      const knownTrack = bgmState.libraryTracks.find(t => t.url === bgmState.currentTrackUrl || (t.filename && bgmState.currentTrackUrl.endsWith(t.filename)));
      if (knownTrack && knownTrack.duration > 0) {
        bgmState.trackDuration = knownTrack.duration;
        if (!bgmState.trackOut || bgmState.trackOut <= bgmState.trackIn) {
          bgmState.trackOut = bgmState.trackDuration;
        }
        syncInputsFromState();
        updateTimelineLaneVisuals();
      }

      // Preload audio duration
      bgmState.audioElement.src = bgmState.currentTrackUrl;
      const onMeta = () => {
        bgmState.trackDuration = bgmState.audioElement.duration || bgmState.trackDuration || 0;
        
        // If trackOut was 0 or uninitialized, default to trackDuration
        if (!bgmState.trackOut || bgmState.trackOut <= bgmState.trackIn || bgmState.trackOut > bgmState.trackDuration) {
          bgmState.trackOut = bgmState.trackDuration;
        }

        if (totalBadge) {
          totalBadge.textContent = `Visa daina: ${formatSeconds(bgmState.trackDuration)}`;
        }
        if (trackInfo) {
          trackInfo.textContent = `${cleanName} (${formatSeconds(bgmState.trackDuration)})`;
        }

        syncInputsFromState();
        updateTimelineLaneVisuals();
        updateActiveSceneMonitor(bgmState.activeSceneIndex);
      };
      bgmState.audioElement.onloadedmetadata = onMeta;
      if (bgmState.audioElement.readyState >= 1) onMeta();
    } else {
      bgmState.currentTrackName = null;
      bgmState.trackDuration = 0;
      bgmState.trackIn = 0;
      bgmState.trackOut = 0;

      if (activeBadge) {
        activeBadge.textContent = "Nėra pasirinkta";
        activeBadge.style.color = "#94a3b8";
        activeBadge.style.background = "rgba(255,255,255,0.05)";
      }
      if (totalBadge) totalBadge.textContent = "Visa daina: 0:00";
      if (trackInfo) trackInfo.textContent = "Pasirinkite dainą iš bibliotekos žemiau";

      syncInputsFromState();
      updateTimelineLaneVisuals();
      updateActiveSceneMonitor(0);
    }

    // Refresh Mute/Unmute Toggle Button Appearance
    const muteBtn = document.getElementById("btnToggleBgmMute");
    if (muteBtn) {
      if (bgmState.isMuted) {
        muteBtn.textContent = "🔇 Nutildyta";
        muteBtn.style.background = "rgba(239, 68, 68, 0.15)";
        muteBtn.style.borderColor = "rgba(239, 68, 68, 0.35)";
        muteBtn.style.color = "#f87171";
      } else {
        muteBtn.textContent = "🔊 Music Enabled";
        muteBtn.style.background = "rgba(16, 185, 129, 0.15)";
        muteBtn.style.borderColor = "rgba(16, 185, 129, 0.35)";
        muteBtn.style.color = "#34d399";
      }
    }
  }

  // Load dedicated BGM library from /api/audio/bgm/tracks (SQLite DB)
  async function loadBgmLibrary() {
    const list = libraryList();
    const countBadge = document.getElementById("bgmLibraryCountBadge");
    if (!list) return;

    list.innerHTML = `<div class="text-muted text-xs p-3">Kraunama foninės muzikos duomenų bazė...</div>`;

    try {
      const res = await fetch("/api/audio/bgm/library");
      if (res.ok) {
        const data = await res.json();
        bgmState.libraryTracks = data.tracks || [];
        bgmState.libraryFolders = data.folders || [];
      } else {
        bgmState.libraryTracks = [];
      }
    } catch(e) {
      console.warn("Failed to load bgm tracks:", e);
      bgmState.libraryTracks = [];
    }

    if (countBadge) {
      countBadge.textContent = `${bgmState.libraryTracks.length} dainų`;
    }

    renderLibraryItems();
  }

  window.filterBgmLibrary = function(q) {
    bgmState.filterQuery = (q || "").toLowerCase().trim();
    renderLibraryItems();
  };

  function renderLibraryItems() {
    const list = libraryList();
    if (!list) return;
    list.innerHTML = "";

    const tracks = bgmState.libraryTracks.filter(t => {
      if (!bgmState.filterQuery) return true;
      return (t.name || "").toLowerCase().includes(bgmState.filterQuery) ||
             (t.filename || "").toLowerCase().includes(bgmState.filterQuery);
    });

    if (tracks.length === 0) {
      list.innerHTML = `
        <div style="padding: 24px 10px; text-align: center; color: var(--muted); font-size: 11.5px; border: 1px dashed rgba(255,255,255,0.1); border-radius: 8px;">
          ${bgmState.filterQuery ? 'Pagal paiešką dainų nerasta.' : 'Foninės muzikos duomenų bazėje dar nėra įkeltų kūrinių.<br/>Spustelėkite <strong>„📤 Įkelti Naują MP3 / WAV“</strong> viršuje.'}
        </div>
      `;
      return;
    }

    tracks.forEach(track => {
      const isSelected = bgmState.currentTrackUrl && (bgmState.currentTrackUrl.endsWith(track.filename) || bgmState.currentTrackUrl === track.url);
      const isPreviewing = bgmState.libraryPreviewUrl === track.url;

      const item = document.createElement("div");
      item.style.display = "flex";
      item.style.alignItems = "center";
      item.style.justifyContent = "space-between";
      item.style.padding = "7px 10px";
      item.style.background = isSelected ? "rgba(99, 102, 241, 0.16)" : "rgba(255,255,255,0.03)";
      item.style.border = isSelected ? "1px solid rgba(99, 102, 241, 0.55)" : "1px solid rgba(255,255,255,0.07)";
      item.style.borderRadius = "8px";
      item.style.gap = "8px";

      const szMb = track.file_size ? (track.file_size / (1024 * 1024)).toFixed(1) + " MB" : "";
      const durStr = track.duration ? formatSeconds(track.duration) : "";
      const isFav = isTrackFavorite(track.id || track.filename);

      item.innerHTML = `
        <div class="flex items-center" style="gap: 8px; flex: 1; min-width: 0;">
          <button type="button" class="btn icon" onclick="window.toggleFavoriteBgmTrack('${track.id || track.filename}', event)" style="font-size: 15px; background: transparent; border: none; cursor: pointer; color: ${isFav ? '#eab308' : 'rgba(255,255,255,0.3)'}; padding: 2px;" title="${isFav ? 'Pašalinti iš mėgstamiausių' : 'Pridėti prie mėgstamiausių'}">
            ${isFav ? '⭐' : '☆'}
          </button>
          <button type="button" class="btn text-xs" onclick="window.toggleLibraryTrackPreview('${track.url}')" style="padding: 3px 8px; font-weight: bold; background: ${isPreviewing ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255,255,255,0.08)'}; color: ${isPreviewing ? '#f87171' : '#fff'}; border-color: ${isPreviewing ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.15)'};">
            ${isPreviewing ? '⏸' : '▶'}
          </button>
          <div style="display: flex; flex-direction: column; min-width: 0;">
            <strong style="font-size: 12px; color: ${isSelected ? '#c7d2fe' : '#fff'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${track.name}">${track.name}</strong>
            <span class="text-muted" style="font-size: 10px;">${durStr ? `⏱ ${durStr} • ` : ''}${szMb ? `${szMb} • ` : ''}Foninė muzika</span>
          </div>
        </div>

        <div class="flex items-center" style="gap: 8px;">
          ${isSelected 
            ? `<span class="badge text-xs" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); font-weight: bold; padding: 2px 7px;">✓ Parinkta filmui</span>`
            : `<button type="button" class="btn text-xs primary" onclick="window.selectBgmTrack('${track.id}')" style="padding: 3px 10px; font-size: 10.5px; font-weight: 700;">Pritaikyti šiam filmui</button>`
          }
          <button type="button" class="btn text-xs" onclick="window.deleteBgmTrack('${track.id}', '${track.name}')" title="Delete iš duomenų bazės" style="padding: 3px 7px; background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.25); color: #f87171;">
            🗑️
          </button>
        </div>
      `;

      list.appendChild(item);
    });
  }

  // Select a track from library by DB track id or track object
  window.selectBgmTrack = function(trackIdOrObj) {
    let track = null;
    if (typeof trackIdOrObj === 'object' && trackIdOrObj !== null) {
      track = trackIdOrObj;
      if (!bgmState.libraryTracks.some(t => t.id === track.id)) {
        bgmState.libraryTracks.push(track);
      }
    } else {
      track = bgmState.libraryTracks.find(t => t.id === trackIdOrObj);
    }
    if (!track) return;

    bgmState.currentTrackId = track.id;
    bgmState.currentTrackUrl = track.url;
    bgmState.currentTrackName = track.name;
    bgmState.trackDuration = track.duration || 0;
    
    // Default [IN .. OUT] range:
    bgmState.trackIn = 0.0;
    bgmState.trackOut = bgmState.trackDuration > 0 ? bgmState.trackDuration : (bgmState.totalProjectDuration || 30.0);

    updateActiveTrackDisplay();
    renderLibraryItems();

    if (typeof toast === 'function') {
      toast("Foninė muzika", `Parinktas kūrinys: ${track.name}`, "success");
    }
  };

  // Upload a new audio track to dedicated BGM DB
  window.handleBgmStudioUpload = async function(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (typeof toast === 'function') toast("Įkeliama...", `Keliama ${file.name} į foninės muzikos bazę...`, "info");

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/audio/bgm/upload", {
        method: "POST",
        body: fd
      });
      const data = await res.json();
      if (data.status === "success" && data.track) {
        if (typeof toast === 'function') toast("Įkelta", `Kūrinys ${file.name} sėkmingai įrašytas į duomenų bazę!`, "success");
        // Reload library and auto-select newly uploaded track
        await loadBgmLibrary();
        window.selectBgmTrack(data.track.id);
      } else {
        if (typeof toast === 'function') toast("Klaida", "Nepavyko įkelti foninės muzikos failo", "error");
      }
    } catch(err) {
      console.error("Upload BGM track error:", err);
      if (typeof toast === 'function') toast("Klaida", err.message, "error");
    } finally {
      e.target.value = "";
    }
  };

  // Delete track from dedicated BGM DB
  window.deleteBgmTrack = async function(trackId, trackName) {
    if (!confirm(`Ar tikrai norite pašalinti „${trackName || 'šį kūrinį'}“ iš foninės muzikos bazės?`)) return;

    try {
      const res = await fetch(`/api/audio/bgm/tracks/${encodeURIComponent(trackId)}`, { method: "DELETE" });
      if (res.ok) {
        if (bgmState.currentTrackId === trackId) {
          bgmState.currentTrackId = null;
          bgmState.currentTrackUrl = null;
          bgmState.currentTrackName = null;
          updateActiveTrackDisplay();
        }
        await loadBgmLibrary();
        if (typeof toast === 'function') toast("Ištrinta", "Kūrinys pašalintas iš duomenų bazės", "info");
      }
    } catch(err) {
      console.error("Delete BGM track error:", err);
    }
  };

  // Preview track inside library list
  window.toggleLibraryTrackPreview = function(url) {
    if (bgmState.libraryPreviewUrl === url && bgmState.libraryPreviewAudio && !bgmState.libraryPreviewAudio.paused) {
      bgmState.libraryPreviewAudio.pause();
      bgmState.libraryPreviewUrl = null;
      renderLibraryItems();
      return;
    }

    if (bgmState.libraryPreviewAudio) {
      try { bgmState.libraryPreviewAudio.pause(); } catch(e){}
    }

    bgmState.libraryPreviewAudio = new Audio(url);
    bgmState.libraryPreviewUrl = url;
    bgmState.libraryPreviewAudio.volume = Math.max(0.05, bgmState.volume / 100);
    bgmState.libraryPreviewAudio.onended = () => {
      bgmState.libraryPreviewUrl = null;
      renderLibraryItems();
    };
    bgmState.libraryPreviewAudio.play().catch(() => {});
    renderLibraryItems();
  };

  // Seek preview playback directly to any movie second
  window.seekPreviewToMovieTime = function(movieSec) {
    seekPreviewToMovieTime(movieSec);
  };
  function seekPreviewToMovieTime(movieSec) {
    const totalMovie = bgmState.totalProjectDuration || 1;
    movieSec = Math.max(0, Math.min(totalMovie, movieSec));
    bgmState.moviePlayheadTime = movieSec;

    // Move needle on Movie Placement Lane & Cap on Ruler Lane
    const movieNeedle = moviePlayheadNeedle();
    const cap = moviePlayheadCap();
    const pct = `${(movieSec / totalMovie) * 100}%`;
    if (movieNeedle) {
      movieNeedle.style.left = pct;
      movieNeedle.style.display = "block";
    }
    if (cap) {
      cap.style.left = pct;
    }

    // Determine if music should be active at this second
    const songClipDur = Math.max(0.5, (bgmState.trackOut || bgmState.trackDuration) - bgmState.trackIn);
    const effEnd = (bgmState.videoEnd > bgmState.videoStart) ? bgmState.videoEnd : (bgmState.videoStart + songClipDur);
    const isInsideMusic = bgmState.currentTrackUrl && (movieSec >= bgmState.videoStart) && (movieSec < effEnd);

    // Sync voice
    if (bgmState.hasVoiceTrack) {
      bgmState.voiceAudioElement.currentTime = movieSec;
    }

    // Sync music
    if (isInsideMusic) {
      const offsetInClip = movieSec - bgmState.videoStart;
      let songPos = bgmState.trackIn + offsetInClip;
      if (bgmState.trackOut > bgmState.trackIn && songPos > bgmState.trackOut) {
        songPos = bgmState.trackIn + ((songPos - bgmState.trackIn) % (bgmState.trackOut - bgmState.trackIn));
      }
      bgmState.audioElement.currentTime = songPos;
      const songNeedle = document.getElementById("bgmPlayheadNeedle");
      if (songNeedle) {
        const songTotal = bgmState.trackDuration || 1;
        songNeedle.style.left = `${(songPos / songTotal) * 100}%`;
        songNeedle.style.display = "block";
      }
    } else {
      const songNeedle = document.getElementById("bgmPlayheadNeedle");
      if (songNeedle) songNeedle.style.display = "none";
    }

    // Update time label
    const timeLbl = document.getElementById("bgmCurrentTimeLabel");
    if (timeLbl) {
      timeLbl.textContent = `${formatSeconds(movieSec)} / ${formatSeconds(totalMovie)}`;
    }

    // Highlight scene
    const scIdx = bgmState.sceneDataList.findIndex(s => movieSec >= s.movieStart && movieSec < s.movieEnd);
    if (scIdx !== -1) {
      highlightActiveSceneInStrip(scIdx);
      updateActiveSceneMonitor(scIdx);
    }
  }

  // Live Preview Playback: Synchronized across full Movie Timeline & Voice Narration
  window.toggleBgmPlayPreview = function() {
    const btn = document.getElementById("btnBgmPlayPreview");

    if (bgmState.isPlaying) {
      window.stopBgmPlayPreview();
      return;
    }

    const totalMovie = bgmState.totalProjectDuration || 1;
    let startSec = bgmState.moviePlayheadTime;
    if (startSec >= totalMovie - 0.2) {
      startSec = 0.0;
      bgmState.moviePlayheadTime = 0.0;
    }

    seekPreviewToMovieTime(startSec);

    // Start voice if enabled
    if (bgmState.playWithVoice && bgmState.hasVoiceTrack) {
      bgmState.voiceAudioElement.volume = 1.0;
      bgmState.voiceAudioElement.play().catch(e => console.warn("Voice play error:", e));
    }

    // Start music if current movie time is inside the BGM block
    const songClipDur = Math.max(0.5, (bgmState.trackOut || bgmState.trackDuration) - bgmState.trackIn);
    const effEnd = (bgmState.videoEnd > bgmState.videoStart) ? bgmState.videoEnd : (bgmState.videoStart + songClipDur);
    if (bgmState.currentTrackUrl && startSec >= bgmState.videoStart && startSec < effEnd) {
      bgmState.audioElement.volume = bgmState.isMuted ? 0 : Math.max(0.0, Math.min(1.0, bgmState.volume / 100));
      bgmState.audioElement.play().catch(e => console.warn("BGM play error:", e));
    }

    bgmState.isPlaying = true;
    if (btn) btn.innerHTML = "⏸ Pauzė";
    startTimelinePlayheadAnim();
  };

  window.stopBgmPlayPreview = function() {
    bgmState.isPlaying = false;
    try { bgmState.audioElement.pause(); } catch(e){}
    try { bgmState.voiceAudioElement.pause(); } catch(e){}

    if (bgmState.previewRaf) {
      cancelAnimationFrame(bgmState.previewRaf);
      bgmState.previewRaf = null;
    }
    const btn = document.getElementById("btnBgmPlayPreview");
    if (btn) btn.innerHTML = "▶ Klausytis atkarpos";

    const songNeedle = document.getElementById("bgmPlayheadNeedle");
    if (songNeedle) songNeedle.style.display = "none";
  };

  function startTimelinePlayheadAnim() {
    const movieNeedle = moviePlayheadNeedle();
    const cap = moviePlayheadCap();
    const songNeedle = document.getElementById("bgmPlayheadNeedle");
    const timeLbl = document.getElementById("bgmCurrentTimeLabel");
    const totalMovie = bgmState.totalProjectDuration || 1;
    const songTotal = bgmState.trackDuration || 1;

    let lastSceneIdx = -1;
    let lastTime = performance.now();

    function tick(now) {
      if (!bgmState.isPlaying) return;

      const dt = (now - lastTime) / 1000;
      lastTime = now;

      // Advance movie clock: sync with voice audio if active, else timer
      if (bgmState.hasVoiceTrack && !bgmState.voiceAudioElement.paused && bgmState.playWithVoice) {
        bgmState.moviePlayheadTime = bgmState.voiceAudioElement.currentTime;
      } else {
        bgmState.moviePlayheadTime += dt;
      }

      // Check loop / movie completion
      if (bgmState.moviePlayheadTime >= totalMovie) {
        if (bgmState.loop) {
          bgmState.moviePlayheadTime = 0.0;
          if (bgmState.hasVoiceTrack && bgmState.playWithVoice) {
            bgmState.voiceAudioElement.currentTime = 0.0;
            bgmState.voiceAudioElement.play().catch(()=>{});
          }
        } else {
          window.stopBgmPlayPreview();
          return;
        }
      }

      const curMovieSec = bgmState.moviePlayheadTime;

      // Update Movie Playhead needle and cap
      const curMoviePct = `${Math.min(100, (curMovieSec / totalMovie) * 100)}%`;
      if (movieNeedle) {
        movieNeedle.style.left = curMoviePct;
        movieNeedle.style.display = "block";
      }
      if (cap) {
        cap.style.left = curMoviePct;
      }

      // Check if BGM should play at this movie time
      const songClipDur = Math.max(0.5, (bgmState.trackOut || bgmState.trackDuration) - bgmState.trackIn);
      const effEnd = (bgmState.videoEnd > bgmState.videoStart) ? bgmState.videoEnd : (bgmState.videoStart + songClipDur);
      const isInsideBgm = bgmState.currentTrackUrl && (curMovieSec >= bgmState.videoStart) && (curMovieSec < effEnd);

      if (isInsideBgm) {
        const offsetInClip = curMovieSec - bgmState.videoStart;
        let expectedSongPos = bgmState.trackIn + offsetInClip;
        if (bgmState.trackOut > bgmState.trackIn && expectedSongPos > bgmState.trackOut) {
          expectedSongPos = bgmState.trackIn + ((expectedSongPos - bgmState.trackIn) % (bgmState.trackOut - bgmState.trackIn));
        }

        if (bgmState.audioElement.paused) {
          bgmState.audioElement.currentTime = expectedSongPos;
          bgmState.audioElement.volume = Math.max(0.02, bgmState.volume / 100);
          bgmState.audioElement.play().catch(()=>{});
        } else if (Math.abs(bgmState.audioElement.currentTime - expectedSongPos) > 0.35) {
          bgmState.audioElement.currentTime = expectedSongPos;
        }

        if (songNeedle) {
          songNeedle.style.left = `${Math.min(100, (bgmState.audioElement.currentTime / songTotal) * 100)}%`;
          songNeedle.style.display = "block";
        }
      } else {
        if (!bgmState.audioElement.paused) {
          try { bgmState.audioElement.pause(); } catch(e){}
        }
        if (songNeedle) songNeedle.style.display = "none";
      }

      if (timeLbl) {
        timeLbl.textContent = `${formatSeconds(curMovieSec)} / ${formatSeconds(totalMovie)}`;
      }

      // Highlight active scene in strip & update monitor
      const activeIdx = bgmState.sceneDataList.findIndex(s => curMovieSec >= s.movieStart && curMovieSec < s.movieEnd);
      if (activeIdx !== -1 && activeIdx !== lastSceneIdx) {
        lastSceneIdx = activeIdx;
        highlightActiveSceneInStrip(activeIdx);
        updateActiveSceneMonitor(activeIdx);
      }

      bgmState.previewRaf = requestAnimationFrame(tick);
    }

    lastTime = performance.now();
    bgmState.previewRaf = requestAnimationFrame(tick);
  }


  // Interactive Drag Handlers for [IN] and [OUT] handles on the timeline lane
  let dragListenersBound = false;
  function initLaneDragHandlers() {
    if (dragListenersBound) return;
    dragListenersBound = true;

    const lane = musicLane();
    const handleIn = document.getElementById("bgmHandleIn");
    const handleOut = document.getElementById("bgmHandleOut");

    if (handleIn) {
      handleIn.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        bgmState.draggingHandle = 'in';
      });
      handleIn.addEventListener("touchstart", (e) => {
        e.stopPropagation();
        bgmState.draggingHandle = 'in';
      }, { passive: true });
    }

    if (handleOut) {
      handleOut.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        bgmState.draggingHandle = 'out';
      });
      handleOut.addEventListener("touchstart", (e) => {
        e.stopPropagation();
        bgmState.draggingHandle = 'out';
      }, { passive: true });
    }

    if (lane) {
      lane.addEventListener("mousedown", (e) => {
        if (!bgmState.trackDuration) return;
        const rect = lane.getBoundingClientRect();
        const clickPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const clickSec = clickPct * bgmState.trackDuration;

        const distIn = Math.abs(clickSec - bgmState.trackIn);
        const distOut = Math.abs(clickSec - bgmState.trackOut);

        if (distIn < distOut) {
          window.updateBgmTrackIn(clickSec);
          bgmState.draggingHandle = 'in';
        } else {
          window.updateBgmTrackOut(clickSec);
          bgmState.draggingHandle = 'out';
        }
      });
    }

    window.addEventListener("mousemove", onLaneDragMove);
    window.addEventListener("touchmove", (e) => {
      if (!bgmState.draggingHandle) return;
      const touch = e.touches[0];
      if (touch) onLaneDragMove({ clientX: touch.clientX });
    }, { passive: true });

    window.addEventListener("mouseup", () => {
      bgmState.draggingHandle = null;
    });
    window.addEventListener("touchend", () => {
      bgmState.draggingHandle = null;
    });
  }

  function onLaneDragMove(e) {
    if (!bgmState.draggingHandle || !bgmState.trackDuration) return;
    const lane = musicLane();
    if (!lane) return;

    const rect = lane.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const sec = Math.round(pct * bgmState.trackDuration * 10) / 10;

    if (bgmState.draggingHandle === 'in') {
      const maxIn = Math.max(0, bgmState.trackOut - 0.5);
      window.updateBgmTrackIn(Math.min(sec, maxIn));
    } else if (bgmState.draggingHandle === 'out') {
      const minOut = bgmState.trackIn + 0.5;
      window.updateBgmTrackOut(Math.max(sec, minOut));
    }
  }

  // Interactive Drag Handlers for Movie Timeline Placement Lane & Draggable Music Clip
  let movieDragBound = false;
  function initMovieLaneDragHandlers() {
    if (movieDragBound) return;
    movieDragBound = true;

    const ruler = movieRulerLane();
    const clip = movieClipBlock();
    const handleL = document.getElementById("bgmMovieClipHandleLeft");
    const handleR = document.getElementById("bgmMovieClipHandleRight");
    const cap = moviePlayheadCap();

    // 1. LEFT HANDLE: Drag to adjust clip start in movie
    if (handleL) {
      handleL.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        bgmState.draggingMovieHandle = 'left';
        bgmState.movieDragStartX = e.clientX;
        bgmState.movieDragStartVideoStart = bgmState.videoStart;
      });
      handleL.addEventListener("touchstart", (e) => {
        e.stopPropagation();
        bgmState.draggingMovieHandle = 'left';
        bgmState.movieDragStartX = e.touches[0].clientX;
        bgmState.movieDragStartVideoStart = bgmState.videoStart;
      }, { passive: true });
    }

    // 2. RIGHT HANDLE: Drag to adjust clip end in movie
    if (handleR) {
      handleR.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        bgmState.draggingMovieHandle = 'right';
        bgmState.movieDragStartX = e.clientX;
        const songClipDur = Math.max(0.5, (bgmState.trackOut || bgmState.trackDuration) - bgmState.trackIn);
        bgmState.movieDragStartVideoEnd = bgmState.videoEnd || (bgmState.videoStart + songClipDur);
      });
      handleR.addEventListener("touchstart", (e) => {
        e.stopPropagation();
        bgmState.draggingMovieHandle = 'right';
        bgmState.movieDragStartX = e.touches[0].clientX;
        const songClipDur = Math.max(0.5, (bgmState.trackOut || bgmState.trackDuration) - bgmState.trackIn);
        bgmState.movieDragStartVideoEnd = bgmState.videoEnd || (bgmState.videoStart + songClipDur);
      }, { passive: true });
    }

    // 3. CLIP BODY: Drag whole clip block horizontally
    if (clip) {
      clip.addEventListener("mousedown", (e) => {
        if (e.target === handleL || e.target === handleR || (handleL && handleL.contains(e.target)) || (handleR && handleR.contains(e.target))) return;
        e.stopPropagation();
        e.preventDefault();
        bgmState.draggingMovieClip = true;
        bgmState.movieDragStartX = e.clientX;
        bgmState.movieDragStartVideoStart = bgmState.videoStart;
        const songClipDur = Math.max(0.5, (bgmState.trackOut || bgmState.trackDuration) - bgmState.trackIn);
        bgmState.movieDragStartVideoEnd = bgmState.videoEnd || (bgmState.videoStart + songClipDur);
        clip.style.cursor = "grabbing";
      });
      clip.addEventListener("touchstart", (e) => {
        if (e.target === handleL || e.target === handleR || (handleL && handleL.contains(e.target)) || (handleR && handleR.contains(e.target))) return;
        e.stopPropagation();
        bgmState.draggingMovieClip = true;
        bgmState.movieDragStartX = e.touches[0].clientX;
        bgmState.movieDragStartVideoStart = bgmState.videoStart;
        const songClipDur = Math.max(0.5, (bgmState.trackOut || bgmState.trackDuration) - bgmState.trackIn);
        bgmState.movieDragStartVideoEnd = bgmState.videoEnd || (bgmState.videoStart + songClipDur);
      }, { passive: true });
    }

    // 4. RULER LANE & CAP: Playhead scrubber strictly isolated to the Ruler Lane
    const startPlayheadDrag = (e) => {
      e.stopPropagation();
      e.preventDefault();
      bgmState.draggingPlayhead = true;
      bgmState.wasPlayingBeforeDrag = bgmState.isPlaying;
      if (bgmState.isPlaying) {
        try { bgmState.audioElement.pause(); } catch(err){}
        try { bgmState.voiceAudioElement.pause(); } catch(err){}
      }
      if (cap) cap.style.cursor = "grabbing";
    };

    if (cap) {
      cap.addEventListener("mousedown", startPlayheadDrag);
      cap.addEventListener("touchstart", startPlayheadDrag, { passive: false });
    }

    if (ruler) {
      ruler.addEventListener("mousedown", (e) => {
        if (e.target === cap || (cap && cap.contains(e.target))) return;
        e.preventDefault();
        e.stopPropagation();
        const totalDur = bgmState.totalProjectDuration || 1;
        const rect = ruler.getBoundingClientRect();
        const clickPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const clickSec = Math.round(clickPct * totalDur * 10) / 10;
        seekPreviewToMovieTime(clickSec);
        bgmState.draggingPlayhead = true;
        bgmState.wasPlayingBeforeDrag = bgmState.isPlaying;
        if (bgmState.isPlaying) {
          try { bgmState.audioElement.pause(); } catch(err){}
          try { bgmState.voiceAudioElement.pause(); } catch(err){}
        }
      });
    }

    // NOTE: Clicks elsewhere on the lane do nothing - strictly prevents accidental drag hijacking!

    window.addEventListener("mousemove", onMovieDragMove);
    window.addEventListener("touchmove", (e) => {
      if (!bgmState.draggingMovieClip && !bgmState.draggingMovieHandle && !bgmState.draggingPlayhead) return;
      const touch = e.touches[0];
      if (touch) onMovieDragMove({ clientX: touch.clientX });
    }, { passive: true });

    window.addEventListener("mouseup", onMovieDragEnd);
    window.addEventListener("touchend", onMovieDragEnd);
  }

  function onMovieDragMove(e) {
    const lane = moviePlacementLane();
    const ruler = movieRulerLane();
    const targetElement = ruler || lane;
    if (!targetElement) return;

    const totalDur = bgmState.totalProjectDuration || 1;
    const rect = targetElement.getBoundingClientRect();
    const laneWidth = rect.width || 1;

    if (bgmState.draggingPlayhead) {
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / laneWidth));
      const sec = Math.round(pct * totalDur * 10) / 10;
      seekPreviewToMovieTime(sec);
      return;
    }

    if (!bgmState.draggingMovieClip && !bgmState.draggingMovieHandle) return;
    const deltaX = e.clientX - bgmState.movieDragStartX;
    const deltaSec = (deltaX / laneWidth) * totalDur;

    if (bgmState.draggingMovieClip) {
      const songClipDur = (bgmState.movieDragStartVideoEnd && bgmState.movieDragStartVideoEnd > bgmState.movieDragStartVideoStart) 
        ? (bgmState.movieDragStartVideoEnd - bgmState.movieDragStartVideoStart)
        : Math.max(0.5, (bgmState.trackOut || bgmState.trackDuration) - bgmState.trackIn);
      const maxStart = Math.max(0, totalDur - 0.5);
      const newStart = Math.max(0, Math.min(maxStart, bgmState.movieDragStartVideoStart + deltaSec));
      bgmState.videoStart = Math.round(newStart * 10) / 10;
      if (bgmState.movieDragStartVideoEnd > 0) {
        bgmState.videoEnd = Math.min(totalDur, Math.round((bgmState.videoStart + songClipDur) * 10) / 10);
      }
      window.setBgmMovieStart(bgmState.videoStart);
    } else if (bgmState.draggingMovieHandle === 'left') {
      const maxStart = bgmState.videoEnd > 0 ? Math.max(0, bgmState.videoEnd - 0.5) : Math.max(0, totalDur - 0.5);
      const newStart = Math.max(0, Math.min(maxStart, bgmState.movieDragStartVideoStart + deltaSec));
      window.setBgmMovieStart(Math.round(newStart * 10) / 10);
    } else if (bgmState.draggingMovieHandle === 'right') {
      const newEnd = Math.max(bgmState.videoStart + 0.5, Math.min(totalDur, bgmState.movieDragStartVideoEnd + deltaSec));
      bgmState.videoEnd = Math.round(newEnd * 10) / 10;
      renderMoviePlacementLane();
      renderSceneTimelineStrip();
      updateActiveSceneMonitor(bgmState.activeSceneIndex);
    }
  }

  function onMovieDragEnd() {
    if (bgmState.draggingPlayhead) {
      bgmState.draggingPlayhead = false;
      const cap = document.getElementById("bgmMoviePlayheadCap");
      if (cap) cap.style.cursor = "grab";
      if (bgmState.wasPlayingBeforeDrag) {
        bgmState.isPlaying = false;
        window.toggleBgmPlayPreview();
      }
    }
    bgmState.draggingMovieClip = false;
    bgmState.draggingMovieHandle = null;
    const clip = movieClipBlock();
    if (clip) clip.style.cursor = "grab";
  }

  // Replay from beginning (0.0s)
  window.replayBgmFromStart = function() {
    window.stopBgmPlayPreview();
    seekPreviewToMovieTime(0.0);
    window.toggleBgmPlayPreview();
    if (typeof toast === 'function') {
      toast("Perklausa", "Grojama iš naujo nuo pat pradžių (0.0s)", "info");
    }
  };

  window.setBgmMovieStart = function(sec) {
    bgmState.videoStart = Math.max(0, Math.min(bgmState.totalProjectDuration || 999, parseFloat(sec) || 0.0));
    renderMoviePlacementLane();
    renderSceneTimelineStrip();
    renderSceneMarkersOnMusicLane();
    syncStartSceneDropdownSelection();
    updateActiveSceneMonitor(bgmState.activeSceneIndex);
  };


  window.updateBgmMovieStartSec = function(val) {
    window.setBgmMovieStart(val);
  };

  window.shiftBgmVideoStart = function(delta) {
    window.setBgmMovieStart(bgmState.videoStart + delta);
  };

  function syncStartSceneDropdownSelection() {
    const sel = document.getElementById("bgmStartSceneSelect");
    if (!sel) return;
    let closestSc = bgmState.sceneDataList[0];
    let minDiff = 9999;
    bgmState.sceneDataList.forEach(sc => {
      const diff = Math.abs(sc.movieStart - bgmState.videoStart);
      if (diff < minDiff) {
        minDiff = diff;
        closestSc = sc;
      }
    });
    if (closestSc && minDiff < 0.2) {
      sel.value = closestSc.movieStart.toFixed(1);
    }
  }


  // Update IN point
  window.updateBgmTrackIn = function(val) {
    const num = Math.max(0, parseFloat(val) || 0.0);
    bgmState.trackIn = Math.min(num, bgmState.trackDuration ? Math.max(0, bgmState.trackDuration - 0.5) : num);
    if (bgmState.trackOut > 0 && bgmState.trackIn >= bgmState.trackOut) {
      bgmState.trackOut = bgmState.trackIn + 1.0;
    }
    const inInp = document.getElementById("bgmStartOffsetInput");
    if (inInp && document.activeElement !== inInp) inInp.value = bgmState.trackIn.toFixed(1);
    const outInp = document.getElementById("bgmEndOffsetInput");
    if (outInp && document.activeElement !== outInp) outInp.value = bgmState.trackOut.toFixed(1);

    updateTimelineLaneVisuals();
    updateActiveSceneMonitor(bgmState.activeSceneIndex);
  };

  // Update OUT point
  window.updateBgmTrackOut = function(val) {
    const num = Math.max(0, parseFloat(val) || 0.0);
    const maxDur = bgmState.trackDuration || num;
    bgmState.trackOut = Math.min(num, maxDur);
    if (bgmState.trackOut <= bgmState.trackIn) {
      bgmState.trackOut = Math.min(maxDur, bgmState.trackIn + 0.5);
    }
    const outInp = document.getElementById("bgmEndOffsetInput");
    if (outInp && document.activeElement !== outInp) outInp.value = bgmState.trackOut.toFixed(1);

    updateTimelineLaneVisuals();
    updateActiveSceneMonitor(bgmState.activeSceneIndex);
  };

  // Reset range to full track
  window.setBgmFullTrackRange = function() {
    bgmState.trackIn = 0.0;
    bgmState.trackOut = bgmState.trackDuration || 0.0;
    syncInputsFromState();
    updateTimelineLaneVisuals();
    updateActiveSceneMonitor(bgmState.activeSceneIndex);
    if (typeof toast === 'function') toast("Atkarpa", "Nustatyta visa dainos trukmė", "info");
  };

  // Match range to movie duration
  window.matchBgmRangeToMovie = function() {
    if (!bgmState.totalProjectDuration) return;
    const maxDur = bgmState.trackDuration || 9999;
    bgmState.trackOut = Math.min(maxDur, bgmState.trackIn + bgmState.totalProjectDuration);
    syncInputsFromState();
    updateTimelineLaneVisuals();
    updateActiveSceneMonitor(bgmState.activeSceneIndex);
    if (typeof toast === 'function') toast("Atkarpa", `Atkarpa pritaikyta pagal filmo trukmę (${bgmState.totalProjectDuration.toFixed(1)}s)`, "success");
  };

  // Volume slider
  window.updateBgmStudioVolume = function(val) {
    bgmState.volume = parseInt(val, 10);
    const lbl = document.getElementById("bgmStudioVolLabel");
    if (lbl) lbl.textContent = `${bgmState.volume}%`;
    if (bgmState.audioElement) {
      bgmState.audioElement.volume = bgmState.isMuted ? 0 : Math.max(0.0, Math.min(1.0, bgmState.volume / 100));
    }
    const proj = window.getProj ? window.getProj() : (window.proj || {});
    if (proj) {
      if (!proj.renderSettings) proj.renderSettings = {};
      if (!proj.bgmSettings) proj.bgmSettings = {};
      proj.bgmSettings.volume = bgmState.volume;
      proj.renderSettings.bgmVolume = bgmState.volume;
      const cockpitVol = document.getElementById("renderBgmVolVal");
      if (cockpitVol && !bgmState.isMuted) cockpitVol.textContent = `${bgmState.volume}%`;
    }
  };

  // Loop toggle
  window.updateBgmStudioLoop = function(checked) {
    bgmState.loop = Boolean(checked);
    if (bgmState.audioElement) bgmState.audioElement.loop = bgmState.loop;
  };

  // Fade In / Out inputs
  window.updateBgmFadeIn = function(val) {
    bgmState.fadeIn = Math.max(0, Math.min(10, parseFloat(val) || 0.5));
  };
  window.updateBgmFadeOut = function(val) {
    bgmState.fadeOut = Math.max(0, Math.min(10, parseFloat(val) || 1.5));
  };

  // Save BGM Studio settings to Project and Cockpit
  window.saveBgmStudioSettings = function() {
    const proj = window.getProj ? window.getProj() : (window.proj || {});
    if (!proj) return;

    if (!proj.renderSettings) proj.renderSettings = {};

    proj.bgmTrack = bgmState.currentTrackUrl;
    proj.renderSettings.bgmTrack = bgmState.currentTrackUrl;
    proj.renderSettings.bgmVolume = bgmState.volume;
    proj.renderSettings.bgmMuted = Boolean(bgmState.isMuted);
    proj.renderSettings.bgmVideoStart = bgmState.videoStart;
    proj.renderSettings.bgmVideoEnd = bgmState.videoEnd;

    proj.bgmSettings = {
      id: bgmState.currentTrackId,
      url: bgmState.currentTrackUrl,
      name: bgmState.currentTrackName,
      trackStart: bgmState.trackIn,
      trackEnd: bgmState.trackOut,
      start: bgmState.trackIn,
      end: bgmState.trackOut,
      videoStart: bgmState.videoStart,
      videoEnd: bgmState.videoEnd,
      volume: bgmState.volume,
      muted: Boolean(bgmState.isMuted),
      loop: bgmState.loop,
      fadeIn: bgmState.fadeIn,
      fadeOut: bgmState.fadeOut
    };

    // Synchronize cockpit card in Render tab
    const cockpitName = document.getElementById("bgmFileName");
    if (cockpitName) {
      if (bgmState.currentTrackName) {
        const dur = Math.max(0, bgmState.trackOut - bgmState.trackIn);
        const startSc = bgmState.sceneDataList.find(s => Math.abs(s.movieStart - bgmState.videoStart) < 0.1);
        const scLabel = startSc ? ` (nuo ${startSc.cleanId})` : '';
        const muteLabel = bgmState.isMuted ? ' [🔇 Nutildyta]' : '';
        cockpitName.textContent = `${bgmState.currentTrackName} (${dur.toFixed(1)}s)${scLabel}${muteLabel}`;
        cockpitName.title = `${bgmState.currentTrackName} [${bgmState.trackIn.toFixed(1)}s - ${bgmState.trackOut.toFixed(1)}s]${muteLabel}`;
      } else {
        cockpitName.textContent = "Nepasirinkta foninė muzika";
        cockpitName.title = "";
      }
    }
    const cockpitVol = document.getElementById("renderBgmVolVal");
    if (cockpitVol) {
      cockpitVol.textContent = bgmState.isMuted ? "🔇 0%" : `${bgmState.volume}%`;
      cockpitVol.style.color = bgmState.isMuted ? "#f87171" : "var(--accent-secondary, #00ffcc)";
    }

    if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();

    if (typeof toast === 'function') {
      toast("Foninė muzika", bgmState.currentTrackUrl ? `Muzika suderinta su scenomis ir pritaikyta filmui!` : "Muzika pašalinta iš projekto", "success");
    }

    window.closeBgmStudio();
  };

  // Toggle Mute / Unmute for Background Music (In-place, does NOT close modal or remove track)
  window.toggleBgmMute = function() {
    bgmState.isMuted = !bgmState.isMuted;

    // If audio is playing and becomes muted, adjust volume to 0 (or restore)
    if (bgmState.audioElement) {
      bgmState.audioElement.volume = bgmState.isMuted ? 0 : Math.max(0.02, bgmState.volume / 100);
    }

    const muteBtn = document.getElementById("btnToggleBgmMute");
    if (muteBtn) {
      if (bgmState.isMuted) {
        muteBtn.textContent = "🔇 Nutildyta";
        muteBtn.style.background = "rgba(239, 68, 68, 0.15)";
        muteBtn.style.borderColor = "rgba(239, 68, 68, 0.35)";
        muteBtn.style.color = "#f87171";
      } else {
        muteBtn.textContent = "🔊 Music Enabled";
        muteBtn.style.background = "rgba(16, 185, 129, 0.15)";
        muteBtn.style.borderColor = "rgba(16, 185, 129, 0.35)";
        muteBtn.style.color = "#34d399";
      }
    }

    // Save mute state to project in background without closing modal
    const proj = window.getProj ? window.getProj() : (window.proj || {});
    if (proj) {
      if (!proj.renderSettings) proj.renderSettings = {};
      proj.renderSettings.bgmMuted = bgmState.isMuted;
      if (proj.bgmSettings) proj.bgmSettings.muted = bgmState.isMuted;
      
      const cockpitVol = document.getElementById("renderBgmVolVal");
      if (cockpitVol) {
        cockpitVol.textContent = bgmState.isMuted ? "🔇 0%" : `${bgmState.volume}%`;
        cockpitVol.style.color = bgmState.isMuted ? "#f87171" : "var(--accent-secondary, #00ffcc)";
      }
      if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
    }

    if (typeof toast === 'function') {
      toast("Foninė muzika", bgmState.isMuted ? "Muzika nutildyta (Muted)" : "Muzikos garsas įjungtas (Unmuted)", "info");
    }
  };

  // Remove BGM from project (clears track entirely)
  window.removeBgmFromProject = function() {
    window.stopBgmPlayPreview();
    bgmState.currentTrackId = null;
    bgmState.currentTrackUrl = null;
    bgmState.currentTrackName = null;
    bgmState.trackIn = 0.0;
    bgmState.trackOut = 0.0;
    bgmState.videoStart = 0.0;
    bgmState.videoEnd = 0.0;
    bgmState.isMuted = false;
    bgmState.audioElement.removeAttribute('src');
    try { bgmState.audioElement.load(); } catch(e){}

    updateActiveTrackDisplay();
    renderLibraryItems();
    window.saveBgmStudioSettings();
  };


  // ============================================================================
  // BGM FOLDER BROWSER & DATABASE (MUZIKOS APLANKŲ BIBLIOTEKA)
  // ============================================================================
  let browserActiveFolder = "all";
  let browserSearchQuery = "";
  let browserFolders = [];
  let browserTracks = [];
  let browserPreviewAudio = null;
  let browserPreviewUrl = null;
  let browserRandomHighlightedTrackId = null;

  window.openBgmFolderBrowserModal = async function() {
    const m = document.getElementById("modalBgmFolderBrowser");
    if (m) m.classList.add("show");

    const searchInput = document.getElementById("bgmFolderBrowserSearchInput");
    if (searchInput) searchInput.value = "";
    browserSearchQuery = "";

    await window.loadBgmFolderLibrary();
  };

  window.closeBgmFolderBrowserModal = function() {
    if (browserPreviewAudio) {
      try { browserPreviewAudio.pause(); } catch(e){}
      browserPreviewAudio = null;
      browserPreviewUrl = null;
    }
    browserRandomHighlightedTrackId = null;
    const m = document.getElementById("modalBgmFolderBrowser");
    if (m) m.classList.remove("show");
  };

  // ============================================================================
  // FAVORITES MANAGEMENT (MĖGSTAMIAUSIŲ DAINŲ TABAS IR SAUGOJIMAS)
  // ============================================================================
  function getFavoriteTrackIds() {
    try {
      return JSON.parse(localStorage.getItem("bgm_favorites_tracks") || "[]");
    } catch(e) {
      return [];
    }
  }

  function isTrackFavorite(trackId) {
    if (!trackId) return false;
    const favs = getFavoriteTrackIds();
    return favs.includes(String(trackId));
  }

  window.toggleFavoriteBgmTrack = function(trackId, e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    let favs = getFavoriteTrackIds();
    const sId = String(trackId);
    if (favs.includes(sId)) {
      favs = favs.filter(id => id !== sId);
    } else {
      favs.push(sId);
    }
    localStorage.setItem("bgm_favorites_tracks", JSON.stringify(favs));
    window.renderBgmFolderTabs();
    window.renderBgmFolderTracks();
    renderLibraryItems();
  };

  window.loadBgmFolderLibrary = async function() {
    const list = document.getElementById("bgmFolderTracksList");
    const totalBadge = document.getElementById("bgmFolderBrowserTotalBadge");
    if (list) {
      list.innerHTML = `<div style="padding: 30px; text-align: center; color: var(--muted); font-size: 13px;">🔄 Nuskaitomi kompiuterio aplankai ir garso failai...</div>`;
    }

    try {
      const res = await fetch("/api/audio/bgm/library");
      if (res.ok) {
        const data = await res.json();
        browserFolders = data.folders || [];
        browserTracks = data.tracks || [];
        bgmState.libraryTracks = browserTracks;
        bgmState.libraryFolders = browserFolders;
      }
    } catch(err) {
      console.error("Failed to load BGM library:", err);
    }

    // Pirmas tabas: ⭐ Mėgstamiausi
    const favCount = browserTracks.filter(t => isTrackFavorite(t.id || t.filename)).length;
    browserFolders.unshift({
      id: "favorites",
      name: "Mėgstamiausi",
      icon: "⭐",
      count: favCount
    });

    if (totalBadge) {
      totalBadge.textContent = `${browserTracks.length} kūrinių`;
    }

    window.renderBgmFolderTabs();
    window.renderBgmFolderTracks();

    // Also update main BGM studio list
    renderLibraryItems();
  };

  window.switchBgmFolderTab = function(folderId) {
    browserActiveFolder = folderId;
    browserRandomHighlightedTrackId = null;
    window.renderBgmFolderTabs();
    window.renderBgmFolderTracks();
  };

  window.renderBgmFolderTabs = function() {
    const bar = document.getElementById("bgmFolderTabBar");
    if (!bar) return;
    bar.innerHTML = "";

    browserFolders.forEach(f => {
      const isActive = (browserActiveFolder === f.id);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn text-xs";
      btn.style.padding = "6px 14px";
      btn.style.borderRadius = "8px";
      btn.style.whiteSpace = "nowrap";
      btn.style.display = "flex";
      btn.style.alignItems = "center";
      btn.style.gap = "6px";
      btn.style.fontWeight = isActive ? "800" : "600";
      btn.style.transition = "all 0.15s ease";

      if (isActive) {
        btn.style.background = "linear-gradient(135deg, rgba(234, 179, 8, 0.28) 0%, rgba(249, 115, 22, 0.28) 100%)";
        btn.style.borderColor = "rgba(234, 179, 8, 0.6)";
        btn.style.color = "#fef08a";
        btn.style.boxShadow = "0 2px 10px rgba(234, 179, 8, 0.25)";
      } else {
        btn.style.background = "rgba(255, 255, 255, 0.04)";
        btn.style.borderColor = "rgba(255, 255, 255, 0.12)";
        btn.style.color = "#cbd5e1";
      }

      btn.innerHTML = `
        <span style="font-size: 14px;">${f.icon || '📁'}</span>
        <span>${f.name}</span>
        <span class="badge" style="background: ${isActive ? 'rgba(234,179,8,0.35)' : 'rgba(255,255,255,0.08)'}; color: ${isActive ? '#fff' : '#94a3b8'}; font-size: 10px; padding: 1px 6px; border-radius: 10px;">${f.count}</span>
      `;

      btn.onclick = () => window.switchBgmFolderTab(f.id);
      bar.appendChild(btn);
    });
  };

  window.filterBgmBrowserTracks = function(q) {
    browserSearchQuery = (q || "").toLowerCase().trim();
    window.renderBgmFolderTracks();
  };

  window.renderBgmFolderTracks = function() {
    const list = document.getElementById("bgmFolderTracksList");
    if (!list) return;
    list.innerHTML = "";

    // 1. Filter by folder
    let filtered = browserTracks;
    if (browserActiveFolder === "favorites") {
      filtered = filtered.filter(t => isTrackFavorite(t.id || t.filename));
    } else if (browserActiveFolder !== "all") {
      if (browserActiveFolder === "__root__") {
        filtered = filtered.filter(t => t.folder_id === "__root__");
      } else {
        filtered = filtered.filter(t => t.folder_id === browserActiveFolder || t.folder_name === browserActiveFolder);
      }
    }

    // 2. Filter by search query
    if (browserSearchQuery) {
      filtered = filtered.filter(t => 
        (t.name || "").toLowerCase().includes(browserSearchQuery) ||
        (t.filename || "").toLowerCase().includes(browserSearchQuery) ||
        (t.folder_name || "").toLowerCase().includes(browserSearchQuery)
      );
    }

    if (filtered.length === 0) {
      const activeFolderObj = browserFolders.find(f => f.id === browserActiveFolder);
      const folderName = activeFolderObj ? activeFolderObj.name : "šį aplanką";
      list.innerHTML = `
        <div style="padding: 40px 20px; text-align: center; color: var(--muted); font-size: 12.5px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 10px; background: rgba(0,0,0,0.2);">
          <div style="font-size: 32px; margin-bottom: 8px;">📂</div>
          <div style="font-weight: 700; color: #fff; margin-bottom: 6px;">
            ${browserSearchQuery ? 'Pagal paiešką „' + browserSearchQuery + '“ kūrinių nerasta.' : 'Aplankas „' + folderName + '“ yra tuščias.'}
          </div>
          <div style="font-size: 11px; max-width: 500px; margin: 0 auto 14px auto;">
            Galite tiesiog atsidaryti šį aplanką savo kompiuteryje ir įkelti ten MP3/WAV failus, arba paspausti mygtuką viršuje „📤 Įkelti failą į aktyvų aplanką“.
          </div>
          <button type="button" class="btn text-xs" onclick="window.openCurrentBgmFolderInExplorer()" style="padding: 6px 14px; background: rgba(59, 130, 246, 0.2); border-color: rgba(59, 130, 246, 0.4); color: #93c5fd;">
            💻 Atidaryti šį aplanką kompiuteryje
          </button>
        </div>
      `;
      return;
    }

    filtered.forEach(track => {
      const isSelected = bgmState.currentTrackUrl && (
        bgmState.currentTrackUrl === track.url || 
        bgmState.currentTrackUrl.endsWith(track.filename) ||
        (bgmState.currentTrackId && bgmState.currentTrackId === track.id)
      );
      const isRandomHighlighted = (browserRandomHighlightedTrackId === track.id);
      const isPreviewing = (browserPreviewUrl === track.url && browserPreviewAudio && !browserPreviewAudio.paused);

      const card = document.createElement("div");
      card.id = `bgm_card_${track.id}`;
      card.style.display = "flex";
      card.style.alignItems = "center";
      card.style.justifyContent = "space-between";
      card.style.padding = "10px 14px";
      card.style.borderRadius = "10px";
      card.style.gap = "12px";
      card.style.transition = "all 0.2s ease";

      if (isRandomHighlighted) {
        card.style.background = "linear-gradient(135deg, rgba(168, 85, 247, 0.22) 0%, rgba(236, 72, 153, 0.15) 100%)";
        card.style.border = "2px solid #c084fc";
        card.style.boxShadow = "0 0 20px rgba(168, 85, 247, 0.45)";
      } else if (isSelected) {
        card.style.background = "rgba(234, 179, 8, 0.12)";
        card.style.border = "1px solid rgba(234, 179, 8, 0.5)";
        card.style.boxShadow = "none";
      } else {
        card.style.background = "rgba(255, 255, 255, 0.03)";
        card.style.border = "1px solid rgba(255, 255, 255, 0.07)";
        card.style.boxShadow = "none";
      }

      const szMb = track.file_size ? (track.file_size / (1024 * 1024)).toFixed(1) + " MB" : "";
      const durStr = track.duration ? formatSeconds(track.duration) : "";
      const isFav = isTrackFavorite(track.id || track.filename);

      card.innerHTML = `
        <div class="flex items-center" style="gap: 12px; flex: 1; min-width: 0;">
          <button type="button" class="btn icon" onclick="window.toggleFavoriteBgmTrack('${track.id || track.filename}', event)" style="font-size: 17px; background: transparent; border: none; cursor: pointer; color: ${isFav ? '#eab308' : 'rgba(255,255,255,0.3)'}; padding: 4px; transition: transform 0.15s;" title="${isFav ? 'Pašalinti iš mėgstamiausių' : 'Pridėti prie mėgstamiausių'}">
            ${isFav ? '⭐' : '☆'}
          </button>
          <button type="button" class="btn icon" onclick="window.toggleBrowserTrackPreview('${track.url}')" style="width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; background: ${isPreviewing ? 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)' : 'rgba(255,255,255,0.08)'}; color: #fff; border: 1px solid ${isPreviewing ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.15)'}; flex-shrink: 0; box-shadow: ${isPreviewing ? '0 0 12px rgba(239,68,68,0.4)' : 'none'};">
            ${isPreviewing ? '⏸' : '▶'}
          </button>
          
          <div style="display: flex; flex-direction: column; min-width: 0; gap: 3px;">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <strong style="font-size: 13px; color: ${isRandomHighlighted ? '#f5d0fe' : (isSelected ? '#fef08a' : '#fff')}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${track.name}">${track.name}</strong>
              ${isRandomHighlighted ? `<span class="badge" style="background: linear-gradient(135deg, #a855f7 0%, #ec4899 100%); color: #fff; font-weight: 800; font-size: 10px; padding: 2px 8px; border-radius: 6px; box-shadow: 0 0 10px rgba(168,85,247,0.5);">🎲 Išrinktas perklausai</span>` : ''}
              <span class="badge text-xs" style="background: rgba(255,255,255,0.06); color: #cbd5e1; font-size: 10px; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 1px 6px;">
                📁 ${track.folder_name || 'Pagrindinis'}
              </span>
            </div>
            <div class="text-muted" style="font-size: 11px; display: flex; align-items: center; gap: 8px;">
              ${durStr ? `<span>⏱ ${durStr}</span>` : ''}
              ${szMb ? `<span>💾 ${szMb}</span>` : ''}
              <span style="opacity: 0.6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 320px;" title="${track.filename}">${track.filename}</span>
            </div>
          </div>
        </div>

        <div class="flex items-center" style="gap: 10px; flex-shrink: 0;">
          ${isSelected 
            ? `<span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.45); font-weight: 800; padding: 5px 12px; font-size: 11px; border-radius: 6px;">✓ Parinkta filmui</span>`
            : `<button type="button" class="btn text-xs primary" onclick="window.selectBgmTrackFromBrowser('${track.id}')" style="padding: 6px 14px; font-size: 11px; font-weight: 800; background: linear-gradient(135deg, #10b981 0%, #06b6d4 100%); border: none; color: #fff; box-shadow: 0 2px 10px rgba(16,185,129,0.25); border-radius: 6px;">
                 🎵 Pasirinkti šią muziką
               </button>`
          }
          <button type="button" class="btn text-xs" onclick="window.deleteBgmTrackFromBrowser('${track.id}', '${encodeURIComponent(track.name)}')" title="Delete kūrinį" style="padding: 6px 9px; background: rgba(239, 68, 68, 0.12); border-color: rgba(239, 68, 68, 0.25); color: #f87171; border-radius: 6px;">
            🗑️
          </button>
        </div>
      `;

      list.appendChild(card);
    });
  };

  window.toggleBrowserTrackPreview = function(url) {
    if (browserPreviewUrl === url && browserPreviewAudio && !browserPreviewAudio.paused) {
      browserPreviewAudio.pause();
      browserPreviewUrl = null;
      window.renderBgmFolderTracks();
      return;
    }

    if (browserPreviewAudio) {
      try { browserPreviewAudio.pause(); } catch(e){}
    }

    browserPreviewAudio = new Audio(url);
    browserPreviewUrl = url;
    browserPreviewAudio.volume = Math.max(0.05, bgmState.volume / 100);
    browserPreviewAudio.onended = () => {
      browserPreviewUrl = null;
      window.renderBgmFolderTracks();
    };
    browserPreviewAudio.play().catch(e => console.warn("Preview audio playback err:", e));
    window.renderBgmFolderTracks();
  };

  // Pick a random track from currently active folder, preview it and highlight it (WITHOUT auto-adding to film)
  window.pickRandomTrackFromCurrentFolder = function() {
    let pool = browserTracks;
    if (browserActiveFolder !== "all") {
      if (browserActiveFolder === "__root__") {
        pool = pool.filter(t => t.folder_id === "__root__");
      } else {
        pool = pool.filter(t => t.folder_id === browserActiveFolder || t.folder_name === browserActiveFolder);
      }
    }

    if (!pool || pool.length === 0) {
      const activeFolderObj = browserFolders.find(f => f.id === browserActiveFolder);
      const folderName = activeFolderObj ? activeFolderObj.name : "šiame aplanke";
      if (typeof toast === 'function') {
        toast("Dėmesio", `Aplanke „${folderName}“ nėra jokių kūrinių. Įkelkite arba įmeskite failus į aplanką!`, "warn");
      }
      return;
    }

    // If more than 1 track, prefer picking a different one than the currently highlighted one
    let candidatePool = pool;
    if (pool.length > 1 && browserRandomHighlightedTrackId) {
      const diffTracks = pool.filter(t => t.id !== browserRandomHighlightedTrackId);
      if (diffTracks.length > 0) {
        candidatePool = diffTracks;
      }
    }

    const randomIndex = Math.floor(Math.random() * candidatePool.length);
    const chosenTrack = candidatePool[randomIndex];
    browserRandomHighlightedTrackId = chosenTrack.id;

    // Start playing audio preview for this track immediately
    if (browserPreviewAudio) {
      try { browserPreviewAudio.pause(); } catch(e){}
    }
    browserPreviewAudio = new Audio(chosenTrack.url);
    browserPreviewUrl = chosenTrack.url;
    browserPreviewAudio.volume = Math.max(0.05, bgmState.volume / 100);
    browserPreviewAudio.onended = () => {
      browserPreviewUrl = null;
      window.renderBgmFolderTracks();
    };
    browserPreviewAudio.play().catch(e => console.warn("Preview audio playback err:", e));

    // Re-render tracks list so the highlight and preview state show
    window.renderBgmFolderTracks();

    // Smooth scroll to the highlighted card
    setTimeout(() => {
      const cardEl = document.getElementById(`bgm_card_${chosenTrack.id}`);
      if (cardEl) {
        cardEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 60);

    // Update bottom status hint
    const hintEl = document.getElementById("bgmFolderBrowserStatusHint");
    if (hintEl) {
      hintEl.innerHTML = `🎲 Išrinktas kūrinys perklausai: <strong style="color: #f0abfc;">${chosenTrack.name}</strong>. Klausykitės! Jei tinka – spauskite <strong>„🎵 Pasirinkti šią muziką“</strong>, arba spauskite <strong>„🎲 Atsitiktinė muzika“</strong> dar kartą.`;
    }

    if (typeof toast === 'function') {
      toast("🎲 Atsitiktinė muzika", `Groja „${chosenTrack.name}“. Jei tinka – spauskite „Pasirinkti šią muziką“, arba spauskite dar kartą!`, "info");
    }
  };

  window.selectBgmTrackFromBrowser = function(trackId) {
    const track = browserTracks.find(t => t.id === trackId) || bgmState.libraryTracks.find(t => t.id === trackId);
    if (!track) return;

    window.selectBgmTrack(track);

    if (browserPreviewAudio) {
      try { browserPreviewAudio.pause(); } catch(e){}
      browserPreviewAudio = null;
      browserPreviewUrl = null;
    }

    window.closeBgmFolderBrowserModal();

    if (typeof toast === 'function') {
      toast("Foninė muzika parinkta", `Kūrinys „${track.name}“ nustatytas filmui!`, "success");
    }
  };

  window.openCurrentBgmFolderInExplorer = async function() {
    try {
      const folderToOpen = (browserActiveFolder === "all") ? "" : browserActiveFolder;
      const res = await fetch("/api/audio/bgm/open_folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: folderToOpen })
      });
      const data = await res.json();
      if (data.status === "success") {
        if (typeof toast === 'function') {
          toast("Aplankas atidarytas", "Atidarytas kompiuterio aplankas. Įkelkite failus ir paspauskite „Atnaujinti“.", "info");
        }
      } else {
        if (typeof toast === 'function') toast("Klaida", data.message || "Nepavyko atidaryti aplanko", "error");
      }
    } catch(err) {
      console.error("Open folder err:", err);
      if (typeof toast === 'function') toast("Klaida", err.message, "error");
    }
  };

  window.promptCreateBgmFolder = async function() {
    const name = prompt("Įveskite naujo muzikos aplanko pavadinimą (pvz. 'Mistika ir Paslaptis', 'Kiberpankas'):");
    if (!name || !name.trim()) return;

    try {
      const res = await fetch("/api/audio/bgm/create_folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_name: name.trim() })
      });
      const data = await res.json();
      if (data.status === "success") {
        if (typeof toast === 'function') {
          toast("Aplankas sukurtas", `Sukurtas aplankas „${data.folder}“!`, "success");
        }
        await window.loadBgmFolderLibrary();
        window.switchBgmFolderTab(data.folder);
      } else {
        if (typeof toast === 'function') toast("Klaida", data.message || "Nepavyko sukurti aplanko", "error");
      }
    } catch(err) {
      console.error("Create folder err:", err);
      if (typeof toast === 'function') toast("Klaida", err.message, "error");
    }
  };

  window.handleBgmFolderUpload = async function(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const targetFolder = (browserActiveFolder === "all" || browserActiveFolder === "__root__") ? "" : browserActiveFolder;
    const folderHint = targetFolder ? ` į „${targetFolder}“` : "";

    if (typeof toast === 'function') {
      toast("Įkeliama...", `Keliama ${file.name}${folderHint}...`, "info");
    }

    try {
      const fd = new FormData();
      fd.append("file", file);
      if (targetFolder) {
        fd.append("folder", targetFolder);
      }

      const res = await fetch("/api/audio/bgm/upload", {
        method: "POST",
        body: fd
      });

      if (res.ok) {
        const data = await res.json();
        if (typeof toast === 'function') {
          toast("Įkelta", `Kūrinys sėkmingai įrašytas į ${data.track ? data.track.folder : 'bazę'}!`, "success");
        }
        await window.loadBgmFolderLibrary();
      } else {
        if (typeof toast === 'function') toast("Klaida", "Nepavyko įkelti garso failo", "error");
      }
    } catch(err) {
      console.error("Upload track err:", err);
      if (typeof toast === 'function') toast("Klaida", err.message, "error");
    } finally {
      e.target.value = "";
    }
  };

  window.deleteBgmTrackFromBrowser = async function(trackId, encName) {
    const rawName = decodeURIComponent(encName || "kūrinį");
    if (!confirm(`Ar tikrai norite ištrinti „${rawName}“ iš foninės muzikos bazės?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/audio/bgm/tracks/${encodeURIComponent(trackId)}`, {
        method: "DELETE"
      });
      if (res.ok) {
        if (bgmState.currentTrackId === trackId) {
          bgmState.currentTrackId = null;
          bgmState.currentTrackUrl = null;
          bgmState.currentTrackName = null;
          updateActiveTrackDisplay();
        }
        if (typeof toast === 'function') toast("Ištrinta", "Kūrinys pašalintas iš bazės", "info");
        await window.loadBgmFolderLibrary();
      } else {
        if (typeof toast === 'function') toast("Klaida", "Nepavyko ištrinti kūrinio", "error");
      }
    } catch(err) {
      console.error("Delete track err:", err);
      if (typeof toast === 'function') toast("Klaida", err.message, "error");
    }
  };

  function formatSeconds(sec) {
    const sTot = Math.round(sec);
    const m = Math.floor(sTot / 60);
    const s = Math.floor(sTot % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

})();
