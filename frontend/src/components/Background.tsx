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
        {/* Light theme palette — soft, low-saturation on white */}
        <radialGradient id="bg-mesh-a-light" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgb(59 130 246 / 0.55)" />
          <stop offset="100%" stopColor="rgb(59 130 246 / 0)" />
        </radialGradient>
        <radialGradient id="bg-mesh-b-light" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgb(168 85 247 / 0.45)" />
          <stop offset="100%" stopColor="rgb(168 85 247 / 0)" />
        </radialGradient>
        <radialGradient id="bg-mesh-c-light" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgb(20 184 166 / 0.40)" />
          <stop offset="100%" stopColor="rgb(20 184 166 / 0)" />
        </radialGradient>

        {/* Dark theme palette — deeper glows on black */}
        <radialGradient id="bg-mesh-a-dark" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgb(59 130 246 / 0.42)" />
          <stop offset="100%" stopColor="rgb(59 130 246 / 0)" />
        </radialGradient>
        <radialGradient id="bg-mesh-b-dark" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgb(139 92 246 / 0.38)" />
          <stop offset="100%" stopColor="rgb(139 92 246 / 0)" />
        </radialGradient>
        <radialGradient id="bg-mesh-c-dark" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgb(14 165 233 / 0.32)" />
          <stop offset="100%" stopColor="rgb(14 165 233 / 0)" />
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
