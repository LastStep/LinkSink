<script lang="ts">
	// The bar under a selection: organise, archive (or restore) or delete the selected links at once.
	import Icon from './Icon.svelte';

	let {
		count,
		archive,
		onall,
		onorganise,
		onarchive,
		ondelete,
		ondone
	}: {
		count: number;
		/** True in Archive, where the bar restores instead. */
		archive: boolean;
		onall: () => void;
		onorganise: () => void;
		onarchive: () => void;
		ondelete: () => void;
		ondone: () => void;
	} = $props();
</script>

<div class="bulkbar" role="toolbar" aria-label="Selected links">
	<span class="num"><strong>{count}</strong> selected</span>
	<button class="btn ghost sm" type="button" onclick={onall}>All</button>
	<span class="grow"></span>
	<button class="btn sm" type="button" disabled={count === 0} onclick={onorganise}
		><Icon name="tag" />Organise</button
	>
	<button class="btn sm" type="button" disabled={count === 0} onclick={onarchive}>
		<Icon name="archive" />{archive ? 'Restore' : 'Archive'}
	</button>
	<button class="btn sm negative" type="button" disabled={count === 0} onclick={ondelete}
		><Icon name="trash" />Delete</button
	>
	<button class="btn ghost sm" type="button" onclick={ondone}>Done</button>
</div>

<style>
	.bulkbar {
		position: sticky;
		bottom: 16px;
		z-index: 10;
		margin-top: 16px;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px 8px 14px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-card);
		box-shadow: 0 8px 24px rgb(0 0 0 / 0.12);
	}
	.grow {
		flex: 1;
	}
	strong {
		font-weight: 600;
	}
	@media (prefers-reduced-motion: no-preference) {
		.bulkbar {
			animation: ls-rise var(--t-rise) var(--ease-out) both;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.bulkbar {
			animation: ls-fade var(--t-fade-reduced) both;
		}
	}
	@media (max-width: 759px) {
		.bulkbar {
			/* above the phone's tab bar */
			bottom: calc(72px + env(safe-area-inset-bottom));
			flex-wrap: wrap;
			padding: 8px;
			gap: 6px;
		}
	}
</style>
