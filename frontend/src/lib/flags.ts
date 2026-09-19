/**
 * Feature Flag helper for UI V2 and modular redesign.
 *
 * Supports NEXT_PUBLIC_UI_V2 master flag with default fallback,
 * along with granular flags for specific route areas.
 */

export interface FeatureFlags {
  uiV2: boolean;
  uiV2Public: boolean;
  uiV2Account: boolean;
  uiV2Admin: boolean;
}

export function parseEnvFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') return defaultValue;
  return value === 'true' || value === '1';
}

export const flags = {
  /** Master UI V2 flag. Defaults to false. */
  get isUiV2Enabled(): boolean {
    return parseEnvFlag(process.env.NEXT_PUBLIC_UI_V2, false);
  },

  /** Public routes UI V2 flag (inherits master flag if set). */
  get isUiV2PublicEnabled(): boolean {
    if (this.isUiV2Enabled) return true;
    return parseEnvFlag(process.env.NEXT_PUBLIC_UI_V2_PUBLIC, false);
  },

  /** Account routes UI V2 flag (inherits master flag if set). */
  get isUiV2AccountEnabled(): boolean {
    if (this.isUiV2Enabled) return true;
    return parseEnvFlag(process.env.NEXT_PUBLIC_UI_V2_ACCOUNT, false);
  },

  /** Admin routes UI V2 flag (inherits master flag if set). */
  get isUiV2AdminEnabled(): boolean {
    if (this.isUiV2Enabled) return true;
    return parseEnvFlag(process.env.NEXT_PUBLIC_UI_V2_ADMIN, false);
  },

  /** Get all feature flags as an object */
  getAll(): FeatureFlags {
    return {
      uiV2: this.isUiV2Enabled,
      uiV2Public: this.isUiV2PublicEnabled,
      uiV2Account: this.isUiV2AccountEnabled,
      uiV2Admin: this.isUiV2AdminEnabled,
    };
  },
};

export default flags;
