<script lang="ts">
	// The open link: a third column on a wide screen, a sheet on a phone. Every field saves as it changes; a hand
	// edit of title, description, source or media is the person's from then on (the server's user_set).
	import { MEDIA, MEDIA_LABEL, type Priority, type Status } from '#lib/fields.ts';
	import { store, StoreError, type LinkChanges, type StoreLink } from '#lib/store/index.ts';
	import { displayHost } from '#lib/url.ts';
	import { dateTime } from './format.ts';
	import Icon from './Icon.svelte';
	import StateRadios from './StateRadios.svelte';

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

	/** A text box as tall as its text (the title wraps instead of being cut). */
	function autosize(node: HTMLTextAreaElement) {
		const fit = () => {
			node.style.height = 'auto';
			node.style.height = `${node.scrollHeight}px`;
		};
		fit();
		node.addEventListener('input', fit);
		const observer = new ResizeObserver(() => requestAnimationFrame(fit));
		observer.observe(node.parentElement ?? node);
		return {
			destroy() {
				node.removeEventListener('input', fit);
				observer.disconnect();
			}
		};
	}

	function titleKey(event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) {
		const field = event.currentTarget;
		if (event.key === 'Enter') {
			event.preventDefault();
			field.blur();
		} else if (event.key === 'Escape') {
			// Esc puts the title back and leaves the field; it does not close the details.
			event.preventDefault();
			event.stopPropagation();
			field.value = link.title ?? '';
			field.dispatchEvent(new Event('input'));
			field.blur();
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
	<div class="grab" aria-hidden="true"></div>
	<div class="head">
		<span class="site">
			{#if link.faviconPath}<span class="tile"
					><img src="/media/{link.faviconPath}" alt="" width="16" height="16" /></span
				>{/if}
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
		<!-- The title reads as text and turns into a field on click: it wraps, Enter or leaving it saves, Esc puts
		     it back. -->
		<textarea
			class="title-field"
			aria-label="Link title"
			rows="1"
			value={link.title ?? ''}
			placeholder={displayHost(link.url)}
			use:autosize
			onchange={(e) => saveText('title', e.currentTarget.value)}
			onkeydown={titleKey}></textarea>
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- a saved link points off-site -->
		<a class="url" href={link.url} target="_blank" rel="noopener noreferrer">{link.url}</a>

		<div class="props">
			<label class="prop">
				<span class="k"
					>Source{#if !link.userSet.includes('source')}<em class="auto">auto</em>{/if}</span
				>
				<select
					class="select prop-value"
					aria-label="Source"
					value={link.sourceId ?? ''}
					onchange={(e) => save({ sourceId: e.currentTarget.value || null })}
				>
					<option value="" disabled>None yet</option>
					{#each $store.sources as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
				</select>
			</label>
			<label class="prop">
				<span class="k"
					>Media{#if !link.userSet.includes('media')}<em class="auto">auto</em>{/if}</span
				>
				<select
					class="select prop-value"
					aria-label="Media"
					value={link.media ?? ''}
					onchange={(e) => save({ media: e.currentTarget.value })}
				>
					<option value="" disabled>Not known yet</option>
					{#each MEDIA as m (m)}<option value={m}>{MEDIA_LABEL[m]}</option>{/each}
				</select>
			</label>
		</div>

		<div class="two">
			<div class="field">
				<span class="label">Status</span>
				<StateRadios
					kind="status"
					value={link.status as Status | null}
					onchoose={(v) => save({ status: v as Status | null })}
				/>
			</div>
			<div class="field">
				<span class="label">Priority</span>
				<StateRadios
					kind="priority"
					value={link.priority as Priority | null}
					onchoose={(v) => save({ priority: v as Priority | null })}
				/>
			</div>
		</div>

		<div class="field">
			<span class="label">Tags</span>
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
			<span class="label">Projects</span>
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

		<label class="field">
			<span class="label"
				>Description {#if link.description && !link.userSet.includes('description')}<em class="auto"
						>from the page</em
					>{/if}</span
			>
			<textarea
				class="soft"
				rows="3"
				placeholder="The page gave no summary. Write one if you like."
				value={link.description ?? ''}
				use:autosize
				onchange={(e) => saveText('description', e.currentTarget.value)}></textarea>
		</label>
		<label class="field">
			<span class="label">Notes</span>
			<textarea
				class="soft"
				rows="3"
				placeholder="Your own thoughts on it"
				value={link.notes ?? ''}
				use:autosize
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
		<!-- Pinned to the panel's foot (sticky inside the one scroll area), so these never need a scroll. -->
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
	.grab {
		display: none;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 12px 12px 8px 20px;
	}
	.site {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1;
		min-width: 0;
		color: var(--muted);
	}
	.site > span:last-child {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tile {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		border-radius: 4px;
		background: var(--icon-tile);
	}
	.tile img {
		border-radius: 3px;
	}
	.head a.btn {
		text-decoration: none;
	}
	/* the one scroll area; the footer sticks to its foot */
	.body {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: 4px 20px 0;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.body > * {
		flex-shrink: 0;
	}
	.hero {
		width: 100%;
		height: auto;
		max-height: 220px;
		object-fit: cover;
		border-radius: var(--radius-chip);
		background: var(--raised);
		flex: none;
	}
	.title-field {
		display: block;
		width: calc(100% + 16px);
		margin: -2px -8px -16px;
		padding: 4px 8px;
		border: 1px solid transparent;
		border-radius: var(--radius-control);
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: 17px;
		line-height: 24px;
		font-weight: 500;
		letter-spacing: -0.01em;
		resize: none;
		overflow: hidden;
		outline: none;
		cursor: text;
		transition:
			background-color var(--t-hover) var(--ease-out),
			border-color var(--t-hover) var(--ease-out);
	}
	.title-field:hover {
		background: var(--raised);
	}
	.title-field:focus {
		background: var(--surface);
		border-color: var(--text);
	}
	.url {
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
	/* Source and Media: property rows, a 96 px label then the value drawn as text with a chevron */
	.props {
		display: flex;
		flex-direction: column;
		gap: 0;
	}
	.prop {
		display: grid;
		grid-template-columns: 96px minmax(0, 1fr);
		align-items: center;
		min-height: 32px;
	}
	.k {
		display: flex;
		align-items: baseline;
		gap: 6px;
		color: var(--muted);
		font-size: 13px;
	}
	.auto {
		font-style: normal;
		font-size: var(--fs-small);
		font-weight: 400;
		color: var(--faint);
	}
	.prop-value {
		justify-self: start;
		max-width: 100%;
		height: 30px;
		padding: 0 30px 0 8px;
		margin-left: -8px;
		border: 0;
		border-radius: 4px;
		background-color: transparent;
		color: var(--text);
		cursor: pointer;
		outline: none;
		min-width: 160px;
	}
	.prop-value:hover {
		background-color: var(--raised);
	}
	.prop-value:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 0;
	}
	.two {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}
	.label {
		font-weight: 500;
		font-size: 13px;
		display: flex;
		align-items: baseline;
		gap: 8px;
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
		height: 26px;
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
	/* Description and Notes: no border until focused, on the raised tone */
	.soft {
		display: block;
		width: 100%;
		min-height: 64px;
		padding: 8px 10px;
		border: 1px solid transparent;
		border-radius: var(--radius-control);
		background: var(--raised);
		color: var(--text);
		font: inherit;
		line-height: 20px;
		resize: none;
		overflow: hidden;
		outline: none;
		transition:
			background-color var(--t-hover) var(--ease-out),
			border-color var(--t-hover) var(--ease-out);
	}
	.soft::placeholder {
		color: var(--faint);
	}
	.soft:focus {
		background: var(--surface);
		border-color: var(--text);
	}
	.meta {
		margin: 0;
		padding-top: 4px;
	}
	.meta div {
		display: grid;
		grid-template-columns: 96px 1fr;
		gap: 12px;
		min-height: 28px;
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
		position: sticky;
		bottom: 0;
		z-index: 1;
		display: flex;
		gap: 8px;
		margin: auto -20px 0;
		padding: 12px 20px calc(12px + env(safe-area-inset-bottom));
		background: var(--surface);
		border-top: 1px solid var(--rule);
	}
	.foot .btn {
		height: 30px;
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
			box-shadow: 0 -8px 32px rgb(0 0 0 / 0.16);
		}
		.grab {
			display: block;
			flex: none;
			width: 36px;
			height: 4px;
			margin: 8px auto 0;
			border-radius: 2px;
			background: var(--control);
		}
		.head {
			padding: 4px 12px 4px 20px;
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
