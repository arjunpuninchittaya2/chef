// ================================================================
// GHOST TYPER — Content Script
//
// Ctrl+Alt+V : slow paste (errors + timing from keystroke data)
// ================================================================

(function () {
  'use strict';

  const STORAGE_KEY = 'gd_keylogger_data';

  // ── Indicator element ─────────────────────────────────────────────
  function setGhostIndicator(active) {
    const el = document.querySelector('#docs-screenreader-menu');
    if (!el) return;
    el.style.fontWeight = active ? 'bold' : '';
  }

  // ── Timing data + samplers (used by slow paste only) ──────────────
  function loadTimingData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function buildSampler(arr, fallback = 80) {
    if (!arr || !arr.length) return () => fallback;
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    const bins = 20;
    const width = (max - min) / bins || 1;
    const hist = Array(bins).fill(0);
    for (const v of arr) {
      const b = Math.min(bins - 1, Math.floor((v - min) / width));
      hist[b]++;
    }
    const total = hist.reduce((a, b) => a + b, 0);
    return () => {
      let r = Math.random() * total;
      let b = 0;
      while (r > hist[b]) { r -= hist[b]; b++; }
      return Math.max(10, min + b * width + Math.random() * width);
    };
  }

  let sampleNormal = () => 80 + Math.random() * 60;
  let samplePause  = () => 800 + Math.random() * 600;
  let sampleDelete = () => 120 + Math.random() * 80;
  let mistakeProb  = 0.04;
  let deleteProb   = 0.85;
  let pauseProb    = 0.05;
  const MULTIPLIER = 2;
  const PAUSE_THRESHOLD = 600;

  function isCharKey(k) {
    if (!k) return false;
    if (k.length === 1) return true;
    return ['Backspace', 'Enter', 'Tab', 'ShiftTab'].includes(k);
  }

  function refreshSamplers() {
    const data = loadTimingData();
    if (!data?.keystrokes) return;
    const events  = data.keystrokes.filter(e => isCharKey(e.key));
    const deltas  = events.map(e => e.delta).filter(x => typeof x === 'number');
    const normal  = deltas.filter(d => d <= PAUSE_THRESHOLD);
    const pauses  = deltas.filter(d => d >  PAUSE_THRESHOLD);
    pauseProb     = pauses.length / (deltas.length || 1);

    const bsEvents    = events.filter(e => e.key === 'Backspace');
    const deleteTimes = [];
    const mistakes    = [];
    for (const bs of bsEvents) {
      const prev = events
        .filter(e => e.time < bs.time && e.key.length === 1)
        .findLast(e => bs.time - e.time < 400);
      if (prev) { mistakes.push(prev); deleteTimes.push(bs.time - prev.time); }
    }

    if (normal.length)      sampleNormal = buildSampler(normal);
    if (pauses.length)      samplePause  = buildSampler(pauses);
    if (deleteTimes.length) sampleDelete = buildSampler(deleteTimes);
    mistakeProb = mistakes.length / (events.length || 1);
    deleteProb  = mistakes.length / (bsEvents.length || 1);
  }

  refreshSamplers();

  function randomChar() {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    return chars[Math.floor(Math.random() * chars.length)];
  }

  // ── Google Docs iframe ────────────────────────────────────────────
  function getDocsTarget() {
    return document.querySelector('.docs-texteventtarget-iframe')?.contentDocument || null;
  }

  // ── Dispatch helpers ──────────────────────────────────────────────
  function dispatchChar(target, char) {
    target.dispatchEvent(new KeyboardEvent('keypress', {
      bubbles: true, cancelable: true,
      key: char, code: `Key${char.toUpperCase()}`,
      charCode: char.charCodeAt(0), keyCode: char.charCodeAt(0), which: char.charCodeAt(0)
    }));
  }
  let isDispatching = false;

  function dispatchBackspace(target) {
    isDispatching = true;
    target.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true, cancelable: true,
      key: 'Backspace', code: 'Backspace', keyCode: 8, which: 8
    }));
    isDispatching = false;
  }
  function dispatchEnter(target) {
    isDispatching = true;
    target.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true, cancelable: true,
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13
    }));
    isDispatching = false;
  }
  function dispatchTab(target) {
    isDispatching = true;
    target.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true, cancelable: true,
      key: 'Tab', code: 'Tab', keyCode: 9, which: 9
    }));
    isDispatching = false;
  }
  function dispatchShiftTab(target) {
    isDispatching = true;
    target.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true, cancelable: true,
      key: 'Tab', code: 'Tab', keyCode: 9, which: 9, shiftKey: true
    }));
    isDispatching = false;
  }

  function dispatchKey(target, key) {
    if      (key === 'Backspace') dispatchBackspace(target);
    else if (key === 'Enter')     dispatchEnter(target);
    else if (key === 'Tab')       dispatchTab(target);
    else if (key === 'ShiftTab')  dispatchShiftTab(target);
    else                          dispatchChar(target, key);
  }

  // ================================================================
  // SLOW PASTE (Ctrl+Alt+V)
  // ================================================================
  let slowTypingActive = false;

  function simulateTyping(groundTruth) {
    const out = [];
    let i = 0;

    while (i < groundTruth.length) {
      let target = groundTruth[i];

      if (Math.random() < pauseProb) {
        out.push({ type: 'pause', duration: Math.min(samplePause() / MULTIPLIER, Math.random() * 300 + 3000) });
      }

      // escape sequences: \n \t \st
      if (target === '\\' && i + 1 < groundTruth.length) {
        const n = groundTruth[i + 1];
        if (n === 's' && groundTruth[i + 2] === 't') {
          out.push({ type: 'correct', key: 'ShiftTab', time: sampleNormal() / MULTIPLIER });
          i += 3; continue;
        }
        if (n === 't') {
          out.push({ type: 'correct', key: 'Tab', time: sampleNormal() / MULTIPLIER });
          i += 2; continue;
        }
        if (n === 'n') {
          out.push({ type: 'correct', key: 'Enter', time: sampleNormal() / MULTIPLIER });
          i += 2; continue;
        }
      }

      if (target === '…') {
        out.push({ type: 'pause', duration: samplePause() });
        out.push({ type: 'correct', key: '.', time: sampleNormal() / MULTIPLIER });
        out.push({ type: 'correct', key: '.', time: sampleNormal() / MULTIPLIER });
        out.push({ type: 'correct', key: '.', time: sampleNormal() / MULTIPLIER });
        i++; continue;
      }
      if (target === '\n') {
        out.push({ type: 'correct', key: 'Enter', time: sampleNormal() / MULTIPLIER });
        i++; continue;
      }
      if (target === '\t') {
        out.push({ type: 'correct', key: 'Tab', time: sampleNormal() / MULTIPLIER });
        i++; continue;
      }

      if (Math.random() < mistakeProb) {
        const wrong = randomChar();
        out.push({ type: 'mistake', key: wrong, time: sampleNormal() / MULTIPLIER });
        if (Math.random() < deleteProb) {
          out.push({ type: 'delete', key: wrong, time: sampleDelete() / MULTIPLIER });
        }
      }

      out.push({ type: 'correct', key: target, time: sampleNormal() / MULTIPLIER });
      i++;
    }
    return out;
  }

  function typeSlowly(text) {
    const target = getDocsTarget();
    if (!target) { console.error('[GhostTyper] Could not find Docs iframe.'); return; }

    slowTypingActive = true;
    const sequence = simulateTyping(text);
    let index = 0;

    function runNext() {
      if (!slowTypingActive || index >= sequence.length) {
        slowTypingActive = false;
        console.log('[GhostTyper] Slow paste complete.');
        return;
      }
      const evt = sequence[index++];

      if (evt.type === 'pause')   { setTimeout(runNext, evt.duration); return; }
      if (evt.type === 'mistake') { dispatchChar(target, evt.key);  setTimeout(runNext, evt.time); return; }
      if (evt.type === 'delete')  { dispatchBackspace(target);       setTimeout(runNext, evt.time); return; }
      if (evt.type === 'correct') { dispatchKey(target, evt.key);    setTimeout(runNext, evt.time); return; }
      runNext();
    }
    runNext();
  }

  // ================================================================
  // GHOST PASTE (Alt+B / Alt+G)
  // ================================================================
  let ghostActive = false;
  let ghostTokens = [];
  let ghostIndex  = 0;

  function parseGhostText(raw) {
    const tokens = [];
    let i = 0;
    while (i < raw.length) {
      if (raw[i] === '\\' && i + 1 < raw.length) {
        const n = raw[i + 1];
        if (n === 's' && raw[i + 2] === 't') { tokens.push('ShiftTab'); i += 3; continue; }
        if (n === 'n')                        { tokens.push('Enter');    i += 2; continue; }
        if (n === 't')                        { tokens.push('Tab');      i += 2; continue; }
      }
      if (raw[i] === '\n') { tokens.push('Enter'); i++; continue; }
      if (raw[i] === '\t') { tokens.push('Tab');   i++; continue; }
      tokens.push(raw[i]);
      i++;
    }
    return tokens;
  }

  async function activateGhost() {
    if (ghostActive) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text) { console.log('[GhostTyper] Clipboard empty.'); return; }
      ghostTokens = parseGhostText(text);
      ghostIndex  = 0;
      ghostActive = true;
      setGhostIndicator(true);
      console.log(`[GhostTyper] Ghost mode ON — ${ghostTokens.length} chars loaded.`);
    } catch (err) {
      console.error('[GhostTyper] Clipboard read failed:', err);
    }
  }

  function deactivateGhost(reason = 'OFF') {
    ghostActive = false;
    setGhostIndicator(false);
    console.log(`[GhostTyper] Ghost mode ${reason}.`);
  }

  // ── Docs iframe keydown handler ───────────────────────────────────
  function onDocsKeyDown(e) {
    if (isDispatching) return;

    if (e.altKey && !e.ctrlKey && (e.key === 'g' || e.key === 'G')) {
      e.preventDefault(); e.stopPropagation();
      if (ghostActive) deactivateGhost('stopped by user');
      else if (slowTypingActive) { slowTypingActive = false; console.log('[GhostTyper] Slow paste stopped.'); }
      return;
    }

    if (e.altKey && !e.ctrlKey && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault(); e.stopPropagation();
      activateGhost();
      return;
    }

    if (e.ctrlKey && e.altKey && (e.key === 'v' || e.key === 'V')) {
      e.preventDefault(); e.stopPropagation();
      navigator.clipboard.readText().then(text => { if (text) typeSlowly(text); });
      return;
    }

    if (!ghostActive) {
      if (slowTypingActive && e.isTrusted) slowTypingActive = false;
      return;
    }

    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Escape',
         'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
         'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
         'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) return;

    e.preventDefault();
    e.stopPropagation();

    const docsTarget = getDocsTarget();
    if (!docsTarget) return;

    if (e.key === 'Backspace') {
      if (ghostIndex > 0) ghostIndex--;
      dispatchBackspace(docsTarget);
      return;
    }

    if (ghostIndex >= ghostTokens.length) {
      deactivateGhost('complete');
      return;
    }

    const token = ghostTokens[ghostIndex++];
    if      (token === 'Enter')    dispatchEnter(docsTarget);
    else if (token === 'Tab')      dispatchTab(docsTarget);
    else if (token === 'ShiftTab') dispatchShiftTab(docsTarget);
    else                           dispatchChar(docsTarget, token);

    if (ghostIndex >= ghostTokens.length) {
      deactivateGhost('complete');
    }
  }

  // ── Parent doc listener ───────────────────────────────────────────
  function onParentKeyDown(e) {
    if (e.altKey && !e.ctrlKey && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault(); e.stopPropagation();
      activateGhost();
      return;
    }
    if (e.altKey && !e.ctrlKey && (e.key === 'g' || e.key === 'G')) {
      e.preventDefault(); e.stopPropagation();
      if (ghostActive) deactivateGhost('stopped by user');
      else if (slowTypingActive) { slowTypingActive = false; console.log('[GhostTyper] Slow paste stopped.'); }
      return;
    }
    if (e.ctrlKey && e.altKey && (e.key === 'v' || e.key === 'V')) {
      e.preventDefault(); e.stopPropagation();
      navigator.clipboard.readText().then(text => { if (text) typeSlowly(text); });
    }
  }

  document.addEventListener('keydown', onParentKeyDown, true);

  // ── Message listener for AI tool invocation ───────────────────────
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === 'GHOST_TYPE' && typeof message.text === 'string') {
      typeSlowly(message.text);
      sendResponse({ status: 'typing_started', length: message.text.length });
      return true;
    }
  });

  // ── Attach to Docs iframe ─────────────────────────────────────────
  function attachToIframe() {
    const doc = getDocsTarget();
    if (!doc) { requestAnimationFrame(attachToIframe); return; }
    doc.addEventListener('keydown', onDocsKeyDown, true);
    console.log('[GhostTyper] Ready. Ctrl+Alt+V = slow paste | Alt+B = ghost | Alt+G = stop.');
  }

  attachToIframe();
})();
