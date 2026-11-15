/**
 * The sign-in pages' background: banded lines in the top-left and bottom-right corners, arcs in the
 * other two, framing an empty middle for the card. The design repeats when turned half a turn, so
 * each piece is drawn once and turned for the opposite corner. Colour and strength come from text-*.
 * Sits in a `relative overflow-hidden` parent.
 */
export default function CornerPattern({ className = 'text-brand-600/70' }: { className?: string }) {
  const piece = `pointer-events-none absolute select-none print:hidden ${className}`
  return (
    <div aria-hidden="true">
      <div className={`${piece} pattern-bands top-0 left-0 aspect-[680/499] w-[min(70vw,36rem)]`} />
      <div className={`${piece} pattern-bands right-0 bottom-0 aspect-[680/499] w-[min(70vw,36rem)] -scale-x-100 -scale-y-100`} />
      <div className={`${piece} pattern-arc top-0 right-0 aspect-[330/417] w-[min(32vw,17rem)]`} />
      <div className={`${piece} pattern-arc bottom-0 left-0 aspect-[330/417] w-[min(32vw,17rem)] -scale-x-100 -scale-y-100`} />
    </div>
  )
}
