import * as vscode from 'vscode';

type TabInputTextTab = vscode.Tab & { input: vscode.TabInputText };

interface ComputedPathChunk {
	overlap: number;
	fullPaths: string[];
}

/**
 * Tokens that separate the index from the filename.
 */
const INDEX_SEPARATOR = ': ';

/**
 * Computes the path depth for the given path.
 *
 * @param path the path to find the depth of
 * @returns the depth of the path measured in number of directories the file is in + 1
 * @example getPathDepth('I/am/a/file.ts') => 4;
 */
function getPathDepth(path: string): number {
	return path.split('/').length;
}

/**
 * Find the maximum overlap value present in the computedChunks
 *
 * @param computedChunks The computed chunks to find the max overlap of
 * @returns The max overlap value in the computed chunks
 */
function getMaxOverlap(computedChunks: Record<string, ComputedPathChunk>): number {
	return Math.max(...Object.values(computedChunks).map(chunk => chunk.overlap));
}

/**
 * Compute an initial set of computed path chunks. These chunks have no guarantee
 * of an overlap = 1.
 * 
 * @param paths An array of strings containing the paths to compute initial overlaps
 * @returns The initial {@link ComputedPathChunk} for these paths.
 */
function computeInitialPathOverlaps(paths: string[]): Record<string, ComputedPathChunk> {
	return paths.reduce<Record<string, ComputedPathChunk>>((computedPathChunks, path) => {
		const minimizedPath = path.split('/').at(-1);
		if (!minimizedPath) {
			return computedPathChunks;
		}

		if (minimizedPath in computedPathChunks) {
			computedPathChunks[minimizedPath].overlap += 1;
			computedPathChunks[minimizedPath].fullPaths.push(path);
		} else {
			computedPathChunks[minimizedPath] = {
				fullPaths: [path],
				overlap: 1,
			};
		}

		return computedPathChunks;
	}, {});
}

/**
 * Increases path depth of the path keys for the {@link computedChunks} argument for {@link ComputedPathChunk}s which
 * have an {@link ComputedPathChunk.overlap} greater than 1.
 *
 * @param computedChunks A {@link ComputedPathChunk} which may or may not have maxOverlap === 1
 * @returns A {@link ComputedPathChunk} which has maxOverlap which is one less than the {@link computedChunks} argument
 */
function increasePathDepthToReduceDeepOverlaps(computedChunks: Record<string, ComputedPathChunk>): Record<string, ComputedPathChunk> {
	return Object.entries(computedChunks).reduce<Record<string, ComputedPathChunk>>((nextPathChunks, [key, chunk]) => {
		if (chunk.overlap === 1) {
			nextPathChunks[key] = chunk;
			return nextPathChunks;
		}

		// The next key is the 
		for (const fullPath of chunk.fullPaths) {
			const pathParts = fullPath.split('/');
			const nextKey = pathParts.slice(-1 * getPathDepth(key) - 1, pathParts.length).join('/');

			if (nextKey in nextPathChunks) {
				nextPathChunks[nextKey].overlap += 1;
				nextPathChunks[nextKey].fullPaths.push(fullPath);
			} else {
				nextPathChunks[nextKey] = {
					overlap: 1,
					fullPaths: [fullPath]
				};
			}
		}
		return nextPathChunks;
	}, {});
}

function convertTabsToQuickItem(tabs: TabInputTextTab[]): vscode.QuickPickItem[] {
	const tabFullPaths = tabs.map(tab => tab.input.uri.path);
	let tabPathChunks = computeInitialPathOverlaps(tabFullPaths);

	// If any of the overlaps is not 1 then we need to attempt to walk up the tree
	// for that path.
	// Do this to make the operation O(DirectoryDepth * N) instead of O(N^2).
	while (getMaxOverlap(tabPathChunks) > 1) {
		tabPathChunks = increasePathDepthToReduceDeepOverlaps(tabPathChunks);
	}

	// Invert the map so that full Paths map to their minified paths computed to
	// have no overlap.
	const invertedChunks = Object.fromEntries(
		Object.entries(tabPathChunks)
			.flatMap(([key, chunk]) => chunk.fullPaths.map(fullPath => [fullPath, key]))
	);

	return tabs.map((tab, index) => ({
		label: `${index + 1}${INDEX_SEPARATOR}${invertedChunks[tab.input.uri.path]}`,
	}));
}

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand('focus-by-index.openIndex', () => {
		const quickPick = vscode.window.createQuickPick();

		quickPick.placeholder = 'Pick editor by index';
		const tabGroups = vscode.window.tabGroups.all;

		const allItems = tabGroups
			.flatMap(tabGroup => tabGroup.tabs)
			.filter(tab => tab.input instanceof vscode.TabInputText) as TabInputTextTab[];

		quickPick.onDidChangeValue(value => {
			if (value.length === 1 && allItems.length < 10 && /\d+/.test(value)) {
				const index = Number(value); // Save as we did the regex test.
				const selectedItem = quickPick.items.at(index - 1);
				if (!selectedItem) {
					return;
				}

				quickPick.activeItems = [selectedItem];
				handleAccept();
			}
		});

		quickPick.onDidAccept(() => handleAccept());

		quickPick.show();
		quickPick.items = convertTabsToQuickItem(allItems);

		async function handleAccept() {
			const selection = quickPick.activeItems.at(0);
			if (!selection) {
				return;
			}

			const selectionLabelText = selection.label.split(INDEX_SEPARATOR).at(-1);
			if (!selectionLabelText) {
				return;
			}

			const selectedTab = allItems.filter(tab => tab.input.uri.path.includes(selectionLabelText)).at(0);

			if (!selectedTab) {
				vscode.window.showErrorMessage('An error occurred selecting the tab. Please try again later.');
				return;
			}

			await vscode.window.showTextDocument(selectedTab.input.uri, {
				viewColumn: selectedTab.group.viewColumn,
				preserveFocus: false,
				preview: false,
			});

			quickPick.hide();
		}
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() { }
