import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import Module from 'node:module';
import path from 'node:path';

const mocks = {
  'react-native': `import React from 'react'; export const View=({children})=>React.createElement('div',null,children); export const Text=({children})=>React.createElement('span',null,children); export const Pressable=({children,onPress,accessibilityLabel})=>{globalThis.__profilePress=onPress; return React.createElement('button',{'aria-label':accessibilityLabel},children)}; export const StyleSheet={create:s=>s};`,
  '@expo/vector-icons/Ionicons': `import React from 'react'; export default ({name})=>React.createElement('i',{'data-icon':name});`,
  '@expo/vector-icons/MaterialCommunityIcons': `import React from 'react'; export default ({name})=>React.createElement('i',{'data-icon':name});`,
  '../lib/theme': `export const useAppTheme=()=>({colors:{warning:'#f00'}});`,
};
const result=await build({stdin:{contents:`import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {ProfileButton} from './components/ProfileButton'; export const render=(signedIn,isVip,onPress)=>renderToStaticMarkup(React.createElement(ProfileButton,{signedIn,isVip,onPress}));`,resolveDir:process.cwd(),loader:'jsx'},bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'mock',setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(mocks,a.path)?{path:a.path,namespace:'mock'}:null);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'jsx',resolveDir:process.cwd()}));}}]});
const file=path.join(process.cwd(),'scripts/_profile_badge.cjs');const mod=new Module(file);mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file));mod._compile(result.outputFiles[0].text,file);
let calls=0; const press=()=>calls++;
const vip=mod.exports.render(true,true,press);
assert.match(vip,/data-icon="crown"/); assert.match(vip,/>VIP<\/span>/); assert.match(vip,/aria-label="Hesabım, VIP üye"/); assert.match(vip,/data-icon="person"/);
globalThis.__profilePress();assert.equal(calls,1);
for (const signedIn of [true,false]) {const html=mod.exports.render(signedIn,false,press);assert.doesNotMatch(html,/data-icon="crown"|>VIP<\/span>/);assert.match(html,signedIn?/aria-label="Hesabım"/:/aria-label="Giriş yap"/);}
const home=readFileSync('screens/HomeScreen.tsx','utf8');
assert.match(home,/isVip=\{membership\.isVip\}/);assert.match(home,/stackNav\.navigate\(membership\.signedIn \? 'Profile' : 'Auth'\)/);assert.doesNotMatch(home,/<VipBadge\s*\/>/);
console.log('✓ VIP crown and label, non-VIP states, accessible profile control and navigation');
