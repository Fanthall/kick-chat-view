/**
 * Sprint 6a — backward-compat shim.
 * Classic Layout.tsx imports `Settings` by this path; this shim re-exports
 * SettingsClassic so the rename is transparent to classic callers.
 */
export { default } from "./SettingsClassic";
