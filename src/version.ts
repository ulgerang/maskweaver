/**
 * Maskweaver Version
 * 
 * Single source of truth for the package version.
 * This value MUST match package.json "version" field.
 * 
 * When bumping versions:
 * 1. Update package.json version
 * 2. Update this constant
 * 3. That's it — all other files import from here
 */
export const VERSION = '0.7.30';

/**
 * Returns a formatted version string for display.
 * @example "Maskweaver v0.7.29"
 */
export function getVersionString(): string {
  return `Maskweaver v${VERSION}`;
}
