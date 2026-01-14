import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useState, useEffect } from 'react'

// Fix for default markers
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

const airbusAirports = [
  { code: 'LFBO', name: 'Toulouse Blagnac', lat: 43.6291, lon: 1.3638, type: 'Manufacturing' },
  { code: 'EDHI', name: 'Hamburg Finkenwerder', lat: 53.5353, lon: 9.8353, type: 'Manufacturing' },
  { code: 'LFRS', name: 'Nantes Atlantique', lat: 47.1532, lon: -1.6107, type: 'Manufacturing' },
  { code: 'EGNR', name: 'Hawarden', lat: 53.1744, lon: -2.9779, type: 'Wing Assembly' },
  { code: 'LEZL', name: 'Seville', lat: 37.4180, lon: -5.8931, type: 'Manufacturing' },
  { code: 'LEMD', name: 'Madrid Barajas', lat: 40.4936, lon: -3.5668, type: 'Delivery Center' },
  { code: 'LEBL', name: 'Barcelona', lat: 41.2974, lon: 2.0785, type: 'Manufacturing' },
]

const airportIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#e74c3c"/>
      <circle cx="12" cy="9" r="3" fill="#e74c3c"/>
    </svg>
  `),
  iconSize: [24, 24],
  iconAnchor: [12, 24],
  popupAnchor: [0, -24],
})

// Function to create rotated plane icon using plane-logo.png
const createRotatedIcon = (heading: number | undefined) => {
  const rotation = heading || 0
  // Use inline style for smooth rotation
  return new L.DivIcon({
    html: `<img src='/plane-logo.png' style='width:40px;height:40px;transform:rotate(${rotation}deg);transition:transform 0.2s linear;' />`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
    className: 'plane-icon'
  })
}

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
  heading?: number // Direction of travel in degrees
}

interface MapProps {
  planes: Plane[]
  historyData: { [reg: string]: any[] }
  scrapedData: { locations: { [key: string]: string } }
  schedules: any[]
}

interface WeatherData {
  temp: number
  feels_like: number
  humidity: number
  pressure: number
  wind_speed: number
  wind_deg: number
  description: string
  icon: string
  visibility: number
  clouds: number
}

const WeatherDisplay = ({ lat, lon }: { lat: number, lon: number }) => {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Using Open-Meteo (free, no API key needed)
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m&timezone=auto`)
      .then(res => res.json())
      .then(data => {
        const current = data.current
        const weatherCode = current.weather_code
        
        // WMO Weather interpretation codes
        const getWeatherDescription = (code: number) => {
          if (code === 0) return { desc: 'Clear sky', icon: '☀️' }
          if (code <= 3) return { desc: 'Partly cloudy', icon: '⛅' }
          if (code <= 48) return { desc: 'Foggy', icon: '🌫️' }
          if (code <= 67) return { desc: 'Rainy', icon: '🌧️' }
          if (code <= 77) return { desc: 'Snowy', icon: '❄️' }
          if (code <= 82) return { desc: 'Rain showers', icon: '🌦️' }
          if (code <= 86) return { desc: 'Snow showers', icon: '🌨️' }
          return { desc: 'Thunderstorm', icon: '⛈️' }
        }
        
        const weatherInfo = getWeatherDescription(weatherCode)
        
        setWeather({
          temp: Math.round(current.temperature_2m),
          feels_like: Math.round(current.apparent_temperature),
          humidity: current.relative_humidity_2m,
          pressure: Math.round(current.pressure_msl),
          wind_speed: Math.round(current.wind_speed_10m * 0.539957), // Convert to knots
          wind_deg: current.wind_direction_10m,
          description: weatherInfo.desc,
          icon: weatherInfo.icon,
          visibility: 10, // Open-Meteo doesn't provide visibility
          clouds: current.cloud_cover
        })
        setLoading(false)
      })
      .catch(err => {
        console.error('Weather fetch error:', err)
        setLoading(false)
      })
  }, [lat, lon])

  if (loading) return <div className="weather-loading">⏳ Loading weather...</div>
  if (!weather) return <div className="weather-error">❌ Weather unavailable</div>

  const getWindDirection = (deg: number) => {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
    return directions[Math.round(deg / 22.5) % 16]
  }

  return (
    <div className="weather-box">
      <div className="weather-header">
        <span className="weather-icon">{weather.icon}</span>
        <span className="weather-temp">{weather.temp}°C</span>
      </div>
      <div className="weather-description">{weather.description}</div>
      <div className="weather-details">
        <div className="weather-row">
          <span className="weather-label">🌡️ Feels like:</span>
          <span className="weather-value">{weather.feels_like}°C</span>
        </div>
        <div className="weather-row">
          <span className="weather-label">💧 Humidity:</span>
          <span className="weather-value">{weather.humidity}%</span>
        </div>
        <div className="weather-row">
          <span className="weather-label">🌬️ Wind:</span>
          <span className="weather-value">{weather.wind_speed} kt {getWindDirection(weather.wind_deg)}</span>
        </div>
        <div className="weather-row">
          <span className="weather-label">🔽 Pressure:</span>
          <span className="weather-value">{weather.pressure} hPa</span>
        </div>
        <div className="weather-row">
          <span className="weather-label">☁️ Cloud cover:</span>
          <span className="weather-value">{weather.clouds}%</span>
        </div>
      </div>
    </div>
  )
}

// Component to track zoom level and update CSS variable
const ZoomHandler = () => {
  const map = useMapEvents({
    zoomend: () => {
      const currentZoom = map.getZoom()
      // Calculate scale factor: zoom 4 = 1.0, each zoom level adjusts by ~35%
      const baseZoom = 4
      const scaleFactor = Math.pow(1.35, currentZoom - baseZoom)
      const clampedScale = Math.max(0.3, Math.min(2.0, scaleFactor)) // Clamp between 30% and 200%
      
      // Update CSS variable for popup scaling
      document.documentElement.style.setProperty('--popup-scale', clampedScale.toString())
    }
  })
  
  useEffect(() => {
    // Set initial scale
    document.documentElement.style.setProperty('--popup-scale', '1')
  }, [])
  
  return null
}

const Map = ({ planes, historyData, scrapedData, schedules }: MapProps) => {
  // Calculate midnight (local) 48 hours ago
  const now = new Date()
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startTime = midnight.getTime() - 48 * 60 * 60 * 1000 // 48 hours ago at midnight

  // Only show trails for active planes
  const activeRegs = planes.map(p => p.reg)
  const historyLines = Object.entries(historyData)
    .filter(([reg]) => activeRegs.includes(reg))
    .map(([reg, positions]) => {
      // Filter positions to last 48h from midnight
      const filtered = positions
        .filter((p: any) => new Date(p.timestamp * 1000).getTime() >= startTime)
        .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      return {
        reg,
        positions: filtered.map((p: any) => [p.lat, p.lon]),
        color: 'blue'
      }
    })

  // Map scraped location data to planes at airports
  const getPlanesAtAirportFromScraped = (airportCode: string) => {
    const planesAtAirport: { reg: string, xl: string, location: string }[] = []
    
    // Map XL numbers to registrations (approximate mapping based on pattern)
    const xlToReg: { [key: string]: string } = {
      '1': 'F-GXLG', // XL-G
      '2': 'F-GXLH', // XL-H  
      '3': 'F-GXLI', // XL-I
      '4': 'F-GXLJ', // XL-J
      '5': 'F-GXLN', // XL-N
      '6': 'F-GXLO', // XL-O
    }

    // Keyword matching for airport names (scraped text does not include ICAO codes)
    const airportKeywords: Record<string, string[]> = {
      'LFBO': ['toulouse', 'blagnac'],
      'LFRS': ['nantes'],
      'EGNR': ['hawarden', 'broughton'],
      'LEZL': ['seville', 'sevilla'],
      'LEMD': ['madrid'],
      'LEBL': ['barcelona']
    }
    const keywords = (airportKeywords[airportCode] || []).map(k => k.toLowerCase())
    
    // Check if scrapedData exists and has locations before processing
    const locations = scrapedData?.locations || {}
    if (locations && typeof locations === 'object') {
      Object.entries(locations).forEach(([xlNum, location]: [string, any]) => {
        const reg = xlToReg[xlNum]
        if (!reg || typeof location !== 'string') return
        const loc = location.toLowerCase()
        const matchesCode = loc.includes(airportCode.toLowerCase())
        const matchesKeyword = keywords.some(k => loc.includes(k))
        if (matchesCode || matchesKeyword) {
          planesAtAirport.push({ reg, xl: xlNum, location })
        }
      })
    }
    
    return planesAtAirport
  }

  return (
    <MapContainer center={[50, 0]} zoom={4} className="map-container">
      <ZoomHandler />
      {/* Satellite imagery */}
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
        maxZoom={19}
      />
      {/* Labels overlay */}
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        maxZoom={19}
      />
      {planes.map(plane => {
        // Look up flight info from schedules if not available from live data
        let fromLocation = plane.orig_iata
        let toLocation = plane.dest_iata
        
        if ((!fromLocation || !toLocation) && plane.callsign && schedules) {
          // Find all matching flights by callsign
          const matchingFlights = schedules.filter((s: any) => s.flight === plane.callsign)
          if (matchingFlights.length > 0) {
            // Parse timestamps and find the most recent flight that's in the past or present
            const now = Date.now() / 1000
            const sortedFlights = matchingFlights
              .map((f: any) => ({ ...f, timestamp: f.timestamp || 0 }))
              .filter((f: any) => f.timestamp <= now) // Only past/current flights
              .sort((a: any, b: any) => b.timestamp - a.timestamp) // Most recent first
            const relevantFlight = sortedFlights[0] || matchingFlights[0]
            fromLocation = fromLocation || relevantFlight.departure || relevantFlight.from
            toLocation = toLocation || relevantFlight.arrival || relevantFlight.to
          }
        }
        
        // XL number logic (same as FleetStatus)
        const xlRegs = ['F-GXLG', 'F-GXLH', 'F-GXLI', 'F-GXLJ', 'F-GXLN', 'F-GXLO']
        const xlIndex = xlRegs.indexOf(plane.reg)
        const xlNum = xlIndex >= 0 ? (xlIndex + 1).toString() : null
        return (
          <Marker key={plane.fr24_id} position={[plane.lat, plane.lon]} icon={createRotatedIcon(plane.heading)}>
            <Popup 
              maxWidth={224} 
              className="airport-popup-container"
              autoPan={true}
              autoPanPadding={[100, 100]}
            >
              <div className="airport-popup">
                <div className="airport-header">
                  <h3>✈️ {plane.reg}</h3>
                  <div className="airport-badge">{plane.type}{xlNum ? ` XL${xlNum}` : ''}</div>
                </div>
                <div className="airport-info">
                  <div className="info-pill">
                    <span className="info-label">Flight:</span>
                    <span className="info-value">{plane.flight}</span>
                  </div>
                  <div className="info-pill">
                    <span className="info-label">Callsign:</span>
                    <span className="info-value">{plane.callsign}</span>
                  </div>
                  <div className="info-pill">
                    <span className="info-label">📍</span>
                    <span className="info-value">{plane.lat.toFixed(2)}°, {plane.lon.toFixed(2)}°</span>
                  </div>
                  <div className="info-pill">
                    <span className="info-label">Altitude:</span>
                    <span className="info-value">{plane.alt} ft</span>
                  </div>
                  <div className="info-pill">
                    <span className="info-label">Speed:</span>
                    <span className="info-value">{plane.gspeed} knots</span>
                  </div>
                  {plane.heading && (
                    <div className="info-pill">
                      <span className="info-label">Heading:</span>
                      <span className="info-value">{plane.heading}°</span>
                    </div>
                  )}
                  <div className="info-pill">
                    <span className="info-label">Route:</span>
                    <span className="info-value">{fromLocation || 'N/A'} → {toLocation || 'N/A'}</span>
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        )
      })}
      {airbusAirports.map(airport => {
        const planesAtAirport = getPlanesAtAirportFromScraped(airport.code)
        return (
          <Marker key={airport.code} position={[airport.lat, airport.lon]} icon={airportIcon}>
            <Popup 
              maxWidth={224} 
              className="airport-popup-container"
              autoPan={true}
              autoPanPadding={[100, 100]}
            >
              <div className="airport-popup">
                <div className="airport-header">
                  <h3>🏭 {airport.name}</h3>
                  <div className="airport-badge">{airport.type}</div>
                </div>
                <div className="airport-info">
                  <div className="info-pill">
                    <span className="info-label">ICAO:</span>
                    <span className="info-value">{airport.code}</span>
                  </div>
                  <div className="info-pill">
                    <span className="info-label">📍</span>
                    <span className="info-value">{airport.lat.toFixed(4)}°, {airport.lon.toFixed(4)}°</span>
                  </div>
                </div>
                
                <WeatherDisplay lat={airport.lat} lon={airport.lon} />
                
                <div className="airport-planes">
                  <h4>✈️ Beluga XL Planes Present:</h4>
                  {planesAtAirport.length > 0 ? (
                    <ul className="planes-at-airport">
                      {planesAtAirport.map(plane => (
                        <li key={plane.reg}>
                          <strong>{plane.reg}</strong> (XL{plane.xl}) - {plane.location}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="no-planes">No Beluga XL planes currently at this airport</p>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        )
      })}
      {historyLines.map(line => (
        <Polyline key={line.reg} positions={line.positions} color={line.color} />
      ))}
    </MapContainer>
  )
}

export default Map
