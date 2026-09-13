export const PROFILE_ID = 'samsung-s20fe';
export const VIEWPORT_WIDTH = 360;
export const VIEWPORT_HEIGHT = 800;
export const DEVICE_SCALE_FACTOR = 3;
export const PHYSICAL_WIDTH = 1080;
export const PHYSICAL_HEIGHT = 2400;
export const BROWSER_LOCALE = 'en-US';
export const BROWSER_TIMEZONE = 'UTC';
export const FROZEN_CHROMIUM_FLAGS = Object.freeze([
  '--disable-lcd-text',
  '--font-render-hinting=none',
  '--disable-threaded-animation',
  '--force-color-profile=srgb',
  '--hide-scrollbars',
]);
export const RENDER_GUARD_EXIT_CODE = 11;

export function isArmArch(arch = process.arch) {
  return arch === 'arm' || arch === 'arm64';
}

export function assertLocalRenderAllowed({ arch = process.arch, allowLocalRender = false } = {}) {
  if (isArmArch(arch) && !allowLocalRender) {
    throw new Error('RENDER_ARM_REFUSED: ARM without --allow-local-render');
  }
}
