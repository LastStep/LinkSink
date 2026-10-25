<script lang="ts">
	// The import preview (T-0019): what the chosen file holds, and what each of its folders becomes, before anything
	// is saved. Loaded only once a file is chosen. The server checks every choice again before it writes.
	import { store } from '#lib/store/index.ts';
	import { plural, type FolderChoice, type ImportChoices, type Preview } from './import-preview.ts';

	let {
		preview,
		busy,
		onimport,
		oncancel
	}: {
		preview: Preview;
		busy: boolean;
		onimport: (choices: ImportChoices) => void;
		oncancel: () => void;
	} = $props();

	type Kind = FolderChoice['kind'];

	interface Row {
		kind: Kind;
		/** Each name kept apart, so switching between choices keeps what was typed. */
		projectName: string;
		tagName: string;
		projectId: string;
	}

	const projects = $derived($store.projects);

	function startRow(folder: Preview['folders'][number]): Row {
		const s = folder.suggested;
		const own = folder.path[folder.path.length - 1];
		return {
			kind: s.kind,
			projectName: s.kind === 'new' ? s.name : folder.path.join(' / ').slice(0, 64),
			tagName: (s.kind === 'tag' ? s.name : own).toLowerCase().slice(0, 64),
			projectId: s.kind === 'existing' ? s.projectId : ''
		};
	}

	// The rows start on the server's defaults; the preview is replaced (never edited) when another file is chosen.
	// svelte-ignore state_referenced_locally
	let rows = $state<Row[]>(preview.folders.map(startRow));
	let keepTags = $state(true);
	let pocketReadDone = $state(true);

	const KINDS: [Kind, string][] = [
		['new', 'New project'],
		['existing', 'Existing project'],
		['tag', 'Tag'],
		['none', 'No project']
	];

	function choiceOf(row: Row): FolderChoice {
		switch (row.kind) {
			case 'new':
				return { kind: 'new', name: row.projectName };
			case 'tag':
				return { kind: 'tag', name: row.tagName };
			case 'existing':
				return { kind: 'existing', projectId: row.projectId };
			default:
				return { kind: 'none' };
		}
	}

	function pick(row: Row, kind: Kind) {
		row.kind = kind;
		if (kind === 'existing' && !projects.some((p) => p.id === row.projectId)) {
			row.projectId = projects[0]?.id ?? '';
		}
	}

	const blank = (s: string) => s.trim() === '';
	const missing = $derived(
		rows.filter(
			(r) =>
				(r.kind === 'new' && blank(r.projectName)) ||
				(r.kind === 'tag' && blank(r.tagName)) ||
				(r.kind === 'existing' && !projects.some((p) => p.id === r.projectId))
		).length
	);
	/** What the choices add up to: "3 new projects · 1 tag · 2 folders to Unsorted". */
	const distinct = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) === i).length;
	const tally = $derived.by(() => {
		const of = (kind: Kind, value: (r: Row) => string) =>
			distinct(rows.filter((r) => r.kind === kind).map((r) => value(r).trim().toLowerCase()));
		const made = of('new', (r) => r.projectName);
		const reused = of('existing', (r) => r.projectId);
		const tagged = of('tag', (r) => r.tagName);
		const none = rows.filter((r) => r.kind === 'none').length;
		return [
			made && plural(made, 'new project'),
			reused && plural(reused, 'existing project'),
			tagged && plural(tagged, 'tag'),
			none && `${plural(none, 'folder')} to Unsorted`
		]
			.filter(Boolean)
			.join(' · ');
	});

	function submit() {
		if (busy || missing) return;
		const mapping: Record<string, FolderChoice> = {};
		preview.folders.forEach((f, i) => (mapping[f.key] = choiceOf(rows[i])));
		onimport({ mapping, keepTags, pocketReadDone });
	}
</script>

<div class="preview" data-testid="import-preview">
	<dl class="facts" aria-label="What the file holds">
		<div>
			<dt>Links found</dt>
			<dd class="num">{preview.links.toLocaleString()}</dd>
		</div>
		<div>
			<dt>Already saved</dt>
			<dd class="num">{preview.duplicates.toLocaleString()}</dd>
		</div>
		<div>
			<dt>Could not be read</dt>
			<dd class="num">{preview.unreadable.toLocaleString()}</dd>
		</div>
		<div>
			<dt>Folders</dt>
			<dd class="num">{preview.folders.length.toLocaleString()}</dd>
		</div>
	</dl>
	{#if preview.failures.length}
		<ul class="failures muted" aria-label="Lines that could not be read">
			{#each preview.failures as f (f.line)}
				<li>Line {f.line}: {f.reason}</li>
			{/each}
			{#if preview.unreadable > preview.failures.length}
				<li>and {plural(preview.unreadable - preview.failures.length, 'more')}</li>
			{/if}
		</ul>
	{/if}

	{#if preview.folders.length}
		<div class="folders-head">
			<h3 id="folders-h">What each folder becomes</h3>
			<p class="muted" data-testid="import-tally">{tally}</p>
		</div>
		<ul class="folders" aria-labelledby="folders-h" data-testid="import-folders">
			{#each preview.folders as folder, i (folder.key)}
				{@const row = rows[i]}
				{@const label = folder.path.join(' › ')}
				<li class="folder" data-folder={folder.path.join('/')}>
					<div class="where">
						<span class="path" title={label}>
							{#each folder.path as part, j (j)}
								{#if j < folder.path.length - 1}<span class="parent">{part}</span><span
										class="sep"
										aria-hidden="true">›</span
									>{:else}<span class="own">{part}</span>{/if}
							{/each}
						</span>
						<span class="count muted num">{plural(folder.count, 'link')}</span>
					</div>
					<div class="choice">
						<select
							class="field-input select kind"
							aria-label="What {label} becomes"
							value={row.kind}
							onchange={(e) => pick(row, e.currentTarget.value as Kind)}
						>
							{#each KINDS as [kind, text] (kind)}
								<option value={kind} disabled={kind === 'existing' && !projects.length}
									>{text}</option
								>
							{/each}
						</select>
						{#if row.kind === 'new'}
							<input
								class="field-input name"
								aria-label="New project name for {label}"
								aria-invalid={blank(row.projectName)}
								maxlength="64"
								bind:value={row.projectName}
							/>
						{:else if row.kind === 'tag'}
							<input
								class="field-input name"
								aria-label="Tag name for {label}"
								aria-invalid={blank(row.tagName)}
								maxlength="64"
								bind:value={row.tagName}
							/>
						{:else if row.kind === 'existing'}
							<select
								class="field-input select name"
								aria-label="Project for {label}"
								bind:value={row.projectId}
							>
								{#each projects as p (p.id)}
									<option value={p.id}>{p.name}</option>
								{/each}
							</select>
						{:else}
							<span class="none muted">Links land in Unsorted</span>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
	{#if preview.loose}
		<p class="muted loose">
			{plural(preview.loose, 'link')} at the top of the file, in no folder, land in Unsorted.
		</p>
	{/if}

	<div class="switches">
		<label class="switch">
			<input type="checkbox" bind:checked={keepTags} />
			<span
				>Keep the file’s tags{#if preview.tags.length}<span class="muted"
						>{` · ${plural(preview.tags.length, 'tag')} in it`}</span
					>{/if}</span
			>
		</label>
		{#if preview.pocketRead}
			<label class="switch">
				<input type="checkbox" bind:checked={pocketReadDone} />
				<span>Mark links you’d read in Pocket as Done</span>
			</label>
		{/if}
	</div>

	<div class="go">
		<p class="adding" aria-live="polite">
			{#if missing}
				<span class="error"
					>{missing === 1 ? 'One folder needs' : `${missing} folders need`} a name or a project.</span
				>
			{:else}
				<strong>{plural(preview.adding, 'link')}</strong> will be added{#if preview.duplicates}, {plural(
						preview.duplicates,
						'duplicate'
					)} skipped{/if}.
			{/if}
		</p>
		<div class="actions">
			<button class="btn primary" type="button" disabled={busy || missing > 0} onclick={submit}>
				{busy ? 'Importing…' : 'Import'}
			</button>
			<button class="btn" type="button" disabled={busy} onclick={oncancel}>Cancel</button>
		</div>
	</div>
</div>

<style>
	.preview {
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-width: 0;
	}
	.facts {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 2px;
		margin: 0;
		background: var(--raised);
		border-radius: var(--radius-control);
		padding: 2px;
	}
	.facts div {
		padding: 8px 12px;
		background: var(--surface);
		border-radius: 4px;
		min-width: 0;
	}
	.facts dt {
		font-size: var(--fs-small);
		color: var(--muted);
	}
	.facts dd {
		margin: 0;
		font-size: 20px;
		line-height: 28px;
		font-weight: 500;
		letter-spacing: -0.01em;
	}
	.failures {
		margin: 0;
		padding-left: 18px;
		font-size: 13px;
		overflow-wrap: anywhere;
	}
	.folders-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 4px 12px;
	}
	h3 {
		margin: 0;
		font-size: var(--fs-body);
		font-weight: 500;
	}
	.folders-head p {
		font-size: 13px;
	}
	.folders {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: 50vh;
		overflow-y: auto;
		overscroll-behavior: contain;
		border: 1px solid var(--border);
		border-radius: var(--radius-control);
	}
	.folder {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 360px);
		align-items: center;
		gap: 12px;
		padding: 8px 12px;
	}
	.folder + .folder {
		border-top: 1px solid var(--rule);
	}
	.where {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.path {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.parent {
		color: var(--muted);
	}
	.sep {
		color: var(--faint);
		margin: 0 5px;
	}
	.own {
		font-weight: 500;
	}
	.count {
		font-size: var(--fs-small);
		line-height: 16px;
	}
	.choice {
		display: grid;
		grid-template-columns: 148px minmax(0, 1fr);
		gap: 8px;
		align-items: center;
	}
	.choice .field-input {
		height: 32px;
	}
	.choice [aria-invalid='true'] {
		border-color: var(--negative);
	}
	.none {
		font-size: 13px;
		padding-left: 2px;
	}
	.loose {
		font-size: 13px;
	}
	.switches {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.switch {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
		width: fit-content;
	}
	.switch input {
		width: 16px;
		height: 16px;
		margin: 0;
		accent-color: var(--text);
		flex: none;
	}
	.go {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px 16px;
		padding-top: 4px;
	}
	.adding strong {
		font-weight: 500;
	}
	.error {
		color: var(--negative);
	}
	.actions {
		display: flex;
		gap: 8px;
	}
	@media (max-width: 759px) {
		.facts {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.folder {
			grid-template-columns: minmax(0, 1fr);
			gap: 6px;
		}
		.choice {
			grid-template-columns: 136px minmax(0, 1fr);
		}
		.go,
		.actions {
			flex-direction: column;
			align-items: stretch;
			width: 100%;
		}
		.actions .btn {
			width: 100%;
		}
	}
</style>
