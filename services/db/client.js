const { createClient } = require("@supabase/supabase-js");

let client = null;

function isSupabaseConfigured() {
  return Boolean(
    process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );
}

function getSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase nicht konfiguriert (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).");
  }
  if (!client) {
    client = createClient(
      process.env.SUPABASE_URL.trim(),
      process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return client;
}

module.exports = { getSupabase, isSupabaseConfigured };
