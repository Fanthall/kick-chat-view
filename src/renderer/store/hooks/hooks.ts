import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import { FanthalDispatch, RootState } from '../store';

export const useFanthalDispatch: () => FanthalDispatch = useDispatch;
export const useFanthalSelector: TypedUseSelectorHook<RootState> = useSelector;
