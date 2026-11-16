// Exercise the actual header flex styles with Yoga at narrow phone widths.
// Text dimensions are representative; real device/font rendering is separate.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import Yoga from 'yoga-layout';
const source = readFileSync('screens/HomeScreen.tsx','utf8');
const script = source.slice(source.indexOf('const HEADER_CONTROL_HEIGHT ='));
const { styles } = vm.runInNewContext(script.replace('const styles = StyleSheet.create(', 'globalThis.styles = StyleSheet.create(') + '\n;globalThis;', { StyleSheet:{create:x=>x} });
assert.equal(styles.iconBtn.height, 38);
assert.equal(styles.streakPill.height, styles.iconBtn.height);
assert.match(source, /accessibilityLabel=\{colors\.isDark \? 'Aydınlık moda geç' : 'Karanlık moda geç'\}/);
const directions={row:Yoga.FLEX_DIRECTION_ROW,column:Yoga.FLEX_DIRECTION_COLUMN};
const aligns={center:Yoga.ALIGN_CENTER};
const justifies={'space-between':Yoga.JUSTIFY_SPACE_BETWEEN,'flex-end':Yoga.JUSTIFY_FLEX_END};
function apply(n,s) {
  if(s.flexDirection) n.setFlexDirection(directions[s.flexDirection]);
  if(s.flexWrap==='wrap') n.setFlexWrap(Yoga.WRAP_WRAP);
  if(s.alignItems) n.setAlignItems(aligns[s.alignItems]);
  if(s.justifyContent) n.setJustifyContent(justifies[s.justifyContent]);
  if(s.gap!==undefined) n.setGap(Yoga.GUTTER_ALL,s.gap);
  if(s.flexGrow!==undefined) n.setFlexGrow(s.flexGrow);
  if(s.flexShrink!==undefined) n.setFlexShrink(s.flexShrink);
  if(s.minWidth!==undefined) n.setMinWidth(s.minWidth);
  if(s.maxWidth==='100%') n.setMaxWidthPercent(100);
  else if(s.maxWidth!==undefined) n.setMaxWidth(s.maxWidth);
}
for (const width of [280,320,360,375,390,430,768]) for(const vip of [false,true]) for(const admin of [false,true]) for(const streak of [false,true]) for(const longStreak of [false,true]) {
  const root=Yoga.Node.create(); root.setWidth(width - 36); apply(root,styles.header);
  const title=Yoga.Node.create();apply(title,styles.headerTitle);title.setMeasureFunc((w,mode)=>({width:mode===Yoga.MEASURE_MODE_UNDEFINED?180:Math.min(w,180),height:50}));root.insertChild(title,0);
  const right=Yoga.Node.create();apply(right,styles.headerRight);root.insertChild(right,1);
  let index=0; const add=(w,h)=>{const n=Yoga.Node.create();n.setWidth(w);n.setHeight(h);right.insertChild(n,index++);return n;};
  add(38,vip?59:38);
  let pill;
  if(streak) pill=add(longStreak ? styles.streakPill.maxWidth : 76,styles.streakPill.height);
  if(admin) add(38,styles.iconBtn.height);
  const theme=add(styles.iconBtn.width,styles.iconBtn.height);
  root.calculateLayout(undefined,undefined,Yoga.DIRECTION_LTR);
  const r=right.getComputedLayout(), t=theme.getComputedLayout();
  assert.ok(r.left+t.left>=-0.01 && r.left+t.left+t.width<=width-36+0.01, `theme exceeds ${width}px viewport (vip=${vip}, admin=${admin}, streak=${streak})`);
  if(pill) assert.equal(pill.getComputedHeight(),theme.getComputedHeight());
  root.freeRecursive();
}
console.log('✓ Header Yoga layout at 280–768px, VIP/admin/streak combinations, equal button height');
