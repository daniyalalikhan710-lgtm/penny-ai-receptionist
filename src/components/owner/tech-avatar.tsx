import { techById } from "@/lib/domain/technicians";

/** Generated-initials avatar. No real people's photos are used anywhere. */
export function TechAvatar({ techId, size = 32 }: { techId: string; size?: number }) {
  const tech = techById(techId);
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-white"
      style={{ width: size, height: size, backgroundColor: tech?.color ?? "#4f6187", fontSize: Math.round(size * 0.38) }}
    >
      {tech?.initials ?? "?"}
    </span>
  );
}
