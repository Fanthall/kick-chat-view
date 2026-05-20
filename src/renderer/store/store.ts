import { configureStore } from "@reduxjs/toolkit";
import ChatMessageReducers from "./reducer/chatMessage";
import GeneralReducers from "./reducer/general";

const rootReducer = {
	messages: ChatMessageReducers,
	generals: GeneralReducers,
};
// Sprint 44: ImmutableStateInvariantMiddleware dev mode'da messageList
// (500 entry) + emoteSetsByChannel büyük olduğu için her dispatch'te
// 30-50 ms warning basıyordu. immutableCheck ve serializableCheck dev'de
// kapatıldı; production'da zaten devre dışı.
const Store = configureStore({
	reducer: rootReducer,
	middleware(getDefaultMiddleware) {
		return getDefaultMiddleware({
			serializableCheck: false,
			immutableCheck: false,
		});
	},
});
export default Store;
export type RootState = ReturnType<typeof Store.getState>;

export type FanthalDispatch = typeof Store.dispatch;
