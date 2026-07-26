/**
 * Sprint 61 — Bahis oyunu komut ayrıştırma.
 *
 * Saf fonksiyonlar: chat mesajı metninden komut ve bahis miktarı çıkarır.
 * Motor (gameEngine) yalnız burada üretilen sonucu uygular.
 *
 * Komut adları ve prefix ayarlardan değiştirilebilir; bu dosya varsayılanları
 * ve eşleştirme mantığını tutar.
 *
 * Türkçe not: komut eşleştirmesi diakritik-duyarsızdır ("SIRALAMA", "sıralama",
 * "siralama" hepsi eşleşir). Türkçe'de "I".toLowerCase() ile "İ".toLowerCase()
 * farklı sonuç verdiği için düz toLowerCase() yetmez — foldCommand() kullanılır.
 */

export type GameCommandKind =
	| "join"
	| "bet"
	| "balance"
	| "top"
	| "help"
	| "reset";

/** Yalnız yayıncı/moderatör çalıştırabilen komutlar. */
export const PRIVILEGED_COMMANDS: GameCommandKind[] = ["reset"];

export interface GameCommandSpec {
	enabled: boolean;
	/** İlk isim "birincil" kabul edilir (yardım metninde o gösterilir). */
	names: string[];
}

export interface GameCommandConfig {
	prefix: string;
	commands: Record<GameCommandKind, GameCommandSpec>;
}

export const DEFAULT_COMMANDS: GameCommandConfig = {
	prefix: "!",
	commands: {
		join: { enabled: true, names: ["joingame", "katıl"] },
		bet: { enabled: true, names: ["bahis", "bet"] },
		balance: { enabled: true, names: ["puan", "bakiye"] },
		top: { enabled: true, names: ["top", "sıralama"] },
		help: { enabled: true, names: ["oyun"] },
		reset: { enabled: true, names: ["reset", "sıfırla"] },
	},
};

/**
 * Komut eşleştirme için normalizasyon: küçük harf + Türkçe diakritiklerin
 * ASCII karşılığı. "BAHİS" → "bahis", "Sıralama" → "siralama".
 */
export const foldCommand = (input: string): string =>
	input
		.replace(/İ/g, "i")
		.replace(/I/g, "i")
		.replace(/ı/g, "i")
		.toLowerCase()
		// toLowerCase("İ") bazı ortamlarda "i" + U+0307 üretir; birleşik noktayı at.
		.replace(/̇/g, "")
		.replace(/ş/g, "s")
		.replace(/ğ/g, "g")
		.replace(/ü/g, "u")
		.replace(/ö/g, "o")
		.replace(/ç/g, "c");

// ─── Bahis miktarı ───────────────────────────────────────────────────────────

export type BetAmountSpec =
	| { kind: "absolute"; value: number }
	| { kind: "percent"; percent: number }
	| { kind: "invalid" };

const HALF_WORDS = ["yarisi", "yari", "half"];
const ALL_WORDS = ["hepsi", "allin", "all", "tumu", "tamami", "hepsini"];

/**
 * Kabul edilen biçimler:
 *   500 · 1k · 2.5k · 1.000 (binlik nokta) · 1,5k · %50 · 50% · yarısı · hepsi
 */
export const parseBetAmount = (raw: string): BetAmountSpec => {
	const token = foldCommand(raw.trim());
	if (!token) return { kind: "invalid" };

	if (ALL_WORDS.includes(token)) return { kind: "percent", percent: 100 };
	if (HALF_WORDS.includes(token)) return { kind: "percent", percent: 50 };

	// %50 veya 50%
	const percentMatch = token.match(/^%(\d{1,3})$|^(\d{1,3})%$/);
	if (percentMatch) {
		const value = Number(percentMatch[1] ?? percentMatch[2]);
		if (!Number.isFinite(value) || value <= 0 || value > 100) {
			return { kind: "invalid" };
		}
		return { kind: "percent", percent: value };
	}

	// Binlik ayırıcı olarak nokta: 1.000 / 12.500 (ondalık DEĞİL)
	let numeric = token;
	if (/^\d{1,3}(\.\d{3})+$/.test(numeric)) {
		numeric = numeric.replace(/\./g, "");
	}
	// Ondalık virgülü noktaya çevir: 2,5k → 2.5k
	numeric = numeric.replace(",", ".");

	const suffixMatch = numeric.match(/^(\d+(?:\.\d+)?)(k|m)?$/);
	if (!suffixMatch) return { kind: "invalid" };

	const base = Number(suffixMatch[1]);
	if (!Number.isFinite(base) || base <= 0) return { kind: "invalid" };

	const multiplier = suffixMatch[2] === "m" ? 1_000_000 : suffixMatch[2] === "k" ? 1000 : 1;
	const value = Math.floor(base * multiplier);
	if (value <= 0) return { kind: "invalid" };

	return { kind: "absolute", value };
};

/** Miktar spesifikasyonunu bakiyeye göre somut puana çevirir. */
export const resolveBetAmount = (spec: BetAmountSpec, balance: number): number => {
	if (spec.kind === "absolute") return spec.value;
	if (spec.kind === "percent") {
		return Math.floor((Math.max(0, balance) * spec.percent) / 100);
	}
	return 0;
};

// ─── Komut ayrıştırma ────────────────────────────────────────────────────────

export interface ParsedGameCommand {
	kind: GameCommandKind;
	/** Komuttan sonraki ham argüman metni (boş olabilir). */
	args: string;
	/** kind === "bet" ise ayrıştırılmış miktar; argüman yoksa "invalid". */
	amount?: BetAmountSpec;
}

/**
 * Chat mesajını komuta çevirir. Komut değilse / kapalıysa / bilinmiyorsa
 * `undefined` döner — motor bu durumda hiçbir şey yapmaz (sessiz).
 */
export const parseGameCommand = (
	content: string,
	config: GameCommandConfig
): ParsedGameCommand | undefined => {
	const trimmed = content.trim();
	const prefix = config.prefix || "!";
	if (!trimmed.startsWith(prefix)) return undefined;

	const body = trimmed.slice(prefix.length).trim();
	if (!body) return undefined;

	const spaceIndex = body.search(/\s/);
	const head = spaceIndex === -1 ? body : body.slice(0, spaceIndex);
	const args = spaceIndex === -1 ? "" : body.slice(spaceIndex + 1).trim();
	const folded = foldCommand(head);
	if (!folded) return undefined;

	const kinds: GameCommandKind[] = [
		"join",
		"bet",
		"balance",
		"top",
		"help",
		"reset",
	];
	for (const kind of kinds) {
		const spec = config.commands[kind];
		if (!spec || !spec.enabled) continue;
		const match = spec.names.some(
			(name) => name.trim() && foldCommand(name.trim()) === folded
		);
		if (!match) continue;

		if (kind === "bet") {
			const firstArg = args.split(/\s+/)[0] || "";
			return {
				kind,
				args,
				amount: firstArg ? parseBetAmount(firstArg) : { kind: "invalid" },
			};
		}
		return { kind, args };
	}

	return undefined;
};

/** Yardım metninde gösterilecek birincil komut adı. */
export const primaryCommandName = (
	config: GameCommandConfig,
	kind: GameCommandKind
): string => `${config.prefix}${config.commands[kind]?.names[0] || ""}`;
