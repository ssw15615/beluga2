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
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || 'BJX_2b3pWrz3uVgCMpAAbQHIli26GBIpP8ZokX_2aFWbpCe1eDVVbFmqq7CYif9dDRvMfwXNzqW3czJESi0b0rw';

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

// Login Screen Component
function LoginScreen({ onLogin, theme }: { onLogin: (password: string) => boolean, theme: 'light' | 'dark' }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const success = onLogin(password)
    if (success) {
      setError(false)
    } else {
      setError(true)
      setPassword('')
    }
  }

  return (
    <div className={`app ${theme}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div style={{ 
        background: theme === 'dark' ? '#1e1e1e' : '#ffffff',
        padding: '2rem',
        borderRadius: '12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        maxWidth: '400px',
        width: '100%'
      }}>
        <h1 style={{ textAlign: 'center', marginBottom: '1.5rem' }}>🛫 Beluga Tracker</h1>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoFocus
              style={{
                width: '100%',
                padding: '0.75rem',
                fontSize: '1rem',
                borderRadius: '8px',
                border: error ? '2px solid #ff4444' : '1px solid #ccc',
                background: theme === 'dark' ? '#2d2d2d' : '#f5f5f5',
                color: theme === 'dark' ? '#ffffff' : '#000000',
                outline: 'none'
              }}
            />
            {error && <p style={{ color: '#ff4444', fontSize: '0.875rem', marginTop: '0.5rem' }}>Incorrect password</p>}
          </div>
          <button
            type="submit"
            className="theme-toggle"
            style={{
              width: '100%',
              padding: '0.75rem',
              fontSize: '1rem',
              cursor: 'pointer'
            }}
          >
            Login
          </button>
        </form>
      </div>
    </div>
  )
}

// Subscribe user to push notifications and send to backend
function usePushSubscription() {
  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then(async (registration) => {
        // Check for existing subscription
        const existing = await registration.pushManager.getSubscription();
        if (!existing) {
          try {
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
            const sub = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            });
            // Send subscription to backend
            await fetch(`${API_URL}/api/subscribe`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(sub),
            });
            console.log('✅ Push notifications enabled: You will be notified when a Beluga flies to Chester or becomes active');
          } catch (err) {
            console.error('Push subscription failed:', err);
          }
        } else {
          console.log('✅ Already subscribed to push notifications');
        }
      });
    } else {
      console.log('⚠️ Push notifications not supported in this browser');
    }
  }, []);
}

// Theme context
const ThemeContext = React.createContext<{
  theme: 'light' | 'dark'
  toggleTheme: () => void
}>({
  theme: 'light',
  toggleTheme: () => {}
})

const BELUGA_REGISTRATIONS = ['F-GXLG', 'F-GXLH', 'F-GXLI', 'F-GXLJ', 'F-GXLN', 'F-GXLO', 'F-GSTF']
const FR24_API_KEY = import.meta.env.VITE_FR24_API_KEY || ''
const EGNR_LAT = 53.1744
const EGNR_LON = -2.9779
const CACHE_DURATION = 60 * 60 * 1000 // 1 hour in milliseconds

type ApiSource = 'flightradar24' | 'opensky' | 'none'

// ...existing code...

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
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('beluga_auth') === 'true'
  })
  const [planes, setPlanes] = useState([])
  const [historyHours, setHistoryHours] = useState(48)
  const [historyData, setHistoryData] = useState<{ [reg: string]: any[] }>(() => {
    // Load persisted history from localStorage on mount
    try {
      const raw = localStorage.getItem('beluga_flight_history')
      if (raw) return JSON.parse(raw)
    } catch {}
    return {}
  })
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    // Load theme from localStorage or default to dark
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'dark'
  })
  const [scrapedData, setScrapedData] = useState<any>({ schedules: [], locations: {} })
  const [openskySchedule, setOpenskySchedule] = useState<any[]>([])
  const [scheduleSource, setScheduleSource] = useState<'scraper' | 'opensky'>(() => {
    return (localStorage.getItem('scheduleSource') as 'scraper' | 'opensky') || 'scraper'
  })
  const [apiSource, setApiSource] = useState<ApiSource>(() => {
    return (localStorage.getItem('apiSource') as ApiSource) || 'opensky'
  })
  const [apiStatus, setApiStatus] = useState<{ fr24: boolean | null }>({
    fr24: null
  })
  const [backendApiSource, setBackendApiSource] = useState<'opensky' | 'fr24'>('opensky')
  const [showApiSettings, setShowApiSettings] = useState(false)

  // Fetch schedule and location data from backend
  useEffect(() => {
    async function fetchData() {
      try {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
        console.log('Fetching from API_URL:', API_URL)
        const [scheduleRes, locationsRes, openskyScheduleRes] = await Promise.all([
          fetch(`${API_URL}/api/schedule`),
          fetch(`${API_URL}/api/locations`),
          fetch(`${API_URL}/api/opensky-schedule`)
        ]);
        console.log('Schedule response status:', scheduleRes.status)
        console.log('Locations response status:', locationsRes.status)
        console.log('OpenSky schedule response status:', openskyScheduleRes.status)
        const schedules = await scheduleRes.json();
        const locationsData = await locationsRes.json();
        const openskyScheduleData = await openskyScheduleRes.json();
        console.log('Schedules:', schedules)
        console.log('Locations:', locationsData)
        console.log('OpenSky schedules:', openskyScheduleData)
        setScrapedData({ schedules, locations: locationsData });
        setOpenskySchedule(openskyScheduleData);
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
      
      // Also fetch history data when user clicks scrape
      await fetchHistoryData()
    } catch (e) {
      console.error('Scrape failed:', e)
    }
  }

  const handleBuildOpenSkySchedule = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
      console.log('Building OpenSky schedule...')
      const res = await fetch(`${API_URL}/api/build-opensky-schedule`, { method: 'POST' })
      const data = await res.json()
      console.log('OpenSky schedule built:', data)
      if (data.success) {
        setOpenskySchedule(data.schedule)
      }
    } catch (e) {
      console.error('OpenSky schedule build failed:', e)
    }
  }

  const testNotification = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
      const res = await fetch(`${API_URL}/api/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Notification',
          body: 'Push notifications are working! 🛫',
          url: '/'
        })
      })
      const data = await res.json()
      console.log(`Test notification sent to ${data.sent} subscriber(s)`)
      alert(`Test notification sent to ${data.sent} subscriber(s)`)
    } catch (e) {
      console.error('Test notification failed:', e)
      alert('Test notification failed - check console')
    }
  }

  const changeBackendApiSource = async (source: 'opensky' | 'fr24') => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
      const res = await fetch(`${API_URL}/api/source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source })
      })
      const data = await res.json()
      if (data.success) {
        setBackendApiSource(source)
        console.log(`Backend API source changed to: ${source}`)
      }
    } catch (e) {
      console.error('Failed to change backend API source:', e)
    }
  }

  // Fetch current backend API source on mount
  useEffect(() => {
    const fetchBackendSource = async () => {
      try {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
        const res = await fetch(`${API_URL}/api/source`)
        const data = await res.json()
        setBackendApiSource(data.source)
      } catch (e) {
        console.error('Failed to fetch backend API source:', e)
      }
    }
    fetchBackendSource()
  }, [])

  useEffect(() => {
    // Data is hardcoded from scraping
  }, [])

  // Removed fetchScrapedData and parseScrapedData as data is hardcoded

  useEffect(() => {
    fetchLiveData()
    const interval = setInterval(fetchLiveData, 60000) // Update every 60s
    return () => clearInterval(interval)
  }, [])

  // Persist flight history for each plane for 48 hours
  useEffect(() => {
    if (!planes || planes.length === 0) return
    const now = Math.floor(Date.now() / 1000)
    const cutoff = now - 48 * 3600
    setHistoryData(prev => {
      const updated: { [reg: string]: any[] } = { ...prev }
      for (const plane of planes) {
        if (!plane.reg || !plane.lat || !plane.lon) continue
        const entry = {
          lat: plane.lat,
          lon: plane.lon,
          timestamp: now,
          alt: plane.alt,
          heading: plane.heading,
          flight: plane.flight,
          callsign: plane.callsign
        }
        const arr = Array.isArray(updated[plane.reg]) ? updated[plane.reg].filter((p: any) => p.timestamp >= cutoff) : []
        arr.push(entry)
        updated[plane.reg] = arr
      }
      // Persist to localStorage
      try {
        localStorage.setItem('beluga_flight_history', JSON.stringify(updated))
      } catch {}
      return updated
    })
  }, [planes])

  useEffect(() => {
    // Don't auto-fetch history on mount to avoid rate limiting
    // Users can manually trigger with the Scrape Now button
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

  // Save API source to localStorage
  useEffect(() => {
    localStorage.setItem('apiSource', apiSource)
  }, [apiSource])

  // Save schedule source to localStorage
  useEffect(() => {
    localStorage.setItem('scheduleSource', scheduleSource)
  }, [scheduleSource])

  // Auto-scrape every 30 minutes
  useEffect(() => {
    const autoScrape = async () => {
      try {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
        await fetch(`${API_URL}/api/scrape`, { method: 'POST' })
        console.log('[Auto-scrape] Scraped schedule and locations')
      } catch (e) {
        console.error('[Auto-scrape] Failed:', e)
      }
    }

    // Run immediately on mount
    autoScrape()
    
    // Then run every 30 minutes
    const interval = setInterval(autoScrape, 30 * 60 * 1000) // 30 minutes
    
    return () => clearInterval(interval)
  }, [])

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light')
  }

  const handleLogin = (password: string) => {
    const correctPassword = import.meta.env.VITE_APP_PASSWORD || 'beluga2026'
    if (password === correctPassword) {
      setIsAuthenticated(true)
      localStorage.setItem('beluga_auth', 'true')
      return true
    }
    return false
  }

  const handleLogout = () => {
    setIsAuthenticated(false)
    localStorage.removeItem('beluga_auth')
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

  const fetchFromFlightRadar24 = async () => {
    try {
      const response = await fetch(`https://fr24api.flightradar24.com/api/live/flight-positions/full?registrations=${BELUGA_REGISTRATIONS.join(',')}`, {
        headers: {
          'accept': 'application/json',
          'accept-version': 'v1',
          'authorization': `Bearer ${FR24_API_KEY}`
        }
      })
      
      if (!response.ok) {
        throw new Error(`FR24 API error: ${response.status}`)
      }
      
      const data = await response.json()
      console.log('FR24 API response:', data)
      setApiStatus(prev => ({ ...prev, fr24: true }))
      return data.data || []
    } catch (error) {
      console.error('FlightRadar24 API error:', error)
      setApiStatus(prev => ({ ...prev, fr24: false }))
      throw error
    }
  }

  const fetchFromOpenSky = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
      const response = await fetch(`${API_URL}/api/planes`)
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }
      
      const planes = await response.json()
      console.log('Backend API response:', planes)
      setApiStatus(prev => ({ ...prev, fr24: null }))
      return planes
    } catch (error) {
      console.error('Backend API error:', error)
      setApiStatus(prev => ({ ...prev, fr24: null }))
      throw error
    }
  }

  // Note: ADS-B Exchange API blocks CORS from browsers
  // Would need to implement a backend proxy to use ADSBX

  const fetchLiveData = async (retryCount = 0) => {
    try {
      // If API source is 'none', skip fetching
      if (apiSource === 'none') {
        console.log('Flight tracking API disabled')
        setPlanes([])
        return
      }
      
      let data
      
      // Try selected API first
      if (apiSource === 'opensky') {
        console.log('Fetching from OpenSky Network...')
        data = await fetchFromOpenSky()
      } else if (apiSource === 'flightradar24') {
        try {
          data = await fetchFromFlightRadar24()
        } catch (error) {
          console.log('FR24 failed - API credit limit reached')
          setApiStatus(prev => ({ ...prev, adsbx: false }))
          setPlanes([])
          return
        }
      } else {
        // ADSBX is blocked by CORS in browsers
        console.log('ADSBX requires server-side proxy (not implemented yet)')
        setApiStatus(prev => ({ ...prev, adsbx: false }))
        // Try FR24 as fallback
        try {
          data = await fetchFromFlightRadar24()
          setApiSource('flightradar24')
        } catch (error) {
          console.log('Both APIs unavailable')
          setPlanes([])
          return
        }
      }
      
      setPlanes(data || [])
    } catch (error) {
      console.error('Error fetching live data:', error)
      if (retryCount < 3) {
        setTimeout(() => fetchLiveData(retryCount + 1), 5000)
      }
    }
  }

  const fetchHistoryData = async () => {
    // Skip history fetching if API is disabled or not FR24 (OpenSky doesn't support historical data)
    if (apiSource === 'none' || apiSource === 'opensky') {
      console.log('[fetchHistoryData] Skipped - API disabled or not supported')
      setHistoryData({})
      return
    }
    
    const now = Math.floor(Date.now() / 1000)
    const newHistory: { [reg: string]: any[] } = {}
    
    // Calculate time range
    const timeBack = historyHours * 3600 // seconds
    const startTime = now - timeBack
    
    console.log(`[fetchHistoryData] Fetching history for ${historyHours} hours (${new Date(startTime * 1000).toISOString()} to ${new Date(now * 1000).toISOString()})`)
    
    for (const reg of BELUGA_REGISTRATIONS) {
      const positions: any[] = []
      
      try {
        const cacheKey = `fr24_history_all_${reg}_${Math.floor(startTime / 3600)}`
        let data = getCachedData(cacheKey)
        
        if (data) {
          console.log(`[fetchHistoryData] Using cached comprehensive data for ${reg} (${data.length} positions)`)
        } else {
          console.log(`Fetching comprehensive historic data for ${reg} from ${new Date(startTime * 1000).toISOString()}`)
          
          // Fetch comprehensive historic data using the historic flight search
          try {
            const response = await fetch(
              `https://fr24api.flightradar24.com/api/historic/flight-positions/full?registrations=${reg}&begin=${startTime}&end=${now}`,
              {
                headers: {
                  'accept': 'application/json',
                  'accept-version': 'v1',
                  'authorization': `Bearer ${FR24_API_KEY}`
                }
              }
            )
            
            if (response.status === 429) {
              console.log(`[fetchHistoryData] Rate limited for ${reg}, using fallback method...`)
              // Fallback: fetch snapshots at intervals
              data = await fetchHistorySnapshots(reg, startTime, now)
            } else if (response.ok) {
              const responseData = await response.json()
              data = responseData.data || []
              console.log(`[fetchHistoryData] Fetched ${data.length} positions for ${reg}`)
              if (data.length > 0) {
                console.log(`[fetchHistoryData] Sample data for ${reg}:`, data[0])
              }
              setCachedData(cacheKey, data)
            } else {
              console.log(`[fetchHistoryData] Response status ${response.status} for ${reg}, using fallback...`)
              data = await fetchHistorySnapshots(reg, startTime, now)
            }
            
            // Respect 10 req/min limit: 7 seconds between requests
            await new Promise(resolve => setTimeout(resolve, 7000))
          } catch (error) {
            console.error(`[fetchHistoryData] Error fetching comprehensive history for ${reg}:`, error)
            // Fallback to snapshots
            data = await fetchHistorySnapshots(reg, startTime, now)
          }
        }
        
        if (data && Array.isArray(data) && data.length > 0) {
          console.log(`[fetchHistoryData] Adding ${data.length} positions for ${reg}`)
          positions.push(...data)
        }
      } catch (error) {
        console.error(`[fetchHistoryData] Error processing history for ${reg}:`, error)
      }
      
      console.log(`[fetchHistoryData] Total for ${reg}: ${positions.length} positions`)
      newHistory[reg] = positions
    }
    console.log(`[fetchHistoryData] Complete. History data:`, newHistory)
    setHistoryData(newHistory)
  }

  // Helper function to fetch snapshots at regular intervals (fallback)
  const fetchHistorySnapshots = async (reg: string, startTime: number, endTime: number) => {
    const positions: any[] = []
    const interval = Math.max(7200, (endTime - startTime) / 3) // 3 snapshots (reduced from 6) or 2-hour intervals
    const timestamps: number[] = []
    
    for (let ts = startTime; ts < endTime; ts += interval) {
      timestamps.push(Math.floor(ts))
    }
    timestamps.push(endTime) // Add end time
    
    for (const ts of timestamps) {
      const cacheKey = getCacheKey(reg, ts)
      let data = getCachedData(cacheKey)
      
      if (!data) {
        try {
          const response = await fetch(
            `https://fr24api.flightradar24.com/api/historic/flight-positions/full?registrations=${reg}&timestamp=${ts}`,
            {
              headers: {
                'accept': 'application/json',
                'accept-version': 'v1',
                'authorization': `Bearer ${FR24_API_KEY}`
              }
            }
          )
          
          if (response.status === 429) {
            console.log(`Rate limited, stopping snapshot fetch`)
            break
          } else if (response.ok) {
            const responseData = await response.json()
            data = responseData.data || []
            setCachedData(cacheKey, data)
          }
          
          await new Promise(resolve => setTimeout(resolve, 7000)) // 7 seconds between requests (10 req/min limit)
        } catch (error) {
          console.error(`Error fetching snapshot for ${reg} at ${ts}:`, error)
        }
      }
      
      if (data && Array.isArray(data) && data.length > 0) {
        positions.push(...data)
      }
    }
    
    return positions
  }

  const closestPlane = planes.reduce((closest, plane) => {
    const dist = haversineDistance((plane as Plane).lat, (plane as Plane).lon, EGNR_LAT, EGNR_LON)
    return !closest || dist < (closest as Plane & { dist?: number })?.dist! ? { ...(plane as Plane), dist } : closest
  }, null as Plane | null)

  const flyingToEGNR: Plane | null = planes.find((plane: Plane) => plane.dest_icao === 'EGNR') || null

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} theme={theme} />
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <div className="app">
        {/* API Settings Modal */}
        {showApiSettings && (
          <div className="modal-overlay" onClick={() => setShowApiSettings(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>API Settings</h2>
                <button className="modal-close" onClick={() => setShowApiSettings(false)}>✕</button>
              </div>
              <div className="modal-body">
                <div className="settings-section">
                  <h3>Frontend API Source</h3>
                  <p className="settings-description">Controls which API the frontend uses for live tracking</p>
                  <div className="api-selector" style={{ marginTop: '0.5rem' }}>
                    <label className="api-label">
                      <input
                        type="radio"
                        name="apiSource"
                        value="opensky"
                        checked={apiSource === 'opensky'}
                        onChange={(e) => setApiSource(e.target.value as ApiSource)}
                      />
                      OpenSky
                    </label>
                    <label className="api-label">
                      <span className={`api-status ${apiStatus.fr24 === true ? 'online' : apiStatus.fr24 === false ? 'offline' : 'unknown'}`}>●</span>
                      <input
                        type="radio"
                        name="apiSource"
                        value="flightradar24"
                        checked={apiSource === 'flightradar24'}
                        onChange={(e) => setApiSource(e.target.value as ApiSource)}
                      />
                      FR24
                    </label>
                    <label className="api-label">
                      <input
                        type="radio"
                        name="apiSource"
                        value="none"
                        checked={apiSource === 'none'}
                        onChange={(e) => setApiSource(e.target.value as ApiSource)}
                      />
                      Off
                    </label>
                  </div>
                </div>
                <div className="settings-section">
                  <h3>Backend API Source</h3>
                  <p className="settings-description">Controls which API the backend uses for push notifications</p>
                  <div className="api-selector" style={{ marginTop: '0.5rem' }}>
                    <label className="api-label">
                      <input
                        type="radio"
                        name="backendApiSource"
                        value="opensky"
                        checked={backendApiSource === 'opensky'}
                        onChange={(e) => changeBackendApiSource(e.target.value as 'opensky' | 'fr24')}
                      />
                      OpenSky
                    </label>
                    <label className="api-label">
                      <input
                        type="radio"
                        name="backendApiSource"
                        value="fr24"
                        checked={backendApiSource === 'fr24'}
                        onChange={(e) => changeBackendApiSource(e.target.value as 'opensky' | 'fr24')}
                      />
                      FR24
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="header">
          <h1>Airbus Beluga XL Fleet Tracker</h1>
          <div className="header-buttons">
            <ThemeToggle />
            <button onClick={() => setShowApiSettings(true)} className="theme-toggle" title="Configure API settings">⚙️ API Settings</button>
            <button onClick={handleScrapeNow} className="theme-toggle" title="Scrape schedule & locations now">🔄 Scrape Now</button>
            <button onClick={handleBuildOpenSkySchedule} className="theme-toggle" title="Build OpenSky schedule from all Airbus airports">📡 Build OpenSky</button>
            <button onClick={testNotification} className="theme-toggle" title="Send test push notification">🔔 Test Push</button>
            <button onClick={handleLogout} className="theme-toggle" title="Logout">🚪 Logout</button>
          </div>
        </div>
        <div className="controls">
          <HistorySelector hours={historyHours} onChange={setHistoryHours} />
          <ProximityDisplay closest={closestPlane} flyingTo={flyingToEGNR} />
          <div className="schedule-source-selector" style={{ marginLeft: 'auto' }}>
            <label style={{ marginRight: '0.5rem', fontWeight: 'bold' }}>Schedule Source:</label>
            <select 
              value={scheduleSource} 
              onChange={(e) => setScheduleSource(e.target.value as 'scraper' | 'opensky')}
              style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
            >
              <option value="scraper">Website Scraper</option>
              <option value="opensky">OpenSky Network</option>
            </select>
          </div>
        </div>
        <div className="main">
          <Map planes={planes} historyData={historyData} scrapedData={scrapedData} schedules={scheduleSource === 'opensky' ? openskySchedule : scrapedData.schedules || []} />
          <PlaneList planes={planes} schedules={scheduleSource === 'opensky' ? openskySchedule : scrapedData.schedules || []} />
        </div>
        <FleetStatus allRegistrations={BELUGA_REGISTRATIONS} activePlanes={planes} scrapedData={scrapedData} historyData={historyData} schedules={scheduleSource === 'opensky' ? openskySchedule : scrapedData.schedules || []} />
        <ScheduledFlights schedules={scheduleSource === 'opensky' ? openskySchedule : scrapedData.schedules || []} />
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
