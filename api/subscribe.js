const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://ezualehbkmbquvjpvdhn.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6dWFsZWhia21icXV2anB2ZGhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyODk2NDgsImV4cCI6MjA5NDg2NTY0OH0.cZkJ7GkB8mRaGO-9uQl9b7awwlQcmgSH9bRd0nxkb2Q'
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const subscription = req.body;
    if (!subscription?.endpoint) return res.status(400).json({ error: 'invalid subscription' });
    const id = Buffer.from(subscription.endpoint).toString('base64').slice(0, 64);
    const { error } = await supabase.from('push_subscriptions').upsert({ id, subscription });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'no endpoint' });
    const id = Buffer.from(endpoint).toString('base64').slice(0, 64);
    await supabase.from('push_subscriptions').delete().eq('id', id);
    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: 'method not allowed' });
};
