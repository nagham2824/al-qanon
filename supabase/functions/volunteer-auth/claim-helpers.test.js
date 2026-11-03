import test from "node:test";
import assert from "node:assert/strict";
import { finalizeVolunteerClaim, validNewPassword } from "./claim-helpers.js";

test("password policy accepts a strong password", () => {
  assert.equal(validNewPassword("StrongPass123!"), true);
});

test("password policy rejects passwords shorter than 12 characters", () => {
  assert.equal(validNewPassword("Aa1!short"), false);
});

test("password policy rejects passwords longer than 128 characters", () => {
  assert.equal(validNewPassword("Aa1!" + "x".repeat(125)), false);
});

test("password policy requires an uppercase letter", () => {
  assert.equal(validNewPassword("lowercase123!"), false);
});

test("password policy requires a lowercase letter", () => {
  assert.equal(validNewPassword("UPPERCASE123!"), false);
});

test("password policy requires a digit", () => {
  assert.equal(validNewPassword("NoDigitsHere!!"), false);
});

test("password policy requires a non-alphanumeric symbol", () => {
  assert.equal(validNewPassword("NoSymbol12345"), false);
});

test("password policy accepts the 12-character minimum", () => {
  assert.equal(validNewPassword("Abcdefgh1!xy"), true);
});

test("password policy accepts the 128-character maximum", () => {
  assert.equal(validNewPassword("Aa1!" + "x".repeat(124)), true);
});

test("successful claim does not delete the auth user", async () => {
  const deleted = [];
  const result = await finalizeVolunteerClaim({
    volunteerId: "vol-1",
    authUserId: "auth-1",
    updateVolunteer: async (id, userId) => ({
      data: { id, auth_user_id: userId },
      error: null,
    }),
    deleteAuthUser: async (userId) => {
      deleted.push(userId);
      return { error: null };
    },
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(deleted, []);
});

test("a zero-row conditional update is treated as a conflict and cleaned up", async () => {
  const deleted = [];
  const result = await finalizeVolunteerClaim({
    volunteerId: "vol-1",
    authUserId: "auth-loser",
    updateVolunteer: async () => ({ data: null, error: null }),
    deleteAuthUser: async (userId) => {
      deleted.push(userId);
      return { error: null };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.conflict, true);
  assert.deepEqual(deleted, ["auth-loser"]);
});

test("an update error triggers cleanup and is preserved for the caller", async () => {
  const deleted = [];
  const updateError = new Error("database unavailable");
  const result = await finalizeVolunteerClaim({
    volunteerId: "vol-1",
    authUserId: "auth-failed",
    updateVolunteer: async () => ({ data: null, error: updateError }),
    deleteAuthUser: async (userId) => {
      deleted.push(userId);
      return { error: null };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.conflict, false);
  assert.equal(result.updateError, updateError);
  assert.deepEqual(deleted, ["auth-failed"]);
});

test("concurrent claims allow exactly one winner and clean up the loser", async () => {
  let claimedAuthUserId = null;
  const deleted = [];

  const updateVolunteer = async (_volunteerId, authUserId) => {
    await Promise.resolve();
    if (claimedAuthUserId !== null) return { data: null, error: null };
    claimedAuthUserId = authUserId;
    return { data: { id: "vol-1" }, error: null };
  };

  const deleteAuthUser = async (authUserId) => {
    deleted.push(authUserId);
    return { error: null };
  };

  const [first, second] = await Promise.all([
    finalizeVolunteerClaim({
      volunteerId: "vol-1",
      authUserId: "auth-first",
      updateVolunteer,
      deleteAuthUser,
    }),
    finalizeVolunteerClaim({
      volunteerId: "vol-1",
      authUserId: "auth-second",
      updateVolunteer,
      deleteAuthUser,
    }),
  ]);

  assert.equal([first, second].filter((result) => result.ok).length, 1);
  assert.equal([first, second].filter((result) => !result.ok && result.conflict).length, 1);
  assert.ok(["auth-first", "auth-second"].includes(claimedAuthUserId));
  assert.deepEqual(deleted, [
    claimedAuthUserId === "auth-first" ? "auth-second" : "auth-first",
  ]);
});

test("cleanup failure is returned without hiding the claim conflict", async () => {
  const cleanupError = new Error("auth cleanup failed");
  const result = await finalizeVolunteerClaim({
    volunteerId: "vol-1",
    authUserId: "auth-loser",
    updateVolunteer: async () => ({ data: null, error: null }),
    deleteAuthUser: async () => ({ error: cleanupError }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.conflict, true);
  assert.equal(result.cleanupError, cleanupError);
});
