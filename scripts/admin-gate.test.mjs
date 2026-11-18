// Render the actual gate with stubbed app/navigation providers. Admin screens
// must not mount before the server-authorized gate has allowed access.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import Module from 'node:module';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const mocks = {
  'react-native': `import React from 'react'; export const Text = ({children}) => React.createElement('span', null, children);`,
  '@react-navigation/native': `export const useNavigation = () => ({ canGoBack: () => false, navigate() {} });`,
  '../../lib/theme': `export const useAppTheme = () => ({ colors: { text: '#000', textSecondary: '#555' } });`,
  '../../lib/AdminAccessContext': `export const useAdminAccess = () => ({status: globalThis.__gateStatus, refresh() {}});`,
  '../../lib/MembershipContext': `export const useMembership = () => ({signedIn: globalThis.__gateSignedIn});`,
  './ui': `import React from 'react'; export const AdminCard = ({children}) => React.createElement('div', null, children); export const AdminButton = ({label}) => React.createElement('button', null, label);`,
};
const result = await build({
  stdin: {
    contents: `import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server'; import { AdminGate } from './components/admin/AdminGate'; export const render = () => renderToStaticMarkup(React.createElement(AdminGate, null, React.createElement('b', null, 'ADMIN CONTENT')));`,
    resolveDir: process.cwd(), loader: 'tsx', sourcefile: 'gate-entry.tsx',
  },
  bundle: true, platform: 'node', format: 'cjs', write: false,
  plugins: [{ name: 'gate-shims', setup(build) {
    build.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'gate-mock' } : null);
    build.onLoad({ filter: /.*/, namespace: 'gate-mock' }, args => ({ contents: mocks[args.path], loader: 'jsx', resolveDir: process.cwd() }));
  } }],
});
const filename = path.join(process.cwd(), 'scripts', '_gate-test-bundle.cjs');
const mod = new Module(filename);
mod.filename = filename;
mod.paths = Module._nodeModulePaths(path.dirname(filename));
mod._compile(result.outputFiles[0].text, filename);
const render = mod.exports.render;
for (const status of ['denied', 'checking', 'error']) {
  for (const signedIn of [true, false]) {
    globalThis.__gateStatus = status; globalThis.__gateSignedIn = signedIn;
    assert.doesNotMatch(render(), /ADMIN CONTENT/, `${status}, signedIn=${signedIn} must not render admin content`);
  }
}
globalThis.__gateStatus = 'allowed'; globalThis.__gateSignedIn = true;
assert.match(render(), /ADMIN CONTENT/);
const app = readFileSync('App.tsx', 'utf8');
for (const name of ['Panel', 'Topics', 'Questions', 'Users', 'Tips', 'Courses', 'Settings', 'Membership']) {
  assert.match(app, new RegExp(`name="Admin${name}" component=\\{ProtectedAdmin${name}\\}`), `${name} is protected before mount`);
}
assert.doesNotMatch(app, /name="AdminLogin"/);
console.log('✓ Admin gate renders only for allowed access; all admin routes are protected');

// Profile no longer exposes manual cloud operations to any role.
const profileSource = readFileSync('screens/ProfileScreen.tsx', 'utf8');
assert.doesNotMatch(profileSource, /label="Bulut"|Deneme sayılarımı buluta yaz|Buluttaki haklarımı geri yükle|Üyelik belgesini yenile|Bu cihazı VIP göster|Buluttaki haklarımı oku/);
assert.doesNotMatch(profileSource, /syncUsageToCloud|restoreFromCloud|toggleVip/);
assert.match(profileSource, /<CloudStatusBanner compact \/>/);
console.log('✓ Manual profile cloud controls removed for all users');
