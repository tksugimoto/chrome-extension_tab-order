# これはなに
Chromeでタブを開いた/閉じた時に表示する位置を調整するChrome拡張

# 機能（チェック無しは今後実装予定）
- [x] タブを新しく開いた場合、現在開いているタブの1つ右に開く
    - 通常：お気に入り・別の拡張から→1番右、リンク→1つ右
    - 詳細：開かれたタブにopenerTabIdが指定されていたらそのidのタブの1つ右に開く
        - 補足：通常のリンク<a>クリックはそのタブが自動指定されている
        - 補足：別の拡張から開かれた場合もopenerTabIdが指定されていたらそのidのタブの1つ右に開く（下記補足参照）
    - [x] 例外：リンク・ブックマークをドラッグ・アンド・ドロップしてタブを開いた場合は、1つ右ではなく、ドロップした位置に開く
- [x] タブを閉じた際、そのタブの前に見ていたタブをアクティブにする（通常は閉じたタブの1つ右）

# 補足
別の拡張からopenerTabIdを指定して開いた際、chrome.tabs.onCreated時点ではopenerTabIdが指定されていなく取得できない点に注意

    chrome.tabs.onCreated.addListener(function(tab){
    	console.log("chrome.tabs.onCreated: openerTabId = %s", tab.openerTabId); // undefined
    	chrome.tabs.get(tab.id, function(tab){
    		console.log("chrome.tabs.get: openerTabId = %s", tab.openerTabId); // !== undefined
    	});
    });

    chrome.tabs.query({
    	active: true
    }, function(result){
        	chrome.tabs.create({
        		openerTabId: result[0].id
        	});
    });
