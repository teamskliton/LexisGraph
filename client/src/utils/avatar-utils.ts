/**
 * Natural Avatar Utilities — Gmail / Google Workspace Style
 * 
 * Provides deterministic natural solid colors and initials extraction
 * matching Gmail / Google Workspace default avatars (solid color + white text),
 * without any artificial AI gradients.
 */

// Curated Google Material palette used by Gmail and Google Workspace
export const GMAIL_AVATAR_PALETTE = [
  "#7E57C2", // Purple (Material 500 - classic Gmail purple)
  "#1E88E5", // Blue (Material 600)
  "#00897B", // Teal (Material 600)
  "#2E7D32", // Green (Material 800)
  "#FB8C00", // Amber / Warm Orange (Material 600)
  "#E53935", // Red / Crimson (Material 600)
  "#5E35B1", // Deep Purple (Material 600)
  "#00838F", // Deep Cyan (Material 800)
  "#D81B60", // Pink / Rose (Material 600)
  "#3949AB", // Indigo (Material 600)
  "#E64A19", // Deep Orange / Rust (Material 700)
  "#5D4037", // Warm Brown (Material 700)
] as const;

/**
 * Deterministically maps any seed string (name, email, or ID)
 * to a stable, solid natural color from the Gmail palette.
 */
export function getNaturalAvatarColor(seed: string = ""): string {
  const clean = seed.trim().toLowerCase();
  if (!clean) return GMAIL_AVATAR_PALETTE[0];

  // FNV-1a hash algorithm for uniform distribution
  let hash = 2166136261;
  for (let i = 0; i < clean.length; i++) {
    hash ^= clean.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  const index = Math.abs(hash) % GMAIL_AVATAR_PALETTE.length;
  return GMAIL_AVATAR_PALETTE[index];
}

/**
 * Extracts clean uppercase initials from a name or email.
 * - For users (Gmail style): typically 1 letter (e.g. "Shrimant" -> "S")
 * - For orgs / teams: 1-2 letters (e.g. "LexisGraph" -> "LG" or "L")
 */
export function getAvatarInitials(nameOrEmail?: string, maxChars: number = 1): string {
  if (!nameOrEmail) return "?";
  const trimmed = nameOrEmail.trim();
  if (!trimmed) return "?";

  // If email, use username part before @
  const clean = trimmed.includes("@") ? trimmed.split("@")[0] : trimmed;

  // Split on whitespace or common separators
  const words = clean.split(/[\s_\-.]+/).filter(Boolean);

  if (words.length >= 2 && maxChars >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  if (words.length >= 1) {
    if (maxChars === 1) {
      return words[0][0].toUpperCase();
    }
    return words[0].slice(0, Math.min(maxChars, words[0].length)).toUpperCase();
  }

  return clean.slice(0, maxChars).toUpperCase();
}

/**
 * Checks if a string looks like a valid image URL or data URI.
 */
export function isValidImageUrl(url?: string | null): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (trimmed.length === 0) return false;
  return (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:image/") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("./")
  );
}
