// ============================================================================
// STILIŲ & BAZINIŲ VEIKĖJŲ LABORATORIJA (BASE STYLE LAB) - style_lab.js
// ============================================================================

(function() {
  // Laboratorijos būsena (State)
  const styleLabState = {
    activeSlug: '',
    isBuiltin: false,
    config: {},
    hasSavedVideoSession: false,
    sessionId: '',
    styleDnaTitle: '',
    styleRefImage: '',
    extractedFrames: [],
    selectedFrameFilename: '',
    images: {
      male: '',
      female: '',
      teen: '',
      kid: '',
      scene: ''
    },
    variations: {
      male: [],
      female: [],
      teen: [],
      kid: [],
      scene: [],
      frames: {}
    },
    generating: {
      male: false,
      female: false,
      teen: false,
      kid: false,
      scene: false
    },
    aspectRatio: '2:3',
    masterCharacterRole: null,
    characterReferenceMode: 'video',
    modelSettings: {
      customEnabled: false,
      steps: 20,
      cfg: 3.5,
      sampler: 'euler',
      scheduler: 'simple',
      denoise: 1.0
    }
  };

  // Užkrauname išsaugotus modelio nustatymus
  try {
    const savedMs = localStorage.getItem('styleLab_modelSettings');
    if (savedMs) {
      styleLabState.modelSettings = Object.assign(styleLabState.modelSettings, JSON.parse(savedMs));
    }
  } catch (e) {}

  window.styleLabState = styleLabState;

  // --------------------------------------------------------------------------
  // FORMATO (ASPECT RATIO) PRESETAI IR VALDYMAS
  // --------------------------------------------------------------------------
  const ASPECT_RATIO_PRESETS = {
    '2:3': { w: 832, h: 1248, css: '2/3', label: 'Visas kūnas (832x1248)' },
    '1:1': { w: 1024, h: 1024, css: '1/1', label: 'Kvadratas (1024x1024)' },
    '3:2': { w: 1248, h: 832, css: '3/2', label: 'Horizontalus (1248x832)' },
    '9:16': { w: 768, h: 1344, css: '9/16', label: 'Vertikalus (768x1344)' },
    '16:9': { w: 1344, h: 768, css: '16/9', label: 'Horizontalus (1344x768)' },
    '3:4': { w: 896, h: 1152, css: '3/4', label: 'Portretas (896x1152)' },
    '4:3': { w: 1152, h: 896, css: '4/3', label: 'Horizontalus (1152x896)' }
  };

  function updateCardsAspectRatioUI(ratioKey) {
    const preset = ASPECT_RATIO_PRESETS[ratioKey] || ASPECT_RATIO_PRESETS['2:3'];
    styleLabState.aspectRatio = ratioKey;
    ['Male', 'Female', 'Teen', 'Kid'].forEach(role => {
      const box = document.getElementById(`boxImg${role}`);
      if (box) {
        box.style.aspectRatio = preset.css;
      }
      const phSub = document.querySelector(`#placeholder${role} .ph-sub`);
      if (phSub) {
        phSub.textContent = preset.label;
      }
    });
  }
  window.updateCardsAspectRatioUI = updateCardsAspectRatioUI;

  // --------------------------------------------------------------------------
  // 1.0. AKTYVIOS VIDEO SESIJOS IŠSAUGOJIMAS IR ATSTATYMAS (PER DISKĄ IR LOCALSTORAGE)
  // --------------------------------------------------------------------------
  let _saveSessionTimer = null;
  function scheduleSaveActiveSession() {
    clearTimeout(_saveSessionTimer);
    _saveSessionTimer = setTimeout(() => {
      saveActiveSessionState();
    }, 600);
  }

  async function saveActiveSessionState() {
    if (!styleLabState.extractedFrames || styleLabState.extractedFrames.length === 0) {
      return;
    }

    const sessionPayload = {
      youtube_url: document.getElementById('videoStyleUrl')?.value.trim() || document.getElementById('youtubeUrlInput')?.value.trim() || '',
      session_id: styleLabState.sessionId || '',
      aspect_ratio: document.getElementById('styleLabAspectRatio')?.value || styleLabState.aspectRatio || '2:3',
      max_frames: document.getElementById('videoMaxFramesSelect')?.value || '100',
      scene_source: document.getElementById('sceneReferenceSourceSelect')?.value || 'auto',
      master_character_role: styleLabState.masterCharacterRole || '',
      character_reference_mode: document.getElementById('characterReferenceModeSelect')?.value || styleLabState.characterReferenceMode || 'video',
      selected_frame: {
        filename: styleLabState.selectedFrameFilename || '',
        vault_ref: styleLabState.styleRefImage || ''
      },
      style_dna: {
        displayName: document.getElementById('styleDisplayNameInput')?.value.trim() || '',
        slug: document.getElementById('styleSlugInput')?.value.trim() || '',
        scene_suffix: document.getElementById('styleSceneSuffix')?.value.trim() || '',
        scene_negative: document.getElementById('styleSceneNeg')?.value.trim() || '',
        character_negative: document.getElementById('styleCharNeg')?.value.trim() || '',
        character_prompt_prefix: document.getElementById('styleCharPrefix')?.value.trim() || '',
        character_prompt_suffix: document.getElementById('styleCharSuffix')?.value.trim() || '',
        background_extras_prompt: document.getElementById('styleBgExtras')?.value.trim() || '',
        prompt_male: document.getElementById('promptBaseMale')?.value.trim() || '',
        prompt_female: document.getElementById('promptBaseFemale')?.value.trim() || '',
        prompt_teen: document.getElementById('promptBaseTeen')?.value.trim() || '',
        prompt_kid: document.getElementById('promptBaseKid')?.value.trim() || '',
        prompt_scene: document.getElementById('promptBaseScene')?.value.trim() || ''
      },
      images: { ...styleLabState.images },
      variations: styleLabState.variations || { male: [], female: [], teen: [], kid: [], scene: [], frames: {} }
    };

    // 1. Išsaugome naršyklės atmintyje
    try {
      localStorage.setItem('sceneui_last_video_session', JSON.stringify({
        ...sessionPayload,
        frames: styleLabState.extractedFrames
      }));
    } catch (e) {}

    // 2. Siunčiame į serverį, kad išliktų net po serverio perkrovimo
    try {
      await fetch('/api/styles/update_video_session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionPayload)
      });
    } catch (e) {
      console.warn('[Style Lab] Nepavyko sinchronizuoti sesijos su serveriu:', e);
    }
  }

  async function restoreActiveVideoSession() {
    let sess = null;

    // 1. Pirmiausia bandome gauti naujausią sesiją iš serverio disko
    try {
      const res = await fetch('/api/styles/last_video_session');
      const data = await res.json();
      if (data.status === 'success' && data.data && data.data.frames && data.data.frames.length > 0) {
        sess = data.data;
      }
    } catch (e) {
      console.warn('[Style Lab] Klaida tikrinant serverio video sesiją:', e);
    }

    // 2. Jei serveris tuščias, bandome iš localStorage
    if (!sess) {
      try {
        const raw = localStorage.getItem('sceneui_last_video_session');
        if (raw) sess = JSON.parse(raw);
      } catch (e) {}
    }

    if (!sess || !sess.frames || sess.frames.length === 0) {
      styleLabState.hasSavedVideoSession = false;
      return false;
    }

    styleLabState.hasSavedVideoSession = true;
    styleLabState.sessionId = sess.session_id || '';
    styleLabState.extractedFrames = sess.frames || [];
    styleLabState.selectedFrameFilename = sess.selected_frame?.filename || '';
    styleLabState.styleRefImage = sess.selected_frame?.vault_ref || '';
    styleLabState.styleDnaTitle = sess.style_dna?.displayName || sess.selected_frame?.filename || 'Video';
    styleLabState.activeSlug = sess.style_dna?.slug || 'video_style';
    styleLabState.variations = sess.variations || { male: [], female: [], teen: [], kid: [], scene: [], frames: {} };
    if (!styleLabState.variations.frames) styleLabState.variations.frames = {};

    // Atstatome YouTube / Video URL laukelį
    if (sess.youtube_url) {
      setInputValue('videoStyleUrl', sess.youtube_url);
      setInputValue('youtubeUrlInput', sess.youtube_url);
    }

    // Atstatome pasirinktą Formato (Aspect Ratio) nustatymą
    if (sess.aspect_ratio) {
      setInputValue('styleLabAspectRatio', sess.aspect_ratio);
      updateCardsAspectRatioUI(sess.aspect_ratio);
    }

    if (sess.max_frames) {
      setInputValue('videoMaxFramesSelect', sess.max_frames);
    }

    if (sess.scene_source) {
      setInputValue('sceneReferenceSourceSelect', sess.scene_source);
    }

    styleLabState.masterCharacterRole = sess.master_character_role || sess.master_character?.role || null;
    styleLabState.characterReferenceMode = sess.character_reference_mode || 'video';
    if (sess.character_reference_mode) {
      setInputValue('characterReferenceModeSelect', sess.character_reference_mode);
    }

    // Nupiešiame kadrų galeriją
    renderExtractedFramesGallery(sess.frames, styleLabState.selectedFrameFilename);
    const galleryPanel = document.getElementById('videoFramesGalleryPanel');
    if (galleryPanel) galleryPanel.classList.remove('hidden');
    const countBadge = document.getElementById('videoFramesCount');
    if (countBadge) countBadge.textContent = `${sess.frames.length} kadrų`;

    // Atstatome Style DNA laukelius
    const dna = sess.style_dna || {};
    if (dna.displayName) setInputValue('styleDisplayNameInput', dna.displayName);
    if (dna.slug) setInputValue('styleSlugInput', dna.slug);
    if (dna.scene_suffix) setInputValue('styleSceneSuffix', dna.scene_suffix);
    if (dna.scene_negative) setInputValue('styleSceneNeg', dna.scene_negative);
    if (dna.character_negative) setInputValue('styleCharNeg', dna.character_negative);
    if (dna.character_prompt_prefix) setInputValue('styleCharPrefix', dna.character_prompt_prefix);
    if (dna.character_prompt_suffix) setInputValue('styleCharSuffix', dna.character_prompt_suffix);
    if (dna.background_extras_prompt) setInputValue('styleBgExtras', dna.background_extras_prompt);

    if (dna.prompt_male) setInputValue('promptBaseMale', dna.prompt_male);
    if (dna.prompt_female) setInputValue('promptBaseFemale', dna.prompt_female);
    if (dna.prompt_teen) setInputValue('promptBaseTeen', dna.prompt_teen);
    if (dna.prompt_kid) setInputValue('promptBaseKid', dna.prompt_kid);
    if (dna.prompt_scene) setInputValue('promptBaseScene', dna.prompt_scene);

    const advPanel = document.getElementById('advancedDNAPanel');
    if (advPanel) advPanel.classList.remove('hidden');

    // Atstatome generuotus paveikslėlius kortelėse ir variacijų sąrašą
    if (sess.images) {
      for (const r of ['male', 'female', 'teen', 'kid', 'scene']) {
        const imgUrl = sess.images[r];
        if (imgUrl) {
          styleLabState.images[r] = imgUrl;
          if (r === 'scene') updateSceneCardView(imgUrl);
          else updateArchetypeCardView(r, imgUrl);

          const cap = r.charAt(0).toUpperCase() + r.slice(1);
          const badge = document.getElementById(`badge${cap}`);
          if (badge) {
            badge.textContent = '✅ Parengta';
            badge.style.background = 'rgba(46, 204, 113, 0.2)';
            badge.style.color = '#2ecc71';
          }

          if (!styleLabState.variations[r]) styleLabState.variations[r] = [];
          if (!styleLabState.variations[r].some(v => v.url === imgUrl)) {
            styleLabState.variations[r].push({
              id: `var_init_${r}`,
              url: imgUrl,
              createdAt: 'Pradinis',
              prompt: document.getElementById(`promptBase${cap}`)?.value.trim() || '',
              isEdit: false
            });
          }
        }
        updateArchetypeVarsBadge(r);
      }
    }

    updateMasterCharacterUI();

    // Būsenos žyma
    const badge = document.getElementById('styleStatusBadge');
    if (badge) {
      badge.textContent = '🎬 VIDEO SESIJA (IŠSAUGOTA)';
      badge.style.background = 'rgba(0, 240, 255, 0.15)';
      badge.style.color = '#00f0ff';
      badge.style.borderColor = 'rgba(0, 240, 255, 0.3)';
    }

    return true;
  }

  // --------------------------------------------------------------------------
  // 1. INICIALIZACIJA IR STILIŲ SĄRAŠO UŽKROVIMAS
  // --------------------------------------------------------------------------
  async function initStyleLab() {
    const hasSession = await restoreActiveVideoSession();
    await loadStylesList(hasSession ? '__video_session__' : null);
    setupEventListeners();
  }
  window.initStyleLab = initStyleLab;

  async function loadStylesList(preferredSlug = null) {
    const select = document.getElementById('styleLabSelect');
    if (!select) return;

    try {
      const res = await fetch('/api/styles/list');
      const data = await res.json();
      if (data.status !== 'success' || !data.styles) return;

      let html = '';
      if (styleLabState.hasSavedVideoSession || styleLabState.extractedFrames.length > 0) {
        html += `<option value="__video_session__">🎬 Active Video Session (${styleLabState.styleDnaTitle || 'Išsaugota'})</option>`;
      }
      data.styles.forEach(s => {
        html += `<option value="${s.slug}">${s.displayName || s.slug} ${s.isBuiltin ? '(Gamyklinis)' : ''}</option>`;
      });
      select.innerHTML = html;

      // Pasirenkame nurodytą arba pirmą stilių
      const targetSlug = preferredSlug || (styleLabState.hasSavedVideoSession ? '__video_session__' : (styleLabState.activeSlug || data.styles[0]?.slug));
      if (targetSlug && Array.from(select.options).some(o => o.value === targetSlug)) {
        select.value = targetSlug;
      }
      
      if (select.value === '__video_session__') {
        const galleryPanel = document.getElementById('videoFramesGalleryPanel');
        if (galleryPanel) galleryPanel.classList.remove('hidden');
      } else if (select.value) {
        await loadStyleDetails(select.value);
      }
    } catch (e) {
      console.error('[Style Lab] Nepavyko užkrauti stilių sąrašo:', e);
    }
  }

  // --------------------------------------------------------------------------
  // 2. DETALIŲ UŽKROVIMAS PASIRINKTAM STILIUI
  // --------------------------------------------------------------------------
  async function loadStyleDetails(slug) {
    if (!slug) return;
    try {
      // Slėpti video kadrų galeriją, jei peržiūrimas įprastas stilius
      const galleryPanel = document.getElementById('videoFramesGalleryPanel');
      if (galleryPanel) galleryPanel.classList.add('hidden');

      const res = await fetch(`/api/styles/${slug}`);
      const data = await res.json();
      if (data.status !== 'success' || !data.style) return;

      const st = data.style;
      styleLabState.activeSlug = st.slug;
      styleLabState.isBuiltin = st.isBuiltin;
      styleLabState.config = st.config || {};

      // Užpildome formos laukelius
      const nameInput = document.getElementById('styleDisplayNameInput');
      const slugInput = document.getElementById('styleSlugInput');
      if (nameInput) nameInput.value = st.slug.replace(/_/g, ' ').toUpperCase();
      if (slugInput) slugInput.value = st.slug;

      // Konfigūracijos laukai
      const cfg = st.config || {};
      setInputValue('styleSceneSuffix', cfg.scene_suffix || '');
      setInputValue('styleSceneNeg', cfg.scene_negative || '');
      setInputValue('styleCharNeg', cfg.character_negative || '');
      setInputValue('styleBgExtras', cfg.background_extras_prompt || '');
      setInputValue('styleCharPrefix', cfg.character_prompt_prefix || 'make character in that exact style, neutral gray clothes, ');
      setInputValue('styleCharSuffix', cfg.character_prompt_suffix || ', in the same art style');

      // Būsenos ženkliukas
      const badge = document.getElementById('styleStatusBadge');
      if (badge) {
        if (st.isBuiltin) {
          badge.textContent = 'GAMYKLINIS (APSAUGOTAS)';
          badge.style.background = 'rgba(110, 168, 255, 0.15)';
          badge.style.color = 'var(--accent)';
          badge.style.borderColor = 'rgba(110, 168, 255, 0.3)';
        } else {
          badge.textContent = 'VARTOTOJO STILIUS';
          badge.style.background = 'rgba(78, 226, 163, 0.15)';
          badge.style.color = 'var(--good)';
          badge.style.borderColor = 'rgba(78, 226, 163, 0.3)';
        }
      }

      // Trynimo mygtuko būsena
      const btnDelete = document.getElementById('btnDeleteStyle');
      if (btnDelete) {
        btnDelete.disabled = st.isBuiltin;
        btnDelete.title = st.isBuiltin ? 'Gamyklinių stilių trinti negalima' : 'Delete šį stilių';
        btnDelete.style.opacity = st.isBuiltin ? '0.4' : '1';
      }

      // Užpildome bazinių atvaizdų nuorodas
      const urls = st.baseUrls || {};
      ['male', 'female', 'teen', 'kid'].forEach(role => {
        const url = urls[role] || '';
        styleLabState.images[role] = url;
        updateArchetypeCardView(role, url);
      });

      // Bandomosios scenos kadras
      const sceneUrl = `/vault/${st.slug}_base_scene.png`;
      styleLabState.images.scene = sceneUrl;
      updateSceneCardView(sceneUrl);

      // Jei promptai tušti, suformuojame pagal stilių
      populateDefaultPromptsIfEmpty(st.slug, cfg);

    } catch (e) {
      console.error('[Style Lab] Klaida kraunant stilių:', e);
    }
  }

  function setInputValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }

  function populateDefaultPromptsIfEmpty(slug, cfg) {
    const roles = [
      { id: 'promptBaseMale', default: 'make only one adult man character in that exact style, neutral gray clothes, short black hair, in the same art style' },
      { id: 'promptBaseFemale', default: 'make only one woman character in that exact style, neutral gray clothes, brown hair, in the same art style' },
      { id: 'promptBaseTeen', default: 'make only one teenager character in that exact style, neutral gray clothes, messy hair, in the same art style' },
      { id: 'promptBaseKid', default: 'make only one child character in that exact style, neutral gray clothes, neat hair, in the same art style' },
      { id: 'promptBaseScene', default: 'make only one scenic background environment in that exact style, neutral lighting, empty scene, no people, in the same art style' }
    ];

    roles.forEach(r => {
      const el = document.getElementById(r.id);
      if (el && !el.value.trim()) {
        el.value = r.default;
      }
    });
  }

  // --------------------------------------------------------------------------
  // 3. KORTELIŲ VAIZDO ATNAUJINIMAS
  // --------------------------------------------------------------------------
  function updateArchetypeCardView(role, url) {
    const capitalRole = role.charAt(0).toUpperCase() + role.slice(1);
    const imgEl = document.getElementById(`imgBase${capitalRole}`);
    const placeholder = document.getElementById(`placeholder${capitalRole}`);
    const badge = document.getElementById(`badge${capitalRole}`);

    if (!imgEl) return;

    if (url) {
      // Tikriname ar paveikslėlis užsikrauna
      const finalSrc = url.startsWith('data:') ? url : `${url}?t=${Date.now()}`;
      const testImg = new Image();
      testImg.onload = () => {
        imgEl.src = finalSrc;
        imgEl.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
        if (badge) {
          badge.textContent = 'Paruoštas';
          badge.style.background = 'rgba(78, 226, 163, 0.15)';
          badge.style.color = 'var(--good)';
          badge.style.borderColor = 'rgba(78, 226, 163, 0.3)';
        }
      };
      testImg.onerror = () => {
        imgEl.style.display = 'none';
        if (placeholder) placeholder.style.display = 'block';
        if (badge) {
          badge.textContent = 'Trūksta';
          badge.style.background = 'rgba(255, 255, 255, 0.06)';
          badge.style.color = 'var(--muted)';
        }
      };
      testImg.src = finalSrc;
    } else {
      imgEl.style.display = 'none';
      if (placeholder) placeholder.style.display = 'block';
      if (badge) {
        badge.textContent = 'Trūksta';
        badge.style.background = 'rgba(255, 255, 255, 0.06)';
        badge.style.color = 'var(--muted)';
      }
    }
  }

  function updateSceneCardView(url) {
    const imgEl = document.getElementById('imgBaseScene');
    const placeholder = document.getElementById('placeholderScene');
    if (!imgEl) return;

    if (url) {
      const finalSrc = url.startsWith('data:') ? url : `${url}?t=${Date.now()}`;
      const testImg = new Image();
      testImg.onload = () => {
        imgEl.src = finalSrc;
        imgEl.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
      };
      testImg.onerror = () => {
        imgEl.style.display = 'none';
        if (placeholder) placeholder.style.display = 'block';
      };
      testImg.src = finalSrc;
    } else {
      imgEl.style.display = 'none';
      if (placeholder) placeholder.style.display = 'block';
    }
  }

  // --------------------------------------------------------------------------
  // 3.5. MASTER CHARACTER SEED & STILIAUS ŠEIMININKO VALDYMAS
  // --------------------------------------------------------------------------
  const ROLE_NAMES = {
    male: 'Vyras',
    female: 'Moteris',
    teen: 'Paauglys',
    kid: 'Vaikas',
    scene: 'Scene'
  };

  // --------------------------------------------------------------------------
  // 3.4. STYLE LAB VARIACIJŲ & REDAGAVIMO SISTEMA (FURTHER EDIT & VARIATIONS)
  // --------------------------------------------------------------------------
  function updateArchetypeVarsBadge(role) {
    const capitalRole = role.charAt(0).toUpperCase() + role.slice(1);
    const countEl = document.getElementById(`lblVarsCount${capitalRole}`);
    if (countEl) {
      const vars = (styleLabState.variations && styleLabState.variations[role]) || [];
      countEl.textContent = vars.length;
    }
  }
  window.updateArchetypeVarsBadge = updateArchetypeVarsBadge;

  function updateAllArchetypeVarsBadges() {
    ['male', 'female', 'teen', 'kid', 'scene'].forEach(r => updateArchetypeVarsBadge(r));
  }
  window.updateAllArchetypeVarsBadges = updateAllArchetypeVarsBadges;

  function updateModalFrameVarsButton(frameFilename) {
    const btnVars = document.getElementById('btnModalVarsFocusedFrame');
    const lblCount = document.getElementById('lblModalFocusedVarsCount');
    if (!btnVars) return;
    const fVars = (styleLabState.variations && styleLabState.variations.frames && styleLabState.variations.frames[frameFilename]) || [];
    if (fVars.length > 0) {
      btnVars.classList.remove('hidden');
      if (lblCount) lblCount.textContent = fVars.length;
    } else {
      btnVars.classList.add('hidden');
      if (lblCount) lblCount.textContent = '0';
    }
  }
  window.updateModalFrameVarsButton = updateModalFrameVarsButton;

  function openStyleLabVars(targetId, type = 'archetype') {
    const modal = document.getElementById('modalStyleLabVars');
    const titleEl = document.getElementById('styleLabVarsTitle');
    const subtitleEl = document.getElementById('styleLabVarsSubtitle');
    const gridEl = document.getElementById('styleLabVarsGrid');
    if (!modal || !gridEl) return;

    gridEl.innerHTML = '';

    let vars = [];
    const isArchetype = (type === 'archetype');
    let titleStr = '';
    let currentActiveUrl = '';

    if (isArchetype) {
      const role = targetId;
      const capitalRole = role.charAt(0).toUpperCase() + role.slice(1);
      const roleName = ROLE_NAMES[role] || (role === 'scene' ? 'Scenos Kadras' : capitalRole);
      titleStr = `${roleName} Variacijos`;
      currentActiveUrl = styleLabState.images[role] || '';

      if (!styleLabState.variations[role]) styleLabState.variations[role] = [];
      vars = styleLabState.variations[role];

      // Jei sąrašas tuščias, bet turime esamą atvaizdą kortelėje, įdedame jį kaip pradinį
      if (vars.length === 0 && currentActiveUrl) {
        vars.push({
          id: `var_init_${role}`,
          url: currentActiveUrl,
          createdAt: Date.now(),
          isEdit: false,
          label: 'Pradinis'
        });
        updateArchetypeVarsBadge(role);
      }
    } else {
      // type === 'frame'
      const frameFilename = targetId;
      titleStr = `Kadro Variacijos (${frameFilename})`;
      currentActiveUrl = modalFocusedFrame ? modalFocusedFrame.url : '';

      if (!styleLabState.variations.frames) styleLabState.variations.frames = {};
      if (!styleLabState.variations.frames[frameFilename]) styleLabState.variations.frames[frameFilename] = [];
      vars = styleLabState.variations.frames[frameFilename];

      // Jei sąrašas tuščias, įdedame originalų ištrauktą kadrą
      if (vars.length === 0) {
        const origFrame = (styleLabState.extractedFrames || []).find(f => f.filename === frameFilename);
        if (origFrame) {
          vars.push({
            id: `orig_${frameFilename}`,
            url: origFrame.url,
            createdAt: Date.now() - 5000,
            isOriginal: true,
            label: 'Originalus kadras'
          });
          updateModalFrameVarsButton(frameFilename);
        }
      }
    }

    if (titleEl) titleEl.textContent = `${titleStr} (${vars.length})`;
    if (subtitleEl) subtitleEl.textContent = isArchetype
      ? 'Pasirinkite, kuri versija bus pagrindinis etalonas, nustatykite Master arba redaguokite toliau'
      : 'Pasirinkite kadro versiją, kuri bus naudojama kaip stiliaus atskaita (Ref A)';

    if (vars.length === 0) {
      gridEl.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px 20px; color: var(--text-muted);">
          <div style="font-size: 32px; margin-bottom: 8px;">📚</div>
          <div>Šiuo metu nėra jokių išsaugotų variacijų.</div>
          <div class="text-xs" style="margin-top: 4px;">Sugeneruokite arba atlikite redagavimą (✨ Redaguoti), kad atsirastų naujų versijų.</div>
        </div>
      `;
      modal.classList.add('show');
      return;
    }

    const totalCount = vars.length;

    vars.forEach((vItem, index) => {
      const isActive = currentActiveUrl ? (vItem.url === currentActiveUrl) : (index === 0);
      const isMaster = isArchetype && (styleLabState.masterCharacterRole === targetId) && isActive;
      const verTag = vItem.label || `v${totalCount - index}`;

      const card = document.createElement('div');
      card.className = 'stylelab-var-item';
      card.style.cssText = `
        background: rgba(18, 24, 38, 0.85);
        border: 2px solid ${isActive ? '#00f0ff' : 'var(--border)'};
        box-shadow: ${isActive ? '0 0 16px rgba(0, 240, 255, 0.45)' : 'none'};
        border-radius: 10px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        transition: transform 0.15s, border-color 0.15s;
        position: relative;
      `;

      const isLandscape = !isArchetype || targetId === 'scene';
      const aspectCss = isLandscape ? '16/9' : (styleLabState.aspectRatio ? (ASPECT_RATIO_PRESETS[styleLabState.aspectRatio]?.css || '2/3') : '2/3');

      card.innerHTML = `
        <div style="position: relative; width: 100%; aspect-ratio: ${aspectCss}; background: #000; overflow: hidden; cursor: pointer;">
          <img src="${vItem.url}" alt="${verTag}" style="width: 100%; height: 100%; object-fit: cover; display: block;" />
          <div style="position: absolute; top: 6px; left: 6px; font-size: 10px; font-weight: 800; background: rgba(0,0,0,0.8); color: #fff; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2);">
            ${verTag}
          </div>
          ${isActive ? `<div style="position: absolute; top: 6px; right: 6px; font-size: 10px; font-weight: 800; background: #00f0ff; color: #000; padding: 2px 8px; border-radius: 4px; box-shadow: 0 2px 6px rgba(0,0,0,0.6);">⭐ AKTYVUS</div>` : ''}
          ${isMaster ? `<div style="position: absolute; bottom: 6px; left: 6px; font-size: 10px; font-weight: 800; background: #f59e0b; color: #000; padding: 2px 8px; border-radius: 4px; box-shadow: 0 2px 6px rgba(0,0,0,0.6);">👑 MASTER</div>` : ''}
          ${vItem.isEdit ? `<div style="position: absolute; bottom: 6px; right: 6px; font-size: 9px; font-weight: 700; background: rgba(245, 158, 11, 0.9); color: #000; padding: 1px 6px; border-radius: 4px;">✨ Edit</div>` : ''}
        </div>
        <div style="padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; flex: 1;">
          <div class="flex items-center justify-between text-xs text-muted" style="border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 6px;">
            <span>${vItem.createdAt && typeof vItem.createdAt === 'number' ? new Date(vItem.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Versija'}</span>
            <span class="font-mono text-xs" style="color: rgba(255,255,255,0.4);">${vItem.id ? vItem.id.slice(-6) : ''}</span>
          </div>
          ${vItem.prompt ? `<div class="text-xs text-muted" style="max-height: 38px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; font-style: italic;" title="${vItem.prompt}">"${vItem.prompt}"</div>` : ''}
          
          <div style="margin-top: auto; display: flex; flex-direction: column; gap: 6px; padding-top: 4px;">
            ${isActive 
              ? `<button type="button" class="btn text-xs" disabled style="background: rgba(0, 240, 255, 0.15); color: #00f0ff; border: 1px solid #00f0ff; font-weight: 800; width: 100%; cursor: default;">✓ Pasirinktas kaip etalonas</button>`
              : `<button type="button" class="btn text-xs btn-primary btn-select-var" data-target="${targetId}" data-varid="${vItem.id}" data-type="${type}" style="width: 100%; font-weight: 700;">✓ Pasirinkti šį</button>`
            }
            ${(isArchetype && targetId !== 'scene') ? `
              ${isMaster 
                ? `<button type="button" class="btn text-xs" disabled style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid #f59e0b; font-weight: 800; width: 100%; cursor: default;">👑 Aktyvus Master</button>`
                : `<button type="button" class="btn text-xs btn-make-master" data-target="${targetId}" data-varid="${vItem.id}" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); font-weight: 700; width: 100%;">👑 Nustatyti Master</button>`
              }
            ` : ''}
            <div class="flex items-center" style="gap: 6px;">
              <button type="button" class="btn text-xs flex-1 btn-edit-this-var" data-target="${targetId}" data-type="${type}" data-url="${vItem.url}" style="background: rgba(255,255,255,0.06); border: 1px solid var(--border); color: var(--text);">
                ✨ Redaguoti
              </button>
              <button type="button" class="btn text-xs btn-delete-var" data-target="${targetId}" data-varid="${vItem.id}" data-type="${type}" style="color: #ff6b6b; border: 1px solid rgba(255,107,107,0.3); background: rgba(255,107,107,0.08); padding: 5px 9px;" title="Delete šią variaciją">
                🗑️
              </button>
            </div>
          </div>
        </div>
      `;

      const imgThumb = card.querySelector('img');
      if (imgThumb) {
        imgThumb.addEventListener('click', () => {
          if (typeof window.openImageLightbox === 'function') {
            window.openImageLightbox(vItem.url, `${titleStr} - ${verTag}`);
          }
        });
      }

      gridEl.appendChild(card);
    });

    gridEl.querySelectorAll('.btn-select-var').forEach(btn => {
      btn.addEventListener('click', () => {
        selectStyleLabVar(btn.dataset.target, btn.dataset.varid, btn.dataset.type);
      });
    });

    gridEl.querySelectorAll('.btn-make-master').forEach(btn => {
      btn.addEventListener('click', async () => {
        selectStyleLabVar(btn.dataset.target, btn.dataset.varid, 'archetype');
        await setMasterCharacter(btn.dataset.target);
        openStyleLabVars(btn.dataset.target, 'archetype');
      });
    });

    gridEl.querySelectorAll('.btn-edit-this-var').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.classList.remove('show');
        openStyleLabFurtherEdit({
          type: btn.dataset.type,
          role: btn.dataset.target,
          frameFilename: btn.dataset.target,
          url: btn.dataset.url
        });
      });
    });

    gridEl.querySelectorAll('.btn-delete-var').forEach(btn => {
      btn.addEventListener('click', () => {
        deleteStyleLabVar(btn.dataset.target, btn.dataset.varid, btn.dataset.type);
      });
    });

    modal.classList.add('show');
  }
  window.openStyleLabVars = openStyleLabVars;

  function selectStyleLabVar(targetId, varId, type = 'archetype') {
    if (type === 'archetype') {
      const list = styleLabState.variations[targetId] || [];
      const item = list.find(v => v.id === varId);
      if (item) {
        styleLabState.images[targetId] = item.url;
        if (targetId === 'scene') updateSceneCardView(item.url);
        else updateArchetypeCardView(targetId, item.url);
        saveActiveSessionState();
        openStyleLabVars(targetId, type);
        if (typeof window.toast === 'function') {
          window.toast('Variacija pasirinkta', `${ROLE_NAMES[targetId] || targetId} aktyvus etalonas atnaujintas!`, 'info');
        }
      }
    } else {
      const list = (styleLabState.variations.frames && styleLabState.variations.frames[targetId]) || [];
      const item = list.find(v => v.id === varId);
      if (item) {
        const origFrame = (styleLabState.extractedFrames || []).find(f => f.filename === targetId);
        if (origFrame) origFrame.url = item.url;
        if (modalFocusedFrame && modalFocusedFrame.filename === targetId) {
          modalFocusedFrame.url = item.url;
          const imgEl = document.getElementById('modalFocusedFrameImg');
          if (imgEl) imgEl.src = item.url;
        }
        if (styleLabState.selectedFrameFilename === targetId) {
          applySelectedReferenceFrame({ filename: targetId, url: item.url, timestamp: origFrame?.timestamp || 0 });
        }
        saveActiveSessionState();
        openStyleLabVars(targetId, type);
        renderModalFramesGrid();
        renderExtractedFramesGallery(styleLabState.extractedFrames, styleLabState.selectedFrameFilename);
        if (typeof window.toast === 'function') {
          window.toast('Kadro variacija pasirinkta', `Kadro (${targetId}) atvaizdas atnaujintas.`, 'info');
        }
      }
    }
  }
  window.selectStyleLabVar = selectStyleLabVar;

  function deleteStyleLabVar(targetId, varId, type = 'archetype') {
    if (!confirm('Ar tikrai norite ištrinti šią variaciją?')) return;

    if (type === 'archetype') {
      const list = styleLabState.variations[targetId] || [];
      const item = list.find(v => v.id === varId);
      styleLabState.variations[targetId] = list.filter(v => v.id !== varId);
      if (item && styleLabState.images[targetId] === item.url) {
        const remaining = styleLabState.variations[targetId];
        const newUrl = remaining.length > 0 ? remaining[0].url : '';
        styleLabState.images[targetId] = newUrl;
        if (targetId === 'scene') updateSceneCardView(newUrl);
        else updateArchetypeCardView(targetId, newUrl);
      }
      updateArchetypeVarsBadge(targetId);
    } else {
      if (!styleLabState.variations.frames) styleLabState.variations.frames = {};
      const list = styleLabState.variations.frames[targetId] || [];
      const item = list.find(v => v.id === varId);
      styleLabState.variations.frames[targetId] = list.filter(v => v.id !== varId);
      if (item && modalFocusedFrame && modalFocusedFrame.url === item.url) {
        const remaining = styleLabState.variations.frames[targetId];
        const origFrame = (styleLabState.extractedFrames || []).find(f => f.filename === targetId);
        const newUrl = remaining.length > 0 ? remaining[0].url : (origFrame ? origFrame.url : '');
        modalFocusedFrame.url = newUrl;
        const imgEl = document.getElementById('modalFocusedFrameImg');
        if (imgEl) imgEl.src = newUrl;
        if (origFrame) origFrame.url = newUrl;
      }
      updateModalFrameVarsButton(targetId);
      renderModalFramesGrid();
      renderExtractedFramesGallery(styleLabState.extractedFrames, styleLabState.selectedFrameFilename);
    }

    saveActiveSessionState();
    openStyleLabVars(targetId, type);
    if (typeof window.toast === 'function') {
      window.toast('Ištrinta', 'Variacija sėkmingai pašalinta.', 'info');
    }
  }
  window.deleteStyleLabVar = deleteStyleLabVar;

  function openStyleLabFurtherEdit(target) {
    let type = 'archetype';
    let role = null;
    let frameFilename = null;
    let imgSrc = null;

    if (typeof target === 'string') {
      role = target;
      type = 'archetype';
      imgSrc = styleLabState.images[role];
    } else if (target && typeof target === 'object') {
      type = target.type || 'archetype';
      role = target.role;
      frameFilename = target.frameFilename;
      imgSrc = target.url || (role ? styleLabState.images[role] : null);
    }

    if (!imgSrc) {
      if (typeof window.toast === 'function') {
        window.toast('Nėra vaizdo', 'Pirmiausia sugeneruokite arba įkelkite vaizdą, kurį norite redaguoti!', 'warning');
      }
      return;
    }

    window.styleLabEditContext = {
      active: true,
      type: type,
      role: role,
      frameFilename: frameFilename,
      currentImg: imgSrc
    };
    if (window.state) window.state.viewerContext = 'style_lab';

    const imgEl = document.getElementById('feImgPreview');
    if (imgEl) {
      imgEl.src = imgSrc;
      imgEl.dataset.varId = '';
      imgEl.onclick = () => {
        if (imgEl.src && typeof window.openImageLightbox === 'function') {
          window.openImageLightbox(imgEl.src, `Style Lab Edit - ${role || frameFilename}`);
        }
      };
    }

    const titleEl = document.getElementById('feModalTitle');
    if (titleEl) {
      if (type === 'archetype') {
        titleEl.textContent = `✨ Redaguoti: ${(ROLE_NAMES[role] || role).toUpperCase()} etaloną`;
      } else {
        titleEl.textContent = `✨ Redaguoti kadrą (${frameFilename})`;
      }
    }

    const promptInput = document.getElementById('fePrompt');
    if (promptInput) {
      promptInput.value = '';
      promptInput.placeholder = type === 'archetype' 
        ? 'Pvz.: make hair darker, add glasses, change clothing to jacket, keep same art style...'
        : 'Pvz.: remove background characters, improve lighting, keep exact art style...';
    }

    const feRef1 = document.getElementById('feRef1');
    if (feRef1) feRef1.value = '';
    const feRef2 = document.getElementById('feRef2');
    if (feRef2) feRef2.value = '';

    if (typeof window.updateFeRefDisplays === 'function') {
      window.updateFeRefDisplays();
    } else if (typeof window.syncCustomSelects === 'function') {
      window.syncCustomSelects(['feRef1', 'feRef2']);
    }

    const modal = document.getElementById('modalFurtherEdit');
    if (modal) modal.classList.add('show');
  }
  window.openStyleLabFurtherEdit = openStyleLabFurtherEdit;

  async function executeStyleLabFurtherEdit(params) {
    const editCtx = window.styleLabEditContext;
    if (!editCtx || !editCtx.active) {
      console.warn('[Style Lab] Nėra aktyvaus Style Lab edit konteksto.');
      return;
    }

    const { imgSrc, editPrompt, extraRef1, extraRef2 } = params;
    if (!imgSrc) {
      if (typeof window.toast === 'function') window.toast('Klaida', 'Nėra paveikslėlio redagavimui!', 'error');
      return;
    }

    if (typeof window.toast === 'function') {
      window.toast('⏳ Ruošiamas redagavimas', 'Keliamas atskaitos vaizdas į GPU saugyklą...', 'info');
    }

    try {
      let uploadedName = '';
      if (imgSrc.startsWith('/vault/')) {
        uploadedName = imgSrc.replace(/^\/vault\//, '').split('?')[0];
      } else {
        const res = await fetch(imgSrc);
        if (!res.ok) throw new Error(`Nepavyko nuskaityti vaizdo: ${res.status}`);
        const blob = await res.blob();
        const file = new File([blob], `stylelab_edit_${Date.now()}_${Math.random().toString(36).substr(2, 4)}.png`, { type: blob.type || 'image/png' });
        const formData = new FormData();
        formData.append('file', file);
        const upRes = await fetch('/api/upload_vault', { method: 'POST', body: formData });
        if (!upRes.ok) throw new Error('Nepavyko įkelti vaizdo į Vault saugyklą.');
        const upData = await upRes.json();
        uploadedName = upData.url.split('/').pop();
      }

      let finalPrompt = editPrompt.trim();
      if (extraRef1 && !finalPrompt.toLowerCase().includes('image 2') && !finalPrompt.toLowerCase().includes('picture 2')) {
        finalPrompt = `Image 1 is the base image. Image 2 is the character reference. In Image 1, modify: ${finalPrompt} (referencing the character in Image 2).`;
      }
      if (extraRef2 && !finalPrompt.toLowerCase().includes('image 3') && !finalPrompt.toLowerCase().includes('picture 3')) {
        finalPrompt += ` Also use Image 3 as additional reference.`;
      }

      const activeProjId = (window.state && window.state.currentProjectId) || (typeof state !== 'undefined' && state.currentProjectId) || 'default';
      const currentSlug = document.getElementById('styleSlugInput')?.value.trim() || styleLabState.activeSlug || 'custom_style';

      let reqId = '';
      let w = 832;
      let h = 1248;
      let prefix = 'StyleLab_Edit';
      let negPrompt = '';

      if (editCtx.type === 'archetype') {
        const role = editCtx.role;
        const isArchetype = role !== 'scene';
        const arSelectVal = document.getElementById('styleLabAspectRatio')?.value || styleLabState.aspectRatio || '2:3';
        const arPreset = ASPECT_RATIO_PRESETS[arSelectVal] || ASPECT_RATIO_PRESETS['2:3'];
        w = isArchetype ? arPreset.w : 1920;
        h = isArchetype ? arPreset.h : 1080;
        reqId = `style_edit_${currentSlug}_${role}_${Date.now().toString(36)}`;
        prefix = `StyleLab_Edit_${role}`;

        negPrompt = document.getElementById(isArchetype ? 'styleCharNeg' : 'styleSceneNeg')?.value || '';
        if (isArchetype) {
          const antiCropNeg = "close-up, bust shot, headshot, portrait framing, cropped legs, cut off legs, cropped feet, out of frame legs, out of frame body, cut off head, low quality, blurry, bad anatomy";
          negPrompt = negPrompt ? `${antiCropNeg}, ${negPrompt}` : antiCropNeg;
        }

        setCardLoading(role, true);
      } else {
        w = 1920;
        h = 1080;
        const safeFrameKey = (editCtx.frameFilename || 'frame').replace(/[^a-zA-Z0-9_-]/g, '_');
        reqId = `style_frame_edit_${safeFrameKey}_${Date.now().toString(36)}`;
        prefix = `StyleLab_FrameEdit_${safeFrameKey}`;
        negPrompt = "low quality, blurry, distorted, bad anatomy";

        window._pendingFrameEdits = window._pendingFrameEdits || {};
        window._pendingFrameEdits[reqId] = editCtx.frameFilename;
      }

      let wf = null;
      if (typeof window.buildWorkflow === 'function') {
        const sLabModelEl = document.getElementById('styleLabModel');
        const modelVal = sLabModelEl?.value || '';
        let unetOverride = undefined;
        let wfModeOverride = undefined;
        if (modelVal && modelVal !== 'custom') {
          const parts = modelVal.split('|');
          wfModeOverride = parts[0];
          unetOverride = parts[1];
        }

        const buildParams = {
          prompt: finalPrompt,
          negative: negPrompt,
          refA: uploadedName,
          refB: extraRef1 || '',
          refC: extraRef2 || '',
          sceneId: reqId,
          w: w,
          h: h,
          prefix: prefix,
          workflowMode: wfModeOverride,
          unetName: unetOverride
        };

        if (styleLabState.modelSettings && styleLabState.modelSettings.customEnabled) {
          buildParams.steps = styleLabState.modelSettings.steps;
          buildParams.cfg = styleLabState.modelSettings.cfg;
          buildParams.sampler = styleLabState.modelSettings.sampler;
        }

        const resWf = window.buildWorkflow(buildParams);
        wf = resWf?.workflow || resWf;
      }

      if (!wf) throw new Error('Nepavyko sukurti ComfyUI workflow.');

      const resQueue = await fetch('/api/queue/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priority: 1,
          projectId: activeProjId,
          sceneId: reqId,
          workflow: wf
        })
      });

      const qData = await resQueue.json();
      if (qData.status !== 'success') {
        throw new Error(qData.message || 'Serveris atmetė redagavimo užduotį');
      }

      if (typeof window.toast === 'function') {
        window.toast('🚀 Redagavimas išsiųstas', 'Užduotis perduota ComfyUI GPU apdorojimui!', 'success');
      }

    } catch (err) {
      console.error('[Style Lab Further Edit Error]:', err);
      if (typeof window.toast === 'function') {
        window.toast('Redagavimo Klaida', err.message, 'error');
      }
      if (editCtx.type === 'archetype' && editCtx.role) {
        setCardLoading(editCtx.role, false);
      }
    }
  }
  window.executeStyleLabFurtherEdit = executeStyleLabFurtherEdit;

  async function setMasterCharacter(role) {
    if (!role || !styleLabState.images[role]) {
      if (typeof window.toast === 'function') {
        window.toast('Trūksta atvaizdo', `Pirmiausia sugeneruokite arba įkelkite ${ROLE_NAMES[role] || role} atvaizdą!`, 'warning');
      }
      return;
    }

    const currentSlug = styleLabState.activeSlug || document.getElementById('styleSlugInput')?.value.trim() || 'video_style';
    const imgUrl = styleLabState.images[role];

    try {
      const res = await fetch('/api/styles/set_master_character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, image_url: imgUrl, slug: currentSlug })
      });
      const data = await res.json();
      if (data.status === 'success') {
        styleLabState.masterCharacterRole = role;
        styleLabState.characterReferenceMode = 'master';
        setInputValue('characterReferenceModeSelect', 'master');
        updateMasterCharacterUI();
        saveActiveSessionState();

        if (typeof window.toast === 'function') {
          window.toast('👑 Master Etalonas nustatytas', `${ROLE_NAMES[role]} tapo pagrindiniu stiliaus etalonu! Kiti veikėjai dabar bus klonuojami pagal jį.`, 'success');
        }
      } else {
        throw new Error(data.message || 'Nepavyko nustatyti Master etalono');
      }
    } catch (e) {
      console.error('[Set Master Character Error]:', e);
      // Fallback
      styleLabState.masterCharacterRole = role;
      styleLabState.characterReferenceMode = 'master';
      setInputValue('characterReferenceModeSelect', 'master');
      updateMasterCharacterUI();
      saveActiveSessionState();
    }
  }

  function updateMasterCharacterUI() {
    const masterRole = styleLabState.masterCharacterRole;
    const refMode = document.getElementById('characterReferenceModeSelect')?.value || styleLabState.characterReferenceMode || 'video';

    // 1. Atnaujiname kiekvienos kortelės Master mygtuką ir auksinius rėmelius
    ['male', 'female', 'teen', 'kid'].forEach(r => {
      const cap = r.charAt(0).toUpperCase() + r.slice(1);
      const card = document.getElementById(`cardBase${cap}`);
      const masterBadge = document.getElementById(`masterBadge${cap}`);
      const btnMaster = document.getElementById(`btnMaster${cap}`);
      const isMaster = (r === masterRole);

      if (card) {
        if (isMaster && refMode === 'master') {
          card.style.borderColor = '#f59e0b';
          card.style.boxShadow = '0 0 16px rgba(245, 158, 11, 0.45)';
        } else {
          card.style.borderColor = 'var(--border)';
          card.style.boxShadow = 'none';
        }
      }

      if (masterBadge) {
        if (isMaster) {
          masterBadge.classList.remove('hidden');
        } else {
          masterBadge.classList.add('hidden');
        }
      }

      if (btnMaster) {
        if (isMaster) {
          btnMaster.innerHTML = '👑 Aktyvus Master Etalonas';
          btnMaster.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
          btnMaster.style.color = '#000';
          btnMaster.style.borderColor = '#f59e0b';
        } else {
          btnMaster.innerHTML = '👑 Nustatyti kaip Master';
          btnMaster.style.background = 'rgba(245, 158, 11, 0.12)';
          btnMaster.style.color = '#fbbf24';
          btnMaster.style.borderColor = 'rgba(245, 158, 11, 0.35)';
        }
      }
    });

    // 2. Atnaujiname atskaitos parinkiklio parinktį
    const optMaster = document.getElementById('optRefModeMaster');
    if (optMaster) {
      if (masterRole) {
        optMaster.disabled = false;
        optMaster.textContent = `👑 Master Veikėjas: ${ROLE_NAMES[masterRole] || masterRole}`;
      } else {
        optMaster.disabled = true;
        optMaster.textContent = '👑 Master Veikėjas (Nenustatytas)';
      }
    }

    const refModeSelect = document.getElementById('characterReferenceModeSelect');
    if (refModeSelect) {
      refModeSelect.value = (masterRole && refMode === 'master') ? 'master' : 'video';
    }

    // 3. Rodyti / slėpti veiksmų mygtukus viršuje
    const btnClone = document.getElementById('btnCloneFromMaster');
    const btnAdapt = document.getElementById('btnAdaptPromptsForMaster');
    const isMasterActive = !!(masterRole && (refMode === 'master' || refModeSelect?.value === 'master'));

    if (btnClone) {
      if (isMasterActive) {
        btnClone.classList.remove('hidden');
        btnClone.innerHTML = `🪄 Generate Likusius pagal ${ROLE_NAMES[masterRole] || masterRole}`;
      } else {
        btnClone.classList.add('hidden');
      }
    }

    if (btnAdapt) {
      if (isMasterActive) {
        btnAdapt.classList.remove('hidden');
      } else {
        btnAdapt.classList.add('hidden');
      }
    }
  }

  async function adaptPromptsForMasterCloning(sourceRole) {
    const roleToUse = sourceRole || styleLabState.masterCharacterRole || 'female';
    const cap = roleToUse.charAt(0).toUpperCase() + roleToUse.slice(1);
    const sourcePrompt = document.getElementById(`promptBase${cap}`)?.value.trim() || '';

    const currentPrompts = {
      male: document.getElementById('promptBaseMale')?.value.trim() || '',
      female: document.getElementById('promptBaseFemale')?.value.trim() || '',
      teen: document.getElementById('promptBaseTeen')?.value.trim() || '',
      kid: document.getElementById('promptBaseKid')?.value.trim() || ''
    };

    const curDna = styleLabState.styleDna || {};
    const traits = (curDna.style_traits || curDna.art_traits || '').trim();

    // Rodyti indikaciją mygtuke
    const btnAdapt = document.getElementById('btnAdaptPromptsForMaster');
    const origText = btnAdapt ? btnAdapt.innerHTML : '';
    if (btnAdapt) {
      btnAdapt.innerHTML = '⏳ Pritaikoma...';
      btnAdapt.disabled = true;
    }

    try {
      const res = await fetch('/api/styles/adapt_master_prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_role: roleToUse,
          source_prompt: sourcePrompt,
          current_prompts: currentPrompts,
          style_traits: traits,
          slug: styleLabState.activeSlug || document.getElementById('styleSlugInput')?.value.trim() || 'video_style',
          use_llm: true
        })
      });
      const data = await res.json();

      if (data.status === 'success' && data.prompts) {
        // Atnaujiname visų 4 archetipų laukelius
        ['male', 'female', 'teen', 'kid'].forEach(r => {
          const rCap = r.charAt(0).toUpperCase() + r.slice(1);
          const input = document.getElementById(`promptBase${rCap}`);
          if (input && data.prompts[r]) {
            input.value = data.prompts[r];
          }
          if (styleLabState.styleDna) {
            styleLabState.styleDna[`prompt_${r}`] = data.prompts[r];
          }
        });

        if (data.style_traits) {
          if (!styleLabState.styleDna) styleLabState.styleDna = {};
          styleLabState.styleDna.style_traits = data.style_traits;
        }

        scheduleSaveActiveSession();

        const traitsDisplay = data.style_traits ? ` (${data.style_traits})` : '';
        if (typeof window.toast === 'function') {
          window.toast('✨ Promptai pritaikyti', `Visi 4 veikėjai pritaikyti pagal etaloną${traitsDisplay}!`, 'success');
        }
      } else {
        throw new Error(data.detail || data.message || 'Nepavyko pritaikyti promptų');
      }
    } catch (err) {
      console.warn('[Adapt Prompts] Serverio klaida, taikomas tiesioginis šablonas:', err);
      // Fallback tiesioginis pritaikymas
      const rawTraits = traits || 'thin line arms and legs, white face';
      const suffix = rawTraits ? `, ${rawTraits}` : '';
      const fallbackTemplates = {
        male: `make adult man character in that art style, neutral gray clothes, short black man hair, in the same art style${suffix}`,
        female: `make woman character in that art style, neutral gray clothes, brown woman hair, in the same art style${suffix}`,
        teen: `make teenager character in that art style, neutral gray clothes, messy teen hair, in the same art style${suffix}`,
        kid: `make child character in that art style, neutral gray clothes, neat child hair, in the same art style${suffix}`
      };
      ['male', 'female', 'teen', 'kid'].forEach(r => {
        const rCap = r.charAt(0).toUpperCase() + r.slice(1);
        const input = document.getElementById(`promptBase${rCap}`);
        if (input && fallbackTemplates[r]) {
          input.value = fallbackTemplates[r];
        }
      });
      scheduleSaveActiveSession();
      if (typeof window.toast === 'function') {
        window.toast('✨ Promptai pritaikyti', 'Visi 4 veikėjai pritaikyti pagal stilių!', 'success');
      }
    } finally {
      if (btnAdapt) {
        btnAdapt.innerHTML = origText || '✨ Pritaikyti Promptus';
        btnAdapt.disabled = false;
      }
    }
  }

  async function generateRemainingFromMaster() {
    const masterRole = styleLabState.masterCharacterRole;
    if (!masterRole) {
      if (typeof window.toast === 'function') {
        window.toast('Nėra Master', 'Pirmiausia nustatykite vieną iš veikėjų kaip Master etaloną!', 'warning');
      }
      return;
    }

    const remainingRoles = ['male', 'female', 'teen', 'kid'].filter(r => r !== masterRole);
    if (typeof window.toast === 'function') {
      window.toast('🚀 Klonavimas paleistas', `Generuojami 3 likę veikėjai pagal ${ROLE_NAMES[masterRole]} Master etaloną...`, 'info');
    }

    for (const r of remainingRoles) {
      await generateArchetypeImage(r);
    }
  }

  function setCardLoading(role, isLoading) {
    const capitalRole = role.charAt(0).toUpperCase() + role.slice(1);
    const loader = document.getElementById(`loading${capitalRole}`);
    if (loader) {
      if (isLoading) loader.classList.remove('hidden');
      else loader.classList.add('hidden');
    }
  }

  // --------------------------------------------------------------------------
  // 4. AI STILIAUS DNR GENERAVIMAS (LLM ARBA PRESET)
  // --------------------------------------------------------------------------
  async function applyAIDesign(payload) {
    const btnGen = document.getElementById('btnGenerateStyleDNA');
    const originalText = btnGen ? btnGen.innerHTML : '';
    if (btnGen) {
      btnGen.innerHTML = '⏳ Analizuojama...';
      btnGen.disabled = true;
    }

    try {
      // Pasiimame LLM parametrus iš esamo projekto/konfigūracijos
      const proj = typeof window.getProj === 'function' ? window.getProj() : null;
      const provider = (window.state && window.state.llmMode) || 'api';
      const configKey = (proj && proj.globals && proj.globals.openaiApiKey) || '';
      const configUrl = (proj && proj.globals && proj.globals.localLlmUrl) || '';
      const configModel = (proj && proj.globals && proj.globals.llmModel) || '';

      const body = {
        ...payload,
        provider,
        key: configKey,
        url: configUrl,
        model: configModel
      };

      const res = await fetch('/api/styles/ai_design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();

      if (data.status !== 'success' || !data.data) {
        throw new Error(data.message || 'Nepavyko sugeneruoti stiliaus');
      }

      const p = data.data;

      // Užpildome formą sugeneruotais duomenimis
      setInputValue('styleSlugInput', p.slug || 'custom_style');
      setInputValue('styleDisplayNameInput', p.displayName || p.slug);
      setInputValue('styleSceneSuffix', p.scene_suffix || '');
      setInputValue('styleSceneNeg', p.scene_negative || '');
      setInputValue('styleCharNeg', p.character_negative || '');
      setInputValue('styleCharPrefix', p.character_prompt_prefix || 'make character in that exact style, neutral gray clothes, ');
      setInputValue('styleCharSuffix', p.character_prompt_suffix || ', in the same art style');
      setInputValue('styleBgExtras', p.background_extras_prompt || '');

      // 4 Archetipų promptai
      setInputValue('promptBaseMale', p.prompt_male || '');
      setInputValue('promptBaseFemale', p.prompt_female || '');
      setInputValue('promptBaseTeen', p.prompt_teen || '');
      setInputValue('promptBaseKid', p.prompt_kid || '');
      setInputValue('promptBaseScene', p.prompt_scene || '');

      // Atveriame išplėstinį skydelį peržiūrai
      const advPanel = document.getElementById('advancedDNAPanel');
      if (advPanel) advPanel.classList.remove('hidden');

      if (typeof window.toast === 'function') {
        window.toast('Stiliaus DNR Sukurtas', `Stilius „${p.displayName || p.slug}“ paruoštas generavimui!`, 'success');
      }

    } catch (e) {
      console.error('[Style Lab] AI klaida:', e);
      if (typeof window.toast === 'function') window.toast('Klaida', e.message, 'error');
    } finally {
      if (btnGen) {
        btnGen.innerHTML = originalText;
        btnGen.disabled = false;
      }
    }
  }

  // --------------------------------------------------------------------------
  // 4.5. VIDEO & YOUTUBE STILIAUS IŠTRAUKĖJAS (VISION AI)
  // --------------------------------------------------------------------------
  async function ingestVideoForStyle() {
    const urlInput = document.getElementById('videoStyleUrl');
    const fileInput = document.getElementById('videoStyleFileInput');
    const modelSelect = document.getElementById('videoVisionModel');
    const statusBox = document.getElementById('videoStyleStatusBox');
    const statusText = document.getElementById('videoStyleStatusText');
    const btnExtract = document.getElementById('btnExtractVideoStyle');
    const galleryPanel = document.getElementById('videoFramesGalleryPanel');
    const countBadge = document.getElementById('videoFramesCount');

    const ytUrl = urlInput?.value.trim() || '';
    const file = fileInput?.files?.[0];

    if (!ytUrl && !file) {
      if (typeof window.toast === 'function') {
        window.toast('Įspėjimas', 'Įklijuokite YouTube nuorodą arba pasirinkite video failą!', 'warning');
      }
      return;
    }

    const formData = new FormData();
    if (file) {
      formData.append('video_file', file);
    } else if (ytUrl) {
      formData.append('youtube_url', ytUrl);
    }

    const visionModel = modelSelect?.value || 'qwen2.5vl:7b';
    const maxFrames = document.getElementById('videoMaxFramesSelect')?.value || '100';
    formData.append('vision_model', visionModel);
    formData.append('max_frames', maxFrames);

    // UI krovimo būsena
    if (statusBox) statusBox.classList.remove('hidden');
    if (statusText) statusText.textContent = ytUrl 
      ? '⏳ [1/3] Siunčiamas YouTube video...' 
      : '⏳ [1/3] Įkeliamas video failas...';
    if (btnExtract) {
      btnExtract.disabled = true;
      btnExtract.innerHTML = '<span class="spinner" style="width:14px; height:14px; border:2px solid #000; border-top-color:transparent; border-radius:50%; display:inline-block; animation:spin 0.8s linear infinite; margin-right:6px;"></span> Analizuojama...';
    }

    try {
      setTimeout(() => {
        if (statusText) statusText.textContent = '⏳ [2/3] OpenCV ištraukia kadrus ir aptinka herojus...';
      }, 3000);

      setTimeout(() => {
        if (statusText) statusText.textContent = `⏳ [3/3] Vision AI (${visionModel}) analizuoja stilių ir kuria DNR...`;
      }, 7000);

      const res = await fetch('/api/styles/video_ingest', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok || data.status !== 'success') {
        throw new Error(data.message || data.detail || 'Nepavyko išanalizuoti video.');
      }

      // Sėkmė! Išsaugome kadrus būsenoje
      styleLabState.extractedFrames = data.frames || [];
      styleLabState.selectedFrameFilename = data.selected_frame?.filename || '';
      styleLabState.styleRefImage = data.selected_frame?.vault_ref || '';
      styleLabState.sessionId = data.session_id || '';
      styleLabState.hasSavedVideoSession = true;
      styleLabState.styleDnaTitle = data.style_dna?.displayName || data.selected_frame?.filename || 'Video';
      styleLabState.activeSlug = data.style_dna?.slug || 'video_style';

      // Užpildome Style DNA laukelius
      const dna = data.style_dna || {};
      if (dna.displayName) setInputValue('styleDisplayNameInput', dna.displayName);
      if (dna.slug) setInputValue('styleSlugInput', dna.slug);
      if (dna.scene_suffix) setInputValue('styleSceneSuffix', dna.scene_suffix);
      if (dna.scene_negative) setInputValue('styleSceneNeg', dna.scene_negative);
      if (dna.character_negative) setInputValue('styleCharNeg', dna.character_negative);
      if (dna.character_prompt_prefix) setInputValue('styleCharPrefix', dna.character_prompt_prefix);
      if (dna.character_prompt_suffix) setInputValue('styleCharSuffix', dna.character_prompt_suffix);
      if (dna.background_extras_prompt) setInputValue('styleBgExtras', dna.background_extras_prompt);

      // Archetipų promptai
      if (dna.prompt_male) setInputValue('promptBaseMale', dna.prompt_male);
      if (dna.prompt_female) setInputValue('promptBaseFemale', dna.prompt_female);
      if (dna.prompt_teen) setInputValue('promptBaseTeen', dna.prompt_teen);
      if (dna.prompt_kid) setInputValue('promptBaseKid', dna.prompt_kid);
      if (dna.prompt_scene) setInputValue('promptBaseScene', dna.prompt_scene);

      // Atveriame išplėstinį skydelį
      const advPanel = document.getElementById('advancedDNAPanel');
      if (advPanel) advPanel.classList.remove('hidden');

      // Nupiešiame kadrų galeriją
      renderExtractedFramesGallery(data.frames, data.selected_frame?.filename);

      if (galleryPanel) galleryPanel.classList.remove('hidden');
      if (countBadge) countBadge.textContent = `${data.frames.length} kadrų`;

      // Būsenos žyma
      const badge = document.getElementById('styleStatusBadge');
      if (badge) {
        badge.textContent = '🎬 VIDEO SESIJA (IŠSAUGOTA)';
        badge.style.background = 'rgba(0, 240, 255, 0.15)';
        badge.style.color = '#00f0ff';
        badge.style.borderColor = 'rgba(0, 240, 255, 0.3)';
      }

      // Išsaugome sesiją diske ir naršyklėje
      await saveActiveSessionState();

      // Atnaujiname pasirinkimo meniu
      await loadStylesList('__video_session__');

      if (typeof window.toast === 'function') {
        window.toast('Stilius Išanalizuotas!', `Atrinktas pagrindinio herojaus kadras. Galite generuoti 4 personažus!`, 'success');
      }

    } catch (e) {
      console.error('[Video Ingest Error]:', e);
      if (typeof window.toast === 'function') {
        window.toast('Klaida', e.message, 'error');
      }
    } finally {
      if (statusBox) statusBox.classList.add('hidden');
      if (btnExtract) {
        btnExtract.disabled = false;
        btnExtract.innerHTML = '🚀 Extract Frames & Analyze';
      }
    }
  }

  async function applySelectedReferenceFrame(f) {
    if (!f) return;
    const currentSlug = styleLabState.activeSlug || document.getElementById('styleSlugInput')?.value.trim() || 'video_style';
    try {
      const sRes = await fetch('/api/styles/select_reference_frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: currentSlug, url: f.url })
      });
      const sData = await sRes.json();
      if (sData.status === 'success') {
        styleLabState.styleRefImage = sData.vault_ref;
        styleLabState.selectedFrameFilename = f.filename;
        if (Array.isArray(styleLabState.extractedFrames)) {
          styleLabState.extractedFrames.forEach(fr => {
            fr.is_best = (fr.filename === f.filename);
          });
        }
        renderExtractedFramesGallery(styleLabState.extractedFrames, f.filename);
        if (typeof focusFrameInModal === 'function') focusFrameInModal(f);
        if (typeof renderModalFramesGrid === 'function') renderModalFramesGrid();
        saveActiveSessionState();
        if (typeof window.toast === 'function') {
          window.toast('Etalonas pasirinktas', `Kadras (${f.timestamp}s) nustatytas kaip Image 1 (Ref A)!`, 'info');
        }
      }
    } catch (err) {
      console.error('[Select Ref Frame Error]:', err);
    }
  }

  let inlineFramesFilter = 'hero'; // 'hero' (numatytasis) arba 'all'

  function setInlineFramesFilter(newFilter) {
    inlineFramesFilter = newFilter;
    renderExtractedFramesGallery(styleLabState.extractedFrames, styleLabState.selectedFrameFilename);
  }

  function renderExtractedFramesGallery(frames, selectedFilename) {
    const grid = document.getElementById('videoFramesGrid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!Array.isArray(frames) || frames.length === 0) {
      grid.innerHTML = '<div class="text-muted text-xs" style="grid-column: 1/-1; text-align:center; padding:20px;">Nėra ištrauktų kadrų.</div>';
      return;
    }

    const totalCount = frames.length;
    const heroFrames = frames.filter(f => f.has_face);
    const heroCount = heroFrames.length;

    // Atnaujiname skaitiklius ant mygtukų ir žymos
    const heroCountEl = document.getElementById('inlineHeroCount');
    if (heroCountEl) heroCountEl.textContent = heroCount;
    const allCountEl = document.getElementById('inlineAllCount');
    if (allCountEl) allCountEl.textContent = totalCount;

    const countBadge = document.getElementById('videoFramesCount');
    if (countBadge) {
      countBadge.textContent = (inlineFramesFilter === 'hero')
        ? `${heroCount} herojų kadrų`
        : `${totalCount} kadrų (visi)`;
    }

    // Atnaujiname filtro mygtukų vizualią išvaizdą
    const btnHeroes = document.getElementById('btnInlineFilterHeroes');
    const btnAll = document.getElementById('btnInlineFilterAll');
    if (btnHeroes) {
      if (inlineFramesFilter === 'hero') {
        btnHeroes.classList.add('active');
        btnHeroes.style.background = 'rgba(0, 240, 255, 0.2)';
        btnHeroes.style.color = '#00f0ff';
        btnHeroes.style.borderColor = '#00f0ff';
      } else {
        btnHeroes.classList.remove('active');
        btnHeroes.style.background = 'transparent';
        btnHeroes.style.color = 'var(--text-muted)';
        btnHeroes.style.borderColor = 'transparent';
      }
    }
    if (btnAll) {
      if (inlineFramesFilter === 'all') {
        btnAll.classList.add('active');
        btnAll.style.background = 'rgba(0, 240, 255, 0.2)';
        btnAll.style.color = '#00f0ff';
        btnAll.style.borderColor = '#00f0ff';
      } else {
        btnAll.classList.remove('active');
        btnAll.style.background = 'transparent';
        btnAll.style.color = 'var(--text-muted)';
        btnAll.style.borderColor = 'transparent';
      }
    }

    // Nustatome aktyvų etaloninį kadrą informacinėje juostoje
    const targetFilename = selectedFilename || styleLabState.selectedFrameFilename;
    const activeFrame = frames.find(f => f.filename === targetFilename) 
                     || frames.find(f => f.is_best) 
                     || frames[0];

    const bannerLabel = document.getElementById('inlineActiveFrameLabel');
    if (bannerLabel && activeFrame) {
      bannerLabel.innerHTML = `<strong>${activeFrame.filename}</strong> (${activeFrame.timestamp}s) ${activeFrame.has_face ? '<span style="color:#2ecc71; font-weight:800; margin-left:6px;">👤 Subject</span>' : '<span style="color:#aaa; margin-left:6px;">(Scene/Fonas)</span>'}`;
    }

    // Filtruojame kadrus pagal pasirinktą režimą
    let toRender = frames;
    if (inlineFramesFilter === 'hero') {
      if (heroCount > 0) {
        toRender = heroFrames;
      } else {
        // Jei nerasta veidų, rodome visus, kad nebūtų tuščias vaizdas
        toRender = frames;
      }
    }

    toRender.forEach(f => {
      const isSelected = activeFrame ? (f.filename === activeFrame.filename) : !!f.is_best;
      const card = document.createElement('div');
      card.className = `video-frame-thumb ${isSelected ? 'selected' : ''}`;
      card.title = isSelected ? '⭐ Šis kadras yra aktyvus etalonas (Ref A) personažų generavimui' : 'Spustelėkite, kad nustatytumėte šį kadrą generavimui (Ref A)';
      card.style.cssText = `
        position: relative; 
        width: 100%;
        display: block;
        border-radius: 8px; 
        overflow: hidden; 
        cursor: pointer; 
        border: 2px solid ${isSelected ? '#00f0ff' : 'var(--border)'}; 
        box-shadow: ${isSelected ? '0 0 14px rgba(0, 240, 255, 0.75)' : 'none'};
        background: #000;
        transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
      `;

      const frameVars = (styleLabState.variations && styleLabState.variations.frames && styleLabState.variations.frames[f.filename]) || [];
      const varCount = frameVars.length;

      card.innerHTML = `
        <img src="${f.url}" alt="${f.filename}" style="width:100%; height:auto; aspect-ratio:16/9; object-fit:cover; display:block;" />
        <div style="position:absolute; bottom:2px; left:4px; font-size:9px; background:rgba(0,0,0,0.75); padding:1px 5px; border-radius:4px; color:#fff; font-family:var(--mono);">
          ${f.timestamp}s
        </div>
        ${f.has_face ? `<div style="position:absolute; top:2px; left:4px; font-size:9px; background:rgba(46, 204, 113, 0.9); color:#000; font-weight:800; padding:1px 5px; border-radius:4px;">👤 Subject</div>` : ''}
        ${isSelected ? `<div class="best-badge" style="position:absolute; top:2px; right:4px; font-size:9px; background:#00f0ff; color:#000; font-weight:800; padding:2px 6px; border-radius:4px; box-shadow:0 2px 6px rgba(0,0,0,0.6);">⭐ Ref A</div>` : ''}
        ${varCount > 0 ? `<div style="position:absolute; bottom:2px; right:4px; font-size:9px; background:rgba(245, 158, 11, 0.9); color:#000; font-weight:800; padding:1px 5px; border-radius:4px; box-shadow:0 1px 4px rgba(0,0,0,0.6);">📚 ${varCount} var.</div>` : ''}
      `;

      card.addEventListener('mouseenter', () => {
        if (!isSelected) {
          card.style.borderColor = 'rgba(0, 240, 255, 0.6)';
          card.style.transform = 'scale(1.02)';
        }
      });
      card.addEventListener('mouseleave', () => {
        if (!isSelected) {
          card.style.borderColor = 'var(--border)';
          card.style.transform = 'scale(1)';
        }
      });

      card.addEventListener('click', async () => {
        await applySelectedReferenceFrame(f);
      });

      grid.appendChild(card);
    });
  }

  // --------------------------------------------------------------------------
  // 4.6. IŠPLĖSTINIS VIDEO KADRŲ NARŠYKLĖS MODALAS
  // --------------------------------------------------------------------------
  let modalFocusedFrame = null;
  let modalFramesFilter = 'all';

  function openVideoFramesBrowserModal() {
    const modal = document.getElementById('modalVideoFramesBrowser');
    if (!modal) return;
    const frames = styleLabState.extractedFrames || [];
    if (frames.length === 0) {
      if (typeof window.toast === 'function') {
        window.toast('Nėra kadrų', 'Pirmiausia išanalizuokite video ar YouTube nuorodą!', 'warning');
      }
      return;
    }
    const badge = document.getElementById('modalFramesCountBadge');
    if (badge) badge.textContent = `${frames.length} kadrų`;

    const targetFrame = frames.find(f => f.filename === styleLabState.selectedFrameFilename) 
                     || frames.find(f => f.is_best) 
                     || frames[0];
    focusFrameInModal(targetFrame);
    renderModalFramesGrid();
    modal.classList.add('show');
  }

  function focusFrameInModal(frame) {
    if (!frame) return;
    modalFocusedFrame = frame;
    const imgEl = document.getElementById('modalFocusedFrameImg');
    if (imgEl) imgEl.src = frame.url;

    const metaEl = document.getElementById('modalFocusedFrameMeta');
    const isSelectedRef = (frame.filename === styleLabState.selectedFrameFilename) || (!styleLabState.selectedFrameFilename && frame.is_best);
    if (metaEl) {
      metaEl.innerHTML = `
        <div class="flex items-center justify-between" style="border-bottom:1px solid var(--border); padding-bottom:6px;">
          <span class="text-muted font-bold">Failas:</span>
          <span class="font-mono text-xs" style="color:var(--text);">${frame.filename}</span>
        </div>
        <div class="flex items-center justify-between" style="border-bottom:1px solid var(--border); padding-bottom:6px;">
          <span class="text-muted font-bold">Laikas video:</span>
          <span class="badge font-mono" style="background:rgba(0,240,255,0.15); color:#00f0ff;">${frame.timestamp} s</span>
        </div>
        <div class="flex items-center justify-between" style="border-bottom:1px solid var(--border); padding-bottom:6px;">
          <span class="text-muted font-bold">Herojaus aptikimas:</span>
          <span>${frame.has_face ? '<span class="badge good">👤 Aptiktas herojus</span>' : '<span class="badge" style="background:rgba(255,255,255,0.06);">Foninis kadras</span>'}</span>
        </div>
        <div class="flex items-center justify-between" style="border-bottom:1px solid var(--border); padding-bottom:6px;">
          <span class="text-muted font-bold">Aštrumo indeksas:</span>
          <span class="font-mono">${frame.sharpness ? Number(frame.sharpness).toFixed(1) : '-'}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-muted font-bold">Dabartinis statusas:</span>
          <span>${isSelectedRef ? '<span class="badge" style="background:#00f0ff; color:#000; font-weight:800;">⭐ AKTYVUS REF A (GENERAVIMUI)</span>' : '<span class="text-muted text-xs">Paprastas kadras</span>'}</span>
        </div>
      `;
    }

    const btnModalSet = document.getElementById('btnModalSetAsRefA');
    if (btnModalSet) {
      if (isSelectedRef) {
        btnModalSet.innerHTML = '✅ Šis Kadras Yra Aktyvus Generavimui (Ref A)';
        btnModalSet.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        btnModalSet.style.color = '#fff';
      } else {
        btnModalSet.innerHTML = '⭐ Nustatyti Šį Kadrą Kaip Stiliaus Etaloną (Ref A)';
        btnModalSet.style.background = 'linear-gradient(135deg, #00f0ff 0%, #0077ff 100%)';
        btnModalSet.style.color = '#000';
      }
    }

    updateModalFrameVarsButton(frame.filename);
  }

  function renderModalFramesGrid() {
    const grid = document.getElementById('modalFramesBrowserGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const frames = styleLabState.extractedFrames || [];
    const heroFrames = frames.filter(f => f.has_face);

    // Atnaujiname skaitiklius ant modalo filtrų
    const mAllCount = document.getElementById('modalAllFramesCount');
    if (mAllCount) mAllCount.textContent = frames.length;
    const mHeroCount = document.getElementById('modalHeroFramesCount');
    if (mHeroCount) mHeroCount.textContent = heroFrames.length;

    const filtered = modalFramesFilter === 'hero' ? heroFrames : frames;

    if (filtered.length === 0) {
      grid.innerHTML = '<div class="text-muted text-xs" style="grid-column: 1/-1; text-align:center; padding:30px;">Kadrų pagal šį filtrą nerasta.</div>';
      return;
    }

    filtered.forEach(f => {
      const isSelected = styleLabState.selectedFrameFilename ? (f.filename === styleLabState.selectedFrameFilename) : !!f.is_best;
      const isFocused = modalFocusedFrame && modalFocusedFrame.filename === f.filename;
      const fVars = (styleLabState.variations && styleLabState.variations.frames && styleLabState.variations.frames[f.filename]) || [];
      const varCount = fVars.length;
      const card = document.createElement('div');
      card.className = 'modal-frame-thumb';
      card.title = isSelected ? '⭐ Aktyvus etalonas Ref A (generavimui)' : 'Spustelkite peržiūrai, dukart spustelkite nustatyti Ref A';
      card.style.cssText = `
        position: relative;
        width: 100%;
        display: block;
        border-radius: 8px;
        overflow: hidden;
        cursor: pointer;
        border: 2px solid ${isFocused ? '#00f0ff' : (isSelected ? 'rgba(0, 240, 255, 0.75)' : 'var(--border)')};
        box-shadow: ${isFocused ? '0 0 14px rgba(0, 240, 255, 0.85)' : (isSelected ? '0 0 8px rgba(0, 240, 255, 0.4)' : 'none')};
        background: #000;
        transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
      `;
      card.innerHTML = `
        <img src="${f.url}" alt="${f.filename}" style="width:100%; height:auto; aspect-ratio:16/9; object-fit:cover; display:block;" />
        <div style="position:absolute; bottom:3px; left:4px; font-size:9px; background:rgba(0,0,0,0.75); padding:1px 5px; border-radius:4px; color:#fff; font-family:var(--mono);">
          ${f.timestamp}s
        </div>
        ${f.has_face ? `<div style="position:absolute; top:3px; left:4px; font-size:9px; background:rgba(46, 204, 113, 0.9); color:#000; font-weight:800; padding:1px 5px; border-radius:4px;">👤 Subject</div>` : ''}
        ${isSelected ? `<div style="position:absolute; top:3px; right:4px; font-size:9px; background:#00f0ff; color:#000; font-weight:800; padding:1px 6px; border-radius:4px; box-shadow:0 1px 6px rgba(0,0,0,0.6);">⭐ Ref A</div>` : ''}
        ${varCount > 0 ? `<div style="position:absolute; bottom:3px; right:4px; font-size:9px; background:rgba(245, 158, 11, 0.9); color:#000; font-weight:800; padding:1px 5px; border-radius:4px; box-shadow:0 1px 4px rgba(0,0,0,0.6);">📚 ${varCount} var.</div>` : ''}
      `;
      card.addEventListener('mouseenter', () => {
        card.style.transform = 'translateY(-2px)';
        if (!isFocused && !isSelected) {
          card.style.borderColor = 'rgba(0, 240, 255, 0.5)';
        }
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = 'translateY(0)';
        if (!isFocused && !isSelected) {
          card.style.borderColor = 'var(--border)';
        }
      });
      card.addEventListener('click', () => {
        focusFrameInModal(f);
        renderModalFramesGrid();
      });
      card.addEventListener('dblclick', async () => {
        await applySelectedReferenceFrame(f);
      });
      grid.appendChild(card);
    });
  }

  // --------------------------------------------------------------------------
  // 4.7. MODELIO IŠPLĖSTINIŲ NUSTATYMŲ MODALAS
  // --------------------------------------------------------------------------
  function openModelSettingsModal() {
    const modal = document.getElementById('modalModelSettings');
    if (!modal) return;
    const ms = styleLabState.modelSettings || {};
    const chk = document.getElementById('chkEnableCustomModelSettings');
    if (chk) {
      chk.checked = !!ms.customEnabled;
      toggleCustomModelSettingsUI(chk.checked);
    }
    setInputValue('cfgModelSteps', ms.steps || 20);
    setInputValue('cfgModelCfg', ms.cfg !== undefined ? ms.cfg : 3.5);
    setInputValue('cfgModelSampler', ms.sampler || 'euler');
    setInputValue('cfgModelScheduler', ms.scheduler || 'simple');
    setInputValue('cfgModelDenoise', ms.denoise !== undefined ? ms.denoise : 1.0);
    const denoiseLabel = document.getElementById('cfgModelDenoiseVal');
    if (denoiseLabel) denoiseLabel.textContent = parseFloat(ms.denoise !== undefined ? ms.denoise : 1.0).toFixed(2);
    modal.classList.add('show');
  }

  function toggleCustomModelSettingsUI(isEnabled) {
    const grp = document.getElementById('modelCustomParamsGroup');
    if (grp) {
      grp.style.opacity = isEnabled ? '1' : '0.4';
      grp.style.pointerEvents = isEnabled ? 'auto' : 'none';
    }
  }

  function saveModelSettingsFromModal() {
    const chk = document.getElementById('chkEnableCustomModelSettings');
    const customEnabled = !!(chk && chk.checked);
    const steps = parseInt(document.getElementById('cfgModelSteps')?.value || '20', 10);
    const cfg = parseFloat(document.getElementById('cfgModelCfg')?.value || '3.5');
    const sampler = document.getElementById('cfgModelSampler')?.value || 'euler';
    const scheduler = document.getElementById('cfgModelScheduler')?.value || 'simple';
    const denoise = parseFloat(document.getElementById('cfgModelDenoise')?.value || '1.0');

    styleLabState.modelSettings = {
      customEnabled,
      steps,
      cfg,
      sampler,
      scheduler,
      denoise
    };

    try {
      localStorage.setItem('styleLab_modelSettings', JSON.stringify(styleLabState.modelSettings));
    } catch (e) {}

    document.getElementById('modalModelSettings')?.classList.remove('show');
    if (typeof window.toast === 'function') {
      window.toast('Nustatymai išsaugoti', customEnabled ? `Pasirinktiniai parametrai aktyvūs (${steps} žingsniai, CFG ${cfg})` : 'Naudojami modelio numatytieji parametrai.', 'success');
    }
  }

  async function generateAllFromVideoRef() {
    if (typeof window.toast === 'function') {
      window.toast('Qwen Image Edit Paleistas', `Generuojami 4 personažų etalonai iš pasirinkto video kadro...`, 'info');
    }

    for (const role of ['male', 'female', 'teen', 'kid']) {
      await generateArchetypeImage(role);
    }
  }

  // --------------------------------------------------------------------------
  // 5. PAVEIKSLĖLIO GENERAVIMAS (COMFYUI ARBA FALLBACK)
  // --------------------------------------------------------------------------
  async function generateArchetypeImage(role) {
    const capitalRole = role.charAt(0).toUpperCase() + role.slice(1);
    const promptInput = document.getElementById(`promptBase${capitalRole}`);
    const promptText = promptInput ? promptInput.value.trim() : '';

    if (!promptText) {
      if (typeof window.toast === 'function') window.toast('Įspėjimas', `Įveskite ${role} etalono promptą!`, 'warning');
      return;
    }

    const currentSlug = document.getElementById('styleSlugInput')?.value.trim() || 'custom_style';
    const isArchetype = role !== 'scene';

    // Negatyvus promptas su griežtu anti-cropping saugikliu veikėjams
    let negPrompt = document.getElementById(isArchetype ? 'styleCharNeg' : 'styleSceneNeg')?.value || '';
    if (isArchetype) {
      const antiCropNeg = "close-up, bust shot, headshot, portrait framing, cropped legs, cut off legs, cropped feet, out of frame legs, out of frame body, cut off head, low quality, blurry, bad anatomy";
      negPrompt = negPrompt ? `${antiCropNeg}, ${negPrompt}` : antiCropNeg;
    }

    const rawSuffix = document.getElementById(isArchetype ? 'styleCharSuffix' : 'styleSceneSuffix')?.value || '';
    const cleanSuffix = rawSuffix.trim().replace(/^,\s*/, '').trim();
    let fullPrompt = promptText;
    if (cleanSuffix && !fullPrompt.toLowerCase().includes(cleanSuffix.toLowerCase())) {
      fullPrompt = `${fullPrompt}, ${cleanSuffix}`.trim();
    }

    // Jei veikėjas - užtikriname viso ūgio kadrą, BET tik jei promptas nėra tiesioginė redagavimo komanda („make ... in that exact style“ / „in that art style“)
    const hasStyleInstruction = /make\s+.*character|in that exact style|in that art style|in the same art style/i.test(fullPrompt);
    const hasFullBodyTrait = /full-body|full length|from head to toe|standing straight/i.test(fullPrompt);
    if (isArchetype && !hasStyleInstruction && !hasFullBodyTrait) {
      fullPrompt = `Full-body standing shot, full length from head to toe, standing straight, feet and shoes visible, ${fullPrompt}`;
    }

    // Užtikriname, kad prieš pradedant naują generavimą, esamas atvaizdas jau būtų variacijų sąraše ir nepradingtų
    if (styleLabState.images[role]) {
      if (!styleLabState.variations[role]) styleLabState.variations[role] = [];
      if (!styleLabState.variations[role].some(v => v.url === styleLabState.images[role])) {
        styleLabState.variations[role].push({
          id: `var_prev_${role}_${Date.now()}`,
          url: styleLabState.images[role],
          createdAt: Date.now() - 5000,
          prompt: promptText,
          isEdit: false,
          label: `v${styleLabState.variations[role].length + 1}`
        });
        updateArchetypeVarsBadge(role);
      }
    }

    setCardLoading(role, true);

    try {
      const activeProjId = (window.state && window.state.currentProjectId) || (typeof state !== 'undefined' && state.currentProjectId) || 'default';
      const reqId = `style_${currentSlug}_${role}_${Date.now().toString(36)}`;
      
      // Pasirinktas aspect ratio: 2:3, 1:1, 3:2, 9:16, 16:9, 3:4, 4:3
      const arSelectVal = document.getElementById('styleLabAspectRatio')?.value || styleLabState.aspectRatio || '2:3';
      const arPreset = ASPECT_RATIO_PRESETS[arSelectVal] || ASPECT_RATIO_PRESETS['2:3'];

      // Veikėjų etalonams: pagal pasirinktą aspect ratio (numatytasis 2:3 -> 832x1248)
      // Scenos bandomajam kadrui: 16:9 (1920x1080)
      const w = isArchetype ? arPreset.w : 1920;
      const h = isArchetype ? arPreset.h : 1080;
      let refFile = 'empty_character.png';
      if (isArchetype) {
        const refMode = document.getElementById('characterReferenceModeSelect')?.value || styleLabState.characterReferenceMode || 'video';
        const masterRole = styleLabState.masterCharacterRole;
        const masterImg = masterRole ? styleLabState.images[masterRole] : null;

        if (refMode === 'master' && masterRole && masterImg && role !== masterRole) {
          // Naudojame Master personažo failą kaip atskaitos tašką Image 1 (Ref A)
          const cleanRef = masterImg.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/vault\//i, '').replace(/^\/output\//i, '').split('?')[0];
          const parts = cleanRef.split('/');
          refFile = parts[parts.length - 1];
        } else {
          refFile = styleLabState.styleRefImage || 'empty_character.png';
        }
      } else {
        // BANDOMASIS SCENOS KADRAS: Image-to-Image su personažo arba video atskaita
        const sceneSource = document.getElementById('sceneReferenceSourceSelect')?.value || 'auto';
        let chosen = null;
        if (sceneSource === 'male' && styleLabState.images.male) chosen = styleLabState.images.male;
        else if (sceneSource === 'female' && styleLabState.images.female) chosen = styleLabState.images.female;
        else if (sceneSource === 'teen' && styleLabState.images.teen) chosen = styleLabState.images.teen;
        else if (sceneSource === 'kid' && styleLabState.images.kid) chosen = styleLabState.images.kid;
        else if (sceneSource === 'refA' && styleLabState.styleRefImage) chosen = styleLabState.styleRefImage;
        else {
          // Auto: pirmenybė generuotiems veikėjams (Vyras -> Moteris -> Paauglys -> Vaikas), kitaip video etalonas
          chosen = styleLabState.images.male || styleLabState.images.female || styleLabState.images.teen || styleLabState.images.kid || styleLabState.styleRefImage;
        }

        if (chosen) {
          const cleanRef = chosen.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/vault\//i, '').replace(/^\/output\//i, '').split('?')[0];
          const parts = cleanRef.split('/');
          refFile = parts[parts.length - 1];
        } else {
          refFile = 'empty_character.png';
        }
      }

      // Sukuriame ComfyUI workflow per centrinį variklį
      let wf = null;
      if (typeof window.buildWorkflow === 'function') {
        const sLabModelEl = document.getElementById('styleLabModel');
        const modelVal = sLabModelEl?.value || '';
        let unetOverride = undefined;
        let wfModeOverride = undefined;
        if (modelVal && modelVal !== 'custom') {
          const parts = modelVal.split('|');
          wfModeOverride = parts[0];
          unetOverride = parts[1];
        }

        const buildParams = {
          prompt: fullPrompt,
          negative: negPrompt,
          refA: refFile,
          refB: '',
          refC: '',
          sceneId: reqId,
          w: w,
          h: h,
          prefix: `StyleLab_${currentSlug}_${role}`,
          workflowMode: wfModeOverride,
          unetName: unetOverride
        };

        if (styleLabState.modelSettings && styleLabState.modelSettings.customEnabled) {
          buildParams.steps = styleLabState.modelSettings.steps;
          buildParams.cfg = styleLabState.modelSettings.cfg;
          buildParams.sampler = styleLabState.modelSettings.sampler;
        }

        const resWf = window.buildWorkflow(buildParams);
        wf = resWf?.workflow || resWf;
      }

      if (!wf) {
        throw new Error('Nepavyko sukurti ComfyUI workflow struktūros.');
      }

      // Pasirinktiniai modelio nustatymai (Custom Model Override per visus KSampler mazgus)
      if (styleLabState.modelSettings && styleLabState.modelSettings.customEnabled) {
        const ms = styleLabState.modelSettings;
        for (const nId in wf) {
          const node = wf[nId];
          if (node && node.class_type === 'KSampler' && node.inputs) {
            if (ms.steps) node.inputs.steps = parseInt(ms.steps, 10);
            if (ms.cfg !== undefined) node.inputs.cfg = parseFloat(ms.cfg);
            if (ms.sampler) node.inputs.sampler_name = ms.sampler;
            if (ms.scheduler) node.inputs.scheduler = ms.scheduler;
            if (ms.denoise !== undefined) node.inputs.denoise = parseFloat(ms.denoise);
          }
        }
      }

      // Užtikriname pasirinktus matmenis ComfyUI mazgams archetipo atveju
      if (isArchetype) {
        if (wf["459:456"] && wf["459:456"].inputs) {
          wf["459:456"].inputs.width = w;
          wf["459:456"].inputs.height = h;
        }
        if (wf["439"] && wf["439"].inputs) {
          wf["439"].inputs.width = w;
          wf["439"].inputs.height = h;
        }
        if (wf["250"] && wf["250"].inputs) {
          wf["250"].inputs.width = w;
          wf["250"].inputs.height = h;
        }
        if (wf["438"] && wf["438"].inputs) {
          wf["438"].inputs.target_width = w;
          wf["438"].inputs.target_height = h;
        }
      }

      // Siunčiame užklausą tiesiai į Python Hub ir ComfyUI eilę
      const res = await fetch('/api/queue/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priority: 1, // Prioritetinė užduotis stiliaus kūrimui
          projectId: activeProjId,
          sceneId: reqId,
          workflow: wf
        })
      });

      const qData = await res.json();
      if (qData.status !== 'success') {
        throw new Error(qData.message || 'Serveris atmetė generavimo užduotį');
      }

      if (typeof window.toast === 'function') {
        window.toast('🚀 Išsiųsta į ComfyUI', `${role.toUpperCase()} etalonas perduotas GPU darbininkui...`, 'info');
      }

      // Atnaujiname būsenos žymę į „Eilėje“
      const badge = document.getElementById(`badge${capitalRole}`);
      if (badge) {
        badge.textContent = 'Eilėje...';
        badge.style.background = 'rgba(110, 168, 255, 0.2)';
        badge.style.color = 'var(--accent)';
      }

    } catch (e) {
      console.error(`[Style Lab] Klaida generuojant ${role}:`, e);
      setCardLoading(role, false);
      if (typeof window.toast === 'function') {
        window.toast('Generavimo Klaida', e.message, 'error');
      }
    }
  }

  // ==========================================================================
  // WEBSOCKET STATUS & REZULTATŲ GAUDYKLĖS (Iš ComfyUI per api.js)
  // ==========================================================================
  window.onStyleLabTaskComplete = function(data) {
    console.log('[Style Lab] ComfyUI užduotis baigta:', data);
    const sceneId = data.sceneId || '';
    const url = data.vaultUrl;
    if (!url) return;

    // 1. Kadro redagavimo užduotis
    if (sceneId.startsWith('style_frame_edit_')) {
      const frameFilename = (window._pendingFrameEdits && window._pendingFrameEdits[sceneId]) || (window.styleLabEditContext && window.styleLabEditContext.frameFilename);
      if (frameFilename) {
        if (!styleLabState.variations.frames) styleLabState.variations.frames = {};
        if (!styleLabState.variations.frames[frameFilename]) {
          styleLabState.variations.frames[frameFilename] = [];
          const origFrame = (styleLabState.extractedFrames || []).find(f => f.filename === frameFilename);
          if (origFrame) {
            styleLabState.variations.frames[frameFilename].push({
              id: `orig_${frameFilename}`,
              url: origFrame.url,
              createdAt: Date.now() - 5000,
              isOriginal: true,
              label: 'Originalus kadras'
            });
          }
        }

        const varCount = styleLabState.variations.frames[frameFilename].length + 1;
        styleLabState.variations.frames[frameFilename].unshift({
          id: `var_frame_${Date.now()}`,
          url: url,
          createdAt: Date.now(),
          isEdit: true,
          label: `Edit v${varCount}`
        });

        // Atnaujiname kadrą kadrų masyve
        const targetFrame = (styleLabState.extractedFrames || []).find(f => f.filename === frameFilename);
        if (targetFrame) {
          targetFrame.url = url;
        }

        if (modalFocusedFrame && modalFocusedFrame.filename === frameFilename) {
          modalFocusedFrame.url = url;
          const imgEl = document.getElementById('modalFocusedFrameImg');
          if (imgEl) imgEl.src = url;
          updateModalFrameVarsButton(frameFilename);
        }

        renderModalFramesGrid();
        renderExtractedFramesGallery(styleLabState.extractedFrames, styleLabState.selectedFrameFilename);
        saveActiveSessionState();

        if (typeof window.toast === 'function') {
          window.toast('✅ Kadras Redaguotas', `Sukurtas naujas kadro (${frameFilename}) variantas!`, 'success');
        }
      }
      return;
    }

    // 2. Personažų arba scenos etalono generavimas / redagavimas
    let matchedRole = null;
    for (const r of ['male', 'female', 'teen', 'kid', 'scene']) {
      if (sceneId.includes(`_${r}_`)) {
        matchedRole = r;
        break;
      }
    }

    if (matchedRole) {
      styleLabState.images[matchedRole] = url;
      if (matchedRole === 'scene') updateSceneCardView(url);
      else updateArchetypeCardView(matchedRole, url);

      setCardLoading(matchedRole, false);

      if (!styleLabState.variations[matchedRole]) styleLabState.variations[matchedRole] = [];
      const varCount = styleLabState.variations[matchedRole].length + 1;
      const isEdit = sceneId.includes('style_edit_');
      const curPrompt = document.getElementById(`promptBase${matchedRole.charAt(0).toUpperCase() + matchedRole.slice(1)}`)?.value.trim() || '';

      styleLabState.variations[matchedRole].unshift({
        id: `var_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        url: url,
        createdAt: Date.now(),
        isEdit: isEdit,
        prompt: curPrompt,
        label: isEdit ? `Edit v${varCount}` : `v${varCount}`
      });

      updateArchetypeVarsBadge(matchedRole);
      saveActiveSessionState();

      if (typeof window.toast === 'function') {
        window.toast('✅ ComfyUI Sugeneruota', `${matchedRole.toUpperCase()} etalonas paruoštas ir išsaugotas į variacijas!`, 'success');
      }
    }
  };

  window.onStyleLabTaskProgress = function(data) {
    const sceneId = data.sceneId || '';
    let matchedRole = null;
    for (const r of ['male', 'female', 'teen', 'kid', 'scene']) {
      if (sceneId.includes(`_${r}_`)) {
        matchedRole = r;
        break;
      }
    }

    if (matchedRole && data.max > 0) {
      const cap = matchedRole.charAt(0).toUpperCase() + matchedRole.slice(1);
      const badge = document.getElementById(`badge${cap}`);
      if (badge) {
        const pct = Math.round((data.step / data.max) * 100);
        badge.textContent = `⚡ Gen: ${pct}%`;
        badge.style.background = 'rgba(110, 168, 255, 0.2)';
        badge.style.color = 'var(--accent)';
      }
    }
  };

  window.onStyleLabTaskError = function(data) {
    console.error('[Style Lab] ComfyUI klaida:', data);
    const sceneId = data.sceneId || '';

    if (sceneId.startsWith('style_frame_edit_')) {
      if (typeof window.toast === 'function') {
        window.toast('GPU Klaida', data.error || 'Nepavyko redaguoti kadro', 'error');
      }
      return;
    }

    let matchedRole = null;
    for (const r of ['male', 'female', 'teen', 'kid', 'scene']) {
      if (sceneId.includes(`_${r}_`)) {
        matchedRole = r;
        break;
      }
    }

    if (matchedRole) {
      setCardLoading(matchedRole, false);
      const cap = matchedRole.charAt(0).toUpperCase() + matchedRole.slice(1);
      const badge = document.getElementById(`badge${cap}`);
      if (badge) {
        badge.textContent = 'Klaida!';
        badge.style.background = 'rgba(255, 107, 107, 0.2)';
        badge.style.color = 'var(--bad)';
      }
    }

    if (typeof window.toast === 'function') {
      window.toast('GPU Klaida', data.error || 'ComfyUI generavimo klaida', 'error');
    }
  };

  function createStyleMockSvgUrl(role, styleSlug, promptText) {
    const colors = {
      male: '#3b82f6',
      female: '#ec4899',
      teen: '#8b5cf6',
      kid: '#f59e0b',
      scene: '#10b981'
    };
    const accent = colors[role] || '#6ea8ff';
    const roleTitle = role.toUpperCase();
    const shortPrompt = (promptText || '').slice(0, 45).replace(/["'<>&]/g, '');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="832" height="1248" viewBox="0 0 832 1248">
      <defs>
        <radialGradient id="bgGrad" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stop-color="#1e293b"/>
          <stop offset="100%" stop-color="#0f172a"/>
        </radialGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="8" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <rect width="832" height="1248" fill="url(#bgGrad)"/>
      <circle cx="416" cy="460" r="160" fill="none" stroke="${accent}" stroke-width="8" filter="url(#glow)" opacity="0.8"/>
      <path d="M 200 920 C 230 680, 602 680, 632 920 Z" fill="none" stroke="${accent}" stroke-width="8" opacity="0.6"/>
      <circle cx="416" cy="430" r="110" fill="${accent}" opacity="0.15"/>
      <text x="416" y="420" fill="#ffffff" font-size="70" font-family="system-ui, sans-serif" text-anchor="middle" font-weight="900" letter-spacing="2">
        ${roleTitle}
      </text>
      <text x="416" y="480" fill="${accent}" font-size="26" font-family="system-ui, sans-serif" text-anchor="middle" font-weight="700">
        ${styleSlug.toUpperCase()}
      </text>
      <text x="416" y="920" fill="#94a3b8" font-size="22" font-family="system-ui, sans-serif" text-anchor="middle">
        ${shortPrompt}...
      </text>
      <rect x="266" y="960" width="300" height="40" rx="20" fill="rgba(255,255,255,0.06)" stroke="${accent}" stroke-width="1.5"/>
      <text x="416" y="986" fill="${accent}" font-size="16" font-family="system-ui, sans-serif" text-anchor="middle" font-weight="700">
        BASE TEMPLATE BENCHMARK
      </text>
    </svg>`;

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  // --------------------------------------------------------------------------
  // 6. PAVEIKSLĖLIO ĮKĖLIMAS IŠ KOMPIUTERIO
  // --------------------------------------------------------------------------
  async function uploadArchetypeFile(role, file) {
    if (!file) return;
    const currentSlug = document.getElementById('styleSlugInput')?.value.trim() || 'custom_style';

    const formData = new FormData();
    formData.append('file', file);
    formData.append('style_slug', currentSlug);
    formData.append('archetype', role);

    setCardLoading(role, true);

    try {
      const res = await fetch('/api/styles/upload_base', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (data.status !== 'success' || !data.url) {
        throw new Error(data.message || 'Įkėlimas nepavyko');
      }

      styleLabState.images[role] = data.url;
      if (role === 'scene') updateSceneCardView(data.url);
      else updateArchetypeCardView(role, data.url);

      if (!styleLabState.variations[role]) styleLabState.variations[role] = [];
      const varCount = styleLabState.variations[role].length + 1;
      styleLabState.variations[role].unshift({
        id: `var_up_${Date.now()}`,
        url: data.url,
        createdAt: Date.now(),
        isUpload: true,
        label: `Įkeltas v${varCount}`
      });

      updateArchetypeVarsBadge(role);
      saveActiveSessionState();

      if (typeof window.toast === 'function') {
        window.toast('Failas Įkeltas', `${role.toUpperCase()} kadras sėkmingai atnaujintas ir įrašytas į variacijas!`, 'success');
      }
    } catch (e) {
      console.error(`[Style Lab] Įkėlimo klaida (${role}):`, e);
      if (typeof window.toast === 'function') window.toast('Įkėlimo Klaida', e.message, 'error');
    } finally {
      setCardLoading(role, false);
    }
  }

  // --------------------------------------------------------------------------
  // 7. PILNAS STILIAUS IŠSAUGOJIMAS Į SISTEMĄ
  // --------------------------------------------------------------------------
  async function saveCurrentStyle() {
    const slugInput = document.getElementById('styleSlugInput');
    const slug = slugInput ? slugInput.value.trim() : '';

    if (!slug) {
      if (typeof window.toast === 'function') window.toast('Klaida', 'Įveskite stiliaus sisteminį raktą (Slug)!', 'error');
      return;
    }

    const btnSave = document.getElementById('btnSaveStyle');
    const originalText = btnSave ? btnSave.innerHTML : '';
    if (btnSave) {
      btnSave.innerHTML = '💾 Saugoma...';
      btnSave.disabled = true;
    }

    try {
      const config = {
        scene_suffix: document.getElementById('styleSceneSuffix')?.value.trim() || '',
        scene_negative: document.getElementById('styleSceneNeg')?.value.trim() || '',
        character_negative: document.getElementById('styleCharNeg')?.value.trim() || '',
        character_prompt_prefix: document.getElementById('styleCharPrefix')?.value.trim() || 'make character in that exact style, neutral gray clothes, ',
        character_prompt_suffix: document.getElementById('styleCharSuffix')?.value.trim() || ', in the same art style',
        background_extras_prompt: document.getElementById('styleBgExtras')?.value.trim() || '',
        empty_scene_removals: ['peach skin', 'solid white face', 'fully proportioned human bodies']
      };

      const payload = {
        slug: slug,
        config: config,
        images: {
          male: styleLabState.images.male,
          female: styleLabState.images.female,
          teen: styleLabState.images.teen,
          kid: styleLabState.images.kid
        }
      };

      const res = await fetch('/api/styles/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.status !== 'success') {
        throw new Error(data.message || 'Nepavyko išsaugoti stiliaus');
      }

      if (typeof window.toast === 'function') {
        window.toast('Stilius Išsaugotas', `Stilius „${slug}“ sėkmingai įrašytas į sistemą!`, 'success');
      }

      // Atnaujiname stilių sąrašą
      await loadStylesList(slug);

      // Sinchronizuojame su kitais tabais
      if (typeof window.loadPromptFiles === 'function') {
        await window.loadPromptFiles();
      }
      if (typeof window.updateStyleBaseTemplates === 'function') {
        await window.updateStyleBaseTemplates();
      }
      if (typeof window.loadBaseStyles === 'function') {
        await window.loadBaseStyles();
      }
      if (typeof window.renderBaseLibrary === 'function') {
        window.renderBaseLibrary();
      }

    } catch (e) {
      console.error('[Style Lab] Išsaugojimo klaida:', e);
      if (typeof window.toast === 'function') window.toast('Klaida', e.message, 'error');
    } finally {
      if (btnSave) {
        btnSave.innerHTML = originalText;
        btnSave.disabled = false;
      }
    }
  }

  // --------------------------------------------------------------------------
  // 8. PRITAIKYMAS AKTYVIAM PROJEKTUI
  // --------------------------------------------------------------------------
  async function applyStyleToActiveProject() {
    const slug = styleLabState.activeSlug || document.getElementById('styleSlugInput')?.value.trim();
    if (!slug) return;

    const proj = typeof window.getProj === 'function' ? window.getProj() : null;
    if (!proj) {
      if (typeof window.toast === 'function') window.toast('Įspėjimas', 'Nėra atidaryto aktyvaus projekto.', 'warning');
      return;
    }

    if (!proj.globals) proj.globals = {};
    proj.globals.charBaseStyle = slug;

    // Jei Scenerijaus tabe yra pasirinkimas, perstatome jį
    const scriptSelect = document.getElementById('promptTemplateSelect');
    if (scriptSelect) {
      scriptSelect.value = slug;
    }

    if (typeof window.saveCurrentProject === 'function') {
      window.saveCurrentProject();
    }

    if (typeof window.loadBaseStyles === 'function') {
      await window.loadBaseStyles();
    }

    if (typeof window.updateStyleBaseTemplates === 'function') {
      await window.updateStyleBaseTemplates();
    }

    if (typeof window.renderBaseLibrary === 'function') {
      window.renderBaseLibrary();
    }

    if (typeof window.toast === 'function') {
      window.toast('Pritaikyta Projektui', `Projektas dabar naudoja stilių „${slug}“ kaip bazinį atskaitos tašką!`, 'success');
    }
  }

  // --------------------------------------------------------------------------
  // 9. EVENT LISTENERS
  // --------------------------------------------------------------------------
  function setupEventListeners() {
    // 1. Stiliaus pasirinkimas
    const select = document.getElementById('styleLabSelect');
    if (select && !select._bound) {
      select._bound = true;
      select.addEventListener('change', async (e) => {
        if (e.target.value === '__video_session__') {
          await restoreActiveVideoSession();
        } else {
          await loadStyleDetails(e.target.value);
        }
      });
    }

    // 2. Preset mygtukai (Inspiration Chips)
    document.querySelectorAll('.btn-preset-chip').forEach(btn => {
      if (!btn._bound) {
        btn._bound = true;
        btn.addEventListener('click', (e) => {
          const presetKey = e.currentTarget.dataset.preset;
          if (presetKey) {
            applyAIDesign({ preset: presetKey });
          }
        });
      }
    });

    // 3. AI DNR Generavimo mygtukas
    const btnGenDNA = document.getElementById('btnGenerateStyleDNA');
    if (btnGenDNA && !btnGenDNA._bound) {
      btnGenDNA._bound = true;
      btnGenDNA.addEventListener('click', () => {
        const idea = document.getElementById('styleIdeaInput')?.value.trim();
        if (!idea) {
          if (typeof window.toast === 'function') window.toast('Įveskite idėją', 'Parašykite kelis žodžius apie norimą stilių!', 'warning');
          return;
        }
        applyAIDesign({ idea: idea });
      });
    }

    // Enter klavišas idėjos laukelyje
    const ideaInput = document.getElementById('styleIdeaInput');
    if (ideaInput && !ideaInput._bound) {
      ideaInput._bound = true;
      ideaInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          btnGenDNA?.click();
        }
      });
    }

    // 4. Išplėstinio skydelio perjungimas
    const btnAdv = document.getElementById('btnToggleAdvancedDNA');
    if (btnAdv && !btnAdv._bound) {
      btnAdv._bound = true;
      btnAdv.addEventListener('click', () => {
        const panel = document.getElementById('advancedDNAPanel');
        if (panel) {
          const isHidden = panel.classList.toggle('hidden');
          btnAdv.textContent = isHidden ? '⚙️ Išplėstinė Formulė (Suffix & Negatives) ▼' : '⚙️ Išplėstinė Formulė (Suffix & Negatives) ▲';
        }
      });
    }

    // 5. Naujas stilius
    const btnNew = document.getElementById('btnNewStyleAI');
    if (btnNew && !btnNew._bound) {
      btnNew._bound = true;
      btnNew.addEventListener('click', () => {
        setInputValue('styleIdeaInput', '');
        setInputValue('styleDisplayNameInput', '✨ Naujas Meninis Stilius');
        setInputValue('styleSlugInput', `custom_style_${Date.now().toString(36)}`);
        setInputValue('styleSceneSuffix', '');
        setInputValue('styleSceneNeg', 'blurry, low quality, deformed, extra limbs, bad anatomy, watermark, text');
        setInputValue('styleCharNeg', 'blurry, low quality, deformed, extra limbs, bad anatomy, watermark, text');
        ['male', 'female', 'teen', 'kid', 'scene'].forEach(r => {
          styleLabState.images[r] = '';
          if (r === 'scene') updateSceneCardView('');
          else updateArchetypeCardView(r, '');
        });
        document.getElementById('styleIdeaInput')?.focus();
      });
    }

    // 6. Clone stilių
    const btnClone = document.getElementById('btnCloneStyle');
    if (btnClone && !btnClone._bound) {
      btnClone._bound = true;
      btnClone.addEventListener('click', () => {
        const curSlug = document.getElementById('styleSlugInput')?.value.trim() || 'style';
        const newSlug = `${curSlug}_v2`;
        setInputValue('styleSlugInput', newSlug);
        setInputValue('styleDisplayNameInput', `${document.getElementById('styleDisplayNameInput')?.value || curSlug} (Kopija)`);
        if (typeof window.toast === 'function') {
          window.toast('Klonuota', `Sukurta nauja versija „${newSlug}“. Galite modifikuoti ir išsaugoti.`, 'info');
        }
      });
    }

    // 7. Save stilių
    const btnSave = document.getElementById('btnSaveStyle');
    if (btnSave && !btnSave._bound) {
      btnSave._bound = true;
      btnSave.addEventListener('click', saveCurrentStyle);
    }

    // 8. Pritaikyti projektui
    const btnApply = document.getElementById('btnApplyStyleToProject');
    if (btnApply && !btnApply._bound) {
      btnApply._bound = true;
      btnApply.addEventListener('click', applyStyleToActiveProject);
    }

    // 9. Delete stilių
    const btnDelete = document.getElementById('btnDeleteStyle');
    if (btnDelete && !btnDelete._bound) {
      btnDelete._bound = true;
      btnDelete.addEventListener('click', async () => {
        const slug = styleLabState.activeSlug;
        if (!slug || styleLabState.isBuiltin) return;
        if (!confirm(`Ar tikrai norite ištrinti stilių „${slug}“? Šio veiksmo atšaukti negalima.`)) return;

        try {
          const res = await fetch(`/api/styles/${slug}`, { method: 'DELETE' });
          const data = await res.json();
          if (data.status === 'success') {
            if (typeof window.toast === 'function') window.toast('Ištrinta', `Stilius „${slug}“ pašalintas.`, 'success');
            await loadStylesList();
          }
        } catch (e) {
          if (typeof window.toast === 'function') window.toast('Klaida', e.message, 'error');
        }
      });
    }

    // 10. Archetipų generavimo ir įkėlimo mygtukai
    ['male', 'female', 'teen', 'kid', 'scene'].forEach(role => {
      const cap = role.charAt(0).toUpperCase() + role.slice(1);
      
      // Generate
      const btnGen = document.getElementById(`btnGen${cap}`);
      if (btnGen && !btnGen._bound) {
        btnGen._bound = true;
        btnGen.addEventListener('click', () => generateArchetypeImage(role));
      }

      // Įkelti mygtukas
      const btnUp = document.getElementById(`btnUpload${cap}`);
      const fileIn = document.getElementById(`file${cap}`);
      if (btnUp && fileIn && !btnUp._bound) {
        btnUp._bound = true;
        btnUp.addEventListener('click', () => fileIn.click());
        fileIn.addEventListener('change', (e) => {
          const file = e.target.files?.[0];
          if (file) uploadArchetypeFile(role, file);
        });
      }
    });

    // 10.5. Style Lab Personažų ir Scenos Further Edit & Variations mygtukai
    document.querySelectorAll('.btn-stylelab-edit').forEach(btn => {
      if (!btn._bound) {
        btn._bound = true;
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const role = btn.dataset.role;
          if (role) openStyleLabFurtherEdit(role);
        });
      }
    });

    document.querySelectorAll('.btn-stylelab-vars').forEach(btn => {
      if (!btn._bound) {
        btn._bound = true;
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const role = btn.dataset.role;
          if (role) openStyleLabVars(role, 'archetype');
        });
      }
    });

    // 11. Generate visus 4 veikėjus (Batch)
    const btnGenAll = document.getElementById('btnGenerateAllBases');
    if (btnGenAll && !btnGenAll._bound) {
      btnGenAll._bound = true;
      btnGenAll.addEventListener('click', async () => {
        if (typeof window.toast === 'function') {
          window.toast('Batch Paleidimas', 'Pradedamas visų 4 bazinių veikėjų generavimas...', 'info');
        }
        for (const role of ['male', 'female', 'teen', 'kid']) {
          await generateArchetypeImage(role);
        }
      });
    }

    // 12. Video & YouTube Style Ingest Listeners
    const btnPickVideo = document.getElementById('btnPickVideoStyleFile');
    const fileVideoIn = document.getElementById('videoStyleFileInput');
    const selectedFileLabel = document.getElementById('videoStyleSelectedFileName');
    const btnExtractVideo = document.getElementById('btnExtractVideoStyle');
    const btnApplyAllRef = document.getElementById('btnApplyAllFromVideoRef');

    if (btnPickVideo && fileVideoIn && !btnPickVideo._bound) {
      btnPickVideo._bound = true;
      btnPickVideo.addEventListener('click', () => fileVideoIn.click());
      fileVideoIn.addEventListener('change', (e) => {
        const f = e.target.files?.[0];
        if (f && selectedFileLabel) {
          selectedFileLabel.textContent = `📁 ${f.name}`;
          const urlInput = document.getElementById('videoStyleUrl');
          if (urlInput) urlInput.value = '';
        }
      });
    }

    if (btnExtractVideo && !btnExtractVideo._bound) {
      btnExtractVideo._bound = true;
      btnExtractVideo.addEventListener('click', ingestVideoForStyle);
    }

    if (btnApplyAllRef && !btnApplyAllRef._bound) {
      btnApplyAllRef._bound = true;
      btnApplyAllRef.addEventListener('click', generateAllFromVideoRef);
    }

    // 12.5. Išplėstinės kadrų naršyklės mygtukai ir filtrai
    const btnOpenFramesModal = document.getElementById('btnOpenAllFramesModal');
    if (btnOpenFramesModal && !btnOpenFramesModal._bound) {
      btnOpenFramesModal._bound = true;
      btnOpenFramesModal.addEventListener('click', openVideoFramesBrowserModal);
    }

    const btnReextract100 = document.getElementById('btnModalReextract100Frames');
    if (btnReextract100 && !btnReextract100._bound) {
      btnReextract100._bound = true;
      btnReextract100.addEventListener('click', () => {
        setInputValue('videoMaxFramesSelect', '100');
        document.getElementById('modalVideoFramesBrowser')?.classList.remove('show');
        ingestVideoForStyle();
      });
    }

    const btnInlineHeroes = document.getElementById('btnInlineFilterHeroes');
    if (btnInlineHeroes && !btnInlineHeroes._bound) {
      btnInlineHeroes._bound = true;
      btnInlineHeroes.addEventListener('click', () => setInlineFramesFilter('hero'));
    }

    const btnInlineAll = document.getElementById('btnInlineFilterAll');
    if (btnInlineAll && !btnInlineAll._bound) {
      btnInlineAll._bound = true;
      btnInlineAll.addEventListener('click', () => setInlineFramesFilter('all'));
    }

    const btnFilterAll = document.getElementById('btnFilterAllFrames');
    const btnFilterHero = document.getElementById('btnFilterHeroFrames');
    if (btnFilterAll && !btnFilterAll._bound) {
      btnFilterAll._bound = true;
      btnFilterAll.addEventListener('click', () => {
        modalFramesFilter = 'all';
        btnFilterAll.classList.add('active');
        btnFilterHero?.classList.remove('active');
        renderModalFramesGrid();
      });
    }
    if (btnFilterHero && !btnFilterHero._bound) {
      btnFilterHero._bound = true;
      btnFilterHero.addEventListener('click', () => {
        modalFramesFilter = 'hero';
        btnFilterHero.classList.add('active');
        btnFilterAll?.classList.remove('active');
        renderModalFramesGrid();
      });
    }

    const btnModalSetRef = document.getElementById('btnModalSetAsRefA');
    if (btnModalSetRef && !btnModalSetRef._bound) {
      btnModalSetRef._bound = true;
      btnModalSetRef.addEventListener('click', async () => {
        if (modalFocusedFrame) {
          await applySelectedReferenceFrame(modalFocusedFrame);
        }
      });
    }

    const btnEditFocusedFrame = document.getElementById('btnModalEditFocusedFrame');
    if (btnEditFocusedFrame && !btnEditFocusedFrame._bound) {
      btnEditFocusedFrame._bound = true;
      btnEditFocusedFrame.addEventListener('click', () => {
        if (modalFocusedFrame) {
          openStyleLabFurtherEdit({
            type: 'frame',
            frameFilename: modalFocusedFrame.filename,
            url: modalFocusedFrame.url
          });
        }
      });
    }

    const btnVarsFocusedFrame = document.getElementById('btnModalVarsFocusedFrame');
    if (btnVarsFocusedFrame && !btnVarsFocusedFrame._bound) {
      btnVarsFocusedFrame._bound = true;
      btnVarsFocusedFrame.addEventListener('click', () => {
        if (modalFocusedFrame) {
          openStyleLabVars(modalFocusedFrame.filename, 'frame');
        }
      });
    }

    // 13. Style Lab Model Dropdown & Settings Modal
    const styleLabModelEl = document.getElementById('styleLabModel');
    if (styleLabModelEl && !styleLabModelEl._bound) {
      styleLabModelEl._bound = true;
      const proj = typeof window.getProj === 'function' ? window.getProj() : null;
      if (proj && proj.globals) {
        const curVal = `${proj.globals.workflowMode}|${proj.globals.unetName}|${proj.globals.loraName}`;
        for (let i = 0; i < styleLabModelEl.options.length; i++) {
          if (styleLabModelEl.options[i].value === curVal) {
            styleLabModelEl.value = curVal;
            break;
          }
        }
      }
      styleLabModelEl.addEventListener('change', () => {
        if (typeof window.applyModelPreset === 'function') {
          window.applyModelPreset(styleLabModelEl.value);
        }
      });
    }

    const btnOpenModelSet = document.getElementById('btnOpenModelSettings');
    if (btnOpenModelSet && !btnOpenModelSet._bound) {
      btnOpenModelSet._bound = true;
      btnOpenModelSet.addEventListener('click', openModelSettingsModal);
    }

    const chkCustom = document.getElementById('chkEnableCustomModelSettings');
    if (chkCustom && !chkCustom._bound) {
      chkCustom._bound = true;
      chkCustom.addEventListener('change', (e) => {
        toggleCustomModelSettingsUI(e.target.checked);
      });
    }

    const btnSaveModelSet = document.getElementById('btnSaveModelSettings');
    if (btnSaveModelSet && !btnSaveModelSet._bound) {
      btnSaveModelSet._bound = true;
      btnSaveModelSet.addEventListener('click', saveModelSettingsFromModal);
    }

    // 13.5. Formato (Aspect Ratio) Parinkiklis ir Scenos Atskaitos Parinkiklis
    const arSelectEl = document.getElementById('styleLabAspectRatio');
    if (arSelectEl && !arSelectEl._bound) {
      arSelectEl._bound = true;
      arSelectEl.addEventListener('change', (e) => {
        updateCardsAspectRatioUI(e.target.value);
        scheduleSaveActiveSession();
      });
    }

    const sceneSrcEl = document.getElementById('sceneReferenceSourceSelect');
    if (sceneSrcEl && !sceneSrcEl._bound) {
      sceneSrcEl._bound = true;
      sceneSrcEl.addEventListener('change', scheduleSaveActiveSession);
    }

    // 13.6. Master Veikėjo Atskaitos Parinkiklis ir Klonavimo Mygtukai
    const refModeSelect = document.getElementById('characterReferenceModeSelect');
    if (refModeSelect && !refModeSelect._bound) {
      refModeSelect._bound = true;
      refModeSelect.addEventListener('change', (e) => {
        styleLabState.characterReferenceMode = e.target.value;
        updateMasterCharacterUI();
        scheduleSaveActiveSession();
      });
    }

    const btnCloneMaster = document.getElementById('btnCloneFromMaster');
    if (btnCloneMaster && !btnCloneMaster._bound) {
      btnCloneMaster._bound = true;
      btnCloneMaster.addEventListener('click', generateRemainingFromMaster);
    }

    const btnAdaptPrompts = document.getElementById('btnAdaptPromptsForMaster');
    if (btnAdaptPrompts && !btnAdaptPrompts._bound) {
      btnAdaptPrompts._bound = true;
      btnAdaptPrompts.addEventListener('click', adaptPromptsForMasterCloning);
    }

    // 13.7. Kiekvienos kortelės Master nustatymo mygtukai
    ['male', 'female', 'teen', 'kid'].forEach(r => {
      const cap = r.charAt(0).toUpperCase() + r.slice(1);
      const btn = document.getElementById(`btnMaster${cap}`);
      if (btn && !btn._bound) {
        btn._bound = true;
        btn.addEventListener('click', () => setMasterCharacter(r));
      }
    });

    // 13.8. Kiekvienos kortelės tiesioginis stiliaus pritaikymo mygtukas („✨ Pritaikyti kitiems“)
    document.querySelectorAll('.btn-adapt-from-role').forEach(btn => {
      if (!btn._bound) {
        btn._bound = true;
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const r = btn.dataset.role;
          adaptPromptsForMasterCloning(r);
        });
      }
    });

    // 14. Auto-save laukelių pasikeitimams (Debounced)
    const sessionInputIds = [
      'videoStyleUrl',
      'videoMaxFramesSelect',
      'styleLabAspectRatio',
      'sceneReferenceSourceSelect',
      'characterReferenceModeSelect',
      'styleDisplayNameInput',
      'styleSlugInput',
      'styleSceneSuffix',
      'styleSceneNeg',
      'styleCharNeg',
      'styleCharPrefix',
      'styleCharSuffix',
      'styleBgExtras',
      'promptBaseMale',
      'promptBaseFemale',
      'promptBaseTeen',
      'promptBaseKid',
      'promptBaseScene'
    ];

    sessionInputIds.forEach(id => {
      const el = document.getElementById(id);
      if (el && !el._sessionSaveBound) {
        el._sessionSaveBound = true;
        el.addEventListener('input', scheduleSaveActiveSession);
      }
    });
  }

  // Paleidžiame kai DOM užsikrauna
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStyleLab);
  } else {
    setTimeout(initStyleLab, 100);
  }

})();
