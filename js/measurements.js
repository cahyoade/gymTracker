export const BODY_METRICS = [
  { key:'weight', label:'Body weight', unit:'kg' },
  { key:'muscleMass', label:'Muscle mass', unit:'kg' },
  { key:'bodyFat', label:'Body fat', unit:'%' }
];

export function validateMeasurement(record) {
  if (typeof record.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(record.date) ||
    !Number.isFinite(Date.parse(`${record.date}T00:00:00Z`)) || new Date(`${record.date}T00:00:00Z`).toISOString().slice(0,10) !== record.date) {
    throw new Error('Choose a valid measurement date.');
  }
  const values = {};
  for (const {key,label} of BODY_METRICS) {
    const raw = record[key];
    if (raw === '' || raw === null || raw === undefined) { values[key] = null; continue; }
    const value = typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== '') ? Number(raw) : NaN;
    if (key !== 'bodyFat' && value > 1000) throw new Error(`${label} must not exceed 1000 kg.`);
    if (!Number.isFinite(value) || value < 0 || (key === 'weight' && value === 0) || (key === 'bodyFat' && value > 100)) {
      throw new Error(key === 'bodyFat' ? 'Body fat must be between 0 and 100%.' : `${label} must be ${key === 'weight' ? 'greater than zero' : 'zero or more'} kg.`);
    }
    values[key] = value;
  }
  if (Object.values(values).every(value => value === null)) throw new Error('Enter at least one measurement.');
  if (values.weight !== null && values.muscleMass !== null && values.muscleMass > values.weight) throw new Error('Muscle mass cannot exceed body weight in the same record.');
  return { ...record, ...values };
}

// Missing values remain absent, never zero. Compare each metric only with a
// previous record that actually contains that metric, independent of sort order.
export function measurementSeries(records, key) {
  return records.filter(record => typeof record[key] === 'number' && Number.isFinite(record[key]))
    .sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}
export function measurementSummary(records, key) {
  const series = measurementSeries(records,key), latest = series.at(-1), previous = series.at(-2);
  return {latest, previous, change:latest && previous ? latest[key] - previous[key] : null};
}

export function todayLocal() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
