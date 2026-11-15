export const validReportProfileId = (value: unknown): value is string => {
  if (typeof value !== 'string' || !value || value.trim() !== value || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return false;
  try { return new TextEncoder().encode(value).length <= 128; } catch { return false; }
};

// An explicit child is a query scope, never authorization or a global profile change.
export function reportNavigationScope(search: string) {
  const values = new URLSearchParams(search).getAll('profileId');
  if (!values.length) return { explicit: false, valid: true, profile: '' };
  if (values.length !== 1 || !validReportProfileId(values[0])) return { explicit: true, valid: false, profile: '' };
  return { explicit: true, valid: true, profile: values[0] };
}
