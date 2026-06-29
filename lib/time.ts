import { z } from "zod";

export const NEPAL_TIME_ZONE = "Asia/Kathmandu";
const localDateTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

export function parseNepalDateTimeInput(value: string) {
  const parsed = localDateTimeSchema.parse(value);
  return new Date(`${parsed}:00+05:45`).toISOString();
}

export function toNepalDateTimeLocalValue(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: NEPAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });

  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  if (!values.year || !values.month || !values.day || !values.hour || !values.minute) {
    return "";
  }

  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

export function formatNepalDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-NP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: NEPAL_TIME_ZONE
  }).format(new Date(iso));
}
