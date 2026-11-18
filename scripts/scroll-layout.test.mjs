// Structural regression tests for every navigable screen plus real rendering of
// both account states and both paywall states. Native gestures require a device.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import Module from 'node:module';
import path from 'node:path';

const src = name => readFileSync(name, 'utf8');
const routeFiles = {
  HomeScreen: 'ScrollView', TipsScreen: 'ScrollView', ReviewScreen: 'FlatList',
  FocusStatsScreen: 'ScrollView', CourseTopicsScreen: 'FlatList', QuizScreen: 'ScrollView',
  QuizResultScreen: 'ScrollView', AuthScreen: 'ScrollView', ProfileScreen: 'ScrollView',
  MembershipPaywallScreen: 'ScrollView', AdminPanelScreen: 'AdminScaffold',
  AdminTopicsScreen: 'AdminScaffold', AdminQuestionsScreen: 'AdminScaffold',
  AdminUsersScreen: 'AdminScaffold', AdminTipsScreen: 'AdminScaffold',
  AdminCoursesScreen: 'AdminScaffold', AdminSettingsScreen: 'AdminScaffold',
  AdminMembershipScreen: 'AdminScaffold', SqlDeliveryScreen: 'ScrollView',
};
const app = src('App.tsx');
for (const [name, container] of Object.entries(routeFiles)) {
  assert.match(app, new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from`), `${name} is included in route audit`);
  assert.match(src(`screens/${name}.tsx`), new RegExp(`<${container}\\b`), `${name} has a scrollable content path`);
}
assert.match(src('components/admin/ui.tsx'), /scroll = true/);
assert.match(src('screens/AdminMembershipScreen.tsx'), /<AdminScaffold\s+scroll=\{false\}/, 'member screen avoids nested vertical scrolls');
assert.match(src('screens/TipsScreen.tsx'), /<ScrollView style=\{styles.deckScroll\}/, 'card mode supports long content');
assert.match(src('components/admin/VipGate.tsx'), /<ScrollView/, 'VIP lock supports small screens');
assert.doesNotMatch(Object.keys(routeFiles).map(n => src(`screens/${n}.tsx`)).join('\n'), /scrollEnabled=\{false\}|onMoveShouldSetResponder|onStartShouldSetResponderCapture|touchAction:\s*['"]none['"]/, 'screens must not suppress scroll gestures');

const mock = {
  'react-native': `import React from 'react'; const el = tag => ({children,...p}) => React.createElement(tag, {}, children); export const View=el('div'), Text=el('span'), Pressable=el('button'), ScrollView=el('section'); export const StyleSheet={create: s=>s};`,
  'react-native-safe-area-context': `import React from 'react'; export const SafeAreaView=({children})=>React.createElement('main',null,children);`,
  '@expo/vector-icons/Ionicons': `import React from 'react'; export default ()=>React.createElement('i');`,
  '@react-navigation/native': `export const useNavigation=()=>({canGoBack:()=>false,navigate(){}});`,
  '../lib/theme': `export const useAppTheme=()=>({colors:{}}); export const COURSES={tarih:{title:'Tarih'}};`,
  '../lib/AppContext': `export const useApp=()=>({catalog:{tarih:[]},settings:{dailyGoal:10},updateSettings(){}});`,
  '../lib/AdminAccessContext': `export const useAdminAccess=()=>({allowed:false});`,
  '../lib/AdminContext': `export const useAdmin=()=>({localUser:{id:'1'}, state:{content:{courseOrder:['tarih']}}});`,
  '../lib/MembershipContext': `export const useMembership=()=>globalThis.__scrollMembership;`,
  '../lib/membership': `export const PLAN_LABEL={}; export const STATUS_LABEL={active:'Aktif'}; export const daysLeft=()=>null;`,
  '../components/admin/ui': `import React from 'react'; export const AdminButton=({label})=>React.createElement('button',null,label), AdminCard=({children})=>React.createElement('article',null,children), AdminChip=()=>null, AdminConfirm=()=>null, AdminField=()=>null, AdminRow=({title})=>React.createElement('div',null,title), AdminSectionTitle=({label})=>React.createElement('h2',null,label), AdminSheet=()=>null;`,
  '../components/membership/ui': `import React from 'react'; export const CloudStatusBanner=()=>React.createElement('p',null,'cloud'); export const MembershipCta=()=>React.createElement('p',null,'membership'); export const QuotaList=()=>React.createElement('p',null,'quota');`,
};
const compiled = await build({stdin:{contents:`import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {ProfileScreen} from './screens/ProfileScreen'; import {MembershipPaywallScreen} from './screens/MembershipPaywallScreen'; export const render=(name)=>renderToStaticMarkup(React.createElement(name==='profile'?ProfileScreen:MembershipPaywallScreen));`, resolveDir:process.cwd(),loader:'jsx'},bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'mock',setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(mock,a.path)?{path:a.path,namespace:'mock'}:null);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mock[a.path],loader:'jsx',resolveDir:process.cwd()}));}}]});
const filename=path.join(process.cwd(),'scripts/_scroll_bundle.cjs'); const mod=new Module(filename); mod.filename=filename; mod.paths=Module._nodeModulePaths(path.dirname(filename)); mod._compile(compiled.outputFiles[0].text,filename);
const base={quota:{isVip:false,enforced:false,freeTestsPerCourse:1}, usedFor:()=>0, signedIn:false,isVip:false,member:null};
for (const [name, member, vip, expected] of [
  ['profile',null,false,'Giriş yapılmamış'],
  ['profile',{id:'1',displayName:'Deniz',email:'x',status:'active',role:'user',courseUsage:{}},false,'Hesabımı sil'],
  ['paywall',null,false,'Planlar'],
  ['paywall',{id:'1',vipPlan:'yearly'},true,'VIP üyelik aktif'],
]) {
  globalThis.__scrollMembership={...base,member,signedIn:!!member,isVip:vip};
  const html=mod.exports.render(name);
  assert.match(html,/<section>/,`${name} has a scroll container`);
  assert.ok(html.indexOf(expected)>html.indexOf('<section>') && html.indexOf(expected)<html.indexOf('</section>'),`${name}: ${expected} is inside the scroll container`);
}
console.log(`✓ ${Object.keys(routeFiles).length} screen scroll paths audited; guest/member profile and VIP paywall states rendered`);

// The shell stays viewport-sized while content grows; the screen heading and
// navigation remain outside the one vertical scroll area (no gesture trap).
assert.match(app, /Platform\.OS === 'web' && \{ height \}/);
assert.match(app, /outerRoot:\s*\{[^}]*minHeight:\s*0[^}]*overflow:\s*'hidden'/);
const home = src('screens/HomeScreen.tsx');
assert.ok(home.indexOf('<View style={styles.header}>') < home.indexOf('<ScrollView\n        style={styles.contentWindow}'));
assert.match(home, /contentWindow:\s*\{\s*flex:\s*1,\s*minHeight:\s*0/);
const adminShell = src('components/admin/ui.tsx');
assert.match(adminShell, /<ScrollView\s+style=\{\{ flex: 1, minHeight: 0 \}\}/);
const resultScreen = src('screens/QuizResultScreen.tsx');
assert.ok(resultScreen.indexOf('>Test Sonucu</Text>') < resultScreen.indexOf('<ScrollView'));
const Yoga = (await import('yoga-layout')).default;
for (const height of [480, 640, 800]) for (const contentHeight of [100, 5000]) {
  const root = Yoga.Node.create(); root.setWidth(360); root.setHeight(height); root.setFlexDirection(Yoga.FLEX_DIRECTION_COLUMN);
  const header = Yoga.Node.create(); header.setHeight(60); header.setFlexShrink(0); root.insertChild(header,0);
  const window = Yoga.Node.create(); window.setFlexGrow(1); window.setFlexShrink(1); window.setMinHeight(0); window.setOverflow(Yoga.OVERFLOW_SCROLL); root.insertChild(window,1);
  const content = Yoga.Node.create(); content.setHeight(contentHeight); window.insertChild(content,0);
  const tabs = Yoga.Node.create(); tabs.setHeight(64); tabs.setFlexShrink(0); root.insertChild(tabs,2);
  root.calculateLayout(undefined,undefined,Yoga.DIRECTION_LTR);
  assert.equal(root.getComputedHeight(),height);
  assert.equal(window.getComputedHeight(),height-124);
  assert.equal(tabs.getComputedTop(),height-64);
  root.freeRecursive();
}
console.log('✓ Viewport-bounded content windows keep header and navigation fixed for long lists');
