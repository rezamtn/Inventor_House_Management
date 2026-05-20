import { createClient } from '@supabase/supabase-js'

const URL  = "https://ezualehbkmbquvjpvdhn.supabase.co"
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6dWFsZWhia21icXV2anB2ZGhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyODk2NDgsImV4cCI6MjA5NDg2NTY0OH0.cZkJ7GkB8mRaGO-9uQl9b7awwlQcmgSH9bRd0nxkb2Q"

export const supabase = createClient(URL, ANON)

export async function loadFromCloud() {
  try {
    const { data, error } = await supabase
      .from('inventory')
      .select('data')
      .eq('id', 'main')
      .single()
    if (error) throw error
    return data?.data || null
  } catch(_) { return null }
}

export async function saveToCloud(payload) {
  try {
    const { error } = await supabase
      .from('inventory')
      .upsert({ id: 'main', data: payload, updated_at: new Date().toISOString() })
    return !error
  } catch(_) { return false }
}
