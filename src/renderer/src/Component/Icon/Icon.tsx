/**
 * Sprint 2 — Modern shell shared Icon component (Design v1 AD § Lucide mapping).
 *
 * Designs/components.jsx icindeki inline SVG'leri react-icons/lu Lucide setine
 * port eder. workspace soft-rule §13: ozel SVG yazma; react-icons kullan.
 *
 * Modern shell yalniz `[data-app-shell="modern"]` altinda kullanir; classic shell
 * mevcut react-icons/io5 ve react-icons/md kullanmaya devam eder (kirilma yok).
 */

import React from "react";
import {
	LuActivity,
	LuBan,
	LuBell,
	LuCheck,
	LuChevronDown,
	LuChevronRight,
	LuChevronUp,
	LuCoins,
	LuCrown,
	LuEye,
	LuEyeOff,
	LuExternalLink,
	LuGift,
	LuPenLine,
	LuInfo,
	LuMic,
	LuPin,
	LuPlus,
	LuRefreshCw,
	LuReply,
	LuSearch,
	LuSend,
	LuSettings,
	LuShield,
	LuSmile,
	LuStar,
	LuTerminal,
	LuTimer,
	LuTrash2,
	LuAlertTriangle,
	LuUser,
	LuX,
	LuZap,
	LuSparkles,
} from "react-icons/lu";

export type IconName =
	| "activity"
	| "ban"
	| "bell"
	| "bolt"
	| "check"
	| "chevd"
	| "chevu"
	| "chevron"
	| "code"
	| "coin"
	| "crown"
	| "edit"
	| "eye"
	| "eyeOff"
	| "gift"
	| "info"
	| "mic"
	| "pin"
	| "plus"
	| "popOut"
	| "refresh"
	| "reply"
	| "search"
	| "send"
	| "settings"
	| "shield"
	| "smile"
	| "sparkle"
	| "star"
	| "starF"
	| "timeout"
	| "trash"
	| "user"
	| "warn"
	| "x";

const ICON_MAP: Record<IconName, React.ComponentType<{ size?: number }>> = {
	activity: LuActivity,
	ban: LuBan,
	bell: LuBell,
	bolt: LuZap,
	check: LuCheck,
	chevd: LuChevronDown,
	chevu: LuChevronUp,
	chevron: LuChevronRight,
	code: LuTerminal,
	coin: LuCoins,
	crown: LuCrown,
	edit: LuPenLine,
	eye: LuEye,
	eyeOff: LuEyeOff,
	gift: LuGift,
	info: LuInfo,
	mic: LuMic,
	pin: LuPin,
	plus: LuPlus,
	popOut: LuExternalLink,
	refresh: LuRefreshCw,
	reply: LuReply,
	search: LuSearch,
	send: LuSend,
	settings: LuSettings,
	shield: LuShield,
	smile: LuSmile,
	sparkle: LuSparkles,
	star: LuStar,
	starF: LuStar,
	timeout: LuTimer,
	trash: LuTrash2,
	user: LuUser,
	warn: LuAlertTriangle,
	x: LuX,
};

export interface IconProps {
	name: IconName;
	size?: number;
	className?: string;
	ariaLabel?: string;
	title?: string;
}

const Icon: React.FunctionComponent<IconProps> = ({
	name,
	size = 16,
	className,
	ariaLabel,
	title,
}) => {
	const Cmp = ICON_MAP[name];
	if (!Cmp) return null;
	// Icon-only buton kullanildiginda ariaLabel zorunlu (medium-rules §20 a11y).
	// Decorative kullanimda aria-hidden true.
	const decorative = !ariaLabel && !title;
	return (
		<span
			className={className}
			role={decorative ? undefined : "img"}
			aria-label={ariaLabel}
			aria-hidden={decorative || undefined}
			title={title}
			style={{ display: "inline-flex", alignItems: "center", lineHeight: 0 }}
		>
			<Cmp size={size} />
		</span>
	);
};

export default Icon;
