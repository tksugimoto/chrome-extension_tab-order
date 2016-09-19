"use strict";

const ActiveTabHistory = (() => {
	const arrayHist = {};
	const hashHist = {};
	const obj = {};
	let inOperation = true;
	obj.add = (tabId, windowId) => {
		if (typeof windowId === "number" && typeof tabId === "number" && inOperation){
			obj.remove(tabId);
			if (!arrayHist[windowId]) arrayHist[windowId] = [];
			arrayHist[windowId].push(tabId);
			hashHist[tabId] = windowId;
		}
	};
	obj.last = windowId => {
		// 最後のtabが閉じた＝windowが閉じたらnullが帰る
		const _arr_win = arrayHist[windowId];
		return _arr_win ? _arr_win[_arr_win.length - 1] : null;
	};
	obj.remove = tabId => {
		if (tabId in hashHist) {
			const windowId = hashHist[tabId];
			const _arr_win = arrayHist[windowId];
			const i = _arr_win.indexOf(tabId);
			if (i !== -1) {
				// i番目の要素を削除
				_arr_win.splice(i, 1);
				delete hashHist[tabId]
				if (_arr_win.length === 0) delete arrayHist[windowId];
			}
		}
	};
	obj.disable = () => {
		inOperation = false;
	};
	obj.enable = () => {
		inOperation = true;
	};

	return obj;
})();


// 今アクティブなページ全部データに突っ込む
chrome.tabs.query({
	active: true
}, tabs => {
	tabs.forEach(tab => {
		ActiveTabHistory.add(tab.id, tab.windowId);
	});
});

// タブがウィンドウから出て行った時
chrome.tabs.onDetached.addListener((tabId, detachInfo) => {
	ActiveTabHistory.remove(tabId);
	show(ActiveTabHistory.last(detachInfo.oldWindowId));
});


// 表示されているタブが変わった時（開いた際も呼ばれるが、onCreatedが先）
chrome.tabs.onActivated.addListener(activeInfo => {
	ActiveTabHistory.add(activeInfo.tabId, activeInfo.windowId);
});

// タブが開いた時
chrome.tabs.onCreated.addListener(tab => {
	if (typeof tab.openerTabId !== "undefined") {
		chrome.tabs.get(tab.openerTabId, openerTab => {
			move(tab, openerTab.index + 1);
		});
		return;
	}

	const windowId = tab.windowId;
	// ・リンク・ブックマークをドラッグ・アンド・ドロップしてタブを開いた場合：位置を移動しない
	//		active で判別（ドロップ時true）
	// ・リンク・ブックマークをクリックで開いた場合：位置を移動する
	const dropped = tab.active;
	let baseTabId = dropped ? null : ActiveTabHistory.last(windowId);
	chrome.tabs.get(tab.id, tab => {
		// 別の拡張からcreateされた場合にonCreated時点ではopenerTabIdが付与されていないのでtabs.getした
		if (typeof tab.openerTabId !== "undefined") {
			baseTabId = tab.openerTabId;
		}
		if (baseTabId !== null) {
			chrome.tabs.get(baseTabId, baseTab => {
				// タブの無い（1つだけの）ウィンドウから呼び出された場合別ウィンドウに新規タブができる
				if (baseTab.windowId === windowId) {
					move(tab, baseTab.index + 1);
				}
			});
		}
	});
});

// windowsが開いた時
chrome.windows.onCreated.addListener(createdWindow => {
	const windowId = createdWindow.id;

	chrome.tabs.query({
		windowId: windowId,
		active: true
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

	function func(){
		tabId = ActiveTabHistory.last(removeInfo.windowId);
		if (tabId !== null) {
			// まだtabが残っている場合
			tabExist(tabId, () => {
				show(tabId).then(() => {
					ActiveTabHistory.enable()
				});
			}, () => {
				// Windowsごと閉じた時
				ActiveTabHistory.remove(tabId);
				func();
			});
		} else {
			// Windowごと閉じた or アクティブになったことのあるタブが存在しない時
			ActiveTabHistory.enable();
		}
	}
	func();
});

function move(tab, to){
	chrome.tabs.move(tab.id, {
		index: to
	});
}

function show(tabId){
	return new Promise(resolve => {
		if (tabId !== null) {
			chrome.tabs.update(tabId, {
				active : true
			}, resolve);
		} else {
			resolve();
		}
	});
}

function tabExist(tabId, fn_exist, fn_not_exist) {
	if (tabId !== null) {
		chrome.windows.getAll({
			populate: true
		}, windows => {
			const exists = windows.some(window => {
				return window.tabs.some(tab => tab.id === tabId);
			});
			if (exists) {
				if (typeof fn_exist === "function") fn_exist();
			} else {
				if (typeof fn_not_exist === "function") fn_not_exist();
			}
		});
	}
}
