<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, children }: { title: string; children: Snippet } = $props();
</script>

<main class="wrap">
	<section class="card">
		<p class="brand">LinkSink</p>
		<h1>{title}</h1>
		{@render children()}
	</section>
</main>

<style>
	.wrap {
		min-height: 100dvh;
		display: grid;
		place-items: start center;
		padding: 15vh 16px 32px;
	}
	.card {
		width: 100%;
		max-width: 380px;
		background: var(--surface);
		border-radius: var(--radius-card);
		padding: var(--card-pad);
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.brand {
		font-weight: 600;
		letter-spacing: -0.01em;
		margin: 0;
	}
	h1 {
		font-size: var(--fs-title);
		font-weight: 500;
		letter-spacing: -0.015em;
		line-height: 1.2;
		margin: 0;
	}
	.card :global(form) {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.card :global(label) {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-weight: 500;
	}
	.card :global(input) {
		height: var(--control-height);
		padding: 0 10px;
		border: 1px solid var(--control);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--text);
		font: inherit;
	}
	.card :global(button) {
		height: var(--control-height);
		border: 0;
		border-radius: var(--radius-control);
		background: var(--primary);
		color: var(--primary-ink);
		font: inherit;
		font-weight: 500;
		cursor: pointer;
	}
	.card :global(.note) {
		margin: 0;
		color: var(--muted);
	}
	.card :global(.error) {
		margin: 0;
		color: var(--negative);
	}
	.card :global(a) {
		color: var(--text);
	}
</style>
