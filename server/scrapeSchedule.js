import fetch from 'node-fetch';
import fs from 'fs';
import * as cheerio from 'cheerio';

const SCHEDULE_URL = 'https://www.belugaxlinfo.com/';
const SCHEDULE_FILE = './flightSchedule.json';
const LOCATIONS_FILE = './belugarLocations.json';

export async function scrapeSchedule() {
  try {
    const res = await fetch(SCHEDULE_URL);
    const html = await res.text();
    const $ = cheerio.load(html);
    const newFlights = [];

    // Parse date/time string into ISO datetime
    const parseDateTime = (dateStr, timeStr) => {
      try {
        const now = new Date();
        const dateParts = String(dateStr || '').split('/').map(x => parseInt(x, 10));
        const timeParts = String(timeStr || '').split(':').map(x => parseInt(x, 10));
        const d = dateParts[0] || 1;
        const m = dateParts[1] || 1;
        const h = timeParts[0] || 0;
        const min = timeParts[1] || 0;
        if (!isFinite(d) || !isFinite(m)) return null;
        
        // Start with current year
        let year = now.getFullYear();
        let dt = new Date(year, m - 1, d, h, min, 0, 0);
        
        // If the resulting date is more than 30 days in the future, assume it's from last year
        const daysDiff = (dt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        if (daysDiff > 30) {
          year--;
          dt = new Date(year, m - 1, d, h, min, 0, 0);
        }
        
        return dt.toISOString();
      } catch {
        return null;
      }
    };

    const buildKey = (f) => [f.date, f.time, f.flight, f.airport, f.route, f.type].join('|');

    // Find all h3 headings that contain airport info (e.g., "Hawarden (EGNR) Departures")
    $('h3').each((idx, heading) => {
      const headingText = $(heading).text().trim();
      const match = headingText.match(/^(.+?)\s+\(([A-Z]{4})\)\s+(Arrivals|Departures)$/);
      
      console.log(`[DEBUG H3 ${idx}] "${headingText}" => match=${match ? 'YES' : 'NO'}`);
      
      if (!match) return;

      const airport = match[1];
      const icao = match[2];
      const type = match[3];
      
      console.log(`[DEBUG H3 ${idx}] Found: airport='${airport}' icao='${icao}' type='${type}'`);
      
      // Find the first table after this heading
      const table = $(heading).nextAll('table').first();
      
      if (table.length === 0) {
        console.log(`[DEBUG H3 ${idx}] No table found after heading`);
        return;
      }

      const rows = table.find('tr');
      console.log(`[DEBUG H3 ${idx}] Table has ${rows.length} rows`);
      
      rows.each((rowIdx, row) => {
        const cells = $(row).find('td').map((_, td) => $(td).text().trim()).get();
        
        console.log(`[DEBUG ROW ${rowIdx}] cells.length=${cells.length}, cells=${JSON.stringify(cells)}`);
        
        // Skip empty rows or headers
        if (cells.length < 6) {
          console.log(`[DEBUG ROW ${rowIdx}] SKIPPED - not enough cells`);
          return;
        }

        // ACTUAL layout (0-indexed):
        // 0: Unix timestamp, 1: status word (Scheduled), 2: flight number, 3: route/destination, 4: aircraft type, 5: status label
        const timestamp = cells[0] || '';
        const statusWord = cells[1] || '';  // "Scheduled" or similar
        const flight = cells[2] || '';
        const route = cells[3] || '';
        const aircraft = cells[4] || '';
        const statusLabel = cells[5] || '';  // delayed/estimated/scheduled

        // Convert Unix timestamp to readable date and time
        let date = '';
        let time = '';
        if (timestamp) {
          try {
            const ts = parseInt(timestamp, 10);
            if (isFinite(ts)) {
              const dt = new Date(ts * 1000);
              date = `${dt.getDate().toString().padStart(2, '0')}/${(dt.getMonth() + 1).toString().padStart(2, '0')}`;
              time = `${dt.getHours().toString().padStart(2, '0')}:${dt.getMinutes().toString().padStart(2, '0')}`;
            }
          } catch (e) {
            console.log(`[DEBUG ROW ${rowIdx}] Error parsing timestamp: ${e.message}`);
          }
        }

        console.log(`[DEBUG ROW ${rowIdx}] extracted: date='${date}' time='${time}' statusWord='${statusWord}' flight='${flight}' route='${route}' aircraft='${aircraft}' statusLabel='${statusLabel}'`);

        if (!date || !flight) {
          console.log(`[DEBUG ROW ${rowIdx}] Skipping row - missing date or flight`);
          return;
        }

        const flightObj = {
          scrapedAt: new Date().toISOString(),
          date: date,
          time: time,
          status: statusLabel,  // Use the actual status label (delayed/estimated/scheduled)
          flight: flight,
          route: route,
          aircraft: aircraft,
          airport: airport,
          icao: icao,
          type: type,
          departure: airport,
          arrival: route,
          datetime: parseDateTime(date, time),
        };

        newFlights.push(flightObj);
      });
    });

    // Read existing flights
    let allFlights = [];
    try {
      const existing = fs.readFileSync(SCHEDULE_FILE, 'utf-8');
      allFlights = JSON.parse(existing);
    } catch {
      allFlights = [];
    }

    // Merge new + existing, dedupe by key
    const merged = [...newFlights, ...allFlights];
    const seen = new Set();
    const deduped = [];
    for (const f of merged) {
      const key = buildKey(f);
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(f);
      }
    }

    // Keep only items scraped in the last 6 months
    const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
    const recent = deduped.filter(f => (f.scrapedAt || '') >= sixMonthsAgo);

    // Sort by actual flight datetime (desc), fallback to scrapedAt
    recent.sort((a, b) => {
      const ad = a.datetime || a.scrapedAt || '';
      const bd = b.datetime || b.scrapedAt || '';
      return bd.localeCompare(ad);
    });

    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(recent, null, 2));
    console.log(`[scrapeSchedule] Saved ${recent.length} flights (${newFlights.length} new) to ${SCHEDULE_FILE}`);
  } catch (error) {
    console.error('[scrapeSchedule] Error:', error.message);
  }
}

export async function scrapeLocations() {
  try {
    const res = await fetch(SCHEDULE_URL);
    const html = await res.text();
    const $ = cheerio.load(html);
    
    const locations = {};

    // Location block now uses flex rows under the "Where are the Belugas now?" heading
    const locHeading = $('h2').filter((_, h) => $(h).text().trim().toLowerCase().includes('where are the belugas now'));
    const locSection = locHeading.nextUntil('h2');

    // Preferred: parse flex rows (two .flex-cell children: identity + location)
    locSection.find('.flex-row').each((_, row) => {
      const rowEl = $(row);
      if (rowEl.hasClass('header')) return; // skip header row
      const cells = rowEl.find('.flex-cell').map((__, cell) => $(cell).text().trim()).get();
      if (cells.length < 2) return;
      const match = String(cells[0]).match(/BelugaXL-(\d+)/i);
      if (!match) return;
      const xlNumber = match[1];
      locations[xlNumber] = cells[1];
    });

    // Fallback: older table layout
    if (Object.keys(locations).length === 0) {
      const locTable = locHeading.nextAll('table').first();
      if (locTable.length) {
        locTable.find('tr').each((rowIdx, row) => {
          const cells = $(row).find('td, th').map((_, td) => $(td).text().trim()).get();
          if (cells.length >= 2) {
            const match = String(cells[0]).match(/BelugaXL-(\d+)/i);
            if (match) {
              const xlNumber = match[1];
              locations[xlNumber] = cells[1];
            }
          }
        });

        // Fallback for flattened table
        if (Object.keys(locations).length === 0) {
          const flatCells = locTable.find('td').map((_, td) => $(td).text().trim()).get();
          for (let i = 0; i + 1 < flatCells.length; i += 2) {
            const match = String(flatCells[i]).match(/BelugaXL-(\d+)/i);
            if (match) {
              const xlNumber = match[1];
              locations[xlNumber] = flatCells[i + 1];
            }
          }
        }
      }
    }

    if (Object.keys(locations).length > 0) {
      fs.writeFileSync(LOCATIONS_FILE, JSON.stringify(locations, null, 2));
      console.log(`[scrapeLocations] Saved locations for ${Object.keys(locations).length} planes to ${LOCATIONS_FILE}`);
    } else {
      console.log('[scrapeLocations] No location data found in tables or flex rows');
    }
  } catch (error) {
    console.error('[scrapeLocations] Error:', error.message);
  }
}

// Run both scrapers immediately and then every hour
export async function runScrapers() {
  await scrapeSchedule();
  await scrapeLocations();
}

// Only auto-run when executed directly (not when imported)
try {
  const invokedScript = process.argv[1] || ''
  if (invokedScript.endsWith('scrapeSchedule.js')) {
    runScrapers();
    setInterval(runScrapers, 60 * 60 * 1000);
  }
} catch {}
