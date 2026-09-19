// Browser half of the chinese-script-policy plugin: the settings card that turns
// the write guard on or off, warns instead of blocks, or drops one axis.
//
// SHAPE MATTERS, and the shape is not the DYNAMIC runner's. The host concatenates
// every client half named in the page's module list into ONE script, so each file
// must register ITSELF:
//
//   window.__ModuleLoader__.load({ id: "<loader row name>", factory: (require) => { … } })
//
// The first version of this file was a bare async function body ending in
// `return {...}` - the shape the dynamic runner evaluates, where React arrives as
// a closure symbol. Concatenated into that one script, its top-level `return` is a
// SyntaxError, so the WHOLE bundle never ran and the page reported
// "bundle … loaded without registering …" for every client plugin, not just this
// one. Hence: self-registering wrapper, CommonJS inside the factory, React through
// require("react"). No JSX, no TypeScript, no ESM.
//
// The card mirrors the shipped plugin cards: an <li> whose header row (name +
// description + chevron) collapses the body, an "unsaved" chip while the draft
// differs from what is stored, and a footer with revert/save that folds the card
// back up once the save lands. The styles are inline on purpose - the shipped
// cards' class names are build-hashed internals, not a contract to depend on - but
// they use the same design tokens, so this card sits in the same tab without
// looking foreign.
window.__ModuleLoader__.load({
	id: 'chinese-script-policy',
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
		const React = require('react');
		// Optional: only for the chevron. A shell that does not ship it falls back
		// to a text glyph.
		let IconChevronDownOutline14;
		try {
			const primitives = require('@deepseek-ai/dsh-client-ui-primitives');
			if (primitives && typeof primitives.IconChevronDownOutline14 === 'function') {
				IconChevronDownOutline14 = primitives.IconChevronDownOutline14;
			}
		} catch { /* fall back to the text glyph */ }

		const NAMESPACE = 'chinese-script-policy';
		const LABELS = {
			zh: {
				title: '中文用字規範（寫入檢查）',
				descPrefix: '寫入前若內容含：',
				descSeparator: '、',
				descSuffix: '，就依下面的設定擋下或警告。',
				descNone: '寫入檢查已開啟，但目前沒有任何項目在檢查。',
				descScriptSkipped: '（不檢查腳本）',
				partScriptTraditional: '簡體專有字',
				partScriptSimplified: '繁體專有字',
				partRegister: '粵語口語',
				partJapanese: '日文專有字詞',
				partFileTypes: 'Windows 腳本檔類型',
				enabled: '啟用寫入檢查',
				enabledOff: '寫入檢查已關閉，寫入不再被檢查。',
				mode: '發現時',
				modeBlock: '擋下，要求先改好',
				modeWarn: '只警告，仍然寫入',
				axes: '其他軸：語體與日文',
				scriptLabel: '腳本（這個專案存哪一種寫法）',
				scriptTraditional: '要求繁體（抓到簡體專有字就處理）',
				scriptSimplified: '要求簡體（抓到繁體專有字就處理）',
				scriptOff: '不檢查腳本（只查語體與日文）',
				axisRegister: '粵語口語（語體）',
				axisJapanese: '日文專有字詞',
				fileTypesLabel: 'Windows 腳本檔類型（.ps1／.cmd）',
				fileTypesOff: '不檢查檔類型',
				fileTypesWarn: '只警告，仍然寫入（預設）',
				fileTypesBlock: '擋下：.ps1 含非 ASCII 就拒絕',
				save: '儲存',
				discard: '回復已儲存',
				saving: '儲存中…',
				unsaved: '尚未儲存',
				failed: '儲存失敗，請再試一次。',
				readOnly: '這台伺服器不允許從介面修改設定。',
			},
			en: {
				title: 'Chinese script policy (write guard)',
				descPrefix: 'Content containing ',
				descSeparator: ', ',
				descSuffix: ' is blocked or warned about, per the setting below.',
				descNone: 'The guard is on, but no check is selected.',
				descScriptSkipped: ' (script axis off)',
				partScriptTraditional: 'Simplified-only glyphs',
				partScriptSimplified: 'Traditional-only glyphs',
				partRegister: 'Cantonese colloquial markers',
				partJapanese: 'Japanese-only kanji and words',
				partFileTypes: 'Windows script file types',
				enabled: 'Enable the write guard',
				enabledOff: 'The guard is off; writes are no longer checked.',
				mode: 'When something is found',
				modeBlock: 'Block the write and ask for a fix',
				modeWarn: 'Warn only, still write',
				axes: 'Other axes: register and Japanese',
				scriptLabel: 'Script this project stores',
				scriptTraditional: 'Require Traditional (flag Simplified-only glyphs)',
				scriptSimplified: 'Require Simplified (flag Traditional-only glyphs)',
				scriptOff: 'Do not check the script axis (register and Japanese only)',
				axisRegister: 'Cantonese colloquial register',
				axisJapanese: 'Japanese-only kanji and words',
				fileTypesLabel: 'Windows script file types (.ps1 / .cmd)',
				fileTypesOff: 'Do not check the file type',
				fileTypesWarn: 'Warn only, still write (default)',
				fileTypesBlock: 'Block a .ps1 whose content has non-ASCII',
				save: 'Save',
				discard: 'Revert',
				saving: 'Saving…',
				unsaved: 'Unsaved',
				failed: 'Saving failed; please try again.',
				readOnly: 'This server does not allow settings to be changed here.',
			},
		};

		// The line under the card title, and the only text a user sees while the card is
		// collapsed - so it is composed from the STORED switches instead of being frozen
		// at the default state. The frozen version named Simplified-only glyphs even
		// after the script axis was switched to Simplified, which contradicted the radio
		// label two lines below it in the same card. Only what is actually being checked
		// gets listed, and the wording names those glyphs as the TRIGGER ("content
		// containing…"), because the older phrasing read like a label for what is being
		// looked for - on the Simplified axis a reader took the whole guard to be reversed.
		// Regression test: scripts/plugin-selftest.mjs renders the card once
		// per script setting and reads this line back through the real dictionary.
		const describe = (state, t) => {
			if (!state.enabled) return t('enabledOff');
			const parts = [];
			if (state.script === 'traditional') parts.push(t('partScriptTraditional'));
			else if (state.script === 'simplified') parts.push(t('partScriptSimplified'));
			if (state.register) parts.push(t('partRegister'));
			if (state.japanese) parts.push(t('partJapanese'));
			// The file-type trap is not a glyph axis, but the guard checks it, and the
			// collapsed card is the only place a user sees what the guard checks.
			if (state.fileTypes !== 'off') parts.push(t('partFileTypes'));
			if (!parts.length) return t('descNone');
			// The "script axis off" note sits INSIDE the list rather than after the
			// sentence: the sentence ends in "…is blocked or warned about, per the
			// setting below", and a note parked after the full stop read like an
			// afterthought.
			const list = parts.join(t('descSeparator')) + (state.script === 'off' ? t('descScriptSkipped') : '');
			return t('descPrefix') + list + t('descSuffix');
		};

		const name = 'chinese-script-policy-settings';
		const inject = ['slots', 'locale', 'settingsScope'];

		// The same tokens the shipped cards use, so the card belongs to the tab.
		const TOKENS = {
			primary: 'var(--dsw-alias-label-primary)',
			secondary: 'var(--dsw-alias-label-secondary)',
			tertiary: 'var(--dsw-alias-label-tertiary)',
			error: 'var(--dsw-alias-label-error)',
			borderL2: 'var(--dsw-alias-border-l2)',
			borderL4: 'var(--dsw-alias-border-l4)',
			layer2: 'var(--dsw-alias-bg-layer-2)',
			layer3: 'var(--dsw-alias-bg-layer-3)',
		};

		function apply(ctx) {
			const t = ctx.locale.bind(NAMESPACE);
			ctx.effect(() => ctx.locale.register(NAMESPACE, LABELS), 'chinese-script-policy: settings dictionaries');
			const scope = ctx.settingsScope.bind({ namespace: NAMESPACE });

			// The section and the plugin row use the same defaults as index.mjs; this
			// is only what the form shows before anything has been stored. A section
			// stored by an older version used a boolean here: `true` meant Traditional,
			// `false` meant "do not check", so both keep their meaning.
			const read = () => {
				const snapshot = scope.getSnapshot() || {};
				const value = snapshot.value || {};
				return {
					enabled: value.enabled !== false,
					mode: value.mode === 'warn' ? 'warn' : 'block',
					script: value.script === 'simplified' ? 'simplified'
						: (value.script === 'off' || value.script === false) ? 'off'
							: 'traditional',
					register: value.register !== false,
					japanese: value.japanese !== false,
					// Same three-way default as index.mjs: warn, because this rule acts on
					// other people's files and must not block them by default.
					fileTypes: value.fileTypes === 'off' ? 'off' : (value.fileTypes === 'block' ? 'block' : 'warn'),
				};
			};

			const checkbox = (key, label, checked, onChange, disabled) => React.createElement('label', {
				key,
				style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', lineHeight: '1.5', color: TOKENS.primary },
			}, [
				React.createElement('input', {
					key: 'input',
					type: 'checkbox',
					checked,
					disabled,
					onChange: (event) => onChange(event.target.checked),
				}),
				React.createElement('span', { key: 'label' }, label),
			]);

			const radio = (key, group, label, checked, onChange, disabled) => React.createElement('label', {
				key,
				style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', lineHeight: '1.5', color: TOKENS.primary },
			}, [
				React.createElement('input', {
					key: 'input',
					type: 'radio',
					name: group,
					checked,
					disabled,
					onChange,
				}),
				React.createElement('span', { key: 'label' }, label),
			]);

			const buttonStyle = (primary, disabled) => ({
				appearance: 'none',
				font: 'inherit',
				cursor: disabled ? 'default' : 'pointer',
				border: primary ? '1px solid transparent' : '1px solid ' + TOKENS.borderL2,
				borderRadius: '8px',
				padding: '5px 14px',
				fontSize: '13px',
				lineHeight: '1.5',
				opacity: disabled ? 0.5 : 1,
				background: primary ? TOKENS.primary : 'transparent',
				color: primary ? TOKENS.layer3 : TOKENS.secondary,
			});

			const Card = () => {
				const [open, setOpen] = React.useState(false);
				const [stored, setStored] = React.useState(read);
				const [draft, setDraft] = React.useState(read);
				const [saving, setSaving] = React.useState(false);
				const [failed, setFailed] = React.useState(false);
				const snapshot = scope.getSnapshot() || {};
				const writable = snapshot.writable !== false;
				const dirty = JSON.stringify(draft) !== JSON.stringify(stored);
				const disabled = !writable || saving;

				const edit = (patch) => {
					setFailed(false);
					setDraft({ ...draft, ...patch });
				};
				const save = async () => {
					setSaving(true);
					setFailed(false);
					try {
						for (const field of Object.keys(draft)) await scope.set(field, draft[field]);
						setStored(read());
						// Same habit as the shipped cards: a saved card folds back up.
						setOpen(false);
					} catch {
						setFailed(true);
					}
					setSaving(false);
				};
				const revert = () => {
					setFailed(false);
					setDraft(read());
				};

				const muted = { color: TOKENS.tertiary, fontSize: '12px', lineHeight: '1.5', margin: 0 };
				const sectionLabel = { ...muted, color: TOKENS.secondary, margin: '2px 0 0' };

				const header = React.createElement('button', {
					key: 'header',
					type: 'button',
					'aria-expanded': open,
					'aria-label': (open ? 'collapse' : 'expand') + ': ' + t('title'),
					onClick: () => setOpen(!open),
					style: {
						appearance: 'none',
						width: '100%',
						font: 'inherit',
						color: 'inherit',
						textAlign: 'left',
						cursor: 'pointer',
						background: 'transparent',
						border: 0,
						borderRadius: '12px',
						display: 'flex',
						alignItems: 'center',
						gap: '12px',
						padding: '14px 16px',
					},
				}, [
					React.createElement('span', { key: 'headText', style: { display: 'flex', flexDirection: 'column', flex: 1, gap: '4px', minWidth: 0 } }, [
						React.createElement('span', { key: 'name', style: { color: TOKENS.primary, fontSize: '15px', fontWeight: 600, lineHeight: '1.4' } }, t('title')),
						React.createElement('span', { key: 'description', style: { color: TOKENS.tertiary, fontSize: '13px', lineHeight: '1.5' } }, describe(stored, t)),
					]),
					dirty ? React.createElement('span', {
						key: 'unsaved',
						style: { flex: 'none', color: TOKENS.tertiary, border: '1px solid ' + TOKENS.borderL2, borderRadius: '999px', padding: '1px 8px', fontSize: '12px', lineHeight: '1.5' },
					}, t('unsaved')) : null,
					IconChevronDownOutline14
						? React.createElement(IconChevronDownOutline14, { key: 'chevron', style: { flex: 'none', color: TOKENS.tertiary, transition: 'transform .16s', transform: open ? 'rotate(180deg)' : 'none' } })
						: React.createElement('span', { key: 'chevron', style: { flex: 'none', color: TOKENS.tertiary, fontSize: '12px', transition: 'transform .16s', transform: open ? 'rotate(180deg)' : 'none' } }, '▾'),
				]);

				const body = open ? React.createElement('div', {
					key: 'body',
					style: { borderTop: '0.5px solid ' + TOKENS.borderL2, margin: '0 16px', paddingBottom: '8px' },
				}, [
					writable ? null : React.createElement('p', { key: 'readOnly', role: 'status', style: { ...muted, margin: '12px 0 0' } }, t('readOnly')),
					React.createElement('div', { key: 'fields', style: { padding: '12px 0', display: 'grid', gap: '10px' } }, [
						checkbox('enabled', t('enabled'), draft.enabled, (v) => edit({ enabled: v }), disabled),
						draft.enabled
							? React.createElement('div', { key: 'details', style: { display: 'grid', gap: '10px' } }, [
									React.createElement('p', { key: 'script', style: sectionLabel }, t('scriptLabel')),
									radio('scriptTraditional', NAMESPACE + '-script', t('scriptTraditional'), draft.script === 'traditional', () => edit({ script: 'traditional' }), disabled),
									radio('scriptSimplified', NAMESPACE + '-script', t('scriptSimplified'), draft.script === 'simplified', () => edit({ script: 'simplified' }), disabled),
									radio('scriptOff', NAMESPACE + '-script', t('scriptOff'), draft.script === 'off', () => edit({ script: 'off' }), disabled),
									React.createElement('p', { key: 'axes', style: sectionLabel }, t('axes')),
									checkbox('register', t('axisRegister'), draft.register, (v) => edit({ register: v }), disabled),
									checkbox('japanese', t('axisJapanese'), draft.japanese, (v) => edit({ japanese: v }), disabled),
									React.createElement('p', { key: 'mode', style: sectionLabel }, t('mode')),
									radio('modeBlock', NAMESPACE + '-mode', t('modeBlock'), draft.mode === 'block', () => edit({ mode: 'block' }), disabled),
									radio('modeWarn', NAMESPACE + '-mode', t('modeWarn'), draft.mode === 'warn', () => edit({ mode: 'warn' }), disabled),
									React.createElement('p', { key: 'fileTypes', style: sectionLabel }, t('fileTypesLabel')),
									radio('fileTypesOff', NAMESPACE + '-fileTypes', t('fileTypesOff'), draft.fileTypes === 'off', () => edit({ fileTypes: 'off' }), disabled),
									radio('fileTypesWarn', NAMESPACE + '-fileTypes', t('fileTypesWarn'), draft.fileTypes === 'warn', () => edit({ fileTypes: 'warn' }), disabled),
									radio('fileTypesBlock', NAMESPACE + '-fileTypes', t('fileTypesBlock'), draft.fileTypes === 'block', () => edit({ fileTypes: 'block' }), disabled),
								])
							: React.createElement('p', { key: 'off', style: muted }, t('enabledOff')),
					]),
					React.createElement('div', { key: 'footer', style: { borderTop: '0.5px solid ' + TOKENS.borderL2, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', padding: '12px 0 4px' } }, [
						failed ? React.createElement('p', { key: 'failed', role: 'status', style: { flex: 1, minWidth: 0, margin: 0, color: TOKENS.error, fontSize: '12px', lineHeight: '1.5' } }, t('failed')) : null,
						React.createElement('button', {
							key: 'revert',
							type: 'button',
							disabled: !dirty || saving,
							onClick: revert,
							style: buttonStyle(false, !dirty || saving),
						}, t('discard')),
						React.createElement('button', {
							key: 'save',
							type: 'button',
							disabled: !dirty || saving,
							onClick: save,
							style: buttonStyle(true, !dirty || saving),
						}, saving ? t('saving') : t('save')),
					]),
				]) : null;

				return React.createElement('li', {
					style: {
						border: '0.5px solid ' + TOKENS.borderL4,
						background: open ? TOKENS.layer2 : TOKENS.layer3,
						borderRadius: '16px',
						listStyle: 'none',
					},
				}, [header, body]);
			};

			ctx.slots.inject('settings.plugin.item', function* () {
				yield ctx.slots.register({
					name: 'settings.plugin.item',
					key: NAMESPACE,
					locale: NAMESPACE,
				}, Card);
			});
		}

		exports.name = name;
		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	}
});
