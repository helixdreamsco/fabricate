/**
 * Fabricate brand mark — two intertwining strands, evoking both a DNA
 * helix and the layered extrusion of FDM printing. Adaptable: scales to
 * nav-bar size or favicon, transparent background, no text. The same
 * geometry is duplicated in src/app/icon.svg for browser-tab use.
 */
export function HelixLogo({
  className,
  size = 26,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M12 4 Q22 10 12 16 Q2 22 12 28"
        stroke="#7c3aed"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 4 Q10 10 20 16 Q30 22 20 28"
        stroke="#a78bfa"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
