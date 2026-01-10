import { useState } from 'react'

interface FleetStatusProps {
  allRegistrations: string[]
  activePlanes: any[]
  scrapedData: { [key: string]: any }
  historyData: { [reg: string]: any[] }
  schedules?: any[]
}

const FleetStatus = ({ allRegistrations, activePlanes, scrapedData = {}, historyData, schedules = [] }: FleetStatusProps) => {
  const [selectedPlane, setSelectedPlane] = useState<any>(null)
  const [showModal, setShowModal] = useState(false)

  const getXlNum = (reg: string) => {
    const index = allRegistrations.indexOf(reg)
    return index >= 0 ? (index + 1).toString() : null
  }

  const handlePlaneClick = (reg: string) => {
    const plane = activePlanes.find(p => p.reg === reg)
    const xlNum = getXlNum(reg)
    const scrapedLocation = xlNum ? scrapedData?.locations?.[xlNum] : null

    const planeData = plane ? {
      ...plane,
      xlNum,
      scrapedLocation,
      status: 'active'
    } : {
      reg,
      xlNum,
      scrapedLocation,
      status: 'inactive',
      type: 'Airbus Beluga XL',
      lastAirport: scrapedLocation || 'Unknown'
    }

    setSelectedPlane(planeData)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setSelectedPlane(null)
  }

  // Create plane image based on registration
  const createPlaneImage = (reg: string) => {
    return `data:image/svg+xml;base64,${btoa(`
      <svg width="120" height="80" xmlns="http://www.w3.org/2000/svg">
        <rect width="120" height="80" fill="#0066cc" stroke="#fff" stroke-width="3" rx="8"/>
        <text x="60" y="45" text-anchor="middle" fill="white" font-family="Arial" font-size="16" font-weight="bold">${reg}</text>
        <text x="60" y="65" text-anchor="middle" fill="white" font-family="Arial" font-size="12">XL${getXlNum(reg) || '?'}</text>
      </svg>
    `)}`
  }

  // Get scheduled flights for the selected aircraft
  const getScheduledFlights = (xlNum: string) => {
    if (!schedules || schedules.length === 0) return []
    return schedules.filter(flight => {
      const aircraftMatch = flight.aircraft?.includes(`XL${xlNum}`) || flight.aircraft?.includes(`Beluga XL${xlNum}`)
      return aircraftMatch
    })
  }

  // Extract airport-to-airport flights from historic data
  const getAirportToAirportFlights = (reg: string) => {
    const positions = historyData[reg] || []
    if (positions.length === 0) return []

    // Sort positions by timestamp
    const sortedPositions = positions.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    // If we have very few positions, show basic activity
    if (positions.length < 5) {
      return [{
        flight: 'Recent Activity',
        departure: 'Tracked',
        arrival: 'Active',
        startTime: sortedPositions[0]?.timestamp || Date.now() / 1000,
        endTime: sortedPositions[sortedPositions.length - 1]?.timestamp || Date.now() / 1000,
        date: new Date(sortedPositions[0]?.timestamp * 1000).toLocaleDateString()
      }]
    }

    // Group positions by day and show recent activity
    const flightsByDay = new Map()

    for (const pos of sortedPositions) {
      const date = new Date(pos.timestamp * 1000).toLocaleDateString()
      const flightId = pos.flight || pos.callsign || pos.icao || `Activity-${date}`

      if (!flightsByDay.has(date)) {
        flightsByDay.set(date, new Set())
      }
      flightsByDay.get(date).add(flightId)
    }

    // Create a simple list of recent flight activity
    const recentFlights = []
    const sortedDays = Array.from(flightsByDay.keys()).sort().reverse()

    for (const date of sortedDays.slice(0, 5)) { // Last 5 days
      const flights = Array.from(flightsByDay.get(date))
      for (const flight of flights.slice(0, 2)) { // Max 2 flights per day
        // Try to extract any available airport info
        const dayPositions = sortedPositions.filter(pos => {
          const posDate = new Date(pos.timestamp * 1000).toLocaleDateString()
          return posDate === date
        })

        const firstPos = dayPositions[0]
        const lastPos = dayPositions[dayPositions.length - 1]

        recentFlights.push({
          flight: flight,
          departure: firstPos?.orig || firstPos?.orig_iata || firstPos?.origin || 'Tracked',
          arrival: lastPos?.dest || lastPos?.dest_iata || lastPos?.destination || 'Active',
          startTime: firstPos?.timestamp || Date.now() / 1000,
          endTime: lastPos?.timestamp || Date.now() / 1000,
          date: date
        })
      }
    }

    return recentFlights.length > 0 ? recentFlights.slice(0, 8) : [{
      flight: 'Historic Data Available',
      departure: 'System',
      arrival: 'Active',
      startTime: Date.now() / 1000,
      endTime: Date.now() / 1000,
      date: new Date().toLocaleDateString()
    }]
  }

  // Photo filename resolution helpers
  const getPhotoCandidates = (reg: string, xlNum?: string | null) => {
    const xl = xlNum ? String(xlNum) : ''
    const regRaw = reg || ''
    const regNoDash = regRaw.replace(/-/g, '')
    const regLower = regRaw.toLowerCase()
    const regNoDashLower = regNoDash.toLowerCase()

    const candidates: string[] = []

    // XL-number based filenames
    if (xl) {
      candidates.push(
        `/aircraft-photos/xl${xl}.jpg`,
        `/aircraft-photos/xl${xl}.JPG`,
        `/aircraft-photos/xl${xl}.png`,
        `/aircraft-photos/xl${xl}.PNG`,
        `/aircraft-photos/xl${xl}.jpeg`,
        `/aircraft-photos/xl${xl}.JPEG`,
        // Support user-named pattern xl1{N} (xl11..xl16)
        `/aircraft-photos/xl1${xl}.jpg`,
        `/aircraft-photos/xl1${xl}.JPG`,
        `/aircraft-photos/xl1${xl}.png`,
        `/aircraft-photos/xl1${xl}.PNG`,
        `/aircraft-photos/xl1${xl}.jpeg`,
        `/aircraft-photos/xl1${xl}.JPEG`
      )
    }

    // Registration-based filenames
    candidates.push(
      `/aircraft-photos/${regRaw}.jpg`,
      `/aircraft-photos/${regRaw}.JPG`,
      `/aircraft-photos/${regRaw}.png`,
      `/aircraft-photos/${regRaw}.PNG`,
      `/aircraft-photos/${regRaw}.jpeg`,
      `/aircraft-photos/${regRaw}.JPEG`,
      `/aircraft-photos/${regNoDash}.jpg`,
      `/aircraft-photos/${regNoDash}.JPG`,
      `/aircraft-photos/${regNoDash}.png`,
      `/aircraft-photos/${regNoDash}.PNG`,
      `/aircraft-photos/${regNoDash}.jpeg`,
      `/aircraft-photos/${regNoDash}.JPEG`,
      `/aircraft-photos/${regLower}.jpg`,
      `/aircraft-photos/${regLower}.png`,
      `/aircraft-photos/${regNoDashLower}.jpg`,
      `/aircraft-photos/${regNoDashLower}.png`
    )

    return candidates
  }

  const getInitialPhotoSrc = (reg: string, xlNum?: string | null) => {
    const list = getPhotoCandidates(reg, xlNum)
    return list[0]
  }

  return (
    <>
      <div className="fleet-status">
        <h2>Fleet Status</h2>
        <div className="status-list">
          {allRegistrations.map(reg => {
            const plane = activePlanes.find(p => p.reg === reg)
            const isActive = !!plane
            const xlNum = getXlNum(reg)
            
            // Get last airport: from FR24 if active, from scraped locations if inactive
            let lastAirport = 'Unknown'
            if (plane && (plane.dest_iata || plane.orig_iata)) {
              // Prefer destination if flying, else origin from FlightRadar24
              lastAirport = plane.dest_iata || plane.orig_iata
            } else if (xlNum && scrapedData?.locations?.[xlNum]) {
              // Use scraped location for inactive planes
              lastAirport = scrapedData.locations[xlNum]
            }
            
            return (
              <div
                key={reg}
                className={`status-item ${isActive ? 'active' : 'inactive'} clickable`}
                onClick={() => handlePlaneClick(reg)}
                title="Click for detailed information"
              >
                <div className="status-item-content">
                  <span className="reg">{reg} <span className="xl-number">(XL{xlNum})</span></span>
                  <span className="status">{isActive ? 'Active' : 'Inactive'}</span>
                  <span className="airport">Last Airport: {lastAirport}</span>
                </div>
                <div className="status-item-photo">
                  <img
                    src={`/aircraft-photos/xl${xlNum}.jpg`}
                    alt={`Beluga XL${xlNum}`}
                    className="status-photo"
                    data-attempt="0"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement
                      const xl = String(xlNum || '')
                      const candidates = [
                        `/aircraft-photos/xl${xl}.jpg`,
                        `/aircraft-photos/xl${xl}.JPG`,
                        `/aircraft-photos/xl${xl}.png`,
                        `/aircraft-photos/xl${xl}.PNG`,
                        `/aircraft-photos/xl${xl}.jpeg`,
                        `/aircraft-photos/xl${xl}.JPEG`,
                        // Support user-named pattern xl1{N}
                        `/aircraft-photos/xl1${xl}.jpg`,
                        `/aircraft-photos/xl1${xl}.JPG`,
                        `/aircraft-photos/xl1${xl}.png`,
                        `/aircraft-photos/xl1${xl}.PNG`,
                        `/aircraft-photos/xl1${xl}.jpeg`,
                        `/aircraft-photos/xl1${xl}.JPEG`
                      ]
                      const idx = parseInt(img.getAttribute('data-attempt') || '0', 10)
                      if (idx < candidates.length - 1) {
                        img.setAttribute('data-attempt', String(idx + 1))
                        img.src = candidates[idx + 1]
                      } else {
                        img.style.display = 'none'
                      }
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {showModal && selectedPlane && (
        <div className="plane-modal-overlay" onClick={closeModal}>
          <div className="plane-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedPlane.reg} - Beluga XL{selectedPlane.xlNum}</h2>
              <button className="close-button" onClick={closeModal}>×</button>
            </div>

            <div className="modal-content">
              <div className="plane-image-section">
                <img
                  src={createPlaneImage(selectedPlane.reg)}
                  alt={`${selectedPlane.reg} aircraft`}
                  className="plane-detail-image"
                />
                <div className="plane-status-badge">
                  <span className={`status ${selectedPlane.status}`}>
                    {selectedPlane.status === 'active' ? '🟢 ACTIVE' : '🔴 INACTIVE'}
                  </span>
                </div>
              </div>

              <div className="plane-photo-box">
                <img
                  src={getInitialPhotoSrc(selectedPlane.reg, selectedPlane.xlNum)}
                  alt={`Beluga XL${selectedPlane.xlNum} Photo`}
                  className="aircraft-photo"
                  data-attempt="0"
                  onError={(e) => {
                    const img = e.target as HTMLImageElement
                    const attempts = parseInt(img.getAttribute('data-attempt') || '0', 10)
                    const candidates = getPhotoCandidates(selectedPlane.reg, selectedPlane.xlNum)
                    if (attempts < candidates.length - 1) {
                      img.setAttribute('data-attempt', String(attempts + 1))
                      img.src = candidates[attempts + 1]
                    } else {
                      img.src = 'data:image/svg+xml;base64,' + btoa(`
                        <svg width="200" height="150" xmlns="http://www.w3.org/2000/svg">
                          <rect width="200" height="150" fill="#f0f0f0" stroke="#ccc" stroke-width="2"/>
                          <text x="100" y="75" text-anchor="middle" fill="#999" font-size="14" font-family="Arial">No Photo Available</text>
                        </svg>
                      `)
                    }
                  }}
                />
              </div>

              <div className="plane-details">
                <div className="detail-section">
                  <h3>Aircraft Information</h3>
                  <div className="detail-grid">
                    <div className="detail-item">
                      <span className="label">Registration:</span>
                      <span className="value">{selectedPlane.reg}</span>
                    </div>
                    <div className="detail-item">
                      <span className="label">Type:</span>
                      <span className="value">{selectedPlane.type || 'Airbus Beluga XL'}</span>
                    </div>
                    <div className="detail-item">
                      <span className="label">XL Number:</span>
                      <span className="value">XL{selectedPlane.xlNum}</span>
                    </div>
                    <div className="detail-item">
                      <span className="label">Status:</span>
                      <span className="value">{selectedPlane.status === 'active' ? 'In Flight' : 'On Ground'}</span>
                    </div>
                  </div>
                </div>

                {selectedPlane.status === 'active' && (
                  <>
                    <div className="detail-section">
                      <h3>Flight Information</h3>
                      <div className="detail-grid">
                        <div className="detail-item">
                          <span className="label">Flight:</span>
                          <span className="value">{selectedPlane.flight || 'N/A'}</span>
                        </div>
                        <div className="detail-item">
                          <span className="label">Callsign:</span>
                          <span className="value">{selectedPlane.callsign || 'N/A'}</span>
                        </div>
                        <div className="detail-item">
                          <span className="label">From:</span>
                          <span className="value">{selectedPlane.orig_iata || 'N/A'}</span>
                        </div>
                        <div className="detail-item">
                          <span className="label">To:</span>
                          <span className="value">{selectedPlane.dest_iata || 'N/A'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="detail-section">
                      <h3>Position & Performance</h3>
                      <div className="detail-grid">
                        <div className="detail-item">
                          <span className="label">Position:</span>
                          <span className="value">{selectedPlane.lat?.toFixed(2)}°, {selectedPlane.lon?.toFixed(2)}°</span>
                        </div>
                        <div className="detail-item">
                          <span className="label">Altitude:</span>
                          <span className="value">{selectedPlane.alt} ft</span>
                        </div>
                        <div className="detail-item">
                          <span className="label">Speed:</span>
                          <span className="value">{selectedPlane.gspeed} knots</span>
                        </div>
                        <div className="detail-item">
                          <span className="label">Heading:</span>
                          <span className="value">{selectedPlane.heading?.toFixed(0)}°</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <div className="detail-section">
                  <h3>Location Information</h3>
                  <div className="location-info">
                    <p><strong>Current/Last Location:</strong></p>
                    <p>{selectedPlane.scrapedLocation || selectedPlane.lastAirport || 'Unknown'}</p>
                    {selectedPlane.status === 'active' && (
                      <p><em>Currently in flight</em></p>
                    )}
                  </div>
                </div>

                <div className="detail-section">
                  <h3>Scheduled Flights</h3>
                  <div className="scheduled-flights">
                    {getScheduledFlights(selectedPlane.xlNum).length > 0 ? (
                      <>
                        <div className="flights-table-container">
                          <table className="scheduled-flights-table">
                            <thead>
                              <tr>
                                <th>Flight</th>
                                <th>Time</th>
                                <th>From</th>
                                <th>To</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {getScheduledFlights(selectedPlane.xlNum)
                                .slice()
                                .sort((a: any, b: any) => {
                                  const ad = a.datetime || a.scrapedAt || ''
                                  const bd = b.datetime || b.scrapedAt || ''
                                  return (bd as string).localeCompare(ad as string)
                                })
                                .map((flight, index) => (
                                  <tr key={index}>
                                    <td className="flight-number">{flight.flight}</td>
                                    <td>{[flight.date, flight.time].filter(Boolean).join(' ')}</td>
                                    <td>{flight.departure || flight.airport}</td>
                                    <td>{flight.arrival || flight.route}</td>
                                    <td>{flight.status}</td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : (
                      <div className="no-flights">
                        <p>No scheduled flights available for this aircraft</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="detail-section">
                  <h3>Recent Flight Activity</h3>
                  <div className="historic-flights">
                    {getAirportToAirportFlights(selectedPlane.reg).length > 0 ? (
                      <>
                        <p className="data-note">Showing recent flight activity from historic tracking data</p>
                        <div className="flights-table-container">
                          <table className="historic-flights-table">
                            <thead>
                              <tr>
                                <th>Flight</th>
                                <th>From</th>
                                <th>To</th>
                                <th>Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {getAirportToAirportFlights(selectedPlane.reg).map((flight, index) => (
                                <tr key={index}>
                                <td className="flight-number">{String(flight.flight)}</td>
                                <td>{String(flight.departure)}</td>
                                <td>{String(flight.arrival)}</td>
                                <td>{String(flight.date || new Date(flight.startTime * 1000).toLocaleDateString())}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : (
                      <div className="no-flights">
                        <p>No historic flight data available yet</p>
                        <p className="data-note">Historic tracking data will appear here once the aircraft has been monitored for a few hours. The system fetches data at 5-minute intervals over the selected history period.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default FleetStatus
