<script lang="ts">
	// The colours a project or tag may take, as a radio group of dots.
	import { COLORS } from '#lib/fields.ts';

	let {
		value,
		label,
		none = false,
		onpick
	}: {
		value: string | null;
		label: string;
		none?: boolean;
		onpick: (c: string | null) => void;
	} = $props();
</script>

<div class="swatches" role="radiogroup" aria-label={label}>
	{#if none}
		<button
			type="button"
			role="radio"
			class="sw none"
			aria-checked={value === null}
			aria-label="No colour"
			onclick={() => onpick(null)}
		></button>
	{/if}
	{#each COLORS as c (c)}
		<button
			type="button"
			role="radio"
			class="sw"
			aria-checked={value === c}
			aria-label={c}
			style:--c="var(--dot-{c})"
			onclick={() => onpick(c)}
		></button>
	{/each}
</div>

<style>
	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.sw {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	.sw::after {
		content: '';
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--c);
	}
	.sw.none::after {
		background: none;
		border: 1.5px dashed var(--control);
		box-sizing: border-box;
	}
	.sw[aria-checked='true'] {
		box-shadow: inset 0 0 0 1.5px var(--text);
	}
	.sw:hover {
		background: var(--raised);
	}
</style>
