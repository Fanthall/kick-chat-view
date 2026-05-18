import React, { FunctionComponent } from "react";
import { EmoteEntry, PROVIDER_LABEL } from "../../constants/emote";

interface EmoteAutocompleteProps {
	suggestions: EmoteEntry[];
	activeIndex: number;
	onPick: (entry: EmoteEntry) => void;
	onHover?: (index: number) => void;
}

const EmoteAutocomplete: FunctionComponent<EmoteAutocompleteProps> = ({
	suggestions,
	activeIndex,
	onPick,
	onHover,
}) => {
	if (!suggestions.length) return null;
	return (
		<div className="chat-suggestion-menu emote-suggestion-menu">
			{suggestions.map((entry, index) => (
				<button
					key={`${entry.provider}:${entry.id}:${entry.name}`}
					type="button"
					className={`chat-suggestion-item emote-suggestion-item ${
						index === activeIndex ? "active" : ""
					}`}
					onMouseEnter={() => onHover?.(index)}
					onMouseDown={(event) => {
						event.preventDefault();
						onPick(entry);
					}}
				>
					<img
						src={entry.urls["1x"]}
						alt={entry.name}
						className="emote-suggestion-thumb"
						loading="lazy"
					/>
					<span className="emote-suggestion-meta">
						<span className="emote-suggestion-name">{entry.name}</span>
						<span className="emote-suggestion-sub">
							<span className="emote-suggestion-provider">
								{PROVIDER_LABEL[entry.provider]}
							</span>
							{entry.animated && (
								<span className="emote-badge emote-badge--gif">GIF</span>
							)}
							{entry.zeroWidth && (
								<span className="emote-badge emote-badge--zw">ZW</span>
							)}
							{entry.subscribersOnly && (
								<span className="emote-badge emote-badge--sub">SUB</span>
							)}
						</span>
					</span>
				</button>
			))}
		</div>
	);
};

export default EmoteAutocomplete;
