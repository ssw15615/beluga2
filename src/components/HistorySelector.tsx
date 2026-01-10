interface HistorySelectorProps {
  hours: number
  onChange: (hours: number) => void
}

const HistorySelector = ({ hours, onChange }: HistorySelectorProps) => {
  return (
    <div className="history-selector">
      <label>Flight History: </label>
      <select value={hours} onChange={(e) => onChange(Number(e.target.value))}>
        <option value={3}>3 hours</option>
        <option value={6}>6 hours</option>
        <option value={12}>12 hours</option>
        <option value={24}>24 hours</option>
      </select>
    </div>
  )
}

export default HistorySelector