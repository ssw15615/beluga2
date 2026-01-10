import express from 'express';
import webpush from 'web-push';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs';

const app = express();
const PORT = 4000;

// Load or set your VAPID keys here
const VAPID_PUBLIC_KEY = 'BJX_2b3pWrz3uVgCMpAAbQHIli26GBIpP8ZokX_2aFWbpCe1eDVVbFmqq7CYif9dDRvMfwXNzqW3czJESi0b0rw';
const VAPID_PRIVATE_KEY = '7qhRnQP9bmav5LrJTHYebq7jElA-b5iUavJmMgai9ec';

webpush.setVapidDetails(
  'mailto:your@email.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

app.use(cors());
app.use(bodyParser.json());

// Store subscriptions in memory (for demo); use a DB for production
let subscriptions = [];
const SUBS_FILE = './subscriptions.json';

// Load subscriptions from file if exists
if (fs.existsSync(SUBS_FILE)) {
  subscriptions = JSON.parse(fs.readFileSync(SUBS_FILE));
}

function saveSubscriptions() {
  fs.writeFileSync(SUBS_FILE, JSON.stringify(subscriptions, null, 2));
}

// Serve latest scraped schedule
app.get('/api/schedule', (req, res) => {
  try {
    const data = fs.readFileSync('./flightSchedule.json');
    res.json(JSON.parse(data));
  } catch (e) {
    // Return an empty array instead of 404 so the frontend stays alive when no flights are present
    res.json([]);
  }
});

// Serve Beluga locations
app.get('/api/locations', (req, res) => {
  try {
    const data = fs.readFileSync('./belugarLocations.json');
    res.json(JSON.parse(data));
  } catch (e) {
    // Return an empty object instead of 404 when locations are missing
    res.json({});
  }
});

// Trigger scraping now
app.post('/api/scrape', async (req, res) => {
  try {
    const { scrapeSchedule, scrapeLocations } = await import('./scrapeSchedule.js');
    await scrapeSchedule();
    await scrapeLocations();
    
    let schedule = [];
    let locations = {};
    
    try {
      schedule = JSON.parse(fs.readFileSync('./flightSchedule.json', 'utf-8'));
    } catch (e) {
      console.log('No flight schedule found');
    }
    
    try {
      locations = JSON.parse(fs.readFileSync('./belugarLocations.json', 'utf-8'));
    } catch (e) {
      console.log('No locations found');
    }
    
    res.json({ ok: true, flights: schedule.length, planes: Object.keys(locations).length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'Scrape failed' });
  }
});

app.post('/api/subscribe', (req, res) => {
  const sub = req.body;
  if (!subscriptions.find(s => s.endpoint === sub.endpoint)) {
    subscriptions.push(sub);
    saveSubscriptions();
    console.log('New subscription added:', sub.endpoint);
  }
  res.status(201).json({ success: true });
});

app.post('/api/notify', async (req, res) => {
  const { title, body, url } = req.body;
  const payload = JSON.stringify({ title, body, url });
  let sent = 0;
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(sub, payload);
      sent++;
    } catch (err) {
      console.error('Push failed:', err);
    }
  }
  res.json({ sent });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Push server running on http://localhost:${PORT}`);
  console.log('VAPID Public Key:', VAPID_PUBLIC_KEY);
});
