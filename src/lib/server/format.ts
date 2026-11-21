import { DateTime } from "luxon";

const at = (iso: string, zone: string) => DateTime.fromISO(iso).setZone(zone);

export const clock = (iso: string, zone: string) =>
  at(iso, zone).toFormat("h:mm a");
export const zoneLabel = (zone: string) => zone.replaceAll("_", " ");
// datetime-local inputs take wall-clock time without a zone.
export const localInput = (iso: string, zone: string) =>
  at(iso, zone).toFormat("yyyy-MM-dd'T'HH:mm");

export function dayLabel(iso: string, zone: string) {
  const day = at(iso, zone);
  const now = DateTime.now().setZone(zone);
  return day.hasSame(now, "day")
    ? "Today"
    : day.hasSame(now.plus({ days: 1 }), "day")
      ? "Tomorrow"
      : day.toFormat("cccc");
}
export function groupByDay<T extends { startsAt: string }>(
  items: T[],
  zone: string,
) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = at(item.startsAt, zone).toISODate()!;
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return [...groups].map(([date, plans]) => ({
    label: dayLabel(plans[0].startsAt, zone),
    date: DateTime.fromISO(date).toFormat("ccc, LLL d"),
    plans,
  }));
}
export const format = (iso: string, zone: string, pattern: string) =>
  at(iso, zone).toFormat(pattern);
