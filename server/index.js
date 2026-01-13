import express from 'express';
import webpush from 'web-push';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Load or set your VAPID keys here
const VAPID_PUBLIC_KEY = 'BJX_2b3pWrz3uVgCMpAAbQHIli26GBIpP8ZokX_2aFWbpCe1eDVVbFmqq7CYif9dDRvMfwXNzqW3czJESi0b0rw';
const VAPID_PRIVATE_KEY = '7qhRnQP9bmav5LrJTHYebq7jElA-b5iUavJmMgai9ec';

webpush.setVapidDetails(
  'mailto:your@email.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// Configure CORS to allow Vercel frontend
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:4173',
      'https://beluga2-ammr.vercel.app',
      'https://beluga.stbw.co.uk'
    ];
    
    // Check if origin is in allowed list or matches Vercel pattern
    if (allowedOrigins.includes(origin) || origin.includes('.vercel.app')) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(bodyParser.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'Beluga Tracker API',
    timestamp: new Date().toISOString(),
    hasApiKey: !!API_KEY
  });
});

// Store subscriptions in memory (for demo); use a DB for production
let subscriptions = [];
const SUBS_FILE = './subscriptions.json';

// Beluga monitoring state
const BELUGA_REGISTRATIONS = ['F-GXLG', 'F-GXLH', 'F-GXLI', 'F-GXLJ', 'F-GXLN', 'F-GXLO'];
const API_KEY = process.env.FR24_API_KEY;
let previousActivePlanes = new Set();
let previousChesterBound = new Set();

// Validate environment
if (!API_KEY) {
  console.warn('⚠️  FR24_API_KEY not set - live plane tracking will not work');
}

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
  
  // Start monitoring Belugas
  console.log('Starting Beluga monitoring for push notifications...');
  monitorBelugas();
});

// Function to fetch live Beluga data from Flightradar24
async function fetchLiveBelugas() {
  try {
    const response = await fetch(
      `https://fr24api.flightradar24.com/api/live/flight-positions/full?registrations=${BELUGA_REGISTRATIONS.join(',')}`,
      {
        headers: {
          'accept': 'application/json',
          'accept-version': 'v1',
          'authorization': `Bearer ${API_KEY}`
        }
      }
    );

    if (response.status === 429) {
      console.log('Rate limited - skipping this check');
      return [];
    }

    if (!response.ok) {
      console.error('Failed to fetch live data:', response.status);
      return [];
    }

    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('Error fetching live Beluga data:', error);
    return [];
  }
}

// Function to send push notifications to all subscribed users
async function sendPushNotification(title, body, url = '/') {
  if (subscriptions.length === 0) {
    console.log('No subscriptions to send notification to');
    return;
  }

  const payload = JSON.stringify({ title, body, url });
  let sent = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(sub, payload);
      sent++;
    } catch (err) {
      console.error('Push notification failed:', err);
      failed++;
      // Remove invalid subscriptions
      if (err.statusCode === 410 || err.statusCode === 404) {
        subscriptions = subscriptions.filter(s => s.endpoint !== sub.endpoint);
        saveSubscriptions();
      }
    }
  }

  console.log(`Push notification sent: ${sent} successful, ${failed} failed`);
  console.log(`Title: ${title}`);
  console.log(`Body: ${body}`);
}

// Monitor Belugas and send notifications
async function monitorBelugas() {
  const planes = await fetchLiveBelugas();
  
  // Get current active plane registrations
  const currentActivePlanes = new Set(planes.map(p => p.reg));
  
  // Check for newly active planes
  for (const reg of currentActivePlanes) {
    if (!previousActivePlanes.has(reg)) {
      const plane = planes.find(p => p.reg === reg);
      console.log(`🔔 New active Beluga detected: ${reg} (${plane?.flight || 'Unknown flight'})`);
      await sendPushNotification(
        `Beluga ${reg} is now Active! ✈️`,
        `Flight ${plane?.flight || 'Unknown'} is now airborne`,
        '/'
      );
    }
  }
  
  // Check for planes flying to Chester (EGNR)
  const currentChesterBound = new Set();
  for (const plane of planes) {
    if (plane.dest_icao === 'EGNR') {
      currentChesterBound.add(plane.reg);
      
      // Only notify if this is a new Chester-bound flight
      if (!previousChesterBound.has(plane.reg)) {
        console.log(`🔔 Beluga heading to Chester detected: ${plane.reg} (${plane.flight})`);
        await sendPushNotification(
          `Beluga ${plane.reg} heading to Chester! 🎯`,
          `Flight ${plane.flight} is en route to EGNR`,
          '/'
        );
      }
    }
  }
  
  // Update previous state
  previousActivePlanes = currentActivePlanes;
  previousChesterBound = currentChesterBound;
  
  // Schedule next check in 2 minutes (to respect rate limits)
  setTimeout(monitorBelugas, 120000); // 2 minutes
}

