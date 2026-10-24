<script lang="ts">
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const time = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
	const host = (url: string) => new URL(url).hostname.replace(/^www\./, '');
</script>

<main class="page">
	<header class="top">
		<p class="brand">LinkSink</p>
		<form method="post" action="?/signOut">
			<button class="ghost" type="submit">Log out</button>
		</form>
	</header>

	<h1>Links</h1>

	<form class="add" method="post" action="?/add">
		<input
			name="url"
			type="url"
			placeholder="Paste a link"
			aria-label="Link"
			required
			value={form?.url ?? ''}
		/>
		<input
			name="title"
			placeholder="Title (optional)"
			aria-label="Title"
			value={form?.title ?? ''}
		/>
		<button type="submit">Save</button>
	</form>
	{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}

	<form class="search" method="get" role="search">
		<input name="q" type="search" placeholder="Search" aria-label="Search" value={data.q} />
	</form>

	{#if data.links.length === 0}
		<p class="empty">
			{data.q ? `Nothing matches “${data.q}”.` : 'No links yet. Paste one above.'}
		</p>
	{:else}
		<ul class="list" aria-label="Links">
			{#each data.links as link (link.id)}
				<li class="row">
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- a saved link points off-site -->
					<a class="t" href={link.url} rel="noopener noreferrer" target="_blank"
						>{link.title || link.url}</a
					>
					<span class="meta">{host(link.url)}</span>
					<time class="meta num" datetime={new Date(link.createdAt).toISOString()}>
						{time.format(link.createdAt)}
					</time>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	.page {
		max-width: 880px;
		margin: 0 auto;
		padding: 16px 16px 48px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.brand {
		margin: 0;
		font-weight: 600;
		letter-spacing: -0.01em;
	}
	h1 {
		margin: 12px 0 0;
		font-size: var(--fs-title);
		font-weight: 500;
		letter-spacing: -0.015em;
	}
	input {
		height: var(--control-height);
		padding: 0 10px;
		border: 1px solid var(--control);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		min-width: 0;
	}
	button {
		height: var(--control-height);
		padding: 0 12px;
		border: 0;
		border-radius: var(--radius-control);
		background: var(--primary);
		color: var(--primary-ink);
		font: inherit;
		font-weight: 500;
		cursor: pointer;
	}
	button.ghost {
		background: transparent;
		color: var(--muted);
	}
	.add {
		display: grid;
		grid-template-columns: 2fr 1fr auto;
		gap: 8px;
	}
	.add input[name='url'] {
		height: 44px;
	}
	.add button {
		height: 44px;
	}
	.search input {
		width: 100%;
		max-width: 260px;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 4px;
		background: var(--surface);
		border-radius: var(--radius-card);
	}
	.row {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 14px;
		min-height: var(--row-height);
		padding: 0 10px;
	}
	.row + .row::before {
		content: '';
		position: absolute;
		left: 6px;
		right: 6px;
		top: 0;
		height: 1px;
		background: var(--rule);
	}
	.t {
		color: var(--text);
		text-decoration: none;
		font-weight: 450;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.meta {
		color: var(--muted);
		font-size: 13px;
		white-space: nowrap;
	}
	.empty {
		margin: 0;
		padding: 40px 24px;
		background: var(--surface);
		border-radius: var(--radius-card);
		color: var(--muted);
	}
	.error {
		margin: 0;
		color: var(--negative);
	}
	@media (max-width: 600px) {
		.add {
			grid-template-columns: 1fr;
		}
		.row {
			grid-template-columns: minmax(0, 1fr) auto;
		}
		.row time {
			display: none;
		}
	}
</style>
