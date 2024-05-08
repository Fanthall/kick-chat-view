import {
	FunctionComponent,
	ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";
interface ScrollableViewProps {
	children?: ReactNode;
	className?: string;
	style?: React.CSSProperties;
}

const ScrollableView: FunctionComponent<ScrollableViewProps> = (props) => {
	const [scrolled, setScrolled] = useState(false);
	const divRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		//Manuel scroll olmayan durumda auto scroll engelleniyor
		if (!scrolled) {
			divRef.current?.lastElementChild?.scrollIntoView();
		}
	}, [props.children]);

	useEffect(() => {
		//başlangıçta en alta atar
		setTimeout(() => {
			divRef.current?.lastElementChild?.scrollIntoView();
		}, 1000);
	}, []);

	return (
		<div
			className={`flex justify-start items-start flex-col h-[90%] w-full border border-solid border-default-200 pl-2  ${
				props.children ?? ""
			}`}
			style={{
				overflow: "hidden",
				position: "relative",
				backgroundColor: "rgba(0,0,0,0.6)",
				...props.style,
			}}
		>
			<div
				ref={divRef}
				onScrollCapture={(e) => {}}
				onMouseEnter={() => {
					setScrolled(true);
				}}
				onMouseLeave={() => {
					setScrolled(false);
					divRef.current?.lastElementChild?.scrollIntoView();
				}}
				style={{
					width: "100%",
					height: "100%",
					overflowX: "hidden",
					overflowY: "scroll",
					paddingRight: 17 /* Increase/decrease this value for cross-browser compatibility */,
					boxSizing: "content-box" /* So the width will be 100% + 17px */,
				}}
			>
				{props.children}
			</div>
			{scrolled && (
				<div
					className="w-full text-center"
					style={{
						position: "absolute",
						bottom: 0,
						zIndex: 99,
						backgroundColor: "rgba(128,128,128,0.2)",
					}}
				>
					Auto scroll paused
				</div>
			)}
		</div>
	);
};
export default ScrollableView;
