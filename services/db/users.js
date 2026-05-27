const { getSupabase } = require("./client");

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function rowToUser(row, oauthRows = []) {
  if (!row) return null;
  const authProviders = {};
  for (const o of oauthRows) {
    authProviders[o.provider] = o.provider_id;
  }
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    picture: row.picture,
    createdAt: row.created_at,
    ...(Object.keys(authProviders).length ? { authProviders } : {}),
  };
}

async function loadOAuthForUser(userId) {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("user_oauth").select("provider, provider_id").eq("user_id", userId);
  if (error) throw error;
  return data || [];
}

async function findUserByEmail(email) {
  const supabase = getSupabase();
  const norm = normalizeEmail(email);
  const { data, error } = await supabase.from("users").select("*").eq("email", norm).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const oauth = await loadOAuthForUser(data.id);
  return rowToUser(data, oauth);
}

async function findUserById(id) {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("users").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const oauth = await loadOAuthForUser(data.id);
  return rowToUser(data, oauth);
}

async function findUserByProvider(provider, providerId) {
  const supabase = getSupabase();
  const { data: link, error } = await supabase
    .from("user_oauth")
    .select("user_id")
    .eq("provider", provider)
    .eq("provider_id", providerId)
    .maybeSingle();
  if (error) throw error;
  if (!link) return null;
  return findUserById(link.user_id);
}

async function linkOAuth(userId, provider, providerId) {
  const supabase = getSupabase();
  const { error } = await supabase.from("user_oauth").upsert(
    { user_id: userId, provider, provider_id: providerId },
    { onConflict: "provider,provider_id" }
  );
  if (error) throw error;
}

async function createUser({ email, name, passwordHash, passwordSalt, picture }) {
  const supabase = getSupabase();
  const norm = normalizeEmail(email);
  const { data, error } = await supabase
    .from("users")
    .insert({
      email: norm,
      name: String(name || "").trim() || norm.split("@")[0],
      password_hash: passwordHash || null,
      password_salt: passwordSalt || null,
      picture: picture || null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      const existing = await findUserByEmail(norm);
      if (existing?.authProviders && !existing.passwordHash) {
        const err = new Error("Diese E-Mail nutzt Google oder Apple. Bitte dort anmelden.");
        err.code = "OAUTH_ACCOUNT";
        throw err;
      }
      const err = new Error("E-Mail ist bereits registriert.");
      err.code = "EMAIL_EXISTS";
      throw err;
    }
    throw error;
  }
  return rowToUser(data);
}

async function findOrCreateOAuthUser({ provider, providerId, email, name, picture }) {
  const existing = await findUserByProvider(provider, providerId);
  if (existing) {
    const supabase = getSupabase();
    const updates = {};
    if (picture && !existing.picture) updates.picture = picture;
    if (name?.trim()) updates.name = name.trim();
    if (Object.keys(updates).length) {
      await supabase.from("users").update(updates).eq("id", existing.id);
    }
    await linkOAuth(existing.id, provider, providerId);
    return { ...existing, ...updates };
  }

  const norm = email ? normalizeEmail(email) : "";
  if (!norm) {
    const err = new Error(
      "Apple hat keine E-Mail geteilt. Bitte erneut anmelden und E-Mail freigeben."
    );
    err.code = "OAUTH_NO_EMAIL";
    throw err;
  }

  const byEmail = await findUserByEmail(norm);
  if (byEmail) {
    await linkOAuth(byEmail.id, provider, providerId);
    const supabase = getSupabase();
    const updates = {};
    if (picture && !byEmail.picture) updates.picture = picture;
    if (name?.trim()) updates.name = name.trim();
    if (Object.keys(updates).length) {
      await supabase.from("users").update(updates).eq("id", byEmail.id);
    }
    return { ...byEmail, authProviders: { ...byEmail.authProviders, [provider]: providerId }, ...updates };
  }

  const user = await createUser({
    email: norm,
    name: name || norm.split("@")[0],
    picture,
  });
  await linkOAuth(user.id, provider, providerId);
  return { ...user, authProviders: { [provider]: providerId } };
}

function userHasPassword(user) {
  return Boolean(user?.passwordHash && user?.passwordSalt);
}

function toPublicUser(user) {
  return { id: user.id, email: user.email, name: user.name };
}

module.exports = {
  normalizeEmail,
  findUserByEmail,
  findUserById,
  findUserByProvider,
  findOrCreateOAuthUser,
  createUser,
  toPublicUser,
  userHasPassword,
};
