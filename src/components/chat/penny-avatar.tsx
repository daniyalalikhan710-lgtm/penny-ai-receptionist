import { cn } from "@/lib/utils";

/** Penny's mark: a copper coin with a P. */
export function PennyAvatar({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-display font-semibold text-white shadow-sm", className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.52),
        background: "radial-gradient(circle at 30% 25%, #dea66c 0%, #b87333 45%, #7c4718 100%)",
        boxShadow: "inset 0 0 0 1.5px rgb(255 255 255 / 0.35), 0 1px 2px rgb(0 0 0 / 0.25)",
      }}
    >
      P
    </span>
  );
}
