import { useState, useMemo } from 'react'

// Normalize airport names to handle variations like "Hawarden" vs "Hawarden (EGNR)"
const normalizeAirport = (airport: string) => {
  if (!airport) return '-'
  
  // Extract airport name and code
  const match = String(airport).match(/^(.+?)\s*(?:\(([A-Z]{4})\))?$/)
  if (!match) return airport
  
  const name = match[1].trim()
  const code = match[2]
  
  // Return standardized format: "Name (CODE)"
  return code ? `${name} (${code})` : name
}

interface ScheduledFlightsProps {
  schedules: any[]
}

const ScheduledFlights = ({ schedules = [] }: ScheduledFlightsProps) => {
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20

  const sortedFlights = useMemo(() => {
    const now = new Date()
    // Only filter out past flights, show all future flights (no 2-day limit)
    
    return schedules
      .slice()
      .filter((flight: any) => {
        let flightDate
        if (flight.departureTime) {
          flightDate = new Date(flight.departureTime)
        } else if (flight.datetime) {
          flightDate = new Date(flight.datetime)
        } else if (flight.date) {
          flightDate = new Date(flight.date)
        } else {
          return false
        }
        
        // Only show flights that are in the future
        return flightDate >= now
      })
      .sort((a: any, b: any) => {
        const ad = a?.datetime || a?.scrapedAt || ''
        const bd = b?.datetime || b?.scrapedAt || ''
        return (bd as string).localeCompare(ad as string)
      })
  }, [schedules])

  const totalPages = Math.ceil(sortedFlights.length / itemsPerPage)
  const paginatedFlights = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return sortedFlights.slice(startIndex, startIndex + itemsPerPage)
  }, [sortedFlights, currentPage])

  return (
    <div className="scheduled-flights">
      <h2>Scheduled Flights</h2>
      <div className="flights-table-container">
        <table className="flights-table">
          <thead>
            <tr>
              <th>Flight</th>
              <th>Aircraft</th>
              <th>Time</th>
              <th>Departure</th>
              <th>Arrival</th>
            </tr>
          </thead>
          <tbody>
            {paginatedFlights.map((flight, index) => {
              const isHawarden = flight.route?.includes('Hawarden (EGNR)') || flight.airport?.includes('Hawarden') || flight.departure === 'EGNR' || flight.arrival === 'EGNR'
              
              // Handle OpenSky format
              if (flight.departureTime && flight.arrivalTime) {
                const depTime = new Date(flight.departureTime).toLocaleString()
                const arrTime = new Date(flight.arrivalTime).toLocaleString()
                return (
                  <tr key={index} className={isHawarden ? 'hawarden-flight' : ''}>
                    <td className="flight-number">{flight.callsign || flight.flight || '-'}</td>
                    <td className="aircraft">{flight.registration || flight.aircraft || '-'}</td>
                    <td>{depTime} - {arrTime} ({flight.duration}m)</td>
                    <td className="departure">{normalizeAirport(flight.departure || '-')}</td>
                    <td className="arrival">{normalizeAirport(flight.arrival || '-')}</td>
                  </tr>
                )
              }
              
              // Handle scraper format
              return (
                <tr key={index} className={isHawarden ? 'hawarden-flight' : ''}>
                  <td className="flight-number">{flight.flight}</td>
                  <td className="aircraft">{flight.aircraft}</td>
                  <td>{[flight.date, flight.time].filter(Boolean).join(' ')}</td>
                  <td className="departure">{normalizeAirport(flight.departure || flight.airport)}</td>
                  <td className="arrival">{normalizeAirport(flight.arrival || flight.route)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        
        {totalPages > 1 && (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            gap: '0.5rem', 
            marginTop: '1rem',
            flexWrap: 'wrap'
          }}>
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              style={{ padding: '0.5rem 0.75rem', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
            >
              First
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              style={{ padding: '0.5rem 0.75rem', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
            >
              Previous
            </button>
            <span style={{ padding: '0.5rem 1rem' }}>
              Page {currentPage} of {totalPages} ({sortedFlights.length} flights)
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              style={{ padding: '0.5rem 0.75rem', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
            >
              Next
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              style={{ padding: '0.5rem 0.75rem', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
            >
              Last
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default ScheduledFlights
