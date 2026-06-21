export type Direction = 'ltr' | 'rtl';

const RTL_LOCALES = ['ar', 'he', 'fa', 'ur', 'yi', 'am'];

export function getDirection(locale: string): Direction {
  return RTL_LOCALES.some(l => locale.startsWith(l)) ? 'rtl' : 'ltr';
}

// Returns Tailwind classes for start/end instead of left/right
export function startClass(ltr: string, rtl: string, dir: Direction = 'ltr'): string {
  return dir === 'rtl' ? rtl : ltr;
}
