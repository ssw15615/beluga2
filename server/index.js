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
const OPENSKY_SCHEDULE_FILE = './openskySchedule.json';

// Airbus airports for schedule tracking
const AIRBUS_AIRPORTS = [
  { code: 'LFBO', name: 'Toulouse Blagnac' },
  { code: 'LFRS', name: 'Nantes Atlantique' },
  { code: 'EGNR', name: 'Hawarden' },
  { code: 'LEZL', name: 'Seville' },
  { code: 'LEMD', name: 'Madrid Barajas' },
  { code: 'LEBL', name: 'Barcelona' }
];

// Beluga monitoring state
const BELUGA_REGISTRATIONS = ['F-GXLG', 'F-GXLH', 'F-GXLI', 'F-GXLJ', 'F-GXLN', 'F-GXLO', 'F-GSTF'];
const API_KEY = process.env.FR24_API_KEY;
const OPENSKY_CLIENT_ID = process.env.OPENSKY_CLIENT_ID;
const OPENSKY_CLIENT_SECRET = process.env.OPENSKY_CLIENT_SECRET;
let apiSource = process.env.API_SOURCE || 'opensky'; // 'opensky' or 'fr24'
let previousActivePlanes = new Set();
let previousChesterBound = new Set();

// OAuth2 token management for OpenSky
let openskyAccessToken = null;
let openskyTokenExpiry = 0;

// Rate limiting for OpenSky API
let lastOpenSkyCall = 0;
const OPENSKY_MIN_INTERVAL = 10000; // 10 seconds minimum between calls
let openskyBackoffDelay = 60000; // Start with 1 minute (authenticated users have 4000 credits/day)
let cachedOpenSkyData = [];
let cacheTimestamp = 0;
const CACHE_DURATION = 15000; // Cache for 15 seconds (can refresh more often with auth)

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

// Serve OpenSky schedule
app.get('/api/opensky-schedule', (req, res) => {
  try {
    const data = fs.readFileSync(OPENSKY_SCHEDULE_FILE);
    res.json(JSON.parse(data));
  } catch (e) {
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

// Get/Set API source
app.get('/api/source', (req, res) => {
  res.json({ source: apiSource });
});

app.post('/api/source', (req, res) => {
  const { source } = req.body;
  if (source === 'opensky' || source === 'fr24') {
    apiSource = source;
    console.log(`API source changed to: ${apiSource}`);
    res.json({ success: true, source: apiSource });
  } else {
    res.status(400).json({ success: false, error: 'Invalid source. Use "opensky" or "fr24"' });
  }
});

// Get live plane positions
app.get('/api/planes', async (req, res) => {
  try {
    let planes = [];
    
    if (apiSource === 'opensky') {
      planes = await fetchFromOpenSky();
    } else if (apiSource === 'fr24') {
      planes = await fetchFromFR24();
    }
    
    res.json(planes);
  } catch (error) {
    console.error('Error fetching plane data:', error);
    res.status(500).json({ error: 'Failed to fetch plane data', planes: [] });
  }
});

// Get Hawarden (EGNR) arrivals and departures from OpenSky
app.get('/api/hawarden-flights', async (req, res) => {
  try {
    const EGNR_ICAO = 'EGNR';
    const now = Math.floor(Date.now() / 1000);
    const dayAgo = now - (24 * 60 * 60); // Last 24 hours
    
    // Prepare authentication headers with OAuth2 token
    const headers = {};
    if (OPENSKY_CLIENT_ID && OPENSKY_CLIENT_SECRET) {
      const token = await getOpenskyAccessToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
    
    // Fetch arrivals and departures in parallel
    const [arrivalsRes, departuresRes] = await Promise.all([
      fetch(`https://opensky-network.org/api/flights/arrival?airport=${EGNR_ICAO}&begin=${dayAgo}&end=${now}`, { headers }),
      fetch(`https://opensky-network.org/api/flights/departure?airport=${EGNR_ICAO}&begin=${dayAgo}&end=${now}`, { headers })
    ]);
    
    const arrivals = arrivalsRes.ok ? await arrivalsRes.json() : [];
    const departures = departuresRes.ok ? await departuresRes.json() : [];
    
    // Filter for Beluga flights only
    const belugaCallsigns = BELUGA_REGISTRATIONS.map(reg => reg.replace('-', ''));
    const belugaHexCodes = Object.values(BELUGA_ICAO_HEX);
    
    const filterBelugas = (flights) => {
      return (flights || []).filter(flight => {
        const icao24 = flight.icao24?.toLowerCase();
        const callsign = flight.callsign?.trim().toUpperCase();
        return belugaHexCodes.includes(icao24) || 
               BELUGA_REGISTRATIONS.some(reg => callsign?.includes(reg.replace('-', '')));
      });
    };
    
    const belugaArrivals = filterBelugas(arrivals);
    const belugaDepartures = filterBelugas(departures);
    
    console.log(`Found ${belugaArrivals.length} Beluga arrivals and ${belugaDepartures.length} departures at EGNR`);
    
    res.json({
      arrivals: belugaArrivals,
      departures: belugaDepartures,
      airport: EGNR_ICAO,
      period: { start: dayAgo, end: now }
    });
  } catch (error) {
    console.error('Error fetching Hawarden flights:', error);
    res.status(500).json({ error: 'Failed to fetch flights', arrivals: [], departures: [] });
  }
});

// Build OpenSky schedule for all Airbus airports
app.post('/api/build-opensky-schedule', async (req, res) => {
  try {
    console.log('Building OpenSky schedule for Airbus airports...');
    const now = Math.floor(Date.now() / 1000);
    const daysAgo = now - (7 * 24 * 60 * 60); // Last 7 days
    
    // Prepare authentication headers
    const headers = {};
    if (OPENSKY_CLIENT_ID && OPENSKY_CLIENT_SECRET) {
      const token = await getOpenskyAccessToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
    
    const belugaHexCodes = Object.values(BELUGA_ICAO_HEX);
    const schedule = [];
    
    // Fetch arrivals and departures for each airport
    for (const airport of AIRBUS_AIRPORTS) {
      console.log(`Fetching flights for ${airport.name} (${airport.code})...`);
      
      try {
        const [arrivalsRes, departuresRes] = await Promise.all([
          fetch(`https://opensky-network.org/api/flights/arrival?airport=${airport.code}&begin=${daysAgo}&end=${now}`, { headers }),
          fetch(`https://opensky-network.org/api/flights/departure?airport=${airport.code}&begin=${daysAgo}&end=${now}`, { headers })
        ]);
        
        const arrivals = arrivalsRes.ok ? await arrivalsRes.json() : [];
        const departures = departuresRes.ok ? await departuresRes.json() : [];
        
        // Filter for Beluga flights and process
        const processFlights = (flights, type) => {
          return (flights || []).filter(flight => {
            const icao24 = flight.icao24?.toLowerCase();
            return belugaHexCodes.includes(icao24);
          }).map(flight => {
            const reg = Object.keys(BELUGA_ICAO_HEX).find(key => BELUGA_ICAO_HEX[key] === flight.icao24?.toLowerCase());
            const departureTime = new Date(flight.firstSeen * 1000);
            const arrivalTime = new Date(flight.lastSeen * 1000);
            const duration = Math.round((flight.lastSeen - flight.firstSeen) / 60); // minutes
            
            return {
              type: type,
              registration: reg || flight.icao24,
              callsign: flight.callsign?.trim() || '',
              departure: flight.estDepartureAirport || '',
              arrival: flight.estArrivalAirport || '',
              departureTime: departureTime.toISOString(),
              arrivalTime: arrivalTime.toISOString(),
              duration: duration,
              date: departureTime.toISOString().split('T')[0],
              firstSeen: flight.firstSeen,
              lastSeen: flight.lastSeen
            };
          });
        };
        
        schedule.push(...processFlights(arrivals, 'arrival'));
        schedule.push(...processFlights(departures, 'departure'));
        
        // Rate limiting - wait 2 seconds between airports
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`Error fetching flights for ${airport.code}:`, error);
      }
    }
    
    // Sort by departure time
    schedule.sort((a, b) => new Date(b.departureTime) - new Date(a.departureTime));
    
    // Save to file
    fs.writeFileSync(OPENSKY_SCHEDULE_FILE, JSON.stringify(schedule, null, 2));
    
    console.log(`✅ OpenSky schedule built with ${schedule.length} flights`);
    res.json({ success: true, flights: schedule.length, schedule });
  } catch (error) {
    console.error('Error building OpenSky schedule:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Push server running on http://localhost:${PORT}`);
  console.log('VAPID Public Key:', VAPID_PUBLIC_KEY);
  console.log(`API Source: ${apiSource}`);
  console.log(`OpenSky Auth: ${OPENSKY_CLIENT_ID ? 'Enabled (OAuth2, higher rate limits)' : 'Disabled (anonymous, lower rate limits)'}`);
  
  // Start monitoring Belugas
  console.log('Starting Beluga monitoring for push notifications...');
  monitorBelugas();
});

// ICAO hex codes for Beluga registrations (for OpenSky)
// ICAO hex codes for Beluga registrations (for OpenSky)
const BELUGA_ICAO_HEX = {
  'F-GXLG': '395d66', // Beluga XL1
  'F-GXLH': '395d67', // Beluga XL2 - confirmed with BGA113H callsign
  'F-GXLI': '395d68', // Beluga XL3
  'F-GXLJ': '395d69', // Beluga XL4
  'F-GXLN': '395d6d', // Beluga XL5
  'F-GXLO': '395d6e', // Beluga XL6
  'F-GSTF': '3850d5'  // Beluga ST (original)
};

// Function to get OAuth2 access token for OpenSky
async function getOpenskyAccessToken() {
  // Check if we have a valid token
  if (openskyAccessToken && Date.now() < openskyTokenExpiry) {
    return openskyAccessToken;
  }

  if (!OPENSKY_CLIENT_ID || !OPENSKY_CLIENT_SECRET) {
    return null;
  }

  try {
    console.log('Fetching new OpenSky OAuth2 token...');
    
    const response = await fetch('https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        'grant_type': 'client_credentials',
        'client_id': OPENSKY_CLIENT_ID,
        'client_secret': OPENSKY_CLIENT_SECRET
      }).toString()
    });

    if (!response.ok) {
      console.error('Failed to get OAuth2 token:', response.status, response.statusText);
      const text = await response.text();
      console.error('Response:', text);
      console.log('Falling back to anonymous access');
      return null;
    }

    const data = await response.json();
    openskyAccessToken = data.access_token;
    // Set expiry to 90% of the actual expiry time to refresh before it expires
    openskyTokenExpiry = Date.now() + (data.expires_in * 900);
    console.log('✅ OAuth2 token obtained, expires in', data.expires_in, 'seconds');
    return openskyAccessToken;
  } catch (error) {
    console.error('Error getting OAuth2 token:', error);
    console.log('Falling back to anonymous access');
    return null;
  }
}

// Function to fetch live Beluga data from OpenSky Network
async function fetchFromOpenSky() {
  try {
    const now = Date.now();
    
    // Return cached data if still valid
    if (cachedOpenSkyData.length > 0 && now - cacheTimestamp < CACHE_DURATION) {
      console.log('Returning cached OpenSky data');
      return cachedOpenSkyData;
    }
    
    // Enforce minimum interval between API calls
    const timeSinceLastCall = now - lastOpenSkyCall;
    if (timeSinceLastCall < OPENSKY_MIN_INTERVAL) {
      console.log(`Rate limit: waiting ${OPENSKY_MIN_INTERVAL - timeSinceLastCall}ms before next OpenSky call`);
      return cachedOpenSkyData;
    }
    
    console.log('Fetching from OpenSky Network...');
    lastOpenSkyCall = now;
    
    // Prepare authentication headers with OAuth2 token
    const headers = {};
    if (OPENSKY_CLIENT_ID && OPENSKY_CLIENT_SECRET) {
      const token = await getOpenskyAccessToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        console.log('Using OAuth2 authenticated OpenSky API');
      } else {
        console.log('OAuth2 token failed, using anonymous API');
      }
    } else {
      console.log('Using anonymous OpenSky API (limited rate)');
    }
    
    const response = await fetch('https://opensky-network.org/api/states/all', { headers });
    
    if (response.status === 429) {
      console.error('OpenSky API rate limit exceeded (429). Using cached data and increasing backoff.');
      // Exponentially increase backoff, cap at 5 minutes for authenticated users
      openskyBackoffDelay = Math.min(openskyBackoffDelay * 1.5, 300000);
      console.log(`Next check in ${Math.round(openskyBackoffDelay / 1000)} seconds`);
      return cachedOpenSkyData;
    }
    
    if (!response.ok) {
      console.error('OpenSky API error:', response.status);
      return cachedOpenSkyData;
    }
    
    // Successfully got data - reset backoff to 1 minute for authenticated users
    openskyBackoffDelay = 60000; // Reset to 1 minute
    
    const data = await response.json();
    const planes = [];
    
    console.log(`OpenSky returned ${data.states?.length || 0} total aircraft states`);
    console.log('Looking for Beluga hex codes:', Object.values(BELUGA_ICAO_HEX));
    
    // Filter for our Belugas by ICAO24 hex code
    const belugaHexCodes = Object.values(BELUGA_ICAO_HEX);
    
    // Debug: Look for any aircraft with Beluga callsigns (BGA)
    const belugaCallsigns = (data.states || []).filter(s => {
      const callsign = (s[1] || '').trim().toUpperCase();
      return callsign.startsWith('BGA') || callsign.includes('BELUGA');
    });
    if (belugaCallsigns.length > 0) {
      console.log('Found aircraft with BGA callsigns:');
      belugaCallsigns.forEach(s => {
        console.log(`  - ICAO: ${s[0]}, Callsign: ${s[1]?.trim()}, Pos: [${s[6]}, ${s[5]}]`);
      });
    }
    
    for (const state of data.states || []) {
      const icao24 = state[0];
      if (belugaHexCodes.includes(icao24)) {
        // Find registration from hex code
        const reg = Object.keys(BELUGA_ICAO_HEX).find(key => BELUGA_ICAO_HEX[key] === icao24);
        
        console.log(`✈️  Found Beluga: ${reg} (${icao24}) at [${state[6]}, ${state[5]}]`);
        
        planes.push({
          fr24_id: icao24,
          flight: (state[1] || '').trim() || reg,
          callsign: (state[1] || '').trim(),
          lat: state[6],
          lon: state[5],
          alt: state[7] || state[13] || 0, // baro_altitude or geo_altitude
          gspeed: state[9] || 0, // velocity in m/s
          reg: reg,
          type: 'BelugaXL',
          orig_iata: '',
          dest_iata: '',
          dest_icao: '', // OpenSky doesn't provide destination
          heading: state[10] || 0 // true_track
        });
      }
    }
    
    // Cache the results
    cachedOpenSkyData = planes;
    cacheTimestamp = now;
    console.log(`Found ${planes.length} active Belugas`);
    
    return planes;
  } catch (error) {
    console.error('Error fetching from OpenSky:', error);
    return cachedOpenSkyData;
  }
}

// Function to fetch live Beluga data from Flightradar24
async function fetchFromFR24() {
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

// Function to fetch live Beluga data from selected API
async function fetchLiveBelugas() {
  if (apiSource === 'opensky') {
    console.log('Fetching from OpenSky Network...');
    return await fetchFromOpenSky();
  } else if (apiSource === 'fr24') {
    console.log('Fetching from FlightRadar24...');
    return await fetchFromFR24();
  } else {
    console.error('Unknown API source:', apiSource);
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
  
  // Schedule next check with dynamic backoff delay
  const nextCheck = apiSource === 'opensky' ? openskyBackoffDelay : 120000;
  console.log(`Next monitoring check in ${Math.round(nextCheck / 1000)} seconds (${apiSource === 'opensky' && OPENSKY_CLIENT_ID ? 'OAuth2 authenticated' : 'standard'} mode)`);
  setTimeout(monitorBelugas, nextCheck);
}

