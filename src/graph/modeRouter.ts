import type { Mode } from "../types.js";

const CASUAL_PATTERN = /^(hi|hello|hey|thanks|thank you)\b/i;
const SIMPLE_PATTERN = /(time|date|version|status|list|show)/i;

export function routeMode(request: string): Mode {
  const trimmed = request.trim();

  if (!trimmed) {
    return "minimal";
  }

  if (CASUAL_PATTERN.test(trimmed)) {
    return "minimal";
  }

  if (trimmed.length < 120 && SIMPLE_PATTERN.test(trimmed)) {
    return "native";
  }

  return "algorithm";
}
