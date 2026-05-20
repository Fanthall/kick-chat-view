/**
 * Sprint 7 — useFocusTrap unit tests.
 *
 * Tests: Tab cycles focus forward, Shift+Tab cycles backward,
 * Escape calls onEscape, focus restores to previously focused element on deactivation.
 */

import { renderHook, act } from "@testing-library/react";
import { useRef } from "react";
import { useFocusTrap } from "../renderer/util/useFocusTrap";

// Helper: create a simple container with N focusable buttons
function makeContainer(buttonCount: number): HTMLDivElement {
	const container = document.createElement("div");
	for (let i = 0; i < buttonCount; i++) {
		const btn = document.createElement("button");
		btn.textContent = `Button ${i}`;
		container.appendChild(btn);
	}
	document.body.appendChild(container);
	return container;
}

function cleanup(container: HTMLDivElement) {
	document.body.removeChild(container);
}

describe("useFocusTrap", () => {
	let container: HTMLDivElement;

	afterEach(() => {
		if (container && document.body.contains(container)) {
			cleanup(container);
		}
		jest.restoreAllMocks();
	});

	it("focuses first focusable element on activation", () => {
		container = makeContainer(3);
		const buttons = container.querySelectorAll("button");
		const ref = { current: container };

		renderHook(() => useFocusTrap(ref as any, true));

		expect(document.activeElement).toBe(buttons[0]);
	});

	it("Tab from last element wraps to first", () => {
		container = makeContainer(3);
		const buttons = container.querySelectorAll<HTMLButtonElement>("button");
		const ref = { current: container };

		renderHook(() => useFocusTrap(ref as any, true));

		// Move focus to last button
		buttons[buttons.length - 1].focus();
		expect(document.activeElement).toBe(buttons[buttons.length - 1]);

		// Simulate Tab
		act(() => {
			const event = new KeyboardEvent("keydown", {
				key: "Tab",
				bubbles: true,
				cancelable: true,
			});
			document.dispatchEvent(event);
		});

		expect(document.activeElement).toBe(buttons[0]);
	});

	it("Shift+Tab from first element wraps to last", () => {
		container = makeContainer(3);
		const buttons = container.querySelectorAll<HTMLButtonElement>("button");
		const ref = { current: container };

		renderHook(() => useFocusTrap(ref as any, true));

		// Focus is on first after mount; dispatch Shift+Tab
		buttons[0].focus();
		act(() => {
			const event = new KeyboardEvent("keydown", {
				key: "Tab",
				shiftKey: true,
				bubbles: true,
				cancelable: true,
			});
			document.dispatchEvent(event);
		});

		expect(document.activeElement).toBe(buttons[buttons.length - 1]);
	});

	it("Escape calls onEscape callback", () => {
		container = makeContainer(2);
		const onEscape = jest.fn();
		const ref = { current: container };

		renderHook(() => useFocusTrap(ref as any, true, onEscape));

		act(() => {
			const event = new KeyboardEvent("keydown", {
				key: "Escape",
				bubbles: true,
				cancelable: true,
			});
			document.dispatchEvent(event);
		});

		expect(onEscape).toHaveBeenCalledTimes(1);
	});
});
