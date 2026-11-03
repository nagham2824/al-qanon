import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:54321";
const ANON_KEY = process.env.ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY;
const FUNCTION_URL = `${API_URL}/functions/v1/volunteer-auth`;

assert.ok(ANON_KEY, "Missing local Supabase ANON_KEY");
assert.ok(SERVICE_ROLE_KEY, "Missing local Supabase SERVICE_ROLE_KEY");

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const strongPassword = "StrongPass123!";

function memberCode() {
  const bytes = randomBytes(10);
  return "AQ-" + [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

function sha256(value) {
  return createHash("sha256").update(value.trim().toUpperCase()).digest("hex");
}

async function api(path, { method = "GET", body, admin = false, prefer } = {}) {
  const key = admin ? SERVICE_ROLE_KEY : ANON_KEY;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, data };
}

async function invoke(action, code, password) {
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      "Content-Type": "application/json",
      "cf-connecting-ip": "127.0.0.1",
    },
    body: JSON.stringify({ action, code, password }),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, data };
}

async function createVolunteer(displayName) {
  const code = memberCode();
  const result = await api("/rest/v1/volunteers", {
    method: "POST",
    admin: true,
    prefer: "return=representation",
    body: {
      member_code_hash: sha256(code),
      member_code_hint: code.slice(-4),
      display_name: displayName,
      status: "invited",
    },
  });
  assert.equal(result.status, 201, `Could not seed volunteer: ${JSON.stringify(result.data)}`);
  return { id: result.data[0].id, code, email: internalEmail(result.data[0].id) };
}

function internalEmail(id) {
  return "vol-" + id.replaceAll("-", "") + "@members.aq-law.invalid";
}

async function getVolunteer(id) {
  const result = await api(`/rest/v1/volunteers?id=eq.${id}&select=*`, { admin: true });
  assert.equal(result.status, 200, `Could not read volunteer: ${JSON.stringify(result.data)}`);
  return result.data[0] ?? null;
}

async function authUsers() {
  const result = await api("/auth/v1/admin/users?page=1&per_page=1000", { admin: true });
  assert.equal(result.status, 200, `Could not list Auth users: ${JSON.stringify(result.data)}`);
  return result.data.users ?? [];
}

async function findAuthUser(email) {
  return (await authUsers()).find((user) => user.email === email) ?? null;
}

async function deleteAuthUser(userId) {
  if (!userId) return;
  const result = await api(`/auth/v1/admin/users/${userId}`, { method: "DELETE", admin: true });
  assert.ok([200, 204].includes(result.status), `Could not clean up Auth user: ${JSON.stringify(result.data)}`);
}

async function cleanupVolunteer(id, email) {
  const row = await getVolunteer(id);
  if (row?.auth_user_id) await deleteAuthUser(row.auth_user_id);
  const orphan = await findAuthUser(email);
  if (orphan) await deleteAuthUser(orphan.id);
  const deleted = await api(`/rest/v1/volunteers?id=eq.${id}`, { method: "DELETE", admin: true });
  assert.ok([200, 204].includes(deleted.status), `Could not clean up volunteer: ${JSON.stringify(deleted.data)}`);
}

async function assertNoAuthUser(email) {
  assert.equal(await findAuthUser(email), null, `Unexpected orphan Auth user for ${email}`);
}

async function run(name, work) {
  await work();
  console.log(`PASS: ${name}`);
}

const created = [];
try {
  await run("claim creates an Auth user, activates the row, and supports login", async () => {
    const volunteer = await createVolunteer("IT_SUCCESS");
    created.push(volunteer);
    const claim = await invoke("claim", volunteer.code, strongPassword);
    assert.equal(claim.status, 200, JSON.stringify(claim.data));
    const row = await getVolunteer(volunteer.id);
    assert.equal(row.status, "active");
    assert.ok(row.auth_user_id);
    assert.ok(claim.data.session?.access_token);
    const login = await invoke("login", volunteer.code, strongPassword);
    assert.equal(login.status, 200, JSON.stringify(login.data));
    assert.ok(login.data.session?.access_token);
  });

  await run("weak first-time password is rejected without creating an Auth user", async () => {
    const volunteer = await createVolunteer("IT_WEAK_PASSWORD");
    created.push(volunteer);
    const result = await invoke("claim", volunteer.code, "weakpassword123");
    assert.equal(result.status, 400, JSON.stringify(result.data));
    const row = await getVolunteer(volunteer.id);
    assert.equal(row.status, "invited");
    assert.equal(row.auth_user_id, null);
    await assertNoAuthUser(volunteer.email);
  });

  await run("zero-row conditional update returns conflict and removes the new Auth user", async () => {
    const volunteer = await createVolunteer("IT_ZERO_ROW");
    created.push(volunteer);
    const result = await invoke("claim", volunteer.code, strongPassword);
    assert.equal(result.status, 409, JSON.stringify(result.data));
    const row = await getVolunteer(volunteer.id);
    assert.equal(row.status, "invited");
    assert.equal(row.auth_user_id, null);
    await assertNoAuthUser(volunteer.email);
  });

  await run("database update failure returns 500 and removes the new Auth user", async () => {
    const volunteer = await createVolunteer("IT_DB_ERROR");
    created.push(volunteer);
    const result = await invoke("claim", volunteer.code, strongPassword);
    assert.equal(result.status, 500, JSON.stringify(result.data));
    const row = await getVolunteer(volunteer.id);
    assert.equal(row.status, "invited");
    assert.equal(row.auth_user_id, null);
    await assertNoAuthUser(volunteer.email);
  });

  await run("a pre-existing Auth identity is reported as a duplicate conflict", async () => {
    const volunteer = await createVolunteer("IT_DUPLICATE_AUTH");
    created.push(volunteer);
    const existing = await api("/auth/v1/admin/users", {
      method: "POST",
      admin: true,
      body: {
        email: volunteer.email,
        password: strongPassword,
        email_confirm: true,
        user_metadata: { account_type: "volunteer" },
      },
    });
    assert.equal(existing.status, 200, `Could not create duplicate fixture: ${JSON.stringify(existing.data)}`);
    const result = await invoke("claim", volunteer.code, strongPassword);
    assert.equal(result.status, 409, JSON.stringify(result.data));
    const row = await getVolunteer(volunteer.id);
    assert.equal(row.status, "invited");
    assert.equal(row.auth_user_id, null);
  });

  await run("two simultaneous claims produce one active membership and one Auth user", async () => {
    const volunteer = await createVolunteer("IT_CONCURRENT");
    created.push(volunteer);
    const passwords = ["ConcurrentPass123!", "OtherStrongPass456!"];
    const results = await Promise.all(passwords.map((password) => invoke("claim", volunteer.code, password)));
    assert.equal(results.filter((result) => result.status === 200).length, 1, JSON.stringify(results));
    assert.equal(results.filter((result) => result.status === 409).length, 1, JSON.stringify(results));
    const row = await getVolunteer(volunteer.id);
    assert.equal(row.status, "active");
    assert.ok(row.auth_user_id);
    const users = (await authUsers()).filter((user) => user.email === volunteer.email);
    assert.equal(users.length, 1);
    const winnerIndex = results.findIndex((result) => result.status === 200);
    const login = await invoke("login", volunteer.code, passwords[winnerIndex]);
    assert.equal(login.status, 200, JSON.stringify(login.data));
  });
} finally {
  for (const volunteer of created.reverse()) {
    await cleanupVolunteer(volunteer.id, volunteer.email);
  }
}
