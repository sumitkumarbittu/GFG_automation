const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCatalogHtml, parseCatalogJson, CatalogResolver } = require('../src/background/catalog-resolver.js');

test('catalog HTML keeps displayed order and stable slugs', () => {
  const html = `<a href="/problems/factorial/1"><b>Factorial</b></a><a href="https://www.geeksforgeeks.org/problems/lcm-and-gcd4516/1">LCM &amp; GCD</a>`;
  assert.deepEqual(parseCatalogHtml(html).map(p => [p.slug,p.title]), [['factorial','Factorial'],['lcm-and-gcd4516','LCM & GCD']]);
});
test('catalog JSON records premium and availability metadata', () => {
  const rows = parseCatalogJson({ results:[{ id:41, problem_slug:'one', problem_name:'One' },{ id:42, slug:'two', title:'Two', is_premium:true, status:'deleted' }] });
  assert.deepEqual(rows.map(p => [p.id,p.premium,p.available]), [['41',false,true],['42',true,false]]);
});
test('resolver paginates in stable order and uses cache', async () => {
  const pages = [`<a href="/problems/a/1">A</a>`, `<a href="/problems/b/1">B</a>`]; let calls=0, store={};
  const storage={get:async k=>({[k]:store[k]}),set:async value=>Object.assign(store,value)};
  const fetchFn=async()=>({ok:true,status:200,headers:{get:()=> 'text/html'},text:async()=>pages[calls++]||''});
  const resolver=new CatalogResolver({fetchFn,storage,maxPages:3,now:()=>100});
  assert.deepEqual((await resolver.resolve(2)).map(p=>p.id),['a','b']); assert.equal(calls,2); await resolver.resolve(2); assert.equal(calls,2);
});
