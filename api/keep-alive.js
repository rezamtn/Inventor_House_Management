const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://ezualehbkmbquvjpvdhn.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6dWFsZWhia21icXV2anB2ZGhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyODk2NDgsImV4cCI6MjA5NDg2NTY0OH0.cZkJ7GkB8mRaGO-9uQl9b7awwlQcmgSH9bRd0nxkb2Q'
);

// Lightweight read-only ping to keep the Supabase free-tier project from
// auto-pausing after 7 days of inactivity. Runs on a schedule via vercel.json.
module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

  const { error } = await supabase
    .from('inventory')
    .select('id')
    .eq('id', 'main')
    .single();

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.status(200).json({ ok: true, pinged_at: new Date().toISOString() });
};
