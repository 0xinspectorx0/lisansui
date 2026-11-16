import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import Module from 'node:module';
import path from 'node:path';

const mocks = {
  'react-native': `import React from 'react'; export const View=({children})=>React.createElement('div',null,children); export const StyleSheet={create:s=>s};`,
  '@expo/vector-icons/Ionicons': `import React from 'react'; export default ({name})=>React.createElement('i',{'data-icon':name});`,
  '@expo/vector-icons/MaterialCommunityIcons': `import React from 'react'; export default ({name})=>React.createElement('i',{'data-icon':name});`,
  '../lib/theme': `export const useAppTheme=()=>({colors:{warning:'#f00'}});`,
};
const result=await build({stdin:{contents:`import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {ProfileIcon} from './components/ProfileButton'; export const render=(signedIn,isVip)=>renderToStaticMarkup(React.createElement(ProfileIcon,{signedIn,isVip,color:'#aaa'}));`,resolveDir:process.cwd(),loader:'jsx'},bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'mock',setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(mocks,a.path)?{path:a.path,namespace:'mock'}:null);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'jsx',resolveDir:process.cwd()}));}}]});
const file=path.join(process.cwd(),'scripts/_profile_badge.cjs');const mod=new Module(file);mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file));mod._compile(result.outputFiles[0].text,file);
assert.match(mod.exports.render(true,true),/data-icon="crown"/);
assert.match(mod.exports.render(true,true),/data-icon="person"/);
assert.doesNotMatch(mod.exports.render(true,false),/data-icon="crown"/);
assert.match(mod.exports.render(false,false),/data-icon="person-add-outline"/);
const app=readFileSync('App.tsx','utf8');
assert.ok(app.indexOf('name="ProfileTab"') > app.indexOf('name="FocusStatsTab"'), 'profile is the rightmost tab');
assert.match(app,/event\.preventDefault\(\)/);
assert.match(app,/membership\.signedIn\) parent\?\.navigate\('Profile'\)/);
assert.match(app,/else parent\?\.navigate\('Auth'\)/);
assert.match(app,/tabBarAccessibilityLabel/);
assert.doesNotMatch(readFileSync('screens/HomeScreen.tsx','utf8'), /<ProfileButton/);
console.log('✓ Rightmost profile tab, VIP crown, guest and signed-in navigation');
