(function (root, factory) {
  const api = factory(root.TraversalLab || {});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TraversalLab = Object.assign(root.TraversalLab || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : self, function (core) {
  function maskBracedSource(source) {
    const out = source.split('');
    let mode = 'code', quote = '', escaped = false;
    for (let i = 0; i < source.length; i++) {
      const c = source[i], n = source[i + 1];
      if (mode === 'line') { if (c === '\n') mode = 'code'; else out[i] = ' '; continue; }
      if (mode === 'block') { if (c === '*' && n === '/') { out[i] = out[i + 1] = ' '; i++; mode = 'code'; } else if (c !== '\n') out[i] = ' '; continue; }
      if (mode === 'string') { if (c !== '\n') out[i] = ' '; if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) mode = 'code'; continue; }
      if (c === '/' && n === '/') { out[i] = out[i + 1] = ' '; i++; mode = 'line'; }
      else if (c === '/' && n === '*') { out[i] = out[i + 1] = ' '; i++; mode = 'block'; }
      else if (c === '"' || c === "'" || c === '`') { out[i] = ' '; mode = 'string'; quote = c; }
    }
    return out.join('');
  }
  function matchingBrace(masked, open) {
    let depth = 0;
    for (let i = open; i < masked.length; i++) { if (masked[i] === '{') depth++; else if (masked[i] === '}' && --depth === 0) return i; }
    return -1;
  }
  function indentAt(source, index) { const start = source.lastIndexOf('\n', index - 1) + 1; return (source.slice(start, index).match(/^\s*/) || [''])[0]; }
  function bracedPlan(source, language) {
    const masked = maskBracedSource(source);
    const patterns = language === 'javascript' || language === 'typescript'
      ? [/\b(?:function\s+)?(?!constructor\b|main\b)[A-Za-z_$][\w$]*\s*\([^;{}]*\)\s*(?::\s*[^={]+)?\s*\{/g]
      : [/\b(?:public|private|protected|static|virtual|inline|final|synchronized|constexpr|const|\s)*\s*(?:[\w:<>,\[\]&*?]+)\s+(?!main\b)(?!Solution\b)([A-Za-z_]\w*)\s*\([^;{}]*\)\s*(?:const\s*)?\{/g];
    const classIndex = masked.search(/\bclass\s+Solution\b/);
    let best = null;
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(masked))) {
        const open = masked.indexOf('{', match.index + match[0].lastIndexOf('{'));
        const close = matchingBrace(masked, open);
        if (close < 0 || (classIndex >= 0 && match.index < classIndex)) continue;
        const base = indentAt(source, open);
        best = { index: open + 1, indent: `${base}    `, functionEnd: close, language };
        break;
      }
    }
    if (!best) throw new Error('Missing solution function');
    return best;
  }
  function pythonPlan(source) {
    const lines = source.split(/(?<=\n)/); let offset = 0;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(\s*)def\s+(?!main\b)([A-Za-z_]\w*)\s*\([^)]*\)\s*(?:->[^:]+)?\s*:/);
      if (!m) { offset += lines[i].length; continue; }
      const bodyIndent = m[1] + '    '; let index = offset + lines[i].length; let j = i + 1;
      while (j < lines.length && /^\s*(?:#.*)?$/.test(lines[j])) { index += lines[j].length; j++; }
      const first = lines[j] || '';
      const stripped = first.trimStart();
      if (first.startsWith(bodyIndent) && (/^[rubf]*'''/i.test(stripped) || /^[rubf]*\"\"\"/i.test(stripped))) {
        const marker = stripped.toLowerCase().replace(/^[rubf]*/, '').slice(0, 3); index += first.length; j++;
        if (stripped.indexOf(marker, 3) < 0) while (j < lines.length) { const line = lines[j++]; index += line.length; if (line.includes(marker)) break; }
      }
      return { index, indent: bodyIndent, language: 'python' };
    }
    throw new Error('Missing solution function');
  }
  function planInsertion(source, language) { return language === 'python' ? pythonPlan(source) : bracedPlan(source, language); }
  function contextFor(source, index, width = 96) { return { before: source.slice(Math.max(0, index - width), index), after: source.slice(index, index + width) }; }
  function insertGenerated(source, plan, rawText) {
    const lines = rawText.replace(/\s+$/, '').split('\n').map(line => plan.indent + line).join('\n');
    const prefix = source[plan.index - 1] === '\n' ? '' : '\n';
    const generated = prefix + lines + '\n';
    return { source: source.slice(0, plan.index) + generated + source.slice(plan.index), start: plan.index, end: plan.index + generated.length, generated, originalPosition: plan.index };
  }
  function resolveGeneratedRange(source, journal) {
    const expected = journal.generatedContent;
    if (Number.isInteger(journal.insertionPosition) && source.slice(journal.insertionPosition, journal.insertionPosition + expected.length) === expected) return { start: journal.insertionPosition, end: journal.insertionPosition + expected.length, exact: true };
    const candidates = []; let at = source.indexOf(expected);
    while (at >= 0) { candidates.push(at); at = source.indexOf(expected, at + 1); }
    const scored = candidates.map(start => ({ start, end: start + expected.length, score: (source.slice(Math.max(0, start - journal.contextBefore.length), start) === journal.contextBefore ? 1 : 0) + (source.slice(start + expected.length, start + expected.length + journal.contextAfter.length) === journal.contextAfter ? 1 : 0) }));
    scored.sort((a, b) => b.score - a.score);
    return scored.length && scored[0].score >= 1 && (!scored[1] || scored[0].score > scored[1].score) ? { ...scored[0], exact: false } : null;
  }
  function removeGenerated(source, journal, force = false) {
    let range = resolveGeneratedRange(source, journal);
    if (!range && force) {
      const start = journal.insertionPosition, allowance = journal.maximumUnsavedTailAllowance || 0;
      if (Number.isInteger(start)) {
        const window = source.slice(start, start + journal.generatedContent.length + allowance);
        const afterAt = journal.contextAfter ? window.lastIndexOf(journal.contextAfter) : -1;
        if (afterAt >= 0) range = { start, end: start + afterAt };
      }
    }
    if (!range) return { ok: false, reason: 'Generated range changed or missing' };
    return { ok: true, source: source.slice(0, range.start) + source.slice(range.end), position: range.start, forced: !range.exact };
  }
  function findLegacyMarkerRange(source) {
    const patterns = [
      [/\/\*\s*GFG_TRAVERSAL_LAB_START\s*\*\//i, /\/\*\s*GFG_TRAVERSAL_LAB_END\s*\*\//i],
      [/^\s*#\s*GFG_TRAVERSAL_LAB_START\s*$/im, /^\s*#\s*GFG_TRAVERSAL_LAB_END\s*$/im]
    ];
    for (const [startPattern, endPattern] of patterns) { const start = startPattern.exec(source); if (!start) continue; const tail = source.slice(start.index + start[0].length), end = endPattern.exec(tail); if (end) return { start: start.index, end: start.index + start[0].length + end.index + end[0].length }; }
    return null;
  }
  function problemSlug(url) { return String(url || '').match(/\/problems\/([^/?#]+)/i)?.[1] || ''; }
  function journalMatchesProblem(journal, problem) { return Boolean(journal && problem && (String(journal.problemId) === String(problem.id) || (problemSlug(journal.problemUrl) && problemSlug(journal.problemUrl) === problemSlug(problem.url)))); }
  function journalAppearsClean(source, journal) {
    const pos = journal?.insertionPosition, before = journal?.contextBefore || '', after = journal?.contextAfter || '';
    return Number.isInteger(pos) && source.slice(Math.max(0, pos - before.length), pos) === before && source.slice(pos, pos + after.length) === after;
  }
  function findKnownSyntheticRemnantRanges(source) {
    const masked = maskBracedSource(source), signatures = [
      [/3\s*,\s*1\s*,\s*4\s*,\s*1\s*,\s*5/, /%\s*2/], [/8\s*,\s*3\s*,\s*6\s*,\s*2\s*,\s*7/, /minimum|maximum/],
      [/2\s*,\s*4\s*,\s*1\s*,\s*3/, /total|prefix/], [/1\s*,\s*2\s*,\s*3\s*,\s*4\s*,\s*5\s*,\s*6/, /while/],
      [/["']traversal["']/, /\w+\s*\[\s*26\s*\]/], [/1\s*,\s*3\s*,\s*5\s*,\s*7\s*,\s*9/, /while/],
      [/2\s*,\s*1\s*,\s*5\s*,\s*1\s*,\s*3\s*,\s*2/, /maximum|window/], [/4\s*,\s*1\s*,\s*6\s*,\s*3/, /stack|pending/],
      [/5\s*,\s*2\s*,\s*8\s*,\s*1/, /queue|pending/], [/7\s*,\s*2\s*,\s*5\s*,\s*1/, /while/],
      [/1\s*,\s*2\s*,\s*3\s*,\s*4/, /IntUnaryOperator|\[\s*\]|=>/], [/\{\s*\{\s*1\s*,\s*2\s*\}\s*,\s*\{\s*2\s*,\s*3/, /seen|Set/]
    ];
    const candidates = [];
    for (let open = masked.indexOf('{'); open >= 0; open = masked.indexOf('{', open + 1)) {
      const close = matchingBrace(masked, open); if (close < 0 || close - open > 8000) continue;
      const block = source.slice(open, close + 1); if (!signatures.some(pair => pair.every(pattern => pattern.test(block)))) continue;
      let start = source.lastIndexOf('\n', open - 1) + 1; if (source.slice(start, open).trim()) start = open;
      let end = source.indexOf('\n', close + 1); if (end < 0) end = close + 1; else end++;
      candidates.push({ start, end, open, close });
    }
    return candidates.filter(candidate => !candidates.some(other => other !== candidate && candidate.open < other.open && candidate.close > other.close)).map(({ start, end }) => ({ start, end })).sort((a, b) => a.start - b.start);
  }
  return { maskBracedSource, matchingBrace, planInsertion, contextFor, insertGenerated, resolveGeneratedRange, removeGenerated, findLegacyMarkerRange, problemSlug, journalMatchesProblem, journalAppearsClean, findKnownSyntheticRemnantRanges };
});
