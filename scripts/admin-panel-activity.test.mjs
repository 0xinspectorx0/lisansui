import assert from 'node:assert/strict';
import { build } from 'esbuild';
import Module from 'node:module';
import path from 'node:path';

const mocks={
  'react-native': `import React from 'react'; const el=tag=>({children})=>React.createElement(tag,null,children); export const View=el('div'),Text=el('span'),Pressable=el('button'); export const StyleSheet={create:s=>s,hairlineWidth:1};`,
  '@react-navigation/native': `export const useNavigation=()=>({navigate(){}});`,
  '@expo/vector-icons/Ionicons': `import React from 'react'; export default ()=>React.createElement('i');`,
  '../lib/theme': `export const useAppTheme=()=>({colors:{}});`,
  '../lib/AppContext': `export const useApp=()=>({catalog:{},refreshAllCourses:async()=>{}});`,
  '../lib/AdminContext': `export const useAdmin=()=>({users:[],activity:globalThis.__activity,overrides:{},isVip:false,localUser:{id:'1',role:'admin'},announcement:{enabled:false},maintenanceActive:false,tips:[],courseOrder:[],hiddenCourses:[]});`,
  '../lib/adminStore': `export const ALL_COURSE_IDS=[];`,
  '../components/admin/AdminGate': `import React from 'react'; export const AdminGate=({children})=>React.createElement('div',null,children);`,
  '../components/admin/ui': `import React from 'react'; const box=({children})=>React.createElement('div',null,children); export const AdminCard=box,AdminScaffold=box,AdminChip=()=>null,AdminConfirm=()=>null,AdminSectionTitle=()=>null; export const AdminRow=({title})=>React.createElement('p',null,title); export const AdminButton=({label,onPress})=>{ if(label.startsWith('Son işlemler')) globalThis.__open=onPress;return React.createElement('button',null,label); }; export const AdminSheet=({visible,onClose,children})=>{globalThis.__close=onClose;return visible?React.createElement('section',null,children):null;};`,
};
const result=await build({stdin:{contents:`import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {AdminPanelScreen} from './screens/AdminPanelScreen'; export const render=()=>{globalThis.__hook=0;return renderToStaticMarkup(React.createElement(AdminPanelScreen));};`,resolveDir:process.cwd(),loader:'jsx'},bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'mock',setup(b){
 b.onResolve({filter:/^react$/},a=>a.importer.endsWith('AdminPanelScreen.tsx')?{path:'react-fake',namespace:'mock'}:null);
 b.onResolve({filter:/.*/},a=>Object.hasOwn(mocks,a.path)?{path:a.path,namespace:'mock'}:null);
 b.onLoad({filter:/react-fake/,namespace:'mock'},()=>({contents:`import * as R from 'react'; export default R; export const useMemo=R.useMemo; export const useState=initial=>{const i=globalThis.__hook++; if(!(i in globalThis.__states))globalThis.__states[i]=initial; return [globalThis.__states[i],v=>{globalThis.__states[i]=v}];};`,loader:'js',resolveDir:process.cwd()}));
 b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'jsx',resolveDir:process.cwd()}));
}}]});
const file=path.join(process.cwd(),'scripts/_panel.cjs');const mod=new Module(file);mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file));mod._compile(result.outputFiles[0].text,file);
globalThis.__states=[];globalThis.__activity=Array.from({length:12},(_,i)=>({id:String(i),label:`Kayıt ${i}`,at:'2026-01-01',icon:'time'}));
let html=mod.exports.render();assert.doesNotMatch(html,/Bu cihazın ilerlemesi|Kayıt 0/);assert.match(html,/Son işlemler \(12\)/);globalThis.__open();
html=mod.exports.render();assert.match(html,/<section>/);assert.match(html,/Kayıt 0/);assert.match(html,/Kayıt 11/,'all retained records are displayed');globalThis.__close();assert.doesNotMatch(mod.exports.render(),/Kayıt 0/);
globalThis.__activity=[];globalThis.__open();assert.match(mod.exports.render(),/Henüz işlem kaydı yok/);
console.log('✓ Admin activity button opens/closes retained records and handles empty history; device progress removed');
