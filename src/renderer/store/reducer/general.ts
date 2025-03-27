import { HistoryPageItem, LayoutType } from "../../util/storeConstants";
import { GeneralActions } from "../actions/general";
import { GeneralTypes } from "../types/general";

interface GeneralState {
	historyPage: HistoryPageItem[];
	layoutType: LayoutType;
}
const initialState: GeneralState = {
	historyPage: [],
	layoutType: LayoutType.DEFAULT,
};

const GeneralReducers = (
	state = initialState,
	action: GeneralActions
): GeneralState => {
	if (action.type === GeneralTypes.NEW_HISTORY_ACTION) {
		return {
			...state,
			historyPage: [...state.historyPage, action.newHistory],
		};
	} else if (action.type === GeneralTypes.REMOVE_HISTORY_ACTION) {
		return {
			...state,
			historyPage: state.historyPage.filter((item) => item.id !== action.id),
		};
	} else {
		return { ...state };
	}
};

export default GeneralReducers;
