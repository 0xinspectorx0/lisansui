import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import Yoga from 'yoga-layout';
const source=readFileSync('screens/TipsScreen.tsx','utf8');
const styles=vm.runInNewContext(source.slice(source.indexOf('const styles = StyleSheet.create(')).replace('const styles = StyleSheet.create(', 'globalThis.styles = StyleSheet.create(')+'\n;globalThis.styles;', {StyleSheet:{create:x=>x}});
assert.match(source, /<View style=\{styles.headerText\}>/);
assert.equal(styles.headerText.flex,1); assert.equal(styles.headerText.minWidth,0); assert.equal(styles.filterRow.flexWrap,'wrap'); assert.equal(styles.modeSwitch.flexShrink,0);
for(const width of [280,320,360,375,390,430]) {
 const root=Yoga.Node.create(); root.setWidth(width);root.setFlexDirection(Yoga.FLEX_DIRECTION_ROW);root.setPadding(Yoga.EDGE_HORIZONTAL,styles.header.paddingHorizontal);root.setGap(Yoga.GUTTER_ALL,styles.header.gap);
 const text=Yoga.Node.create();text.setFlexGrow(1);text.setFlexShrink(1);text.setMinWidth(0);text.setMeasureFunc(w=>({width:Math.min(w,260),height:48}));root.insertChild(text,0);
 const buttons=Yoga.Node.create();buttons.setWidth(138);buttons.setHeight(40);buttons.setFlexShrink(0);root.insertChild(buttons,1);root.calculateLayout(undefined,undefined,Yoga.DIRECTION_LTR);
 assert.ok(buttons.getComputedLeft()+buttons.getComputedWidth()<=width-styles.header.paddingHorizontal,`buttons fit at ${width}px`);root.freeRecursive();
}
console.log('✓ Tips header and filter controls fit narrow phone widths');
