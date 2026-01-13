import { useState, useMemo } from 'react'

interface Flight {
  flight?: string
  aircraft?: string
  date?: string
  time?: string
  departure?: string
  arrival?: string
  route?: string
  airport?: string
  datetime?: string
  scrapedAt?: string
}

interface HistoricFlightsProps {
  schedules: Flight[]
}

type SortField = 'datetime' | 'flight' | 'aircraft' | 'departure' | 'arrival'
type SortOrder = 'asc' | 'desc'

const HistoricFlights = ({ schedules = [] }: HistoricFlightsProps) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [sortField, setSortField] = useState<SortField>('datetime')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [filterAircraft, setFilterAircraft] = useState('')
  const [filterDeparture, setFilterDeparture] = useState('')
  const [filterArrival, setFilterArrival] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20

  // Get unique values for filters
  const uniqueAircraft = useMemo(() => {
    const aircraft = new Set(schedules.map(f => f.aircraft).filter(Boolean))
    return Array.from(aircraft).sort()
  }, [schedules])

  const uniqueDepartures = useMemo(() => {
    const departures = new Set(
      schedules
        .map(f => f.departure || f.airport)
        .filter(Boolean)
    )
    return Array.from(departures).sort()
  }, [schedules])

  const uniqueArrivals = useMemo(() => {
    const arrivals = new Set(
      schedules
        .map(f => f.arrival || f.route)
        .filter(Boolean)
    )
    return Array.from(arrivals).sort()
  }, [schedules])

  // Filter and sort flights
  const filteredFlights = useMemo(() => {
    let filtered = schedules.filter(flight => {
      const searchLower = searchTerm.toLowerCase()
      const matchesSearch =
        (flight.flight?.toLowerCase().includes(searchLower) || false) ||
        (flight.aircraft?.toLowerCase().includes(searchLower) || false) ||
        (flight.departure?.toLowerCase().includes(searchLower) || false) ||
        (flight.arrival?.toLowerCase().includes(searchLower) || false) ||
        ((flight.date || '') + ' ' + (flight.time || '')).toLowerCase().includes(searchLower)

      const matchesAircraft = !filterAircraft || flight.aircraft === filterAircraft
      const matchesDeparture = !filterDeparture || (flight.departure || flight.airport) === filterDeparture
      const matchesArrival = !filterArrival || (flight.arrival || flight.route) === filterArrival

      return matchesSearch && matchesAircraft && matchesDeparture && matchesArrival
    })

    // Sort
    filtered.sort((a, b) => {
      let aVal: any = ''
      let bVal: any = ''

      switch (sortField) {
        case 'datetime':
          aVal = a.datetime || a.scrapedAt || a.date || ''
          bVal = b.datetime || b.scrapedAt || b.date || ''
          break
        case 'flight':
          aVal = a.flight || ''
          bVal = b.flight || ''
          break
        case 'aircraft':
          aVal = a.aircraft || ''
          bVal = b.aircraft || ''
          break
        case 'departure':
          aVal = a.departure || a.airport || ''
          bVal = b.departure || b.airport || ''
          break
        case 'arrival':
          aVal = a.arrival || a.route || ''
          bVal = b.arrival || b.route || ''
          break
      }

      if (typeof aVal === 'string') {
        const comparison = aVal.localeCompare(bVal)
        return sortOrder === 'asc' ? comparison : -comparison
      }

      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal
    })

    return filtered
  }, [schedules, searchTerm, sortField, sortOrder, filterAircraft, filterDeparture, filterArrival])

  // Pagination
  const totalPages = Math.ceil(filteredFlights.length / itemsPerPage)
  const paginatedFlights = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filteredFlights.slice(startIndex, startIndex + itemsPerPage)
  }, [filteredFlights, currentPage])

  // Reset to page 1 when filters change
  useMemo(() => {
    setCurrentPage(1)
  }, [searchTerm, filterAircraft, filterDeparture, filterArrival])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const getSortIndicator = (field: SortField) => {
    if (sortField !== field) return ' ↕️'
    return sortOrder === 'asc' ? ' ↑' : ' ↓'
  }

  return (
    <div className="historic-flights">
      <h2>Historic & Scheduled Flights</h2>
      
      <div className="filters-container">
        <div className="filter-group">
          <label htmlFor="search-input">Search:</label>
          <input
            id="search-input"
            type="text"
            placeholder="Flight number, aircraft, departure, arrival..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-group">
          <label htmlFor="aircraft-filter">Aircraft:</label>
          <select
            id="aircraft-filter"
            value={filterAircraft}
            onChange={(e) => setFilterAircraft(e.target.value)}
            className="filter-select"
          >
            <option value="">All Aircraft</option>
            {uniqueAircraft.map(aircraft => (
              <option key={aircraft} value={aircraft}>{aircraft}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="departure-filter">Departure:</label>
          <select
            id="departure-filter"
            value={filterDeparture}
            onChange={(e) => setFilterDeparture(e.target.value)}
            className="filter-select"
          >
            <option value="">All Departures</option>
            {uniqueDepartures.map(departure => (
              <option key={departure} value={departure}>{departure}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="arrival-filter">Arrival:</label>
          <select
            id="arrival-filter"
            value={filterArrival}
            onChange={(e) => setFilterArrival(e.target.value)}
            className="filter-select"
          >
            <option value="">All Arrivals</option>
            {uniqueArrivals.map(arrival => (
              <option key={arrival} value={arrival}>{arrival}</option>
            ))}
          </select>
        </div>

        <div className="filter-info">
          Showing {filteredFlights.length} of {schedules.length} flights
        </div>
      </div>

      <div className="flights-table-container">
        <table className="flights-table flights-table-full">
          <thead>
            <tr>
              <th onClick={() => handleSort('flight')} className="sortable">
                Flight {getSortIndicator('flight')}
              </th>
              <th onClick={() => handleSort('aircraft')} className="sortable">
                Aircraft {getSortIndicator('aircraft')}
              </th>
              <th onClick={() => handleSort('datetime')} className="sortable">
                Date & Time {getSortIndicator('datetime')}
              </th>
              <th onClick={() => handleSort('departure')} className="sortable">
                Departure {getSortIndicator('departure')}
              </th>
              <th onClick={() => handleSort('arrival')} className="sortable">
                Arrival {getSortIndicator('arrival')}
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedFlights.length > 0 ? (
              paginatedFlights.map((flight, index) => {
                const isHawarden = flight.route?.includes('Hawarden (EGNR)') || flight.airport?.includes('Hawarden')
                const dateTime = [flight.date, flight.time].filter(Boolean).join(' ') || flight.datetime || flight.scrapedAt
                
                return (
                  <tr key={index} className={isHawarden ? 'hawarden-flight' : ''}>
                    <td className="flight-number">{flight.flight || '-'}</td>
                    <td className="aircraft">{flight.aircraft || '-'}</td>
                    <td className="datetime">{dateTime || '-'}</td>
                    <td className="departure">{flight.departure || flight.airport || '-'}</td>
                    <td className="arrival">{flight.arrival || flight.route || '-'}</td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan={5} className="no-flights">
                  No flights match your search criteria
                </td>
              </tr>
            )}
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
              Page {currentPage} of {totalPages} ({filteredFlights.length} flights)
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

export default HistoricFlights
