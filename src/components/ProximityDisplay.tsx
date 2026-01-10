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

interface ProximityDisplayProps {
  closest: Plane | null
  flyingTo: Plane | null
}

const ProximityDisplay = ({ closest, flyingTo }: ProximityDisplayProps) => {
  return (
    <div className="proximity-display">
      <div>
        <h3>Closest to Hawarden (EGNR)</h3>
        {closest ? (
          <p>
            <strong>{closest.reg}</strong> - {closest.dist?.toFixed(2)} miles away
            <span className="distance-indicator">📍</span>
          </p>
        ) : (
          <p className="no-data">No proximity data available</p>
        )}
      </div>
      <div>
        <h3>Flying to Hawarden</h3>
        {flyingTo ? (
          <p>
            <strong>{flyingTo.reg}</strong> - Flight {flyingTo.flight}
            <span className="flight-indicator">🛩️</span>
          </p>
        ) : (
          <p className="no-flights">None</p>
        )}
      </div>
    </div>
  )
}

export default ProximityDisplay