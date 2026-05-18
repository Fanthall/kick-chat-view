export const parseKickScopes = (...values: unknown[]): string[] => {
	const scopes = new Set<string>();

	const addScope = (value: unknown) => {
		if (Array.isArray(value)) {
			value.forEach(addScope);
			return;
		}

		if (typeof value !== "string") {
			return;
		}

		value
			.split(/[\s,]+/)
			.map((scope) => scope.trim())
			.filter(Boolean)
			.forEach((scope) => scopes.add(scope));
	};

	values.forEach(addScope);

	return Array.from(scopes);
};

export const hasKickScope = (scopes: string[], scope: string) =>
	scopes.includes(scope);

