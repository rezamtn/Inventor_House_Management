import crypto from 'node:crypto';
import webpush from 'web-push';
import upstreamHelpers from '../server/upstream.cjs';

const { inventoryRequest } = upstreamHelpers;

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();
  if (!process.env.CRON_SECRET || !safeEqual(req.headers.authorization, `Bearer ${process.env.CRON_SECRET}`)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return res.status(503).json({ error: 'push_not_configured' });
  webpush.setVapidDetails(subject, publicKey, privateKey);
  try {
    const [inventoryResponse, subscriptionsResponse] = await Promise.all([
      inventoryRequest('/api/inventory'), inventoryRequest('/api/push-subscriptions')
    ]);
    if (!inventoryResponse.ok || !subscriptionsResponse.ok) return res.status(503).json({ error: 'upstream_unavailable' });
    const inventory = (await inventoryResponse.json()).data;
    const subscriptions = (await subscriptionsResponse.json()).subscriptions || [];
    const needed = [];
    const sectors = ['yakhchal', 'ashpazkhane', 'anbar', 'hamam'];
    const labels = { yakhchal: 'یخچال', ashpazkhane: 'آشپزخانه', anbar: 'انباری', hamam: 'حمام' };
    for (const house of inventory?.houses || []) {
      for (const sectorId of sectors) {
        const sector = house.sectors?.[sectorId];
        if (!sector) continue;
        const collect = items => (items || []).filter(item => item.status === 'needed')
          .forEach(item => needed.push(`${item.name} (${house.name} - ${labels[sectorId]})`));
        collect(sector.items);
        for (const section of sector.sections || []) {
          collect(section.items);
          for (const subsection of section.subsections || []) collect(subsection.items);
        }
      }
    }
    if (needed.length === 0) return res.status(200).json({ sent: 0, message: 'nothing_needed' });
    if (subscriptions.length === 0) return res.status(200).json({ sent: 0, message: 'no_subscribers' });
    const body = needed.length <= 5 ? needed.join('، ') : `${needed.slice(0, 5).join('، ')} و ${needed.length - 5} مورد دیگر`;
    const payload = JSON.stringify({ title: `🛒 لیست خرید — ${needed.length} مورد`, body, icon: '/icon-192.png', badge: '/icon-96.png', url: '/' });
    let sent = 0;
    let failed = 0;
    await Promise.all(subscriptions.map(async subscription => {
      try {
        await webpush.sendNotification(subscription, payload);
        sent += 1;
      } catch (error) {
        failed += 1;
        if (error.statusCode === 404 || error.statusCode === 410) {
          await inventoryRequest('/api/push-subscriptions', {
            method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: subscription.endpoint })
          });
        }
      }
    }));
    return res.status(200).json({ sent, failed, total: needed.length });
  } catch (error) {
    console.error('notification failed', error?.message || error);
    return res.status(503).json({ error: 'service_unavailable' });
  }
}
