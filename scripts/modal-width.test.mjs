import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import Module from 'node:module';
import path from 'node:path';

const mocks = {
  'react-native': `import React from 'react'; export const Platform={get OS(){return globalThis.__platform}}; export const useWindowDimensions=()=>({width:globalThis.__width,height:800}); export const View=({children,style})=>React.createElement('div',{'data-style':JSON.stringify(style)},children);`,
};
const bundle = await build({stdin:{contents:`import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {ModalFrame} from './components/ModalFrame'; export const render=()=>renderToStaticMarkup(React.createElement(ModalFrame,null,'content'));`,resolveDir:process.cwd(),loader:'jsx'},bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'mock',setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(mocks,a.path)?{path:a.path,namespace:'mock'}:null);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'jsx',resolveDir:process.cwd()}));}}]});
const filename=path.join(process.cwd(),'scripts/_modal-frame-test.cjs');const mod=new Module(filename);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));mod._compile(bundle.outputFiles[0].text,filename);
for (const platform of ['web','ios','android']) for (const width of [280,320,360,480,500,540,541,768,1440]) {
  globalThis.__platform=platform;globalThis.__width=width;
  const html=mod.exports.render();
  const attr=html.match(/data-style="([^"]*)"/)[1].replaceAll('&quot;','"');
  const style=JSON.parse(attr);
  assert.equal(style.width,'100%');assert.equal(style.flex,1);assert.equal(style.alignSelf,'center');
  if(platform==='web' && width>540) assert.equal(style.maxWidth,480,`${platform} ${width}`);
  else assert.equal(style.maxWidth,undefined,`${platform} ${width}`);
  assert.ok(html.includes('content'));
}
const files=['components/admin/ui.tsx','components/TopicTestSheet.tsx','screens/HomeScreen.tsx','screens/QuizScreen.tsx','screens/FocusStatsScreen.tsx'];
for(const file of files){
  const src=readFileSync(file,'utf8');
  const modals=[...src.matchAll(/<Modal\b[\s\S]*?<\/Modal>/g)];
  assert.ok(modals.length,file);
  for(const [markup] of modals){assert.match(markup,/<ModalFrame>/,`${file}: modal frame required`);assert.match(markup,/<\/ModalFrame>/);}
}
const app=readFileSync('App.tsx','utf8');assert.match(app,/width > APP_FRAME_BREAKPOINT/);assert.match(app,/maxWidth: APP_FRAME_MAX_WIDTH/);
const admin=readFileSync('components/admin/ui.tsx','utf8');
assert.match(admin,/flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 10/);
assert.match(admin,/flexWrap: 'wrap', gap: 8, marginTop: 16/);
assert.match(admin,/<ScrollView[\s\S]*?\{children\}[\s\S]*?<\/ScrollView>/);
console.log('✓ All modal surfaces share the app frame; web/native widths and narrow-screen footer wrapping covered');
