import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../api";
import {
  buildAppleMapsDirectionsUrl,
  buildGoogleMapsDirectionsUrl,
  buildGoogleMapsUrl,
  buildOpenStreetMapUrl,
} from "../env";
import type { TrackPoint } from "../types";
import { Redacted, useUi } from "../ui";

type Props = {
  deviceId: number;
  deviceName: string;
  currentLat: number | null;
  currentLon: number | null;
  refreshKey: number;
  online?: boolean;
};

type RangeMode = "preset" | "custom";

const STORAGE_PREFIX = "teltonika-track-recording";
const AUTOREFRESH_KEY = "teltonika-track-autorefresh";

const formatDatetimeLocal = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const parseDatetimeLocal = (s: string): number =>
  Math.floor(new Date(s).getTime() / 1000);

const loadRecorded = (deviceId: number): TrackPoint[] => {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}-${deviceId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { points?: TrackPoint[] };
    if (!parsed?.points || !Array.isArray(parsed.points)) return [];
    return parsed.points.filter(
      (p) =>
        typeof p.lat === "number" &&
        typeof p.lon === "number" &&
        typeof p.ts === "number"
    );
  } catch {
    return [];
  }
};

const saveRecorded = (deviceId: number, points: TrackPoint[]) => {
  window.localStorage.setItem(
    `${STORAGE_PREFIX}-${deviceId}`,
    JSON.stringify({ points, updatedAt: Date.now() })
  );
};

const mergePoints = (a: TrackPoint[], b: TrackPoint[]): TrackPoint[] => {
  const all = [...a, ...b].sort((x, y) => x.ts - y.ts);
  const out: TrackPoint[] = [];
  for (const p of all) {
    const prev = out[out.length - 1];
    if (prev && prev.ts === p.ts && prev.lat === p.lat && prev.lon === p.lon) continue;
    out.push(p);
  }
  return out;
};

const gpxEscape = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const toGpx = (points: TrackPoint[], name: string): string => {
  const pts = points
    .map((p) => {
      const iso = new Date(p.ts * 1000).toISOString();
      return `    <trkpt lat="${p.lat}" lon="${p.lon}"><time>${iso}</time></trkpt>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Teltonika Commander">
  <trk><name>${gpxEscape(name)}</name><trkseg>
${pts}
  </trkseg></trk>
</gpx>`;
};

const toGeoJson = (points: TrackPoint[], name: string): string => {
  const coordinates = points.map((p) => [p.lon, p.lat]);
  return JSON.stringify(
    {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name, pointCount: points.length },
          geometry: { type: "LineString", coordinates },
        },
      ],
    },
    null,
    2
  );
};

const sanitizeFilename = (name: string): string =>
  name.replace(/[^\w\-]+/g, "_").slice(0, 80) || "track";

const HOUR_OPTIONS = [6, 24, 48, 72, 168] as const;

const segmentSpeedKmh = (a: TrackPoint, b: TrackPoint): number => {
  const sa = a.speed;
  const sb = b.speed;
  if (typeof sa === "number" && typeof sb === "number") return (sa + sb) / 2;
  if (typeof sa === "number") return sa;
  if (typeof sb === "number") return sb;
  return 0;
};

const speedLineColor = (kmh: number): string => {
  if (kmh < 5) return "#64748b";
  if (kmh < 40) return "#22c55e";
  if (kmh < 90) return "#eab308";
  return "#ef4444";
};

const readAutoRefreshPref = (): boolean => {
  try {
    const v = window.localStorage.getItem(AUTOREFRESH_KEY);
    if (v === "0") return false;
    if (v === "1") return true;
  } catch {
    // ignore
  }
  return true;
};

export const TrackPanel = ({
  deviceId,
  deviceName,
  currentLat,
  currentLon,
  refreshKey,
  online = false,
}: Props) => {
  const { t, privacy } = useUi();
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<{ map: L.Map; layer: L.LayerGroup } | null>(null);
  const [rangeMode, setRangeMode] = useState<RangeMode>("preset");
  const [hours, setHours] = useState<number>(24);
  const [customFrom, setCustomFrom] = useState(() =>
    formatDatetimeLocal(new Date(Date.now() - 24 * 3600 * 1000))
  );
  const [customTo, setCustomTo] = useState(() => formatDatetimeLocal(new Date()));

  const [serverPoints, setServerPoints] = useState<TrackPoint[]>([]);
  const [recordedPoints, setRecordedPoints] = useState<TrackPoint[]>(() =>
    typeof window !== "undefined" ? loadRecorded(deviceId) : []
  );
  const [recording, setRecording] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [minSpeedKmh, setMinSpeedKmh] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(readAutoRefreshPref);
  const [pollTick, setPollTick] = useState(0);

  useEffect(() => {
    setRecordedPoints(loadRecorded(deviceId));
  }, [deviceId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(AUTOREFRESH_KEY, autoRefresh ? "1" : "0");
    } catch {
      // ignore
    }
  }, [autoRefresh]);

  useEffect(() => {
    if (!online || !autoRefresh) return;
    const id = window.setInterval(() => setPollTick((n) => n + 1), 180_000);
    return () => window.clearInterval(id);
  }, [online, autoRefresh]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadErr(null);

    if (rangeMode === "custom") {
      const fromTs = parseDatetimeLocal(customFrom);
      const toTs = parseDatetimeLocal(customTo);
      if (!Number.isFinite(fromTs) || !Number.isFinite(toTs) || fromTs >= toTs) {
        setLoading(false);
        setLoadErr(t("track_invalid_range"));
        setServerPoints([]);
        return () => {
          cancelled = true;
        };
      }
    }

    let limit = 800;
    if (rangeMode === "custom") {
      const span = parseDatetimeLocal(customTo) - parseDatetimeLocal(customFrom);
      if (span > 48 * 3600) limit = 1000;
    }

    const req =
      rangeMode === "custom"
        ? api.track(deviceId, {
            from: parseDatetimeLocal(customFrom),
            to: parseDatetimeLocal(customTo),
            limit,
          })
        : api.track(deviceId, { hours, limit });

    req
      .then((data) => {
        if (cancelled) return;
        setServerPoints(data.points);
        if (data.error) setLoadErr(data.error);
      })
      .catch((e: Error) => {
        if (!cancelled) setLoadErr(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deviceId, hours, rangeMode, customFrom, customTo, refreshKey, pollTick, t]);

  const displayPoints = useMemo(
    () => mergePoints(serverPoints, recordedPoints),
    [serverPoints, recordedPoints]
  );

  const filteredPoints = useMemo(() => {
    if (minSpeedKmh <= 0) return displayPoints;
    return displayPoints.filter((p) => {
      const s = p.speed;
      if (s === undefined || s === null) return true;
      return s >= minSpeedKmh;
    });
  }, [displayPoints, minSpeedKmh]);

  const hasNumericSpeed = useMemo(
    () => filteredPoints.some((p) => typeof p.speed === "number"),
    [filteredPoints]
  );

  const intervalMs = 45_000;
  useEffect(() => {
    if (!recording || currentLat == null || currentLon == null) return;
    const snap = () => {
      const next: TrackPoint = {
        lat: currentLat,
        lon: currentLon,
        ts: Math.floor(Date.now() / 1000),
      };
      setRecordedPoints((prev) => {
        const merged = mergePoints(prev, [next]);
        saveRecorded(deviceId, merged);
        return merged;
      });
    };
    snap();
    const id = window.setInterval(snap, intervalMs);
    return () => window.clearInterval(id);
  }, [recording, currentLat, currentLon, deviceId]);

  useLayoutEffect(() => {
    const el = mapEl.current;
    if (!el) return;

    const map = L.map(el, {
      zoomControl: true,
      attributionControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);
    const layer = L.layerGroup().addTo(map);
    mapRef.current = { map, layer };

    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current?.map) return;
    const tmr = window.setTimeout(() => mapRef.current?.map.invalidateSize(), 120);
    return () => window.clearTimeout(tmr);
  }, [fullscreen]);

  useEffect(() => {
    const inst = mapRef.current;
    if (!inst) return;
    const { map, layer } = inst;
    layer.clearLayers();

    const pts = filteredPoints;
    const latlngs: L.LatLngExpression[] = pts.map((p) => [p.lat, p.lon]);

    if (pts.length >= 2) {
      if (hasNumericSpeed) {
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i];
          const b = pts[i + 1];
          if (!a || !b) continue;
          const kmh = segmentSpeedKmh(a, b);
          const color = speedLineColor(kmh);
          L.polyline(
            [
              [a.lat, a.lon],
              [b.lat, b.lon],
            ],
            { color, weight: 4, opacity: 0.88 }
          ).addTo(layer);
        }
      } else {
        L.polyline(latlngs, { color: "#60a5fa", weight: 4, opacity: 0.85 }).addTo(layer);
      }
    }

    const showMarkers = pts.length <= 150;
    if (showMarkers) {
      for (const p of pts) {
        L.circleMarker([p.lat, p.lon], {
          radius: 3,
          color: "#93c5fd",
          weight: 1,
          fillOpacity: 0.55,
        }).addTo(layer);
      }
    }

    if (currentLat != null && currentLon != null) {
      L.circleMarker([currentLat, currentLon], {
        radius: 8,
        color: "#22c55e",
        weight: 2,
        fillColor: "#4ade80",
        fillOpacity: 0.9,
      })
        .addTo(layer)
        .bindPopup(t("track_current_position"));
    }

    const bounds: L.LatLngExpression[] =
      latlngs.length > 0
        ? latlngs
        : currentLat != null && currentLon != null
          ? [[currentLat, currentLon]]
          : [];
    if (bounds.length > 0) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [24, 24], maxZoom: 16 });
    } else {
      map.setView([51.1657, 10.4515], 5);
    }
  }, [filteredPoints, hasNumericSpeed, currentLat, currentLon, t]);

  const exportBlocked = privacy;

  const downloadBlob = (content: string, mime: string, filename: string) => {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportGpx = () => {
    if (exportBlocked || filteredPoints.length === 0) return;
    downloadBlob(
      toGpx(filteredPoints, deviceName),
      "application/gpx+xml",
      `${sanitizeFilename(deviceName)}-${new Date().toISOString().slice(0, 10)}.gpx`
    );
  };

  const exportGeoJson = () => {
    if (exportBlocked || filteredPoints.length === 0) return;
    downloadBlob(
      toGeoJson(filteredPoints, deviceName),
      "application/geo+json",
      `${sanitizeFilename(deviceName)}-${new Date().toISOString().slice(0, 10)}.geojson`
    );
  };

  const clearRecorded = () => {
    saveRecorded(deviceId, []);
    setRecordedPoints([]);
    setRecording(false);
  };

  const navLat = currentLat ?? filteredPoints[filteredPoints.length - 1]?.lat;
  const navLon = currentLon ?? filteredPoints[filteredPoints.length - 1]?.lon;
  const canNavigate = navLat != null && navLon != null;

  const applyPresetToCustom = () => {
    const end = new Date();
    const start = new Date(end.getTime() - hours * 3600 * 1000);
    setCustomFrom(formatDatetimeLocal(start));
    setCustomTo(formatDatetimeLocal(end));
  };

  const mapHeightClass = fullscreen
    ? "min-h-[min(85vh,calc(100vh-8rem))] flex-1 w-full"
    : "h-56 sm:h-72 w-full";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[11px] text-[var(--color-muted)]">
          <span>{t("track_history_range")}</span>
          <select
            value={rangeMode}
            onChange={(e) => {
              const m = e.target.value as RangeMode;
              setRangeMode(m);
              if (m === "custom") applyPresetToCustom();
            }}
            className="rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1 text-[var(--color-text)]"
          >
            <option value="preset">{t("track_range_preset")}</option>
            <option value="custom">{t("track_range_custom")}</option>
          </select>
        </label>

        {rangeMode === "preset" ? (
          <label className="flex items-center gap-1.5 text-[11px] text-[var(--color-muted)]">
            <select
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1 text-[var(--color-text)]"
            >
              {HOUR_OPTIONS.map((h) => (
                <option key={h} value={h}>
                  {t("track_range_hours", { hours: h })}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--color-muted)]">
            <span>{t("track_from")}</span>
            <input
              type="datetime-local"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1 text-[var(--color-text)]"
            />
            <span>{t("track_to")}</span>
            <input
              type="datetime-local"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1 text-[var(--color-text)]"
            />
          </div>
        )}

        <label className="flex items-center gap-1 text-[11px] text-[var(--color-muted)]">
          <span>{t("track_min_speed")}</span>
          <input
            type="number"
            min={0}
            max={200}
            step={1}
            value={minSpeedKmh}
            onChange={(e) => setMinSpeedKmh(Math.max(0, Number(e.target.value) || 0))}
            className="w-14 rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] px-1.5 py-1 text-[var(--color-text)]"
          />
        </label>

        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-[var(--color-muted)]">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            disabled={!online}
            className="rounded border-[var(--color-line)]"
          />
          {t("track_auto_refresh")}
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setRecording((r) => !r)}
          disabled={currentLat == null || currentLon == null}
          className="text-[11px] px-2 py-1 rounded-lg border border-[var(--color-line)] text-[var(--color-muted)] hover:bg-[var(--color-panel-2)] disabled:opacity-40"
        >
          {recording ? t("track_recording_stop") : t("track_recording_start")}
        </button>
        <button
          type="button"
          onClick={clearRecorded}
          className="text-[11px] px-2 py-1 rounded-lg border border-[var(--color-line)] text-[var(--color-muted)] hover:bg-[var(--color-panel-2)]"
        >
          {t("track_clear_local")}
        </button>
        <button
          type="button"
          onClick={exportGpx}
          disabled={filteredPoints.length === 0 || exportBlocked}
          title={exportBlocked ? t("track_export_privacy") : undefined}
          className="text-[11px] px-2 py-1 rounded-lg border border-[var(--color-line)] text-[var(--color-muted)] hover:bg-[var(--color-panel-2)] disabled:opacity-40"
        >
          {t("track_export_gpx")}
        </button>
        <button
          type="button"
          onClick={exportGeoJson}
          disabled={filteredPoints.length === 0 || exportBlocked}
          title={exportBlocked ? t("track_export_privacy") : undefined}
          className="text-[11px] px-2 py-1 rounded-lg border border-[var(--color-line)] text-[var(--color-muted)] hover:bg-[var(--color-panel-2)] disabled:opacity-40"
        >
          {t("track_export_geojson")}
        </button>
      </div>

      {hasNumericSpeed && (
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-[var(--color-muted)]">
          <span>{t("track_speed_legend")}</span>
          <span>
            <span className="inline-block h-2 w-4 rounded-sm bg-slate-500 align-middle" />{" "}
            &lt;5
          </span>
          <span>
            <span className="inline-block h-2 w-4 rounded-sm bg-green-500 align-middle" />{" "}
            5–40
          </span>
          <span>
            <span className="inline-block h-2 w-4 rounded-sm bg-yellow-500 align-middle" />{" "}
            40–90
          </span>
          <span>
            <span className="inline-block h-2 w-4 rounded-sm bg-red-500 align-middle" />{" "}
            90+
          </span>
        </div>
      )}

      <div className="text-[11px] text-[var(--color-muted)] flex flex-wrap gap-x-3 gap-y-1">
        <span>
          {loading ? t("load") : `${t("track_points")}: ${filteredPoints.length}`}
          {minSpeedKmh > 0 && displayPoints.length !== filteredPoints.length && (
            <span>
              {" "}
              ({t("track_points_filtered", { n: displayPoints.length })})
            </span>
          )}
          {recordedPoints.length > 0 && (
            <span className="text-green-400/90">
              {" "}
              ({t("track_local_saved")}: {recordedPoints.length})
            </span>
          )}
        </span>
        {loadErr && <span className="text-amber-400/90">{loadErr}</span>}
        {exportBlocked && (
          <span className="text-amber-400/90">{t("track_export_privacy")}</span>
        )}
      </div>

      <div
        className={
          fullscreen
            ? "fixed inset-4 z-[200] flex flex-col gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-bg)] p-3 shadow-2xl"
            : "flex flex-col gap-2"
        }
      >
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setFullscreen((f) => !f)}
            className="text-[11px] px-2 py-1 rounded-lg border border-[var(--color-line)] text-[var(--color-muted)] hover:bg-[var(--color-panel-2)]"
          >
            {fullscreen ? t("track_exit_fullscreen") : t("track_fullscreen")}
          </button>
        </div>
        <div
          ref={mapEl}
          className={`overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-panel-2)] ${mapHeightClass}`}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {canNavigate && (
          <>
            <a
              href={buildGoogleMapsDirectionsUrl(navLat, navLon)}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] px-2 py-1 rounded-lg border border-[var(--color-line)] text-[var(--color-muted)] hover:bg-[var(--color-panel-2)]"
            >
              {t("track_nav_google")}
            </a>
            <a
              href={buildAppleMapsDirectionsUrl(navLat, navLon)}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] px-2 py-1 rounded-lg border border-[var(--color-line)] text-[var(--color-muted)] hover:bg-[var(--color-panel-2)]"
            >
              {t("track_nav_apple")}
            </a>
          </>
        )}
        {navLat != null && navLon != null && (
          <>
            <a
              href={buildOpenStreetMapUrl(navLat, navLon)}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] px-2 py-1 rounded-lg border border-[var(--color-line)] text-[var(--color-muted)] hover:bg-[var(--color-panel-2)]"
            >
              {t("map_osm")}
            </a>
            <a
              href={buildGoogleMapsUrl(navLat, navLon)}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] px-2 py-1 rounded-lg border border-[var(--color-line)] text-[var(--color-muted)] hover:bg-[var(--color-panel-2)]"
            >
              {t("map_google")}
            </a>
          </>
        )}
      </div>

      {canNavigate && (
        <div className="text-[10px] text-[var(--color-muted)]">
          {t("track_nav_hint")}{" "}
          <Redacted value={`${navLat.toFixed(5)}, ${navLon.toFixed(5)}`} />
        </div>
      )}
    </div>
  );
};
