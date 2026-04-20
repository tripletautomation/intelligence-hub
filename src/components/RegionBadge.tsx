import type { Region } from "@/lib/types";

export const RegionBadge = ({ region }: { region: Region | null }) => {
  if (region === "israel")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium bg-region-israel-soft text-region-israel">
        <span className="h-1.5 w-1.5 rounded-full bg-region-israel" />
        ישראל
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium bg-region-global-soft text-region-global">
      <span className="h-1.5 w-1.5 rounded-full bg-region-global" />
      גלובלי
    </span>
  );
};
