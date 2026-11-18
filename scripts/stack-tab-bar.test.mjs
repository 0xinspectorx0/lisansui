import assert from 'node:assert/strict';
import { build } from 'esbuild';
import Module from 'node:module';
import path from 'node:path';
import { readFileSync } from 'node:fs';
const mocks={
 'react-native': `import React from 'react'; export const View=({children})=>React.createElement('div',null,children),Text=({children})=>React.createElement('span',null,children),Pressable=({children,onPress,accessibilityLabel,accessibilityState})=>{globalThis.__buttons[accessibilityLabel]=onPress;return React.createElement('button',{'aria-label':accessibilityLabel,'aria-selected':accessibilityState.selected},children)};export const StyleSheet={create:s=>s};`,
 '@expo/vector-icons/Ionicons': `import React from 'react';export default ({name})=>React.createElement('i',{'data-icon':name});`,
 'react-native-safe-area-context': `export const useSafeAreaInsets=()=>({bottom:20});`,
 '../lib/theme': `export const useAppTheme=()=>({colors:{surface:'#fff',border:'#aaa',primary:'#00f',textMuted:'#777',danger:'#f00'}});`,
 '../lib/AppContext': `export const useApp=()=>({mistakes:[1,2,3]});`,
 '../lib/MembershipContext': `export const useMembership=()=>globalThis.__member;`,
 './ProfileButton': `import React from 'react';export const ProfileIcon=({isVip})=>React.createElement('i',{'data-vip':String(isVip)});`,
};
const bundle=await build({stdin:{contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {StackTabBar} from './components/StackTabBar';export const render=(route,fn)=>renderToStaticMarkup(React.createElement(StackTabBar,{routeName:route,onSelect:fn}));`,resolveDir:process.cwd(),loader:'jsx'},bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'mocks',setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(mocks,a.path)?{path:a.path,namespace:'mock'}:null);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'jsx',resolveDir:process.cwd()}));}}]});
const file=path.join(process.cwd(),'scripts/_stacktabs.cjs');const mod=new Module(file);mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file));mod._compile(bundle.outputFiles[0].text,file);
for(const route of ['CourseTopics','Quiz','QuizResult','Auth','Profile','AdminPanel','AdminSettings','MembershipPaywall']) for(const member of [{signedIn:false,isVip:false},{signedIn:true,isVip:true}]) {
 globalThis.__buttons={};globalThis.__member=member;let selected='';const html=mod.exports.render(route,x=>selected=x);
 for(const label of ['Çalış','Hap Bilgi','Tekrarım','Odak & Net',member.signedIn?'Hesabım, VIP üye':'Giriş yap']) assert.ok(globalThis.__buttons[label],`${route}: ${label}`);
 globalThis.__buttons['Hap Bilgi']();assert.equal(selected,'TipsTab');globalThis.__buttons[member.signedIn?'Hesabım, VIP üye':'Giriş yap']();assert.equal(selected,'ProfileTab');assert.match(html,/>3<\/span>/);
}
const app=readFileSync('App.tsx','utf8');
assert.match(app,/rootRoute !== 'MainTabs' && <StackTabBar/);
assert.match(app,/StackActions\.popTo\('MainTabs', \{ screen: tab \}\)/);
assert.match(app,/rootRoute !== 'Quiz'/);assert.match(app,/window\.confirm\(message\)/);assert.match(app,/Alert\.alert\('Testten ayrıl'/);assert.match(app,/StackActions\.replace\(destination\)/);
assert.match(app,/onReady=\{updateRootRoute\} onStateChange=\{updateRootRoute\}/);
console.log('✓ Five accessible bottom actions on stack pages; quiz exit is confirmed');
