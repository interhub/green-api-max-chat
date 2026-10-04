/**
 * Marks <html data-modality="keyboard|pointer"> by the last way the user moved focus. Text fields
 * always match :focus-visible, so the composer, which is focused most of the time, draws its focus
 * ring only after Tab navigation.
 */
export function trackInputModality(root: HTMLElement = document.documentElement): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Tab') root.dataset.modality = 'keyboard'
  }
  const onPointerDown = () => {
    root.dataset.modality = 'pointer'
  }
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('pointerdown', onPointerDown, true)
  return () => {
    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('pointerdown', onPointerDown, true)
  }
}
