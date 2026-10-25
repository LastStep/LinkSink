<script lang="ts">
	// Status or priority as a radio list (ADR-0005, c3): none plus the three, each with its mark. A radio group for the
	// keyboard: Tab reaches the chosen one, the arrow keys move and choose. In the details and the organiser alike.
	import {
		PRIORITIES,
		PRIORITY_LABEL,
		STATUSES,
		STATUS_LABEL,
		type Priority,
		type Status
	} from '#lib/fields.ts';
	import StateMark from './StateMark.svelte';

	type Value = Status | Priority | null;
	let {
		kind,
		value,
		onchoose
	}: {
		kind: 'status' | 'priority';
		/** The current value; undefined when several links differ (nothing is checked). */
		value: Value | undefined;
		onchoose: (value: Value) => void;
	} = $props();

	const options = $derived<{ value: Value; label: string }[]>(
		kind === 'status'
			? [
					{ value: null, label: 'No status' },
					...STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))
				]
			: [
					{ value: null, label: 'No priority' },
					...PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))
				]
	);
	const checkedIndex = $derived(options.findIndex((o) => o.value === value));

	let buttons: HTMLButtonElement[] = $state([]);

	function key(event: KeyboardEvent, i: number) {
		const step =
			event.key === 'ArrowDown' || event.key === 'ArrowRight'
				? 1
				: event.key === 'ArrowUp' || event.key === 'ArrowLeft'
					? -1
					: 0;
		if (event.key === ' ' || event.key === 'Enter') {
			event.preventDefault();
			onchoose(options[i].value);
			return;
		}
		if (!step) return;
		event.preventDefault();
		const next = (i + step + options.length) % options.length;
		buttons[next]?.focus();
		onchoose(options[next].value);
	}
</script>

<div class="radios" role="radiogroup" aria-label={kind === 'status' ? 'Status' : 'Priority'}>
	{#each options as option, i (option.label)}
		<button
			bind:this={buttons[i]}
			type="button"
			role="radio"
			aria-checked={i === checkedIndex}
			tabindex={i === checkedIndex || (checkedIndex < 0 && i === 0) ? 0 : -1}
			onclick={() => onchoose(option.value)}
			onkeydown={(e) => key(e, i)}
		>
			<span class="dot-radio" aria-hidden="true"></span>
			<StateMark {kind} value={option.value} />
			<span class="label">{option.label}</span>
		</button>
	{/each}
</div>

<style>
	.radios {
		display: flex;
		flex-direction: column;
		gap: 0;
	}
	button {
		display: flex;
		align-items: center;
		gap: 10px;
		height: 28px;
		padding: 0 6px;
		margin: 0 -6px;
		border-radius: 4px;
		color: var(--text);
		text-align: left;
		cursor: pointer;
		transition: background-color var(--t-hover) var(--ease-out);
	}
	button:hover {
		background: var(--raised);
	}
	button:focus-visible {
		outline-offset: 0;
	}
	.label {
		white-space: nowrap;
	}
	button[aria-checked='false'] .label {
		color: var(--muted);
	}
	button[aria-checked='true'] .label {
		font-weight: 500;
	}
	/* the radio itself: a ring, filled with a dot when chosen */
	.dot-radio {
		flex: none;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		border: 1.5px solid var(--control);
		background: var(--surface);
		transition:
			border-color var(--t-hover) var(--ease-out),
			border-width var(--t-hover) var(--ease-out);
	}
	button:hover .dot-radio {
		border-color: var(--muted);
	}
	button[aria-checked='true'] .dot-radio {
		border: 4.5px solid var(--text);
	}
</style>
