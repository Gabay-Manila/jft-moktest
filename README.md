# JFT-Basic CBT 模擬試験 ＆ 自律学習 (JFT-Basic CBT Mock Test & Self-Study)

**日本語基礎テスト（JFT-Basic）**の本番環境（Prometric CBT）の操作感と出題形式を忠実に再現した、完全無料・登録不要のWebアプリケーション（PWA）です。  
A realistic, browser-based CBT mock exam simulator and self-study platform designed to mirror the official **JFT-Basic (Japan Foundation Test for Basic Japanese)** Prometric testing environment.

🔗 **Live App / アプリURL:** https://jft-moktest.vercel.app/  
🏢 **Developed by:** YOSHIDA EdTech Works (`Gabay-Manila`)

---

## ✨ 主な機能 / Key Features

### 1. Prometric CBT 本番完全再現 UI / Realistic CBT Interface
- **A1 / A2 レベル選択:** 「JFT-Basic スターター〜初級1（A1）」および「いろどり初級2（A2）」の2コースに対応。
- **操作説明（チュートリアル）画面:** 試験開始前に画面の見方や解答手順を日英併記で確認可能（タイマー開始前／リピーター向けのスキップ・次回非表示設定つき）。
- **「⚑ あとで見直す」フラグ機能:** 自信のない問題にマークをつけ、見直し画面から素早く再確認可能。
- **1〜40問 グリッド問題一覧:** 回答済み・未回答・要確認（⚑）を色分け表示し、任意の問題へ即座にジャンプ。
- **聴解セクションの厳密再現:** Web Speech APIによる音声読み上げ。本番同様の**再生回数制限（1問につき最大2回）**、一時停止・巻き戻し不可の仕様を再現。
- **読解2画面分割レイアウト:** 左側に案内文・本文、右側に設問と選択肢を配置し、スクロールのストレスを軽減。
- **終了確認フロー:** 提出前に未回答・要確認の問題数を警告表示し、誤提出を防止。

### 2. 弱点分析 ＆ 全60課カリキュラム連携 / Weak-Point Review & 60-Lesson Curriculum
- **セクション別合否判定:** 総得点（65%以上）だけでなく、各セクションの足切り基準（Cut-off）も含めた本番準拠の判定と250点換算スコアを算出。
- **復習モード（JP / EN / TL・ふりがな切替）:** 1問ごとの丁寧な解説に加え、日本語・英語・タガログ語（フィリピン語）の解説切り替え、ふりがな表示オン/オフに対応。
- **自動弱点レコメンド:** 模試で間違えた語彙・セクションから、全60課（150時間コース／300時間コース）の該当レッスンを自動提案。
- **マイレポート＆A4印刷出力:** 累計学習時間・クリア済み課数・過去最高スコアを記録し、A4サイズでPDF/印刷出力が可能。

### 3. プライバシー配慮型・プロセスデータ計測 / Privacy-First Telemetry (`cbt-telemetry.js`)
- 受験者の思考時間・選択肢の変更回数・聴解の再生行動などの解答プロセスデータを、外部サーバーへ一切送信せず**端末内（`localStorage`）のみ**に保存。
- タイトルの5回タップ（または `#telemetry` / `Ctrl+Shift+L`）で開く日英併記のエクスポートパネルから、学習データ（JSON）のダウンロード・コピーが可能。

---

## 📂 リポジトリ構成 / Repository Structure

```text
jft-moktest/
├── index.html             # アプリ本体（UI・CBTエンジン・学習ラウンジ・レポート統合）
├── cbt-telemetry.js       # 端末内プロセスデータ計測・JSONエクスポートモジュール
├── questions.json         # A1レベル模擬試験 問題プール
├── questions_a2.json      # A2レベル模擬試験 問題プール
├── curriculum_jft.json    # 全60課 自律学習カリキュラム・小テストデータ
├── manifest.json          # PWA（Progressive Web App）設定ファイル
└── README.md              # プロジェクト説明書# jft-moktest
