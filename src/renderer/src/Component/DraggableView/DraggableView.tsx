import { Button } from "@nextui-org/react";
import React, { FunctionComponent, ReactNode, useRef, useState } from "react";
import { RxCross2 } from "react-icons/rx";
interface DraggableViewProps {
	title: ReactNode;
	content: ReactNode;
	position?: MainPosition;
	maxWidth?: number;
	maxHeight?: number;
	minWidth?: number;
	minHeight?: number;
	onClose?: () => void;
}
export interface MainPosition {
	top: number;
	left: number;
}
const DraggableView: FunctionComponent<DraggableViewProps> = React.memo(
	(props) => {
		const divMain = useRef<HTMLDivElement>(null);
		const headerRef = useRef<HTMLDivElement>(null);
		const [style, setStyle] = useState<{ top: number; left: number }>(
			props.position ?? {
				top: 0,
				left: 0,
			}
		);
		const positions = {
			pos1: 0,
			pos2: 0,
			pos3: 0,
			pos4: 0,
		};
		function closeDragElement() {
			// stop moving when mouse button is released:
			document.onmouseup = null;
			document.onmousemove = null;
		}
		function elementDrag(e: any) {
			e = e || window.event;
			e.preventDefault();
			// calculate the new cursor position:
			positions.pos1 = positions.pos3 - e.clientX;
			positions.pos2 = positions.pos4 - e.clientY;
			positions.pos3 = e.clientX;
			positions.pos4 = e.clientY;
			// set the element's new position:
			setStyle({
				top: divMain.current?.offsetTop! - positions.pos2,
				left: divMain.current?.offsetLeft! - positions.pos1,
			});
		}
		return (
			<div
				ref={divMain}
				className="absolute z-40 border border-solid border-default-500 rounded-md resize overflow-auto flex flex-col justify-start items-center"
				style={{
					minWidth: props.minWidth ?? 270,
					minHeight: props.minHeight ?? 270,
					top: style.top,
					left: style.left,
				}}
			>
				<div
					ref={headerRef}
					className={`p-1 z-50 text-white  w-full rounded-tl-md rounded-tr-md
				 bg-neutral-800 border-b-1 border-solid border-neutral-700 
				 flex flex-row justify-between items-center pl-3 pr-2 `}
					style={{
						minHeight: 50,
						cursor: "move",
					}}
					onMouseDown={(e) => {
						e.preventDefault();
						positions.pos3 = e.clientX;
						positions.pos4 = e.clientY;
						document.onmouseup = closeDragElement;
						document.onmousemove = elementDrag;
					}}
				>
					<span>{props.title}</span>
					{props.onClose && (
						<Button
							variant="light"
							size="sm"
							isIconOnly
							onClick={props.onClose}
						>
							<RxCross2 />
						</Button>
					)}
				</div>
				<div className="bg-neutral-800 flex flex-grow  flex-row justify-center items-start w-full ">
					{props.content}
				</div>
			</div>
		);
	}
);
export default DraggableView;
