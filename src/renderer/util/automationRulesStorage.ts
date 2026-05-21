/**
 * Sprint 58 — Automation rules localStorage I/O.
 * Storage key: chatViewAutomationRules
 * Change event: chat-view-automation-rules-changed (CustomEvent)
 */

import type { ChannelRule } from "./automationRules";

const STORAGE_KEY = "chatViewAutomationRules";
export const AUTOMATION_RULES_CHANGED = "chat-view-automation-rules-changed";

export const loadAutomationRules = (): ChannelRule[] => {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((r) => r && typeof r.id === "string");
	} catch {
		return [];
	}
};

export const saveAutomationRules = (rules: ChannelRule[]): void => {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
		try {
			window.dispatchEvent(new CustomEvent(AUTOMATION_RULES_CHANGED));
		} catch {
			/* ignore */
		}
	} catch (err) {
		console.log("Failed to save automation rules", err);
	}
};

export const upsertAutomationRule = (rule: ChannelRule): void => {
	const current = loadAutomationRules();
	const idx = current.findIndex((r) => r.id === rule.id);
	if (idx === -1) {
		current.push(rule);
	} else {
		current[idx] = rule;
	}
	saveAutomationRules(current);
};

export const deleteAutomationRule = (id: string): void => {
	const current = loadAutomationRules().filter((r) => r.id !== id);
	saveAutomationRules(current);
};
