interface ScheduledFlightsProps {
  schedules: any[]
}

const ScheduledFlights = ({ schedules = [] }: ScheduledFlightsProps) => {
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
            {schedules && schedules
              .slice()
              .sort((a: any, b: any) => {
                const ad = a?.datetime || a?.scrapedAt || ''
                const bd = b?.datetime || b?.scrapedAt || ''
                return (bd as string).localeCompare(ad as string)
              })
              .slice(0, 10)
              .map((flight, index) => {
              const isHawarden = flight.route?.includes('Hawarden (EGNR)') || flight.airport?.includes('Hawarden')
              return (
                <tr key={index} className={isHawarden ? 'hawarden-flight' : ''}>
                  <td className="flight-number">{flight.flight}</td>
                  <td className="aircraft">{flight.aircraft}</td>
                  <td>{[flight.date, flight.time].filter(Boolean).join(' ')}</td>
                  <td className="departure">{flight.departure || flight.airport}</td>
                  <td className="arrival">{flight.arrival || flight.route}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default ScheduledFlights