import { configureStore } from "@reduxjs/toolkit";
import ChatMessageReducers from "./reducer/chatMessage";
import GeneralReducers from "./reducer/general";

const rootReducer = {
	messages: ChatMessageReducers,
	generals: GeneralReducers,
};
const Store = configureStore({
	reducer: rootReducer,
	middleware(getDefaultMiddleware) {
		return getDefaultMiddleware({ serializableCheck: false });
	},
});
export default Store;
export type RootState = ReturnType<typeof Store.getState>;

export type FanthalDispatch = typeof Store.dispatch;
