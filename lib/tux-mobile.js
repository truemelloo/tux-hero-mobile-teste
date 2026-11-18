/* TUX HERO — camada de suporte a celulares e tablets (Android / iPhone / iPad).
 *
 * REGRA DE OURO: no computador este arquivo NÃO faz nada além de definir `window.TuxMobile = { active:false }`.
 * Nenhum listener, nenhum elemento de DOM, nenhuma classe CSS. Tudo abaixo só roda quando um aparelho
 * touch é detectado (ver detectMobile) ou quando a URL traz ?mobile=1 (útil para testar no PC).
 *
 * O que ela NÃO faz: não tem motor de jogo próprio, não calcula pontuação, não julga acertos.
 * Os botões touch disparam os MESMOS eventos de teclado (A S D F G) que o teclado físico dispara; assim o
 * Jogo Rápido (bundle.js) e o motor 3D unificado (tux-unified-3d.js) recebem as notas exatamente como no PC.
 * As guitarras 3D são as originais: aqui só se recalcula câmera/enquadramento para telas pequenas.
 */
(function () {
  'use strict';

  /* ================================================================== detecção do aparelho */
  function detectMobile() {
    try {
      var m = /[?&]mobile=(\d)/.exec(location.search);
      if (m) return m[1] === '1';                                   // ?mobile=1 força (testes no PC)
      var ua = navigator.userAgent || '', uad = navigator.userAgentData;
      if (uad && uad.mobile === true) return true;
      if (/Android|iPhone|iPod|iPad|Windows Phone|IEMobile|Opera Mini|BlackBerry|Mobile/i.test(ua)) return true;
      var touchPoints = navigator.maxTouchPoints || 0;
      if (/Macintosh/.test(ua) && touchPoints > 1) return true;     // iPadOS pede "site para computador" por padrão
      // Aparelho cujo apontador PRINCIPAL é o dedo (sem hover). Notebook com tela touch tem mouse/touchpad
      // como principal (pointer:fine, hover:hover) e continua sendo tratado como computador.
      if (touchPoints > 0 && matchMedia('(pointer: coarse)').matches && matchMedia('(hover: none)').matches) return true;
    } catch (e) { /* na dúvida: computador */ }
    return false;
  }

  var ACTIVE = detectMobile();
  var M = window.TuxMobile = { active: ACTIVE };
  if (!ACTIVE) return;                                              // ---- computador: fim aqui ----

  /* ================================================================== constantes / utilitários */
  var root = document.documentElement;
  root.classList.add('tux-mobile');
  var noop = function () {};
  var $ = function (id) { return document.getElementById(id); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  function isPhone() { var sw = screen.width || innerWidth, sh = screen.height || innerHeight; return Math.min(sw, sh, Math.max(innerWidth, innerHeight)) < 600; }
  function isLandscape() { return innerWidth > innerHeight; }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function safe(side) {                                              // área segura (notch / barra de gestos), em px
    var p = el('div'); p.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-' + side + ':env(safe-area-inset-' + side + ',0px)';
    document.documentElement.appendChild(p); var v = parseFloat(getComputedStyle(p)['padding' + side.charAt(0).toUpperCase() + side.slice(1)]) || 0; p.remove(); return v;
  }

  // Viewport: sem zoom por pinça nem zoom de toque duplo (o iOS ignora user-scalable, então há também o bloqueio por JS).
  (function lockViewport() {
    var mv = document.querySelector('meta[name=viewport]');
    var c = 'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover';
    if (mv) mv.setAttribute('content', c); else { mv = el('meta'); mv.name = 'viewport'; mv.content = c; document.head.appendChild(mv); }
  })();
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (n) { document.addEventListener(n, function (e) { e.preventDefault(); }, { passive: false }); });
  document.addEventListener('contextmenu', function (e) { if (!/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) e.preventDefault(); });

  // Qualidade gráfica padrão para o primeiro acesso em aparelho de entrada (só se o jogador ainda não salvou configurações).
  (function defaultQuality() {
    try {
      if (localStorage.getItem('tuxHeroSettings')) return;
      var weak = (navigator.deviceMemory && navigator.deviceMemory <= 3) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
      localStorage.setItem('tuxHeroSettings', JSON.stringify({ music: 80, effects: 80, skipIntro: false, difficulty: 'MEDIUM', visuals: weak ? 'MEDIUM' : 'HIGH' }));
    } catch (e) { /* armazenamento indisponível */ }
  })();

  /* ================================================================== áudio (autoplay do iOS) */
  // iOS/Safari só libera play() de um <audio> que já tenha tocado dentro de um toque do jogador. O jogo cria o áudio
  // depois (após contagem regressiva / carregamento de chart), fora do toque. Solução: UM elemento <audio> persistente,
  // "destravado" no primeiro toque na página e reutilizado pelos dois motores (Jogo Rápido e 3D unificado).
  var SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
  var shared = null, unlocked = false, unlocking = false;
  function sharedAudio() {
    if (!shared) { shared = document.createElement('audio'); shared.preload = 'auto'; shared.setAttribute('playsinline', ''); shared.setAttribute('webkit-playsinline', ''); shared.addEventListener('pause', onAudioPause); }
    return shared;
  }
  function unlockAudio() {
    if (unlocked || unlocking) return; var a = sharedAudio(); if (a.getAttribute('src') && a.src.indexOf('data:') !== 0) return;   // já em uso real
    unlocking = true; a.src = SILENT; a.volume = 0;
    var p; try { p = a.play(); } catch (e) { unlocking = false; return; }
    var done = function (ok) { unlocking = false; if (ok) unlocked = true; try { a.pause(); } catch (e) {} if (a.src.indexOf('data:') === 0) { a.removeAttribute('src'); try { a.load(); } catch (e) {} } a.volume = 1; };
    if (p && p.then) p.then(function () { done(true); }, function () { done(false); }); else done(true);
  }
  ['touchend', 'pointerup', 'click'].forEach(function (n) { document.addEventListener(n, unlockAudio, { capture: true, passive: true }); });
  M.takeAudio = function () { var a = sharedAudio(); try { a.pause(); } catch (e) {} a.removeAttribute('src'); a.loop = false; a.muted = false; a.volume = 1; a.currentTime = 0; return a; };

  // O jogo rápido original cria <audio id="audio-player"> via innerHTML dentro de #song (lib/audio.js → bundle.js).
  // Em vez de editar o bundle, o #song entrega o elemento persistente (já destravado) em vez de um novo.
  function hijackSongContainer() {
    var song = $('song'); if (!song) return; var html = '';
    try {
      Object.defineProperty(song, 'innerHTML', { configurable: true,
        get: function () { return html; },
        set: function (v) {
          html = String(v || ''); var a = sharedAudio(), m = /src=["']?([^\s"'>]+)/.exec(html);
          try { a.pause(); } catch (e) {} a.id = 'audio-player'; a.setAttribute('controls', 'controls'); a.setAttribute('step', '1'); a.volume = 1;
          if (m) a.src = m[1]; else a.removeAttribute('src');
          while (song.firstChild) song.removeChild(song.firstChild);
          song.appendChild(a);
        } });
    } catch (e) { /* se falhar, o jogo usa o <audio> comum (funciona no Android) */ }
  }

  /* ================================================================== câmera (solução fechada) */
  // Geometria da pista = a do TuxVisuals / game_view.js. Dados 4 alvos de tela (largura da borda próxima, altura da linha
  // de acerto, altura do fundo e FOV) existe UMA câmera (x=0, só inclinação) que os atende; resolve-se em fórmula fechada.
  var HALF = 62.5, RAIL = 6.4, OUTER = HALF + RAIL, LEN = Math.sqrt(125 * 125 + 500 * 500), SA = 125 / LEN, CA = 500 / LEN;
  function solveCamera(aspect, tx, nearY, farY, fovDeg) {
    var T = Math.tan(fovDeg * Math.PI / 360), K = OUTER / (tx * aspect), n = nearY, f = farY, iT2 = 1 / (T * T);
    var A = K * K * (iT2 + f * f), B = K * K * (-2 * iT2 - 2 * f * n), C = K * K * (iT2 + n * n) - LEN * LEN, disc = B * B - 4 * A * C;
    if (disc < 0) return null;
    var q = (-B + Math.sqrt(disc)) / (2 * A); if (!(q > 1.05)) return null;
    var d0 = K / T, dF = d0 * q, v0 = n * K, vF = f * K * q;
    var theta = Math.atan2(-LEN * CA, LEN * SA) - Math.atan2(-(dF - d0), vF - v0);
    return { fov: fovDeg, T: T, K: K, pitch: theta, cy: -75 - d0 * Math.sin(theta) - v0 * Math.cos(theta), cz: d0 * Math.cos(theta) - v0 * Math.sin(theta), ratio: 1 / q };
  }
  function ndcY(c, s) {                                              // altura (NDC) do ponto da pista a "s" unidades da linha de acerto
    var y = -75 + s * SA, z = -s * CA, th = c.pitch;
    var d = (y - c.cy) * Math.sin(th) - (z - c.cz) * Math.cos(th), v = (y - c.cy) * Math.cos(th) + (z - c.cz) * Math.sin(th);
    return v / (d * c.T);
  }

  /* Calcula câmera + posição dos 5 botões de toque para a janela atual. Retorna null se não houver solução (usa-se o enquadramento antigo). */
  function computeLayout() {
    var W = innerWidth, H = innerHeight, aspect = W / H, portrait = H > W;
    var sL = safe('left'), sR = safe('right'), sB = safe('bottom'), sT = safe('top');
    var MAXPITCH = 112, nearW = portrait ? 0.92 * W : Math.min(0.62 * W, 1.55 * H);
    nearW = Math.min(nearW, MAXPITCH * 2 * OUTER / 25);   // 25 = distância entre pistas (unidades do mundo)
    var pitch = nearW * 25 / (2 * OUTER), tx = nearW / W;
    var padH = clamp(H * (portrait ? 0.14 : 0.27), 62, 104), gap = 6, insetB = Math.max(8, sB), top = portrait ? Math.max(60, sT + 56) : 6;
    var btnHalf = 0.34 * pitch, cam = null, yHit = 0, fovTry = [34, 40, 28, 46, 24], k, i;
    for (k = 0; k < 2; k++) {                                         // 2 passadas: a 2ª usa a altura real do botão 3D projetado
      yHit = H - insetB - gap - padH - gap - btnHalf;
      for (i = 0; i < fovTry.length && !cam; i++) cam = solveCamera(aspect, tx, 1 - 2 * yHit / H, 1 - 2 * top / H, fovTry[i]);
      if (!cam) return null;
      btnHalf = (1 - ndcY(cam, -11)) / 2 * H - yHit;
    }
    var padTop = yHit + btnHalf + gap, padBottom = H - insetB, ph = Math.max(52, padBottom - padTop);
    var pw = Math.min(pitch - 4, 118), cx = W / 2, rects = [];
    for (i = 0; i < 5; i++) rects.push({ left: cx + (i - 2) * pitch - pw / 2, top: padBottom - ph, width: pw, height: ph });
    return { cam: cam, W: W, H: H, aspect: aspect, portrait: portrait, yHit: yHit, pitch: pitch, nearW: nearW, rects: rects, safeL: sL, safeR: sR, safeT: sT, safeB: sB, padTop: padBottom - ph };
  }
  M.layout = null;
  function applyCam(camera, L) {
    camera.fov = L.cam.fov; camera.aspect = L.aspect; camera.near = 1; camera.far = 4000;
    camera.position.set(0, L.cam.cy, L.cam.cz); camera.rotation.set(L.cam.pitch, 0, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  }

  /* ================================================================== botões touch (5 pistas) */
  var KEYS = ['a', 's', 'd', 'f', 'g'], CODES = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG'], KC = [65, 83, 68, 70, 71];
  var padRoot = null, padEls = [], held = [[], [], [], [], []], padVisible = false;
  // Mesmo caminho do teclado físico: evento de teclado no document (Key do Jogo Rápido ouve em window; o 3D unificado ouve em document).
  function fireKey(type, lane) {
    var ev = new KeyboardEvent(type, { key: KEYS[lane], code: CODES[lane], bubbles: true, cancelable: true, repeat: false });
    try { Object.defineProperty(ev, 'keyCode', { get: function () { return KC[lane]; } }); Object.defineProperty(ev, 'which', { get: function () { return KC[lane]; } }); } catch (e) { /* ok */ }
    document.dispatchEvent(ev);
  }
  function padDown(lane, id) {
    if (held[lane].indexOf(id) >= 0) return;
    held[lane].push(id); padEls[lane].classList.add('pressed');
    if (held[lane].length === 1) fireKey('keydown', lane);
  }
  function padUp(lane, id) {
    var i = held[lane].indexOf(id); if (i < 0) return; held[lane].splice(i, 1);
    if (!held[lane].length) { padEls[lane].classList.remove('pressed'); fireKey('keyup', lane); }
  }
  function releaseAll() { for (var l = 0; l < 5; l++) if (held[l].length) { held[l] = []; if (padEls[l]) padEls[l].classList.remove('pressed'); fireKey('keyup', l); } }

  function buildPad() {
    if (padRoot) return;
    padRoot = el('div', 'tux-pad'); padRoot.id = 'tux-pad'; padRoot.setAttribute('aria-label', 'Controles de toque: cinco pistas'); padRoot.style.display = 'none';
    var names = ['verde', 'vermelho', 'amarelo', 'azul', 'laranja'];
    for (var l = 0; l < 5; l++) {
      var b = el('div', 'tux-pad-btn lane' + l, '<i class="tux-pad-ring"></i><i class="tux-pad-cap"></i><i class="tux-pad-glow"></i>');
      b.setAttribute('role', 'button'); b.setAttribute('aria-label', 'Pista ' + (l + 1) + ' ' + names[l]); b.dataset.lane = l; padRoot.appendChild(b); padEls.push(b); bindPad(b, l);
    }
    document.body.appendChild(padRoot);
  }
  function bindPad(b, lane) {
    var stop = function (e) { if (e.cancelable) e.preventDefault(); };
    if (window.PointerEvent) {
      b.addEventListener('pointerdown', function (e) { stop(e); try { b.setPointerCapture(e.pointerId); } catch (x) {} padDown(lane, 'p' + e.pointerId); });
      var up = function (e) { stop(e); padUp(lane, 'p' + e.pointerId); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    } else {                                                          // Safari antigo sem Pointer Events
      b.addEventListener('touchstart', function (e) { stop(e); for (var i = 0; i < e.changedTouches.length; i++) padDown(lane, 't' + e.changedTouches[i].identifier); }, { passive: false });
      var tend = function (e) { stop(e); for (var i = 0; i < e.changedTouches.length; i++) padUp(lane, 't' + e.changedTouches[i].identifier); };
      b.addEventListener('touchend', tend, { passive: false }); b.addEventListener('touchcancel', tend, { passive: false });
    }
    b.addEventListener('contextmenu', stop); b.addEventListener('dragstart', stop);
  }
  function layoutPad(L) {
    if (!padRoot || !L) return;
    for (var i = 0; i < 5; i++) { var r = L.rects[i], s = padEls[i].style; s.left = r.left + 'px'; s.top = r.top + 'px'; s.width = r.width + 'px'; s.height = r.height + 'px'; }
  }
  function showPad(v) {
    if (v === padVisible) return; padVisible = v; buildPad();
    padRoot.style.display = v ? 'block' : 'none'; root.classList.toggle('tux-playing', v);
    if (!v) releaseAll();
  }

  /* ================================================================== qual motor está rodando */
  function unified() { return window.TuxUnified3D && window.TuxUnified3D.isActive() ? window.TuxUnified3D : null; }
  function quickStarted() { var g = window.__tuxGame; return !!(g && g.started); }
  function currentEngine() { return unified() ? 'unified' : (quickStarted() ? 'quick' : null); }
  function quickPaused() { var c = window.__tuxClock; return !!(c && c.paused); }
  function engineRunning() {                                         // há partida correndo (não pausada / não em resultados)?
    var u = unified(); if (u) { var s = u.state(); return s === 'playing' || s === 'countdown'; }
    return quickStarted() && !quickPaused();
  }
  /* Pausa segura (rotação, app em segundo plano, ligação…): usa as MESMAS rotinas de pausa de cada motor. */
  function interrupt() {
    releaseAll();
    var u = unified(); if (u) { return u.interrupt(); }
    if (quickStarted() && !quickPaused()) { var b = document.querySelector('.play-pause'); if (b && !b.classList.contains('hidden')) { b.click(); return true; } }
    return false;
  }
  function onAudioPause() {                                          // ligação/Siri/fone desconectado: o SO pausou o áudio sozinho
    var u = unified(); if (!u || shared.ended || shared.seeking) return;
    if (u.state() === 'playing') u.interrupt();
  }

  /* ================================================================== orientação, tela cheia, tela ligada */
  var rotateEl = null, rotateMode = null, pending = null, dismissed = false;
  function buildRotate() {
    if (rotateEl) return;
    rotateEl = el('div', 'tux-rotate', '<div class="tux-rotate-card"><div class="tux-rotate-phone" aria-hidden="true"><svg viewBox="0 0 64 64"><rect x="19" y="4" width="26" height="56" rx="5"/><rect x="23" y="10" width="18" height="40" rx="1.5" class="scr"/><circle cx="32" cy="55" r="2"/></svg></div>' +
      '<h2>📱 GIRE SEU CELULAR!</h2><p>🎸 Para jogar TUX HERO, coloque seu celular na horizontal e prepare-se para o rock!</p>' +
      '<small>Se a tela não girar, desative o bloqueio de rotação do aparelho.</small><button type="button" class="tux-rotate-back">VOLTAR</button></div>');
    rotateEl.id = 'tux-rotate'; rotateEl.setAttribute('role', 'alertdialog'); rotateEl.setAttribute('aria-modal', 'true'); rotateEl.style.display = 'none';
    rotateEl.querySelector('.tux-rotate-back').addEventListener('click', function () {
      if (rotateMode === 'start') { pending = null; hideRotate(); }
      else { dismissed = true; hideRotate(); var u = unified(); if (u) u.stop(true); else { var x = document.querySelector('.exit-game'); if (x) x.click(); } }
    });
    document.body.appendChild(rotateEl);
  }
  function showRotate(mode) { buildRotate(); rotateMode = mode; rotateEl.dataset.mode = mode; rotateEl.style.display = 'flex'; }
  function hideRotate() { if (rotateEl) rotateEl.style.display = 'none'; rotateMode = null; }

  function requestFullscreenAndLock() {
    var d = document, e = d.documentElement, f = e.requestFullscreen || e.webkitRequestFullscreen, p;
    var lock = function () { try { var o = screen.orientation; if (o && o.lock && isPhone()) o.lock('landscape').catch(noop); } catch (x) { /* iOS: sem suporte; o aviso visual cobre */ } };
    if (f && !(d.fullscreenElement || d.webkitFullscreenElement)) { try { p = f.call(e, { navigationUI: 'hide' }); } catch (x) { p = null; } }
    if (p && p.then) p.then(lock, noop); else lock();
  }
  function leaveFullscreen() {
    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) {}
    try { var d = document; if (d.fullscreenElement && d.exitFullscreen) d.exitFullscreen().catch(noop); else if (d.webkitFullscreenElement && d.webkitExitFullscreen) d.webkitExitFullscreen(); } catch (e) {}
  }
  var wake = null;
  function wakeOn() { try { if (navigator.wakeLock && !wake) navigator.wakeLock.request('screen').then(function (w) { wake = w; w.addEventListener('release', function () { wake = null; }); }, noop); } catch (e) {} }
  function wakeOff() { try { if (wake) wake.release(); } catch (e) {} wake = null; }

  // Toque em qualquer botão que INICIA partida: destrava áudio, pede tela cheia e exige a horizontal (celulares).
  var START_SEL = '#song-play,[data-lib-op="play"],[data-op="play"],[data-career-play]';
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest(START_SEL); if (!b || b.disabled) return;
    unlockAudio(); requestFullscreenAndLock();
    if (isPhone() && !isLandscape()) {
      ev.stopImmediatePropagation(); ev.preventDefault();
      pending = b; showRotate('start');
    }
  }, true);

  function checkOrientation() {
    if (!isPhone()) { if (rotateMode) hideRotate(); return; }
    var land = isLandscape();
    if (land) {
      dismissed = false;
      if (rotateMode) hideRotate();
      if (pending) { var b = pending; pending = null; if (b.isConnected) b.click(); }
      return;
    }
    var eng = currentEngine(), u = unified();
    if (eng && !(u && u.state() === 'results') && !dismissed) { interrupt(); showRotate('play'); }   // partida em andamento → pausa tudo
  }
  var orientTimer = 0;
  function scheduleOrientation() { clearTimeout(orientTimer); orientTimer = setTimeout(function () { checkOrientation(); relayout(); }, 90); }
  window.addEventListener('resize', scheduleOrientation);
  window.addEventListener('orientationchange', function () { scheduleOrientation(); setTimeout(scheduleOrientation, 350); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { interrupt(); wakeOff(); } else if (currentEngine()) wakeOn();
  });
  window.addEventListener('pagehide', function () { interrupt(); });

  /* ================================================================== aplicar câmera/layout aos motores */
  function relayout() {
    var eng = currentEngine(); if (!eng) return;
    var L = computeLayout(); M.layout = L; if (!L) return;
    if (eng === 'quick') { var gv = window.__tuxGame.gameView; applyCam(gv.camera, L); quickHud(L); }
    else { var u = unified(), s = u && u.session(); if (s && s.single) { applyCam(s.camera, L); } }
    layoutPad(L);
  }
  M.frameCamera = function (s) {                                       // chamado por tux-unified-3d.js (1 pista)
    var L = computeLayout(); M.layout = L; if (!L) return false;
    applyCam(s.camera, L); layoutPad(L); return true;
  };
  function quickHud(L) {                                               // variáveis CSS para o HUD do Jogo Rápido
    var s = root.style; s.setProperty('--tux-pad-top', L.padTop + 'px'); s.setProperty('--tux-board-w', L.nearW + 'px'); s.setProperty('--tux-hit-y', L.yHit + 'px');
    s.setProperty('--tux-sl', L.safeL + 'px'); s.setProperty('--tux-sr', L.safeR + 'px'); s.setProperty('--tux-st', L.safeT + 'px');
  }

  /* ---------- qualidade gráfica dinâmica ---------- */
  var basePR = Math.min(window.devicePixelRatio || 1, ((navigator.deviceMemory && navigator.deviceMemory <= 3) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)) ? 1.5 : 2);
  var curPR = basePR, fpsFrames = 0, fpsT0 = 0, lowWindows = 0, fpsRaf = 0;
  function activeRenderer() { var u = unified(); if (u) { var s = u.session(); return s && s.renderer; } var g = window.__tuxGame; return g && g.gameView && g.gameView.renderer; }
  M.noAntialias = (window.devicePixelRatio || 1) >= 2;                 // com 2x de densidade o MSAA é desperdício de GPU
  M.configureRenderer = function (r) { try { r.setPixelRatio(curPR); } catch (e) {} };
  function fpsTick(t) {
    fpsRaf = requestAnimationFrame(fpsTick);
    if (!engineRunning() || document.hidden) { fpsFrames = 0; fpsT0 = 0; lowWindows = 0; return; }
    if (!fpsT0) { fpsT0 = t; fpsFrames = 0; return; }
    fpsFrames++;
    if (t - fpsT0 >= 2000) {
      var fps = fpsFrames * 1000 / (t - fpsT0); fpsFrames = 0; fpsT0 = t;
      if (fps < 40 && curPR > 1) { if (++lowWindows >= 2) { lowWindows = 0; curPR = Math.max(1, +(curPR - 0.25).toFixed(2)); var r = activeRenderer(); if (r) M.configureRenderer(r); M.pixelRatio = curPR; } }
      else lowWindows = 0;
    }
  }
  M.pixelRatio = curPR;

  /* ================================================================== eventos do Jogo Rápido (bundle.js) */
  document.addEventListener('tux-show-original-start', function () {
    var r = activeRenderer(); if (r) M.configureRenderer(r);
    gateIdleRendering();
    var L = computeLayout(); M.layout = L; if (L) { applyCam(window.__tuxGame.gameView.camera, L); quickHud(L); buildPad(); layoutPad(L); }
    onPlayStart('quick');
  });
  document.addEventListener('tux-show-original-stop', function () { onPlayStop('quick'); });
  // O Jogo Rápido renderiza em loop desde que a página abre (mesmo atrás do menu). No celular só desenha quando há partida.
  function gateIdleRendering() {
    var gv = window.__tuxGame && window.__tuxGame.gameView; if (!gv || gv.__tuxGated) return; gv.__tuxGated = true;
    var orig = gv.sceneRender; gv.sceneRender = function () { if (quickStarted()) return orig.apply(this, arguments); };
  }

  /* ================================================================== partida começou / terminou */
  var playing = false, leaveTimer = 0;
  function onPlayStart(kind) {
    if (playing && kind === playing) return; playing = kind; dismissed = false;
    clearTimeout(leaveTimer); buildPad(); wakeOn(); if (!fpsRaf) fpsRaf = requestAnimationFrame(fpsTick);
  }
  function onPlayStop() {
    playing = false; showPad(false); wakeOff(); root.classList.remove('tux-playing'); hideRotate();
    clearTimeout(leaveTimer); leaveTimer = setTimeout(function () { if (!playing) leaveFullscreen(); }, 800);   // adia: trocar de música não deve piscar a tela cheia
    var c = $('tux-m-card'); if (c) c.remove();
  }
  setInterval(function () {                                            // visibilidade dos botões de toque conforme o estado da partida
    var eng = currentEngine(), u = unified(), show = !!eng && !(u && u.state() === 'results');
    showPad(show);
    // Jogo Rápido: se pausou antes do áudio começar (~2 s), o motor original deixa a música iniciar mesmo pausada. No celular isso é corrigido aqui.
    if (!u && quickStarted() && quickPaused() && shared && !shared.paused) { try { shared.pause(); } catch (e) {} }
    if (!eng && playing) onPlayStop();
    if (eng && !playing) onPlayStart(eng);
  }, 200);

  /* ================================================================== motor 3D unificado: ganchos */
  M.onSessionStart = function (s) {
    onPlayStart('unified'); buildPad(); buildUnifiedChrome(s);
  };
  M.onSessionStop = function (s) { onPlayStop(); };
  function buildUnifiedChrome(s) {
    var rootEl = $('tux-unified-game'); if (!rootEl) return;
    var old = $('tux-m-card'); if (old) old.remove();
    var card = el('div', 'tux-m-card', '<span class="n"></span><b class="lbl">PONTUAÇÃO</b><strong class="sc">0</strong><span class="cm"></span><small class="ht"></small>');
    card.id = 'tux-m-card'; rootEl.appendChild(card);
    if (!$('tux-m-mute')) {
      var mute = el('button', 'tux-m-mute', ''); mute.id = 'tux-m-mute'; mute.type = 'button'; mute.setAttribute('aria-label', 'Silenciar áudio'); mute.setAttribute('aria-pressed', 'false');
      mute.addEventListener('click', function () { var a = s.audio; a.muted = !a.muted; mute.classList.toggle('off', a.muted); mute.setAttribute('aria-pressed', String(a.muted)); });
      rootEl.querySelector('.unified-hud').appendChild(mute);
    }
    var mu = $('tux-m-mute'); if (mu) { mu.classList.remove('off'); mu.setAttribute('aria-pressed', 'false'); }
  }
  var DIFF = { EASY: 'FÁCIL', MEDIUM: 'MÉDIO', HARD: 'DIFÍCIL', EXPERT: 'ESPECIALISTA' };
  M.hud = function (s) {                                               // espelha o estado do jogador 1 no cartão compacto
    var c = $('tux-m-card'); if (!c || !s || !s.players[0]) return; var p = s.players[0];
    c.querySelector('.n').textContent = (DIFF[p.difficulty] || p.difficulty);
    c.querySelector('.sc').textContent = p.score;
    c.querySelector('.cm').textContent = 'SEQUÊNCIA ' + p.combo + ' · X' + p.multiplier;
    c.querySelector('.ht').textContent = 'ACERTOS ' + p.hits + ' · ERROS ' + p.misses;
  };
  M.layoutHud = function (s) {                                         // posiciona âncora dos avisos + PowerMusic; o resto é CSS
    var L = M.layout || computeLayout(); if (!L || !s.single) return false;
    var p = s.players[0], mw = clamp(Math.round(L.H * 0.2), 52, 84), sideR = Math.max(10, L.safeR + 8);
    p.panel.style.width = '0px'; p.panel.style.left = (L.W / 2) + 'px'; p.panel.style.top = Math.max(L.H * 0.3, 44) + 'px';
    p.meter.style.width = p.meter.style.height = mw + 'px'; p.meter.style.left = 'auto'; p.meter.style.right = sideR + 'px';
    p.meter.style.top = Math.max(48, Math.min(L.H - mw - 8, L.yHit - mw * 0.55)) + 'px';
    return true;
  };

  /* ================================================================== modal: MULTIJOGADOR só no computador */
  var mpEl = null, mpFocus = null;
  function buildMp() {
    if (mpEl) return;
    mpEl = el('div', 'tux-mp', '<div class="tux-mp-card" role="dialog" aria-modal="true" aria-labelledby="tux-mp-title"><div class="tux-mp-icon" aria-hidden="true"><svg viewBox="0 0 96 80"><rect x="8" y="6" width="80" height="50" rx="5" class="frame"/><rect x="14" y="12" width="68" height="38" rx="2" class="screen"/><path d="M40 56h16l3 14H37z" class="stand"/><rect x="27" y="68" width="42" height="6" rx="3" class="base"/><path d="M38 31l8-8 8 8-8 8z" class="glyph"/></svg></div>' +
      '<h2 id="tux-mp-title">🖥️ MODO EXCLUSIVO PARA PC</h2><p>🎸 O Multijogador Local está disponível apenas para computadores!</p>' +
      '<p>Para jogar com um amigo, acesse o TUX HERO pelo computador e prepare-se para o duelo! 🔥</p><button type="button" class="tux-mp-ok">ENTENDI!</button></div>');
    mpEl.id = 'tux-mp'; mpEl.style.display = 'none';
    mpEl.querySelector('.tux-mp-ok').addEventListener('click', closeMp);
    document.body.appendChild(mpEl);
  }
  function closeMp() { if (!mpEl) return; mpEl.classList.remove('open'); mpEl.style.display = 'none'; if (mpFocus && mpFocus.focus) try { mpFocus.focus(); } catch (e) {} }
  M.showMultiplayerBlocked = function () {
    buildMp(); mpFocus = document.activeElement; mpEl.style.display = 'flex'; void mpEl.offsetWidth; mpEl.classList.add('open');
    var ok = mpEl.querySelector('.tux-mp-ok'); if (ok) ok.focus();
    return true;
  };
  document.addEventListener('keydown', function (e) {
    if (mpEl && mpEl.style.display !== 'none') { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); closeMp(); } else if (e.key !== 'Tab') { e.stopImmediatePropagation(); } }
  }, true);

  /* ================================================================== instruções (toque) / abertura / rodapé */
  document.addEventListener('click', function (ev) {                   // "COMO JOGAR" do Jogo Rápido: texto de toque; pausa antes de abrir
    var b = ev.target.closest && ev.target.closest('.open-instructions'); if (!b || !window.TuxDialog) return;
    ev.stopImmediatePropagation(); ev.preventDefault();
    var wasRunning = quickStarted() && !quickPaused(); if (wasRunning) interrupt();
    var dots = ['#00e83b', '#ff1744', '#ffeb00', '#168cff', '#ff8a00'].map(function (c) { return '<kbd style="border-color:' + c + ';background:' + c + '33"></kbd>'; }).join('');
    window.TuxDialog.open('COMO JOGAR', '<p>Quando as notas chegarem aos círculos, toque no botão da mesma cor, na parte de baixo da tela. Pode usar os dois polegares e tocar em vários botões ao mesmo tempo.</p><div class="lane-keys">' + dots + '</div><p>Segure o botão nas notas longas. Acertos seguidos aumentam o combo e o multiplicador.</p>',
      [{ label: 'ENTENDI', run: function () { window.TuxDialog.close(); if (wasRunning) { var pb = document.querySelector('.play-pause'); if (pb) pb.click(); } } }]);
  }, true);

  function mobileTexts() {
    var small = document.querySelector('.intro-bottom small'), skip = document.querySelector('.intro-skip');
    if (small) small.textContent = 'TOQUE NA TELA PARA PULAR'; if (skip) skip.textContent = 'TOQUE — PULAR';
    var intro = $('intro-screen');
    if (intro) intro.addEventListener('click', function () { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
    var ft = document.querySelector('.menu-screen footer'); if (ft && ft.firstChild && ft.firstChild.nodeType === 3) ft.firstChild.nodeValue = 'TOQUE PARA SELECIONAR ';
    // Conexão lenta / economia de dados: não baixa a abertura de ~21 MB; vai direto ao menu.
    try { var c = navigator.connection; if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))) { var v = $('intro-video'); if (v) { v.preload = 'none'; setTimeout(function () { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }, 400); } } } catch (e) {}
  }

  function boot() {
    hijackSongContainer(); mobileTexts();
    var tries = 0, t = setInterval(function () {                       // aguarda o Game (bundle) existir
      var g = window.__tuxGame; if (g && g.gameView) { clearInterval(t); gateIdleRendering(); try { g.gameView.renderer.setPixelRatio(curPR); } catch (e) {} } else if (++tries > 100) clearInterval(t);
    }, 100);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
