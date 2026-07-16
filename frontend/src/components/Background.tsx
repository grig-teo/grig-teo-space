/**
 * Animated gradient-mesh background for the portfolio.
 *
 * - Fixed full-viewport SVG layer, sits behind all content (z-index -1).
 * - Theme-aware: separate blob palettes for light and dark (driven by the
 *   `data-theme` attribute + the system-dark fallback, mirroring globals.css).
 * - Motion is pure CSS keyframes (no JS), and is disabled when the user
 *   prefers reduced motion.
 */
export function Background() {
  return (
    <svg
      className="bg-mesh"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 1440 900"
    >
      <defs>
        {/* Light theme palette — teal/indigo/amber, softened for warm paper */}
        <radialGradient id="bg-mesh-a-light" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgb(45 212 191 / 0.30)" />
          <stop offset="100%" stopColor="rgb(45 212 191 / 0)" />
        </radialGradient>
        <radialGradient id="bg-mesh-b-light" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgb(99 102 241 / 0.25)" />
          <stop offset="100%" stopColor="rgb(99 102 241 / 0)" />
        </radialGradient>
        <radialGradient id="bg-mesh-c-light" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgb(251 191 36 / 0.15)" />
          <stop offset="100%" stopColor="rgb(251 191 36 / 0)" />
        </radialGradient>

        {/* Dark theme palette — phosphor teal/indigo/amber on deep ink */}
        <radialGradient id="bg-mesh-a-dark" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgb(45 212 191 / 0.35)" />
          <stop offset="100%" stopColor="rgb(45 212 191 / 0)" />
        </radialGradient>
        <radialGradient id="bg-mesh-b-dark" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgb(99 102 241 / 0.30)" />
          <stop offset="100%" stopColor="rgb(99 102 241 / 0)" />
        </radialGradient>
        <radialGradient id="bg-mesh-c-dark" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgb(251 191 36 / 0.18)" />
          <stop offset="100%" stopColor="rgb(251 191 36 / 0)" />
        </radialGradient>
      </defs>

      {/* Light theme blobs (hidden in dark) */}
      <g className="bg-mesh-light">
        <circle className="bg-mesh-blob bg-mesh-1" cx="220" cy="200" r="520" fill="url(#bg-mesh-a-light)" />
        <circle className="bg-mesh-blob bg-mesh-2" cx="1200" cy="180" r="460" fill="url(#bg-mesh-b-light)" />
        <circle className="bg-mesh-blob bg-mesh-3" cx="720" cy="760" r="600" fill="url(#bg-mesh-c-light)" />
      </g>

      {/* Dark theme blobs (hidden in light) */}
      <g className="bg-mesh-dark">
        <circle className="bg-mesh-blob bg-mesh-1" cx="220" cy="200" r="560" fill="url(#bg-mesh-a-dark)" />
        <circle className="bg-mesh-blob bg-mesh-2" cx="1200" cy="180" r="500" fill="url(#bg-mesh-b-dark)" />
        <circle className="bg-mesh-blob bg-mesh-3" cx="720" cy="760" r="640" fill="url(#bg-mesh-c-dark)" />
      </g>
    </svg>
  );
}
