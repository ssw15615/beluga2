import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

// Fix for default markers
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

const airbusAirports = [
  { code: 'LFBO', name: 'Toulouse Blagnac', lat: 43.6291, lon: 1.3638, type: 'Manufacturing' },
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
  return new L.Icon({
    iconUrl: '/plane-logo.png',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
    className: `plane-icon rotate-${Math.round(rotation / 10) * 10}`
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
}

const Map = ({ planes, historyData, scrapedData }: MapProps) => {
  const historyLines = Object.entries(historyData).map(([reg, positions]) => ({
    reg,
    positions: positions
      .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map((p: any) => [p.lat, p.lon]),
    color: 'blue' // Different colors for each
  }))

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
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {planes.map(plane => (
        <Marker key={plane.fr24_id} position={[plane.lat, plane.lon]} icon={createRotatedIcon(plane.heading)}>
          <Popup>
            <div className="plane-popup">
              <div className="plane-popup-header">
                <h3>{plane.reg}</h3>
                <span className="plane-type">{plane.type}</span>
              </div>
              <div className="plane-popup-flight">
                <div className="flight-number">✈️ {plane.flight}</div>
                <div className="callsign">📡 {plane.callsign}</div>
              </div>
              <div className="plane-popup-position">
                <div className="position">📍 {plane.lat.toFixed(2)}°, {plane.lon.toFixed(2)}°</div>
                <div className="altitude">⏫ {plane.alt} ft</div>
                <div className="speed">💨 {plane.gspeed} knots</div>
              </div>
              <div className="plane-popup-route">
                <div className="route">🛫 {plane.orig_iata} → 🛬 {plane.dest_iata}</div>
                {plane.heading && <div className="heading">🧭 {plane.heading}°</div>}
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
      {airbusAirports.map(airport => {
        const planesAtAirport = getPlanesAtAirportFromScraped(airport.code)
        return (
          <Marker key={airport.code} position={[airport.lat, airport.lon]} icon={airportIcon}>
            <Popup>
              <div className="airport-popup">
                <h3>🏭 Airbus {airport.name}</h3>
                <p><strong>ICAO:</strong> {airport.code}</p>
                <p><strong>Type:</strong> {airport.type}</p>
                <p><strong>Coordinates:</strong> {airport.lat.toFixed(4)}°, {airport.lon.toFixed(4)}°</p>
                
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
