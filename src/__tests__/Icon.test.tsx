import React from "react";
import { render } from "@testing-library/react";
import Icon, { IconName } from "../renderer/src/Component/Icon/Icon";

// Sprint 2 — Icon shared component smoke test.
// - 16 Lucide icon name'inin tamami map'lendi (Design v1 AD-mapping).
// - ariaLabel verildiginde role=img.
// - ariaLabel verilmediginde aria-hidden=true (decorative).

const NAMES: IconName[] = [
	"crown",
	"gift",
	"bolt",
	"coin",
	"pin",
	"x",
	"settings",
	"user",
	"shield",
	"ban",
	"smile",
	"code",
	"plus",
	"check",
	"chevron",
	"chevd",
];

describe("Icon", () => {
	it("16 icon name'i de hata vermeden render olur", () => {
		NAMES.forEach((name) => {
			const { container } = render(<Icon name={name} />);
			expect(container.querySelector("svg")).toBeTruthy();
		});
	});

	it("ariaLabel verilince role=img + aria-label dogru", () => {
		const { container } = render(<Icon name="settings" ariaLabel="Ayarlar" />);
		const span = container.firstChild as HTMLElement;
		expect(span.getAttribute("role")).toBe("img");
		expect(span.getAttribute("aria-label")).toBe("Ayarlar");
		expect(span.hasAttribute("aria-hidden")).toBe(false);
	});

	it("ariaLabel + title yoksa decorative (aria-hidden=true, role yok)", () => {
		const { container } = render(<Icon name="settings" />);
		const span = container.firstChild as HTMLElement;
		expect(span.getAttribute("aria-hidden")).toBe("true");
		expect(span.hasAttribute("role")).toBe(false);
	});

	it("size prop SVG'ye iletilir", () => {
		const { container } = render(<Icon name="user" size={24} />);
		const svg = container.querySelector("svg");
		expect(svg?.getAttribute("height")).toBe("24");
		expect(svg?.getAttribute("width")).toBe("24");
	});
});
