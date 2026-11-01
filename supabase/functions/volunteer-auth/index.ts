import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const ANON = publishableKeys.default ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const SECRET = secretKeys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_ID = "04a0788a-6043-4383-875e-8edd68c9adf3";
const ORIGINS = new Set(["https://aq-law.nl", "https://www.aq-law.nl", "https://nagham2824.github.io"]);

const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ORIGINS.has(origin) ? origin : "https://aq-law.nl",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
const json = (data: unknown, status = 200, origin: string | null = null) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
const admin = createClient(URL, SECRET, { auth: { autoRefreshToken: false, persistSession: false } });
const publicAuth = () => createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value.trim().toUpperCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return "AQ-" + Array.from(bytes, b => alphabet[b % alphabet.length]).join("");
}
function randomTemporaryPassword() {
  const groups = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%*+-_"];
  const all = groups.join("");
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const chars = groups.map((group, i) => group[bytes[i] % group.length]);
  for (let i = groups.length; i < bytes.length; i++) chars.push(all[bytes[i] % all.length]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = bytes[i % bytes.length] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
function validNewPassword(password: string) {
  return password.length >= 12 && password.length <= 128 &&
    /[A-Z]/.test(password) && /[a-z]/.test(password) &&
    /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password);
}
function internalEmail(id: string) {
  return "vol-" + id.replaceAll("-", "") + "@members.aq-law.invalid";
}
async function identify(token: string) {
  if (!token) return null;
  const client = createClient(URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: "Bearer " + token } },
  });
  const { data, error } = await client.auth.getUser(token);
  return error ? null : data.user;
}
async function volunteerFor(userId: string) {
  const { data, error } = await admin.from("volunteers").select("*").eq("auth_user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

async function consumeAuthAttempt(bucketKey: string, maxAttempts: number) {
  const { data, error } = await admin.rpc("consume_volunteer_auth_attempt", {
    p_bucket_key: bucketKey,
    p_max_attempts: maxAttempts,
    p_window_seconds: 900,
  });
  if (error) throw error;
  return data === true;
}

async function clearAuthAttempts(bucketKeys: string[]) {
  const { error } = await admin.rpc("clear_volunteer_auth_attempts", {
    p_bucket_keys: bucketKeys,
  });
  if (error) console.error("Could not clear volunteer auth rate-limit counters:", error);
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
  try {
    const body = await req.json();
    const action = String(body.action ?? "");
    const authorization = req.headers.get("Authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

    if (action === "claim" || action === "login") {
      const code = String(body.code ?? "").trim().toUpperCase();
      const password = String(body.password ?? "");
      if (!/^AQ-[A-HJ-NP-Z2-9]{10}$/.test(code) || password.length < 12 || password.length > 128) {
        return json({ error: "رمز العضوية أو كلمة السر غير صالح. يجب أن تكون كلمة السر 12 حرفاً على الأقل." }, 400, origin);
      }
      const clientIp = req.headers.get("cf-connecting-ip") ?? "";
      if (!clientIp || clientIp.length > 64) {
        return json({ error: "تعذر التحقق من مصدر الاتصال. حاول مرة أخرى." }, 503, origin);
      }

      const hash = await sha256(code);
      const ipBucket = "volunteer-auth:ip:" + await sha256(clientIp);
      const codeBucket = "volunteer-auth:code:" + hash;

      if (!await consumeAuthAttempt(ipBucket, 20) || !await consumeAuthAttempt(codeBucket, 5)) {
        return json({ error: "محاولات كثيرة خلال وقت قصير. انتظر 15 دقيقة ثم حاول مجدداً." }, 429, origin);
      }

      const { data: volunteer, error } = await admin.from("volunteers").select("*").eq("member_code_hash", hash).maybeSingle();
      if (error) throw error;
      if (!volunteer || volunteer.status !== "active" && !(action === "claim" && volunteer.status === "invited")) {
        return json({ error: "تعذر التحقق من بيانات العضوية أو أن العضوية غير مفعّلة." }, 401, origin);
      }

      let authUserId = volunteer.auth_user_id;
      if (action === "claim") {
        if (authUserId || volunteer.status !== "invited") return json({ error: "تم تفعيل هذه العضوية مسبقاً. استخدم تسجيل الدخول." }, 409, origin);
        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email: internalEmail(volunteer.id), password, email_confirm: true,
          user_metadata: { account_type: "volunteer" },
        });
        if (createError) return json({ error: "تعذر إنشاء الحساب. تحقق من كلمة السر وحاول مجدداً." }, 400, origin);
        authUserId = created.user.id;
        const { error: updateError } = await admin.from("volunteers").update({
          auth_user_id: authUserId, status: "active", claimed_at: new Date().toISOString(), activated_at: new Date().toISOString(),
        }).eq("id", volunteer.id).is("auth_user_id", null);
        if (updateError) {
          await admin.auth.admin.deleteUser(authUserId);
          throw updateError;
        }
      }

      const { data: signed, error: signError } = await publicAuth().auth.signInWithPassword({
        email: internalEmail(volunteer.id), password,
      });
      if (signError || !signed.session) {
        if (action === "claim" && authUserId) {
          await admin.from("volunteers").update({ auth_user_id: null, status: "invited", claimed_at: null, activated_at: null }).eq("id", volunteer.id);
          await admin.auth.admin.deleteUser(authUserId);
        }
        return json({ error: "تعذر تسجيل الدخول. تأكد من رقم العضوية وكلمة السر." }, 401, origin);
      }
      const now = new Date();
      const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const { data: sessionRow, error: sessionSaveError } = await admin.from("volunteers").update({
        last_login_at: now.toISOString(), session_started_at: now.toISOString(), session_expires_at: expires.toISOString(),
      }).eq("id", volunteer.id).select("id").maybeSingle();
      if (sessionSaveError || !sessionRow) {
        console.error("Could not persist volunteer session expiry:", sessionSaveError);
        return json({ error: "تعذر حفظ جلسة الدخول. حاول تسجيل الدخول مرة أخرى." }, 503, origin);
      }
      await clearAuthAttempts([ipBucket, codeBucket]);
      return json({ session: signed.session, expiresAt: expires.toISOString(), displayName: volunteer.display_name, mustChangePassword: signed.user?.app_metadata?.must_change_password === true }, 200, origin);
    }

    if (action === "create_volunteer" || action === "set_volunteer_status" || action === "list_volunteers" || action === "reset_volunteer_password" || action === "reset_volunteer_code" || action === "delete_volunteer") {
      const user = await identify(token);
      if (!user || user.id !== ADMIN_ID) return json({ error: "غير مصرح" }, 403, origin);

      if (action === "create_volunteer") {
        const name = String(body.displayName ?? "").trim().slice(0, 100);
        if (!name) return json({ error: "أدخل اسم المتطوع." }, 400, origin);
        const code = randomCode();
        const { data, error } = await admin.from("volunteers").insert({
          member_code_hash: await sha256(code),
          member_code_hint: code.slice(-4),
          display_name: name,
          status: "invited",
          created_by: ADMIN_ID,
        }).select("id,display_name,status,created_at,member_code_hint").single();
        if (error) throw error;
        return json({ volunteer: data, memberCode: code }, 201, origin);
      }

      if (action === "set_volunteer_status") {
        const id = String(body.volunteerId ?? "");
        const status = String(body.status ?? "");
        if (!/^[0-9a-f-]{36}$/i.test(id) || !["active", "suspended"].includes(status)) return json({ error: "بيانات غير صالحة." }, 400, origin);
        const { data, error } = await admin.from("volunteers").update({ status }).eq("id", id).select("id,display_name,status,member_code_hint").single();
        if (error) throw error;
        return json({ volunteer: data }, 200, origin);
      }

      if (action === "reset_volunteer_code") {
        const id = String(body.volunteerId ?? "");
        if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "بيانات غير صالحة." }, 400, origin);
        const { data: volunteer, error: volunteerError } = await admin.from("volunteers")
          .select("id,display_name,status").eq("id", id).maybeSingle();
        if (volunteerError) throw volunteerError;
        if (!volunteer || volunteer.status !== "active") {
          return json({ error: "لا يمكن إصدار رمز جديد لهذه العضوية. تأكدي من أنها فعّالة." }, 400, origin);
        }
        const memberCode = randomCode();
        const { error: updateError } = await admin.from("volunteers").update({
          member_code_hash: await sha256(memberCode),
          member_code_hint: memberCode.slice(-4),
        }).eq("id", id);
        if (updateError) throw updateError;
        return json({ memberCode, volunteerName: volunteer.display_name }, 200, origin);
      }

      if (action === "delete_volunteer") {
        const id = String(body.volunteerId ?? "");
        if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "بيانات غير صالحة." }, 400, origin);
        const { data: volunteer, error: volunteerError } = await admin.from("volunteers")
          .select("id,display_name,status,auth_user_id").eq("id", id).maybeSingle();
        if (volunteerError) throw volunteerError;
        if (!volunteer) return json({ error: "العضوية غير موجودة." }, 404, origin);
        const { error: suspendError } = await admin.from("volunteers")
          .update({ status: "suspended" }).eq("id", id);
        if (suspendError) throw suspendError;
        if (volunteer.auth_user_id) {
          const { error: authDeleteError } = await admin.auth.admin.deleteUser(volunteer.auth_user_id);
          if (authDeleteError) return json({ error: "تم إيقاف العضوية، لكن تعذر حذف حساب الدخول. حاول الحذف مرة أخرى." }, 502, origin);
        }
        const { error: rowDeleteError } = await admin.from("volunteers").delete().eq("id", id);
        if (rowDeleteError) {
          console.error("Volunteer auth user deleted; membership row deletion failed:", rowDeleteError);
          return json({ error: "تم إبطال حساب الدخول، لكن تعذر حذف سجل العضوية. أعد المحاولة أو راجع الدعم." }, 502, origin);
        }
        return json({ success: true, deletedVolunteerName: volunteer.display_name }, 200, origin);
      }

      if (action === "reset_volunteer_password") {
        const id = String(body.volunteerId ?? "");
        if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "بيانات غير صالحة." }, 400, origin);
        const { data: volunteer, error: volunteerError } = await admin.from("volunteers")
          .select("id,display_name,status,auth_user_id").eq("id", id).maybeSingle();
        if (volunteerError) throw volunteerError;
        if (!volunteer || volunteer.status !== "active" || !volunteer.auth_user_id) {
          return json({ error: "لا يمكن إعادة تعيين كلمة مرور هذه العضوية." }, 400, origin);
        }
        const { data: authRecord, error: authError } = await admin.auth.admin.getUserById(volunteer.auth_user_id);
        if (authError || !authRecord?.user) throw authError ?? new Error("Volunteer auth user not found");
        const temporaryPassword = randomTemporaryPassword();
        const appMetadata = authRecord.user.app_metadata ?? {};
        const { error: updateError } = await admin.auth.admin.updateUserById(volunteer.auth_user_id, {
          password: temporaryPassword,
          app_metadata: { ...appMetadata, must_change_password: true },
        });
        if (updateError) throw updateError;
        return json({ temporaryPassword, volunteerName: volunteer.display_name }, 200, origin);
      }

      const { data, error } = await admin.from("volunteers")
        .select("id,display_name,status,created_at,activated_at,last_login_at,member_code_hint")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return json({ volunteers: data }, 200, origin);
    }

    if (action === "change_volunteer_password") {
      const user = await identify(token);
      if (!user) return json({ error: "انتهت جلسة الدخول. سجّل الدخول مجدداً." }, 401, origin);
      const volunteer = await volunteerFor(user.id);
      if (!volunteer || volunteer.status !== "active") return json({ error: "العضوية غير نشطة." }, 403, origin);
      if (!volunteer.session_expires_at || new Date(volunteer.session_expires_at).getTime() <= Date.now()) {
        return json({ error: "انتهت الجلسة. سجّل الدخول مجدداً." }, 401, origin);
      }
      if (user.app_metadata?.must_change_password !== true) return json({ error: "لا يوجد تغيير كلمة مرور مطلوب لهذا الحساب." }, 403, origin);
      const password = String(body.password ?? "");
      if (!validNewPassword(password)) return json({ error: "يجب أن تتضمن كلمة المرور 12 حرفاً على الأقل، وحرفاً كبيراً وصغيراً ورقماً ورمزاً." }, 400, origin);
      const { data: authRecord, error: authError } = await admin.auth.admin.getUserById(user.id);
      if (authError || !authRecord?.user || authRecord.user.app_metadata?.must_change_password !== true) return json({ error: "تعذر التحقق من طلب تغيير كلمة المرور." }, 403, origin);
      const appMetadata = authRecord.user.app_metadata ?? {};
      const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
        password,
        app_metadata: { ...appMetadata, must_change_password: false },
      });
      if (updateError) throw updateError;
      return json({ success: true }, 200, origin);
    }

    if (action === "submit_article") {
      const user = await identify(token);
      if (!user) return json({ error: "انتهت جلسة الدخول. سجّل الدخول مجدداً." }, 401, origin);
      if (user.app_metadata?.must_change_password === true) return json({ error: "يجب تغيير كلمة المرور المؤقتة قبل إرسال المقالات." }, 403, origin);
      const volunteer = await volunteerFor(user.id);
      if (!volunteer || volunteer.status !== "active" || !volunteer.session_expires_at || new Date(volunteer.session_expires_at).getTime() <= Date.now()) {
        return json({ error: "انتهت الجلسة أو أن العضوية موقوفة. سجّل الدخول مجدداً." }, 401, origin);
      }
      const title = String(body.title ?? "").trim();
      const content = String(body.content ?? "").trim();
      const category = String(body.category ?? "general");
      const language = String(body.language ?? "ar");
      const sourceUrl = String(body.source_url ?? "").trim();
      const allowedCategories = ["public-law","private-law","student","refugee","resident","general"];
      if (!title || title.length > 180 || !content || content.length > 30000 || !allowedCategories.includes(category) || !["ar","nl","tr","en"].includes(language) || sourceUrl.length > 1000) {
        return json({ error: "راجع بيانات المقال؛ هناك حقل ناقص أو يتجاوز الحد المسموح." }, 400, origin);
      }
      const { data, error } = await admin.from("articles").insert({
        title, content, category, language, source_url: sourceUrl || null,
        author_name: volunteer.display_name, volunteer_id: volunteer.id, status: "pending_review",
      }).select("id,title,status,created_at").single();
      if (error) throw error;
      return json({ article: data }, 201, origin);
    }

    return json({ error: "إجراء غير معروف." }, 400, origin);
  } catch (error) {
    console.error("volunteer-auth error", error);
    return json({ error: "حدث خطأ غير متوقع. حاول مرة أخرى." }, 500, origin);
  }
});