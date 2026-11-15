import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const productionEnv = readFileSync(resolve(process.cwd(), '.env.production'), 'utf8');

const readEnvValue = (name: string): string | undefined => {
  const line = productionEnv
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${name}=`));
  return line?.slice(line.indexOf('=') + 1).trim();
};

describe('production feature flags', () => {
  it('keeps English reading and submission enabled in production builds', () => {
    expect(readEnvValue('VITE_FEATURE_ENGLISH_RENDER_ENABLED')).toBe('true');
    expect(readEnvValue('VITE_FEATURE_ENGLISH_SUBMISSION_ENABLED')).toBe('true');
  });

  it('enables Physics and Chemistry reading and submission in production builds', () => {
    expect(readEnvValue('VITE_FEATURE_PHYSICS_RENDER_ENABLED')).toBe('true');
    expect(readEnvValue('VITE_FEATURE_PHYSICS_SUBMISSION_ENABLED')).toBe('true');
    expect(readEnvValue('VITE_FEATURE_CHEMISTRY_RENDER_ENABLED')).toBe('true');
    expect(readEnvValue('VITE_FEATURE_CHEMISTRY_SUBMISSION_ENABLED')).toBe('true');
  });
});
