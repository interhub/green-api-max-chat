import { useId } from 'react'

/** Our own mark: a rounded chat bubble (same drawing as public/favicon.svg). */
export function Logo({ size = 40, className }: { size?: number; className?: string }) {
  const gradientId = useId()
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="6"
          y1="8"
          x2="58"
          y2="60"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#2f9bff" />
          <stop offset="1" stopColor="#7a5cff" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gradientId})`}
        d="M20 8h24a14 14 0 0 1 14 14v14a14 14 0 0 1-14 14H32L18 60l2-10A14 14 0 0 1 6 36V22A14 14 0 0 1 20 8Z"
      />
      <circle cx="22" cy="29" r="3.5" fill="#fff" />
      <circle cx="32" cy="29" r="3.5" fill="#fff" />
      <circle cx="42" cy="29" r="3.5" fill="#fff" />
    </svg>
  )
}
