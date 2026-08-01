import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Null when env vars are absent: the app runs in local/guest mode.
export const supabase = url && anonKey ? createClient(url, anonKey) : null;
