import * as vscode from 'vscode';

function convertTabsToQuickItem(tabs: vscode.Tab[]): vscode.QuickPickItem[] {
	return structuredClone(
		tabs.map((tab, index) => ({
			label: `${index + 1}: ${tab.label}`,
		})),
	);
}

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand('focus-by-index.openIndex', () => {
		const quickPick = vscode.window.createQuickPick();

		quickPick.placeholder = 'Pick editor by index';
		const tabGroups = vscode.window.tabGroups.all;

		const allItems = tabGroups.flatMap(tabGroup => tabGroup.tabs);

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

		quickPick.onDidAccept(() => handleAccept);

		quickPick.show();
		quickPick.items = convertTabsToQuickItem(allItems);

		async function handleAccept() {
			const selection = quickPick.activeItems.at(0);
			if (!selection) {
				return;
			}

			const selectedTab = allItems.filter(tab => selection.label.includes(tab.label)).at(0);

			if (!selectedTab || !(selectedTab.input instanceof vscode.TabInputText)) {
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
export function deactivate() {}
