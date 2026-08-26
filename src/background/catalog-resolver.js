(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TraversalLab = Object.assign(root.TraversalLab || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  const CACHE_KEY = 'gfgCatalogV1', CACHE_MS = 24 * 60 * 60 * 1000;
  function decodeHtml(value) { return value.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]+>/g, '').trim(); }
  function problemFromUrl(url, title = '') {
    const match = url.match(/\/problems\/([^/?#]+)(?:\/(\d+))?/i); if (!match) return null;
    const slug = match[1]; return { id: slug, slug, title: decodeHtml(title) || slug.replace(/-/g, ' '), url: `https://www.geeksforgeeks.org/problems/${slug}/${match[2] || '1'}`, available: true, premium: false };
  }
  function parseCatalogHtml(html) {
    const found = [], seen = new Set();
    const anchor = /<a\b([^>]*?href=["']([^"']*\/problems\/[^"']+)["'][^>]*)>([\s\S]*?)<\/a>/gi; let match;
    while ((match = anchor.exec(html))) {
      const problem = problemFromUrl(match[2], match[3]); if (!problem || seen.has(problem.id)) continue;
      const neighborhood = html.slice(Math.max(0, match.index - 300), Math.min(html.length, anchor.lastIndex + 300));
      problem.premium = /premium|locked/i.test(neighborhood); problem.available = !/unavailable|deleted/i.test(neighborhood);
      seen.add(problem.id); found.push(problem);
    }
    return found;
  }
  function parseCatalogJson(value) {
    const rows = [];
    (function walk(node) {
      if (!node || typeof node !== 'object') return;
      const slug = node.slug || node.problem_slug || node.problemSlug;
      const rawUrl = node.url || node.problem_url || node.problemUrl || (slug ? `/problems/${slug}/1` : '');
      const p = problemFromUrl(rawUrl, node.title || node.problem_name || node.problemName || node.name || '');
      if (p) { p.id = String(node.id || node.problem_id || node.problemId || p.slug); p.premium = Boolean(node.premium || node.is_premium || node.isPremium); p.available = node.available !== false && node.status !== 'deleted'; rows.push(p); return; }
      for (const child of Object.values(node)) if (child && typeof child === 'object') walk(child);
    })(value);
    const seen = new Set(); return rows.filter(p => !seen.has(p.id) && seen.add(p.id));
  }
  async function retryFetch(fetchFn, url, attempts = 3) {
    let last;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try { const response = await fetchFn(url, { credentials: 'include', redirect: 'follow' }); if (response.status === 429) throw new Error('Rate limiting'); if (!response.ok) throw new Error(`Catalog HTTP ${response.status}`); return response; }
      catch (error) { last = error; if (attempt + 1 < attempts) await new Promise(resolve => setTimeout(resolve, 250 * 2 ** attempt)); }
    }
    throw last;
  }
  class CatalogResolver {
    constructor({ fetchFn = fetch, storage = chrome.storage.local, now = () => Date.now(), maxPages = 160 } = {}) { Object.assign(this, { fetchFn, storage, now, maxPages }); }
    async resolve(requiredPosition = 1, force = false) {
      const cached = (await this.storage.get(CACHE_KEY))[CACHE_KEY];
      if (!force && cached?.fetchedAt && this.now() - cached.fetchedAt < CACHE_MS && cached.problems?.length >= requiredPosition) return cached.problems;
      const problems = [], seen = new Set();
      for (let page = 1; page <= this.maxPages && problems.length < requiredPosition; page++) {
        const url = `https://www.geeksforgeeks.org/explore?page=${page}`;
        const response = await retryFetch(this.fetchFn, url); const type = response.headers?.get?.('content-type') || '';
        let pageProblems;
        if (type.includes('json')) pageProblems = parseCatalogJson(await response.json());
        else { const html = await response.text(); pageProblems = parseCatalogHtml(html); if (!pageProblems.length) { const next = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i); if (next) try { pageProblems = parseCatalogJson(JSON.parse(next[1])); } catch {} } }
        const unique = pageProblems.filter(p => !seen.has(p.id) && seen.add(p.id));
        if (!unique.length) break; problems.push(...unique);
      }
      if (!problems.length) throw new Error('Catalog schema changed or returned no supported problems');
      await this.storage.set({ [CACHE_KEY]: { fetchedAt: this.now(), source: 'https://www.geeksforgeeks.org/explore', problems } });
      return problems;
    }
  }
  return { CACHE_KEY, CACHE_MS, decodeHtml, problemFromUrl, parseCatalogHtml, parseCatalogJson, retryFetch, CatalogResolver };
});
