(function () {
  const sessions = new Map();
  const visible = element => element && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
  function offsetToPosition(text, offset) { const before = text.slice(0, offset).split('\n'); return { lineNumber: before.length, column: before.at(-1).length + 1 }; }
  function positionToOffset(text, pos) { const lines = text.split('\n'); let result = 0; for (let i = 0; i < pos.lineNumber - 1; i++) result += lines[i].length + 1; return result + pos.column - 1; }
  function monacoAdapter() {
    const api = window.monaco?.editor;
    if (!api?.getModels) return null;
    const editors = [...document.querySelectorAll('.monaco-editor')].filter(visible);
    const models = api.getModels(); if (!editors.length || models.length !== 1) return null;
    const model = models[0];
    const candidates = [...(api.getEditors?.() || []), window.editor, window.codeEditor, window.monacoEditor, window._monacoEditor].filter(Boolean);
    const editor = candidates.find(e => { try { return e.getModel?.() === model && visible(e.getDomNode?.()); } catch { return false; } }) || null;
    if (!editor) return null;
    return {
      type: 'monaco', source: () => model.getValue(), language: () => model.getLanguageId?.() || '',
      insert(offset, text) { const pos = model.getPositionAt ? model.getPositionAt(offset) : offsetToPosition(model.getValue(), offset); model.applyEdits([{ range: new window.monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column), text, forceMoveMarkers: true }]); },
      remove(start, end) { const a = model.getPositionAt(start), b = model.getPositionAt(end); model.applyEdits([{ range: new window.monaco.Range(a.lineNumber, a.column, b.lineNumber, b.column), text: '', forceMoveMarkers: true }]); },
      caret(offset) { if (!editor) return; const pos = model.getPositionAt(offset); editor.setPosition(pos); editor.setSelection(new window.monaco.Selection(pos.lineNumber, pos.column, pos.lineNumber, pos.column)); editor.revealPositionInCenterIfOutsideViewport(pos); editor.focus(); },
      rect: () => editors[0].getBoundingClientRect()
    };
  }
  function aceAdapter() {
    if (!window.ace?.edit) return null;
    const element = [...document.querySelectorAll('.ace_editor')].find(visible); if (!element) return null;
    let editor; try { editor = window.ace.edit(element); } catch { return null; }
    const doc = editor.session.getDocument();
    return {
      type: 'ace', source: () => editor.getValue(), language: () => editor.session.$modeId?.split('/').at(-1) || '',
      insert(offset, text) { doc.insert(doc.indexToPosition(offset), text); },
      remove(start, end) { const Range = window.ace.require('ace/range').Range, a = doc.indexToPosition(start), b = doc.indexToPosition(end); doc.remove(new Range(a.row, a.column, b.row, b.column)); },
      caret(offset) { const p = doc.indexToPosition(offset); editor.selection.moveTo(p.row, p.column); editor.clearSelection(); editor.scrollToLine(p.row, true, true); editor.focus(); },
      rect: () => element.getBoundingClientRect()
    };
  }
  const KEY_CODES = { Home: 36, ArrowRight: 39, Backspace: 8 };
  function aceDomKey(input, key, options = {}) { const code = KEY_CODES[key] || 0; for (const type of ['keydown', 'keyup']) { const event = new KeyboardEvent(type, { key, code: key, keyCode: code, which: code, bubbles: true, cancelable: true, ...options }); if (!event.keyCode && code) { Object.defineProperty(event, 'keyCode', { get: () => code }); Object.defineProperty(event, 'which', { get: () => code }); } input.dispatchEvent(event); } }
  function afterAceRender() { return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); }
  function aceDomSource(element) {
    const scroller = element.querySelector('.ace_scroller'), lineHeight = parseFloat(getComputedStyle(scroller).lineHeight) || 0;
    const totalHeight = parseFloat(element.querySelector('.ace_scrollbar-v .ace_scrollbar-inner')?.style.height) || 0;
    const count = lineHeight ? Math.round(totalHeight / lineHeight) : 0;
    const rendered = [...element.querySelectorAll('.ace_line')].map(line => ({ row: Math.round((parseFloat(line.style.top) || 0) / lineHeight), text: line.textContent || '' }));
    if (!count || rendered.length < count || rendered[0]?.row !== 0 || rendered.at(-1)?.row !== count - 1) return null;
    return rendered.map(row => row.text).join('\n');
  }
  function aceDomAdapter() {
    const element = [...document.querySelectorAll('.ace_editor')].find(visible); if (!element) return null;
    const input = element.querySelector('textarea.ace_text-input'), initial = aceDomSource(element); if (!input || initial == null) return null;
    const move = offset => { input.focus({ preventScroll: true }); const mac = navigator.platform.includes('Mac'); aceDomKey(input, 'Home', { ctrlKey: !mac, metaKey: mac }); for (let i = 0; i < offset; i++) aceDomKey(input, 'ArrowRight'); };
    const insertText = text => { input.focus({ preventScroll: true }); if (!document.execCommand('insertText', false, text)) { input.value = text; input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text })); } };
    return {
      type: 'ace-dom', source: () => aceDomSource(element) ?? '', language: () => document.querySelector('[role=listbox][class*=language] [role=alert]')?.textContent || '',
      async insert(offset, text) { move(offset); insertText(text); await afterAceRender(); },
      async remove(start, end) { move(start); for (let i = start; i < end; i++) aceDomKey(input, 'ArrowRight', { shiftKey: true }); aceDomKey(input, 'Backspace'); await afterAceRender(); },
      caret(offset) { move(offset); element.querySelector('.ace_cursor')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); },
      rect: () => element.getBoundingClientRect()
    };
  }
  function codeMirrorAdapter() {
    const element = [...document.querySelectorAll('.CodeMirror')].find(el => visible(el) && el.CodeMirror); if (!element) return null;
    const editor = element.CodeMirror;
    const toPos = offset => editor.posFromIndex(offset);
    return {
      type: 'codemirror', source: () => editor.getValue(), language: () => editor.getOption('mode')?.name || editor.getOption('mode') || '',
      insert(offset, text) { editor.replaceRange(text, toPos(offset), toPos(offset), '+gfg-traversal-lab'); },
      remove(start, end) { editor.replaceRange('', toPos(start), toPos(end), '+gfg-traversal-lab-cleanup'); },
      caret(offset) { const p = toPos(offset); editor.setCursor(p); editor.scrollIntoView(p, 80); editor.focus(); },
      rect: () => element.getBoundingClientRect()
    };
  }
  function textareaAdapter() {
    const element = [...document.querySelectorAll('textarea')].find(el => visible(el) && !el.closest('.monaco-editor,.ace_editor,.CodeMirror') && (el.value.includes('\n') || el.value.length > 40));
    if (!element) return null;
    const languageText = document.querySelector('[aria-label*=language i], select[name*=language i], [data-language]')?.textContent || '';
    return {
      type: 'textarea', source: () => element.value, language: () => languageText,
      insert(offset, text) { element.setRangeText(text, offset, offset, 'end'); element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text })); },
      remove(start, end) { element.setRangeText('', start, end, 'end'); element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' })); },
      caret(offset) { element.setSelectionRange(offset, offset); element.focus({ preventScroll: true }); const line = element.value.slice(0, offset).split('\n').length - 1, height = parseFloat(getComputedStyle(element).lineHeight) || 18; element.scrollTop = Math.max(0, line * height - element.clientHeight / 2); element.scrollIntoView({ block: 'nearest' }); },
      rect: () => element.getBoundingClientRect()
    };
  }
  function detect() { return monacoAdapter() || codeMirrorAdapter() || aceAdapter() || aceDomAdapter() || textareaAdapter(); }
  function normalizePageLanguage(text) { const value = String(text || '').toLowerCase(); if (/c\+\+/.test(value)) return 'cpp'; if (/python/.test(value)) return 'python'; if (/javascript/.test(value)) return 'javascript'; if (/java/.test(value)) return 'java'; return ''; }
  function setPageLanguage(language) {
    const listbox = document.querySelector('[role=listbox][class*=language]'); if (!listbox) throw new Error('Page language selector not found');
    const current = normalizePageLanguage(listbox.querySelector('[role=alert]')?.textContent); if (current === language) return { changed: false, language };
    const labels = { cpp: /C\+\+/, java: /^Java\b/, python: /^Python/, javascript: /^Javascript/i };
    const option = [...listbox.querySelectorAll('[role=option]')].find(node => labels[language]?.test(node.textContent.trim())); if (!option) throw new Error(`Page does not offer ${language}`);
    listbox.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); option.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return { changed: true, language };
  }
  function locate(session, source) {
    if (!session.text || source.slice(session.start, session.start + session.text.length) === session.text) return session.start;
    const first = source.indexOf(session.text); if (first >= 0 && source.indexOf(session.text, first + 1) < 0) { session.start = first; return first; }
    throw new Error('External modification inside generated range');
  }
  function respond(id, ok, value, error) { document.dispatchEvent(new CustomEvent('gfg-traversal-lab-response', { detail: { id, ok, value, error } })); }
  document.addEventListener('gfg-traversal-lab-request', async event => {
    const { id, method, args = {} } = event.detail || {};
    try {
      const adapter = detect(); if (!adapter) throw new Error('Unsupported editor');
      let value;
      if (method === 'setLanguage') value = setPageLanguage(args.language);
      else if (method === 'detect') value = { type: adapter.type, source: adapter.source(), language: adapter.language(), rect: adapter.rect().toJSON?.() || adapter.rect() };
      else if (method === 'begin') { sessions.set(args.sessionId, { start: args.position, text: '' }); value = true; }
      else if (method === 'adopt') { sessions.set(args.sessionId, { start: args.position, text: args.text }); value = true; }
      else if (method === 'removeRange') { const before = adapter.source(), expected = before.slice(0, args.start) + before.slice(args.end); await adapter.remove(args.start, args.end); const after = adapter.source(); if (after !== expected) throw new Error('Editor refused the requested range deletion'); adapter.caret(args.start); value = true; }
      else {
        const session = sessions.get(args.sessionId); if (!session) throw new Error('Missing editor session');
        if (method === 'insert') { const before = adapter.source(), start = locate(session, before), position = start + session.text.length, expected = before.slice(0, position) + args.text + before.slice(position); await adapter.insert(position, args.text); const after = adapter.source(); if (after !== expected) throw new Error('Editor write verification failed'); session.text += args.text; adapter.caret(position + args.text.length); value = { start, end: start + session.text.length, text: session.text }; }
        else if (method === 'inspect') { const source = adapter.source(); let start = session.start; try { start = locate(session, source); } catch {} value = { source, start, end: start + session.text.length, current: source.slice(start, start + session.text.length) }; }
        else if (method === 'remove') { const source = adapter.source(), start = locate(session, source); if (!args.force && source.slice(start, start + session.text.length) !== session.text) throw new Error('External modification inside generated range'); const expected = source.slice(0, start) + source.slice(start + session.text.length); await adapter.remove(start, start + session.text.length); if (adapter.source() !== expected) throw new Error('Editor refused generated-range cleanup'); adapter.caret(start); sessions.delete(args.sessionId); value = true; }
        else if (method === 'caret') { adapter.caret(session.start + session.text.length); value = true; }
        else if (method === 'release') { sessions.delete(args.sessionId); value = true; }
        else throw new Error('Unknown editor operation');
      }
      respond(id, true, value);
    } catch (error) { respond(id, false, null, error.message); }
  });
})();
