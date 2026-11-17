"use client";

import dynamic from "next/dynamic";
import { KUWAIT_CENTER, type MapCircle, type MapPoint } from "./types";

// Swap this import to change map provider (see types.ts).
const MapCanvas = dynamic(() => import("./map-canvas-leaflet"), {
  ssr: false,
  loading: () => <div className="h-96 w-full skeleton rounded-xl" />,
});

/** Read-only emergency map: danger buildings red, the safe building green, response points as dots. */
export function EmergencyMap({ circles, points, legend }: { circles: MapCircle[]; points?: MapPoint[]; legend: string }) {
  // The safe building first so the map centres on the assembly point.
  const ordered = [...circles].sort((a, b) => Number(b.tone === "safe") - Number(a.tone === "safe"));
  return (
    <div className="flex flex-col gap-2">
      <MapCanvas value={null} context={ordered} points={points} fallbackCenter={KUWAIT_CENTER} heightClass="h-96" />
      <p className="text-xs text-muted">{legend}</p>
    </div>
  );
}
