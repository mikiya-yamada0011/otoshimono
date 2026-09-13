# QRなし版の配置

現在は**本番用の専用列、索引、一意制約、既定ビューを対象SharePointへ適用済み**。旧データは`LFProfiles` 1件、`LFRequests` 2件、`LFClaims` 1件を専用列へ移行し、再読込で確認した。旧`Content`列は動作確認完了まで保留している。公開情報の即時同期と非公開品の本人案内を行う`LFSyncPublicItem`は検証環境`tsSTU2-istc`で稼働し、職員向けPower Appsへ接続・公開済みである。学生・職員の権限分離、SPFxと残り4本のPower Automateの配置、全体の通し検証は未完了。

## リストとアクセス権

| リスト | 内容 | 学生 | 職員 |
| --- | --- | --- | --- |
| FoundItems | 現物・内部情報・返却記録 | アクセス不可 | 管理 |
| LFPublicItems | 保管中の通常品の公開情報 | 読み取り | 管理 |
| LFProfiles | 認証済み学校メール・職員の既定窓口 | 自分だけ作成・参照・編集 | 管理 |
| LFRequests | 紛失届・任意の本人確認用特徴 | 自分だけ作成・参照・編集 | 管理 |
| LFClaims | 返却申出 | 自分だけ作成・参照・編集 | 管理 |
| LFNotices | 個別通知・返却履歴 | 宛先本人に個別の読み取り権限 | 管理 |
| LFThanks | 感謝の投稿原本 | 自分だけ作成・参照・編集 | 管理 |
| LFPublicThanks | 返却を確認した匿名の投稿 | 読み取り | 管理 |
| LFMailOutbox | 通知メールの送信待ち・結果 | アクセス不可 | 管理 |

8リストの検索・照合・状態管理・Power Automate連携に使う項目は、すべて独立したSharePoint列として作成する。列名、型、索引は[`list-schema.json`](list-schema.json)を正とする。公開用リスト、利用者設定、通知、感謝投稿、送信待ちは`Title`を一意にし、重複作成を防ぐ。`Author`と`Created / Modified`はSharePointが付ける値を利用し、申出者の判定には入力値ではなく作成者の実アカウントを使用する。

旧構成の`Content`列がある場合、`provision.mjs`は8リストの全レコードをページングして先に検証し、各項目を新しい列へ移す。不正なJSON、不正な日時・利用者ID・状態値、または既存列の型不一致が1件でもあれば、データ更新前に全リストの移行を中止する。旧列は列移行とアプリの動作確認中はロールバック用に保留し、確認後に`--remove-legacy-content`を指定して削除する。アプリ自体は移行後の専用列だけを読み書きし、旧形式への自動フォールバックは行わない。

`FoundItems` に追加した列は `FinderEmail / ClaimId / RequestId`（1行テキスト）と `InternalNote / ReturnAudit`（複数行プレーンテキスト）。色は既存 `Color` にセミコロン区切りで保存する。既存の返却列を引き続き使用し、訂正履歴は `ReturnAudit` に保持する。新規のQR・写真列はない。

## 1. 所有者が権限を設定

2026-09-07、現在のアカウントは列・リストを追加できたが、権限画面ではAccessDenied、RESTでも403だった。列の追加だけでは情報を非公開にできない。既存の13件の拾得物レコードは変更していない。

1. サイト所有者としてChromeで対象サイトへサインインする。
2. `site.example.json` を `site.json` にコピーし、`siteUrl`と`listIds`を配置先SharePointサイトの値へ変更する。
3. 職員用グループ・学生用グループを決め、`staffPrincipalIds / studentPrincipalIds` を設定する。今のサイトの「メンバー」を学生・職員の両方として指定しない。既存PowerAppsの担当者・フロー接続アカウントも職員グループへ含める。
4. `node deployment/provision.mjs deployment/site.json`で、追加する列、移行件数、一意制約、権限変更を確認する。
5. `node deployment/provision.mjs deployment/site.json --apply`で専用列への移行と権限を適用する。この段階で旧`Content`列は残る。
6. SPFx、Power Apps、Power Automateの読み書きを確認する。
7. 確認後に`node deployment/provision.mjs deployment/site.json --schema-only --apply --remove-legacy-content`で旧`Content`列を削除する。

スクリプトは指定したリストの継承を止め、指定した職員と実行者にフルコントロール、学生に公開リストの読み取りと本人入力リストの投稿権限を付ける。本人入力リストは `ReadSecurity=2 / WriteSecurity=2`。既存の指定外リスト権限は除外するため、必要な職員・運用アカウントを先に確認する。サイト全体の権限やメンバー構成は変更しない。

`--schema-only --apply`は、専用列の追加と旧`Content`データの移行だけを行い、権限は変更しない。`--remove-legacy-content`を併用したときだけ旧列を削除する。2026-09-07に実施した旧スキーマ作成とは内容が異なるため、今回の更新後にもう一度実行する必要がある。

## 2. Webパーツを配置

`npm run build` で作る `sharepoint/solution/lost-found-student-spfx.sppkg` をアプリカタログへ配置し、サイトのページに「落とし物システム」を追加する。Webパーツは学生専用で、職員はPower Appsを利用する。職員画面の代替実装は自動テスト専用であり、本番Webパーツに職員画面の切替はない。

Webパーツの設定は学校メールの許可ドメイン。学生にメールやパスワードを入力させず、SharePointのサインイン情報から学校メールと利用者IDを取得する。学籍番号は学校メールの `@` より前を使う。パスワードと認証セッションはMicrosoft 365が管理し、このアプリには保存しない。

## 3. Power Automateを接続

`node ../power-apps-staff/build-flows.mjs deployment/site.json` で5つの定義を生成する（`spfx-student-app` で実行）。これはフロー定義JSONであり、ポータルへそのままインポートするZIPパッケージではない。所有者環境のSharePoint・Office 365 Outlookの接続参照を `connectionReferences` へ設定してから、環境のフロー作成APIまたはソリューションに取り込む。検証サイトでは、このうち`LFSyncPublicItem`を`tsSTU2-istc`へ配置し、Power Appsへ追加している。残り4本は定義生成までである。

`LFSyncPublicItem`と職員向けPower Appsは同じPower Platform環境へ配置する。フローを作成しただけではアプリから呼べないため、Power Apps StudioのPower Automateペインで`LFSyncPublicItem`を追加し、アプリを保存・公開する。

- **Power Apps即時同期・本人案内（`LFSyncPublicItem`）**：拾得物IDだけを渡した場合は、`FoundItems`を読み直して`LFPublicItems`を作成・更新・削除する。拾得物IDと紛失申告IDを渡した場合は、非公開・保管中の現物と有効な申告を再確認し、本人向けの最終通知を直接作成する。通知キーは拾得物・申告・本人で固定し、同じ案内を何度押しても重複作成しない。
- **メール送信**：送信待ちを取得し、ETagを使ってPROCESSINGへ変更してからOutlookで送信する。成功でSENT、失敗でERROR。結果不明の自動再送はしない。PROCESSINGが残った場合も実行履歴を確認してから手動で戻す。
- **感謝の公開**：投稿の作成者、職員が作成した返却通知、現物の返却状態を確認して匿名公開する。訂正で無効になった投稿は公開から外す。

- **Power Apps登録時の条件照合**：新規拾得物の作成時だけ、先に保存された通常品の紛失届と照合する。
- **Power Apps返却記録の反映**：手動返却の記録から本人の履歴、紛失届の状態、拾得者への通知を反映する。

メール、感謝、条件照合、返却記録の4本は未配置・未実行である。公開一覧の同期と非公開品の本人案内は、検証環境の同じ`LFSyncPublicItem`で動作する。本人案内は`LFNotices`へ最終通知を作成するところまでで、メール送信は未配置である。内部テストでは `tests/support/WorkflowService.ts` が残りの業務の流れも再現するが、実環境のPower Automateを検証するものではない。

検証環境ではフロー接続アカウントに通知レコードの権限継承を解除する権限がなく、実行時に403となるため、`site.example.json`の`grantNoticePermissions`を`false`にしている。この状態はサイト権限を継承している検証用であり、本番設定ではない。本番ではフロー接続アカウントへ権限管理を許可し、`grantNoticePermissions`を`true`にして、通知を宛先本人と職員だけが読めることを確認する。

既存の `NotificationConditions / NotificationLogs` と既存のフローは変更していない。新画面の紛失届はLFRequestsを使うため、既存の4件の通知条件は自動移行していない。移行する場合はUserKey・メールと実際の作成者を確認し、本人の権限で登録し直す必要がある。

## 4. 配置後の確認

- 学生アカウントからFoundItemsとLFMailOutboxにRESTでアクセスできないこと。別の学生の申出・プロフィール・通知が読めないこと。
- 通常品の登録→条件照合→送信待ち→メール→本人の通知画面。貴重品は個別案内だけになること。
- 2人の職員が同時に返却しようとした場合の競合、通信失敗後の再同期、返却訂正と公開情報の更新。
- 感謝の投稿は原本から本人・返却状態を確認してから公開されること。

2026-09-11時点で、公開可能な既存データ5件を`LFPublicItems`へ初期同期済みである。`LFSyncPublicItem`はPower Appsから既存品IDを渡した実行が約1秒で成功した。旧1分周期フローと、既定環境に誤作成した仮フローは削除済みである。新しく学生画面を開いた場合は同期済みデータを直ちに読み込み、開いたままの画面は30秒以内または画面復帰時に再読込する。学生画面を`FoundItems`へ直接接続するフォールバックは設けない。メールの試験送信は実施していない。

```bash
# 変更せず、公開対象・除外理由・作成／更新／削除件数を確認
npm run sync:public

# プレビュー内容を確認後に反映
npm run sync:public -- --apply
```

結果は`deployment/last-public-sync-report.json`へ保存する。同期対象は`Status=保管中`、`IsPublic=true`、種類設定済みで、公開禁止分類ではない原本だけである。`LFPublicItems`には内部メモ、拾得者メール、返却先メール、返却監査をコピーしない。既存の公開レコードは原本に合わせて更新し、公開条件から外れたレコードは削除する。

実装で参照した公式資料：[SharePoint RESTの更新とETag](https://learn.microsoft.com/en-us/sharepoint/dev/sp-add-ins/working-with-lists-and-list-items-with-rest)、[SharePointコネクタ](https://learn.microsoft.com/en-us/connectors/sharepointonline/)、[フローをコードで扱う](https://learn.microsoft.com/en-us/power-automate/manage-flows-with-code)。


## 内部テストの登録内容がPower Appsに出ない場合

Playwright用のテストハーネスはブラウザ内保存のため、SharePointやPower Appsには転送しない。通常の開発確認は `npm start` でSharePoint Hosted Workbenchを開く。学生Webパーツの実保存先はLFRequests（紛失申告）・LFClaims（受け取り申告）で、職員Power Appsの同名リストと接続先サイトを合わせる。

今回の学生用パッケージは2.9.1.0。検索条件はモーダルで適用し、該当なしの場合は、結果の直下に紛失申告の登録ボタンを表示する。保存した検索キーワードも新規登録時の照合に使う。Power Apps起点の公開同期と非公開品の本人案内は配置・実行確認済みで、メール送信など残り4本は未配置である。
