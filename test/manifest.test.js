const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const manifest = JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));

test('manifest is MV3 with only required permissions and constrained hosts',()=>{assert.equal(manifest.manifest_version,3);assert.deepEqual(manifest.permissions.sort(),['alarms','nativeMessaging','sidePanel','storage','tabs'].sort());assert.deepEqual(manifest.host_permissions.sort(),['https://practice.geeksforgeeks.org/*','https://www.geeksforgeeks.org/*'].sort());assert.ok(Number(manifest.minimum_chrome_version)>=114)});
test('every manifest script and panel resource exists',()=>{const files=[manifest.background.service_worker,manifest.side_panel.default_path,...manifest.content_scripts.flatMap(x=>x.js)];for(const file of files)assert.ok(fs.existsSync(path.join(root,file)),file)});
test('content implementation never clears a full model or clicks execution controls',()=>{const dir=path.join(root,'src/content');const code=fs.readdirSync(dir).filter(x=>x.endsWith('.js')).map(x=>fs.readFileSync(path.join(dir,x),'utf8')).join('\n');assert.doesNotMatch(code,/\.setValue\s*\(/);assert.doesNotMatch(code,/querySelector(?:All)?\s*\(\s*['"`][^'"`]*(?:run|compile|submit)/i);assert.doesNotMatch(code,/\.click\s*\(/)});
test('generated snippets contain no visible tracking comments',()=>{const code=fs.readFileSync(path.join(root,'src/content/snippet-generator.js'),'utf8');assert.doesNotMatch(code,/GFG_TRAVERSAL_LAB|synthetic|generated block/i)});
test('Ace detection uses the editor instance attached to the DOM before virtualized-line fallback',()=>{const code=fs.readFileSync(path.join(root,'src/content/page-editor-api.js'),'utf8');assert.match(code,/element\.env\?\.editor/);assert.ok(code.indexOf('element.env?.editor')<code.indexOf('function aceDomAdapter'))});
test('native mode waits for real editor focus and resumes from an editor focus event',()=>{const content=fs.readFileSync(path.join(root,'src/content/gfg-adapter.js'),'utf8'),worker=fs.readFileSync(path.join(root,'src/background/service-worker.js'),'utf8');assert.match(content,/focusin/);assert.match(content,/NATIVE_FOCUS_REQUIRED/);assert.match(content,/NATIVE_FOCUS_READY/);assert.match(worker,/NATIVE_FOCUS_REQUIRED/);assert.match(worker,/NATIVE_FOCUS_READY/)});
