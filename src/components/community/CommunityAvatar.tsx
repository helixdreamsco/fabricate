import { cn } from "@/lib/utils";

/**
 * Generated avatar from a community's name + hue — no uploaded image needed.
 * Works as a small chip or large hero avatar depending on the size prop.
 */
export function CommunityAvatar({
  name,
  hue,
  size = 40,
  className,
}: {
  name: string;
  hue: number;
  size?: number;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "C";

  // Two-tone gradient for depth, black text for legibility.
  const bg = `linear-gradient(135deg, hsl(${hue} 80% 86%) 0%, hsl(${
    (hue + 40) % 360
  } 70% 74%) 100%)`;

  return (
    <div
      className={cn(
        "rounded-xl flex items-center justify-center font-black tracking-tight text-[#0a0a0a] ring-1 ring-black/10",
        className,
      )}
      style={{
        background: bg,
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
      }}
    >
      {initials}
    </div>
  );
}
