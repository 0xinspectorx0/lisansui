/**
 * Sözleşme testlerinin sahte Supabase'i (ağ YOK).
 * ==========================================================================
 * İki yüzeyi taklit eder:
 *   • GoTrue        → /auth/v1/signup | token | user | recover | logout | health
 *   • PostgREST/RPC  → /rest/v1/rpc/kpss_*  ve /rest/v1/<tablo> (user_data)
 *
 * Guard mantığı `supabase/migrations/0001_init.sql` içindeki bekçi fonksiyonların
 * ANLAMDAŞ taklididir (imzalar aynı: kendi belgen / yönetici / kilit / onay).
 * Buradaki amaç veritabanını doğrulamak değil — UYGULAMANın o anlamlara nasıl
 * tepki verdiğini ölçmek (red → mesaj, ret → yerel kopya BIRAKMA, onay → rol, …).
 * SQL'in kendisi metin olarak ayrıca denetleniyor (db-contract.test.mjs [RLS] bloğu).
 */

export const REF = 'kpssdemo';
export const URL0 = `https://${REF}.supabase.co`;

const b64url = o => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
let tokenSeq = 0;
export function makeToken(payload) {
  tokenSeq += 1;
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ iat: Date.now(), seq: tokenSeq, ...payload })}.sig${tokenSeq}`;
}

const MEMBER_KEYS = [
  'id','email','emailNormalized','displayName','verifier','salt','iterations','algo','authUid','role','status',
  'vip','vipPlan','vipExpiresAt','createdAt','lastLoginAt','city','exam','note','testsCompleted','questionsSolved',
  'netSum','courseUsage','schemaVersion',
];
const MEMBER_PATCH_KEYS = MEMBER_KEYS.filter(k => !['id','email','createdAt','verifier','salt','iterations','algo'].includes(k));
const TOPIC_KEYS = ['id','name','courseId','order','questionCount','questions','updatedAt','schemaVersion'];
const COURSE_KEYS = ['id','title','icon','order','hidden','updatedAt','schemaVersion'];
const TIPS_KEYS = ['list','updatedAt','schemaVersion'];
const POLICY_KEYS = ['enforce','freeTestsPerCourse','cloudVip','cloudMembers','defaultTrialDays','requireApproval','registrationOpen','updatedAt','schemaVersion'];

const lower = v => String(v || '').toLowerCase().trim();

export function createFakeSupabase(opts = {}) {
  const db = {
    members: new Map(), // email -> satır
    courses: new Map(),
    topics: new Map(), // `${courseId}/${docId}` -> {meta, questions:[]}
    tips: [],
    userData: new Map(), // `${userId}|${kind}` -> satır
    userTests: new Map(), // key -> satır
    admins: new Set(opts.admins || []),
    policy: {
      id: 1,
      enforce: true,
      freeTestsPerCourse: 1,
      cloudVip: true,
      cloudMembers: true,
      // membership_policy varsayılanlarıyla aynı (SQL: default 7)
      defaultTrialDays: 7,
      requireApproval: opts.requireApproval !== false,
      registrationOpen: true,
      updatedAt: '',
      schemaVersion: 1,
    },
    lockdownMembership: !!opts.membershipLockdown,
    lockdownContent: !!opts.contentLock,
  };
  const users = new Map(); // email -> { id, password }
  let uidSeq = 0;
  /** Oturum: { sub, email } — Authorization başlığından çözülür. */
  let session = null;
  const log = [];
  /** Yanıt üzerinden oynama kancası: fn(url, body) → {status, body} | null */
  let inject = null;

  const json = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
    json: async () => body,
  });
  const deny = (message = 'row-level security') => json(403, { code: '42501', message, details: '', hint: '' });
  const notFound = () => json(404, { code: 'PGRST116', message: 'NOT_FOUND' });

  function authFrom(init) {
    const h = init?.headers || {};
    const bearer = String(h.Authorization || h.authorization || '');
    const m = bearer.match(/^Bearer\s+(.+)$/i);
    if (!m) return null;
    try {
      const payload = JSON.parse(Buffer.from(m[1].split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
      if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) return { expired: true, ...payload };
      return payload;
    } catch {
      return null;
    }
  }
  const emailOf = () => (session ? lower(session.email) : null);
  const isAdmin = () => !!session && db.admins.has(lower(session.email));
  /** kpss_signed_in(): oturum var mı (anon değil). */
  const signedIn = () => !!session && !session.expired;

  /* ------------------------------------------------------------------ Auth */

  function handleAuth(path, init, body) {
    if (path.startsWith('/auth/v1/health')) return json(200, { name: 'GoTrue', version: 'fake' });
    if (path.startsWith('/auth/v1/signup')) {
      const email = lower(body.email);
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return json(400, { code: 400, msg: 'Email address is invalid' });
      if ((body.password || '').length < 6) return json(400, { code: 400, msg: 'Password should be at least 6 characters' });
      if (users.has(email)) return json(400, { code: 400, error_code: 'user_already_registered', msg: 'User already registered' });
      const id = `00000000-0000-4000-8000-0000000000${String(++uidSeq).padStart(2, '0')}`;
      // token claims'i e-postayı TAŞIMALI: geçit oturumu JWT'den okuyor
      users.set(email, { id, email, password: body.password });
      const token = makeToken({ sub: id, email, role: 'authenticated', iss: URL0, exp: Math.floor(Date.now() / 1000) + 3600 });
      return json(200, { access_token: token, refresh_token: `rt-${id}`, expires_in: 3600, token_type: 'bearer', user: { id, email } });
    }
    if (path.startsWith('/auth/v1/token')) {
      const q = new URL(path, URL0).searchParams;
      if (q.get('grant_type') === 'refresh_token') {
        const user = [...users.values()].find(u => `rt-${u.id}` === body.refresh_token);
        if (!user) return json(400, { code: 400, msg: 'Invalid Refresh Token' });
        const token = makeToken({ sub: user.id, email: user.email, role: 'authenticated', iss: URL0, exp: Math.floor(Date.now() / 1000) + 3600 });
        return json(200, { access_token: token, refresh_token: `rt-${user.id}`, expires_in: 3600, user: { id: user.id, email: user.email } });
      }
      const email = lower(body.email);
      const user = users.get(email);
      if (!user) return json(400, { code: 400, msg: 'Invalid login credentials' });
      if (body.password !== undefined && user.password !== body.password)
        return json(400, { code: 400, msg: 'Invalid login credentials' });
      const token = makeToken({ sub: user.id, email: user.email, role: 'authenticated', iss: URL0, exp: Math.floor(Date.now() / 1000) + 3600 });
      return json(200, { access_token: token, refresh_token: `rt-${user.id}`, expires_in: 3600, user: { id: user.id, email: user.email } });
    }
    if (path.startsWith('/auth/v1/recover')) {
      if (!users.has(lower(body.email))) return json(400, { code: 400, msg: 'Email not found' });
      return json(200, { id: body.email });
    }
    if (path.startsWith('/auth/v1/user')) {
      const a = authFrom(init);
      if (!a || a.expired) return json(401, { code: 401, msg: 'invalid JWT' });
      const user = users.get(lower(a.email));
      if (!user) return json(401, { code: 401, msg: 'Web JWT has invalid audience' });
      if ((init?.method || 'GET').toUpperCase() === 'PUT') {
        if ((body.password || '').length < 6) return json(400, { code: 400, msg: 'Password should be at least 6 characters' });
        user.password = body.password;
        return json(200, { id: user.id, email: user.email });
      }
      return json(200, { id: user.id, email: user.email, app_metadata: {}, user_metadata: {} });
    }
    if (path.startsWith('/auth/v1/logout')) return json(204, undefined);
    return json(404, { code: 404, msg: `unhandled auth path ${path}` });
  }

  /* ------------------------------------------------------------ belge yolu */

  function docKind(p) {
    if (/^memberships\/[^/]+$/.test(p)) return 'member';
    if (/^courses\/[^/]+$/.test(p)) return 'course';
    if (/^courses\/[^/]+\/topics\/[^/]+$/.test(p)) return 'topic';
    if (p === 'daily_tips/main') return 'tips';
    if (p === 'meta/membership_policy') return 'policy';
    if (p === 'meta/admins') return 'admins';
    if (p === 'meta/membership_lockdown') return 'lockMembership';
    if (p === 'meta/content_lock') return 'lockContent';
    return null;
  }
  const docName = p => p.split('/').pop();

  function readMemberRow(emailKey) {
    const row = db.members.get(emailKey);
    if (!row) return null;
    return { ...row };
  }

  function readDoc(p) {
    const kind = docKind(p);
    if (!kind) return json(200, { status: 400, error: 'unknown document path' });
    if (kind === 'member') {
      // RLS: ya kendi satırın ya yöneticisin — üyelik satırları herkese açık okunmaz.
      const who = lower(docName(p));
      if (!(signedIn() && (emailOf() === who || isAdmin()))) return deny('member documents are not publicly readable');
      const row = readMemberRow(who);
      if (!row) return json(200, { status: 404, error: 'NOT_FOUND' });
      return json(200, { status: 200, name: p, fields: row });
    }
    if (kind === 'course') {
      const row = db.courses.get(docName(p));
      if (!row) return json(200, { status: 404, error: 'NOT_FOUND' });
      return json(200, { status: 200, name: p, fields: row });
    }
    if (kind === 'topic') {
      const [, courseId, , docId] = p.split('/');
      const row = db.topics.get(`${courseId}/${docId}`);
      if (!row) return json(200, { status: 404, error: 'NOT_FOUND' });
      return json(200, { status: 200, name: p, fields: { ...row.meta, questions: row.questions } });
    }
    if (kind === 'tips') {
      if (!db.tips.length) return json(200, { status: 404, error: 'NOT_FOUND' });
      return json(200, { status: 200, name: p, fields: { list: db.tips.slice(), updatedAt: '', schemaVersion: 1 } });
    }
    if (kind === 'policy') return json(200, { status: 200, name: p, fields: { ...db.policy } });
    if (kind === 'admins')
      return json(200, { status: 200, name: p, fields: { emails: [...db.admins], updatedAt: '', schemaVersion: 1 } });
    if (kind === 'lockMembership')
      return db.lockdownMembership ? json(200, { status: 200, found: true }) : json(200, { status: 404, error: 'NOT_FOUND' });
    return db.lockdownContent ? json(200, { status: 200, found: true }) : json(200, { status: 404, error: 'NOT_FOUND' });
  }

  function writeDoc(p, doc, mode) {
    const kind = docKind(p);
    if (!kind) return json(200, { status: 400, error: 'unknown document path' });
    if (!doc || typeof doc !== 'object') return json(200, { status: 400, error: 'document body must be an object' });
    const keys = Object.keys(doc);

    if (kind === 'member') {
      const who = lower(docName(p));
      const isSelf = signedIn() && emailOf() === who;
      const admin = isAdmin();
      if (!isSelf && !admin) return deny('you may only write your own membership row');
      const allowed = mode === 'merge' ? MEMBER_PATCH_KEYS : MEMBER_KEYS;
      const bad = keys.filter(k => !allowed.includes(k));
      if (bad.length) return deny(`member document has fields that are not writable: ${bad.join(',')}`);
      if (mode !== 'merge' && !['email','status','role'].every(k => k in doc))
        return deny('member document requires id/email, status and role');
      const prev = db.members.get(who) || {};
      const next = { ...prev, ...doc, email: who, id: doc.id || who };
      const creating = !prev.email;
      if (!admin) {
        if (creating) {
          // ── kpss_guard_member_write / INSERT (aynı sıra, aynı sebepler) ──
          if (db.lockdownMembership) return deny('membership lockdown is on: new signups are closed');
          if (db.policy.registrationOpen !== true) return deny('registration is closed by the admin');
          if (next.role !== 'user') return deny('role must be user on self signup');
          if (!['pending','active'].includes(next.status)) return deny('status must be pending or active on self signup');
          if (db.policy.requireApproval === true && next.status !== 'pending')
            return deny('new members stay pending until an admin approves');
          if (session && emailOf() && emailOf() !== who) return deny('email must match the session');
          // hak alanlarını istemci değil, politika belirler (sunucu normalizasyonu)
          const trial = Math.max(0, Number(db.policy.defaultTrialDays) || 0);
          next.vip = trial > 0;
          next.vipPlan = trial > 0 ? 'monthly' : 'free';
          // SQL de 'YYYY-MM-DD' üretiyor (daysLeft yalnız tarihi okur)
          next.vipExpiresAt = trial > 0 ? new Date(Date.now() + trial * 86400000).toISOString().slice(0, 10) : '';
          next.testsCompleted = 0;
          next.questionsSolved = 0;
          next.netSum = 0;
          next.courseUsage = {};
        } else {
          // ── UPDATE: rol/durum/hak yalnız yöneticide; sayaçlar düşmez ──
          for (const f of ['id','email','createdAt'])
            if (f in doc && String(doc[f]) !== String(prev[f])) return deny('id, email and createdAt are not writable');
          for (const f of ['role','status','vip','vipPlan','vipExpiresAt'])
            if (f in doc && doc[f] !== prev[f]) return deny('role/status/vip are admin-only');
          if ((Number(next.testsCompleted) || 0) < (Number(prev.testsCompleted) || 0)) return deny('counters never decrease');
          if ((Number(next.questionsSolved) || 0) < (Number(prev.questionsSolved) || 0)) return deny('counters never decrease');
          if (db.policy.requireApproval === true && prev.status === 'pending' && next.status === 'active')
            return deny('approval is admin-only');
          for (const f of ['verifier', 'salt', 'iterations'])
            if (f in doc && String(doc[f]) !== String(prev[f])) return deny('password material is written only by an admin');
          if (!session && db.lockdownMembership) return deny('membership lockdown is on');
        }
      }
      db.members.set(who, next);
      return json(200, { status: 200, name: p });
    }
    if (kind === 'course' || kind === 'topic' || kind === 'tips') {
      // RLS: courses_write / topics_write / questions_write / tips_write = kpss_is_admin()
      if (!isAdmin()) return deny('only an admin may write content rows');
      if (db.lockdownContent) return deny('content writes are locked (meta/content_lock)');
      const allowed = kind === 'course' ? COURSE_KEYS : kind === 'topic' ? TOPIC_KEYS : TIPS_KEYS;
      const bad = keys.filter(k => !allowed.includes(k));
      if (bad.length) return deny(`content document has unknown fields: ${bad.join(',')}`);
      if (kind === 'course') {
        const id = docName(p);
        db.courses.set(id, { id, title: doc.title || id, icon: doc.icon || 'book-outline', order: doc.order ?? 0, hidden: !!doc.hidden, updatedAt: doc.updatedAt || '', schemaVersion: 1 });
        return json(200, { status: 200, name: p });
      }
      if (kind === 'topic') {
        const [, courseId, , docId] = p.split('/');
        const prev = db.topics.get(`${courseId}/${docId}`);
        const meta = {
          id: doc.id || docId,
          name: doc.name || docId,
          courseId,
          order: doc.order ?? prev?.meta.order ?? 0,
          questionCount: Array.isArray(doc.questions) ? doc.questions.length : (doc.questionCount ?? prev?.questions.length ?? 0),
          updatedAt: doc.updatedAt || '',
          schemaVersion: 1,
        };
        const questions = Array.isArray(doc.questions)
          ? doc.questions.map((q, i) => ({ id: q.id || `${docId}::${i}`, docId, ord: i, question: q.question, options: q.options || [], answer: q.answer ?? 0, explanation: q.explanation || '' }))
          : prev?.questions || [];
        db.topics.set(`${courseId}/${docId}`, { meta, questions });
        return json(200, { status: 200, name: p });
      }
      db.tips = Array.isArray(doc.list) ? doc.list.map(String) : [];
      return json(200, { status: 200, name: p });
    }
    if (kind === 'policy') {
      if (!isAdmin() && !db.lockdownMembership) {
        // politika penceresi: kilit kapalıyken anonim/üye yazabilir (contentWriteOk aynası)
      } else if (!isAdmin()) return deny('only an admin may change the policy while locked');
      const bad = keys.filter(k => !POLICY_KEYS.includes(k));
      if (bad.length) return deny(`policy document has unknown fields: ${bad.join(',')}`);
      db.policy = { ...db.policy, ...doc, id: 1 };
      return json(200, { status: 200, name: p });
    }
    if (kind === 'admins') {
      if (!isAdmin() && db.admins.size) return deny('only an admin may edit the admin list');
      if (!Array.isArray(doc.emails)) return deny('admins document needs an emails array');
      db.admins = new Set(doc.emails.map(lower));
      return json(200, { status: 200, name: p });
    }
    if (!isAdmin()) return deny('only an admin may toggle a lock');
    if (kind === 'lockMembership') db.lockdownMembership = mode === 'delete' ? false : true;
    else db.lockdownContent = mode === 'delete' ? false : true;
    return json(200, { status: 200, name: p });
  }

  function listDocs(prefix, pageSize, pageToken) {
    const limit = Math.max(1, Math.min(Number(pageSize) || 100, 300));
    const offset = Math.max(0, Number(pageToken) || 0);
    let rows = [];
    if (prefix === 'courses') {
      rows = [...db.courses.values()].map(c => ({ name: `courses/${c.id}`, fields: c }));
    } else if (/^courses\/[^/]+\/topics$/.test(prefix)) {
      const courseId = prefix.split('/')[1];
      rows = [...db.topics.entries()]
        .filter(([k]) => k.startsWith(`${courseId}/`))
        .map(([k, v]) => ({ name: `courses/${courseId}/topics/${k.split('/')[1]}`, fields: v.meta }));
    } else if (prefix === 'memberships') {
      if (!isAdmin()) return deny('only an admin may list memberships');
      rows = [...db.members.values()].map(m => ({ name: `memberships/${m.email}`, fields: m }));
    } else {
      return json(200, { status: 400, error: 'unsupported list path' });
    }
    const page = rows.slice(offset, offset + limit);
    return json(200, {
      status: 200,
      documents: page,
      nextPageToken: rows.length === limit && offset + limit < rows.length ? String(offset + limit) : '',
    });
  }

  function rpc(name, body, init) {
    if (name === 'kpss_read_doc') return readDoc(String(body.p_path || ''));
    if (name === 'kpss_write_doc') return writeDoc(String(body.p_path || ''), body.p_doc, String(body.p_mode || 'replace'));
    if (name === 'kpss_delete_doc') {
      const p = String(body.p_path || '');
      const kind = docKind(p);
      if (kind === 'member') {
        const who = lower(docName(p));
        // SQL'de üyeler için yalnız members_admin_delete var — kendi satırını silemezsin.
        if (!isAdmin()) return deny('only an admin may delete a membership row');
        db.members.delete(who);
        return json(200, { status: 200, name: p });
      }
      if (kind === 'topic') {
        // RLS: silme de yönetici işi (courses/topics/tips write policy = kpss_is_admin())
        if (!isAdmin()) return deny('only an admin may delete content rows');
        if (db.lockdownContent) return deny('content writes are locked (meta/content_lock)');
        const [, courseId, , docId] = p.split('/');
        db.topics.delete(`${courseId}/${docId}`);
        return json(200, { status: 200, name: p });
      }
      if (kind === 'course') {
        // RLS: silme de yönetici işi (courses/topics/tips write policy = kpss_is_admin())
        if (!isAdmin()) return deny('only an admin may delete content rows');
        if (db.lockdownContent) return deny('content writes are locked (meta/content_lock)');
        db.courses.delete(docName(p));
        return json(200, { status: 200, name: p });
      }
      if (kind === 'tips') {
        db.tips = [];
        return json(200, { status: 200, name: p });
      }
      return writeDoc(p, {}, 'delete');
    }
    if (name === 'kpss_list_docs') return listDocs(String(body.p_prefix || ''), body.p_page_size, body.p_page_token);
    if (name === 'kpss_member_exists') return json(200, db.members.has(lower(String(body.p_email || ''))));
    if (name === 'kpss_replace_tests') {
      const who = lower(body.p_member_email);
      if (!(signedIn() && (emailOf() === who || isAdmin()))) return deny('you may only write your own test rows');
      db.userTests = new Map(
        (Array.isArray(body.p_rows) ? body.p_rows : []).map(r => [
          String(r.key),
          { key: String(r.key), memberEmail: who, userId: session?.sub || null, courseId: r.courseId, topicDocId: r.topicDocId || null, title: r.title || '', correct: Number(r.correct) || 0, wrong: Number(r.wrong) || 0, blank: Number(r.blank) || 0, total: Number(r.total) || 0, net: Number(r.net) || 0, durationSec: Number(r.durationSec) || 0, completedAt: r.completedAt || new Date().toISOString() },
        ])
      );
      return json(200, { status: 200, rows: db.userTests.size });
    }
    if (name === 'kpss_pull_tests') {
      const who = lower(body.p_member_email);
      if (!(signedIn() && (emailOf() === who || isAdmin()))) return deny('you may only read your own test rows');
      const rows = [...db.userTests.values()].filter(r => r.memberEmail === who).slice(0, 500);
      return json(200, { status: 200, rows });
    }
    return json(404, { code: 'PGRST202', message: `unknown function ${name}` });
  }

  /* ------------------------------------------------------------- tablo yolu */

  function tablePath(pathname) {
    const name = pathname.replace('/rest/v1/', '').split('?')[0];
    return name;
  }

  function handleRest(path, init, body) {
    const [pathname, search] = path.split('?');
    const q = new URLSearchParams(search || '');
    const table = tablePath(pathname);
    const method = (init?.method || 'GET').toUpperCase();

    if (table === 'membership_policy') {
      if (method === 'GET') return json(200, [{ ...db.policy }]);
      if (!isAdmin()) return deny('only an admin may write the policy row');
      db.policy = { ...db.policy, ...(Array.isArray(body) ? body[0] : body), id: 1 };
      return json(201, [{ ...db.policy }]);
    }
    if (table === 'user_data') {
      if (!signedIn()) return deny('user_data requires a signed-in user');
      const uid = session.sub;
      if (method === 'POST') {
        const row = Array.isArray(body) ? body[0] : body;
        if (lower(row.userId) !== lower(uid)) return deny('you may only write your own user_data rows');
        db.userData.set(`${uid}|${row.kind}`, { userId: uid, kind: row.kind, payload: row.payload ?? null, updatedAt: new Date().toISOString() });
        return (q.get('on_conflict') ? json(204, undefined) : json(201, undefined));
      }
      const want = q.get('userId') || '';
      const m = want.match(/eq\.(.*)/);
      const who = m ? m[1] : uid;
      if (lower(who) !== lower(uid) && !isAdmin()) return deny('you may only read your own user_data rows');
      const rows = [...db.userData.values()].filter(r => r.userId === who);
      return json(200, rows);
    }
    if (table === 'user_tests') {
      if (!signedIn()) return deny('user_tests requires a signed-in user');
      const who = emailOf();
      const rows = [...db.userTests.values()].filter(r => r.memberEmail === who || isAdmin());
      return method === 'GET' ? json(200, rows) : deny('test rows are written through rpc/kpss_replace_tests');
    }
    if (table === 'members') {
      if (!isAdmin()) return deny('members are written through the document gateway');
      if (method === 'PATCH') {
        const emailKey = lower((q.get('email') || '').replace('eq.', ''));
        const prev = db.members.get(emailKey) || {};
        db.members.set(emailKey, { ...prev, ...(Array.isArray(body) ? body[0] : body) });
        return json(200, [{ ...db.members.get(emailKey) }]);
      }
      return json(200, [...db.members.values()]);
    }
    return json(404, { code: '42P01', message: `relation "${table}" does not exist` });
  }

  async function fetchImpl(url, init = {}) {
    const u = String(url);
    const path = u.replace(/^https?:\/\/[^/]+/, '');
    const raw = init.body ? String(init.body) : '';
    const body = raw ? safeJson(raw) : {};
    log.push({ url: u, method: init.method || 'GET', body, headers: init.headers || {} });
    const forced = inject && inject(u, body, init);
    if (forced) return json(forced.status, forced.body);
    if (path.startsWith('/auth/v1')) return handleAuth(path, init, body);
    // Veri yolları: Authorization başlığı varsa oturum vardır; yoksa anonim.
    session = authFrom(init);
    if (path.startsWith('/rest/v1/rpc/')) return rpc(path.replace('/rest/v1/rpc/', '').split('?')[0], body, init);
    if (path.startsWith('/rest/v1/')) return handleRest(path.replace('/rest/v1/', ''), init, body);
    return json(404, { message: `UNHANDLED ${u}` });
  }

  function safeJson(t) {
    try {
      return JSON.parse(t);
    } catch {
      return { raw: t };
    }
  }

  return {
    URL0,
    fetchImpl,
    db,
    log,
    users,
    /** Bir sonraki istekleri sabit yanıtla kes (ağ hatası/401 taklidi). */
    injectWith(fn) {
      inject = fn;
    },
    clearInject() {
      inject = null;
    },
    /** Testte oturum açmak için: doğrudan token üret. */
    loginAs(email, extra = {}) {
      const key = lower(email);
      if (!users.has(key)) {
        const id = extra.sub || `00000000-0000-4000-8000-11111111111${uidSeq % 10}`;
        users.set(key, { id, email: key, password: 'GoodPass1' });
      }
      const u = users.get(key);
      const token = makeToken({ sub: u.id, email: key, role: 'authenticated', iss: extra.iss || URL0, iat: Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000), exp: Math.floor(Date.now() / 1000) + 3600, ...extra.claims });
      session = { sub: u.id, email: key, token };
      return { token, uid: u.id };
    },
    expiredTokenFor(email) {
      return makeToken({ sub: 'x', email: lower(email), role: 'authenticated', iss: URL0, exp: Math.floor(Date.now() / 1000) - 10 });
    },
    signOut() {
      session = null;
    },
    token: () => session?.token || null,
  };
}
