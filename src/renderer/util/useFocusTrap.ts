/**
 * Sprint 7 — useFocusTrap
 *
 * Focus trap for modal dialogs. On mount, captures the previously-focused
 * element, focuses the first focusable element inside `ref`, cycles Tab /
 * Shift+Tab within the modal, and restores focus on Escape or unmount.
 *
 * Usage:
 *   const modalRef = useRef<HTMLDivElement>(null);
 *   useFocusTrap(modalRef, open, onClose);
 */

import { RefObject, useEffect } from "react";

const FOCUSABLE_SELECTORS = [
	"a[href]",
	"button:not([disabled])",
	"input:not([disabled])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	"[tabindex]:not([tabindex='-1'])",
].join(",");

function getFocusable(container: HTMLElement): HTMLElement[] {
	return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS));
}

export function useFocusTrap(
	ref: RefObject<HTMLElement>,
	active: boolean,
	onEscape?: () => void
): void {
	useEffect(() => {
		if (!active || !ref.current) return;

		const previouslyFocused = document.activeElement as HTMLElement | null;

		// Focus the first focusable child (search input, close button, etc.)
		const focusable = getFocusable(ref.current);
		if (focusable.length > 0) {
			focusable[0].focus();
		}

		const handleKeyDown = (e: KeyboardEvent) => {
			if (!ref.current) return;

			if (e.key === "Escape") {
				e.preventDefault();
				onEscape?.();
				return;
			}

			if (e.key !== "Tab") return;

			const nodes = getFocusable(ref.current);
			if (nodes.length === 0) {
				e.preventDefault();
				return;
			}

			const first = nodes[0];
			const last = nodes[nodes.length - 1];

			if (e.shiftKey) {
				// Shift+Tab: if on first, wrap to last
				if (document.activeElement === first) {
					e.preventDefault();
					last.focus();
				}
			} else {
				// Tab: if on last, wrap to first
				if (document.activeElement === last) {
					e.preventDefault();
					first.focus();
				}
			}
		};

		document.addEventListener("keydown", handleKeyDown);

		return () => {
			document.removeEventListener("keydown", handleKeyDown);
			// Restore focus when trap closes
			if (previouslyFocused && typeof previouslyFocused.focus === "function") {
				previouslyFocused.focus();
			}
		};
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [active]);
}

export default useFocusTrap;
