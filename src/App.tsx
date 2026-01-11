import React, { useState, useEffect } from 'react'

// Helper: Convert base64 VAPID public key to Uint8Array
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// TODO: Replace with your backend endpoint and VAPID public key
const VAPID_PUBLIC_KEY = 'BJX_2b3pWrz3uVgCMpAAbQHIli26GBIpP8ZokX_2aFWbpCe1eDVVbFmqq7CYif9dDRvMfwXNzqW3czJESi0b0rw';
const PUSH_SUBSCRIBE_ENDPOINT = 'https://your-backend.example.com/api/subscribe';

interface Plane {
  fr24_id: string
  flight: string
  callsign: string
  lat: number
  lon: number
  alt: number
  gspeed: number
  reg: string
  type: string
  orig_iata: string
  dest_iata: string
  dest_icao: string
  heading?: number
  dist?: number
}
import Map from './components/Map'
import PlaneList from './components/PlaneList'
import HistorySelector from './components/HistorySelector'
import ProximityDisplay from './components/ProximityDisplay'
import FleetStatus from './components/FleetStatus'
import ScheduledFlights from './components/ScheduledFlights'
import HistoricFlights from './components/HistoricFlights'
import './App.css'

// Theme context
// Subscribe user to push notifications and send to backend
function usePushSubscription() {
  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then(async (registration) => {
        // Check for existing subscription
        const existing = await registration.pushManager.getSubscription();
        if (!existing) {
          try {
            const sub = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            });
            // Send subscription to backend
            await fetch(PUSH_SUBSCRIBE_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(sub),
            });
            console.log('Push subscription sent to backend');
          } catch (err) {
            console.error('Push subscription failed:', err);
          }
        } else {
          console.log('Already subscribed to push');
        }
      });
    }
  }, []);
}
const ThemeContext = React.createContext<{
  theme: 'light' | 'dark'
  toggleTheme: () => void
}>({
  theme: 'light',
  toggleTheme: () => {}
})

const BELUGA_REGISTRATIONS = ['F-GXLG', 'F-GXLH', 'F-GXLI', 'F-GXLJ', 'F-GXLN', 'F-GXLO']
const API_KEY = '019b9077-3179-71c5-a92f-b1879c84889b|TMlN9GK6WOMVo4nBWcR6BBBQRNwMvFzUycKuynx561cf2b00'
const EGNR_LAT = 53.1744
const EGNR_LON = -2.9779
const CACHE_DURATION = 60 * 60 * 1000 // 1 hour in milliseconds

// Cache helper functions
const getCacheKey = (reg: string, timestamp: number) => `fr24_history_${reg}_${timestamp}`

const getCachedData = (key: string) => {
  try {
    const cached = localStorage.getItem(key)
    if (cached) {
      const parsed = JSON.parse(cached)
      if (Date.now() - parsed.timestamp < CACHE_DURATION) {
        return parsed.data
      } else {
        localStorage.removeItem(key) // Remove expired cache
      }
    }
  } catch (error) {
    console.error('Error reading cache:', error)
  }
  return null
}

const setCachedData = (key: string, data: any) => {
  try {
    localStorage.setItem(key, JSON.stringify({
      data,
      timestamp: Date.now()
    }))
  } catch (error) {
    console.error('Error writing cache:', error)
  }
}

const clearHistoryCache = () => {
  try {
    const keys = Object.keys(localStorage).filter(key => key.startsWith('fr24_history_'))
    keys.forEach(key => localStorage.removeItem(key))
    console.log(`Cleared ${keys.length} cached history entries`)
  } catch (error) {
    console.error('Error clearing cache:', error)
  }
}

function App() {
  usePushSubscription();
  const [planes, setPlanes] = useState([])
  const [historyHours, setHistoryHours] = useState(3)
  const [historyData, setHistoryData] = useState<{ [reg: string]: any[] }>({})
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    // Load theme from localStorage or default to dark
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'dark'
  })
  const [scrapedData, setScrapedData] = useState<any>({ schedules: [], locations: {} })

  // Fetch schedule and location data from backend
  useEffect(() => {
    async function fetchData() {
      try {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
        console.log('Fetching from API_URL:', API_URL)
        const [scheduleRes, locationsRes] = await Promise.all([
          fetch(`${API_URL}/api/schedule`),
          fetch(`${API_URL}/api/locations`)
        ]);
        console.log('Schedule response status:', scheduleRes.status)
        console.log('Locations response status:', locationsRes.status)
        const schedules = await scheduleRes.json();
        const locationsData = await locationsRes.json();
        console.log('Schedules:', schedules)
        console.log('Locations:', locationsData)
        setScrapedData({ schedules, locations: locationsData });
      } catch (e) {
        console.error('Error fetching data:', e);
      }
    }
    fetchData();
    const interval = setInterval(fetchData, 60 * 60 * 1000); // every hour
    return () => clearInterval(interval);
  }, [])

  const handleScrapeNow = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
      const res = await fetch(`${API_URL}/api/scrape`, { method: 'POST' })
      const data = await res.json()
      console.log('Scrape status:', data)
      // Refresh data after scrape
      const [scheduleRes, locationsRes] = await Promise.all([
        fetch(`${API_URL}/api/schedule`),
        fetch(`${API_URL}/api/locations`)
      ])
      const schedules = await scheduleRes.json()
      const locationsData = await locationsRes.json()
      setScrapedData({ schedules, locations: locationsData })
    } catch (e) {
      console.error('Scrape failed:', e)
    }
  }

  useEffect(() => {
    // Data is hardcoded from scraping
  }, [])

  // Removed fetchScrapedData and parseScrapedData as data is hardcoded

  useEffect(() => {
    fetchLiveData()
    const interval = setInterval(fetchLiveData, 20000) // Update every 20s
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    fetchHistoryData()
  }, [historyHours])

  // Expose clear cache function for debugging
  useEffect(() => {
    (window as any).clearHistoryCache = clearHistoryCache
  }, [])

  // Save theme to localStorage
  useEffect(() => {
    localStorage.setItem('theme', theme)
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light')
  }

  // Theme Toggle Component
  const ThemeToggle = () => (
    <button 
      onClick={toggleTheme}
      className="theme-toggle"
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
    >
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  )

  const fetchLiveData = async (retryCount = 0) => {
    try {
      const response = await fetch(`https://fr24api.flightradar24.com/api/live/flight-positions/full?registrations=${BELUGA_REGISTRATIONS.join(',')}`, {
        headers: {
          'accept': 'application/json',
          'accept-version': 'v1',
          'authorization': `Bearer ${API_KEY}`
        }
      })
      
      if (response.status === 429) {
        // Rate limited, wait and retry
        const waitTime = Math.min(1000 * Math.pow(2, retryCount), 30000) // Exponential backoff, max 30s
        console.log(`Rate limited, retrying in ${waitTime}ms...`)
        setTimeout(() => fetchLiveData(retryCount + 1), waitTime)
        return
      }
      
      const data = await response.json()
      console.log('FR24 API response:', data) // Debug log
      setPlanes(data.data || [])
    } catch (error) {
      console.error('Error fetching live data:', error)
      // Retry on network errors
      if (retryCount < 3) {
        setTimeout(() => fetchLiveData(retryCount + 1), 2000)
      }
    }
  }

  const fetchHistoryData = async () => {
    const now = Math.floor(Date.now() / 1000)
    // Round to 5-minute intervals for consistent cache keys
    const roundedNow = Math.floor(now / 300) * 300
    const interval = (historyHours * 3600) / 5 // 5 points
    const timestamps = []
    for (let i = 1; i <= 5; i++) {
      timestamps.push(roundedNow - (i * interval))
    }
    const newHistory: { [reg: string]: any[] } = {}
    
    for (const reg of BELUGA_REGISTRATIONS) {
      const positions = []
      for (const ts of timestamps) {
        const cacheKey = getCacheKey(reg, ts)
        let data = getCachedData(cacheKey)
        
        if (data) {
          console.log(`Using cached data for ${reg} at ${ts}`)
        } else {
          console.log(`Fetching fresh data for ${reg} at ${ts}`)
        }
        
        if (!data) {
          // Data not in cache, fetch from API
          try {
            const response = await fetch(`https://fr24api.flightradar24.com/api/historic/flight-positions/full?registrations=${reg}&timestamp=${ts}`, {
              headers: {
                'accept': 'application/json',
                'accept-version': 'v1',
                'authorization': `Bearer ${API_KEY}`
              }
            })
            
            if (response.status === 429) {
              console.log(`Rate limited for ${reg} at ${ts}, skipping...`)
              data = [] // Skip this request
            } else {
              const responseData = await response.json()
              data = responseData.data || []
              setCachedData(cacheKey, data) // Cache the result
            }
            
            // Add a small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 200))
          } catch (error) {
            console.error(`Error fetching history for ${reg} at ${ts}:`, error)
            data = [] // Use empty array on error
          }
        }
        
        if (data && data.length > 0) {
          positions.push(...data)
        }
      }
      newHistory[reg] = positions
    }
    setHistoryData(newHistory)
  }

  const closestPlane = planes.reduce((closest, plane) => {
    const dist = haversineDistance((plane as Plane).lat, (plane as Plane).lon, EGNR_LAT, EGNR_LON)
    return !closest || dist < (closest as Plane & { dist?: number })?.dist! ? { ...(plane as Plane), dist } : closest
  }, null as Plane | null)

  const flyingToEGNR: Plane | null = planes.find((plane: Plane) => plane.dest_icao === 'EGNR') || null

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <div className="app">
        <div className="header">
          <h1>Airbus Beluga XL Fleet Tracker</h1>
          <ThemeToggle />
          <button onClick={handleScrapeNow} className="theme-toggle" title="Scrape schedule & locations now">🔄 Scrape Now</button>
        </div>
        <div className="controls">
          <HistorySelector hours={historyHours} onChange={setHistoryHours} />
          <ProximityDisplay closest={closestPlane} flyingTo={flyingToEGNR} />
        </div>
        <div className="main">
          <Map planes={planes} historyData={historyData} scrapedData={scrapedData} />
          <PlaneList planes={planes} />
        </div>
        <FleetStatus allRegistrations={BELUGA_REGISTRATIONS} activePlanes={planes} scrapedData={scrapedData} historyData={historyData} schedules={scrapedData.schedules || []} />
        <ScheduledFlights schedules={scrapedData.schedules || []} />
        <HistoricFlights schedules={scrapedData.schedules || []} />
      </div>
    </ThemeContext.Provider>
  )
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371 // Radius of the Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const km = R * c
  return km * 0.621371 // Convert km to miles
}

export default App
