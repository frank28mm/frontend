// Centralized feature flags.
// Default behavior:
// - In local dev (`npm run dev`), subject rendering and submission ceilings are enabled.
// - In production builds, each subject is disabled unless explicitly enabled.

const parseBool = (raw: unknown): boolean | null => {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v) return null;
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return null;
};

export const FEATURE_ENGLISH_RENDER_ENABLED: boolean = (() => {
  const override = parseBool(import.meta.env.VITE_FEATURE_ENGLISH_RENDER_ENABLED);
  if (override !== null) return override;
  return Boolean(import.meta.env.DEV);
})();

export const FEATURE_ENGLISH_SUBMISSION_ENABLED: boolean = (() => {
  const override = parseBool(import.meta.env.VITE_FEATURE_ENGLISH_SUBMISSION_ENABLED);
  if (override !== null) return override;
  return Boolean(import.meta.env.DEV);
})();

export const FEATURE_PHYSICS_RENDER_ENABLED: boolean = (() => {
  const override = parseBool(import.meta.env.VITE_FEATURE_PHYSICS_RENDER_ENABLED);
  if (override !== null) return override;
  return Boolean(import.meta.env.DEV);
})();

export const FEATURE_PHYSICS_SUBMISSION_ENABLED: boolean = (() => {
  const override = parseBool(import.meta.env.VITE_FEATURE_PHYSICS_SUBMISSION_ENABLED);
  if (override !== null) return override;
  return Boolean(import.meta.env.DEV);
})();

export const FEATURE_CHEMISTRY_RENDER_ENABLED: boolean = (() => {
  const override = parseBool(import.meta.env.VITE_FEATURE_CHEMISTRY_RENDER_ENABLED);
  if (override !== null) return override;
  return Boolean(import.meta.env.DEV);
})();

export const FEATURE_CHEMISTRY_SUBMISSION_ENABLED: boolean = (() => {
  const override = parseBool(import.meta.env.VITE_FEATURE_CHEMISTRY_SUBMISSION_ENABLED);
  if (override !== null) return override;
  return Boolean(import.meta.env.DEV);
})();

// Temporary compatibility for pages migrated in later TC-LT-07 tasks. It uses
// the stricter intersection and therefore cannot bypass either new ceiling.
export const FEATURE_ENGLISH_ENABLED =
  FEATURE_ENGLISH_RENDER_ENABLED && FEATURE_ENGLISH_SUBMISSION_ENABLED;
