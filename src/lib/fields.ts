// Fixed value lists shared by the server, the web app and later the iOS app (plan P-T-0002, data model).
// Editing these lists is out of scope for the MVP (F-web-mvp).

export const MEDIA = [
	'video',
	'article',
	'post',
	'repo',
	'podcast',
	'image',
	'pdf',
	'page'
] as const;
export type Media = (typeof MEDIA)[number];

export const STATUSES = ['to_read', 'in_progress', 'done'] as const;
export type Status = (typeof STATUSES)[number];

/** 1 low, 2 medium, 3 high. */
export const PRIORITIES = [1, 2, 3] as const;
export type Priority = (typeof PRIORITIES)[number];

export const SAVED_VIA = ['paste', 'share', 'shortcut', 'import', 'api', 'bookmarklet'] as const;
export type SavedVia = (typeof SAVED_VIA)[number];

/** The fields a hand edit protects from the metadata fetcher (the link's `user_set`). */
export const USER_SET_FIELDS = ['title', 'description', 'source', 'media'] as const;
export type UserSetField = (typeof USER_SET_FIELDS)[number];
