import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  label: string;
  className?: string;
}

export function StatusBadge({ label, className }: StatusBadgeProps) {
  return (
    <span className={cn("rounded-full border px-2 py-1 text-[10px] font-medium", className)}>
      {label}
    </span>
  );
}
