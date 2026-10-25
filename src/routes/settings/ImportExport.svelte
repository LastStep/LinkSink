<script lang="ts">
	// Settings' Export and Import sections (T-0012). Choosing a file sends it to POST /api/import?preview, which
	// writes nothing and answers with what it holds; the preview (T-0019, loaded on first use) maps each folder, and
	// Import sends the file again with that mapping. The server decides and answers with a summary, shown here as
	// text (never as markup).
	import {
		FORMAT_LABEL,
		IMPORT_MAX_BYTES,
		sniffFormat,
		type ImportFormat
	} from '#lib/import-format.ts';
	import { resolve } from '$app/paths';
	import { store } from '#lib/store/index.ts';
	import type { Component, ComponentProps } from 'svelte';
	import type ImportPreviewType from './ImportPreview.svelte';
	import {
		importBody,
		IMPORT_WITH_OPTIONS,
		plural,
		type ImportChoices,
		type Preview
	} from './import-preview.ts';

	interface Summary {
		formatLabel: string;
		added: number;
		duplicates: number;
		/** Projects the import made (T-0019). */
		projectsMade: number;
		failed: number;
		failures: { line: number; reason: string }[];
	}

	let file = $state<File | null>(null);
	let format = $state<ImportFormat | null>(null);
	let busy = $state(false);
	let error = $state('');
	let summary = $state<Summary | null>(null);
	let preview = $state<Preview | null>(null);
	let reading = $state(false);
	let ImportPreview = $state<Component<ComponentProps<typeof ImportPreviewType>> | null>(null);
	let input: HTMLInputElement;
	/** Which choice of file a preview answers, so a slow answer for an earlier file is dropped. */
	let chosenAt = 0;
	const size = (bytes: number) =>
		bytes < 1024 * 1024
			? `${Math.max(1, Math.round(bytes / 1024))} KB`
			: `${(bytes / 1024 / 1024).toFixed(1)} MB`;

	async function choose(e: Event & { currentTarget: HTMLInputElement }) {
		const chosen = e.currentTarget.files?.[0] ?? null;
		error = '';
		summary = null;
		file = chosen;
		format = null;
		preview = null;
		const at = ++chosenAt;
		if (!chosen) return;
		if (chosen.size > IMPORT_MAX_BYTES) {
			error = 'That file is over 20 MB. Split it, or export fewer bookmarks.';
			return;
		}
		format = sniffFormat(await chosen.slice(0, 65_536).text());
		if (!format) {
			error = 'That is not a bookmarks file. Choose an HTML bookmarks export or a Pocket CSV.';
			return;
		}
		reading = true;
		try {
			const [res, module] = await Promise.all([
				fetch('/api/import?preview', {
					method: 'POST',
					headers: { 'content-type': 'application/octet-stream' },
					body: chosen
				}),
				ImportPreview ? null : import('./ImportPreview.svelte')
			]);
			if (module) ImportPreview = module.default;
			const body = await res.json().catch(() => null);
			if (at !== chosenAt) return;
			if (!res.ok) {
				error = body?.error ?? 'That file could not be read. Try again.';
				return;
			}
			preview = body as Preview;
		} catch {
			if (at === chosenAt) {
				error = 'The file did not reach LinkSink. Check the connection and try again.';
			}
		} finally {
			if (at === chosenAt) reading = false;
		}
	}

	/** Forgets the chosen file and its preview; nothing was saved. */
	function cancel() {
		chosenAt++;
		file = null;
		format = null;
		preview = null;
		reading = false;
		error = '';
		input.value = '';
	}

	async function start(choices: ImportChoices) {
		if (!file || busy) return;
		busy = true;
		error = '';
		summary = null;
		try {
			const res = await fetch('/api/import', {
				method: 'POST',
				headers: { 'content-type': IMPORT_WITH_OPTIONS },
				body: importBody(choices, file)
			});
			const body = await res.json().catch(() => null);
			if (!res.ok) {
				error = body?.error ?? 'That file could not be imported. Try again.';
				return;
			}
			summary = body as Summary;
			chosenAt++;
			file = null;
			format = null;
			preview = null;
			input.value = '';
			store.refresh().catch(() => {});
			store.checkDetails();
		} catch {
			error = 'The upload did not reach LinkSink. Check the connection and try again.';
		} finally {
			busy = false;
		}
	}
</script>

<section class="card section" aria-labelledby="export-h">
	<h2 id="export-h">Export</h2>
	<p class="muted">
		Every link, archived ones included. The bookmarks file opens in any browser or bookmarking tool,
		with a folder per project; the JSON file holds everything on every link.
	</p>
	<div class="actions">
		<a class="btn" href={resolve('/api/export.html')} download data-sveltekit-reload
			>Download bookmarks (HTML)</a
		>
		<a class="btn" href={resolve('/api/export.json')} download data-sveltekit-reload
			>Download everything (JSON)</a
		>
	</div>
</section>

<section class="card section" aria-labelledby="import-h">
	<h2 id="import-h">Import</h2>
	<p class="muted">
		A bookmarks file from a browser, Raindrop, Pinboard or linkding, or Pocket’s CSV export. You see
		what it holds and choose what each folder becomes before anything is saved; links you already
		have are skipped. Details fill in over the next minutes.
	</p>
	<div class="actions">
		<label class="btn">
			Choose a file
			<input
				bind:this={input}
				class="sr-only"
				type="file"
				accept=".html,.htm,.csv,text/html,text/csv"
				aria-label="Bookmarks file to import"
				onchange={choose}
			/>
		</label>
	</div>
	{#if file}
		<p class="chosen" data-testid="import-chosen">
			<span class="name">{file.name}</span>
			<span class="muted">· {size(file.size)}{format ? ` · ${FORMAT_LABEL[format]}` : ''}</span>
		</p>
	{/if}
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	{#if reading}<p class="muted" aria-live="polite">Reading the file…</p>{/if}
	{#if file && preview && ImportPreview}
		{#key preview}
			<ImportPreview {preview} {busy} onimport={start} oncancel={cancel} />
		{/key}
	{/if}
	<div aria-live="polite">
		{#if summary}
			<div class="summary" data-testid="import-summary">
				<p>
					{summary.formatLabel}: <strong>{plural(summary.added, 'link')} added</strong>.
				</p>
				<ul class="counts">
					{#if summary.projectsMade}<li>{plural(summary.projectsMade, 'project')} made</li>{/if}
					<li>{plural(summary.duplicates, 'duplicate')} skipped</li>
					<li>{plural(summary.failed, 'line')} could not be read</li>
				</ul>
				{#if summary.failures.length}
					<ul class="failures muted" aria-label="Lines that could not be read">
						{#each summary.failures as f (f.line)}
							<li>Line {f.line}: {f.reason}</li>
						{/each}
						{#if summary.failed > summary.failures.length}
							<li>and {plural(summary.failed - summary.failures.length, 'more')}</li>
						{/if}
					</ul>
				{/if}
			</div>
		{/if}
	</div>
</section>

<style>
	.section {
		padding: var(--card-pad);
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	h2 {
		margin: 0;
		font-size: var(--fs-section);
		font-weight: 500;
	}
	p {
		margin: 0;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 4px;
	}
	label.btn:focus-within {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.chosen {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		font-size: 13px;
		min-width: 0;
	}
	.name {
		overflow-wrap: anywhere;
	}
	.error {
		color: var(--negative);
	}
	.summary {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.summary strong {
		font-weight: 500;
	}
	ul {
		margin: 0;
		padding-left: 18px;
	}
	.failures {
		font-size: 13px;
		overflow-wrap: anywhere;
	}
	@media (max-width: 759px) {
		.actions .btn {
			flex: 1 1 100%;
		}
	}
</style>
