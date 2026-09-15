import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

import type { Transaction, TxStatus } from "@/lib/types";

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

/** Compact count for tiles: 12.3K. */
export function formatCount(value: number | bigint | null | undefined) {
  if (value === null || value === undefined) {
    return "0";
  }
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(typeof value === "bigint" ? Number(value) : value);
}

/** Exact count with separators: 12,345. */
export function formatExact(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US").format(value ?? 0);
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
  if (Number.isNaN(date.getTime()) || date.getFullYear() < 2000) {
    return "Unavailable";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    hour12: false,
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
    year: "numeric",
  }).format(date);
}

/** "12 s ago", "5 min ago", "3 h ago". */
export function formatRelativeTime(value: string | Date | null | undefined, now = Date.now()) {
  if (!value) {
    return "never";
  }
  const time = (typeof value === "string" ? new Date(value) : value).getTime();
  if (Number.isNaN(time)) {
    return "never";
  }
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 60) return `${seconds} s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function formatUnit(rawValue: string | null | undefined, basePower: bigint, precision: number, suffix: string) {
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
  const fractionText = scaled.toString().padStart(precision, "0").replace(/0+$/, "");
  const wholeText = new Intl.NumberFormat("en-US").format(whole);
  const formatted = fractionText ? `${wholeText}.${fractionText}` : wholeText;
  return `${negative ? "-" : ""}${formatted} ${suffix}`;
}

export function formatWeiToEth(rawValue: string | null | undefined, precision = 4) {
  return formatUnit(rawValue, BigInt(10) ** BigInt(18), precision, "ETH");
}

export function formatWeiToGwei(rawValue: string | null | undefined, precision = 2) {
  return formatUnit(rawValue, BigInt(10) ** BigInt(9), precision, "gwei");
}

/**
 * Token amounts are stored in base units. Decimals are not known for arbitrary
 * tokens, so show the raw integer compactly rather than guessing.
 */
export function formatBaseUnits(rawValue: string | null | undefined) {
  if (!rawValue || !/^\d+$/.test(rawValue)) {
    return rawValue || "0";
  }
  if (rawValue.length <= 15) {
    return `${new Intl.NumberFormat("en-US").format(BigInt(rawValue))} units`;
  }
  const exponent = rawValue.length - 1;
  return `${rawValue[0]}.${rawValue.slice(1, 4)}×10^${exponent} units`;
}

export function riskTone(level: string | null | undefined) {
  switch ((level || "").toLowerCase()) {
    case "high":
      return "bg-[#f6d6d2] text-[#8f342b] border-[#e8b2ab]";
    case "medium":
      return "bg-[#f4ead0] text-[#8a6732] border-[#e6d3a2]";
    case "low":
      return "bg-[#e7eedf] text-[#4c6a3a] border-[#cfdcc1]";
    default:
      return "bg-[#eef1ea] text-[#4d5a50] border-[#dbe3d8]";
  }
}

export function riskLabel(level: string | null | undefined) {
  const value = (level || "none").toLowerCase();
  return value === "none" ? "no risk signals" : `${value} risk`;
}

export function entityTone(entityType: string | null | undefined) {
  switch ((entityType || "").toLowerCase()) {
    case "exchange":
      return "bg-[#dceff0] text-[#1f6171] border-[#b8dfe1]";
    case "stablecoin":
    case "token":
      return "bg-[#ebe4f6] text-[#5d4c81] border-[#d7c5eb]";
    case "mixer":
    case "scam":
    case "sanctioned":
      return "bg-[#f5d9d7] text-[#933f34] border-[#e9b8b3]";
    case "contract":
      return "bg-[#e4e8f5] text-[#46537d] border-[#cad3ed]";
    default:
      return "bg-[#eef1ea] text-[#4d5a50] border-[#dbe3d8]";
  }
}

export function statusTone(status: TxStatus | string | null | undefined) {
  switch (status) {
    case "mined":
      return "bg-[#e0edd8] text-[#2b6631] border-[#bed7b6]";
    case "pending":
      return "bg-[#f4ead0] text-[#8a6732] border-[#e6d3a2]";
    case "replaced":
      return "bg-[#e4e8f5] text-[#46537d] border-[#cad3ed]";
    case "dropped":
      return "bg-[#f5d9d7] text-[#933f34] border-[#e9b8b3]";
    default:
      return "bg-[#eef1ea] text-[#4d5a50] border-[#dbe3d8]";
  }
}

export const STATUS_DESCRIPTIONS: Record<TxStatus, string> = {
  pending: "Seen in the node's mempool, not yet in a block.",
  mined: "Included in a block.",
  replaced: "Another transaction with the same sender and nonce was mined instead.",
  dropped: "Still not mined three hours after it was first seen.",
};

/**
 * What kind of transaction this is. List endpoints omit calldata, so a zero-value
 * transaction with a recipient is treated as a contract call.
 */
export function txKind(tx: Pick<Transaction, "to" | "value" | "created_contract" | "data">) {
  if (!tx.to) {
    return "Contract creation";
  }
  if (tx.data !== undefined) {
    return base64ByteLength(tx.data) > 0 ? "Contract call" : "ETH transfer";
  }
  return tx.value === "0" ? "Contract call" : "ETH transfer";
}

function base64ByteLength(data: string) {
  if (!data) return 0;
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return Math.floor((data.length * 3) / 4) - padding;
}

/** Decodes base64 calldata (Go's []byte JSON encoding) to 0x-prefixed hex. */
export function base64ToHex(data: string | undefined) {
  if (!data) {
    return "0x";
  }
  const binary = typeof atob === "function" ? atob(data) : Buffer.from(data, "base64").toString("binary");
  let hex = "0x";
  for (let i = 0; i < binary.length; i += 1) {
    hex += binary.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return hex;
}

// 4-byte selectors: first bytes of keccak256(signature). Verified with go-ethereum's keccak.
const KNOWN_SELECTORS: Record<string, string> = {
  a9059cbb: "transfer(address,uint256)",
  "095ea7b3": "approve(address,uint256)",
  "23b872dd": "transferFrom(address,address,uint256)",
  d0e30db0: "deposit()",
  "2e1a7d4d": "withdraw(uint256)",
  "7ff36ab5": "swapExactETHForTokens(uint256,address[],address,uint256)",
  "38ed1739": "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)",
  "18cbafe5": "swapExactTokensForETH(uint256,uint256,address[],address,uint256)",
  "3593564c": "execute(bytes,bytes[],uint256)",
  ac9650d8: "multicall(bytes[])",
  "5ae401dc": "multicall(uint256,bytes[])",
  "414bf389": "exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))",
};

export function decodeSelector(calldataHex: string) {
  if (calldataHex.length < 10) {
    return null;
  }
  const selector = calldataHex.slice(2, 10).toLowerCase();
  return { selector: `0x${selector}`, signature: KNOWN_SELECTORS[selector] ?? null };
}
