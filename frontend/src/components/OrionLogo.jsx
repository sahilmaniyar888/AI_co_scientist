export function OrionLogo({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="19" fill="#020617" stroke="rgba(148,163,184,0.18)" />
      <circle cx="20" cy="20" r="2" fill="#E2E8F0" />
      {[
        [20, 7, '#A5F3FC'],
        [30, 12, '#818CF8'],
        [32, 22, '#38BDF8'],
        [25, 31, '#67E8F9'],
        [14, 31, '#A78BFA'],
        [8, 21, '#38BDF8'],
        [10, 11, '#C4B5FD'],
      ].map(([cx, cy, fill]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.6" fill={fill} />
      ))}
      <path
        d="M10 11C13.5 8 16.5 7 20 7C24 7 27 8.4 30 12"
        stroke="rgba(129,140,248,0.45)"
        strokeWidth="1"
      />
      <path
        d="M8 21C10.2 27 16 31 25 31"
        stroke="rgba(56,189,248,0.35)"
        strokeWidth="1"
      />
      <path
        d="M20 7C24 12 27.4 17 32 22"
        stroke="rgba(103,232,249,0.3)"
        strokeWidth="1"
      />
    </svg>
  )
}
