'use strict';

const ActiveTabHistory = (() => {
	let tabListOfWindow = {};
	let windowIdOfTab = {};
	const obj = {};
	let inOperation = true;
	let promise = Promise.resolve();
	const _load = () => {
		return new Promise(resolve => {
			chrome.storage.local.get({
				tabListOfWindow: {},
				windowIdOfTab: {},
			}, items => {
				tabListOfWindow = items.tabListOfWindow;
				windowIdOfTab = items.windowIdOfTab;
				resolve();
			});
		});
	};
	const _save = () => {
		return new Promise(resolve => {
			chrome.storage.local.set({
				tabListOfWindow,
				windowIdOfTab,
			}, resolve);
		});
	};
	obj.load = () => {
		promise = promise.then(() => {
			return _load();
		});
		return promise;
	};
	obj.add = (tabId, windowId) => {
		promise = promise.then(() => {
			if (typeof windowId === 'number' && typeof tabId === 'number' && inOperation){
				_remove(tabId);
				if (!tabListOfWindow[windowId]) tabListOfWindow[windowId] = [];
				tabListOfWindow[windowId].push(tabId);
				windowIdOfTab[tabId] = windowId;
				return _save(); // TODO: 効率化 (addを連続で呼ばれた場合に都度保存は非効率)
			}
		});
		return promise;
	};
	obj.getLatestActiveTabId = windowId => {
		return promise.then(() => {
			// 最後のtabが閉じた＝windowが閉じたらnullが帰る
			const _arr_win = tabListOfWindow[windowId];
			return _arr_win ? _arr_win[_arr_win.length - 1] : null;
		});
	};
	const _remove = tabId => {
		if (tabId in windowIdOfTab) {
			const windowId = windowIdOfTab[tabId];
			const _arr_win = tabListOfWindow[windowId];
			const i = _arr_win.indexOf(tabId);
			if (i !== -1) {
				// i番目の要素を削除
				_arr_win.splice(i, 1);
				delete windowIdOfTab[tabId];
				if (_arr_win.length === 0) delete tabListOfWindow[windowId];
			}
		}
	};
	obj.remove = tabId => {
		promise = promise.then(() => {
			_remove(tabId);
			return _save();
		});
		return promise;
	};
	obj.clear = () => {
		promise = promise.then(() => {
			tabListOfWindow = {};
			windowIdOfTab = {};
			inOperation = true;
		});
		return promise;
	};
	obj.disable = () => {
		promise = promise.then(() => {
			inOperation = false;
		});
		return promise;
	};
	obj.enable = () => {
		promise = promise.then(() => {
			inOperation = true;
		});
		return promise;
	};

	return obj;
})();

ActiveTabHistory.load();

const initialize = () => {
	ActiveTabHistory.clear().then(() => {
		// 今アクティブなページ全部データに突っ込む
		chrome.tabs.query({
			active: true,
		}, tabs => {
			tabs.forEach(tab => {
				ActiveTabHistory.add(tab.id, tab.windowId);
			});
		});
	});
};
chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(initialize);


// タブがウィンドウから出て行った時
chrome.tabs.onDetached.addListener((tabId, detachInfo) => {
	ActiveTabHistory.remove(tabId);
	ActiveTabHistory.getLatestActiveTabId(detachInfo.oldWindowId).then(activateTab);
});


// 表示されているタブが変わった時（開いた際も呼ばれるが、onCreatedが先）
chrome.tabs.onActivated.addListener(activeInfo => {
	ActiveTabHistory.add(activeInfo.tabId, activeInfo.windowId);
});

// タブが開いた時
chrome.tabs.onCreated.addListener(tab => {
	if (typeof tab.openerTabId !== 'undefined') {
		chrome.tabs.get(tab.openerTabId, openerTab => {
			moveTabPosition(tab.id, openerTab.index + 1);
		});
		return;
	}

	const windowId = tab.windowId;
	// ・リンク・ブックマークをドラッグ・アンド・ドロップしてタブを開いた場合：位置を移動しない
	//		active で判別（ドロップ時true）
	// ・リンク・ブックマークをクリックで開いた場合：位置を移動する
	const dropped = tab.active;
	(dropped ? Promise.resolve(null) : ActiveTabHistory.getLatestActiveTabId(windowId)).then(baseTabId => {
		chrome.tabs.get(tab.id, ({ openerTabId }) => {
			// 別の拡張からcreateされた場合にonCreated時点ではopenerTabIdが付与されていないのでtabs.getした
			if (typeof openerTabId !== 'undefined') {
				baseTabId = openerTabId;
			}
			if (baseTabId !== null) {
				chrome.tabs.get(baseTabId, baseTab => {
					// タブの無い（1つだけの）ウィンドウから呼び出された場合別ウィンドウに新規タブができる
					if (baseTab.windowId === windowId) {
						moveTabPosition(tab.id, baseTab.index + 1);
					}
				});
			}
		});
	});
});

// windowsが開いた時
chrome.windows.onCreated.addListener(createdWindow => {
	const windowId = createdWindow.id;

	chrome.tabs.query({
		windowId,
		active: true,
	}, tabs => {
		if (tabs.length === 1) {
			const tab = tabs[0];
			ActiveTabHistory.add(tab.id, windowId);
		}
	});
});

// タブが閉じた時
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
	ActiveTabHistory.remove(tabId);
	ActiveTabHistory.disable();

	const activateLatestActiveTabIfNeeded = () => ActiveTabHistory.getLatestActiveTabId(removeInfo.windowId).then(latestActiveTabId => {
		if (latestActiveTabId === null) {
			// Windowごと閉じた or アクティブになったことのあるタブが存在しない時
			ActiveTabHistory.enable();
		} else {
			checkTabPresence(latestActiveTabId, isPresent => {
				if (isPresent) {
					// まだtabが残っている場合
					activateTab(latestActiveTabId).then(() => {
						ActiveTabHistory.enable();
					});
				} else {
					// Windowsごと閉じた時
					ActiveTabHistory.remove(latestActiveTabId);
					activateLatestActiveTabIfNeeded();
				}
			});
		}
	});
	activateLatestActiveTabIfNeeded();
});

const moveTabPosition = (tabId, targetPosition) => {
	chrome.tabs.move(tabId, {
		index: targetPosition,
	});
};

const activateTab = tabId => {
	return new Promise(resolve => {
		if (tabId !== null) {
			chrome.tabs.update(tabId, {
				active : true,
			}, resolve);
		} else {
			resolve();
		}
	});
};

const checkTabPresence = (tabId, callback) => {
	if (!Number.isInteger(tabId)) return;
	if (typeof callback !== 'function') return;
	chrome.windows.getAll({
		populate: true,
	}, windows => {
		const isPresent = windows.some(window => {
			return window.tabs.some(tab => tab.id === tabId);
		});
		callback(isPresent);
	});
};
