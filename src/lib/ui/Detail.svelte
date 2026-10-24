<script lang="ts">
	// The open link: a third column on a wide screen, a sheet on a phone. Every field saves as it changes; a hand
	// edit of title, description, source or media is the person's from then on (the server's user_set).
	import {
		MEDIA,
		MEDIA_LABEL,
		PRIORITIES,
		PRIORITY_LABEL,
		STATUSES,
		STATUS_LABEL
	} from '#lib/fields.ts';
	import { store, StoreError, type LinkChanges, type StoreLink } from '#lib/store/index.ts';
	import { displayHost } from '#lib/url.ts';
	import { dateTime } from './format.ts';
	import Icon from './Icon.svelte';

	let {
		link,
		onclose,
		onorganise,
		onarchive,
		ondelete
	}: {
		link: StoreLink;
		onclose: () => void;
		onorganise: (kind?: 'tag' | 'project') => void;
		onarchive: () => void;
		ondelete: () => void;
	} = $props();

	let error = $state('');
	let copied = $state(false);

	const source = $derived($store.sources.find((s) => s.id === link.sourceId) ?? null);
	const tagsOf = $derived(
		link.tagIds.map((id) => $store.tags.find((t) => t.id === id)).filter((t) => t !== undefined)
	);
	const projectsOf = $derived(
		link.projectIds
			.map((id) => $store.projects.find((p) => p.id === id))
			.filter((p) => p !== undefined)
	);

	async function save(changes: Omit<LinkChanges, 'id'>) {
		error = '';
		try {
			await store.put({ id: link.id, ...changes });
		} catch (e) {
			error = e instanceof StoreError ? e.message : 'Something went wrong. Try again.';
		}
	}

	function saveText(field: 'title' | 'description' | 'notes', value: string) {
		const current = link[field] ?? '';
		if (value === current) return;
		if (field === 'title') {
			if (!value.trim()) return;
			return save({ title: value.trim() });
		}
		return save({ [field]: value.trim() ? value : null });
	}

	async function copy() {
		try {
			await navigator.clipboard.writeText(link.url);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			error = 'Could not copy the link.';
		}
	}

	const VIA: Record<string, string> = {
		paste: 'Paste',
		share: 'Phone share',
		shortcut: 'Shortcut',
		import: 'Import',
		api: 'API',
		bookmarklet: 'Bookmarklet'
	};
</script>

<aside class="detail" aria-label="Link details">
	<div class="head">
		<span class="site">
			{#if link.faviconPath}<img
					src="/media/{link.faviconPath}"
					alt=""
					width="16"
					height="16"
				/>{/if}
			<span>{source?.name ?? link.siteName ?? displayHost(link.url)}</span>
		</span>
		<!-- eslint-disable svelte/no-navigation-without-resolve -- a saved link points off-site -->
		<a
			class="btn ghost sm"
			href={link.url}
			target="_blank"
			rel="noopener noreferrer"
			onclick={() => store.opened(link.id).catch(() => {})}><Icon name="open" />Open</a
		>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
		<button class="icon-btn" type="button" aria-label="Copy the link" onclick={copy}>
			<Icon name={copied ? 'check' : 'copy'} />
		</button>
		<button class="icon-btn" type="button" aria-label="Close details" onclick={onclose}>
			<Icon name="x" />
		</button>
	</div>
	<div class="body">
		{#if link.imagePath}
			<img
				class="hero preview"
				src="/media/{link.imagePath}"
				srcset="/media/{link.imagePath.replace(
					/\.webp$/,
					'-320.webp'
				)} 320w, /media/{link.imagePath} 640w"
				sizes="(max-width: 759px) 100vw, 360px"
				alt=""
				width="640"
				height="336"
			/>
		{/if}
		<label class="field title">
			<span>Title</span>
			<input
				class="field-input"
				aria-label="Link title"
				value={link.title ?? ''}
				onchange={(e) => saveText('title', e.currentTarget.value)}
				onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
			/>
		</label>
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- a saved link points off-site -->
		<a class="url" href={link.url} target="_blank" rel="noopener noreferrer">{link.url}</a>

		<div class="two">
			<label class="field">
				<span
					>Source {#if !link.userSet.includes('source')}<em class="auto">Automatic</em>{/if}</span
				>
				<select
					class="field-input select"
					aria-label="Source"
					value={link.sourceId ?? ''}
					onchange={(e) => save({ sourceId: e.currentTarget.value || null })}
				>
					<option value="" disabled>None yet</option>
					{#each $store.sources as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
				</select>
			</label>
			<label class="field">
				<span
					>Media {#if !link.userSet.includes('media')}<em class="auto">Automatic</em>{/if}</span
				>
				<select
					class="field-input select"
					aria-label="Media"
					value={link.media ?? ''}
					onchange={(e) => save({ media: e.currentTarget.value })}
				>
					<option value="" disabled>Not known yet</option>
					{#each MEDIA as m (m)}<option value={m}>{MEDIA_LABEL[m]}</option>{/each}
				</select>
			</label>
		</div>

		<div class="field">
			<span>Tags</span>
			<div class="chips">
				{#each tagsOf as tag (tag.id)}
					<span class="chip">
						{tag.name}
						<button
							type="button"
							aria-label="Remove tag {tag.name}"
							onclick={() => save({ tagIds: link.tagIds.filter((t) => t !== tag.id) })}
							><Icon name="x" size={12} /></button
						>
					</span>
				{/each}
				<button class="chip add" type="button" onclick={() => onorganise('tag')}>
					<Icon name="plus" size={12} />Add tag
				</button>
			</div>
		</div>
		<div class="field">
			<span>Projects</span>
			<div class="chips">
				{#each projectsOf as project (project.id)}
					<span class="chip round">
						<span class="dot" style:--c="var(--dot-{project.color})"></span>{project.name}
						<button
							type="button"
							aria-label="Remove from {project.name}"
							onclick={() => save({ projectIds: link.projectIds.filter((p) => p !== project.id) })}
							><Icon name="x" size={12} /></button
						>
					</span>
				{/each}
				<button class="chip add" type="button" onclick={() => onorganise('project')}>
					<Icon name="plus" size={12} />Add to project
				</button>
			</div>
		</div>

		<div class="two">
			<div class="field">
				<span>Status</span>
				<div class="seg" role="radiogroup" aria-label="Status">
					<button
						type="button"
						role="radio"
						aria-checked={link.status === null}
						onclick={() => save({ status: null })}>None</button
					>
					{#each STATUSES as s (s)}
						<button
							type="button"
							role="radio"
							aria-checked={link.status === s}
							onclick={() => save({ status: s })}>{STATUS_LABEL[s]}</button
						>
					{/each}
				</div>
			</div>
			<div class="field">
				<span>Priority</span>
				<div class="seg" role="radiogroup" aria-label="Priority">
					<button
						type="button"
						role="radio"
						aria-checked={link.priority === null}
						onclick={() => save({ priority: null })}>None</button
					>
					{#each PRIORITIES as p (p)}
						<button
							type="button"
							role="radio"
							aria-checked={link.priority === p}
							onclick={() => save({ priority: p })}>{PRIORITY_LABEL[p]}</button
						>
					{/each}
				</div>
			</div>
		</div>

		<label class="field">
			<span
				>Description {#if link.description && !link.userSet.includes('description')}<em class="auto"
						>From the page</em
					>{/if}</span
			>
			<textarea
				class="field-input"
				rows="3"
				placeholder="The page gave no summary. Write one if you like."
				value={link.description ?? ''}
				onchange={(e) => saveText('description', e.currentTarget.value)}></textarea>
		</label>
		<label class="field">
			<span>Notes</span>
			<textarea
				class="field-input"
				rows="3"
				placeholder="Your own thoughts on it"
				value={link.notes ?? ''}
				onchange={(e) => saveText('notes', e.currentTarget.value)}></textarea>
		</label>

		<dl class="meta">
			<div>
				<dt>Saved</dt>
				<dd class="num" data-field="saved">{dateTime(link.createdAt)}</dd>
			</div>
			<div>
				<dt>Last edited</dt>
				<dd class="num" data-field="edited">{dateTime(link.updatedAt)}</dd>
			</div>
			<div>
				<dt>Last opened</dt>
				<dd class="num" data-field="opened">
					{link.openedAt ? dateTime(link.openedAt) : 'Not yet'}
				</dd>
			</div>
			<div>
				<dt>Saved from</dt>
				<dd>{VIA[link.savedVia] ?? link.savedVia}</dd>
			</div>
			{#if link.author}<div>
					<dt>Author</dt>
					<dd>{link.author}</dd>
				</div>{/if}
		</dl>
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		<div class="foot">
			<button class="btn sm" type="button" onclick={() => onorganise()}
				><Icon name="tag" />Organise</button
			>
			<button class="btn sm" type="button" onclick={onarchive}>
				<Icon name="archive" />{link.archivedAt ? 'Restore' : 'Archive'}
			</button>
			<button class="btn sm ghost negative" type="button" onclick={ondelete}>
				<Icon name="trash" />Delete
			</button>
		</div>
	</div>
</aside>

<style>
	.detail {
		display: flex;
		flex-direction: column;
		min-height: 0;
		height: 100dvh;
		position: sticky;
		top: 0;
		background: var(--surface);
		border-left: 1px solid var(--border);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 12px 12px 12px 16px;
	}
	.site {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1;
		min-width: 0;
		color: var(--muted);
	}
	.site span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.site img {
		border-radius: 3px;
	}
	.head a.btn {
		text-decoration: none;
	}
	.body {
		overflow: auto;
		padding: 4px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.hero {
		width: 100%;
		height: auto;
		max-height: 220px;
		object-fit: cover;
		border-radius: var(--radius-chip);
		background: var(--raised);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}
	.field > span {
		font-weight: 500;
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.auto {
		font-style: normal;
		font-size: var(--fs-small);
		font-weight: 400;
		color: var(--muted);
		padding: 1px 6px;
		border-radius: 4px;
		background: var(--raised);
	}
	.field.title input {
		height: 42px;
		font-size: 16px;
		font-weight: 600;
	}
	.url {
		margin-top: -10px;
		color: var(--muted);
		font-size: 13px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-decoration: none;
	}
	.url:hover {
		color: var(--text);
		text-decoration: underline;
	}
	.two {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 28px;
		padding: 0 4px 0 10px;
		border-radius: var(--radius-chip);
		background: var(--raised);
		font-size: 13px;
	}
	.chip.round {
		border-radius: 999px;
		background: var(--surface);
		border: 1px solid var(--border);
	}
	.chip button {
		display: inline-flex;
		padding: 3px;
		border-radius: 3px;
		color: var(--muted);
		cursor: pointer;
	}
	.chip button:hover {
		color: var(--text);
		background: var(--active);
	}
	.chip.add {
		padding: 0 10px;
		background: none;
		border: 1px dashed var(--control);
		color: var(--muted);
		cursor: pointer;
	}
	.chip.add:hover {
		color: var(--text);
	}
	.meta {
		margin: 0;
		border-top: 1px solid var(--rule);
		padding-top: 8px;
	}
	.meta div {
		display: grid;
		grid-template-columns: 124px 1fr;
		gap: 12px;
		min-height: 30px;
		align-items: center;
		font-size: 13px;
	}
	.meta dt {
		color: var(--muted);
	}
	.meta dd {
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.foot {
		display: flex;
		gap: 8px;
		padding-top: 12px;
		border-top: 1px solid var(--rule);
	}
	.foot .negative {
		margin-left: auto;
	}
	.error {
		margin: 0;
		color: var(--negative);
	}
	@media (max-width: 759px) {
		.detail {
			position: fixed;
			z-index: 31;
			left: 0;
			right: 0;
			bottom: 0;
			top: 6dvh;
			height: auto;
			border-left: 0;
			border-radius: 16px 16px 0 0;
		}
		.two {
			grid-template-columns: 1fr;
		}
	}
	@media (prefers-reduced-motion: no-preference) {
		.detail {
			animation: ls-panel-in var(--t-panel) var(--ease-out) both;
		}
		@media (max-width: 759px) {
			.detail {
				animation: ls-sheet-up var(--t-sheet) var(--ease-expo) both;
			}
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.detail {
			animation: ls-fade var(--t-fade-reduced) both;
		}
	}
</style>
