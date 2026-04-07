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
  const scaled = (fraction * BigInt(10) ** BigInt(precision)) / basePower;
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
  return formatUnit(rawValue, BigInt(10) ** BigInt(18), precision, "ETH");
}

export function formatWeiToGwei(rawValue: string | null | undefined, precision = 2) {
  return formatUnit(rawValue, BigInt(10) ** BigInt(9), precision, "Gwei");
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
      return "bg-[#f6d6d2] text-[#8f342b] border-[#e8b2ab]";
    case "medium":
      return "bg-[#f4ead0] text-[#8a6732] border-[#e6d3a2]";
    case "low":
      return "bg-[#e0edd8] text-[#2b6631] border-[#bed7b6]";
    default:
      return "bg-[#eef1ea] text-[#4d5a50] border-[#dbe3d8]";
  }
}

export function entityTone(entityType: string | null | undefined) {
  switch ((entityType || "").toLowerCase()) {
    case "exchange":
      return "bg-[#dceff0] text-[#1f6171] border-[#b8dfe1]";
    case "stablecoin":
      return "bg-[#ebe4f6] text-[#5d4c81] border-[#d7c5eb]";
    case "mixer":
      return "bg-[#f5d9d7] text-[#933f34] border-[#e9b8b3]";
    case "contract":
      return "bg-[#e4e8f5] text-[#46537d] border-[#cad3ed]";
    default:
      return "bg-[#eef1ea] text-[#4d5a50] border-[#dbe3d8]";
  }
}

export function caseStatusTone(status: string | null | undefined) {
  switch ((status || "").toLowerCase()) {
    case "monitoring":
      return "bg-[#dceff0] text-[#1f6171] border-[#b8dfe1]";
    case "escalated":
      return "bg-[#f5d9d7] text-[#933f34] border-[#e9b8b3]";
    case "closed":
      return "bg-[#e0edd8] text-[#2b6631] border-[#bed7b6]";
    default:
      return "bg-[#f4ead0] text-[#8a6732] border-[#e6d3a2]";
  }
}

export function priorityTone(priority: string | null | undefined) {
  switch ((priority || "").toLowerCase()) {
    case "critical":
      return "bg-[#f5d9d7] text-[#933f34] border-[#e9b8b3]";
    case "high":
      return "bg-[#f4ead0] text-[#8a6732] border-[#e6d3a2]";
    case "low":
      return "bg-[#e0edd8] text-[#2b6631] border-[#bed7b6]";
    default:
      return "bg-[#dceff0] text-[#1f6171] border-[#b8dfe1]";
  }
}

export function triageTone(status: string | null | undefined) {
  switch ((status || "").toLowerCase()) {
    case "escalated":
      return "bg-[#f5d9d7] text-[#933f34] border-[#e9b8b3]";
    case "dismissed":
      return "bg-[#eef1ea] text-[#4d5a50] border-[#dbe3d8]";
    case "resolved":
      return "bg-[#e0edd8] text-[#2b6631] border-[#bed7b6]";
    case "reviewing":
      return "bg-[#dceff0] text-[#1f6171] border-[#b8dfe1]";
    default:
      return "bg-[#f4ead0] text-[#8a6732] border-[#e6d3a2]";
  }
}
