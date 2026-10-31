// A light buzz on supporting phones (Android); a no-op elsewhere, including iOS Safari.
export function haptic(pattern: number | number[] = 8): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported.
  }
}
