import { HistoryPageItem } from "../../util/storeConstants";
import { FanthalDispatch } from "../store";
import { GeneralTypes } from "../types/general";

interface NewHistoryAction {
	type: GeneralTypes.NEW_HISTORY_ACTION;
	newHistory: HistoryPageItem;
}
interface RemoveHistoryAction {
	type: GeneralTypes.REMOVE_HISTORY_ACTION;
	id: number;
}

interface AnyAction {
	type: "ANY_ACTION";
}

export type GeneralActions = AnyAction | NewHistoryAction | RemoveHistoryAction;

const newHistoryAction = (newHistory: HistoryPageItem): GeneralActions => {
	return {
		type: GeneralTypes.NEW_HISTORY_ACTION,
		newHistory: newHistory,
	};
};

export const newHistoryPage = (newHistory: HistoryPageItem) => {
	return (dispatch: FanthalDispatch) => {
		dispatch(newHistoryAction(newHistory));
	};
};

const removeHistoryAction = (id: number): GeneralActions => {
	return {
		type: GeneralTypes.REMOVE_HISTORY_ACTION,
		id: id,
	};
};

export const removeHistoryPage = (id: number) => {
	return (dispatch: FanthalDispatch) => {
		dispatch(removeHistoryAction(id));
	};
};
