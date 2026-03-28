import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAddress(address: string, width = 6) {
  if (!address) {
    return "Unknown";
  }
  if (address.length <= width * 2 + 2) {
    return address;
  }
  return `${address.slice(0, width + 2)}…${address.slice(-width)}`;
}

export function formatCount(value: number | bigint | null | undefined) {
  if (value === null || value === undefined) {
    return "0";
  }
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(typeof value === "bigint" ? Number(value) : value);
}

export function formatPercent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "0%";
  }
  return `${value.toFixed(digits)}%`;
}

export function formatSimilarity(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "0%";
  }
  return `${(value * 100).toFixed(1)}%`;
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) {
    return "Unavailable";
  }
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return "Unavailable";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    hour12: false,
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
    year: "numeric",
  }).format(date);
}

function formatUnit(
  rawValue: string | null | undefined,
  basePower: bigint,
  precision: number,
  suffix: string,
) {
  if (!rawValue) {
    return `0 ${suffix}`;
  }

  if (!/^-?\d+$/.test(rawValue)) {
    return rawValue;
  }

  const negative = rawValue.startsWith("-");
  const value = BigInt(negative ? rawValue.slice(1) : rawValue);
  const whole = value / basePower;
  const fraction = value % basePower;
  const scaled = (fraction * 10n ** BigInt(precision)) / basePower;
  const fractionText = scaled
    .toString()
    .padStart(precision, "0")
    .replace(/0+$/, "");

  const formatted = fractionText
    ? `${whole.toString()}.${fractionText}`
    : whole.toString();

  return `${negative ? "-" : ""}${formatted} ${suffix}`;
}

export function formatWeiToEth(rawValue: string | null | undefined, precision = 4) {
  return formatUnit(rawValue, 10n ** 18n, precision, "ETH");
}

export function formatWeiToGwei(rawValue: string | null | undefined, precision = 2) {
  return formatUnit(rawValue, 10n ** 9n, precision, "Gwei");
}

export function riskLabel(level: string | null | undefined) {
  if (!level) {
    return "unknown";
  }
  return level.toLowerCase();
}

export function riskTone(level: string | null | undefined) {
  switch (riskLabel(level)) {
    case "high":
      return "bg-rose-500/15 text-rose-200 border-rose-400/35";
    case "medium":
      return "bg-amber-500/15 text-amber-100 border-amber-400/35";
    case "low":
      return "bg-emerald-500/15 text-emerald-100 border-emerald-400/35";
    default:
      return "bg-slate-500/15 text-slate-200 border-slate-400/25";
  }
}

export function entityTone(entityType: string | null | undefined) {
  switch ((entityType || "").toLowerCase()) {
    case "exchange":
      return "bg-cyan-500/15 text-cyan-100 border-cyan-400/30";
    case "stablecoin":
      return "bg-violet-500/15 text-violet-100 border-violet-400/30";
    case "mixer":
      return "bg-rose-500/15 text-rose-100 border-rose-400/30";
    case "contract":
      return "bg-indigo-500/15 text-indigo-100 border-indigo-400/30";
    default:
      return "bg-slate-500/15 text-slate-100 border-slate-400/20";
  }
}
