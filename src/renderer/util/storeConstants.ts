import { MainPosition } from "../src/Component/DraggableView/DraggableView";
import { ModUserHistory } from "./chatInterface";

export interface HistoryPageItem {
	id: number;
	position: MainPosition;

	history: ModUserHistory;
}

export enum LayoutType {
	DEFAULT,
	HORIZONTAL_RIGHT_STACKED,
	VERTICAL_BOTTOM_HORIZONTAL,
	LEFT_ONLY,
	RIGHT_FIRST_HIDDEN,
	RIGHT_SECOND_HIDDEN,
}
