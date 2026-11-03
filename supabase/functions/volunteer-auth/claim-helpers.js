export function validNewPassword(password) {
  return password.length >= 12 && password.length <= 128 &&
    /[A-Z]/.test(password) && /[a-z]/.test(password) &&
    /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password);
}

export async function finalizeVolunteerClaim({
  volunteerId,
  authUserId,
  updateVolunteer,
  deleteAuthUser,
}) {
  let claimed = null;
  let updateError = null;

  try {
    const result = await updateVolunteer(volunteerId, authUserId);
    claimed = result.data;
    updateError = result.error;
  } catch (error) {
    updateError = error;
  }

  if (updateError || !claimed) {
    let cleanupError = null;
    try {
      const cleanup = await deleteAuthUser(authUserId);
      cleanupError = cleanup.error;
    } catch (error) {
      cleanupError = error;
    }
    return {
      ok: false,
      conflict: !updateError,
      updateError,
      cleanupError,
    };
  }

  return { ok: true };
}
