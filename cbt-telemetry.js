/*!
 * cbt-telemetry.js : JFT-Mocktest 深度解答ログ（プロセスデータ）計測モジュール
 * ---------------------------------------------------------------
 * - 受験者の思考時間・迷い・聴解の再生行動を、端末内(localStorage)にだけ保存します。
 * - 外部送信なし／氏名などの個人情報は一切記録しません。
 * - すべての公開関数は例外を握りつぶします。このモジュールが壊れても、試験は止まりません。
 * - 読み込み失敗時でも本体は動くよう、本体側は window.CBTTelemetry の有無を確認してから呼びます。
 *
 * 時間の定義：
 *   elapsed_ms / total_time_ms は「その問題を実際に見ていた時間(active dwell)」の累計です。
 *   問題一覧(Overview)・終了確認を開いている間、およびタブが非表示の間は数えません。
 *   同じ問題に戻って来た場合は、前回までの時間に加算します（visit_count で回数を記録）。
 * 選択肢インデックスは 0 始まり（0=①, 1=②, 2=③, 3=④）。
 */
(function (global) {
  'use strict';

  var SCHEMA_VERSION = 1;
  var KEY_INDEX  = 'jft_tel_index';      // セッションIDの一覧（古い順）
  var KEY_ACTIVE = 'jft_tel_active';     // 進行中セッションID
  var KEY_PREFIX = 'jft_tel_s_';         // セッション本体
  var MAX_SESSIONS = 50;                 // 端末内に残す最大セッション数（超えたら古い順に削除）

  var SECTION_MAP = {
    '文字・語彙': 'vocabulary',
    '会話・表現': 'conversation',
    '聴解': 'listening',
    '読解': 'reading',
    '文法': 'grammar'
  };

  var S = null;                // 進行中セッション
  var cur = null;              // 進行中の問題 { idx, rec, segStart }
  var pauseReasons = {};       // { overlay:true, hidden:true }
  var _nowFn = (global.performance && performance.now) ? function () { return performance.now(); } : function () { return Date.now(); };

  /* ───────── ユーティリティ ───────── */
  function safe(fn) {
    return function () {
      try { return fn.apply(this, arguments); }
      catch (e) { try { console.warn('[CBTTelemetry]', e); } catch (_) {} return undefined; }
    };
  }
  function now() { return _nowFn(); }
  function isPaused() { for (var k in pauseReasons) if (pauseReasons[k]) return true; return false; }
  function uuid() {
    try { if (global.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { localStorage.setItem(k, v); }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function readIndex() { try { var a = JSON.parse(lsGet(KEY_INDEX) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function writeIndex(a) { try { lsSet(KEY_INDEX, JSON.stringify(a)); } catch (e) {} }
  function loadSession(id) { try { return JSON.parse(lsGet(KEY_PREFIX + id)); } catch (e) { return null; } }

  /* 容量超過時は古いセッションから削除して再試行 */
  function persist() {
    if (!S) return;
    var payload = snapshotSession();
    var tries = 0;
    while (tries < 6) {
      try {
        lsSet(KEY_PREFIX + S.session_id, JSON.stringify(payload));
        var idx = readIndex();
        if (idx.indexOf(S.session_id) < 0) { idx.push(S.session_id); }
        while (idx.length > MAX_SESSIONS) { var old = idx.shift(); if (old !== S.session_id) lsDel(KEY_PREFIX + old); }
        writeIndex(idx);
        try { lsSet(KEY_ACTIVE, S.session_id); } catch (e) {}
        return;
      } catch (e) {
        var idx2 = readIndex();
        var victim = null;
        for (var i = 0; i < idx2.length; i++) { if (idx2[i] !== S.session_id) { victim = idx2[i]; break; } }
        if (!victim) return;
        lsDel(KEY_PREFIX + victim);
        writeIndex(idx2.filter(function (x) { return x !== victim; }));
        tries++;
      }
    }
  }

  function snapshotSession() {
    var logs = [];
    for (var i = 0; i < S.meta.length; i++) { if (S.recs[i]) logs.push(publicRec(S.recs[i])); }
    return {
      schema_version: SCHEMA_VERSION,
      session_id: S.session_id,
      started_at: S.started_at,
      finished_at: S.finished_at,
      timed_out: S.timed_out,
      abandoned: false,
      level: S.level,
      question_count: S.meta.length,
      signature: S.signature,
      logs: logs
    };
  }

  function publicRec(r) {
    return {
      session_id: r.session_id,
      seq: r.seq,
      question_id: r.question_id,
      section: r.section,
      lesson_or_set: r.lesson_or_set,
      level: r.level,
      is_correct: r.is_correct,
      answered: r.final_choice !== null,
      visited: r.visit_count > 0,
      first_choice: r.first_choice,
      final_choice: r.final_choice,
      change_count: r.change_count,
      selection_history: r.selection_history,
      time_to_first_click_ms: r.time_to_first_click_ms,
      total_time_ms: Math.round(r.total_time_ms),
      visit_count: r.visit_count,
      audio_play_count: r.audio_play_count,
      flagged: r.flagged,
      timestamp: r.timestamp
    };
  }

  function newRec(seq) {
    var m = S.meta[seq];
    return {
      session_id: S.session_id, seq: seq,
      question_id: m.question_id, section: m.section, lesson_or_set: m.lesson_or_set, level: S.level,
      correct_index: m.correct_index,
      is_correct: false, first_choice: null, final_choice: null, change_count: 0,
      selection_history: [], time_to_first_click_ms: null, total_time_ms: 0,
      visit_count: 0, audio_play_count: 0, flagged: false, timestamp: new Date().toISOString()
    };
  }

  function accumulate() {            // 進行中の区間を累計へ繰り入れる
    if (cur && cur.segStart !== null) { cur.rec.total_time_ms += now() - cur.segStart; cur.segStart = isPaused() ? null : now(); }
  }
  function curElapsed() {
    if (!cur) return 0;
    return cur.rec.total_time_ms + (cur.segStart !== null ? (now() - cur.segStart) : 0);
  }
  function judge(r) { r.is_correct = (r.final_choice !== null && r.final_choice === r.correct_index); }

  /* ───────── 公開API ───────── */

  /** 模試開始（再開時は同じ問題セットの進行中セッションを引き継ぐ） */
  function startSession(level, questions) {
    if (S) { commitQuestionLog(); }
    var meta = [], sigParts = [];
    for (var i = 0; i < questions.length; i++) {
      var q = questions[i];
      meta.push({
        question_id: q.question_id,
        section: SECTION_MAP[q.section] || 'other',
        lesson_or_set: q.source_lesson || null,
        correct_index: (Number(q.correct_answer) || 0) - 1
      });
      sigParts.push(q.question_id);
    }
    var signature = sigParts.join('|');
    // 再開判定
    var activeId = lsGet(KEY_ACTIVE), restored = null;
    if (activeId) {
      var old = loadSession(activeId);
      if (old && !old.finished_at && old.signature === signature && old.level === level) restored = old;
    }
    if (restored) {
      S = { session_id: restored.session_id, started_at: restored.started_at, finished_at: null, timed_out: null,
            level: level, meta: meta, signature: signature, recs: {} };
      restored.logs.forEach(function (l) {
        S.recs[l.seq] = {
          session_id: l.session_id, seq: l.seq, question_id: l.question_id, section: l.section, lesson_or_set: l.lesson_or_set, level: l.level,
          correct_index: meta[l.seq].correct_index, is_correct: l.is_correct, first_choice: l.first_choice, final_choice: l.final_choice,
          change_count: l.change_count, selection_history: l.selection_history || [], time_to_first_click_ms: l.time_to_first_click_ms,
          total_time_ms: l.total_time_ms || 0, visit_count: l.visit_count || 0, audio_play_count: l.audio_play_count || 0,
          flagged: !!l.flagged, timestamp: l.timestamp
        };
      });
    } else {
      if (activeId) { // 別の問題セットで未完了のまま残っていた → 放棄扱いで印を付ける
        var ab = loadSession(activeId);
        if (ab && !ab.finished_at) { ab.abandoned = true; try { lsSet(KEY_PREFIX + activeId, JSON.stringify(ab)); } catch (e) {} }
      }
      S = { session_id: uuid(), started_at: new Date().toISOString(), finished_at: null, timed_out: null,
            level: level, meta: meta, signature: signature, recs: {} };
    }
    cur = null; pauseReasons = {};
    persist();
  }

  /** 問題が表示された時に呼ぶ（同じ問題の再描画では何もしない） */
  function startQuestionTimer(idx /*, q */) {
    if (!S || idx < 0 || idx >= S.meta.length) return;
    if (cur && cur.idx === idx) return;
    if (cur) commitQuestionLog();
    var rec = S.recs[idx] || (S.recs[idx] = newRec(idx));
    rec.visit_count += 1;
    cur = { idx: idx, rec: rec, segStart: isPaused() ? null : now() };
  }

  /** 選択肢クリック時に呼ぶ（index は 0 始まり） */
  function recordChoice(index) {
    if (!S || !cur) return;
    var r = cur.rec, el = Math.round(curElapsed());
    r.selection_history.push({ choice: index, elapsed_ms: el });
    if (r.first_choice === null) { r.first_choice = index; r.time_to_first_click_ms = el; }
    else if (index !== r.final_choice) { r.change_count += 1; }
    r.final_choice = index;
    judge(r);
  }

  /** 聴解の音声再生ボタンを押した時に呼ぶ */
  function recordAudioPlay() {
    if (!S || !cur) return;
    cur.rec.audio_play_count += 1;
  }

  /** 「あとで見直す」の切り替え時に呼ぶ */
  function recordFlag(idx, on) {
    if (!S || idx < 0 || idx >= S.meta.length) return;
    var rec = S.recs[idx] || (S.recs[idx] = newRec(idx));
    rec.flagged = !!on;
  }

  /** 問題から離れる時に自動で呼ばれる（手動でも呼べる） */
  function commitQuestionLog() {
    if (!S || !cur) return;
    accumulate();
    judge(cur.rec);
    cur.rec.timestamp = new Date().toISOString();
    cur = null;
    persist();
  }

  function pause(reason) { if (!S) return; accumulate(); pauseReasons[reason || 'overlay'] = true; if (cur) cur.segStart = null; }
  function resume(reason) {
    if (!S) return;
    pauseReasons[reason || 'overlay'] = false;
    if (cur && cur.segStart === null && !isPaused()) cur.segStart = now();
  }

  /** 模試終了：未訪問の問題も記録し、正誤を確定してセッションを閉じる */
  function finishSession(opts) {
    if (!S) return;
    commitQuestionLog();
    for (var i = 0; i < S.meta.length; i++) {
      if (!S.recs[i]) S.recs[i] = newRec(i);
      judge(S.recs[i]);
    }
    S.finished_at = new Date().toISOString();
    S.timed_out = !!(opts && opts.timedOut);
    persist();
    lsDel(KEY_ACTIVE);
    S = null; cur = null; pauseReasons = {};
  }

  /* ───────── 取り出し（検証・分析用） ───────── */
  function allSessions() {
    var out = [], idx = readIndex();
    for (var i = 0; i < idx.length; i++) { var s = loadSession(idx[i]); if (s) out.push(s); }
    return out;
  }
  function buildExport() {
    return { schema_version: SCHEMA_VERSION, app: 'jft-moktest-v2', exported_at: new Date().toISOString(), sessions: allSessions() };
  }
  function getSummary() {
    var ss = allSessions(), logs = 0, bytes = 0;
    ss.forEach(function (s) { logs += (s.logs || []).length; });
    readIndex().forEach(function (id) { var v = lsGet(KEY_PREFIX + id); if (v) bytes += v.length * 2; });
    return { sessions: ss.length, finished: ss.filter(function (s) { return s.finished_at; }).length, logs: logs, approx_kb: Math.round(bytes / 1024) };
  }
  function exportJSON() {
    var json = JSON.stringify(buildExport(), null, 2);
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    var name = 'jft-telemetry-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '.json';
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    return name;
  }
  function copyToClipboard() {
    var json = JSON.stringify(buildExport(), null, 2);
    if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(json).then(function () { return true; }, function () { return fallbackCopy(json); });
    }
    return Promise.resolve(fallbackCopy(json));
  }
  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = document.execCommand('copy'); document.body.removeChild(ta); return !!ok;
    } catch (e) { return false; }
  }
  function clearAll() {
    readIndex().forEach(function (id) { lsDel(KEY_PREFIX + id); });
    lsDel(KEY_INDEX); lsDel(KEY_ACTIVE);
    if (S) { S.recs = {}; cur = null; persist(); }
  }

  /* ───────── 管理者パネル（画面の邪魔にならない隠し入口） ───────── */
  var panel = null;
  function openAdmin() {
    if (panel) { refreshPanel(); return; }
    var css = document.createElement('style');
    css.textContent =
      '#cbt-tel-panel{position:fixed;inset:0;z-index:500;background:rgba(43,41,38,.6);display:flex;align-items:center;justify-content:center;padding:16px;font-family:"Zen Kaku Gothic New",sans-serif}' +
      '#cbt-tel-panel .box{background:#EFEAE0;color:#2B2926;border:1px solid #DDD6C6;border-radius:14px;padding:18px;width:min(520px,100%)}' +
      '#cbt-tel-panel h2{margin:0 0 6px;font-size:18px}#cbt-tel-panel p{margin:4px 0;font-size:13px;line-height:1.7}' +
      '#cbt-tel-panel .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}' +
      '#cbt-tel-panel button{font:700 14px "Zen Kaku Gothic New",sans-serif;padding:10px 14px;border-radius:8px;border:1.5px solid #2E8B76;background:#2E8B76;color:#fff;cursor:pointer}' +
      '#cbt-tel-panel button.sub{background:none;color:#1F6355}#cbt-tel-panel button.danger{background:none;color:#8A2A2A;border-color:#8A2A2A}' +
      '#cbt-tel-panel .msg{min-height:1.4em;color:#1F6355;font-weight:700}';
    document.head.appendChild(css);
    panel = document.createElement('div');
    panel.id = 'cbt-tel-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
    panel.innerHTML =
      '<div class="box"><h2>解答ログ（学習データ出力） / Answer Logs (Export)</h2>' +
      '<p id="cbt-tel-sum"></p><p id="cbt-tel-sum-en" style="color:#5a554c"></p>' +
      '<p style="margin-top:10px">このログは、この端末の中にだけ保存されています。氏名などの個人情報は含みません。</p>' +
      '<p style="color:#5a554c">Logs are stored only on this device. No personal information is included.</p>' +
      '<div class="msg" id="cbt-tel-msg"></div>' +
      '<div class="row"><button id="cbt-tel-dl">JSONをダウンロード / Download JSON</button><button class="sub" id="cbt-tel-cp">クリップボードにコピー / Copy to Clipboard</button></div>' +
      '<div class="row" style="justify-content:space-between;margin-top:18px;padding-top:12px;border-top:1px solid #DDD6C6"><button class="danger" id="cbt-tel-clr">すべて削除 / Clear All</button><button class="sub" id="cbt-tel-x">閉じる / Close</button></div></div>';
    document.body.appendChild(panel);
    var msg = function (t) { document.getElementById('cbt-tel-msg').textContent = t; };
    document.getElementById('cbt-tel-dl').onclick = safe(function () { msg('ダウンロードしました / Downloaded: ' + exportJSON()); });
    document.getElementById('cbt-tel-cp').onclick = safe(function () { copyToClipboard().then(function (ok) { msg(ok ? 'コピーしました / Copied to clipboard' : 'コピーできませんでした（ダウンロードをお使いください） / Copy failed (please use Download JSON)'); }); });
    document.getElementById('cbt-tel-clr').onclick = safe(function () { if (global.confirm('この端末に保存されている解答ログをすべて削除します。元に戻せません。必要な場合は、先にダウンロードしてください。\nよろしいですか？\n\nThis will delete ALL answer logs saved on this device. It cannot be undone. If you need a copy, download it first.\nContinue?')) { clearAll(); refreshPanel(); msg('削除しました / All logs cleared'); } });
    document.getElementById('cbt-tel-x').onclick = safe(closeAdmin);
    panel.addEventListener('click', function (e) { if (e.target === panel) closeAdmin(); });
    refreshPanel();
  }
  function refreshPanel() {
    var s = getSummary();
    document.getElementById('cbt-tel-sum').textContent = '保存中：' + s.sessions + ' 回分（うち終了 ' + s.finished + ' 回）／ ' + s.logs + ' 問の記録／約 ' + s.approx_kb + ' KB';
    document.getElementById('cbt-tel-sum-en').textContent = 'Saved: ' + s.sessions + ' sessions (' + s.finished + ' finished) / ' + s.logs + ' questions / approx. ' + s.approx_kb + ' KB';
    document.getElementById('cbt-tel-msg').textContent = '';
    panel.style.display = 'flex';
  }
  function closeAdmin() { if (panel) panel.style.display = 'none'; }

  /* 隠し入口：①アプリ名を3秒以内に5回タップ ②URLの末尾に #telemetry ③Ctrl+Shift+L */
  function installTriggers() {
    var taps = [];
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest && e.target.closest('#yl-ttl');
      if (!t) return;
      var n = Date.now(); taps.push(n); taps = taps.filter(function (x) { return n - x < 3000; });
      if (taps.length >= 5) { taps = []; openAdmin(); }
    });
    document.addEventListener('keydown', function (e) { if (e.ctrlKey && e.shiftKey && (e.key === 'L' || e.key === 'l')) openAdmin(); });
    function hashCheck() { if (location.hash === '#telemetry') openAdmin(); }
    global.addEventListener('hashchange', hashCheck); hashCheck();
  }

  /* ───────── 自動保存：画面を離れる／隠れた時 ───────── */
  document.addEventListener('visibilitychange', safe(function () {
    if (document.hidden) { pause('hidden'); if (S) { if (cur) { /* 区間を確定して保存 */ judge(cur.rec); } persist(); } }
    else { resume('hidden'); }
  }));
  global.addEventListener('pagehide', safe(function () { if (S) { accumulate(); if (cur) judge(cur.rec); persist(); } }));

  /* ───────── エクスポート ───────── */
  var api = {
    version: SCHEMA_VERSION,
    startSession: safe(startSession),
    startQuestionTimer: safe(startQuestionTimer),
    recordChoice: safe(recordChoice),
    recordAudioPlay: safe(recordAudioPlay),
    recordFlag: safe(recordFlag),
    commitQuestionLog: safe(commitQuestionLog),
    pause: safe(pause),
    resume: safe(resume),
    finishSession: safe(finishSession),
    exportJSON: safe(exportJSON),
    copyToClipboard: safe(copyToClipboard),
    clearAll: safe(clearAll),
    getSummary: safe(getSummary),
    openAdmin: safe(openAdmin)
  };
  global.CBTTelemetry = api;
  safe(installTriggers)();
})(window);
