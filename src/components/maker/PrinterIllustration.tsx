/**
 * Generic enclosed-FDM-printer illustration. Inline SVG so it tints with
 * Tailwind colours and ships zero asset weight. We deliberately don't
 * render per-model art — it's a rabbit hole and the model name is right
 * there in the spec panel.
 */
export function PrinterIllustration({
  className,
  active = true,
}: {
  className?: string;
  active?: boolean;
}) {
  // Brand-purple when active, muted when offline.
  const accent = active ? "#7c3aed" : "#94a3b8";
  return (
    <svg
      viewBox="0 0 200 220"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="3D printer illustration"
    >
      {/* Base shadow */}
      <ellipse cx="100" cy="208" rx="68" ry="6" fill="black" opacity="0.06" />

      {/* Cabinet outer */}
      <rect
        x="28"
        y="20"
        width="144"
        height="170"
        rx="8"
        fill="white"
        stroke="black"
        strokeOpacity="0.15"
        strokeWidth="1.5"
      />
      {/* Cabinet inner shading on right */}
      <rect
        x="155"
        y="22"
        width="15"
        height="166"
        rx="6"
        fill="black"
        opacity="0.04"
      />

      {/* Top crown — control panel area */}
      <rect
        x="28"
        y="20"
        width="144"
        height="22"
        rx="8"
        fill="black"
        opacity="0.08"
      />
      {/* Display */}
      <rect x="42" y="27" width="44" height="9" rx="2" fill={accent} opacity="0.9" />
      {/* Buttons */}
      <circle cx="148" cy="31" r="2.4" fill="black" opacity="0.4" />
      <circle cx="156" cy="31" r="2.4" fill="black" opacity="0.4" />
      <circle cx="164" cy="31" r="2.4" fill="black" opacity="0.4" />

      {/* Glass door — front face */}
      <rect
        x="38"
        y="50"
        width="124"
        height="120"
        rx="4"
        fill={accent}
        opacity="0.05"
      />
      <rect
        x="38"
        y="50"
        width="124"
        height="120"
        rx="4"
        fill="none"
        stroke="black"
        strokeOpacity="0.12"
        strokeWidth="1"
      />
      {/* Door handle */}
      <rect
        x="146"
        y="100"
        width="3"
        height="20"
        rx="1.5"
        fill="black"
        opacity="0.35"
      />

      {/* X-axis gantry rail */}
      <line
        x1="42"
        y1="68"
        x2="158"
        y2="68"
        stroke="black"
        strokeOpacity="0.25"
        strokeWidth="2"
      />
      {/* Toolhead */}
      <g>
        <rect
          x="92"
          y="58"
          width="22"
          height="18"
          rx="2"
          fill={accent}
          opacity="0.95"
        />
        <rect
          x="98"
          y="76"
          width="10"
          height="6"
          fill={accent}
          opacity="0.95"
        />
        {/* Nozzle */}
        <polygon points="101,82 107,82 104,88" fill={accent} opacity="0.95" />
      </g>

      {/* Z-axis side rails */}
      <line
        x1="48"
        y1="55"
        x2="48"
        y2="160"
        stroke="black"
        strokeOpacity="0.18"
        strokeWidth="1.5"
      />
      <line
        x1="152"
        y1="55"
        x2="152"
        y2="160"
        stroke="black"
        strokeOpacity="0.18"
        strokeWidth="1.5"
      />

      {/* Build plate */}
      <rect
        x="50"
        y="150"
        width="100"
        height="6"
        rx="1.5"
        fill="black"
        opacity="0.55"
      />
      {/* In-progress part */}
      <rect
        x="86"
        y="138"
        width="28"
        height="12"
        rx="2"
        fill={accent}
        opacity="0.7"
      />
      <rect
        x="92"
        y="130"
        width="16"
        height="8"
        rx="1.5"
        fill={accent}
        opacity="0.85"
      />

      {/* Feet */}
      <rect x="40" y="190" width="14" height="6" rx="2" fill="black" opacity="0.3" />
      <rect x="146" y="190" width="14" height="6" rx="2" fill="black" opacity="0.3" />
    </svg>
  );
}
