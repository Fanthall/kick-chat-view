export const DEFAULT_TIMEOUT_SECONDS = 600;

export const parseTimeoutSeconds = (value?: string): number | undefined => {
	if (!value) return undefined;

	const match = value.trim().toLowerCase().match(/^(\d+)(s|sec|m|min|h)?$/);
	if (!match) return undefined;

	const amount = Number(match[1]);
	if (!Number.isFinite(amount) || amount <= 0) return undefined;

	const unit = match[2] || "s";
	if (unit === "h") return amount * 60 * 60;
	if (unit === "m" || unit === "min") return amount * 60;

	return amount;
};

export const formatTimeoutDuration = (seconds: number) => {
	if (seconds % 3600 === 0) return `${seconds / 3600}h`;
	if (seconds % 60 === 0) return `${seconds / 60}m`;
	return `${seconds}s`;
};
