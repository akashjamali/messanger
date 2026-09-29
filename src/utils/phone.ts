/**
 * Universal Phone Number & Chat ID Normalizer
 * Enforces single source of truth for thread IDs, routing, and message grouping.
 * Standardizes all mobile formats (+92, 92, 0092, +920, 03XX) strictly to local '03XXXXXXXXX' format.
 */

export const generateNormalizedChatId = (rawNumber: string): string => {
  if (!rawNumber) return "unknown";

  const trimmed = String(rawNumber).trim();
  // Strip formatting spaces, dashes, parentheses, dots
  const cleaned = trimmed.replace(/[\s\-().]/g, "");

  // Non-phone textual senders (e.g., "Jazz", "BankAlert", "INFO", "8558")
  if (/[a-zA-Z]/.test(cleaned) && !cleaned.startsWith("+")) {
    return cleaned;
  }

  // Pure digits extraction
  const digits = cleaned.replace(/\D/g, "");

  // Pakistani mobile numbers have 10 subscriber digits (e.g. 300XXXXXXX)
  if (digits.length >= 10) {
    const core10 = digits.slice(-10);
    return "0" + core10;
  }

  // Fallback for edge formats
  if (cleaned.startsWith("+920")) {
    return "0" + cleaned.substring(4);
  }
  if (cleaned.startsWith("+92")) {
    return "0" + cleaned.substring(3);
  }
  if (cleaned.startsWith("0092")) {
    return "0" + cleaned.substring(4);
  }
  if (cleaned.startsWith("92") && cleaned.length >= 11) {
    return "0" + cleaned.substring(2);
  }

  return cleaned || "unknown";
};

export const generateChatId = generateNormalizedChatId;
