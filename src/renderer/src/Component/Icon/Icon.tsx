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
	LuBan,
	LuCheck,
	LuChevronDown,
	LuChevronRight,
	LuCoins,
	LuCrown,
	LuGift,
	LuPin,
	LuPlus,
	LuSettings,
	LuShield,
	LuSmile,
	LuTerminal,
	LuUser,
	LuX,
	LuZap,
} from "react-icons/lu";

export type IconName =
	| "crown"
	| "gift"
	| "bolt"
	| "coin"
	| "pin"
	| "x"
	| "settings"
	| "user"
	| "shield"
	| "ban"
	| "smile"
	| "code"
	| "plus"
	| "check"
	| "chevron"
	| "chevd";

const ICON_MAP: Record<IconName, React.ComponentType<{ size?: number }>> = {
	crown: LuCrown,
	gift: LuGift,
	bolt: LuZap,
	coin: LuCoins,
	pin: LuPin,
	x: LuX,
	settings: LuSettings,
	user: LuUser,
	shield: LuShield,
	ban: LuBan,
	smile: LuSmile,
	code: LuTerminal,
	plus: LuPlus,
	check: LuCheck,
	chevron: LuChevronRight,
	chevd: LuChevronDown,
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
