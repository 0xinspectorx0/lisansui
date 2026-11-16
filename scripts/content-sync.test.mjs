import assert from 'node:assert/strict';
import { build } from 'esbuild';
import Module from 'node:module';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const mocks = {
  './cloudApi': `export const readDocument = (...a) => globalThis.readDoc(...a); export const listDocuments = (...a) => globalThis.listDocs(...a);`,
  './adminStore': `export const applyAdminQuestions = (_c,_t,q) => [{id:'draft'}, ...q]; export const applyAdminTopics = (_c,t) => [{docId:'draft'}, ...t];`,
  './seedData': `export const FALLBACK_QUESTIONS = {tarih: []}; export const INITIAL_TOPIC_CATALOG = {tarih: []}; export const INITIAL_DAILY_TIPS = [];`,
  './textUtils': `export const cleanKpssText = x => x; export const cleanOptionText = x => x;`,
};
const bundle = await build({entryPoints:['lib/kpssApi.ts'],bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'mock',setup(b){
  b.onResolve({filter:/.*/}, a => Object.hasOwn(mocks,a.path) ? {path:a.path,namespace:'mock'} : null);
  b.onLoad({filter:/.*/,namespace:'mock'}, a => ({contents:mocks[a.path],loader:'js'}));
}}]});
const file = path.join(process.cwd(),'scripts/_sync_bundle.cjs');
const mod = new Module(file); mod.filename=file; mod.paths=Module._nodeModulePaths(path.dirname(file)); mod._compile(bundle.outputFiles[0].text,file);
const api=mod.exports;
const q = text => ({mapValue:{fields:{id:{stringValue:text},question:{stringValue:text},options:{arrayValue:{values:[{stringValue:'a'},{stringValue:'b'}]}}}}});
let value = [q('old')], reads=0;
globalThis.readDoc = async () => { reads++; return {ok:true,data:{questions:{arrayValue:{values:value}}}}; };
globalThis.listDocs = async () => ({ok:true,data:[{name:'courses/tarih/topics/a',fields:{name:{stringValue:'A'},questionCount:{integerValue:'3'}}}]});
assert.equal((await api.refreshCourseTopics('tarih'))[0].questionCount,3);
assert.equal((await api.fetchTopicQuestions('tarih','a'))[0].id,'old');
value=[q('new')]; assert.equal((await api.fetchTopicQuestions('tarih','a'))[0].id,'old');
api.invalidateLiveContent(); assert.equal((await api.fetchTopicQuestions('tarih','a'))[0].id,'new');
value=[]; api.invalidateLiveContent(); assert.deepEqual(await api.fetchTopicQuestions('tarih','a'),[]);
await api.fetchTopicQuestions('tarih','a'); assert.equal(reads,3,'empty responses are cached');
globalThis.listDocs=async()=>({ok:true,data:[]}); assert.deepEqual(await api.refreshCourseTopics('tarih'),[]);
// A response that started before invalidation must not repopulate the cache.
let resolve; let count=0; globalThis.readDoc=()=> ++count === 1 ? new Promise(r=>resolve=r) : Promise.resolve({ok:true,data:{questions:{arrayValue:{values:[q('latest')]}}}});
api.invalidateLiveContent(); const pending=api.fetchTopicQuestions('tarih','a'); api.invalidateLiveContent(); resolve({ok:true,data:{questions:{arrayValue:{values:[q('stale')]}}}});
assert.equal((await pending)[0].id,'latest');
// Hap bilgi reads distinguish an empty cloud list from an unavailable cloud.
globalThis.readDoc = async () => ({ok:true,data:{list:{arrayValue:{values:[{stringValue:'Yeni bilgi'}, {stringValue:'ABC'}]}}}});
assert.deepEqual(await api.fetchCloudDailyTips(), ['Yeni bilgi', 'ABC']);
globalThis.readDoc = async () => ({ok:true,data:null});
assert.deepEqual(await api.fetchCloudDailyTips(), []);
globalThis.readDoc = async () => ({ok:false,error:'offline'});
assert.equal(await api.fetchCloudDailyTips(), null);
const watch=readFileSync('lib/contentUpdates.ts','utf8');
assert.match(watch,/postgres_changes/); assert.match(watch,/table: 'tips'/); assert.match(watch,/30_000/); assert.match(watch,/state === 'active'/);
assert.match(readFileSync('supabase/migrations/0004_content_realtime.sql','utf8'),/alter publication supabase_realtime add table public\.topics/i);
assert.match(readFileSync('supabase/migrations/0005_tips_realtime.sql','utf8'),/alter publication supabase_realtime add table public\.tips/i);
console.log('✓ Content cache invalidation, race, empty results, counts and sync fallback');
