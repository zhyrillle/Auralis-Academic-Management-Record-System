export const SCREENING_DEFAULTS = {
  literal_max: 14, inferential_max: 12, critical_max: 14, score_threshold: 28,
  assessed_on: '', test_level: '',
};
export const SCREENING_PARTS = ['literal', 'inferential', 'critical'];

export function screeningTotal(row, config) {
  if (row.test_taken !== 1) return null;
  const values = SCREENING_PARTS.map(part => row[`${part}_score`]);
  if (values.some((value, i) => value === '' || value == null || !Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > Number(config[`${SCREENING_PARTS[i]}_max`]))) return null;
  return values.reduce((sum, value) => sum + Number(value), 0);
}
