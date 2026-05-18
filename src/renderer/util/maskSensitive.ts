export const maskSensitive = (value?: string) => {
	if (!value) return "-";
	return "********";
};
