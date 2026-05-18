const HTML_ESCAPE_MAP: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
	"`": "&#96;",
	"=": "&#61;",
};

export const escapeHtml = (value: unknown): string => {
	if (value === null || value === undefined) return "";
	return String(value).replace(/[&<>"'`=]/g, (ch) => HTML_ESCAPE_MAP[ch]);
};

const SAFE_NAMED_COLORS = new Set([
	"white",
	"black",
	"gray",
	"grey",
	"red",
	"green",
	"blue",
	"yellow",
	"orange",
	"purple",
	"pink",
	"cyan",
	"magenta",
	"transparent",
	"inherit",
	"currentcolor",
]);

export const safeColor = (value: unknown, fallback = "white"): string => {
	if (typeof value !== "string") return fallback;
	const trimmed = value.trim();
	if (!trimmed) return fallback;
	if (SAFE_NAMED_COLORS.has(trimmed.toLowerCase())) return trimmed;
	if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) return trimmed;
	if (/^rgba?\(\s*[\d.\s,%]+\)$/.test(trimmed)) return trimmed;
	if (/^hsla?\(\s*[\d.\s,%]+\)$/.test(trimmed)) return trimmed;
	return fallback;
};

export const safeUrl = (value: unknown): string => {
	if (typeof value !== "string") return "";
	const trimmed = value.trim();
	if (!trimmed) return "";
	if (/^(https?:|data:image\/)/i.test(trimmed)) return escapeHtml(trimmed);
	return "";
};
