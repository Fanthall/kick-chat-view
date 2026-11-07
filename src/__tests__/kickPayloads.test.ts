/**
 * Kick olay govdesi cozuculeri. Ornekler 2026-11-07'de canli kanallardan
 * yakalanan govdelerin sadelestirilmis halidir.
 */
import {
	parseGoal,
	parseNewSubscriber,
	parsePinnedMessage,
	parseStreamHosted,
} from "../renderer/util/kickPayloads";

describe("parseNewSubscriber", () => {
	it("yalniz new_subscriber turu abonelik sayilir", () => {
		expect(
			parseNewSubscriber(
				JSON.stringify({
					channel_id: 26239555,
					type: "new_subscriber",
					username: "Canyurruk",
					metadata: {},
					created_at: 1794073134476,
				})
			)
		).toEqual({ username: "Canyurruk", createdAt: 1794073134476 });
		expect(parseNewSubscriber(JSON.stringify({ type: "new_follower", username: "x" }))).toBeNull();
		expect(parseNewSubscriber(JSON.stringify({ type: "new_subscriber" }))).toBeNull();
	});
});

describe("parseStreamHosted", () => {
	it("yeni govdeyi HostInfo alanlarina cevirir", () => {
		const host = parseStreamHosted(
			JSON.stringify({
				user: { username: "raider" },
				message: { numberOfViewers: 120, optionalMessage: "selam" },
			})
		);
		expect(host).toEqual({ host_username: "raider", number_viewers: 120, optional_message: "selam" });
	});

	it("eksik alanlarda guvenli varsayilan", () => {
		expect(parseStreamHosted("{}")).toEqual({ host_username: "", number_viewers: 0, optional_message: "" });
	});
});

describe("parsePinnedMessage", () => {
	const message = {
		id: "9037c234",
		chatroom_id: 1,
		content: "Toplulugumuza katil",
		type: "message",
		created_at: "2026-11-07T17:25:04+00:00",
		sender: { id: 1, username: "BotRix", slug: "botrix" },
	};

	it("canli olay: duration metin (dk), pinnedBy nesne", () => {
		const pinned = parsePinnedMessage(
			{ message, duration: "20", pinnedBy: { id: 2, username: "MaliPM", slug: "malipm" } },
			1_000
		);
		expect(pinned?.message.id).toBe("9037c234");
		expect(pinned?.pinnedBy).toBe("MaliPM");
		expect(pinned?.finishAt).toBe(1_000 + 20 * 60 * 1000);
	});

	it("gecmis yaniti: finish_at oncelikli, pinned_by", () => {
		const pinned = parsePinnedMessage({
			message,
			duration: 20,
			finish_at: "2026-11-07T18:00:00.000Z",
			pinned_by: { username: "MaliPM" },
		});
		expect(pinned?.finishAt).toBe(Date.parse("2026-11-07T18:00:00.000Z"));
		expect(pinned?.pinnedBy).toBe("MaliPM");
	});

	it("bos ya da mesajsiz govde null (PinnedMessageDeletedEvent govdesi [])", () => {
		expect(parsePinnedMessage([])).toBeNull();
		expect(parsePinnedMessage(null)).toBeNull();
		expect(parsePinnedMessage({ duration: 5 })).toBeNull();
	});
});

describe("parseGoal", () => {
	it("hedef ilerleme govdesi", () => {
		const goal = parseGoal(
			JSON.stringify({
				id: "chgoal_01M5",
				type: "subscriptions",
				target_value: 4000,
				current_value: 3569,
				status: "active",
			})
		);
		expect(goal).toEqual({
			id: "chgoal_01M5",
			type: "subscriptions",
			currentValue: 3569,
			targetValue: 4000,
			status: "active",
		});
	});

	it("bilinmeyen tur undefined, id yoksa null", () => {
		expect(parseGoal(JSON.stringify({ id: 1, type: "watchtime" }))?.type).toBeUndefined();
		expect(parseGoal("{}")).toBeNull();
	});
});
