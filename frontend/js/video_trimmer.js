// ============================================================================
// VIDEO TRIMMER CONTROLLER (SEAMLESS CONTINUOUS LOOP & INDEPENDENT PLAYHEAD)
// ============================================================================

(function() {
  const trimmerState = {
    sceneId: null,
    videoUrl: null,
    duration: 3.0,
    voiceDuration: 3.0,
    inSec: 0.0,
    outSec: 3.0,
    playheadSec: 0.0,
    isPlayingLoop: false,
    isPlayingFull: false,
    activeDrag: null, // 'in' | 'out' | 'playhead'
    rafId: null
  };

  let isSeeking = false;
  let pendingSeekTime = null;
  let seekSafetyTimeout = null;
  let wasLoopingBeforeDrag = false;
  let wasPlayingBeforeDrag = false;

  const player = () => document.getElementById("trimmerVideoPlayer");
  const inSlider = () => document.getElementById("trimmerInSlider");
  const outSlider = () => document.getElementById("trimmerOutSlider");
  const inNum = () => document.getElementById("trimmerInSec");
  const outNum = () => document.getElementById("trimmerOutSec");
  const track = () => document.getElementById("trimmerTimelineTrack");

  function requestFrameSeek(timeSec) {
    pendingSeekTime = timeSec;
    if (!isSeeking) {
      dispatchSeek();
    }
  }

  function dispatchSeek() {
    if (pendingSeekTime === null) return;
    const vid = player();
    if (!vid) return;

    const target = pendingSeekTime;
    pendingSeekTime = null;
    isSeeking = true;

    try {
      vid.currentTime = target;
    } catch(e) {
      isSeeking = false;
      if (pendingSeekTime !== null) dispatchSeek();
    }

    if (seekSafetyTimeout) clearTimeout(seekSafetyTimeout);
    seekSafetyTimeout = setTimeout(() => {
      // 300ms fallback safety only if browser fails to trigger onseeked
      isSeeking = false;
      if (pendingSeekTime !== null) dispatchSeek();
    }, 300);
  }

  window.openVideoTrimmer = function(sceneId) {
    const proj = window.getProj ? window.getProj() : (window.proj || {});
    if (!proj || !sceneId) return;

    trimmerState.sceneId = sceneId;

    // Find scene and output
    const cleanId = String(sceneId);
    const numId = cleanId.replace(/^S/i, '');
    const sc = (proj.scenes || []).find(s => String(s.id) === cleanId || String(s.id) === numId);
    const out = window.getOutput ? window.getOutput(sceneId) : (proj.outputs || []).find(o => String(o.sceneId) === cleanId || String(o.sceneId) === numId);

    if (!out || !out.variations || out.variations.length === 0) {
      if (typeof toast === 'function') toast("Trimmer", "Scene dar neturi sugeneruoto video variacijos!", "warn");
      return;
    }

    const mainVar = (window.getMainVariant ? window.getMainVariant(out) : null) ||
                    out.variations.find(v => v.id === out.mainId) ||
                    out.variations.find(v => v.type === 'video' || (v.url && v.url.toLowerCase().endsWith('.mp4'))) ||
                    out.variations[0];

    if (!mainVar || !mainVar.url || (!mainVar.url.toLowerCase().endsWith('.mp4') && mainVar.type !== 'video')) {
      if (typeof toast === 'function') toast("Trimmer", "Selected variation is not a video file!", "warn");
      return;
    }

    trimmerState.videoUrl = mainVar.url;

    // Determine voice duration
    let voiceDur = 3.0;
    const scIndex = proj.scenes ? proj.scenes.findIndex(s => String(s.id) === cleanId || String(s.id) === numId) : -1;
    let chunk = (proj.audioChunks || []).find(c =>
      String(c.sceneId) === cleanId ||
      String(c.sceneId) === numId ||
      c.index === scIndex
    );
    if (chunk && chunk.duration) {
      voiceDur = parseFloat(chunk.duration);
    } else if (sc && sc.duration) {
      voiceDur = parseFloat(sc.duration);
    }
    trimmerState.voiceDuration = Math.max(0.5, Math.round(voiceDur * 100) / 100);

    // Existing trim if any
    const existingTrim = (mainVar.trim) || (sc && sc.video_trim) || null;

    // UI Badges
    const badge = document.getElementById("trimmerSceneBadge");
    if (badge) badge.textContent = `Scene: S${numId}`;

    const voiceDurEl = document.getElementById("trimmerVoiceDurVal");
    if (voiceDurEl) voiceDurEl.textContent = `${trimmerState.voiceDuration.toFixed(2)}s`;

    // Reset loop state and full playback flag
    setLoopState(false);
    trimmerState.isPlayingFull = false;
    isSeeking = false;
    pendingSeekTime = null;

    // Load video into trimmer player
    const vid = player();
    if (!vid) return;

    vid.src = trimmerState.videoUrl;
    vid.preload = "auto";
    vid.load();

    vid.onseeked = () => {
      isSeeking = false;
      if (pendingSeekTime !== null) {
        dispatchSeek();
      }
    };

    vid.onloadedmetadata = () => {
      const dur = Math.max(0.2, vid.duration || 3.0);
      trimmerState.duration = dur;

      let start = 0.0;
      let end = dur;
      if (existingTrim && typeof existingTrim.start === 'number' && typeof existingTrim.end === 'number') {
        start = Math.max(0, Math.min(dur - 0.05, existingTrim.start));
        end = Math.min(dur, Math.max(start + 0.05, existingTrim.end));
      }

      trimmerState.inSec = Math.round(start * 100) / 100;
      trimmerState.outSec = Math.round(end * 100) / 100;
      trimmerState.playheadSec = trimmerState.inSec;

      // Update slider bounds
      if (inSlider()) {
        inSlider().min = "0";
        inSlider().max = dur.toFixed(2);
        inSlider().step = "0.02";
        inSlider().value = trimmerState.inSec;
      }
      if (outSlider()) {
        outSlider().min = "0";
        outSlider().max = dur.toFixed(2);
        outSlider().step = "0.02";
        outSlider().value = trimmerState.outSec;
      }
      if (inNum()) {
        inNum().min = "0";
        inNum().max = dur.toFixed(2);
        inNum().value = trimmerState.inSec.toFixed(2);
      }
      if (outNum()) {
        outNum().min = "0";
        outNum().max = dur.toFixed(2);
        outNum().value = trimmerState.outSec.toFixed(2);
      }

      const totalDurEl = document.getElementById("trimmerTotalDurVal");
      if (totalDurEl) totalDurEl.textContent = `${dur.toFixed(2)}s`;

      vid.currentTime = trimmerState.inSec;
      updateTrimmerUI();
      renderPlayheadNeedle(trimmerState.playheadSec);
    };

    vid.ontimeupdate = () => {
      onVideoTimeTick();
    };

    vid.onseeked = () => {
      if (seekSafetyTimeout) clearTimeout(seekSafetyTimeout);
      isSeeking = false;
      if (pendingSeekTime !== null) {
        dispatchSeek();
      }
    };

    vid.onended = () => {
      if (trimmerState.isPlayingLoop) {
        vid.currentTime = trimmerState.inSec;
        vid.play().catch(() => {});
      } else if (!trimmerState.isPlayingFull) {
        vid.currentTime = trimmerState.inSec;
        resetPlayButtons();
      } else {
        resetPlayButtons();
      }
    };

    // Open modal
    const modal = document.getElementById("modalVideoTrimmer");
    if (modal) modal.classList.add("show");
  };

  window.closeVideoTrimmer = function() {
    setLoopState(false);
    trimmerState.isPlayingFull = false;
    if (trimmerState.rafId) {
      cancelAnimationFrame(trimmerState.rafId);
      trimmerState.rafId = null;
    }
    const vid = player();
    if (vid) {
      try { vid.pause(); } catch(e){}
      vid.removeAttribute('src');
      vid.src = "";
    }
    const modal = document.getElementById("modalVideoTrimmer");
    if (modal) modal.classList.remove("show");
  };

  function resetPlayButtons() {
    const overlay = document.getElementById("trimmerPlayOverlay");
    const toggleBtn = document.getElementById("btnTrimmerTogglePlay");
    const fullBtn = document.getElementById("btnTrimmerPlayFull");
    if (overlay) overlay.style.opacity = "1";
    if (toggleBtn) toggleBtn.innerHTML = "▶ Play Selection";
    if (fullBtn) fullBtn.style.background = "rgba(255,255,255,0.06)";
  }

  function renderPlayheadNeedle(timeSec) {
    const playhead = document.getElementById("trimmerPlayhead");
    if (playhead && trimmerState.duration > 0) {
      const pct = (timeSec / trimmerState.duration) * 100;
      playhead.style.left = `${Math.min(100, Math.max(0, pct))}%`;
    }
  }

  function onVideoTimeTick() {
    const vid = player();
    if (!vid) return;

    // If dragging In or Out handle, DO NOT move the playhead needle!
    if (trimmerState.activeDrag === 'in' || trimmerState.activeDrag === 'out') {
      return;
    }

    trimmerState.playheadSec = vid.currentTime;

    const curEl = document.getElementById("trimmerCurrentTimeVal");
    if (curEl) curEl.textContent = `${vid.currentTime.toFixed(2)}s`;

    renderPlayheadNeedle(vid.currentTime);

    // 1. Continuous Loop Check (zero latency 60fps wrap)
    if (trimmerState.isPlayingLoop) {
      if (vid.currentTime >= trimmerState.outSec - 0.04 || vid.currentTime < trimmerState.inSec) {
        vid.currentTime = trimmerState.inSec;
        trimmerState.playheadSec = trimmerState.inSec;
        renderPlayheadNeedle(trimmerState.inSec);
        if (vid.paused) {
          vid.play().catch(() => {});
        }
      }
    }
    // 2. Normal Clip Playback Check (stops when reaching outSec)
    else if (!trimmerState.isPlayingFull && !vid.paused) {
      if (vid.currentTime >= trimmerState.outSec) {
        vid.pause();
        vid.currentTime = trimmerState.outSec;
        trimmerState.playheadSec = trimmerState.outSec;
        renderPlayheadNeedle(trimmerState.outSec);
        resetPlayButtons();
      }
    }
  }

  function startRafLoop() {
    if (trimmerState.rafId) cancelAnimationFrame(trimmerState.rafId);
    function loopTick() {
      const vid = player();
      if (vid && !vid.paused) {
        onVideoTimeTick();
      }
      if (trimmerState.isPlayingLoop || (vid && !vid.paused)) {
        trimmerState.rafId = requestAnimationFrame(loopTick);
      }
    }
    trimmerState.rafId = requestAnimationFrame(loopTick);
  }

  function setLoopState(active) {
    trimmerState.isPlayingLoop = active;
    const loopBtn = document.getElementById("btnTrimmerLoop");
    const loopBadge = document.getElementById("trimmerLoopStatusBadge");
    const overlay = document.getElementById("trimmerPlayOverlay");
    const toggleBtn = document.getElementById("btnTrimmerTogglePlay");

    if (active) {
      trimmerState.isPlayingFull = false;
      if (loopBtn) {
        loopBtn.innerHTML = "⏸ Stop Loop";
        loopBtn.style.background = "linear-gradient(135deg, rgba(168, 85, 247, 0.45), rgba(16, 185, 129, 0.4))";
        loopBtn.style.borderColor = "#c084fc";
        loopBtn.style.boxShadow = "0 0 14px rgba(168, 85, 247, 0.6)";
      }
      if (loopBadge) loopBadge.style.visibility = "visible";
      if (overlay) overlay.style.opacity = "0";
      if (toggleBtn) toggleBtn.innerHTML = "⏸ Pause";
      startRafLoop();
    } else {
      if (loopBtn) {
        loopBtn.innerHTML = "🔁 Groti be sustojimo (Loop)";
        loopBtn.style.background = "rgba(168, 85, 247, 0.2)";
        loopBtn.style.borderColor = "rgba(168, 85, 247, 0.5)";
        loopBtn.style.boxShadow = "none";
      }
      if (loopBadge) loopBadge.style.visibility = "hidden";
    }
  }

  window.toggleTrimmerLoop = function() {
    const vid = player();
    if (!vid) return;

    if (trimmerState.isPlayingLoop) {
      vid.pause();
      setLoopState(false);
      resetPlayButtons();
    } else {
      trimmerState.isPlayingFull = false;
      if (vid.currentTime < trimmerState.inSec || vid.currentTime >= trimmerState.outSec - 0.04) {
        vid.currentTime = trimmerState.inSec;
        trimmerState.playheadSec = trimmerState.inSec;
        renderPlayheadNeedle(trimmerState.inSec);
      }
      vid.play().then(() => {
        setLoopState(true);
      }).catch(() => {
        setLoopState(true);
      });
    }
  };

  // Play ONLY the marked clip [In .. Out]
  window.toggleTrimmerPlay = function() {
    const vid = player();
    if (!vid) return;

    setLoopState(false);
    trimmerState.isPlayingFull = false;

    const overlay = document.getElementById("trimmerPlayOverlay");
    const toggleBtn = document.getElementById("btnTrimmerTogglePlay");

    if (vid.paused) {
      // If outside trim bounds, seek to inSec first!
      if (vid.currentTime < trimmerState.inSec || vid.currentTime >= trimmerState.outSec - 0.04) {
        vid.currentTime = trimmerState.inSec;
        trimmerState.playheadSec = trimmerState.inSec;
        renderPlayheadNeedle(trimmerState.inSec);
      }
      vid.play().then(() => {
        if (overlay) overlay.style.opacity = "0";
        if (toggleBtn) toggleBtn.innerHTML = "⏸ Pause";
        startRafLoop();
      }).catch(() => {});
    } else {
      vid.pause();
      resetPlayButtons();
    }
  };

  // Play the FULL video from 0 to end
  window.playTrimmerFullVideo = function() {
    const vid = player();
    if (!vid) return;

    setLoopState(false);
    trimmerState.isPlayingFull = true;

    const overlay = document.getElementById("trimmerPlayOverlay");
    const toggleBtn = document.getElementById("btnTrimmerTogglePlay");
    const fullBtn = document.getElementById("btnTrimmerPlayFull");

    if (vid.paused || !trimmerState.isPlayingFull) {
      if (vid.currentTime >= trimmerState.duration - 0.05) {
        vid.currentTime = 0;
      }
      vid.play().then(() => {
        if (overlay) overlay.style.opacity = "0";
        if (toggleBtn) toggleBtn.innerHTML = "⏸ Pause";
        if (fullBtn) fullBtn.style.background = "rgba(16, 185, 129, 0.3)";
        startRafLoop();
      }).catch(() => {});
    } else {
      vid.pause();
      resetPlayButtons();
    }
  };

  function updateTrimmerUI() {
    const dur = trimmerState.duration || 3.0;
    const inVal = trimmerState.inSec;
    const outVal = trimmerState.outSec;

    // Visual active region
    const activeRegion = document.getElementById("trimmerActiveRegion");
    if (activeRegion && dur > 0) {
      const leftPct = (inVal / dur) * 100;
      const widthPct = ((outVal - inVal) / dur) * 100;
      activeRegion.style.left = `${leftPct}%`;
      activeRegion.style.width = `${Math.max(0.5, widthPct)}%`;
    }

    // Handles positions
    const handleIn = document.getElementById("trimmerHandleIn");
    if (handleIn && dur > 0) {
      handleIn.style.left = `${(inVal / dur) * 100}%`;
    }

    const handleOut = document.getElementById("trimmerHandleOut");
    if (handleOut && dur > 0) {
      handleOut.style.left = `${(outVal / dur) * 100}%`;
    }

    // Text labels
    const inLbl = document.getElementById("trimmerInLabel");
    if (inLbl) inLbl.textContent = `${inVal.toFixed(2)}s`;

    const outLbl = document.getElementById("trimmerOutLabel");
    if (outLbl) outLbl.textContent = `${outVal.toFixed(2)}s`;

    const clipDur = Math.max(0.05, outVal - inVal);
    const clipDurEl = document.getElementById("trimmerClipDurVal");
    if (clipDurEl) clipDurEl.textContent = `${clipDur.toFixed(2)}s`;

    const clipDurSmall = document.getElementById("trimmerClipDurValSmall");
    if (clipDurSmall) clipDurSmall.textContent = `${clipDur.toFixed(2)}s`;

    // Synchronize inputs
    if (inSlider()) inSlider().value = inVal;
    if (outSlider()) outSlider().value = outVal;
    if (inNum()) inNum().value = inVal.toFixed(2);
    if (outNum()) outNum().value = outVal.toFixed(2);

    // Speed stretch calculation
    const voiceDur = trimmerState.voiceDuration || 3.0;
    const speedRatio = voiceDur / clipDur;
    const speedBadge = document.getElementById("trimmerSpeedBadge");
    const descEl = document.getElementById("trimmerSlowdownDesc");

    if (speedBadge) {
      if (speedRatio > 1.05) {
        speedBadge.textContent = `${speedRatio.toFixed(2)}x Slowdown`;
        speedBadge.style.color = "#34d399";
        speedBadge.style.borderColor = "rgba(52, 211, 153, 0.4)";
        if (descEl) descEl.textContent = `Atkarpa (${clipDur.toFixed(2)}s) bus tolygiai sulėtinta iki ${voiceDur.toFixed(2)}s.`;
      } else if (speedRatio < 0.95) {
        speedBadge.textContent = `1.00x Normal (Trim End)`;
        speedBadge.style.color = "#38bdf8";
        speedBadge.style.borderColor = "rgba(56, 189, 248, 0.4)";
        if (descEl) descEl.textContent = `Atkarpa (${clipDur.toFixed(2)}s) ilgesnė už balsą (${voiceDur.toFixed(2)}s) – galas bus apkirptas.`;
      } else {
        speedBadge.textContent = `1.00x Normalus greitis`;
        speedBadge.style.color = "#38bdf8";
        speedBadge.style.borderColor = "rgba(56, 189, 248, 0.4)";
        if (descEl) descEl.textContent = `Atkarpa (${clipDur.toFixed(2)}s) idealiai atitinka scenos trukmę.`;
      }
    }
  }

  window.setTrimmerInCurrent = function() {
    const vid = player();
    if (!vid) return;
    const cur = Math.round(vid.currentTime * 100) / 100;
    trimmerState.inSec = Math.max(0, Math.min(cur, trimmerState.outSec - 0.05));
    updateTrimmerUI();
  };

  window.setTrimmerOutCurrent = function() {
    const vid = player();
    if (!vid) return;
    const cur = Math.round(vid.currentTime * 100) / 100;
    trimmerState.outSec = Math.min(trimmerState.duration, Math.max(cur, trimmerState.inSec + 0.05));
    updateTrimmerUI();
  };

  window.stepTrimmerTime = function(delta) {
    const vid = player();
    if (!vid) return;
    vid.currentTime = Math.max(0, Math.min(trimmerState.duration, vid.currentTime + delta));
    trimmerState.playheadSec = vid.currentTime;
    renderPlayheadNeedle(vid.currentTime);
    const curEl = document.getElementById("trimmerCurrentTimeVal");
    if (curEl) curEl.textContent = `${vid.currentTime.toFixed(2)}s`;
  };

  window.resetTrimmerFull = function() {
    trimmerState.inSec = 0.0;
    trimmerState.outSec = trimmerState.duration;
    trimmerState.playheadSec = 0.0;
    const vid = player();
    if (vid) vid.currentTime = 0;
    updateTrimmerUI();
    renderPlayheadNeedle(0);
    const curEl = document.getElementById("trimmerCurrentTimeVal");
    if (curEl) curEl.textContent = `0.00s`;
  };

  window.saveVideoTrim = async function() {
    const proj = window.getProj ? window.getProj() : (window.proj || {});
    const sceneId = trimmerState.sceneId;
    if (!proj || !sceneId) return;

    const saveBtn = document.getElementById("btnSaveVideoTrim");
    const origBtnHtml = saveBtn ? saveBtn.innerHTML : "💾 Save atkarpą";
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = "⏳ Kerpama...";
      saveBtn.style.opacity = "0.75";
    }

    try {
      const inVal = trimmerState.inSec;
      const outVal = trimmerState.outSec;
      const dur = trimmerState.duration || 3.0;
      const isTrimmed = (inVal > 0.05 || (dur - outVal) > 0.05);

      const cleanId = String(sceneId);
      const numId = cleanId.replace(/^S/i, '');

      const trimData = {
        start: inVal,
        end: outVal,
        duration: Math.round((outVal - inVal) * 100) / 100,
        enabled: isTrimmed
      };

      const out = window.getOutput ? window.getOutput(sceneId) : (proj.outputs || []).find(o => String(o.sceneId) === cleanId || String(o.sceneId) === numId);
      const sc = (proj.scenes || []).find(s => String(s.id) === cleanId || String(s.id) === numId);
      const mainVar = out && out.variations ? (out.variations.find(v => v.id === out.mainId) || out.variations.find(v => v.type === 'video') || out.variations[0]) : null;

      if (isTrimmed && trimmerState.videoUrl) {
        // 1. Physically cut video with backend FFmpeg endpoint into a standalone MP4
        let cutVideoUrl = null;
        try {
          const resp = await fetch("/api/video/cut", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sceneId: cleanId,
              videoUrl: trimmerState.videoUrl,
              start: inVal,
              end: outVal
            })
          });
          if (resp.ok) {
            const data = await resp.json();
            if (data.status === "success" && data.url) {
              cutVideoUrl = data.url;
            }
          }
        } catch(netErr) {
          console.warn("[Trimmer] Backend cut request failed, falling back to metadata trim:", netErr);
        }

        const finalUrl = cutVideoUrl || trimmerState.videoUrl;
        const cutVarId = `v_cut_${Date.now()}`;
        const newVar = {
          id: cutVarId,
          type: "video",
          url: finalUrl,
          status: "done",
          sourceVarId: mainVar ? mainVar.id : null,
          wfMode: `✂️ Cut [${inVal.toFixed(2)}s–${outVal.toFixed(2)}s]`,
          trim: trimData,
          params: {
            ...(mainVar ? (mainVar.params || {}) : {}),
            trim: trimData,
            video_url: finalUrl
          },
          createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19)
        };

        if (out) {
          if (!out.variations) out.variations = [];
          out.variations.push(newVar);
          out.mainId = cutVarId; // Sets the new cut video as the active variation!
          if (!out.params) out.params = {};
          out.params.trim = trimData;
          out.params.video_url = finalUrl;
        }

        if (sc) {
          sc.video_trim = trimData;
          sc.video_url = finalUrl;
          if (!sc.params) sc.params = {};
          sc.params.video_url = finalUrl;
          sc.params.trim = trimData;
        }

        if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
        if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images');

        if (typeof toast === 'function') {
          toast("Atkarpa išsaugota", `Sukurta nauja variacija: [${inVal.toFixed(2)}s – ${outVal.toFixed(2)}s]!`, "success");
        }
      } else {
        // Restored full duration
        if (mainVar) {
          mainVar.trim = trimData;
          if (!mainVar.params) mainVar.params = {};
          mainVar.params.trim = trimData;
        }
        if (sc) {
          sc.video_trim = trimData;
        }
        if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
        if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images');

        if (typeof toast === 'function') {
          toast("Atkarpa išsaugota", "Atkurta pilna video trukmė", "success");
        }
      }

      window.closeVideoTrimmer();
    } catch(err) {
      console.error("[Trimmer] Error saving trim:", err);
      if (typeof toast === 'function') toast("Klaida", "Nepavyko išsaugoti apkarpyto video!", "error");
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = origBtnHtml;
        saveBtn.style.opacity = "1";
      }
    }
  };

  // Wire up interactive drag handlers on timeline & controls
  function setupTimelineDragging() {
    const trk = track();
    const handleIn = document.getElementById("trimmerHandleIn");
    const handleOut = document.getElementById("trimmerHandleOut");
    const playhead = document.getElementById("trimmerPlayhead");

    if (!trk) return;

    function getTimeFromPointer(e) {
      const rect = trk.getBoundingClientRect();
      const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const pct = x / rect.width;
      return Math.max(0, Math.min(trimmerState.duration, pct * trimmerState.duration));
    }

    function onPointerMove(e) {
      if (!trimmerState.activeDrag) return;
      const targetTime = getTimeFromPointer(e);

      // CASE 1: Dragging the START [In] marker
      if (trimmerState.activeDrag === 'in') {
        const val = Math.max(0, Math.min(trimmerState.outSec - 0.05, Math.round(targetTime * 100) / 100));
        trimmerState.inSec = val;
        updateTrimmerUI();

        // LIVE HARDWARE-DECODED FRAME DISPLAY AS YOU DRAG:
        requestFrameSeek(val);

        const curEl = document.getElementById("trimmerCurrentTimeVal");
        if (curEl) curEl.textContent = `[IN] ${val.toFixed(2)}s`;

        // IMPORTANT: Playhead needle stays locked at its position!
        renderPlayheadNeedle(trimmerState.playheadSec);
      }
      // CASE 2: Dragging the END [Out] marker
      else if (trimmerState.activeDrag === 'out') {
        const val = Math.min(trimmerState.duration, Math.max(trimmerState.inSec + 0.05, Math.round(targetTime * 100) / 100));
        trimmerState.outSec = val;
        updateTrimmerUI();

        // LIVE HARDWARE-DECODED FRAME DISPLAY AS YOU DRAG:
        requestFrameSeek(val);

        const curEl = document.getElementById("trimmerCurrentTimeVal");
        if (curEl) curEl.textContent = `[OUT] ${val.toFixed(2)}s`;

        // IMPORTANT: Playhead needle stays locked at its position!
        renderPlayheadNeedle(trimmerState.playheadSec);
      }
      // CASE 3: Dragging the PLAYHEAD needle (scrubbing playback)
      else if (trimmerState.activeDrag === 'playhead') {
        trimmerState.playheadSec = targetTime;
        requestFrameSeek(targetTime);
        renderPlayheadNeedle(targetTime);
        const curEl = document.getElementById("trimmerCurrentTimeVal");
        if (curEl) curEl.textContent = `${targetTime.toFixed(2)}s`;
      }
    }

    function prepareForDrag() {
      const vid = player();
      wasPlayingBeforeDrag = vid ? (!vid.paused) : false;
      wasLoopingBeforeDrag = trimmerState.isPlayingLoop;
      if (trimmerState.isPlayingLoop) {
        if (trimmerState.rafId) {
          cancelAnimationFrame(trimmerState.rafId);
          trimmerState.rafId = null;
        }
      }
      if (vid && !vid.paused) {
        try { vid.pause(); } catch(err) {}
      }
    }

    function onPointerUp() {
      if (trimmerState.activeDrag) {
        const dragType = trimmerState.activeDrag;
        trimmerState.activeDrag = null;

        if (handleIn) handleIn.classList.remove("dragging");
        if (handleOut) handleOut.classList.remove("dragging");

        const vid = player();

        if (wasLoopingBeforeDrag) {
          // Resume looping cleanly across the updated [In .. Out] boundaries!
          setLoopState(true);
          if (vid) {
            vid.currentTime = trimmerState.inSec;
            trimmerState.playheadSec = trimmerState.inSec;
            renderPlayheadNeedle(trimmerState.inSec);
            vid.play().catch(() => {});
          }
        } else if (wasPlayingBeforeDrag) {
          if (vid) {
            vid.play().catch(() => {});
          }
        } else {
          // Paused mode: ensure video displays the exact frame of the handle or playhead!
          if (dragType === 'in') {
            requestFrameSeek(trimmerState.inSec);
            const curEl = document.getElementById("trimmerCurrentTimeVal");
            if (curEl) curEl.textContent = `[IN] ${trimmerState.inSec.toFixed(2)}s`;
          } else if (dragType === 'out') {
            requestFrameSeek(trimmerState.outSec);
            const curEl = document.getElementById("trimmerCurrentTimeVal");
            if (curEl) curEl.textContent = `[OUT] ${trimmerState.outSec.toFixed(2)}s`;
          } else if (dragType === 'playhead') {
            requestFrameSeek(trimmerState.playheadSec);
          }
        }

        wasLoopingBeforeDrag = false;
        wasPlayingBeforeDrag = false;
      }
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    // Mousedown on IN handle
    if (handleIn) {
      handleIn.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        prepareForDrag();
        trimmerState.activeDrag = 'in';
        handleIn.classList.add("dragging");
        requestFrameSeek(trimmerState.inSec);
      });
    }

    // Mousedown on OUT handle
    if (handleOut) {
      handleOut.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        prepareForDrag();
        trimmerState.activeDrag = 'out';
        handleOut.classList.add("dragging");
        requestFrameSeek(trimmerState.outSec);
      });
    }

    // Mousedown on PLAYHEAD needle
    if (playhead) {
      playhead.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        prepareForDrag();
        trimmerState.activeDrag = 'playhead';
      });
    }

    // Mousedown on TRACK background (seeks playhead needle and starts scrubbing)
    trk.addEventListener("pointerdown", (e) => {
      if (e.target === handleIn || e.target.closest("#trimmerHandleIn") ||
          e.target === handleOut || e.target.closest("#trimmerHandleOut")) {
        return;
      }
      e.preventDefault();
      prepareForDrag();
      trimmerState.activeDrag = 'playhead';
      const targetTime = getTimeFromPointer(e);
      trimmerState.playheadSec = targetTime;
      requestFrameSeek(targetTime);
      renderPlayheadNeedle(targetTime);
      const curEl = document.getElementById("trimmerCurrentTimeVal");
      if (curEl) curEl.textContent = `${targetTime.toFixed(2)}s`;
    });

    // Wire up slider inputs
    const inSl = inSlider();
    const outSl = outSlider();
    const inN = inNum();
    const outN = outNum();

    if (inSl) {
      inSl.addEventListener("input", (e) => {
        let val = parseFloat(e.target.value) || 0;
        if (val >= trimmerState.outSec) val = trimmerState.outSec - 0.05;
        trimmerState.inSec = Math.round(val * 100) / 100;
        requestFrameSeek(trimmerState.inSec);
        updateTrimmerUI();
      });
    }

    if (outSl) {
      outSl.addEventListener("input", (e) => {
        let val = parseFloat(e.target.value) || trimmerState.duration;
        if (val <= trimmerState.inSec) val = trimmerState.inSec + 0.05;
        trimmerState.outSec = Math.round(val * 100) / 100;
        requestFrameSeek(trimmerState.outSec);
        updateTrimmerUI();
      });
    }

    if (inN) {
      inN.addEventListener("change", (e) => {
        let val = parseFloat(e.target.value) || 0;
        val = Math.max(0, Math.min(trimmerState.outSec - 0.05, val));
        trimmerState.inSec = Math.round(val * 100) / 100;
        requestFrameSeek(trimmerState.inSec);
        updateTrimmerUI();
      });
    }

    if (outN) {
      outN.addEventListener("change", (e) => {
        let val = parseFloat(e.target.value) || trimmerState.duration;
        val = Math.max(trimmerState.inSec + 0.05, Math.min(trimmerState.duration, val));
        trimmerState.outSec = Math.round(val * 100) / 100;
        requestFrameSeek(trimmerState.outSec);
        updateTrimmerUI();
      });
    }
  }

  document.addEventListener("DOMContentLoaded", setupTimelineDragging);
  if (document.readyState === "complete" || document.readyState === "interactive") {
    setupTimelineDragging();
  }
})();
