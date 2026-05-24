const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://ezualehbkmbquvjpvdhn.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6dWFsZWhia21icXV2anB2ZGhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyODk2NDgsImV4cCI6MjA5NDg2NTY0OH0.cZkJ7GkB8mRaGO-9uQl9b7awwlQcmgSH9bRd0nxkb2Q'
);

webpush.setVapidDetails(
  'mailto:reza.mot2001@gmail.com',
  'BOGZiKAFAQnJDEQ_qfQbmQWblUStai9erzPp1wGPmQAtELeRdW-Y56I8YGrFWXPGKqeOZek5lkIIWqEtatnCItQ',
  '72UcRCadfbulfxwaEBPp7WHik_yOKWn0QntkoH7Vb84'
);

module.exports = async (req, res) => {
  // Allow manual trigger too
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

  // Load inventory data
  const { data: invRow } = await supabase.from('inventory').select('data').eq('id','main').single();
  const inventory = invRow?.data;

  // Collect all needed items
  const needed = [];
  if (inventory?.houses) {
    const SECTORS = ['yakhchal','ashpazkhane','anbar','hamam'];
    const LABELS  = { yakhchal:'یخچال', ashpazkhane:'آشپزخانه', anbar:'انباری', hamam:'حمام' };
    inventory.houses.forEach(h => {
      SECTORS.forEach(sid => {
        const sd = h.sectors?.[sid];
        if (!sd) return;
        const collect = (items) => items?.filter(i=>i.status==='needed').forEach(i=>needed.push(`${i.name} (${h.name} - ${LABELS[sid]})`));
        collect(sd.items);
        (sd.sections||[]).forEach(s => {
          collect(s.items);
          (s.subsections||[]).forEach(sub => collect(sub.items));
        });
      });
    });
  }

  if (needed.length === 0) return res.status(200).json({ sent: 0, message: 'nothing needed' });

  const body = needed.length <= 5
    ? needed.join('، ')
    : needed.slice(0,5).join('، ') + ` و ${needed.length - 5} مورد دیگر`;

  const payload = JSON.stringify({
    title: `🛒 لیست خرید — ${needed.length} مورد`,
    body,
    icon: '/icon-192.png',
    badge: '/icon-96.png',
    url: '/'
  });

  // Load all subscriptions
  const { data: subs } = await supabase.from('push_subscriptions').select('subscription');
  if (!subs?.length) return res.status(200).json({ sent: 0, message: 'no subscribers' });

  let sent = 0, failed = 0;
  await Promise.all(subs.map(async row => {
    try {
      await webpush.sendNotification(row.subscription, payload);
      sent++;
    } catch (err) {
      failed++;
      // Remove expired/invalid subscriptions
      if (err.statusCode === 410 || err.statusCode === 404) {
        const id = Buffer.from(row.subscription.endpoint).toString('base64').slice(0,64);
        await supabase.from('push_subscriptions').delete().eq('id', id);
      }
    }
  }));

  res.status(200).json({ sent, failed, total: needed.length });
};
