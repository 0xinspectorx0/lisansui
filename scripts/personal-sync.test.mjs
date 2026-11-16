import assert from 'node:assert/strict';
import { build } from 'esbuild';
import Module from 'node:module';
import path from 'node:path';
import { readFileSync } from 'node:fs';
const bundle = await build({entryPoints:['lib/userDataSync.ts'],bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'mock',setup(b){
  b.onResolve({filter:/^\.\/sbGateway$/},()=>({path:'gateway',namespace:'mock'}));
  b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:`export const restFetch = (...args) => globalThis.__personalFetch(...args);`,loader:'js'}));
}}]});
const filename=path.join(process.cwd(),'scripts/_personal_bundle.cjs');const mod=new Module(filename);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));mod._compile(bundle.outputFiles[0].text,filename);
const sync=mod.exports;
let calls=[]; let fail=false;
globalThis.__personalFetch=async (table,query,init={})=>{calls.push({table,query,init});return fail?{ok:false,status:403,text:async()=>''}:{ok:true,status:200,json:async()=>table==='user_data'?[{kind:'streak',payload:{current:3}}]:{rows:[]},text:async()=>''};};
let bindings=0;const stop=sync.subscribeBinding(()=>bindings++);
sync.bindMember({email:'A@example.com',userId:'a'}); sync.bindMember({email:'a@example.com',userId:'a'});assert.equal(bindings,1);
const pulled=await sync.pullUserData();assert.equal(pulled.ok,true);assert.equal(pulled.data.streak.current,3);assert.deepEqual(pulled.data.results,[]);assert.equal(bindings,1,'status changes do not trigger rebinding');
fail=true;assert.equal((await sync.pullUserData()).ok,false,'HTTP errors are not interpreted as empty success');fail=false;calls=[];
const row=(key,n)=>({key,courseId:'tarih',title:'Test',correct:n,wrong:0,blank:0,total:1,net:n,durationSec:3,completedAt:'2026-01-01T00:00:00Z'});
assert.equal((await sync.syncUserTestChanges({old:row('old',1), unchanged:row('unchanged',1)}, {unchanged:row('unchanged',1),added:row('added',1)})).ok,true);
assert.equal(calls.filter(c=>c.init.method==='POST').length,1);assert.equal(JSON.parse(calls[0].init.body)[0].key,'added');assert.match(calls[1].query,/key=eq\.old/);assert.doesNotMatch(calls[1].query,/unchanged/);
calls=[];
assert.equal((await sync.syncUserTestChanges({}, {}, {pending:row('pending',1)})).ok,true);
assert.equal(calls.length,1);assert.match(calls[0].query,/key=eq\.pending/, 'a rapid undo deletes even an earlier pending insertion');
sync.bindMember(null);assert.equal(bindings,2);stop();
const app=readFileSync('lib/AppContext.tsx','utf8');
assert.match(app,/case STORAGE_KEYS\.STREAK:/);assert.match(app,/case STORAGE_KEYS\.FOCUS_TOTAL:/);assert.match(app,/personalCacheKey\(key, binding\)/);assert.doesNotMatch(app,/persistLocal\(STORAGE_KEYS\.RESULTS, map\)/);
assert.match(readFileSync('supabase/migrations/0009_personal_test_keys.sql','utf8'),/primary key \("memberEmail", "key"\)/i);
console.log('✓ Personal sync errors, binding notifications, scoped caches and incremental test changes');

// First-login readiness must wait for the matching account, report failures and
// never allow an old account's delayed completion to unblock a newer one.
const barrierBuild = await build({entryPoints:['lib/personalLoadBarrier.ts'],bundle:true,platform:'node',format:'cjs',write:false});
const bm = new Module(path.join(process.cwd(),'scripts/_barrier.cjs')); bm.filename=path.join(process.cwd(),'scripts/_barrier.cjs'); bm._compile(barrierBuild.outputFiles[0].text,bm.filename); const B=bm.exports;
const a={email:'a@example.com',userId:'a'}, b={email:'b@example.com',userId:'b'};
B.beginPersonalLoad(a); let done=false; const first=B.waitForPersonalLoad(a).then(v=>{done=true;return v});
await Promise.resolve(); assert.equal(done,false); B.finishPersonalLoad(a,true); assert.equal(await first,true);
B.beginPersonalLoad(a); const switched=B.waitForPersonalLoad(a); B.beginPersonalLoad(b); B.finishPersonalLoad(a,true); assert.equal(await switched,false);
const next=B.waitForPersonalLoad(b); B.finishPersonalLoad(b,false); assert.equal(await next,false);
B.beginPersonalLoad(b); assert.equal(await B.waitForPersonalLoad(b,5),false);
sync.bindMember({email:'missing@example.com',userId:null}); calls=[]; assert.equal((await sync.pullUserData()).ok,false); assert.equal(calls.length,0); sync.bindMember(null);
const membership=readFileSync('lib/MembershipContext.tsx','utf8');
assert.match(membership,/applyMember\(\{ \.\.\.doc, \.\.\.stamp, \.\.\.\(authUid/);
assert.doesNotMatch(membership,/applyMember\(patched\.ok/);
const auth=readFileSync('screens/AuthScreen.tsx','utf8');
assert.match(auth,/waitForPersonalLoad\(binding\)/); assert.match(auth,/refreshAllCourses\(true\)/); assert.match(auth,/invalidateLiveContent\(\)/);
console.log('✓ Login readiness, account switching, UID and authenticated content refresh');
