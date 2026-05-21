/**
 * Sprint 53 — GitHub Releases API helper.
 *
 * Sprint 55: Repo public yapıldı — PAT gerekli değil. Unauth GitHub API
 * çağrısı yeterli. Token desteklemeye devam ediyor (yüksek rate limit
 * isterse kullanıcı PAT verebilir) ama opsiyonel.
 */

const RELEASES_LATEST_URL =
	"https://api.github.com/repos/Fanthall/kick-chat-view/releases/latest";

export interface LatestReleaseInfo {
	tag: string; // "v4.6.3"
	version: string; // "4.6.3"
	name: string;
	htmlUrl: string;
	publishedAt: string;
	body?: string;
}

const stripV = (s: string): string =>
	s && s.startsWith("v") ? s.slice(1) : s;

export const fetchLatestRelease = async (
	tokenOverride?: string
): Promise<LatestReleaseInfo | null> => {
	// Sprint 55: repo public — token opsiyonel. Yine de verirse Authorization
	// gönder (rate limit anauth 60/saat vs auth 5000/saat).
	const token =
		tokenOverride ||
		(typeof process !== "undefined" && process.env && process.env.KICK_GH_TOKEN) ||
		undefined;
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
		"User-Agent": "KickChatView-Updater",
	};
	if (token) headers.Authorization = `Bearer ${token}`;
	try {
		const res = await fetch(RELEASES_LATEST_URL, { headers });
		if (!res.ok) {
			return null;
		}
		const json: any = await res.json();
		const tag: string = json?.tag_name || "";
		if (!tag) return null;
		return {
			tag,
			version: stripV(tag),
			name: json?.name || tag,
			htmlUrl: json?.html_url || "",
			publishedAt: json?.published_at || "",
			body: typeof json?.body === "string" ? json.body : undefined,
		};
	} catch {
		return null;
	}
};

/**
 * Semver-ish karşılaştırma. "4.6.3" > "4.6.2" → 1, eşit → 0, küçük → -1.
 * Non-numeric segmentler 0 sayılır.
 */
export const compareVersions = (a: string, b: string): number => {
	const pa = stripV(a).split(".").map((s) => parseInt(s, 10) || 0);
	const pb = stripV(b).split(".").map((s) => parseInt(s, 10) || 0);
	const len = Math.max(pa.length, pb.length);
	for (let i = 0; i < len; i++) {
		const x = pa[i] ?? 0;
		const y = pb[i] ?? 0;
		if (x > y) return 1;
		if (x < y) return -1;
	}
	return 0;
};
