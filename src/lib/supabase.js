import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Implicit flow, not the PKCE default: the sign-in link has to work when the
// email app opens it in its own in-app browser, which is a different storage
// context than the one that requested the link. PKCE keeps its verifier in
// that original context, so those links land signed-out. Implicit puts the
// session in the URL fragment, so any browser can complete it.
export const supabase =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          flowType: "implicit",
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;
