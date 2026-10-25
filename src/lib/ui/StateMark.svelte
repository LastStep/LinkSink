<script lang="ts">
	// One mark for a status or a priority, the same on every screen (ADR-0005). Decorative: the word beside it, or the
	// control's own name, carries the meaning.
	import type { Priority, Status } from '#lib/fields.ts';
	import { priorityMark, statusMark } from './marks.ts';

	let {
		kind,
		value,
		size = 14
	}: {
		kind: 'status' | 'priority';
		value: Status | Priority | string | number | null | undefined;
		size?: number;
	} = $props();

	const spec = $derived(
		kind === 'status' ? statusMark(value as Status | null) : priorityMark(value as Priority | null)
	);
	/** Bar heights for one to three bars, on a 16-unit grid, standing on its foot. */
	const BARS = [5, 8, 11];
</script>

<svg
	class="state-mark"
	data-kind={kind}
	data-mark={spec.kind === 'status' ? spec.shape : `bars-${spec.bars}`}
	width={size}
	height={size}
	viewBox="0 0 16 16"
	aria-hidden="true"
	style:color={spec.color}
>
	{#if spec.kind === 'status'}
		{#if spec.shape === 'dashed'}
			<circle
				cx="8"
				cy="8"
				r="5.75"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-dasharray="2.4 2.1"
			/>
		{:else if spec.shape === 'empty'}
			<circle cx="8" cy="8" r="5.75" fill="none" stroke="currentColor" stroke-width="1.5" />
		{:else if spec.shape === 'half'}
			<circle cx="8" cy="8" r="5.75" fill="none" stroke="currentColor" stroke-width="1.5" />
			<path d="M8 2.25a5.75 5.75 0 0 0 0 11.5Z" fill="currentColor" />
		{:else}
			<circle cx="8" cy="8" r="6.5" fill="currentColor" />
			<path
				d="m5.2 8.2 1.9 1.9 3.8-4"
				fill="none"
				stroke="var(--surface)"
				stroke-width="1.6"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		{/if}
	{:else if spec.bars === 0}
		<path d="M4.5 8h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
	{:else}
		{#each BARS as h, i (i)}
			<rect
				x={2.5 + i * 4}
				y={13.5 - h}
				width="3"
				height={h}
				rx="0.75"
				fill={i < spec.bars ? 'currentColor' : 'var(--control)'}
			/>
		{/each}
	{/if}
</svg>

<style>
	.state-mark {
		flex: none;
		display: block;
	}
</style>
