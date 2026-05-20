/**
 * AddChannelPopover — inline popover anchored below the + button in topbar.
 *
 * Fix 2: + button add channel (CRITICAL)
 * Fix 5: popover uses existing addChannel() + dispatches kick-channel-settings-changed.
 */

import React, {
	FunctionComponent,
	useEffect,
	useRef,
	useState,
} from "react";
import { toast } from "react-toastify";
import Icon from "../Component/Icon/Icon";
import { addChannel, setActiveChannelSlug } from "../../util/channelSettings";
import { chatListener } from "../../util/chatConnection";
import { useFanthalDispatch } from "../../store/hooks/hooks";

interface AddChannelPopoverProps {
	open: boolean;
	onClose: () => void;
	anchorRef?: React.RefObject<HTMLButtonElement>;
}

const AddChannelPopover: FunctionComponent<AddChannelPopoverProps> = ({
	open,
	onClose,
}) => {
	const dispatch = useFanthalDispatch();
	const [value, setValue] = useState("");
	const [error, setError] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (open) {
			setValue("");
			setError("");
			setTimeout(() => inputRef.current?.focus(), 50);
		}
	}, [open]);

	// Close on Escape
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	if (!open) return null;

	const handleAdd = () => {
		const slug = value.trim().replace(/^@/, "").replace(/^https?:\/\/kick\.com\//, "");
		if (!slug) {
			setError("Enter a channel name.");
			return;
		}
		addChannel(slug);
		setActiveChannelSlug(slug);
		window.dispatchEvent(new Event("kick-channel-settings-changed"));
		dispatch(chatListener(slug));
		toast(`Connecting to ${slug}`, { type: "info" });
		onClose();
	};

	const handleKey = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") handleAdd();
		if (e.key === "Escape") onClose();
	};

	return (
		<>
			{/* Backdrop */}
			<div
				className="add-ch-backdrop"
				onClick={onClose}
				aria-hidden="true"
			/>
			<div
				className="add-ch-popover"
				role="dialog"
				aria-label="Add a channel"
				aria-modal="true"
			>
				<div className="add-ch-title">Add a channel</div>
				<div className="add-ch-body">
					<input
						ref={inputRef}
						className="set-input add-ch-input"
						placeholder="@channelname or URL"
						value={value}
						onChange={(e) => { setValue(e.target.value); setError(""); }}
						onKeyDown={handleKey}
						aria-label="Channel handle or URL"
						aria-describedby={error ? "add-ch-error" : undefined}
					/>
					{error && (
						<span id="add-ch-error" className="add-ch-error" role="alert">
							{error}
						</span>
					)}
				</div>
				<div className="add-ch-actions">
					<button
						className="set-btn ghost"
						type="button"
						onClick={onClose}
					>
						Cancel
					</button>
					<button
						className="set-btn primary"
						type="button"
						onClick={handleAdd}
					>
						<Icon name="plus" size={12} />
						Add
					</button>
				</div>
			</div>
		</>
	);
};

export default AddChannelPopover;
