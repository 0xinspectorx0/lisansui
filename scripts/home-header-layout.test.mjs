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
assert.equal(styles.streakPill.width, 64);
assert.equal(styles.header.flexWrap, 'nowrap');
assert.equal(styles.headerRight.flexWrap, 'nowrap');
const profileSource = readFileSync('components/ProfileButton.tsx', 'utf8');
const profileStyles = vm.runInNewContext(profileSource.slice(profileSource.indexOf('const styles = StyleSheet.create(')).replace('const styles = StyleSheet.create(', 'globalThis.styles = StyleSheet.create(') + '\n;globalThis.styles;', { StyleSheet:{create:x=>x} });
assert.equal(profileStyles.control.height, styles.iconBtn.height);
assert.equal(profileStyles.control.width, 41.8);
assert.ok(Math.abs(profileStyles.avatar.width - 38 * 1.1) < 0.001);
assert.ok(Math.abs(profileStyles.avatar.height - 38 * 1.1) < 0.001);
assert.ok(Math.abs(profileStyles.vipAvatar.width - 25 * 1.1) < 0.001);
assert.ok(Math.abs(profileStyles.vipAvatar.height - 25 * 1.1) < 0.001);
assert.equal(profileStyles.vipAvatar.top + profileStyles.crown.top, 0, 'crown stays within the control bounds');
assert.equal(profileStyles.vipLabel.bottom, 0);
assert.match(source, /accessibilityLabel=\{colors\.isDark \? 'Aydınlık moda geç' : 'Karanlık moda geç'\}/);
const directions={row:Yoga.FLEX_DIRECTION_ROW,column:Yoga.FLEX_DIRECTION_COLUMN};
const aligns={center:Yoga.ALIGN_CENTER};
const justifies={'space-between':Yoga.JUSTIFY_SPACE_BETWEEN,'flex-end':Yoga.JUSTIFY_FLEX_END};
function apply(n,s) {
  if(s.flexDirection) n.setFlexDirection(directions[s.flexDirection]);
  if(s.flexWrap==='wrap') n.setFlexWrap(Yoga.WRAP_WRAP);
  if(s.flexWrap==='nowrap') n.setFlexWrap(Yoga.WRAP_NO_WRAP);
  if(s.alignItems) n.setAlignItems(aligns[s.alignItems]);
  if(s.justifyContent) n.setJustifyContent(justifies[s.justifyContent]);
  if(s.gap!==undefined) n.setGap(Yoga.GUTTER_ALL,s.gap);
  if(s.flexGrow!==undefined) n.setFlexGrow(s.flexGrow);
  if(s.flexShrink!==undefined) n.setFlexShrink(s.flexShrink);
  if(s.minWidth!==undefined) n.setMinWidth(s.minWidth);
  if(s.maxWidth==='100%') n.setMaxWidthPercent(100);
  else if(s.maxWidth!==undefined) n.setMaxWidth(s.maxWidth);
}
for (const width of [280,320,360,375,390,430,768]) for(const vip of [false,true]) for(const admin of [false,true]) for(const streak of [false,true]) {
  const root=Yoga.Node.create(); root.setWidth(width - 36); apply(root,styles.header);
  const title=Yoga.Node.create();apply(title,styles.headerTitle);title.setMeasureFunc((w,mode)=>({width:mode===Yoga.MEASURE_MODE_UNDEFINED?180:Math.min(w,180),height:50}));root.insertChild(title,0);
  const right=Yoga.Node.create();apply(right,styles.headerRight);root.insertChild(right,1);
  let index=0; const add=(w,h)=>{const n=Yoga.Node.create();n.setWidth(w);n.setHeight(h);right.insertChild(n,index++);return n;};
  const profile = add(profileStyles.control.width, profileStyles.control.height);
  let pill;
  if(streak) pill=add(styles.streakPill.width,styles.streakPill.height);
  if(admin) add(38,styles.iconBtn.height);
  const theme=add(styles.iconBtn.width,styles.iconBtn.height);
  root.calculateLayout(undefined,undefined,Yoga.DIRECTION_LTR);
  const r=right.getComputedLayout(), t=theme.getComputedLayout();
  assert.ok(r.left+t.left>=-0.01 && r.left+t.left+t.width<=width-36+0.01, `theme exceeds ${width}px viewport (vip=${vip}, admin=${admin}, streak=${streak})`);
  assert.equal(profile.getComputedTop(), theme.getComputedTop(), 'profile and theme stay on the same line');
  if(pill) {
    assert.equal(pill.getComputedHeight(),theme.getComputedHeight());
    assert.equal(pill.getComputedTop(), theme.getComputedTop(), 'streak and theme stay on the same line');
  }
  assert.equal(r.top + r.height / 2, title.getComputedTop() + title.getComputedHeight() / 2, 'header controls stay beside the title');
  root.freeRecursive();
}
console.log('✓ Single-row header Yoga layout at 280–768px, VIP/admin/streak combinations, equal button height');
