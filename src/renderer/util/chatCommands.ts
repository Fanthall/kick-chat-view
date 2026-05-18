import { DEFAULT_TIMEOUT_SECONDS, parseTimeoutSeconds } from "./timeoutDuration";

export const DEFAULT_TIMEOUT_SECONDS_STORAGE_KEY =
	"chatViewDefaultTimeoutSeconds";

export interface ChatCommandDefinition {
	name: "/user" | "/ban" | "/unban" | "/to" | "/timeout";
	usage: string;
	template: string;
	description: string;
}

export interface ParsedChatCommand {
	command: "user" | "ban" | "unban" | "to" | "timeout";
	targetUsername?: string;
	timeoutSeconds?: number;
	reason?: string;
	usage: string;
	error?: string;
}

export const chatCommandDefinitions: ChatCommandDefinition[] = [
	{
		name: "/user",
		usage: "/user username",
		template: "/user ",
		description: "Open user detail",
	},
	{
		name: "/ban",
		usage: "/ban username [reason]",
		template: "/ban ",
		description: "Ban user",
	},
	{
		name: "/unban",
		usage: "/unban username",
		template: "/unban ",
		description: "Unban user",
	},
	{
		name: "/to",
		usage: "/to username seconds [reason]",
		template: "/to ",
		description: "Timeout in seconds",
	},
	{
		name: "/timeout",
		usage: "/timeout username seconds [reason]",
		template: "/timeout ",
		description: "Timeout in seconds",
	},
];

export const getDefaultTimeoutSeconds = () => {
	const savedValue = localStorage.getItem(DEFAULT_TIMEOUT_SECONDS_STORAGE_KEY);
	const parsedValue = parseTimeoutSeconds(savedValue || "");

	return parsedValue || DEFAULT_TIMEOUT_SECONDS;
};

export const setDefaultTimeoutSeconds = (seconds: number) => {
	localStorage.setItem(DEFAULT_TIMEOUT_SECONDS_STORAGE_KEY, String(seconds));
};

export const getCommandUsage = (command: string) => {
	const normalizedCommand = command.startsWith("/") ? command : `/${command}`;
	return (
		chatCommandDefinitions.find((item) => item.name === normalizedCommand)
			?.usage || `/${command} username`
	);
};

export const parseChatCommand = (content: string): ParsedChatCommand | undefined => {
	const match = content.trim().match(/^\/(\w+)(?:\s+(.+))?$/);
	if (!match) {
		return undefined;
	}

	const command = match[1].toLowerCase() as ParsedChatCommand["command"];
	const rawArgs = (match[2] || "").trim();
	const args = rawArgs.split(/\s+/).filter(Boolean);
	const targetUsername = args[0]?.replace(/^@/, "");
	const usage = getCommandUsage(command);

	if (!["user", "ban", "unban", "to", "timeout"].includes(command)) {
		return {
			command,
			usage,
			error: `Unknown command: /${command}`,
		};
	}

	if (!targetUsername) {
		return {
			command,
			usage,
			error: `Usage: ${usage}`,
		};
	}

	if (command === "to" || command === "timeout") {
		const timeoutSeconds = parseTimeoutSeconds(args[1]);
		if (!timeoutSeconds) {
			return {
				command,
				targetUsername,
				usage,
				error: `Usage: ${usage}`,
			};
		}

		return {
			command,
			targetUsername,
			timeoutSeconds,
			reason: args.slice(2).join(" ").trim() || undefined,
			usage,
		};
	}

	return {
		command,
		targetUsername,
		reason: command === "ban" ? args.slice(1).join(" ").trim() || undefined : undefined,
		usage,
	};
};
