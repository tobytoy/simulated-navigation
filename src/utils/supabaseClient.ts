import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase URL or Anon Key is missing. Please check your environment variables in .env.'
  );
}

// Create and export the Supabase client instance for client-side database access
export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');
