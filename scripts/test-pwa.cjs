const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const sharp=require('../frontend/node_modules/sharp');
(async()=>{
 for(const [key,name]of [['la','Learners Academy'],['lp','Learners Preschool'],['mb','Marlbridge'],['portal','Learners Portal']]){
  const m=JSON.parse(fs.readFileSync(`frontend/public/pwa/${key}/manifest.json`));assert.equal(m.name,name);assert.equal(m.display,'standalone');assert.equal(m.scope,'/');assert.equal(m.start_url,'/');assert.equal(m.id,'/');
  for(const icon of m.icons){const p=`frontend/public${icon.src}`;const meta=await sharp(p).metadata();assert.equal(`${meta.width}x${meta.height}`,icon.sizes);assert.equal(meta.format,'png');}
  assert(m.icons.some(i=>i.sizes==='192x192'&&i.purpose==='any'));assert(m.icons.some(i=>i.sizes==='512x512'&&i.purpose==='any'));assert(m.icons.some(i=>i.purpose==='maskable'));
 }
 const handlers={},stored=new Map(),deleted=[];let offline=false,waited;
 const key=r=>new URL(typeof r==='string'?r:r.url,'https://portal.test').href;
 const cache={addAll:async paths=>{for(const p of paths)stored.set(key(p),new Response('public asset'))},put:async(r,v)=>stored.set(key(r),v),match:async r=>stored.get(key(r))?.clone()};
 const worker=fs.readdirSync('frontend/dist').find(name=>/^sw-[a-f0-9]+\.js$/.test(name));assert(worker,'Versioned service worker missing');
 vm.runInNewContext(fs.readFileSync('frontend/dist/'+worker,'utf8'),{URL,Response,self:{location:{origin:'https://portal.test'},addEventListener:(name,fn)=>handlers[name]=fn,clients:{claim:async()=>{}}},caches:{open:async()=>cache,keys:async()=>['other-app-cache','learners-portal-shell-old'],delete:async k=>deleted.push(k),match:async r=>cache.match(r)},fetch:async()=>{if(offline)throw Error('offline');return new Response('network response')}});
 handlers.install({waitUntil:p=>waited=p});await waited;handlers.activate({waitUntil:p=>waited=p});await waited;assert.deepEqual(deleted,['learners-portal-shell-old']);
 function request(path,extra={}){return {url:new URL(path,'https://portal.test').href,method:'GET',mode:'cors',headers:new Headers(),...extra}}
 for(const r of [request('/api/auth/me'),request('/api'),request('/api/auth/logout',{method:'POST'}),request('/uploads/private.pdf?signature=private'),request('/assets/private.js',{headers:new Headers({Authorization:'Bearer test-token'})}),request('https://external.test/file.js')]){
  let intercepted=false;handlers.fetch({request:r,respondWith:()=>intercepted=true});assert.equal(intercepted,false,`Private request intercepted: ${r.url}`);
 }
 let response;handlers.fetch({request:request('/dashboard',{mode:'navigate'}),respondWith:p=>response=p});assert.equal(await (await response).text(),'network response');
 assert(![...stored.keys()].some(k=>k.includes('/dashboard')),'Navigation responses must not be cached');
 offline=true;handlers.fetch({request:request('/my-invoices',{mode:'navigate'}),respondWith:p=>response=p});assert((await (await response).text()).includes('id="root"'));
 assert(![...stored.keys()].some(k=>/\/api(?:\/|$)|\/uploads(?:\/|$)|signature=/.test(k)),'Private data entered the shell cache');
 console.log('Passed: four install manifests, PNG/maskable icon dimensions, offline shell, network-only account/document requests, safe cache cleanup');
})().catch(e=>{console.error(e);process.exitCode=1});
