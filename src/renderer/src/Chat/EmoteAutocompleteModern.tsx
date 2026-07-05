/**
 * Sprint 3 — EmoteAutocompleteModern
 *
 * Modern autocomplete dropdown that mirrors Designs/chat.jsx > autocomplete.
 * Uses existing searchEmotes results (EmoteSearchResult) passed from ChatModern.
 *
 * Provider badge map:
 *   kick-channel / kick-subscriber / kick-global → "Kick"
 *   seventv-channel / seventv-global / seventv-personal → "7TV"
 *   bttv-* → "BTTV"
 *   ffz-* → "FFZ"
 *
 * CONSTRAINT-5: Kick precedence is already enforced by searchEmotes; this
 * component only renders the sorted results it receives.
 */

import React, { FunctionComponent } from "react";
import { EmoteEntry, EmoteProvider, PROVIDER_LABEL } from "../../constants/emote";
import { useTranslation } from "../../util/i18n";

// ────────── Provider badge helpers ──────────

type ProviderGroup = "kick" | "seventv" | "bttv" | "ffz" | "other";

function providerGroup(provider: EmoteProvider): ProviderGroup {
	if (provider.startsWith("kick")) return "kick";
	if (provider.startsWith("seventv")) return "seventv";
	if (provider.startsWith("bttv")) return "bttv";
	if (provider.startsWith("ffz")) return "ffz";
	return "other";
}

const PROVIDER_BADGE_LABEL: Record<ProviderGroup, string> = {
	kick: "Kick",
	seventv: "7TV",
	bttv: "BTTV",
	ffz: "FFZ",
	other: "?",
};

const PROVIDER_BADGE_STYLE: Record<ProviderGroup, React.CSSProperties> = {
	kick: { background: "color-mix(in oklch, #53fc18 18%, transparent)", color: "#53fc18" },
	seventv: { background: "color-mix(in oklch, #9147ff 18%, transparent)", color: "#a97cfc" },
	bttv: { background: "color-mix(in oklch, #d4a851 18%, transparent)", color: "#d4a851" },
	ffz: { background: "color-mix(in oklch, #3aa3e0 18%, transparent)", color: "#3aa3e0" },
	other: { background: "var(--ms-bg-2)", color: "var(--ms-fg-3)" },
};

interface ProviderPillProps {
	provider: EmoteProvider;
}

const ProviderPill: FunctionComponent<ProviderPillProps> = ({ provider }) => {
	const group = providerGroup(provider);
	return (
		<span
			className="ac-pbadge"
			style={{
				...PROVIDER_BADGE_STYLE[group],
				fontSize: 10,
				fontWeight: 600,
				padding: "1px 5px",
				borderRadius: 4,
				letterSpacing: "0.03em",
				textTransform: "uppercase" as const,
				display: "inline-block",
			}}
		>
			{PROVIDER_BADGE_LABEL[group]}
		</span>
	);
};

// ────────── Props ──────────

export interface EmoteAutocompleteEntry {
	id: string;
	name: string;
	provider: EmoteProvider;
	animated: boolean;
	zeroWidth: boolean;
	subscribersOnly?: boolean;
	urls: { "1x": string; "2x"?: string };
	insertText: string;
}

interface EmoteAutocompleteModernProps {
	suggestions: EmoteAutocompleteEntry[];
	activeIndex: number;
	onPick: (entry: EmoteAutocompleteEntry) => void;
	onHover?: (index: number) => void;
}

const EmoteAutocompleteModern: FunctionComponent<EmoteAutocompleteModernProps> = ({
	suggestions,
	activeIndex,
	onPick,
	onHover,
}) => {
	const { t } = useTranslation();
	if (!suggestions.length) return null;

	return (
		<div
			className="autocomplete scroll"
			role="listbox"
			aria-label={t("emotepicker.aria.suggestions")}
			style={{
				position: "absolute",
				bottom: "100%",
				left: 0,
				right: 0,
				zIndex: 100,
				maxHeight: 240,
				overflowY: "auto",
			}}
		>
			{suggestions.map((entry, i) => (
				<div
					key={`${entry.provider}:${entry.id}:${entry.name}`}
					role="option"
					aria-selected={i === activeIndex}
					className={`ac-row${i === activeIndex ? " is-active" : ""}`}
					onMouseEnter={() => onHover?.(i)}
					onMouseDown={(e) => {
						e.preventDefault();
						onPick(entry);
					}}
				>
					<div className="ac-emote">
						{entry.urls["1x"] ? (
							<img
								src={entry.urls["1x"]}
								alt={entry.name}
								width={20}
								height={20}
								loading="lazy"
								style={{ objectFit: "contain" }}
							/>
						) : (
							<span style={{ fontSize: 16 }}>{entry.name[0]}</span>
						)}
					</div>
					<div className="ac-name">{entry.name}</div>
					<div className="ac-tags">
						<ProviderPill provider={entry.provider} />
						{entry.animated && (
							<span
								className="ac-badge"
								style={{
									fontSize: 10,
									fontWeight: 600,
									padding: "1px 5px",
									borderRadius: 4,
									background: "color-mix(in oklch, var(--ms-ac-gift) 18%, transparent)",
									color: "var(--ms-ac-gift)",
									textTransform: "uppercase",
								}}
							>
								GIF
							</span>
						)}
						{entry.zeroWidth && (
							<span
								className="ac-badge"
								style={{
									fontSize: 10,
									fontWeight: 600,
									padding: "1px 5px",
									borderRadius: 4,
									background: "color-mix(in oklch, var(--ms-ac-mod) 18%, transparent)",
									color: "var(--ms-ac-mod)",
									textTransform: "uppercase",
								}}
							>
								ZW
							</span>
						)}
						{entry.subscribersOnly && (
							<span
								className="ac-badge"
								style={{
									fontSize: 10,
									fontWeight: 600,
									padding: "1px 5px",
									borderRadius: 4,
									background: "color-mix(in oklch, var(--ms-ac-sub) 18%, transparent)",
									color: "var(--ms-ac-sub)",
									textTransform: "uppercase",
								}}
							>
								SUB
							</span>
						)}
					</div>
				</div>
			))}
		</div>
	);
};

export default EmoteAutocompleteModern;
