import React, {
	FunctionComponent,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { StreamCategoryMeta } from "../../util/streamMeta";

interface CategoryAutocompleteProps {
	initialCategory?: StreamCategoryMeta;
	onChange: (category: StreamCategoryMeta | undefined) => void;
	disabled?: boolean;
}

interface KickCategoryShape {
	id: number;
	name: string;
	thumbnail?: string;
	viewer_count?: number;
	tags?: string[];
}

const DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

const CategoryAutocomplete: FunctionComponent<CategoryAutocompleteProps> = ({
	initialCategory,
	onChange,
	disabled,
}) => {
	const [query, setQuery] = useState(initialCategory?.name || "");
	const [results, setResults] = useState<KickCategoryShape[]>([]);
	const [loading, setLoading] = useState(false);
	const [open, setOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(0);
	const [selected, setSelected] = useState<StreamCategoryMeta | undefined>(
		initialCategory
	);
	const containerRef = useRef<HTMLDivElement>(null);
	const fieldRef = useRef<HTMLDivElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const [listPosition, setListPosition] = useState<
		{ top: number; left: number; width: number; placement: "below" | "above" } | undefined
	>(undefined);

	useEffect(() => {
		setSelected(initialCategory);
		if (initialCategory) {
			setQuery(initialCategory.name);
		}
	}, [initialCategory?.id, initialCategory?.name]);

	useEffect(() => {
		// Eger query mevcut secimle birebir ayniysa arama yapma
		const trimmed = query.trim();
		if (!open || disabled) return;
		if (selected && trimmed === selected.name) {
			setResults([]);
			return;
		}
		if (trimmed.length < MIN_QUERY_LENGTH) {
			setResults([]);
			return;
		}
		setLoading(true);
		const handle = setTimeout(() => {
			window.electron.kick
				.searchCategories(trimmed, 10)
				.then((response) => {
					const data = (response?.data || []) as KickCategoryShape[];
					setResults(data);
					setActiveIndex(0);
				})
				.catch(() => {
					setResults([]);
				})
				.finally(() => setLoading(false));
		}, DEBOUNCE_MS);
		return () => {
			clearTimeout(handle);
		};
	}, [query, open, disabled, selected?.id, selected?.name]);

	useEffect(() => {
		const handleMouseDown = (event: MouseEvent) => {
			const target = event.target as Node;
			if (containerRef.current?.contains(target)) return;
			if (listRef.current?.contains(target)) return;
			setOpen(false);
		};
		window.addEventListener("mousedown", handleMouseDown);
		return () => {
			window.removeEventListener("mousedown", handleMouseDown);
		};
	}, []);

	useLayoutEffect(() => {
		if (!open) {
			setListPosition(undefined);
			return;
		}
		const compute = () => {
			const el = fieldRef.current;
			if (!el) return;
			const rect = el.getBoundingClientRect();
			const desiredHeight = 280;
			const margin = 8;
			const spaceBelow = window.innerHeight - rect.bottom;
			const spaceAbove = rect.top;
			const placeAbove = spaceBelow < desiredHeight && spaceAbove > spaceBelow;
			setListPosition({
				top: placeAbove ? Math.max(margin, rect.top - desiredHeight - 4) : rect.bottom + 4,
				left: rect.left,
				width: rect.width,
				placement: placeAbove ? "above" : "below",
			});
		};
		compute();
		window.addEventListener("resize", compute);
		window.addEventListener("scroll", compute, true);
		return () => {
			window.removeEventListener("resize", compute);
			window.removeEventListener("scroll", compute, true);
		};
	}, [open, results.length, loading]);

	const choose = (cat: KickCategoryShape) => {
		const next: StreamCategoryMeta = {
			id: cat.id,
			name: cat.name,
			thumbnail: cat.thumbnail,
		};
		setSelected(next);
		setQuery(cat.name);
		setOpen(false);
		setResults([]);
		onChange(next);
	};

	const clearSelection = () => {
		setSelected(undefined);
		setQuery("");
		setResults([]);
		onChange(undefined);
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (!open || results.length === 0) {
			if (event.key === "ArrowDown" && query.trim().length >= MIN_QUERY_LENGTH) {
				setOpen(true);
			}
			return;
		}
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setActiveIndex((idx) => (idx + 1) % results.length);
			return;
		}
		if (event.key === "ArrowUp") {
			event.preventDefault();
			setActiveIndex((idx) => (idx - 1 + results.length) % results.length);
			return;
		}
		if (event.key === "Enter" || event.key === "Tab") {
			event.preventDefault();
			choose(results[activeIndex]);
			return;
		}
		if (event.key === "Escape") {
			event.preventDefault();
			setOpen(false);
		}
	};

	const showThumbnail = useMemo(() => selected?.thumbnail, [selected?.thumbnail]);

	return (
		<div className="category-autocomplete" ref={containerRef}>
			<div className="category-autocomplete-field">
				{showThumbnail && (
					<img
						src={selected!.thumbnail!}
						alt={selected!.name}
						className="category-autocomplete-thumb"
					/>
				)}
				<input
					type="text"
					className="category-autocomplete-input"
					value={query}
					placeholder="Kategori ara"
					disabled={disabled}
					onFocus={() => setOpen(true)}
					onChange={(event) => {
						setQuery(event.target.value);
						setOpen(true);
					}}
					onKeyDown={handleKeyDown}
				/>
				{selected && (
					<button
						type="button"
						className="category-autocomplete-clear"
						aria-label="Kategoriyi temizle"
						onClick={clearSelection}
					>
						×
					</button>
				)}
			</div>
			{open && (results.length > 0 || loading) && (
				<div className="category-autocomplete-list">
					{loading && results.length === 0 && (
						<div className="category-autocomplete-empty">Aranıyor...</div>
					)}
					{results.map((cat, index) => (
						<button
							key={cat.id}
							type="button"
							className={`category-autocomplete-item ${
								index === activeIndex ? "active" : ""
							}`}
							onMouseEnter={() => setActiveIndex(index)}
							onClick={() => choose(cat)}
						>
							{cat.thumbnail && (
								<img
									src={cat.thumbnail}
									alt={cat.name}
									className="category-autocomplete-thumb"
								/>
							)}
							<div className="category-autocomplete-meta">
								<div className="category-autocomplete-name">{cat.name}</div>
								{cat.tags && cat.tags.length > 0 && (
									<div className="category-autocomplete-tags">
										{cat.tags.slice(0, 4).join(" • ")}
									</div>
								)}
							</div>
						</button>
					))}
				</div>
			)}
		</div>
	);
};

export default CategoryAutocomplete;
