/**
 * Sprint 15: fetch and cache Kick channel/user profile_pic by slug.
 *
 * Kick's public channel endpoint `/api/v2/channels/{slug}` returns
 * `data.user.profile_pic` which is the same image used for both the
 * channel logo and the user avatar (Kick channels are 1:1 with users).
 *
 * Usage:
 *   const pic = useProfilePic(channelSlug);
 *   pic ? <img src={pic}/> : <div className="initial">{letter}</div>
 *
 * In-memory cache survives mount/unmount; failures are sticky (null
 * cached) so we don't hammer the API for users that don't exist.
 */

import { useEffect, useState } from "react";
import { getChannelData } from "../services/kick";

const cache = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

const normalize = (slug: string | undefined | null) =>
	(slug || "").trim().toLowerCase();

export const fetchProfilePic = (slug: string): Promise<string | null> => {
	const key = normalize(slug);
	if (!key) return Promise.resolve(null);
	if (cache.has(key)) return Promise.resolve(cache.get(key) || null);
	const existing = pending.get(key);
	if (existing) return existing;

	const promise = getChannelData(key)
		.then((res) => {
			const url = res?.data?.user?.profile_pic || null;
			cache.set(key, url);
			pending.delete(key);
			return url;
		})
		.catch(() => {
			cache.set(key, null);
			pending.delete(key);
			return null;
		});
	pending.set(key, promise);
	return promise;
};

export const useProfilePic = (
	slug: string | undefined | null
): string | undefined => {
	const key = normalize(slug);
	const cached = key ? cache.get(key) : undefined;
	const [pic, setPic] = useState<string | undefined>(
		cached === null ? undefined : cached
	);

	useEffect(() => {
		if (!key) {
			setPic(undefined);
			return;
		}
		const c = cache.get(key);
		if (c !== undefined) {
			setPic(c || undefined);
			return;
		}
		let cancelled = false;
		fetchProfilePic(key).then((url) => {
			if (!cancelled) setPic(url || undefined);
		});
		return () => {
			cancelled = true;
		};
	}, [key]);

	return pic;
};
