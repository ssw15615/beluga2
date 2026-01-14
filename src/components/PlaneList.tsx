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
}

interface PlaneListProps {
  planes: Plane[]
  schedules?: any[]
}

const PlaneList = ({ planes, schedules = [] }: PlaneListProps) => {
  // Create a simple colored rectangle as a data URL
  const createPlaneImage = (reg: string, color: string = '#0066cc') => {
    return `data:image/svg+xml;base64,${btoa(`
      <svg width="100" height="60" xmlns="http://www.w3.org/2000/svg">
        <rect width="100" height="60" fill="${color}" stroke="#fff" stroke-width="2"/>
        <text x="50" y="35" text-anchor="middle" fill="white" font-family="Arial" font-size="12" font-weight="bold">${reg}</text>
      </svg>
    `)}`
  }

  return (
    <div className="plane-list">
      <h2>Beluga XL Fleet</h2>
      {planes.map(plane => (
        <div key={plane.fr24_id} className="plane-card">
          <div className="plane-card-header">
            <img src={createPlaneImage(plane.reg)} alt={plane.reg} />
            <div className="plane-basic-info">
              <h3>{plane.reg}</h3>
              <span className="plane-type">✈️ {plane.type}{(() => {
                const xlRegs = ['F-GXLG', 'F-GXLH', 'F-GXLI', 'F-GXLJ', 'F-GXLN', 'F-GXLO']
                const xlIndex = xlRegs.indexOf(plane.reg)
                return xlIndex >= 0 ? (xlIndex + 1) : ''
              })()}</span>
            </div>
          </div>
          <div className="plane-card-details">
            <div className="detail-row">
              <span className="label">Flight:</span>
              <span className="value">{plane.flight}</span>
            </div>
            <div className="detail-row">
              <span className="label">Callsign:</span>
              <span className="value">{plane.callsign}</span>
            </div>
            <div className="detail-row">
              <span className="label">Position:</span>
              <span className="value">{plane.lat.toFixed(2)}°, {plane.lon.toFixed(2)}°</span>
            </div>
            <div className="detail-row">
              <span className="label">Altitude:</span>
              <span className="value">{plane.alt} ft</span>
            </div>
            <div className="detail-row">
              <span className="label">Speed:</span>
              <span className="value">{plane.gspeed} knots</span>
            </div>
            <div className="detail-row">
              <span className="label">Route:</span>
              <span className="value">{(() => {
                let from = plane.orig_iata
                let to = plane.dest_iata
                if ((!from || !to) && plane.callsign && schedules) {
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
                    from = from || relevantFlight.departure || relevantFlight.from
                    to = to || relevantFlight.arrival || relevantFlight.to
                  }
                }
                return `${from || 'N/A'} → ${to || 'N/A'}`
              })()}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default PlaneList