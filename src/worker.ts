export interface Env {
  DB: D1Database;
  R2: R2Bucket;
  JWT_SECRET: string;
  ASSETS: Fetcher;
}


type Json = Record<string, any>;

function json(data: any, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

function text(data: string, status = 200, headers: Record<string, string> = {}) {
  return new Response(data, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

// =========================
// GLOBAL HELPERS
// =========================
function escapeHtml(value: any): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function badRequest(message: string) {
  return json({ error: message }, 400);
}

function unauthorized(message = 'Unauthorized') {
  return json({ error: message }, 401);
}

function forbidden(message = 'Forbidden') {
  return json({ error: message }, 403);
}

function notFound(message = 'Not found') {
  return json({ error: message }, 404);
}

function parseCookies(cookieHeader: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (!k) continue;
    out[k] = decodeURIComponent(rest.join('=') || '');
  }
  return out;
}

function setCookie(name: string, value: string, opts: { httpOnly?: boolean; secure?: boolean; sameSite?: 'Lax' | 'Strict' | 'None'; path?: string; maxAgeSeconds?: number } = {}) {
  const parts: string[] = [];
  parts.push(`${name}=${encodeURIComponent(value)}`);
  parts.push(`Path=${opts.path ?? '/'}`);
  if (opts.maxAgeSeconds !== undefined) parts.push(`Max-Age=${opts.maxAgeSeconds}`);
  if (opts.httpOnly ?? true) parts.push('HttpOnly');
  // Cloudflare always serves HTTPS on the edge; secure cookies are recommended
  if (opts.secure ?? true) parts.push('Secure');
  parts.push(`SameSite=${opts.sameSite ?? 'Lax'}`);
  return parts.join('; ');
}

function base64urlEncode(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  const b64 = btoa(str);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64urlEncodeString(s: string) {
  const b64 = btoa(unescape(encodeURIComponent(s)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64urlDecodeToString(s: string) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  return decodeURIComponent(escape(bin));
}

async function hmacSign(secret: string, data: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return base64urlEncode(sig);
}

async function jwtSign(secret: string, payload: Json, expiresInSeconds: number) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const full = { ...payload, iat: now, exp: now + expiresInSeconds };
  const head = base64urlEncodeString(JSON.stringify(header));
  const body = base64urlEncodeString(JSON.stringify(full));
  const data = `${head}.${body}`;
  const sig = await hmacSign(secret, data);
  return `${data}.${sig}`;
}

async function jwtVerify(secret: string, token: string): Promise<Json | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const data = `${h}.${p}`;
  const expected = await hmacSign(secret, data);
  if (expected !== s) return null;
  const payload = JSON.parse(base64urlDecodeToString(p));
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < now) return null;
  return payload;
}

async function pbkdf2Hash(password: string, saltB64: string, iterations: number) {
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256
  );
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(bits)));
  return hashB64;
}

function randomSaltB64(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr));
}

async function readJson(request: Request) {
  try {
    const ct = request.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return null;
    return await request.json();
  } catch {
    return null;
  }
}

async function requireUser(request: Request, env: Env) {
  const cookies = parseCookies(request.headers.get('cookie'));
  const token = cookies['tmv_session'];
  if (!token) return null;
  const payload = await jwtVerify(env.JWT_SECRET, token);
  if (!payload?.uid) return null;
  const uid = Number(payload.uid);
  const user = await env.DB.prepare('SELECT id,email,name,role,created_at FROM user WHERE id = ?').bind(uid).first();
  return user as any;
}

async function requireAdmin(request: Request, env: Env) {
  const u = await requireUser(request, env);
  if (!u) return { user: null, error: unauthorized() };
  if (u.role !== 'admin') return { user: u, error: forbidden() };
  return { user: u, error: null };
}

function isoNow() {
  return new Date().toISOString();
}

function toIso(dt: any) {
  if (!dt) return null;
  const d = new Date(dt);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function absoluteImageUrl(origin: string, imageUrl: any, fallback = '/static/images/nuevos_comiensos.png') {
  const raw = String(imageUrl || '').trim();
  if (!raw) return `${origin}${fallback}`;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${origin}${raw}`;
  return `${origin}/static/images/${raw}`;
}

function youtubeEmbedUrl(input: any) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    let id = '';

    if (host.includes('youtu.be')) {
      id = parsed.pathname.replace(/^\/+/, '').split('/')[0] || '';
    } else if (host.includes('youtube.com')) {
      if (parsed.pathname.startsWith('/watch')) {
        id = parsed.searchParams.get('v') || '';
      } else if (parsed.pathname.startsWith('/shorts/') || parsed.pathname.startsWith('/embed/')) {
        id = parsed.pathname.split('/').filter(Boolean).pop() || '';
      }
    }

    if (!/^[a-zA-Z0-9_-]{6,}$/.test(id)) return null;
    return `https://www.youtube.com/embed/${id}`;
  } catch {
    return null;
  }
}

async function ensureDefaultAdmin(env: Env) {
  // Create default admin ONLY if there are no users.
  const row = await env.DB.prepare('SELECT COUNT(1) as c FROM user').first() as any;
  const c = Number(row?.c || 0);
  if (c > 0) return;
  const email = 'admin@example.com';
  const name = 'Admin';
  const role = 'admin';
  const iterations = 100_000;
  const salt = randomSaltB64(16);
  const hash = await pbkdf2Hash('admin1234', salt, iterations);
  await env.DB.prepare(
    'INSERT INTO user (email,name,password_salt,password_iterations,password_hash,role,created_at) VALUES (?,?,?,?,?,?,?)'
  ).bind(email, name, salt, iterations, hash, role, isoNow()).run();
}

async function ensureApprovalSchema(env: Env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS course_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      feedback TEXT NOT NULL,
      approved INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(course_id) REFERENCES course(id),
      FOREIGN KEY(user_id) REFERENCES user(id)
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS event_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      feedback TEXT NOT NULL,
      approved INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(event_id) REFERENCES event(id),
      FOREIGN KEY(user_id) REFERENCES user(id)
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS workshop (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      presenter TEXT NOT NULL,
      about TEXT NOT NULL,
      location TEXT NOT NULL,
      requirements TEXT,
      image_url TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      capacity INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(created_by) REFERENCES user(id)
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS workshop_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workshop_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      feedback TEXT NOT NULL,
      approved INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(workshop_id) REFERENCES workshop(id),
      FOREIGN KEY(user_id) REFERENCES user(id)
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS agreement_doc (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      r2_key TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mimetype TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(created_by) REFERENCES user(id)
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS user_agreement_acknowledgement (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      agreement_doc_id INTEGER NOT NULL,
      accepted_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES user(id),
      FOREIGN KEY(agreement_doc_id) REFERENCES agreement_doc(id),
      UNIQUE(user_id, agreement_doc_id)
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS app_setting (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_by INTEGER,
      updated_at TEXT,
      FOREIGN KEY(updated_by) REFERENCES user(id)
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS youtube_slider_video (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      youtube_url TEXT NOT NULL,
      embed_url TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(created_by) REFERENCES user(id)
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS milk_giveaway_registration (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      registered_by INTEGER NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      baby_name TEXT NOT NULL,
      baby_age_months INTEGER NOT NULL,
      formula_type TEXT NOT NULL,
      formula_other TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(registered_by) REFERENCES user(id)
    )
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_milk_registration_created_at
    ON milk_giveaway_registration(created_at)
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_milk_registration_registered_by
    ON milk_giveaway_registration(registered_by)
  `).run();

  const userInfo = await env.DB.prepare('PRAGMA table_info(user)').all() as any;
  const userCols = (userInfo?.results || []).map((row: any) => row.name);
  if (!userCols.includes('testimony_approved')) {
    await env.DB.prepare('ALTER TABLE user ADD COLUMN testimony_approved INTEGER NOT NULL DEFAULT 0').run();
  }
  if (!userCols.includes('video_url')) {
    await env.DB.prepare('ALTER TABLE user ADD COLUMN video_url TEXT').run();
  }
  if (!userCols.includes('video_approved')) {
    await env.DB.prepare('ALTER TABLE user ADD COLUMN video_approved INTEGER NOT NULL DEFAULT 0').run();
  }

  const courseInfo = await env.DB.prepare('PRAGMA table_info(course_feedback)').all() as any;
  const courseCols = (courseInfo?.results || []).map((row: any) => row.name);
  if (!courseCols.includes('approved')) {
    await env.DB.prepare('ALTER TABLE course_feedback ADD COLUMN approved INTEGER NOT NULL DEFAULT 0').run();
  }

  const eventInfo = await env.DB.prepare('PRAGMA table_info(event_feedback)').all() as any;
  const eventCols = (eventInfo?.results || []).map((row: any) => row.name);
  if (!eventCols.includes('approved')) {
    await env.DB.prepare('ALTER TABLE event_feedback ADD COLUMN approved INTEGER NOT NULL DEFAULT 0').run();
  }

  const baseEventInfo = await env.DB.prepare('PRAGMA table_info(event)').all() as any;
  const baseEventCols = (baseEventInfo?.results || []).map((row: any) => row.name);
  if (!baseEventCols.includes('image_url')) {
    await env.DB.prepare('ALTER TABLE event ADD COLUMN image_url TEXT').run();
  }
  if (!baseEventCols.includes('archived')) {
    await env.DB.prepare('ALTER TABLE event ADD COLUMN archived INTEGER NOT NULL DEFAULT 0').run();
  }

  const baseCourseInfo = await env.DB.prepare('PRAGMA table_info(course)').all() as any;
  const baseCourseCols = (baseCourseInfo?.results || []).map((row: any) => row.name);
  if (!baseCourseCols.includes('image_url')) {
    await env.DB.prepare('ALTER TABLE course ADD COLUMN image_url TEXT').run();
  }
  if (!baseCourseCols.includes('archived')) {
    await env.DB.prepare('ALTER TABLE course ADD COLUMN archived INTEGER NOT NULL DEFAULT 0').run();
  }
}

async function handleAuth(request: Request, env: Env, pathname: string) {
  
  if (request.method === 'POST' && pathname === '/api/auth/register') {
    const body = await readJson(request);
    if (!body) return badRequest('Expected JSON');
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!name || !email || !password) return badRequest('All fields are required');
    if (password.length < 8) return badRequest('Password must be at least 8 characters');

    const existing = await env.DB.prepare('SELECT id FROM user WHERE email = ?').bind(email).first();
    if (existing) return badRequest('Email already registered');

    const activeDocsRes = await env.DB.prepare('SELECT id FROM agreement_doc WHERE active = 1').all();
    const activeDocs = (activeDocsRes.results || []) as Array<{id:number}>;
    if (activeDocs.length > 0) {
      const acceptedIds = Array.isArray(body.agreement_doc_ids) ? body.agreement_doc_ids.map((v: any) => String(v)) : [];
      if (acceptedIds.length !== activeDocs.length) return badRequest('You must acknowledge and agree to all required documents.');
      const requiredIds = activeDocs.map((d) => String(d.id));
      if (!acceptedIds.every((id) => requiredIds.includes(id))) return badRequest('Invalid document acknowledgement.');
    }

    const iterations = 100_000;
    const salt = randomSaltB64(16);
    const hash = await pbkdf2Hash(password, salt, iterations);

    const res = await env.DB.prepare(
      'INSERT INTO user (email,name,password_salt,password_iterations,password_hash,role,created_at) VALUES (?,?,?,?,?,?,?)'
    ).bind(email, name, salt, iterations, hash, 'user', isoNow()).run();

    const uid = Number(res.meta.last_row_id);
    for (const doc of activeDocs) {
      await env.DB.prepare(
        'INSERT INTO user_agreement_acknowledgement (user_id,agreement_doc_id,accepted_at) VALUES (?,?,?)'
      ).bind(uid, doc.id, isoNow()).run();
    }

    const token = await jwtSign(env.JWT_SECRET, { uid }, 60 * 60 * 24 * 14);
    return json(
      { ok: true },
      200,
      { 'set-cookie': setCookie('tmv_session', token, { maxAgeSeconds: 60 * 60 * 24 * 14 }) }
    );
  }

  if (request.method === 'POST' && pathname === '/api/auth/login') {
    const body = await readJson(request);
    if (!body) return badRequest('Expected JSON');
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!email || !password) return badRequest('Email and password required');

    const u = await env.DB.prepare(
      'SELECT id,email,name,role,password_salt,password_iterations,password_hash FROM user WHERE email = ?'
    ).bind(email).first() as any;
    if (!u) return unauthorized('Invalid login');

    const computed = await pbkdf2Hash(password, u.password_salt, Number(u.password_iterations));
    if (computed !== u.password_hash) return unauthorized('Invalid login');

    const pendingRows = await env.DB.prepare(
      'SELECT d.id,d.title FROM agreement_doc d LEFT JOIN user_agreement_acknowledgement a ON a.agreement_doc_id = d.id AND a.user_id = ? WHERE d.active = 1 AND a.id IS NULL'
    ).bind(u.id).all() as any;
    const pending = (pendingRows.results || []).map((r: any) => ({ id: r.id, title: r.title, download_url: `/api/agreement-docs/${r.id}/pdf` }));

    // If there are pending docs and user is not admin, require acknowledgement first.
    if (pending.length > 0 && String(u.role || '').toLowerCase() !== 'admin') {
      // issue a short-lived ack token (no session cookie)
      const ackToken = await jwtSign(env.JWT_SECRET, { uid: u.id, type: 'ack' }, 60);
      return json({ ok: false, ack_required: true, ack_token: ackToken, pending }, 200);
    }

    // No pending docs (or admin) → proceed to create normal session
    const token = await jwtSign(env.JWT_SECRET, { uid: u.id }, 60 * 60 * 24 * 14);
    return json({ ok: true }, 200, { 'set-cookie': setCookie('tmv_session', token, { maxAgeSeconds: 60 * 60 * 24 * 14 }) });
  }

  if (request.method === 'POST' && pathname === '/api/auth/login/complete') {
    const body = await readJson(request);
    if (!body) return badRequest('Expected JSON');
    const ackToken = String(body.ack_token || '').trim();
    if (!ackToken) return badRequest('ack_token required');

    const payload = await jwtVerify(env.JWT_SECRET, ackToken);
    if (!payload || payload.type !== 'ack' || !payload.uid) return unauthorized('Invalid or expired ack token');

    const uid = Number(payload.uid);
    // ensure no pending docs remain for the user
    const pendingRow = await env.DB.prepare(
      'SELECT COUNT(1) as pending FROM agreement_doc d LEFT JOIN user_agreement_acknowledgement a ON a.agreement_doc_id = d.id AND a.user_id = ? WHERE d.active = 1 AND a.id IS NULL'
    ).bind(uid).first() as any;
    const pendingCount = Number(pendingRow?.pending || 0);
    if (pendingCount > 0) return badRequest('Pending documents remain');

    const token = await jwtSign(env.JWT_SECRET, { uid }, 60 * 60 * 24 * 14);
    return json({ ok: true }, 200, { 'set-cookie': setCookie('tmv_session', token, { maxAgeSeconds: 60 * 60 * 24 * 14 }) });
  }

  if (request.method === 'POST' && pathname === '/api/auth/logout') {
    return json(
      { ok: true },
      200,
      { 'set-cookie': setCookie('tmv_session', '', { maxAgeSeconds: 0 }) }
    );
  }

  return null;
}

async function handleAgreementDocs(request: Request, env: Env, pathname: string) {
  const url = new URL(request.url);

  if (request.method === 'GET' && pathname === '/api/agreement-docs') {
    const u = await requireUser(request, env);
    const out = await env.DB.prepare(
      'SELECT id,title,author,created_at FROM agreement_doc WHERE active = 1 ORDER BY created_at DESC'
    ).all();

    const ackSet = new Set<number>();
    if (u) {
      const ackRows = await env.DB.prepare(
        'SELECT agreement_doc_id FROM user_agreement_acknowledgement WHERE user_id = ?'
      ).bind(u.id).all();
      for (const row of (ackRows.results || []) as any[]) {
        ackSet.add(Number(row.agreement_doc_id));
      }
    }

    const docs = (out.results || []).map((doc: any) => ({
      id: doc.id,
      title: doc.title,
      author: doc.author,
      created_at: doc.created_at,
      download_url: `/api/agreement-docs/${doc.id}/pdf`,
      acknowledged: u ? ackSet.has(Number(doc.id)) : false
    }));
    return json(docs);
  }

  const mAcknowledge = pathname.match(/^\/api\/agreement-docs\/(\d+)\/acknowledge$/);
  if (request.method === 'POST' && mAcknowledge) {
    // allow acknowledgement via normal session OR short-lived ack token
    let u = await requireUser(request, env);

    if (!u) {
      // try ack token from Authorization: Bearer <token>
      const auth = (request.headers.get('authorization') || '').trim();
      if (auth.toLowerCase().startsWith('bearer ')) {
        const token = auth.slice(7).trim();
        const payload = await jwtVerify(env.JWT_SECRET, token);
        if (payload && payload.type === 'ack' && payload.uid) {
          u = { id: Number(payload.uid) } as any;
        }
      }
    }

    if (!u) return unauthorized();

    const docId = Number(mAcknowledge[1]);
    if (!docId) return badRequest('Invalid document id');

    const doc = await env.DB.prepare('SELECT id FROM agreement_doc WHERE id = ? AND active = 1').bind(docId).first() as any;
    if (!doc) return notFound();

    await env.DB.prepare(
      'INSERT OR IGNORE INTO user_agreement_acknowledgement (user_id,agreement_doc_id,accepted_at) VALUES (?,?,?)'
    ).bind(u.id, docId, isoNow()).run();

    return json({ ok: true });
  }

  const mPdf = pathname.match(/^\/api\/agreement-docs\/(\d+)\/pdf$/);
  if (request.method === 'GET' && mPdf) {
    const docId = Number(mPdf[1]);
    const row = await env.DB.prepare('SELECT r2_key, original_name, mimetype FROM agreement_doc WHERE id = ? AND active = 1').bind(docId).first() as any;
    if (!row) return notFound();
    const obj = await env.R2.get(String(row.r2_key));
    if (!obj) return notFound();
    return new Response(obj.body, {
      status: 200,
      headers: {
        'content-type': row.mimetype || 'application/pdf',
        'content-disposition': `inline; filename="${row.original_name.replace(/"/g, '')}"`,
        'cache-control': 'public, max-age=3600'
      }
    });
  }

  return null;
}

async function handleApi(request, env) {
  const url = new URL(request.url);

  console.log("🌍 TOP ROUTER request");
  console.log("   method:", request.method);
  console.log("   pathname:", pathname);
  console.log("   full URL:", url.toString());
  console.log("   search:", url.search);

  if (url.pathname === "/api/me" && request.method === "GET") {
    try {
      const session = await getSessionFromRequest(request, env.JWT_SECRET);

      if (!session || !session.userId) {
        return json({ user: null }, 200);
      }

      const user = await env.DB.prepare(
        `SELECT id, name, email, role
         FROM user
         WHERE id = ?`
      ).bind(session.userId).first();

      if (!user) {
        return json({ user: null }, 200);
      }

      return json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role || "user"
        }
      }, 200);
    } catch (err) {
      return json({
        error: err.message || "Internal Server Error"
      }, 500);
    }
  }

  return json({ error: "Not found" }, 404);
}

async function handleMe(request: Request, env: Env, pathname: string) {
  console.log("🚀 handleMe CALLED:", request.method, pathname);

  if (request.method === 'GET' && pathname === '/api/me') {
    console.log("✅ GET /api/me MATCHED");

    const u = await requireUser(request, env);
    if (!u) return unauthorized();

    const fullUser = await env.DB.prepare(`
      SELECT
        id,
        email,
        name,
        role,
        created_at,
        first_name,
        last_name,
        image_url,
        testimony,
        testimony_approved,
        video_url,
        video_approved
      FROM user
      WHERE id = ?
    `).bind(u.id).first();

    console.log("📦 fullUser:", fullUser);

    if (!fullUser) return unauthorized();

    const pendingCountRow = await env.DB.prepare(`
      SELECT COUNT(1) AS pending
      FROM agreement_doc d
      LEFT JOIN user_agreement_acknowledgement a
        ON a.agreement_doc_id = d.id AND a.user_id = ?
      WHERE d.active = 1 AND a.id IS NULL
    `).bind(u.id).first() as any;
    const pending_agreements_count = Number(pendingCountRow?.pending || 0);

    return json({
      ...fullUser,
      pending_agreements_count,
      has_pending_agreements: pending_agreements_count > 0
    });
  }

  if (request.method === 'PATCH' && pathname === '/api/me') {
    console.log("✅ PATCH /api/me MATCHED");

    const u = await requireUser(request, env);
    if (!u) return unauthorized();

    const currentUser = await env.DB.prepare('SELECT testimony, video_url FROM user WHERE id = ?').bind(u.id).first() as any;
    const body = await request.json() as any;
    console.log("📦 PATCH body:", body);

    let updateFields = [];
    let updateValues = [];

    if (body.username !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(body.username || '');
    }
    if (body.first_name !== undefined) {
      updateFields.push('first_name = ?');
      updateValues.push(body.first_name || '');
    }
    if (body.last_name !== undefined) {
      updateFields.push('last_name = ?');
      updateValues.push(body.last_name || '');
    }
    if (body.email !== undefined) {
      updateFields.push('email = ?');
      updateValues.push(body.email || '');
    }
    if (body.testimony !== undefined) {
      const newTestimony = String(body.testimony || '').trim();
      const oldTestimony = String(currentUser?.testimony || '').trim();
      updateFields.push('testimony = ?');
      updateValues.push(newTestimony);
      if (newTestimony !== oldTestimony) {
        updateFields.push('testimony_approved = ?');
        updateValues.push(0);
      }
    }
    if (body.video_url !== undefined) {
      const newVideoUrl = String(body.video_url || '').trim();
      const oldVideoUrl = String(currentUser?.video_url || '').trim();
      updateFields.push('video_url = ?');
      updateValues.push(newVideoUrl);
      if (newVideoUrl !== oldVideoUrl) {
        updateFields.push('video_approved = ?');
        updateValues.push(0);
      }
    }

    if (body.password) {
      if (body.password.length < 8) return badRequest('Password must be at least 8 characters');
      const salt = randomSaltB64();
      const iterations = 100000;
      const hash = await pbkdf2Hash(body.password, salt, iterations);
      updateFields.push('password_salt = ?, password_iterations = ?, password_hash = ?');
      updateValues.push(salt, iterations, hash);
    }

    if (updateFields.length === 0) return json({ ok: true });

    const sql = `UPDATE user SET ${updateFields.join(', ')} WHERE id = ?`;
    updateValues.push(u.id);

    await env.DB.prepare(sql).bind(...updateValues).run();

    return json({ ok: true });
  }

  return null;
}

async function handleSettings(request: Request, env: Env, pathname: string) {
  if (request.method === 'GET' && pathname === '/api/settings/donate-image') {
    const row = await env.DB.prepare(
      'SELECT value FROM app_setting WHERE key = ?'
    ).bind('donate_image_url').first() as any;

    return json({ image_url: row?.value || '' });
  }

  if (request.method === 'PATCH' && pathname === '/api/settings/donate-image') {
    const admin = await requireAdmin(request, env);
    if (admin.error) return admin.error;

    const body = await readJson(request);
    if (!body) return badRequest('Expected JSON');

    const imageUrl = String(body.image_url || '').trim();
    await env.DB.prepare(`
      INSERT INTO app_setting (key, value, updated_by, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
    `).bind('donate_image_url', imageUrl, admin.user!.id, isoNow()).run();

    return json({ ok: true, image_url: imageUrl });
  }

  return null;
}

async function handleYoutubeSlider(request: Request, env: Env, pathname: string) {
  if (request.method === 'GET' && pathname === '/api/youtube-slider') {
    const out = await env.DB.prepare(`
      SELECT id, title, youtube_url, embed_url, sort_order, created_at
      FROM youtube_slider_video
      WHERE active = 1
      ORDER BY sort_order ASC, id ASC
    `).all();
    return json(out.results || []);
  }

  if (request.method === 'POST' && pathname === '/api/admin/youtube-slider') {
    const admin = await requireAdmin(request, env);
    if (admin.error) return admin.error;

    const body = await readJson(request);
    if (!body) return badRequest('Expected JSON');

    const title = String(body.title || '').trim();
    const youtubeUrl = String(body.youtube_url || '').trim();
    const embedUrl = youtubeEmbedUrl(youtubeUrl);
    const sortOrder = Math.max(0, Number(body.sort_order || 0) || 0);

    if (!title || !youtubeUrl) return badRequest('Title and YouTube URL are required');
    if (!embedUrl) return badRequest('Invalid YouTube URL');

    const res = await env.DB.prepare(`
      INSERT INTO youtube_slider_video (title, youtube_url, embed_url, active, sort_order, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(title, youtubeUrl, embedUrl, 1, sortOrder, admin.user!.id, isoNow()).run();

    return json({ ok: true, id: res.meta.last_row_id });
  }

  const mDelete = pathname.match(/^\/api\/admin\/youtube-slider\/(\d+)$/);
  if (request.method === 'DELETE' && mDelete) {
    const admin = await requireAdmin(request, env);
    if (admin.error) return admin.error;

    const id = Number(mDelete[1]);
    await env.DB.prepare('UPDATE youtube_slider_video SET active = 0 WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }

  return null;
}

/*******************************************************************
 * BEGIN Handle Events  
******************************************************************** */

const FORMULA_TYPES = [
  'Enfamil',
  'Similac',
  'Enfamil Gentlease',
  'Similac Sensitive',
  'Otra fórmula',
];

function normalizePhone(value: unknown) {
  return String(value || '').trim().replace(/[^\d+().\-\s]/g, '');
}

function phoneDigits(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function integerIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

function sqliteConflict(error: unknown) {
  return String((error as any)?.message || error || '').toLowerCase().includes('unique');
}

async function participantRows(env: Env, scope: string | null, query: string) {
  const params: any[] = [];
  let membership = '';
  if (scope === 'unlisted') {
    membership = `AND NOT EXISTS (
      SELECT 1 FROM participant_list_member x WHERE x.participant_id = p.id
    )`;
  } else if (scope && /^\d+$/.test(scope)) {
    membership = `AND EXISTS (
      SELECT 1 FROM participant_list_member x
      WHERE x.participant_id = p.id AND x.participant_list_id = ?
    )`;
    params.push(Number(scope));
  }

  const trimmed = query.trim().slice(0, 100);
  let search = '';
  if (trimmed) {
    const digits = phoneDigits(trimmed);
    if (digits) {
      search = `AND (
        LOWER(p.name) LIKE ?
        OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
          COALESCE(p.phone, ''), ' ', ''), '-', ''), '(', ''), ')', ''), '.', ''), '+', '')
          LIKE ?
      )`;
      params.push(`%${trimmed.toLowerCase()}%`, `%${digits}%`);
    } else {
      search = 'AND LOWER(p.name) LIKE ?';
      params.push(`%${trimmed.toLowerCase()}%`);
    }
  }

  return env.DB.prepare(`
    SELECT p.id,p.user_id,p.name,p.phone,p.address,p.created_at,p.updated_at,
      GROUP_CONCAT(pl.name, ', ') AS list_names
    FROM participant p
    LEFT JOIN participant_list_member plm ON plm.participant_id = p.id
    LEFT JOIN participant_list pl ON pl.id = plm.participant_list_id
    WHERE 1 = 1 ${membership} ${search}
    GROUP BY p.id
    ORDER BY LOWER(p.name), p.id
  `).bind(...params).all();
}

async function handleParticipants(request: Request, env: Env, pathname: string) {
  const url = new URL(request.url);

  if (request.method === 'GET' && pathname === '/api/admin/participants') {
    const admin = await requireAdmin(request, env);
    if (admin.error) return admin.error;
    const out = await participantRows(
      env,
      url.searchParams.get('scope'),
      url.searchParams.get('q') || ''
    );
    return json({ participants: out.results || [], count: (out.results || []).length });
  }

  if (request.method === 'POST' && pathname === '/api/admin/participants') {
    const admin = await requireAdmin(request, env);
    if (admin.error) return admin.error;
    const body = await readJson(request) as any;
    if (!body) return badRequest('Expected JSON');
    const name = String(body.name || '').trim();
    const phone = normalizePhone(body.phone);
    const address = String(body.address || '').trim();
    const listId = body.list_id ? Number(body.list_id) : null;
    if (!name) return badRequest('Participant name is required');
    if (listId) {
      const list = await env.DB.prepare('SELECT id FROM participant_list WHERE id = ?').bind(listId).first();
      if (!list) return badRequest('Unknown participant list');
    }
    try {
      const now = isoNow();
      const result = await env.DB.prepare(`
        INSERT INTO participant (user_id,name,phone,address,created_by,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?)
      `).bind(null, name, phone || null, address || null, admin.user!.id, now, now).run();
      const participantId = Number(result.meta.last_row_id);
      if (listId) {
        try {
          await env.DB.prepare(`
            INSERT INTO participant_list_member (participant_list_id,participant_id,created_at)
            VALUES (?,?,?)
          `).bind(listId, participantId, now).run();
        } catch (error) {
          return json({
            ok: true,
            id: participantId,
            warning: 'Participant was created, but list assignment failed'
          }, 201);
        }
      }
      return json({ ok: true, id: participantId }, 201);
    } catch (error) {
      if (sqliteConflict(error)) return json({ error: 'That account already has a participant profile' }, 409);
      throw error;
    }
  }

  const participantMatch = pathname.match(/^\/api\/admin\/participants\/(\d+)$/);
  if (request.method === 'PATCH' && participantMatch) {
    const admin = await requireAdmin(request, env);
    if (admin.error) return admin.error;
    const body = await readJson(request) as any;
    if (!body) return badRequest('Expected JSON');
    const id = Number(participantMatch[1]);
    const name = String(body.name || '').trim();
    const phone = normalizePhone(body.phone);
    const address = String(body.address || '').trim();
    if (!name) return badRequest('Participant name is required');
    try {
      const result = await env.DB.prepare(`
        UPDATE participant SET name = ?,phone = ?,address = ?,updated_at = ?
        WHERE id = ?
      `).bind(name, phone || null, address || null, isoNow(), id).run();
      if (!result.meta?.changes) return notFound('Participant not found');
      return json({ ok: true });
    } catch (error) {
      if (sqliteConflict(error)) return json({ error: 'That account already has a participant profile' }, 409);
      throw error;
    }
  }

  if (request.method === 'DELETE' && participantMatch) {
    const admin = await requireAdmin(request, env);
    if (admin.error) return admin.error;
    const result = await env.DB.prepare('DELETE FROM participant WHERE id = ?')
      .bind(Number(participantMatch[1])).run();
    if (!result.meta?.changes) return notFound('Participant not found');
    return json({ ok: true });
  }

  if (request.method === 'GET' && pathname === '/api/admin/participant-lists') {
    const admin = await requireAdmin(request, env);
    if (admin.error) return admin.error;
    const lists = await env.DB.prepare(`
      SELECT pl.id,pl.name,pl.created_at,pl.updated_at,COUNT(plm.participant_id) AS member_count
      FROM participant_list pl
      LEFT JOIN participant_list_member plm ON plm.participant_list_id = pl.id
      GROUP BY pl.id ORDER BY LOWER(pl.name)
    `).all();
    const members = await env.DB.prepare(`
      SELECT plm.participant_list_id,p.id,p.name,p.phone
      FROM participant_list_member plm JOIN participant p ON p.id = plm.participant_id
      ORDER BY LOWER(p.name)
    `).all();
    const byList = new Map<number, any[]>();
    for (const member of (members.results || []) as any[]) {
      const id = Number(member.participant_list_id);
      if (!byList.has(id)) byList.set(id, []);
      byList.get(id)!.push({ id: member.id, name: member.name, phone: member.phone });
    }
    return json((lists.results || []).map((list: any) => ({
      ...list,
      member_count: Number(list.member_count),
      members: byList.get(Number(list.id)) || []
    })));
  }

  if (request.method === 'POST' && pathname === '/api/admin/participant-lists') {
    const admin = await requireAdmin(request, env);
    if (admin.error) return admin.error;
    const body = await readJson(request) as any;
    if (!body) return badRequest('Expected JSON');
    const name = String(body.name || '').trim();
    const memberIds = integerIds(body.participant_ids);
    if (!name) return badRequest('List name is required');
    if (memberIds.length) {
      const placeholders = memberIds.map(() => '?').join(',');
      const known = await env.DB.prepare(`SELECT COUNT(*) AS count FROM participant WHERE id IN (${placeholders})`)
        .bind(...memberIds).first() as any;
      if (Number(known?.count) !== memberIds.length) return badRequest('List contains an unknown participant');
    }
    try {
      const now = isoNow();
      const created = await env.DB.prepare(`
        INSERT INTO participant_list (name,created_by,created_at,updated_at) VALUES (?,?,?,?)
      `).bind(name, admin.user!.id, now, now).run();
      const id = Number(created.meta.last_row_id);
      if (memberIds.length) {
        await env.DB.batch(memberIds.map((participantId) => env.DB.prepare(`
          INSERT INTO participant_list_member (participant_list_id,participant_id,created_at)
          VALUES (?,?,?)
        `).bind(id, participantId, now)));
      }
      return json({ ok: true, id }, 201);
    } catch (error) {
      if (sqliteConflict(error)) return json({ error: 'A list with that name already exists' }, 409);
      throw error;
    }
  }

  const listMatch = pathname.match(/^\/api\/admin\/participant-lists\/(\d+)$/);
  if (request.method === 'PUT' && listMatch) {
    const admin = await requireAdmin(request, env);
    if (admin.error) return admin.error;
    const body = await readJson(request) as any;
    if (!body) return badRequest('Expected JSON');
    const id = Number(listMatch[1]);
    const name = String(body.name || '').trim();
    const memberIds = integerIds(body.participant_ids);
    if (!name) return badRequest('List name is required');
    if (memberIds.length) {
      const placeholders = memberIds.map(() => '?').join(',');
      const known = await env.DB.prepare(`SELECT COUNT(*) AS count FROM participant WHERE id IN (${placeholders})`)
        .bind(...memberIds).first() as any;
      if (Number(known?.count) !== memberIds.length) return badRequest('List contains an unknown participant');
    }
    const existing = await env.DB.prepare('SELECT id FROM participant_list WHERE id = ?').bind(id).first();
    if (!existing) return notFound('Participant list not found');
    const now = isoNow();
    try {
      await env.DB.batch([
        env.DB.prepare('UPDATE participant_list SET name = ?,updated_at = ? WHERE id = ?').bind(name, now, id),
        env.DB.prepare('DELETE FROM participant_list_member WHERE participant_list_id = ?').bind(id),
        ...memberIds.map((participantId) => env.DB.prepare(`
          INSERT INTO participant_list_member (participant_list_id,participant_id,created_at)
          VALUES (?,?,?)
        `).bind(id, participantId, now))
      ]);
      return json({ ok: true });
    } catch (error) {
      if (sqliteConflict(error)) return json({ error: 'A list with that name already exists' }, 409);
      throw error;
    }
  }

  if (request.method === 'DELETE' && listMatch) {
    const admin = await requireAdmin(request, env);
    if (admin.error) return admin.error;
    const result = await env.DB.prepare('DELETE FROM participant_list WHERE id = ?')
      .bind(Number(listMatch[1])).run();
    if (!result.meta?.changes) return notFound('Participant list not found');
    return json({ ok: true });
  }

  if (request.method === 'GET' && pathname === '/api/user/events') {
    const user = await requireUser(request, env);
    if (!user) return unauthorized();
    const out = await env.DB.prepare(`
      SELECT DISTINCT e.id,e.name,e.date,e.presenter,e.about,e.location,e.requirements,e.image_url,
        e.archived,e.capacity,e.created_at
      FROM event e
      LEFT JOIN event_participant ep ON ep.event_id = e.id AND ep.user_id = ?
      LEFT JOIN event_enrollment ee ON ee.event_id = e.id AND ee.user_id = ? AND ee.status = 'registered'
      WHERE COALESCE(e.archived, 0) = 0 AND (ep.id IS NOT NULL OR ee.id IS NOT NULL)
      ORDER BY e.date DESC
    `).bind(user.id, user.id).all();
    return json(out.results || []);
  }

  const eventParticipantsMatch = pathname.match(/^\/api\/admin\/events\/(\d+)\/participants$/);
  if (request.method === 'GET' && eventParticipantsMatch) {
    const admin = await requireAdmin(request, env);
    if (admin.error) return admin.error;
    const out = await env.DB.prepare(`
      SELECT id,participant_id,user_id,participant_type,name,phone,address
      FROM event_participant WHERE event_id = ? ORDER BY LOWER(name),id
    `).bind(Number(eventParticipantsMatch[1])).all();
    return json(out.results || []);
  }

  return null;
}

async function resolveEventParticipants(env: Env, body: any) {
  const directIds = integerIds(body.participant_ids);
  const listIds = integerIds(body.participant_list_ids);
  const registeredUserIds = integerIds(body.registered_user_ids);
  const registeredIds = new Set<number>(directIds);

  if (listIds.length) {
    const placeholders = listIds.map(() => '?').join(',');
    const knownLists = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM participant_list WHERE id IN (${placeholders})`
    ).bind(...listIds).first() as any;
    if (Number(knownLists?.count) !== listIds.length) {
      return { error: 'Unknown participant list', rows: [] as any[] };
    }
    const expanded = await env.DB.prepare(
      `SELECT participant_id FROM participant_list_member WHERE participant_list_id IN (${placeholders})`
    ).bind(...listIds).all();
    for (const row of (expanded.results || []) as any[]) registeredIds.add(Number(row.participant_id));
  }

  const rows: any[] = [];
  const selectedUserIds = new Set<number>();
  if (registeredIds.size) {
    const ids = [...registeredIds];
    const placeholders = ids.map(() => '?').join(',');
    const participants = await env.DB.prepare(`
      SELECT id,user_id,name,phone,address FROM participant WHERE id IN (${placeholders})
    `).bind(...ids).all();
    if ((participants.results || []).length !== ids.length) {
      return { error: 'Unknown participant', rows: [] as any[] };
    }
    for (const participant of (participants.results || []) as any[]) {
      if (participant.user_id) selectedUserIds.add(Number(participant.user_id));
      rows.push({
        participant_id: Number(participant.id),
        user_id: participant.user_id ? Number(participant.user_id) : null,
        participant_type: 'registered',
        name: String(participant.name),
        phone: participant.phone || null,
        address: participant.address || null
      });
    }
  }

  if (registeredUserIds.length) {
    const placeholders = registeredUserIds.map(() => '?').join(',');
    const users = await env.DB.prepare(`
      SELECT id,name,email FROM user
      WHERE role = 'user' AND id IN (${placeholders})
    `).bind(...registeredUserIds).all();
    if ((users.results || []).length !== registeredUserIds.length) {
      return { error: 'Unknown registered user', rows: [] as any[] };
    }
    for (const user of (users.results || []) as any[]) {
      const userId = Number(user.id);
      if (selectedUserIds.has(userId)) continue;
      selectedUserIds.add(userId);
      rows.push({
        participant_id: null,
        user_id: userId,
        participant_type: 'registered',
        name: String(user.name),
        phone: null,
        address: null
      });
    }
  }

  // Ad-hoc policy: case-insensitive trimmed name plus phone digits. An ad-hoc
  // entry matching a selected registered participant's name/phone is omitted.
  const seen = new Set(rows.map((row) =>
    `${row.name.trim().toLowerCase()}|${phoneDigits(row.phone)}`
  ));
  for (const value of Array.isArray(body.ad_hoc_participants) ? body.ad_hoc_participants : []) {
    const name = String(value?.name || '').trim();
    const phone = normalizePhone(value?.phone);
    const address = String(value?.address || '').trim();
    if (!name) continue;
    const key = `${name.toLowerCase()}|${phoneDigits(phone)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      participant_id: null,
      user_id: null,
      participant_type: 'ad_hoc',
      name,
      phone: phone || null,
      address: address || null
    });
  }
  return { error: null, rows };
}

function eventParticipantStatements(env: Env, eventId: number, rows: any[]) {
  const now = isoNow();
  return rows.map((row) => env.DB.prepare(`
    INSERT INTO event_participant
      (event_id,participant_id,user_id,participant_type,name,phone,address,created_at)
    VALUES (?,?,?,?,?,?,?,?)
  `).bind(
    eventId,
    row.participant_id,
    row.user_id,
    row.participant_type,
    row.name,
    row.phone,
    row.address,
    now
  ));
}

async function handleMilkGiveaway(request: Request, env: Env, pathname: string) {
  if (request.method !== 'POST' || pathname !== '/api/milk-registrations') {
    return null;
  }

  const user = await requireUser(request, env);
  if (!user) return unauthorized('Debe iniciar sesión para registrar a una persona.');

  const body = await readJson(request) as any;
  if (!body) return badRequest('Se esperaba información en formato JSON.');

  const fullName = String(body.full_name || '').trim();
  const phone = normalizePhone(body.phone);
  const babyName = String(body.baby_name || '').trim();
  const babyAgeMonths = Number(body.baby_age_months);
  const formulaType = String(body.formula_type || '').trim();
  const formulaOther = String(body.formula_other || '').trim();

  if (fullName.length < 2 || fullName.length > 120) {
    return badRequest('Escriba el nombre completo de la persona que recibirá la leche.');
  }
  if (phone.replace(/\D/g, '').length < 7 || phone.length > 30) {
    return badRequest('Escriba un número de teléfono válido.');
  }
  if (babyName.length < 2 || babyName.length > 120) {
    return badRequest('Escriba el nombre del bebé.');
  }
  if (!Number.isInteger(babyAgeMonths) || babyAgeMonths < 0 || babyAgeMonths > 36) {
    return badRequest('La edad del bebé debe ser un número de 0 a 36 meses.');
  }
  if (!FORMULA_TYPES.includes(formulaType)) {
    return badRequest('Seleccione un tipo de fórmula de la lista.');
  }
  if (
    formulaType === 'Otra fórmula' &&
    (formulaOther.length < 2 || formulaOther.length > 120)
  ) {
    return badRequest('Escriba el nombre de la fórmula que usa el bebé.');
  }

  const result = await env.DB.prepare(`
    INSERT INTO milk_giveaway_registration
      (registered_by, full_name, phone, baby_name, baby_age_months,
       formula_type, formula_other, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    user.id,
    fullName,
    phone,
    babyName,
    babyAgeMonths,
    formulaType,
    formulaType === 'Otra fórmula' ? formulaOther : null,
    isoNow(),
  ).run();

  return json({
    ok: true,
    registration_id: Number(result.meta.last_row_id),
    message: 'Registro completado.',
  }, 201);
}

async function handleEvents(request: Request, env: Env, pathname: string) {
  const url = new URL(request.url);

  if (request.method === 'GET' && pathname === '/api/events') {
    const limit = Math.min(Number(url.searchParams.get('limit') || '0') || 0, 50);
    const sql =
      'SELECT id,name,date,presenter,about,location,requirements,image_url,archived,capacity,uses_external_participants,created_by,created_at FROM event WHERE COALESCE(archived, 0) = 0 ORDER BY created_at DESC' +
      (limit ? ' LIMIT ?' : '');
    const stmt = env.DB.prepare(sql);
    const out = limit ? await stmt.bind(limit).all() : await stmt.all();
    return json(out.results || []);
  }

  const mRole = pathname.match(/^\/api\/admin\/users\/(\d+)\/role$/);

  if (request.method === 'PATCH' && mRole) {
    console.log("🔥 PATCH /api/admin/users/:id/role HIT");

    const admin = await requireAdmin(request, env);
    if (admin.error) {
      console.log("❌ Not admin");
      return admin.error;
    }

    const userId = Number(mRole[1]);
    console.log("📌 Target userId =", userId);

    try {
      const body = await request.json();
      console.log("📦 Request body =", body);

      const newRole = String(body.role || '').toLowerCase().trim();
      const ALLOWED_ROLES = ['user', 'admin'];

      if (!ALLOWED_ROLES.includes(newRole)) {
        console.log("❌ Invalid role:", newRole);
        return new Response(
          JSON.stringify({ error: 'Invalid role' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const me = admin.user;
      if (me && me.id === userId && newRole !== 'admin') {
        console.log("❌ Attempt to remove own admin rights");
        return new Response(
          JSON.stringify({ error: 'You cannot remove your own admin role' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const result = await env.DB.prepare(
        'UPDATE user SET role = ? WHERE id = ?'
      ).bind(newRole, userId).run();

      console.log("✅ DB update result =", result);

      if (!result.meta || result.meta.changes === 0) {
        console.log("❌ User not found");
        return new Response(
          JSON.stringify({ error: 'User not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          ok: true,
          user_id: userId,
          role: newRole
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (err) {
      console.error("❌ PATCH role failed:", err);
      return new Response(
        JSON.stringify({ error: 'Server error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  /*****************************************************************************
   * BEGIN handle event feedback edit / delete
   *****************************************************************************/
  const mFeedbackById = pathname.match(/^\/api\/event-feedback\/(\d+)$/);

  // Edit feedback (owner or admin)
  if (request.method === 'PATCH' && mFeedbackById) {
    const u = await requireUser(request, env);
    if (!u) return unauthorized();

    const feedbackId = Number(mFeedbackById[1]);
    const body = await readJson(request);
    if (!body) return badRequest('Expected JSON');

    const feedback = String(body.feedback || '').trim();
    if (!feedback) return badRequest('Feedback is required');

    const existing = await env.DB.prepare(`
      SELECT id, user_id
      FROM event_feedback
      WHERE id = ?
    `).bind(feedbackId).first<any>();

    if (!existing) return notFound('Feedback not found');

    const isOwner = Number(existing.user_id) === Number(u.id);
    const isAdmin = (u.role || "").toLowerCase() === "admin";

    if (!isOwner && !isAdmin) {
      return forbidden("Not allowed");
    }

    await env.DB.prepare(`
      UPDATE event_feedback
      SET feedback = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      feedback,
      isoNow(),
      feedbackId
    ).run();

    return json({ ok: true });
  }
  /*****************************************************************************
   * END handle event feedback edit / delete
   *****************************************************************************/

  const m = pathname.match(/^\/api\/events\/(\d+)$/);
  if (request.method === 'GET' && m) {
    const id = Number(m[1]);
    const e = await env.DB.prepare('SELECT * FROM event WHERE id = ?').bind(id).first() as any;
    if (!e) return notFound();

    const countRow = await env.DB.prepare(
      'SELECT COUNT(1) as c FROM event_enrollment WHERE event_id = ? AND status = ?'
    ).bind(id, 'registered').first() as any;

    const enrolled_count = Number(countRow?.c || 0);
    let enrolled = false;

    const u = await requireUser(request, env);
    if (u) {
      const row = await env.DB.prepare(
        'SELECT 1 as x FROM event_enrollment WHERE user_id = ? AND event_id = ? AND status = ?'
      ).bind(u.id, id, 'registered').first();
      enrolled = !!row;
    }

    return json({ ...e, enrolled_count, enrolled });
  }

  if (request.method === 'PATCH' && m) {
    const admin = await requireAdmin(request, env);
    if (admin.error) return admin.error;

    const id = Number(m[1]);
    const body = await readJson(request);
    if (!body) return badRequest('Expected JSON');

    const name = String(body.name || '').trim();
    const presenter = String(body.presenter || '').trim();
    const about = String(body.about || '').trim();
    const location = String(body.location || '').trim();
    const requirements = body.requirements ? String(body.requirements).trim() : null;
    const imageUrl = body.image_url ? String(body.image_url).trim() : '';
    const date = toIso(body.date);
    const capacity = Math.max(0, Number(body.capacity || 0) || 0);
    const usesExternalParticipants = body.uses_external_participants ? 1 : 0;

    if (!name || !presenter || !about || !location || !date) {
      return badRequest('Missing required fields');
    }

    const replacesParticipants =
      (body as any).uses_external_participants !== undefined ||
      Array.isArray((body as any).participant_ids) ||
      Array.isArray((body as any).participant_list_ids) ||
      Array.isArray((body as any).registered_user_ids) ||
      Array.isArray((body as any).ad_hoc_participants);
    const resolved = replacesParticipants && usesExternalParticipants
      ? await resolveEventParticipants(env, body)
      : { error: null, rows: [] };
    if (resolved.error) return badRequest(resolved.error);

    const update = env.DB.prepare(`
      UPDATE event
      SET name = ?, date = ?, presenter = ?, about = ?, location = ?, requirements = ?,
          image_url = COALESCE(NULLIF(?, ''), image_url), capacity = ?,
          uses_external_participants = ?
      WHERE id = ?
    `).bind(name, date, presenter, about, location, requirements, imageUrl, capacity, usesExternalParticipants, id);
    const result = replacesParticipants
      ? (await env.DB.batch([
          update,
          env.DB.prepare('DELETE FROM event_participant WHERE event_id = ?').bind(id),
          ...eventParticipantStatements(env, id, resolved.rows)
        ]))[0]
      : await update.run();

    if (!result.meta || result.meta.changes === 0) return notFound('Event not found');
    return json({ ok: true, id });
  }

  if (request.method === 'GET' && pathname === '/eventog') {
    const id = Number(url.searchParams.get("id"));
    if (!id || Number.isNaN(id)) {
      return new Response("Missing event id", {
        status: 400,
        headers: {
          "content-type": "text/plain; charset=UTF-8",
          "cache-control": "no-store"
        }
      });
    }

    const e = await env.DB.prepare('SELECT * FROM event WHERE id = ?').bind(id).first() as any;
    if (!e) return new Response("Event not found", { status: 404 });

    const title = escapeHtml(e.name || "Tu Mejor Versión");
    const description = escapeHtml(
      [
        e.date ? `Fecha: ${e.date}` : "",
        e.location ? `Lugar: ${e.location}` : "",
        e.presenter ? `Presentador: ${e.presenter}` : "",
        e.about ? String(e.about).replace(/\s+/g, " ").trim() : ""
      ]
        .filter(Boolean)
        .join(" · ")
        .slice(0, 240)
    );
    const ogImage = absoluteImageUrl(url.origin, e.image_url);
    const realEventUrl = `${url.origin}/event.html?id=${id}`;
    const ogUrl = `${url.origin}/eventog?id=${id}`;

    const html = `<!doctype html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
      <meta property="og:type" content="website">
      <meta property="og:title" content="${title}">
      <meta property="og:description" content="${description}">
      <meta property="og:image" content="${ogImage}">
      <meta property="og:url" content="${ogUrl}">
      <meta property="og:site_name" content="Tu Mejor Versión">
      <meta name="description" content="${description}">
      <link rel="canonical" href="${ogUrl}">
      <script>window.location.replace("${realEventUrl}");</script>
    </head>
    <body>
      <p>Redirigiendo al evento...</p>
      <p><a href="${realEventUrl}">Abrir evento</a></p>
    </body>
    </html>`;

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=UTF-8",
        "cache-control": "no-store"
      }
    });
  }

  const mEnroll = pathname.match(/^\/api\/events\/(\d+)\/enroll$/);
  if (request.method === 'POST' && mEnroll) {
    const u = await requireUser(request, env);
    if (!u) return unauthorized();

    const id = Number(mEnroll[1]);
    const e = await env.DB.prepare('SELECT id,capacity,uses_external_participants FROM event WHERE id = ?').bind(id).first() as any;
    if (!e) return notFound();
    if (Number(e.uses_external_participants || 0) === 1) {
      return badRequest('This event uses an administrator-managed participant list');
    }

    if (Number(e.capacity || 0) > 0) {
      const countRow = await env.DB.prepare(
        'SELECT COUNT(1) as c FROM event_enrollment WHERE event_id = ? AND status = ?'
      ).bind(id, 'registered').first() as any;

      if (Number(countRow?.c || 0) >= Number(e.capacity)) {
        return badRequest('Event is full');
      }
    }

    const existing = await env.DB.prepare(
      'SELECT id FROM event_enrollment WHERE user_id = ? AND event_id = ?'
    ).bind(u.id, id).first() as any;

    if (existing) {
      await env.DB.prepare(
        'UPDATE event_enrollment SET status = ?, created_at = ? WHERE id = ?'
      ).bind('registered', isoNow(), existing.id).run();
    } else {
      await env.DB.prepare(
        'INSERT INTO event_enrollment (user_id,event_id,status,created_at) VALUES (?,?,?,?)'
      ).bind(u.id, id, 'registered', isoNow()).run();
    }

    return json({ ok: true });
  }

  const mCancel = pathname.match(/^\/api\/events\/(\d+)\/cancel$/);
  if (request.method === 'POST' && mCancel) {
    const u = await requireUser(request, env);
    if (!u) return unauthorized();

    const id = Number(mCancel[1]);
    const existing = await env.DB.prepare(
      'SELECT id FROM event_enrollment WHERE user_id = ? AND event_id = ?'
    ).bind(u.id, id).first() as any;

    if (existing) {
      await env.DB.prepare(
        'UPDATE event_enrollment SET status = ?, created_at = ? WHERE id = ?'
      ).bind('cancelled', isoNow(), existing.id).run();
    }

    return json({ ok: true });
  }

  const mReg = pathname.match(/^\/api\/events\/(\d+)\/registered$/);
  if (request.method === 'GET' && mReg) {
    const admin = await requireAdmin(request, env);
    if (admin.error) return admin.error;

    const id = Number(mReg[1]);
    const out = await env.DB.prepare(
      'SELECT u.id,u.email,u.name,u.role,u.created_at FROM user u JOIN event_enrollment ee ON u.id = ee.user_id WHERE ee.event_id = ? AND ee.status = ? ORDER BY u.id ASC'
    ).bind(id, 'registered').all();

    return json(out.results || []);
  }

  const mFeedback = pathname.match(/^\/api\/events\/(\d+)\/feedback$/);
  const mEventFeedbackApprove = pathname.match(/^\/api\/event-feedback\/(\d+)\/approve$/);

  // Get feedback for one event
  if (request.method === 'GET' && mFeedback) {
    const eventId = Number(mFeedback[1]);

    const out = await env.DB.prepare(`
      SELECT
        ef.id,
        ef.event_id,
        ef.user_id,
        ef.name,
        ef.feedback,
        ef.approved,
        ef.created_at,
        ef.updated_at
      FROM event_feedback ef
      WHERE ef.event_id = ?
        AND ef.approved = 1
      ORDER BY ef.created_at DESC
    `).bind(eventId).all();

    return json(out.results || []);
  }

  // Add feedback to one event
  if (request.method === 'POST' && mFeedback) {
    const u = await requireUser(request, env);
    if (!u) return unauthorized();

    const eventId = Number(mFeedback[1]);

    const e = await env.DB.prepare(
      'SELECT id FROM event WHERE id = ?'
    ).bind(eventId).first();

    if (!e) return notFound('Event not found');

    const body = await readJson(request);
    if (!body) return badRequest('Expected JSON');

    const feedback = String(body.feedback || '').trim();
    if (!feedback) return badRequest('Feedback is required');

    const displayName = String(u.name || u.email || 'User').trim();

    const res = await env.DB.prepare(`
      INSERT INTO event_feedback (event_id, user_id, name, feedback, approved, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      eventId,
      u.id,
      u.name || u.email || 'User',
      feedback,
      0,
      isoNow(),
      isoNow()
    ).run();

    return json({
      ok: true,
      id: res.meta.last_row_id,
      name: displayName
    });
  }

  // Approve event feedback (admin only)
  if (request.method === 'PATCH' && mEventFeedbackApprove) {
    const admin = await requireAdmin(request, env);
    if (admin.error) return admin.error;

    const feedbackId = Number(mEventFeedbackApprove[1]);
    const body = await readJson(request);
    const approved = body && typeof body.approved !== 'undefined' ? (body.approved ? 1 : 0) : 1;

    const result = await env.DB.prepare(`
      UPDATE event_feedback
      SET approved = ?, updated_at = ?
      WHERE id = ?
    `).bind(approved, isoNow(), feedbackId).run();

    if (!result.meta || result.meta.changes === 0) {
      return notFound('Feedback not found');
    }

    return json({ ok: true });
  }

  // Admin delete feedback
  if (request.method === 'DELETE' && mFeedbackById) {
    const admin = await requireAdmin(request, env);
    if (admin.error) return admin.error;

    const feedbackId = Number(mFeedbackById[1]);

    const result = await env.DB.prepare(`
      DELETE FROM event_feedback
      WHERE id = ?
    `).bind(feedbackId).run();

    if (!result.meta || result.meta.changes === 0) {
      return notFound('Feedback not found');
    }

    return json({ ok: true });
  }

  if (request.method === 'POST' && pathname === '/api/events') {
    const admin = await requireAdmin(request, env);
    if (admin.error) return admin.error;

    const body = await readJson(request);
    if (!body) return badRequest('Expected JSON');

    const name = String(body.name || '').trim();
    const presenter = String(body.presenter || '').trim();
    const about = String(body.about || '').trim();
    const location = String(body.location || '').trim();
    const requirements = body.requirements ? String(body.requirements).trim() : null;
    const imageUrl = body.image_url ? String(body.image_url).trim() : null;
    const date = toIso(body.date);
    const capacity = Math.max(0, Number(body.capacity || 0) || 0);
    const usesExternalParticipants = body.uses_external_participants ? 1 : 0;

    if (!name || !presenter || !about || !location || !date) {
      return badRequest('Missing required fields');
    }

    const resolved = usesExternalParticipants
      ? await resolveEventParticipants(env, body)
      : { error: null, rows: [] };
    if (resolved.error) return badRequest(resolved.error);

    const res = await env.DB.prepare(
      'INSERT INTO event (name,date,presenter,about,location,requirements,image_url,capacity,uses_external_participants,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(
      name,
      date,
      presenter,
      about,
      location,
      requirements,
      imageUrl,
      capacity,
      usesExternalParticipants,
      admin.user!.id,
      isoNow()
    ).run();

    const eventId = Number(res.meta.last_row_id);
    if (resolved.rows.length) {
      await env.DB.batch(eventParticipantStatements(env, eventId, resolved.rows));
    }
    return json({ id: eventId });
  }

  const mDel = pathname.match(/^\/api\/events\/(\d+)$/);
  if (request.method === 'DELETE' && mDel) {
    const admin = await requireAdmin(request, env);
    if (admin.error) return admin.error;

    const id = Number(mDel[1]);
    await env.DB.prepare('UPDATE event SET archived = 1 WHERE id = ?').bind(id).run();

    return json({ ok: true, archived: true });
  }

  return null;
}
/*******************************************************************
 * END Handle Events  
******************************************************************** */
async function handleWorkshops(request: Request, env: Env, pathname: string) {
  const url = new URL(request.url);

  if (request.method === 'GET' && pathname === '/api/workshops') {
    const limit = Math.min(Number(url.searchParams.get('limit') || '0') || 0, 50);
    const sql =
      'SELECT id,name,date,presenter,about,location,requirements,image_url,archived,capacity,created_by,created_at FROM workshop WHERE COALESCE(archived, 0) = 0 ORDER BY created_at DESC' +
      (limit ? ' LIMIT ?' : '');
    const stmt = env.DB.prepare(sql);
    const out = limit ? await stmt.bind(limit).all() : await stmt.all();
    return json(out.results || []);
  }

  if (request.method === 'GET' && pathname === '/workshopog') {
    const id = Number(url.searchParams.get("id"));
    if (!id || Number.isNaN(id)) {
      return new Response("Missing workshop id", {
        status: 400,
        headers: {
          "content-type": "text/plain; charset=UTF-8",
          "cache-control": "no-store"
        }
      });
    }

    const w = await env.DB.prepare('SELECT * FROM workshop WHERE id = ?').bind(id).first() as any;
    if (!w) return new Response("Workshop not found", { status: 404 });

    const title = escapeHtml(w.name || "Tu Mejor Versión");
    const description = escapeHtml(
      [
        w.date ? `Fecha: ${w.date}` : "",
        w.location ? `Lugar: ${w.location}` : "",
        w.presenter ? `Presentador: ${w.presenter}` : "",
        w.about ? String(w.about).replace(/\s+/g, " ").trim() : ""
      ]
        .filter(Boolean)
        .join(" · ")
        .slice(0, 240)
    );
    const ogImage = absoluteImageUrl(url.origin, w.image_url);
    const realWorkshopUrl = `${url.origin}/workshop.html?id=${id}`;
    const ogUrl = `${url.origin}/workshopog?id=${id}`;
    const userAgent = request.headers.get("user-agent") || "";
    const isPreviewBot = /facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|discordbot/i.test(userAgent);

    if (!isPreviewBot) {
      return Response.redirect(realWorkshopUrl, 302);
    }

    const html = `<!doctype html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
      <meta property="og:type" content="website">
      <meta property="og:title" content="${title}">
      <meta property="og:description" content="${description}">
      <meta property="og:image" content="${ogImage}">
      <meta property="og:url" content="${ogUrl}">
      <meta property="og:site_name" content="Tu Mejor Versión">
      <meta name="description" content="${description}">
      <link rel="canonical" href="${ogUrl}">
      <script>window.location.replace("${realWorkshopUrl}");</script>
    </head>
    <body>
      <p>Redirigiendo al taller...</p>
      <p><a href="${realWorkshopUrl}">Abrir taller</a></p>
    </body>
    </html>`;

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=UTF-8",
        "cache-control": "no-store"
      }
    });
  }

  const m = pathname.match(/^\/api\/workshops\/(\d+)$/);
  if (request.method === 'GET' && m) {
    const id = Number(m[1]);
    const w = await env.DB.prepare('SELECT * FROM workshop WHERE id = ?').bind(id).first() as any;
    if (!w) return notFound();

    return json(w);
  }

  if (request.method === 'PATCH' && m) {
    const admin = await requireAdmin(request, env);
    if (admin.error) return admin.error;

    const id = Number(m[1]);
    const body = await readJson(request);
    if (!body) return badRequest('Expected JSON');

    const name = String(body.name || '').trim();
    const presenter = String(body.presenter || '').trim();
    const about = String(body.about || '').trim();
    const location = String(body.location || '').trim();
    const requirements = body.requirements ? String(body.requirements).trim() : null;
    const imageUrl = body.image_url ? String(body.image_url).trim() : '';
    const date = toIso(body.date);
    const capacity = Math.max(0, Number(body.capacity || 0) || 0);

    if (!name || !presenter || !about || !location || !date) {
      return badRequest('Missing required fields');
    }

    const result = await env.DB.prepare(`
      UPDATE workshop
      SET name = ?, date = ?, presenter = ?, about = ?, location = ?, requirements = ?,
          image_url = COALESCE(NULLIF(?, ''), image_url), capacity = ?
      WHERE id = ?
    `).bind(name, date, presenter, about, location, requirements, imageUrl, capacity, id).run();

    if (!result.meta || result.meta.changes === 0) return notFound('Workshop not found');
    return json({ ok: true, id });
  }

  if (request.method === 'POST' && pathname === '/api/workshops') {
    const u = await requireUser(request, env);
    if (!u) return unauthorized();
    if (!(u.role === 'admin' || u.role === 'instructor')) return forbidden();

    const body = await readJson(request);
    if (!body) return badRequest('Expected JSON');

    const name = String(body.name || '').trim();
    const presenter = String(body.presenter || '').trim();
    const about = String(body.about || '').trim();
    const location = String(body.location || '').trim();
    const requirements = body.requirements ? String(body.requirements).trim() : null;
    const imageUrl = body.image_url ? String(body.image_url).trim() : null;
    const date = toIso(body.date);
    const capacity = Math.max(0, Number(body.capacity || 0) || 0);

    if (!name || !presenter || !about || !location || !date) {
      return badRequest('Missing required fields');
    }

    const res = await env.DB.prepare(
      'INSERT INTO workshop (name,date,presenter,about,location,requirements,image_url,capacity,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).bind(name, date, presenter, about, location, requirements, imageUrl, capacity, u.id, isoNow()).run();

    return json({ id: res.meta.last_row_id });
  }

  if (request.method === 'DELETE' && m) {
    const admin = await requireAdmin(request, env);
    if (admin.error) return admin.error;
    const id = Number(m[1]);
    await env.DB.prepare('UPDATE workshop SET archived = 1 WHERE id = ?').bind(id).run();
    return json({ ok: true, archived: true });
  }

  const mFeedback = pathname.match(/^\/api\/workshops\/(\d+)\/feedback$/);
  if (request.method === 'GET' && mFeedback) {
    const workshopId = Number(mFeedback[1]);
    const out = await env.DB.prepare(`
      SELECT id, workshop_id, user_id, name, feedback, approved, created_at, updated_at
      FROM workshop_feedback
      WHERE workshop_id = ?
        AND approved = 1
      ORDER BY created_at DESC
    `).bind(workshopId).all();
    return json(out.results || []);
  }

  if (request.method === 'POST' && mFeedback) {
    const u = await requireUser(request, env);
    if (!u) return unauthorized();
    const workshopId = Number(mFeedback[1]);
    const w = await env.DB.prepare('SELECT id FROM workshop WHERE id = ?').bind(workshopId).first();
    if (!w) return notFound('Workshop not found');

    const body = await readJson(request);
    if (!body) return badRequest('Expected JSON');
    const feedback = String(body.feedback || '').trim();
    if (!feedback) return badRequest('Feedback is required');

    const displayName = String(u.name || u.email || 'User').trim();
    const res = await env.DB.prepare(`
      INSERT INTO workshop_feedback (workshop_id, user_id, name, feedback, approved, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(workshopId, u.id, displayName, feedback, 0, isoNow(), isoNow()).run();

    return json({ ok: true, id: res.meta.last_row_id, name: displayName });
  }

  const mFeedbackById = pathname.match(/^\/api\/workshop-feedback\/(\d+)$/);
  const mFeedbackApprove = pathname.match(/^\/api\/workshop-feedback\/(\d+)\/approve$/);

  if (request.method === 'PATCH' && mFeedbackApprove) {
    const admin = await requireAdmin(request, env);
    if (admin.error) return admin.error;
    const feedbackId = Number(mFeedbackApprove[1]);
    const body = await readJson(request);
    const approved = body && typeof body.approved !== 'undefined' ? (body.approved ? 1 : 0) : 1;
    const result = await env.DB.prepare(`
      UPDATE workshop_feedback
      SET approved = ?, updated_at = ?
      WHERE id = ?
    `).bind(approved, isoNow(), feedbackId).run();
    if (!result.meta || result.meta.changes === 0) return notFound('Feedback not found');
    return json({ ok: true });
  }

  if (request.method === 'DELETE' && mFeedbackById) {
    const admin = await requireAdmin(request, env);
    if (admin.error) return admin.error;
    const feedbackId = Number(mFeedbackById[1]);
    const result = await env.DB.prepare('DELETE FROM workshop_feedback WHERE id = ?').bind(feedbackId).run();
    if (!result.meta || result.meta.changes === 0) return notFound('Feedback not found');
    return json({ ok: true });
  }

  if (request.method === 'GET' && pathname === '/api/admin/workshop-feedback') {
    const admin = await requireAdmin(request, env);
    if (admin.error) return admin.error;
    const pendingOnly = url.searchParams.get('pending') === 'true';
    const out = await env.DB.prepare(`
      SELECT
        wf.id,
        wf.workshop_id,
        w.name AS workshop_name,
        wf.user_id,
        wf.name,
        wf.feedback,
        wf.approved,
        wf.created_at,
        wf.updated_at
      FROM workshop_feedback wf
      JOIN workshop w ON w.id = wf.workshop_id
      ${pendingOnly ? 'WHERE wf.approved = 0' : ''}
      ORDER BY wf.created_at DESC
    `).all();
    return json(out.results || []);
  }

  return null;
}

async function handleCourses(request: Request, env: Env, pathname: string) {
  const url = new URL(request.url);

  // 🔥 GLOBAL ENTRY LOG (MOST IMPORTANT)
  console.log("🚨 handleCourses CALLED");
  console.log("   method:", request.method);
  console.log("   pathname:", pathname);
  console.log("   full URL:", url.toString());
  console.log("   search:", url.search);

  // 🔍 DEBUG CONDITIONS
  console.log("🔎 Checking route conditions...");
  console.log("   matches /api/courses:", pathname === '/api/courses');
  console.log("   matches /course:", pathname === '/course');

  // =========================
  // API: GET /api/courses
  // =========================
  if (request.method === 'GET' && pathname === '/api/courses') {
    console.log("✅ MATCHED: /api/courses");

    const limit = Math.min(Number(url.searchParams.get('limit') || '0') || 0, 50);
    console.log("🔢 limit:", limit);

    const sql =
      'SELECT id,name,date,presenter,about,location,requirements,image_url,archived,capacity,created_by,created_at FROM course WHERE COALESCE(archived, 0) = 0 ORDER BY created_at DESC' +
      (limit ? ' LIMIT ?' : '');

    console.log("🗄️ SQL:", sql);

    const stmt = env.DB.prepare(sql);
    const out = limit ? await stmt.bind(limit).all() : await stmt.all();

    console.log("📦 results count:", (out.results || []).length);

    return json(out.results || []);
  }

  // =========================
  // PAGE: GET /course?id=...
  // =========================
  // =========================
  // FB OG PAGE: GET /courseog?id=...
  // =========================
  if (request.method === 'GET' && pathname === '/courseog') {
    console.log("🚀 MATCHED: /courseog route");
    console.log("🌐 Full URL:", url.toString());

    const idParam = url.searchParams.get("id");
    console.log("🔍 Raw id param:", idParam);

    const id = Number(idParam);
    console.log("🔢 Parsed id:", id);

    if (!id || Number.isNaN(id)) {
      console.error("❌ Invalid or missing course id");
      return new Response("Missing course id", {
        status: 400,
        headers: {
          "content-type": "text/plain; charset=UTF-8",
          "cache-control": "no-store"
        }
      });
    }

    console.log("🗄️ Querying DB for course id:", id);

    let c: any;
    try {
      c = await env.DB
        .prepare('SELECT * FROM course WHERE id = ?')
        .bind(id)
        .first();

      console.log("📦 DB result:", c);
    } catch (err) {
      console.error("❌ DB query failed:", err);
      return new Response("DB error", { status: 500 });
    }

    if (!c) {
      console.error("❌ Course not found for id:", id);
      return new Response("Course not found", { status: 404 });
    }

    const title = escapeHtml(c.name || "Tu Mejor Versión");
    const c_date = c.date;
    const description = escapeHtml(
      [
        c.date ? `Fecha: ${c.date}` : "",
        c.location ? `Lugar: ${c.location}` : "",
        c.presenter ? `Presentador: ${c.presenter}` : "",
        c.about ? String(c.about).replace(/\s+/g, " ").trim() : ""
      ]
        .filter(Boolean)
        .join(" · ")
        .slice(0, 240)
    );

    const ogImage = absoluteImageUrl(url.origin, c.image_url);

    //const ogImage = `${url.origin}/static/images/${c.image_url}`;
    const realCourseUrl = `${url.origin}/course?id=${id}`;
    const ogUrl = `${url.origin}/courseog?id=${id}`;

    console.log("🧠 Building OG-only page:");
    console.log("   title:", title);
    console.log("   date:", c_date);
    console.log("   description:", description);
    console.log("   ogImage:", ogImage);
    console.log("   ogUrl:", ogUrl);
    console.log("   realCourseUrl:", realCourseUrl);

    const html = `<!doctype html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <title>${title}</title>

      <!-- OG_DEBUG_COURSEOG_HANDLER -->
      <meta property="og:type" content="website">
      <meta property="og:title" content="${title}">
      <meta property="og:description" content="${description}">
      <meta property="og:image" content="${ogImage}">
      <meta property="og:url" content="${ogUrl}">
      <meta property="og:site_name" content="Tu Mejor Versión">

      <meta name="description" content="${description}">
      <link rel="canonical" href="${ogUrl}">

      <script>
        window.location.replace("${realCourseUrl}");
      </script>
    </head>
    <body>
      <p>Redirigiendo al curso...</p>
      <p><a href="${realCourseUrl}">Abrir curso</a></p>
    </body>
    </html>`;

    console.log("✅ OG-only HTML generated");
    console.log("📄 HTML preview:", html.slice(0, 300));
    console.log("📤 Returning /courseog HTML response for course id:", id);

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=UTF-8",
        "cache-control": "no-store"
      }
    });
  }


 /*************
   * END FB Course handler and return met
   */

  /*************
   * BEGIN app Course handler and return met
   */

  const m = pathname.match(/^\/api\/courses\/(\d+)$/);

  if (request.method === 'GET' && m) {
    console.log("🚀 /api/courses/:id route HIT");
    console.log("🌐 Full URL:", request.url);
    console.log("📍 Pathname:", pathname);

    const id = Number(m[1]);
    console.log("🔢 Parsed course id:", id);

    // =========================
    // DB: Fetch course
    // =========================
    console.log("🗄️ Querying course table...");

    let c: any;
    try {
      c = await env.DB
        .prepare('SELECT * FROM course WHERE id = ?')
        .bind(id)
        .first();

      console.log("📦 Course DB result:", c);
    } catch (err) {
      console.error("❌ DB error (course):", err);
      return new Response("DB error", { status: 500 });
    }

    if (!c) {
      console.error("❌ Course not found for id:", id);
      return notFound();
    }

    // =========================
    // DB: Enrollment count
    // =========================
    console.log("🧮 Counting enrolled users...");

    let countRow: any;
    try {
      countRow = await env.DB
        .prepare('SELECT COUNT(1) as c FROM enrollment WHERE course_id = ? AND status = ?')
        .bind(id, 'registered')
        .first();

      console.log("📊 Enrollment count row:", countRow);
    } catch (err) {
      console.error("❌ DB error (count):", err);
    }

    const enrolled_count = Number(countRow?.c || 0);
    console.log("👥 Total enrolled:", enrolled_count);

    // =========================
    // Auth: Current user
    // =========================
    console.log("🔐 Checking current user session...");

    let enrolled = false;
    let u: any = null;

    try {
      u = await requireUser(request, env);
      console.log("👤 Current user:", u);
    } catch (err) {
      console.error("❌ Error retrieving user:", err);
    }

    if (u) {
      console.log("🔎 Checking if user is enrolled...");

      try {
        const row = await env.DB
          .prepare('SELECT 1 as x FROM enrollment WHERE user_id = ? AND course_id = ? AND status = ?')
          .bind(u.id, id, 'registered')
          .first();

        console.log("📄 Enrollment row for user:", row);

        enrolled = !!row;
      } catch (err) {
        console.error("❌ DB error (user enrollment):", err);
      }
    }

    console.log("✅ User enrolled status:", enrolled);

    // =========================
    // OG META BUILD
    // =========================
    const origin = new URL(request.url).origin;
    console.log("🌍 Origin:", origin);

    const og_title = c.name || 'Course';
    const og_date = c.date;

    const og_description = [
      c.date ? `Date: ${c.date}` : '',
      c.location ? `Location: ${c.location}` : '',
      c.about ? String(c.about).replace(/\s+/g, ' ').trim() : ''
    ]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 220);

    const og_image = absoluteImageUrl(origin, c.image_url);
    const og_url = `${origin}/course?id=${id}`;
    const og_type = 'website';

    console.log("🧠 OG DATA:");
    console.log("   title:", og_title);
    console.log("   description:", og_description);
    console.log("   image:", og_image);
    console.log("   url:", og_url);
    console.log("   type:", og_type);

    console.log("📤 Returning JSON response for course id:", id);

    return json({
      ...c,
      enrolled_count,
      enrolled,
      og_title,
      og_description,
      og_image,
      og_url,
      og_type
    });
  }

  if (request.method === 'PATCH' && m) {
    const admin = await requireAdmin(request, env);
    if (admin.error) return admin.error;

    const id = Number(m[1]);
    const body = await readJson(request);
    if (!body) return badRequest('Expected JSON');

    const name = String(body.name || '').trim();
    const presenter = String(body.presenter || '').trim();
    const about = String(body.about || '').trim();
    const location = String(body.location || '').trim();
    const requirements = body.requirements ? String(body.requirements).trim() : null;
    const imageUrl = body.image_url ? String(body.image_url).trim() : '';
    const date = toIso(body.date);
    const capacity = Math.max(0, Number(body.capacity || 0) || 0);

    if (!name || !presenter || !about || !location || !date) {
      return badRequest('Missing required fields');
    }

    const result = await env.DB.prepare(`
      UPDATE course
      SET name = ?, date = ?, presenter = ?, about = ?, location = ?, requirements = ?,
          image_url = COALESCE(NULLIF(?, ''), image_url), capacity = ?
      WHERE id = ?
    `).bind(name, date, presenter, about, location, requirements, imageUrl, capacity, id).run();

    if (!result.meta || result.meta.changes === 0) return notFound('Course not found');
    return json({ ok: true, id });
  }

  const mEnroll = pathname.match(/^\/api\/courses\/(\d+)\/enroll$/);
  if (request.method === 'POST' && mEnroll) {
    const u = await requireUser(request, env);
    if (!u) return unauthorized();
    const id = Number(mEnroll[1]);
    const c = await env.DB.prepare('SELECT id,capacity FROM course WHERE id = ?').bind(id).first() as any;
    if (!c) return notFound();
    if (Number(c.capacity || 0) > 0) {
      const countRow = await env.DB.prepare('SELECT COUNT(1) as c FROM enrollment WHERE course_id = ? AND status = ?').bind(id, 'registered').first() as any;
      if (Number(countRow?.c || 0) >= Number(c.capacity)) return badRequest('Course is full');
    }
    const existing = await env.DB.prepare('SELECT id FROM enrollment WHERE user_id = ? AND course_id = ?').bind(u.id, id).first() as any;
    if (existing) {
      await env.DB.prepare('UPDATE enrollment SET status = ?, created_at = ? WHERE id = ?').bind('registered', isoNow(), existing.id).run();
    } else {
      await env.DB.prepare('INSERT INTO enrollment (user_id,course_id,status,created_at) VALUES (?,?,?,?)').bind(u.id, id, 'registered', isoNow()).run();
    }
    return json({ ok: true });
  }

  const mCancel = pathname.match(/^\/api\/courses\/(\d+)\/cancel$/);
  if (request.method === 'POST' && mCancel) {
    const u = await requireUser(request, env);
    if (!u) return unauthorized();
    const id = Number(mCancel[1]);
    const existing = await env.DB.prepare('SELECT id FROM enrollment WHERE user_id = ? AND course_id = ?').bind(u.id, id).first() as any;
    if (existing) {
      await env.DB.prepare('UPDATE enrollment SET status = ?, created_at = ? WHERE id = ?').bind('cancelled', isoNow(), existing.id).run();
    }
    return json({ ok: true });
  }

  const mReg = pathname.match(/^\/api\/courses\/(\d+)\/registered$/);
  if (request.method === 'GET' && mReg) {
    const admin = await requireAdmin(request, env);
    if (admin.error) return admin.error;
    const id = Number(mReg[1]);
    const out = await env.DB.prepare(
      'SELECT u.id,u.email,u.name,u.role,u.created_at FROM user u JOIN enrollment e ON u.id = e.user_id WHERE e.course_id = ? AND e.status = ? ORDER BY u.id ASC'
    ).bind(id, 'registered').all();
    return json(out.results || []);
  }

  // Create course (instructor/admin)
  if (request.method === 'POST' && pathname === '/api/courses') {
    const u = await requireUser(request, env);
    if (!u) return unauthorized();
    if (!(u.role === 'admin' || u.role === 'instructor')) return forbidden();
    const body = await readJson(request);
    if (!body) return badRequest('Expected JSON');
    const name = String(body.name || '').trim();
    const presenter = String(body.presenter || '').trim();
    const about = String(body.about || '').trim();
    const location = String(body.location || '').trim();
    const requirements = body.requirements ? String(body.requirements).trim() : null;
    const imageUrl = body.image_url ? String(body.image_url).trim() : null;
    const date = toIso(body.date);
    const capacity = Math.max(0, Number(body.capacity || 0) || 0);
    if (!name || !presenter || !about || !location || !date) return badRequest('Missing required fields');

    const res = await env.DB.prepare(
      'INSERT INTO course (name,date,presenter,about,location,requirements,image_url,capacity,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).bind(name, date, presenter, about, location, requirements, imageUrl, capacity, u.id, isoNow()).run();
    return json({ id: res.meta.last_row_id });
  }

  // Delete course (admin)
  const mDel = pathname.match(/^\/api\/courses\/(\d+)$/);
  if (request.method === 'DELETE' && mDel) {
    const admin = await requireAdmin(request, env);
    if (admin.error) return admin.error;
    const id = Number(mDel[1]);
    await env.DB.prepare('UPDATE course SET archived = 1 WHERE id = ?').bind(id).run();
    return json({ ok: true, archived: true });
  }

  const mCourseFeedback = pathname.match(/^\/api\/courses\/(\d+)\/feedback$/);
  const mCourseFeedbackApprove = pathname.match(/^\/api\/course-feedback\/(\d+)\/approve$/);
  const mCourseFeedbackById = pathname.match(/^\/api\/course-feedback\/(\d+)$/);

  if (request.method === 'GET' && pathname === '/api/testimonials') {
    const out = await env.DB.prepare(`
      SELECT
        id,
        name,
        testimony,
        video_url,
        testimony_approved,
        video_approved,
        created_at
      FROM user
      WHERE
        (
          testimony IS NOT NULL
          AND TRIM(testimony) != ''
          AND testimony_approved = 1
        )
        OR
        (
          video_url IS NOT NULL
          AND TRIM(video_url) != ''
          AND video_approved = 1
        )
      ORDER BY created_at DESC
    `).all();

    return json(out.results || []);
  }

  // Get feedback for one course
  if (request.method === 'GET' && mCourseFeedback) {
    const courseId = Number(mCourseFeedback[1]);

    const out = await env.DB.prepare(`
      SELECT
        cf.id,
        cf.course_id,
        cf.user_id,
        cf.name,
        cf.feedback,
        cf.approved,
        cf.created_at,
        cf.updated_at
      FROM course_feedback cf
      WHERE cf.course_id = ?
        AND cf.approved = 1
      ORDER BY cf.created_at DESC
    `).bind(courseId).all();

    return json(out.results || []);
  }

  // Add feedback to one course
  if (request.method === 'POST' && mCourseFeedback) {
    const u = await requireUser(request, env);
    if (!u) return unauthorized();

    const courseId = Number(mCourseFeedback[1]);

    const c = await env.DB.prepare(
      'SELECT id FROM course WHERE id = ?'
    ).bind(courseId).first();

    if (!c) return notFound('Course not found');

    const body = await readJson(request);
    if (!body) return badRequest('Expected JSON');

    const feedback = String(body.feedback || '').trim();
    if (!feedback) return badRequest('Feedback is required');

    const displayName = String(u.name || u.email || 'User').trim();

    const res = await env.DB.prepare(`
      INSERT INTO course_feedback (course_id, user_id, name, feedback, approved, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      courseId,
      u.id,
      u.name || u.email || 'User',
      feedback,
      0,
      isoNow(),
      isoNow()
    ).run();

    return json({
      ok: true,
      id: res.meta.last_row_id,
      name: displayName
    });
  }

  // Approve course feedback (admin only)
  if (request.method === 'PATCH' && mCourseFeedbackApprove) {
    const admin = await requireAdmin(request, env);
    if (admin.error) return admin.error;

    const feedbackId = Number(mCourseFeedbackApprove[1]);
    const body = await readJson(request);
    const approved = body && typeof body.approved !== 'undefined' ? (body.approved ? 1 : 0) : 1;

    const result = await env.DB.prepare(`
      UPDATE course_feedback
      SET approved = ?, updated_at = ?
      WHERE id = ?
    `).bind(approved, isoNow(), feedbackId).run();

    if (!result.meta || result.meta.changes === 0) {
      return notFound('Feedback not found');
    }

    return json({ ok: true });
  }

  // Edit course feedback (owner or admin)
  if (request.method === 'PATCH' && mCourseFeedbackById) {
    const u = await requireUser(request, env);
    if (!u) return unauthorized();

    const feedbackId = Number(mCourseFeedbackById[1]);
    const body = await readJson(request);
    if (!body) return badRequest('Expected JSON');

    const feedback = String(body.feedback || '').trim();
    if (!feedback) return badRequest('Feedback is required');

    const existing = await env.DB.prepare(`
      SELECT id, user_id
      FROM course_feedback
      WHERE id = ?
    `).bind(feedbackId).first<any>();

    if (!existing) return notFound('Feedback not found');

    const isOwner = Number(existing.user_id) === Number(u.id);
    const isAdmin = (u.role || "").toLowerCase() === "admin";

    if (!isOwner && !isAdmin) {
      return forbidden("Not allowed");
    }

    await env.DB.prepare(`
      UPDATE course_feedback
      SET feedback = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      feedback,
      isoNow(),
      feedbackId
    ).run();

    return json({ ok: true });
  }

  // Delete course feedback (admin only)
  if (request.method === 'DELETE' && mCourseFeedbackById) {
    const admin = await requireAdmin(request, env);
    if (admin.error) return admin.error;

    const feedbackId = Number(mCourseFeedbackById[1]);

    const result = await env.DB.prepare(`
      DELETE FROM course_feedback
      WHERE id = ?
    `).bind(feedbackId).run();

    if (!result.meta || result.meta.changes === 0) {
      return notFound('Feedback not found');
    }

    return json({ ok: true });
  }

  return null;
}

async function handleForum(request: Request, env: Env, pathname: string) {
  const url = new URL(request.url);

  if (request.method === 'GET' && pathname === '/api/forum/threads') {
    const limit = Math.min(Number(url.searchParams.get('limit') || '0') || 0, 50);
    const sql = 'SELECT id,title,created_by,created_at FROM thread ORDER BY created_at DESC' + (limit ? ' LIMIT ?' : '');
    const stmt = env.DB.prepare(sql);
    const out = limit ? await stmt.bind(limit).all() : await stmt.all();
    return json(out.results || []);
  }

  if (request.method === 'POST' && pathname === '/api/forum/threads') {
    const u = await requireUser(request, env);
    if (!u) return unauthorized();
    const body = await readJson(request);
    if (!body) return badRequest('Expected JSON');
    const title = String(body.title || '').trim();
    const postBody = String(body.body || '').trim();
    if (!title || !postBody) return badRequest('Title and body required');

    const now = isoNow();
    const res = await env.DB.prepare('INSERT INTO thread (title,created_by,created_at) VALUES (?,?,?)').bind(title, u.id, now).run();
    const tid = Number(res.meta.last_row_id);
    await env.DB.prepare('INSERT INTO post (thread_id,created_by,body,created_at) VALUES (?,?,?,?)').bind(tid, u.id, postBody, now).run();
    return json({ id: tid });
  }

  const mThread = pathname.match(/^\/api\/forum\/threads\/(\d+)$/);
  if (request.method === 'GET' && mThread) {
    const id = Number(mThread[1]);
    const t = await env.DB.prepare('SELECT id,title,created_by,created_at FROM thread WHERE id = ?').bind(id).first();
    if (!t) return notFound();
    return json(t);
  }

  const mPosts = pathname.match(/^\/api\/forum\/threads\/(\d+)\/posts$/);
  if (request.method === 'GET' && mPosts) {
    const id = Number(mPosts[1]);
    const out = await env.DB.prepare(
      'SELECT p.id,p.thread_id,p.created_by,p.body,p.created_at,u.name as author_name FROM post p JOIN user u ON u.id = p.created_by WHERE p.thread_id = ? ORDER BY p.created_at ASC'
    ).bind(id).all();
    return json(out.results || []);
  }

  const mReply = pathname.match(/^\/api\/forum\/threads\/(\d+)\/reply$/);
  if (request.method === 'POST' && mReply) {
    const u = await requireUser(request, env);
    if (!u) return unauthorized();
    const id = Number(mReply[1]);
    const body = await readJson(request);
    if (!body) return badRequest('Expected JSON');
    const postBody = String(body.body || '').trim();
    if (!postBody) return badRequest('Reply cannot be empty');
    await env.DB.prepare('INSERT INTO post (thread_id,created_by,body,created_at) VALUES (?,?,?,?)').bind(id, u.id, postBody, isoNow()).run();
    return json({ ok: true });
  }



  return null;
}

async function handleDonations(request: Request, env: Env, pathname: string) {
  if (request.method === 'POST' && pathname === '/api/donations') {
    const body = await readJson(request);
    if (!body) return badRequest('Expected JSON');

    const donor_name = String(body.donor_name || '').trim();
    const donor_email = String(body.donor_email || '').trim().toLowerCase();
    const amountStr = String(body.amount || '').trim();
    const campaign = body.campaign ? String(body.campaign).trim() : null;
    const restricted = body.restricted ? 1 : 0;

    if (!donor_name || !donor_email || !amountStr) return badRequest('Name, email, amount required');

    let amount_cents = 0;
    try {
      amount_cents = Math.round(parseFloat(amountStr) * 100);
      if (!isFinite(amount_cents) || amount_cents <= 0) throw new Error('bad');
    } catch {
      return badRequest('Invalid amount');
    }

    const u = await requireUser(request, env);
    const donor_user_id = u ? Number(u.id) : null;

    const now = isoNow();
    const res = await env.DB.prepare(
      'INSERT INTO donation (donor_user_id,donor_name,donor_email,amount_cents,currency,processor,processor_ref,campaign,restricted,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).bind(donor_user_id, donor_name, donor_email, amount_cents, 'USD', 'manual', null, campaign, restricted, now).run();

    const donation_id = Number(res.meta.last_row_id);
    const receipt_number = `R-${now.slice(0,10).replace(/-/g,'')}-${String(donation_id).padStart(8,'0')}`;

    // Generate a minimal PDF receipt and store in R2.
    const pdfBytes = await generateReceiptPdf({
      receipt_number,
      donation_id,
      donor_name,
      donor_email,
      amount_cents,
      currency: 'USD',
      processor: 'manual',
      campaign,
      restricted: !!restricted,
      created_at: now,
    });

    const key = `receipts/${receipt_number}.pdf`;
    await env.R2.put(key, pdfBytes, { httpMetadata: { contentType: 'application/pdf' } });

    await env.DB.prepare(
      'INSERT INTO receipt (donation_id,receipt_number,issued_at,r2_key) VALUES (?,?,?,?)'
    ).bind(donation_id, receipt_number, now, key).run();

    return json({ ok: true, donation_id, receipt_number });
  }

  const mPdf = pathname.match(/^\/api\/receipts\/([A-Za-z0-9\-]+)\/pdf$/);
  if (request.method === 'GET' && mPdf) {
    const receiptNumber = mPdf[1];
    const r = await env.DB.prepare('SELECT donation_id,receipt_number,r2_key FROM receipt WHERE receipt_number = ?').bind(receiptNumber).first() as any;
    if (!r) return notFound();
    const d = await env.DB.prepare('SELECT donor_user_id,donor_email FROM donation WHERE id = ?').bind(r.donation_id).first() as any;
    if (!d) return notFound();

    const u = await requireUser(request, env);
    const allowed = u && (u.role === 'admin' || (d.donor_user_id && Number(d.donor_user_id) === Number(u.id)) || (d.donor_email && d.donor_email === u.email));
    if (!allowed) return forbidden();

    const obj = await env.R2.get(String(r.r2_key));
    if (!obj) return notFound();
      return new Response(obj.body, {
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': `inline; filename="${receiptNumber}.pdf"`,
          'cache-control': 'no-store',
        },
      });
    }

    if (request.method === 'GET' && pathname === '/api/receipts') {
      const u = await requireUser(request, env);
      if (!u) return unauthorized();
      const out = await env.DB.prepare(
        'SELECT d.id as donation_id,d.created_at,d.donor_name,d.donor_email,d.amount_cents,d.currency,r.receipt_number FROM donation d LEFT JOIN receipt r ON r.donation_id = d.id WHERE d.donor_user_id = ? OR d.donor_email = ? ORDER BY d.created_at DESC'
      ).bind(u.id, u.email).all();
      return json(out.results || []);
    }

    return null;
  }

  async function handleAdmin(request: Request, env: Env, pathname: string) {
    const url = new URL(request.url);

    if (request.method === 'GET' && pathname === '/api/admin/users') {
      const admin = await requireAdmin(request, env);
      if (admin.error) return admin.error;
      const out = await env.DB.prepare(`
        SELECT
          u.id,
          u.email,
          u.name,
          u.role,
          u.created_at,
          (SELECT COUNT(1) FROM user_agreement_acknowledgement a WHERE a.user_id = u.id) AS docs_accepted
        FROM user u
        ORDER BY u.id ASC
      `).all();
      return json(out.results || []);
    }

    if (
      request.method === 'GET' &&
      (
        pathname === '/api/admin/milk-registrations' ||
        pathname === '/api/admin/milk-registrations.csv'
      )
    ) {
      const admin = await requireAdmin(request, env);
      if (admin.error) return admin.error;

      const query = String(url.searchParams.get('q') || '').trim().slice(0, 100);
      const formula = String(url.searchParams.get('formula') || '').trim().slice(0, 120);
      const queryLike = `%${query}%`;
      const where = `
        WHERE (? = '' OR m.formula_type = ?)
          AND (
            ? = ''
            OR m.full_name LIKE ?
            OR m.phone LIKE ?
            OR m.baby_name LIKE ?
          )
      `;
      const select = `
        SELECT
          m.id,
          m.created_at,
          m.full_name,
          m.phone,
          m.baby_name,
          m.baby_age_months,
          m.formula_type,
          m.formula_other,
          u.name AS registered_by_name,
          u.email AS registered_by_email
        FROM milk_giveaway_registration m
        JOIN user u ON u.id = m.registered_by
        ${where}
        ORDER BY m.created_at DESC, m.id DESC
      `;
      const bindings = [formula, formula, query, queryLike, queryLike, queryLike];

      if (pathname.endsWith('.csv')) {
        const out = await env.DB.prepare(select).bind(...bindings).all();
        const rows = (out.results || []) as Record<string, unknown>[];
        const header = [
          'id',
          'created_at',
          'full_name',
          'phone',
          'baby_name',
          'baby_age_months',
          'formula_type',
          'formula_other',
          'registered_by_name',
          'registered_by_email',
        ];
        const escapeCsv = (value: unknown) => {
          let cell = String(value ?? '');
          if (/^[=+\-@]/.test(cell)) cell = `'${cell}`;
          if (/[",\n\r]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
          return cell;
        };
        const lines = [header.join(',')].concat(
          rows.map((row) => header.map((key) => escapeCsv(row[key])).join(',')),
        );
        const date = new Date().toISOString().slice(0, 10);

        return new Response('\uFEFF' + lines.join('\r\n'), {
          status: 200,
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': `attachment; filename="registros_leche_${date}.csv"`,
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
          },
        });
      }

      const [rows, count] = await Promise.all([
        env.DB.prepare(select + ' LIMIT 1000').bind(...bindings).all(),
        env.DB.prepare(`
          SELECT COUNT(*) AS total
          FROM milk_giveaway_registration m
          ${where}
        `).bind(...bindings).first() as Promise<any>,
      ]);

      return json({
        registrations: rows.results || [],
        total: Number(count?.total || 0),
        limited: Number(count?.total || 0) > 1000,
      });
    }

    if (request.method === 'GET' && pathname === '/api/admin/agreement-docs') {
      const admin = await requireAdmin(request, env);
      if (admin.error) return admin.error;
      const out = await env.DB.prepare(
        'SELECT id,title,author,original_name,mimetype,active,created_by,created_at FROM agreement_doc ORDER BY created_at DESC'
      ).all();
      return json(out.results || []);
    }

    if (request.method === 'POST' && pathname === '/api/admin/agreement-docs') {
      const admin = await requireAdmin(request, env);
      if (admin.error) return admin.error;

      const ct = request.headers.get('content-type') || '';
      if (!ct.includes('multipart/form-data')) return badRequest('Expected multipart/form-data');
      const form = await request.formData();
      const title = String(form.get('title') || '').trim();
      const author = String(form.get('author') || '').trim();
      const file = form.get('pdf');

      if (!title || !author) return badRequest('Title and author are required');
      if (!(file instanceof File)) return badRequest('PDF file is required');
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        return badRequest('Uploaded file must be a PDF');
      }

      const originalName = file.name || 'document.pdf';
      const safeBase = originalName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
      const key = `agreement-docs/${Date.now()}_${crypto.randomUUID()}_${safeBase}`;
      await env.R2.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: 'application/pdf' } });

      await env.DB.prepare(
        'INSERT INTO agreement_doc (title,author,r2_key,original_name,mimetype,active,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)'
      ).bind(title, author, key, originalName, 'application/pdf', 1, admin.user!.id, isoNow()).run();

      return json({ ok: true });
    }

    if (request.method === 'GET' && pathname === '/api/admin/agreement-docs/acknowledgements') {
      const admin = await requireAdmin(request, env);
      if (admin.error) return admin.error;

      const docsResult = await env.DB.prepare(
        'SELECT id,title,author,active,created_at FROM agreement_doc ORDER BY created_at DESC'
      ).all();
      const usersResult = await env.DB.prepare(
        'SELECT id,name,email FROM user ORDER BY id ASC'
      ).all();
      const ackResult = await env.DB.prepare(
        'SELECT user_id,agreement_doc_id,accepted_at FROM user_agreement_acknowledgement'
      ).all();

      const docs = (docsResult.results || []) as any[];
      const users = (usersResult.results || []) as any[];
      const acks = (ackResult.results || []) as any[];
      const ackMap = new Map<string, any>();
      for (const ack of acks) {
        ackMap.set(`${ack.agreement_doc_id}:${ack.user_id}`, ack.accepted_at);
      }

      const out = docs.map((doc) => ({
        id: doc.id,
        title: doc.title,
        author: doc.author,
        active: doc.active,
        created_at: doc.created_at,
        accepted_users: users.filter((u) => ackMap.has(`${doc.id}:${u.id}`)).map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          accepted_at: ackMap.get(`${doc.id}:${u.id}`)
        })),
        pending_users: users.filter((u) => !ackMap.has(`${doc.id}:${u.id}`)).map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email
        }))
      }));

      return json(out);
    }

    const mAckDelete = pathname.match(/^\/api\/admin\/agreement-docs\/(\d+)\/acknowledgements\/(\d+)$/);
    if (request.method === 'DELETE' && mAckDelete) {
      const admin = await requireAdmin(request, env);
      if (admin.error) return admin.error;
      const docId = Number(mAckDelete[1]);
      const userId = Number(mAckDelete[2]);
      if (!docId || !userId) return badRequest('Invalid doc or user id');
      await env.DB.prepare(
        'DELETE FROM user_agreement_acknowledgement WHERE agreement_doc_id = ? AND user_id = ?'
      ).bind(docId, userId).run();
      return json({ ok: true });
    }

    const mDocDelete = pathname.match(/^\/api\/admin\/agreement-docs\/(\d+)$/);
    if (request.method === 'DELETE' && mDocDelete) {
      const admin = await requireAdmin(request, env);
      if (admin.error) return admin.error;
      const docId = Number(mDocDelete[1]);
      const row = await env.DB.prepare('SELECT r2_key FROM agreement_doc WHERE id = ?').bind(docId).first() as any;
      if (!row) return notFound();
      await env.R2.delete(String(row.r2_key));
      await env.DB.prepare('DELETE FROM agreement_doc WHERE id = ?').bind(docId).run();
      await env.DB.prepare('DELETE FROM user_agreement_acknowledgement WHERE agreement_doc_id = ?').bind(docId).run();
      return json({ ok: true });
    }

    const mDel = pathname.match(/^\/api\/admin\/users\/(\d+)$/);
    if (request.method === 'DELETE' && mDel) {
      const admin = await requireAdmin(request, env);
      if (admin.error) return admin.error;
      const id = Number(mDel[1]);
      if (id === Number(admin.user!.id)) return badRequest('You cannot delete your own account');

      // cascade-ish deletes
      await env.DB.prepare('DELETE FROM enrollment WHERE user_id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM event_enrollment WHERE user_id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM post WHERE created_by = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM thread WHERE created_by = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM media_asset WHERE uploaded_by = ?').bind(id).run();

      await env.DB.prepare('DELETE FROM user WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }

    if (request.method === 'GET' && pathname === '/api/admin/event-feedback') {
      const admin = await requireAdmin(request, env);
      if (admin.error) return admin.error;

      const pendingOnly = url.searchParams.get('pending') === 'true';
      const out = await env.DB.prepare(`
        SELECT
          ef.id,
          ef.event_id,
          e.name AS event_name,
          ef.user_id,
          ef.name,
          ef.feedback,
          ef.approved,
          ef.created_at,
          ef.updated_at
        FROM event_feedback ef
        JOIN event e ON e.id = ef.event_id
        ${pendingOnly ? 'WHERE ef.approved = 0' : ''}
        ORDER BY ef.created_at DESC
      `).all();

      return json(out.results || []);
    }

    if (request.method === 'GET' && pathname === '/api/admin/accounting.csv') {
      const admin = await requireAdmin(request, env);
      if (admin.error) return admin.error;

      const out = await env.DB.prepare('SELECT id,created_at,donor_name,donor_email,amount_cents,currency,processor,processor_ref,campaign,restricted FROM donation ORDER BY created_at DESC').all();
      const rows = out.results || [];

      const header = ['id','created_at','donor_name','donor_email','amount_cents','currency','processor','processor_ref','campaign','restricted'];
      const escapeCsv = (v: any) => {
        const s = String(v ?? '');
        if (/[\",\n]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
        return s;
      };
      const lines = [header.join(',')].concat(
        rows.map((r: any) => header.map((k) => escapeCsv(r[k])).join(','))
      );
      return new Response(lines.join('\n'), {
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="donations_export.csv"',
          'cache-control': 'no-store',
        },
      });
    }

    if (request.method === 'GET' && pathname === '/api/admin/course-feedback') {
      const admin = await requireAdmin(request, env);
      if (admin.error) return admin.error;

      const pendingOnly = url.searchParams.get('pending') === 'true';
      const out = await env.DB.prepare(`
        SELECT
          cf.id,
          cf.course_id,
          c.name AS course_name,
          cf.user_id,
          cf.name,
          cf.feedback,
          cf.approved,
          cf.created_at,
          cf.updated_at
        FROM course_feedback cf
        JOIN course c ON c.id = cf.course_id
        ${pendingOnly ? 'WHERE cf.approved = 0' : ''}
        ORDER BY cf.created_at DESC
      `).all();

      return json(out.results || []);
    }

    if (request.method === 'GET' && pathname === '/api/admin/testimonies') {
      const admin = await requireAdmin(request, env);
      if (admin.error) return admin.error;

      const pendingOnly = url.searchParams.get('pending') === 'true';
      let query = `
        SELECT
          id,
          email,
          name,
          testimony,
          testimony_approved,
          video_url,
          video_approved,
          created_at
        FROM user
        WHERE
          (
            testimony IS NOT NULL
            AND TRIM(testimony) != ''
          )
          OR
          (
            video_url IS NOT NULL
            AND TRIM(video_url) != ''
          )
      `;
      
      if (pendingOnly) {
        query += `
          AND (
            (testimony IS NOT NULL AND TRIM(testimony) != '' AND testimony_approved = 0)
            OR
            (video_url IS NOT NULL AND TRIM(video_url) != '' AND video_approved = 0)
          )
        `;
      }
      
      query += `ORDER BY created_at DESC`;
      
      const out = await env.DB.prepare(query).all();

      return json(out.results || []);
    }

    const mTestimonyApprove = pathname.match(/^\/api\/admin\/testimonies\/(\d+)$/);
    if (request.method === 'PATCH' && mTestimonyApprove) {
      const admin = await requireAdmin(request, env);
      if (admin.error) return admin.error;

      const userId = Number(mTestimonyApprove[1]);
      const body = await readJson(request);
      if (!body) return badRequest('Expected JSON');

      const columns = [];
      const values = [];
      if (typeof body.testimony_approved !== 'undefined') {
        columns.push('testimony_approved = ?');
        values.push(body.testimony_approved ? 1 : 0);
      }
      if (typeof body.video_approved !== 'undefined') {
        columns.push('video_approved = ?');
        values.push(body.video_approved ? 1 : 0);
      }

      if (!columns.length) return badRequest('No approval field provided');

      const sql = `UPDATE user SET ${columns.join(', ')} WHERE id = ?`;
      values.push(userId);

      const result = await env.DB.prepare(sql).bind(...values).run();

      if (!result.meta || result.meta.changes === 0) {
        return notFound('User not found');
      }

      return json({ ok: true });
    }

    const mUserUpdate = pathname.match(/^\/api\/admin\/users\/(\d+)$/);

    if (request.method === 'PATCH' && mUserUpdate) {
      console.log("🔥 PATCH /api/admin/users/:id HIT");
      console.log("🌐 URL:", request.url);

      // =========================
      // 🔐 AUTH: Require admin
      // =========================
      const admin = await requireAdmin(request, env);
      if (admin?.error) {
        console.error("❌ Admin auth failed");
        return admin.error;
      }

      console.log("✅ Admin verified:", admin);

      // =========================
      // 🔢 Parse user ID
      // =========================
      const userId = Number(mUserUpdate[1]);
      console.log("🔢 Target userId:", userId);

      if (!userId || Number.isNaN(userId)) {
        console.error("❌ Invalid user id");
        return json({ error: "Invalid user id" }, 400);
      }

      // =========================
      // 📥 Parse request body
      // =========================
      let body: any;
      try {
        body = await request.json();
        console.log("📦 Incoming body:", body);
      } catch (err) {
        console.error("❌ Failed to parse JSON:", err);
        return json({ error: "Invalid JSON body" }, 400);
      }

      // =========================
      // 🧠 Extract fields
      // =========================
      const {
        username,
        first_name,
        last_name,
        email,
        password,
        role,
        image_url,
        testimony
      } = body;

      console.log("🧠 Parsed fields:", {
        username,
        first_name,
        last_name,
        email,
        role,
        image_url,
        testimony
      });

      // =========================
      // 🛠️ Build dynamic UPDATE
      // =========================
      const fields: string[] = [];
      const values: any[] = [];

      function add(field: string, value: any) {
        fields.push(`${field} = ?`);
        values.push(value);
      }

      if (username) add("name", username); // assuming name = username
      if (first_name) add("first_name", first_name);
      if (last_name) add("last_name", last_name);
      if (email) add("email", email);
      if (role) add("role", role);
      if (image_url) add("image_url", image_url);
      if (testimony) add("testimony", testimony);

      // ⚠️ Password requires hashing
      if (password) {
        console.log("🔐 Updating password...");
        const salt = crypto.randomUUID();
        const iterations = 100000;

        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
          "raw",
          encoder.encode(password),
          { name: "PBKDF2" },
          false,
          ["deriveBits"]
        );

        const derivedBits = await crypto.subtle.deriveBits(
          {
            name: "PBKDF2",
            salt: encoder.encode(salt),
            iterations,
            hash: "SHA-256"
          },
          keyMaterial,
          256
        );

        const hash = btoa(String.fromCharCode(...new Uint8Array(derivedBits)));

        add("password_salt", salt);
        add("password_iterations", iterations);
        add("password_hash", hash);
      }

      if (!fields.length) {
        console.warn("⚠️ No fields to update");
        return json({ error: "No fields to update" }, 400);
      }

      // =========================
      // 🗄️ Execute UPDATE
      // =========================
      const sql = `UPDATE user SET ${fields.join(", ")} WHERE id = ?`;
      values.push(userId);

      console.log("🗄️ SQL:", sql);
      console.log("📊 Values:", values);

      try {
        await env.DB.prepare(sql).bind(...values).run();
        console.log("✅ User updated successfully");
      } catch (err) {
        console.error("❌ DB update failed:", err);
        return json({ error: "Database update failed" }, 500);
      }

      return json({ ok: true });
    }

    return null;
  }

async function handleMedia(request: Request, env: Env, pathname: string) {
  console.log("🚀 handleMedia ENTRY");
  console.log("📍 pathname:", pathname);
  console.log("📍 method:", request.method);

  if (request.method === 'POST' && pathname === '/api/upload-image') {
    console.log("✅ Matched /api/upload-image route");

    const u = await requireUser(request, env);
    console.log("👤 requireUser result:", u);

    if (!u) {
      console.warn("❌ Unauthorized user");
      return unauthorized();
    }

    if (!(u.role === 'admin' || u.role === 'instructor')) {
      console.warn("❌ Forbidden role:", u.role);
      return forbidden();
    }

    const ct = request.headers.get('content-type') || '';
    console.log("📦 Content-Type:", ct);

    if (!ct.includes('multipart/form-data')) {
      console.error("❌ Invalid content-type");
      return badRequest('Expected multipart/form-data');
    }

    console.log("📥 Parsing formData...");
    const form = await request.formData();

    console.log("📦 formData entries:");
    for (const [key, value] of form.entries()) {
      console.log(`   ${key}:`, value);
    }

    const overwrite = String(form.get('overwrite') || '').toLowerCase() === 'true';
    console.log("♻️ overwrite =", overwrite);

    const file = form.get('image');
    console.log("📄 file object:", file);

    if (!(file instanceof File)) {
      console.error("❌ No valid file found in formData");
      return badRequest('No image uploaded');
    }

    console.log("📄 file.name:", file.name);
    console.log("📄 file.type:", file.type);
    console.log("📄 file.size:", file.size);

    if (!(file.type || '').startsWith('image/')) {
      console.error("❌ File is not an image:", file.type);
      return badRequest('Uploaded file must be an image');
    }

    // 🔍 Check current DB state BEFORE any changes
    const countBeforeRes = await env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM media_asset
      WHERE r2_key LIKE 'slider/%'
    `).first<{ count: number }>();

    const countBefore = Number(countBeforeRes?.count || 0);
    console.log("📊 Current slider image count BEFORE:", countBefore);

    if (overwrite) {
      console.log("♻️ Overwrite requested → deleting existing slider images");

      const existing = await env.DB.prepare(`
        SELECT id, r2_key
        FROM media_asset
        WHERE r2_key LIKE 'slider/%'
      `).all();

      const rows = existing.results || [];
      console.log("🗑️ Found existing images:", rows.length);

      for (const row of rows as Array<{ id: number; r2_key: string }>) {
        if (row.r2_key) {
          try {
            console.log("🗑️ Deleting R2 object:", row.r2_key);
            await env.R2.delete(row.r2_key);
          } catch (err) {
            console.error("❌ Failed deleting R2 object:", row.r2_key, err);
          }
        }
      }

      console.log("🗑️ Deleting DB records...");
      await env.DB.prepare(`
        DELETE FROM media_asset
        WHERE r2_key LIKE 'slider/%'
      `).run();

      console.log("✅ Existing slider images deleted");

      // 🔍 Verify deletion
      const countAfterDeleteRes = await env.DB.prepare(`
        SELECT COUNT(*) as count
        FROM media_asset
        WHERE r2_key LIKE 'slider/%'
      `).first<{ count: number }>();

      const countAfterDelete = Number(countAfterDeleteRes?.count || 0);
      console.log("📊 Count AFTER delete:", countAfterDelete);
    }

    const original = file.name || 'image';
    const safeBase = original.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);

    const key = `slider/${Date.now()}_${crypto.randomUUID()}_${safeBase}`;
    console.log("📤 Generated R2 key:", key);

    try {
      console.log("📤 Uploading to R2...");
      await env.R2.put(key, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type || 'application/octet-stream' }
      });
      console.log("✅ R2 upload SUCCESS");
    } catch (err) {
      console.error("❌ R2 upload FAILED:", err);
      return json({ ok: false, error: "R2 upload failed" }, 500);
    }

    let res;
    try {
      console.log("🗄️ Inserting DB record...");
      res = await env.DB.prepare(
        'INSERT INTO media_asset (r2_key, original_name, mimetype, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(
        key,
        original,
        file.type || 'application/octet-stream',
        u.id,
        isoNow()
      ).run();

      console.log("✅ DB insert SUCCESS:", res);
    } catch (err) {
      console.error("❌ DB insert FAILED:", err);
      return json({ ok: false, error: "DB insert failed" }, 500);
    }

    const id = Number(res.meta.last_row_id);
    console.log("📌 New media_asset id:", id);

    // 🔍 Final count check
    const countFinalRes = await env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM media_asset
      WHERE r2_key LIKE 'slider/%'
    `).first<{ count: number }>();

    const countFinal = Number(countFinalRes?.count || 0);
    console.log("📊 FINAL slider image count:", countFinal);

    console.log("✅ handleMedia COMPLETE");

    return json({
      ok: true,
      id,
      url: `/api/media/${id}`
    });
  }

  console.log("⚠️ handleMedia: route not matched");

    // List slider images
    if (request.method === 'GET' && pathname === '/api/slider-images') {
      try {
        const out = await env.DB.prepare(
          'SELECT id, r2_key, original_name, mimetype, uploaded_by, created_at FROM media_asset ORDER BY id ASC'
        ).all();

        const items = (out.results || []).map((row: any) => ({
          id: row.id,
          name: row.original_name,
          original_name: row.original_name,
          mimetype: row.mimetype,
          r2_key: row.r2_key,
          url: `/api/media/${row.id}`,
          created_at: row.created_at
        }));

        return json(items);
      } catch (err: any) {
        console.error('❌ /api/slider-images failed:', err);
        return json({ error: 'Failed to load slider images' }, 500);
      }
    }

    // Serve slider image by DB id
    if (request.method === 'GET' && pathname.startsWith('/api/media/')) {
      try {
        const id = Number(pathname.split('/').pop());
        if (!id) return badRequest('Invalid media id');

        const row = await env.DB.prepare(
          'SELECT id, r2_key, mimetype, original_name FROM media_asset WHERE id = ?'
        ).bind(id).first() as any;

        if (!row) return notFound();

        const obj = await env.R2.get(String(row.r2_key));
        if (!obj) return notFound('File not found');

        return new Response(obj.body, {
          status: 200,
          headers: {
            'content-type': row.mimetype || obj.httpMetadata?.contentType || 'application/octet-stream',
            'cache-control': 'public, max-age=3600'
          }
        });
      } catch (err: any) {
        console.error('❌ /api/media failed:', err);
        return text('Server error', 500);
      }
    }

    // Existing generic media upload
    if (request.method === 'POST' && pathname === '/api/media/upload') {
      const u = await requireUser(request, env);
      if (!u) return unauthorized();

      const ct = request.headers.get('content-type') || '';
      if (!ct.includes('multipart/form-data')) return badRequest('Expected multipart/form-data');

      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File)) return badRequest('No file');

      const original = file.name || 'file';
      const safeBase = original.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
      const key = `uploads/${Date.now()}_${crypto.randomUUID()}_${safeBase}`;

      await env.R2.put(key, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type || 'application/octet-stream' }
      });

      await env.DB.prepare(
        'INSERT INTO media_asset (r2_key,original_name,mimetype,uploaded_by,created_at) VALUES (?,?,?,?,?)'
      ).bind(key, original, file.type || 'application/octet-stream', u.id, isoNow()).run();

      return json({ ok: true, key });
    }

    // Public read (generic uploads)
    const mGet = pathname.match(/^\/uploads\/(.+)$/);
    if (request.method === 'GET' && mGet) {
      const key = `uploads/${mGet[1]}`;
      const obj = await env.R2.get(key);
      if (!obj) return notFound();

      return new Response(obj.body, {
        status: 200,
        headers: {
          'content-type': obj.httpMetadata?.contentType || 'application/octet-stream',
          'cache-control': 'public, max-age=3600',
        },
      });
    }

    if (request.method === 'GET' && pathname === '/api/media') {
      const u = await requireUser(request, env);
      if (!u) return unauthorized();

      const out = await env.DB.prepare(
        'SELECT id,r2_key,original_name,mimetype,uploaded_by,created_at FROM media_asset ORDER BY created_at DESC'
      ).all();

      return json(out.results || []);
    }

    return null;
  }
// -------- PDF generation (pdf-lib) --------
import { PDFDocument, StandardFonts } from 'pdf-lib';

async function generateReceiptPdf(d: {
  receipt_number: string;
  donation_id: number;
  donor_name: string;
  donor_email: string;
  amount_cents: number;
  currency: string;
  processor: string;
  campaign: string | null;
  restricted: boolean;
  created_at: string;
}) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // letter
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const money = `${d.currency} ${(d.amount_cents / 100).toFixed(2)}`;
  const lines = [
    ['Donation Receipt', fontBold, 16],
    [`Receipt Number: ${d.receipt_number}`, font, 11],
    [`Date: ${new Date(d.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: '2-digit' })}`, font, 11],
    ['', font, 11],
    ['Donor', fontBold, 12],
    [`Name: ${d.donor_name}`, font, 11],
    [`Email: ${d.donor_email}`, font, 11],
    ['', font, 11],
    ['Donation Details', fontBold, 12],
    [`Amount: ${money}`, font, 11],
    [`Processor: ${d.processor}`, font, 11],
    ...(d.campaign ? [[`Campaign: ${d.campaign}`, font, 11]] : []),
    [`Restricted: ${d.restricted ? 'Yes' : 'No'}`, font, 11],
    ['', font, 11],
    ['Tax Acknowledgement:', fontBold, 11],
    ['No goods or services were provided in exchange for this contribution.', font, 10],
  ] as Array<[string, any, number]>;

  let y = 740;
  for (const [txt, f, size] of lines) {
    if (txt === '') {
      y -= 16;
      continue;
    }
    page.drawText(txt, { x: 72, y, size, font: f });
    y -= size + 8;
  }

  const bytes = await pdfDoc.save();
  return bytes;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    await ensureDefaultAdmin(env);
    await ensureApprovalSchema(env);

    const url = new URL(request.url);
    const pathname = url.pathname;

    console.log("🌍 TOP ROUTER request");
    console.log("   method:", request.method);
    console.log("   pathname:", pathname);
    console.log("   full URL:", url.toString());
    console.log("   search:", url.search);

    const adminPages = new Set([
      '/admin',
      '/admin.html',
      '/admin-milk-registrations',
      '/admin-milk-registrations.html',
      '/admin-participants',
      '/admin-participants.html',
      '/create-event',
      '/create-event.html',
      '/event_delete',
      '/event_delete.html'
    ]);
    if ((request.method === 'GET' || request.method === 'HEAD') && adminPages.has(pathname)) {
      const admin = await requireAdmin(request, env);
      if (admin.error) {
        return new Response(null, {
          status: 302,
          headers: {
            location: admin.user ? '/adminuser.html' : `/login.html?next=${encodeURIComponent(pathname)}`,
            'cache-control': 'no-store'
          }
        });
      }
      return env.ASSETS.fetch(request);
    }

    if (
      (request.method === 'GET' || request.method === 'HEAD') &&
      (pathname === '/adminuser' || pathname === '/adminuser.html')
    ) {
      const user = await requireUser(request, env);
      if (!user) {
        return new Response(null, {
          status: 302,
          headers: {
            location: '/login.html?next=%2Fadminuser.html',
            'cache-control': 'no-store'
          }
        });
      }
      return env.ASSETS.fetch(request);
    }

    if (
      (request.method === 'GET' || request.method === 'HEAD') &&
      (pathname === '/milk-giveaway' || pathname === '/milk-giveaway.html')
    ) {
      const user = await requireUser(request, env);
      if (!user) {
        return new Response(null, {
          status: 302,
          headers: {
            location: '/login?next=%2Fmilk-giveaway',
            'cache-control': 'no-store',
          },
        });
      }
      return env.ASSETS.fetch(request);
    }

    // API routes + special course page route
    if (
      pathname.startsWith('/api') ||
      pathname.startsWith('/uploads/') ||
      pathname === '/course' ||
      pathname === '/courseog' ||
      pathname === '/eventog' ||
      pathname === '/workshopog'
    ) {
      console.log("➡️ Entering handler pipeline for pathname:", pathname);

      const handlers = [
        handleAuth,
        handleAgreementDocs,
        handleMe,
        handleMilkGiveaway,
        handleSettings,
        handleYoutubeSlider,
        handleParticipants,
        handleEvents,
        handleCourses,
        handleWorkshops,
        handleForum,
        handleDonations,
        handleAdmin,
        handleMedia,
      ];

      for (const h of handlers) {
        console.log("🧪 Trying handler:", h.name, "for pathname:", pathname);

        const resp = await h(request, env, pathname as any);

        if (resp) {
          console.log("✅ Handler matched:", h.name, "for pathname:", pathname);
          return resp;
        }
      }

      console.error("❌ No handler matched pathname in handler pipeline:", pathname);
      return notFound();
    }

    console.log("📦 Falling through to ASSETS for pathname:", pathname);
    return env.ASSETS.fetch(request);
  },
};
