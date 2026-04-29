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

  const userInfo = await env.DB.prepare('PRAGMA table_info(user)').all() as any;
  const userCols = (userInfo?.results || []).map((row: any) => row.name);
  if (!userCols.includes('testimony_approved')) {
    await env.DB.prepare('ALTER TABLE user ADD COLUMN testimony_approved INTEGER NOT NULL DEFAULT 0').run();
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

    const iterations = 100_000;
    const salt = randomSaltB64(16);
    const hash = await pbkdf2Hash(password, salt, iterations);

    const res = await env.DB.prepare(
      'INSERT INTO user (email,name,password_salt,password_iterations,password_hash,role,created_at) VALUES (?,?,?,?,?,?,?)'
    ).bind(email, name, salt, iterations, hash, 'user', isoNow()).run();

    const uid = Number(res.meta.last_row_id);
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

    const token = await jwtSign(env.JWT_SECRET, { uid: u.id }, 60 * 60 * 24 * 14);
    return json(
      { ok: true },
      200,
      { 'set-cookie': setCookie('tmv_session', token, { maxAgeSeconds: 60 * 60 * 24 * 14 }) }
    );
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
        testimony_approved
      FROM user
      WHERE id = ?
    `).bind(u.id).first();

    console.log("📦 fullUser:", fullUser);

    if (!fullUser) return unauthorized();

    return json(fullUser);
  }

  if (request.method === 'PATCH' && pathname === '/api/me') {
    console.log("✅ PATCH /api/me MATCHED");

    const u = await requireUser(request, env);
    if (!u) return unauthorized();

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
      updateFields.push('testimony = ?');
      updateValues.push(body.testimony || '');
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

/*******************************************************************
 * BEGIN Handle Events  
******************************************************************** */

async function handleEvents(request: Request, env: Env, pathname: string) {
  const url = new URL(request.url);

  if (request.method === 'GET' && pathname === '/api/events') {
    const limit = Math.min(Number(url.searchParams.get('limit') || '0') || 0, 50);
    const sql =
      'SELECT id,name,date,presenter,about,location,requirements,capacity,created_by,created_at FROM event ORDER BY created_at DESC' +
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

  const mEnroll = pathname.match(/^\/api\/events\/(\d+)\/enroll$/);
  if (request.method === 'POST' && mEnroll) {
    const u = await requireUser(request, env);
    if (!u) return unauthorized();

    const id = Number(mEnroll[1]);
    const e = await env.DB.prepare('SELECT id,capacity FROM event WHERE id = ?').bind(id).first() as any;
    if (!e) return notFound();

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

    const result = await env.DB.prepare(`
      UPDATE event_feedback
      SET approved = 1, updated_at = ?
      WHERE id = ?
    `).bind(isoNow(), feedbackId).run();

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
    const date = toIso(body.date);
    const capacity = Math.max(0, Number(body.capacity || 0) || 0);

    if (!name || !presenter || !about || !location || !date) {
      return badRequest('Missing required fields');
    }

    const res = await env.DB.prepare(
      'INSERT INTO event (name,date,presenter,about,location,requirements,capacity,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)'
    ).bind(
      name,
      date,
      presenter,
      about,
      location,
      requirements,
      capacity,
      u.id,
      isoNow()
    ).run();

    return json({ id: res.meta.last_row_id });
  }

  const mDel = pathname.match(/^\/api\/events\/(\d+)$/);
  if (request.method === 'DELETE' && mDel) {
    const admin = await requireAdmin(request, env);
    if (admin.error) return admin.error;

    const id = Number(mDel[1]);
    await env.DB.prepare('DELETE FROM event_enrollment WHERE event_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM event WHERE id = ?').bind(id).run();

    return json({ ok: true });
  }

  return null;
}
/*******************************************************************
 * END Handle Events  
******************************************************************** */
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
      'SELECT id,name,date,presenter,about,location,requirements,capacity,created_by,created_at FROM course ORDER BY created_at DESC' +
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

    const ogImage = c.image_url
      ? `${url.origin}/static/images/${c.image_url}`
      : `${url.origin}/static/images/nuevos_comiensos.png`;

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

    const og_image = `${origin}/static/images/course-default.jpg`;
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
    const date = toIso(body.date);
    const capacity = Math.max(0, Number(body.capacity || 0) || 0);
    if (!name || !presenter || !about || !location || !date) return badRequest('Missing required fields');

    const res = await env.DB.prepare(
      'INSERT INTO course (name,date,presenter,about,location,requirements,capacity,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)'
    ).bind(name, date, presenter, about, location, requirements, capacity, u.id, isoNow()).run();
    return json({ id: res.meta.last_row_id });
  }

  // Delete course (admin)
  const mDel = pathname.match(/^\/api\/courses\/(\d+)$/);
  if (request.method === 'DELETE' && mDel) {
    const admin = await requireAdmin(request, env);
    if (admin.error) return admin.error;
    const id = Number(mDel[1]);
    await env.DB.prepare('DELETE FROM enrollment WHERE course_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM course WHERE id = ?').bind(id).run();
    return json({ ok: true });
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
        created_at
      FROM user
      WHERE testimony IS NOT NULL
        AND TRIM(testimony) != ''
        AND testimony_approved = 1
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

    const result = await env.DB.prepare(`
      UPDATE course_feedback
      SET approved = 1, updated_at = ?
      WHERE id = ?
    `).bind(isoNow(), feedbackId).run();

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
      const out = await env.DB.prepare('SELECT id,email,name,role,created_at FROM user ORDER BY id ASC').all();
      return json(out.results || []);
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
      const out = await env.DB.prepare(`
        SELECT
          id,
          email,
          name,
          testimony,
          testimony_approved,
          created_at
        FROM user
        WHERE testimony IS NOT NULL
          AND TRIM(testimony) != ''
          ${pendingOnly ? 'AND testimony_approved = 0' : ''}
        ORDER BY created_at DESC
      `).all();

      return json(out.results || []);
    }

    const mTestimonyApprove = pathname.match(/^\/api\/admin\/testimonies\/(\d+)$/);
    if (request.method === 'PATCH' && mTestimonyApprove) {
      const admin = await requireAdmin(request, env);
      if (admin.error) return admin.error;

      const userId = Number(mTestimonyApprove[1]);
      const body = await readJson(request);
      if (!body) return badRequest('Expected JSON');

      const approved = body.testimony_approved ? 1 : 0;

      const result = await env.DB.prepare(`
        UPDATE user
        SET testimony_approved = ?
        WHERE id = ?
      `).bind(approved, userId).run();

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

    // API routes + special course page route
    if (
      pathname.startsWith('/api') ||
      pathname.startsWith('/uploads/') ||
      pathname === '/course' ||
      pathname === '/courseog'
    ) {
      console.log("➡️ Entering handler pipeline for pathname:", pathname);

      const handlers = [
        handleAuth,
        handleMe,
        handleEvents,
        handleCourses,
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
