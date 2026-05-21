/**
 * Sprint 60 — Interval (zamanlı) trigger için engine testleri.
 *
 * Jest fake timer ile setInterval'i kontrol ediyoruz.
 */

import {
	__resetSchedulersForTest,
} from "../renderer/util/automationRulesEngine";
import {
	saveAutomationRules,
	loadAutomationRules,
} from "../renderer/util/automationRulesStorage";
import { ChannelRule, createBlankRule } from "../renderer/util/automationRules";

jest.mock("react-toastify", () => ({
	toast: Object.assign(jest.fn(), {
		success: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	}),
}));

// window.electron stub: live=true her zaman
beforeAll(() => {
	(window as any).electron = {
		kick: {
			getChannelBySlug: jest.fn(() =>
				Promise.resolve({
					data: [
						{
							broadcaster_user_id: 42,
							stream: { is_live: true },
						},
					],
				})
			),
			sendChatMessage: jest.fn(() => Promise.resolve()),
		},
	};
});

afterEach(() => {
	__resetSchedulersForTest();
	localStorage.clear();
	jest.clearAllMocks();
});

describe("Interval trigger (Sprint 60)", () => {
	test("type kaydı ve geri-okuma — intervalMinutes + liveOnly", () => {
		const rule: ChannelRule = {
			...createBlankRule(),
			name: "5dk",
			channelSlugs: ["kanal"],
			trigger: {
				type: "interval",
				intervalMinutes: 5,
				liveOnly: true,
				fireImmediately: false,
			},
			action: { type: "send_toast", content: "tick" },
		};
		saveAutomationRules([rule]);
		const loaded = loadAutomationRules();
		expect(loaded).toHaveLength(1);
		const t = loaded[0].trigger;
		expect(t.type).toBe("interval");
		if (t.type === "interval") {
			expect(t.intervalMinutes).toBe(5);
			expect(t.liveOnly).toBe(true);
		}
	});

	test("createBlankRule default trigger interval değildir", () => {
		const r = createBlankRule();
		expect(r.trigger.type).toBe("chat_match");
	});
});
