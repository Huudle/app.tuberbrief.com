import { Badge } from "@/components/ui/badge";

interface UsageBadgeProps {
  currentCount: number;
  maxCount: number;
  label?: string;
}

export function UsageBadge({
  currentCount,
  maxCount,
  label = "notifications",
}: UsageBadgeProps) {
  const usagePercentage = (currentCount / maxCount) * 100;
  const isNearLimit = usagePercentage >= 80;
  const isAtLimit = usagePercentage >= 100;

  return (
    <Badge
      variant={isAtLimit ? "destructive" : "secondary"}
      className={
        isNearLimit && !isAtLimit ? "bg-yellow-500 hover:bg-yellow-500/80" : ""
      }
    >
      {currentCount}/{maxCount} {label} used
    </Badge>
  );
}
