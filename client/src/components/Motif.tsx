type Corner = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'

const place: Record<Corner, string> = {
  'bottom-left': 'bottom-0 left-0',
  'bottom-right': 'bottom-0 right-0 -scale-x-100',
  'top-left': 'top-0 left-0 -scale-y-100',
  'top-right': 'top-0 right-0 -scale-x-100 -scale-y-100',
}

/**
 * The UDEI line motif, tucked into one corner of a `relative overflow-hidden` parent. It is
 * clearest at the corner and fades toward the middle. Set its colour and strength with text-*
 * (e.g. text-white/40 on dark green, text-brand-700/50 on the light background) and its size with w-*.
 */
export default function Motif({ corner = 'bottom-left', className = '' }: { corner?: Corner; className?: string }) {
  return <div aria-hidden="true" className={`motif pointer-events-none absolute aspect-[800/850] select-none print:hidden ${place[corner]} ${className}`} />
}
