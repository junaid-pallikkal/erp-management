import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = Boolean(url && key)

// A placeholder client keeps the app loadable so it can show a "not configured" screen.
export const supabase = createClient(url || 'http://localhost:54321', key || 'missing-anon-key')

/** Unwraps a Supabase response, throwing a readable Error on failure. */
export function unwrap({ data, error }) {
  if (error) throw new Error(error.message || 'Request failed')
  return data
}
