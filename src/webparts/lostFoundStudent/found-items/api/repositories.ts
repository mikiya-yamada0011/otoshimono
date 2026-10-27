import { photoPublicCutoffInstant, isPhotoPublished } from "../utils/photoRetention";
import { validRecord } from "../utils/validation";
import { SPHttpClient } from "@microsoft/sp-http";
import { Row, Repository, Table } from "./service";
import { Criteria, User, splitColors } from "../types/model";
import { normalizeCategoryCodes } from "../utils/categories";

export const LISTS: Record<Table, string> = {
  items: "FoundItems",
  public: "LFPublicItems",
  profiles: "LFProfiles",
  requests: "LFRequests",
  claims: "LFClaims",
  notices: "LFNotices",
  mail: "LFMailOutbox",
  submissions: "LFFoundSubmissions",
  photoBatches: "LFDailyPhotoBatches",
};

// Fetch only fields the student decoder consumes, rather than every list column.
const READ_FIELDS: Partial<Record<Table, string>> = {
  public: "SourceItemId,ItemTitle,ParentCategoryCode,CategoryCode,Colors,CampusCode,BuildingCode,Place,FoundOn,StorageWindow,Feature,ItemStatus,SourceCreatedAt,TransferredAt,TransferDestination",
  profiles: "DefaultWindow",
  requests: "Title,ParentCategoryCode,CategoryCode,Colors,CampusCode,BuildingCode,LostFrom,LostTo,SearchQuery,Feature,RequestStatus",
  claims: "ItemId,RequestId,Feature,ItemTitle,StorageWindow,ClaimStatus,ReturnedAt",
  notices: "NotificationKey,RecipientUserId,RecipientEmail,ItemId,RequestId,ClaimId,NoticeKind,ItemTitle,StorageWindow,Message,NoticeCreatedAt",
};

const text = (value: unknown): string =>
  value === undefined || value === null ? "" : String(value);
const date = (value: unknown): string => text(value).slice(0, 10);
// Native Power Apps forms submit local midnight; SharePoint REST returns UTC.
// Keep the intake day in the campus timezone rather than displaying yesterday.
const intakeDate = (value: unknown): string => {
  const day = date(value);
  const calendar = new Date(`${day}T00:00:00Z`);
  const instant = new Date(text(value));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(calendar.valueOf())
    || calendar.toISOString().slice(0, 10) !== day || !Number.isFinite(instant.valueOf())) return "";
  return instant.toLocaleDateString("en-CA", {timeZone: "Asia/Tokyo"});
};
const authorEmail = (row: Record<string, unknown>): string =>
  text(
    (row.Author as Record<string, unknown> | undefined)?.EMail,
  ).toLowerCase();
const status = (value: unknown): string =>
  text((value as { Value?: unknown } | undefined)?.Value ?? value);

function decodeRow(
  table: Exclude<Table, "items">,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const createdAt = text(row.Created);
  if (table === "public")
    return {
      sourceId: text(row.SourceItemId),
      parent: text(row.ParentCategoryCode),
      category: text(row.CategoryCode),
      title: text(row.ItemTitle),
      colors: splitColors(row.Colors),
      campus: text(row.CampusCode),
      building: text(row.BuildingCode),
      place: text(row.Place),
      foundOn: date(row.FoundOn),
      window: text(row.StorageWindow),
      feature: text(row.Feature),
      valuable: false,
      status: status(row.ItemStatus),
      transferredAt: text(row.TransferredAt),
      transferDestination: text(row.TransferDestination),
      createdAt: text(row.SourceCreatedAt) || createdAt,
    };
  if (table === "profiles")
    return { email: authorEmail(row), window: text(row.DefaultWindow) };
  if (table === "requests") {
    const campuses =
      row.CampusCode === null || row.CampusCode === undefined
        ? []
        : typeof row.CampusCode === "string"
          ? Array.from(
              new Set(
                row.CampusCode.split(";")
                  .map((code) => code.trim())
                  .filter(Boolean),
              ),
            )
          : undefined;
    return {
      email: authorEmail(row),
      key: text(row.Title),
      criteria: {
        parent: text(row.ParentCategoryCode),
        category: text(row.CategoryCode),
        colors: splitColors(row.Colors),
        campuses,
        building: text(row.BuildingCode),
        dateFrom: date(row.LostFrom),
        dateTo: date(row.LostTo),
        query: text(row.SearchQuery),
      },
      feature: text(row.Feature),
      valuable: false,
      status: status(row.RequestStatus),
      createdAt,
    };
  }
  if (table === "claims")
    return {
      email: authorEmail(row),
      itemId: text(row.ItemId),
      requestId: text(row.RequestId),
      feature: text(row.Feature),
      title: text(row.ItemTitle),
      window: text(row.StorageWindow),
      status: status(row.ClaimStatus),
      createdAt,
      returnedAt: text(row.ReturnedAt),
    };
  if (table === "notices")
    return {
      key: text(row.NotificationKey),
      owner: text(row.RecipientUserId),
      email: text(row.RecipientEmail).toLowerCase(),
      itemId: text(row.ItemId),
      requestId: text(row.RequestId),
      claimId: text(row.ClaimId),
      kind: status(row.NoticeKind),
      title: text(row.ItemTitle),
      window: text(row.StorageWindow),
      message: text(row.Message),
      createdAt: text(row.NoticeCreatedAt) || createdAt,
      unavailable: row.CandidateUnavailable,
    };
  return {
    key: text(row.NotificationKey),
    email: text(row.RecipientEmail).toLowerCase(),
    subject: text(row.MailSubject),
    body: text(row.MailBody),
    status: status(row.MailStatus),
    error: text(row.ErrorMessage),
  };
}

function encodeRow(
  table: Exclude<Table, "items">,
  value: Record<string, unknown>,
): Record<string, unknown> {
  const identity =
    value.key ||
    (value.sourceId
      ? `${table}:${value.sourceId}`
      : value.title || value.email || table);
  const title = text(identity).slice(0, 255);
  if (table === "public")
    return {
      Title: title,
      SourceItemId: text(value.sourceId),
      ItemTitle: text(value.title),
      ParentCategoryCode: text(value.parent),
      CategoryCode: text(value.category),
      Colors: splitColors(value.colors).join(";"),
      CampusCode: text(value.campus),
      BuildingCode: text(value.building),
      Place: text(value.place),
      FoundOn: value.foundOn ? `${date(value.foundOn)}T00:00:00Z` : null,
      StorageWindow: text(value.window),
      Feature: text(value.feature),
      ItemStatus: text(value.status),
      TransferredAt: text(value.transferredAt),
      TransferDestination: text(value.transferDestination),
      SourceCreatedAt: value.createdAt ? text(value.createdAt) : null,
    };
  if (table === "profiles")
    return { Title: title, DefaultWindow: text(value.window) };
  if (table === "requests") {
    const criteria = value.criteria as Criteria;
    return {
      Title: title,
      ParentCategoryCode: text(criteria.parent),
      CategoryCode: text(criteria.category),
      Colors: splitColors(criteria.colors).join(";"),
      CampusCode: criteria.campuses.join(";"),
      BuildingCode: text(criteria.building),
      LostFrom: criteria.dateFrom
        ? `${date(criteria.dateFrom)}T00:00:00Z`
        : null,
      LostTo: criteria.dateTo ? `${date(criteria.dateTo)}T00:00:00Z` : null,
      SearchQuery: text(criteria.query),
      Feature: text(value.feature),
      RequestStatus: text(value.status),
    };
  }
  if (table === "claims")
    return {
      Title: title,
      ItemId: text(value.itemId),
      RequestId: text(value.requestId),
      Feature: text(value.feature),
      ItemTitle: text(value.title),
      StorageWindow: text(value.window),
      ClaimStatus: text(value.status),
      ReturnedAt: value.returnedAt ? text(value.returnedAt) : null,
    };
  if (table === "notices")
    return {
      Title: title,
      NotificationKey: text(value.key),
      RecipientUserId: value.owner ? Number(value.owner) : null,
      RecipientEmail: text(value.email).toLowerCase(),
      ItemId: text(value.itemId),
      RequestId: text(value.requestId),
      ClaimId: text(value.claimId),
      NoticeKind: text(value.kind),
      ItemTitle: text(value.title),
      StorageWindow: text(value.window),
      Message: text(value.message),
      NoticeCreatedAt: value.createdAt ? text(value.createdAt) : null,
      ...(value.unavailable === undefined
        ? {}
        : { CandidateUnavailable: value.unavailable }),
    };
  return {
    Title: title,
    NotificationKey: text(value.key),
    RecipientEmail: text(value.email).toLowerCase(),
    MailSubject: text(value.subject),
    MailBody: text(value.body),
    MailStatus: text(value.status),
    ErrorMessage: text(value.error),
  };
}

export class SharePointRepository implements Repository {
  private transferColumnsAvailable = true;
  public constructor(
    private client: SPHttpClient,
    private site: string,
    public user: User,
    private now: () => Date = () => new Date(),
  ) {}
  private base(table: Table): string {
    return `${this.site}/_api/web/lists/getbytitle('${LISTS[table].replace(/'/g, "''")}')`;
  }
  private async call(
    url: string,
    body?: object,
    headers: Record<string, string> = {},
  ): Promise<Record<string, unknown>> {
    const options = {
      headers: {
        Accept: "application/json;odata=minimalmetadata",
        "Content-Type": "application/json;odata=nometadata",
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    };
    const response =
      body === undefined
        ? await this.client.get(url, SPHttpClient.configurations.v1, options)
        : await this.client.post(url, SPHttpClient.configurations.v1, options);
    if (!response.ok) {
      const failure = typeof response.text === 'function' ? await response.text() : '';
      let errorMessage = failure;
      try {
        const payload = JSON.parse(failure) as Record<string, unknown>;
        const detail = (payload['odata.error'] || payload.error) as {message?: string | {value?: string}} | undefined;
        errorMessage = typeof detail?.message === 'string' ? detail.message : detail?.message?.value || failure;
      } catch { /* Non-JSON errors retain their HTTP status. */ }
      const missingTransferColumn = response.status === 400
        && /TransferredAt|TransferDestination/.test(errorMessage)
        && /does not exist|not found|存在しません|見つかりません/i.test(errorMessage);
      throw Object.assign(
        new Error(
          response.status === 412
            ? "他の職員が更新しました。一覧を更新してからやり直してください。"
            : response.status === 403
              ? "この操作の権限がありません。"
              : response.status === 404
                ? "必要なデータにアクセスできません。リスト設定またはアクセス権を確認してください。"
                : `保存・読込に失敗しました（${response.status}）。入力内容を確認して再試行してください。`,
        ),
        { status: response.status, missingTransferColumn },
      );
    }
    if (response.status === 204) return {};
    const text = await response.text();
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  }
  public async list(table: Table): Promise<Row[]> {
    if (table === "photoBatches") return this.listPhotoSlots();
    if (table === "submissions") throw new Error("拾得者登録は廃止済みです。拾得物は保管窓口へ届けてください。");
    const filter = table === "public" ? "&$filter=(ItemStatus eq '保管中' or ItemStatus eq '移管済み')" : table === "items" ? "&$filter=IsPublic eq 1" : "";
    const readFields = table === 'public' && !this.transferColumnsAvailable
      ? READ_FIELDS[table]?.replace(',TransferredAt,TransferDestination', '') : READ_FIELDS[table];
    const fields = readFields ? `Id,AuthorId,Created,${readFields},Author/EMail` : "*,Author/EMail";
    let url = `${this.base(table)}/items?$top=1000&$select=${fields}&$expand=Author${filter}&$orderby=Created desc`;
    const result: Row[] = [];
    while (url) {
      let body: Record<string, unknown>;
      try {
        body = await this.call(url);
      } catch (e) {
        // Optional transfer columns may be provisioned after the student package.
        // Retry only a confirmed missing-column response, once, before any rows.
        if (table === 'public' && this.transferColumnsAvailable && !result.length
          && (e as {missingTransferColumn?: boolean}).missingTransferColumn) {
          this.transferColumnsAvailable = false;
          url = url.replace(',TransferredAt,TransferDestination', '');
          continue;
        }
        // Until the first item-level notice permission is granted, SharePoint hides
        // LFNotices from the student with either 403 or security-trimmed 404.
        if (
          table === "notices" &&
          this.user.role === "student" &&
          [403, 404].includes((e as { status?: number }).status || 0)
        )
          return result;
        throw Object.assign(
          new Error(
            `${LISTS[table]}: ${e instanceof Error ? e.message : String(e)}`,
          ),
          { status: (e as { status?: number }).status },
        );
      }
      const values = (body.value || []) as Record<string, unknown>[];
      for (const r of values) {
        // Legacy staff builds stored internal processing commands in LFNotices.
        // They are not student notifications and must never surface as corrupt data.
        if (
          table === "notices" &&
          !["MATCH", "VALUABLE"].includes(status(r.NoticeKind))
        )
          continue;
        let value: Record<string, unknown>;
        if (table === "items") {
          const category = normalizeCategoryCodes(
            String(r.ParentCategoryCode || "") || undefined,
            String(r.CategoryCode || "") || undefined,
            String(r.Title || ""),
          );
          const status = String(r.Status || "保管中");
          value = {
            parent: category.parentCode || "",
            category: category.categoryCode || "",
            title: r.Title || "分類不明",
            colors: splitColors(r.Color),
            campus: r.CampusCode || "",
            building: r.BuildingCode || "",
            place: r.Place || "",
            foundOn: r.FoundOn
              ? new Date(String(r.FoundOn)).toLocaleDateString("en-CA", {
                  timeZone: "Asia/Tokyo",
                })
              : "",
            window: r.StorageWindow || "",
            feature: r.Feature || "",
            valuable: r.IsPublic === false,
            status,
            createdAt: r.Created || "",
            finderEmail: r.FinderEmail || "",
            internalNote: r.InternalNote || "",
            recipientEmail: r.ReturnRecipientEmail || "",
            returnedAt: r.ReturnedAt || "",
            returnedBy: r.ReturnedByEmail || "",
            claimId: r.ClaimId || "",
            requestId: r.RequestId || "",
            audit: JSON.parse(String(r.ReturnAudit || "[]")),
          };
          value.studentSubmissionKey = text(r.StudentSubmissionKey);
        } else {
          value = decodeRow(table, r);
          if (!validRecord(table, value)) value = { invalid: true };
        }
        result.push({
          id: String(r.Id),
          author: String(r.AuthorId),
          etag: String(r["@odata.etag"] || r["odata.etag"] || ""),
          value,
        });
      }
      const next = String(
        body["@odata.nextLink"] || body["odata.nextLink"] || "",
      );
      if (next && !next.startsWith(`${this.site}/_api/`))
        throw new Error("不正なページングURLです。");
      url = next;
    }
    return result;
  }
  private async listPhotoSlots(): Promise<Row[]> {
    const readAt = this.now();
    const groups = new Map<string, {row: Row; slots: Set<number>}>();
    const site = new URL(this.site);
    const seen = new Set<number>();
    let url = `${this.base("photoBatches")}/items?$top=1000&$select=Id,Title,StorageWindow,ReceivedOn,Slot,PhotoCount,AttachmentFiles/FileName,AttachmentFiles/ServerRelativeUrl&$expand=AttachmentFiles&$filter=PhotoCount eq 1 and ReceivedOn ge datetime'${photoPublicCutoffInstant(readAt)}'&$orderby=ReceivedOn desc,Id desc`;
    while (url) {
      const body = await this.call(url);
      for (const raw of (body.value || []) as Record<string, unknown>[]) {
        if (Number(raw.PhotoCount) !== 1) continue;
        const id = Number(raw.Id), slot = Number(raw.Slot);
        const window = text(raw.StorageWindow), receivedOn = intakeDate(raw.ReceivedOn);
        if (receivedOn && !isPhotoPublished(receivedOn, readAt)) continue;
        const key = `${window}|${receivedOn}`;
        if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) throw new Error("写真の識別情報が不正です。");
        seen.add(id);
        let group = groups.get(key);
        if (!group) {
          group = {row:{id:String(id), author:"", etag:"", value:{window,receivedOn,photos:[]}}, slots:new Set()};
          groups.set(key,group);
        }
        const files = raw.AttachmentFiles;
        if (!Array.isArray(files) || !Number.isInteger(slot) || slot < 1 || slot > 3 || text(raw.Title) !== `${key}|${slot}` || group.slots.has(slot)) {
          group.row.value = {invalid:true};
          continue;
        }
        group.slots.add(slot);
        // A native form creates metadata before the attachment. A failed or
        // in-flight upload occupies its slot but is never an empty photo card.
        if (files.length === 0) continue;
        if (files.length !== 1) { group.row.value = {invalid:true}; continue; }
        try {
          const file = files[0] as Record<string, unknown>;
          const photoUrl = new URL(text(file.ServerRelativeUrl),site.origin);
          const prefix = `${site.pathname.replace(/\/$/, "")}/Lists/LFDailyPhotoBatches/Attachments/${id}/`;
          if (photoUrl.origin !== site.origin || !photoUrl.pathname.startsWith(prefix) || photoUrl.search || photoUrl.hash) throw new Error("Invalid photo URL");
          if (!group.row.value.invalid) {
            (group.row.value.photos as {name:string;url:string;slot:number}[]).push({name:text(file.FileName),url:photoUrl.href,slot});
          }
        } catch { group.row.value = {invalid:true}; }
      }
      const next = text(body["@odata.nextLink"] || body["odata.nextLink"]);
      if (next && !next.startsWith(`${this.site}/_api/`)) throw new Error("不正なページングURLです。");
      url = next;
    }
    return [...groups.values()].flatMap(({row}) => {
      if (row.value.invalid) return [row];
      const photos = row.value.photos as {name:string;url:string;slot:number}[];
      photos.sort((a,b) => a.slot-b.slot);
      row.value.photos = photos.map(({name,url}) => ({name,url}));
      if (!validRecord("photoBatches",row.value)) return [{...row,value:{invalid:true}}];
      return photos.length ? [row] : [];
    });
  }
  public async put(
    table: Table,
    value: object,
    id?: string,
    etag?: string,
  ): Promise<string> {
    if (table === "photoBatches") throw new Error("日別写真は職員画面で保存してください。");
    if (table === "submissions") throw new Error("拾得物は保管窓口へ届けてください。");
    const v = value as Record<string, unknown>;
    if (table !== "items" && !validRecord(table, v))
      throw new Error("保存データの項目または状態値が不正です。");
    if (
      table === "notices" &&
      v.owner &&
      (!Number.isInteger(Number(v.owner)) || Number(v.owner) <= 0)
    )
      throw new Error("通知先のSharePoint利用者IDが不正です。");
    let data: Record<string, unknown> =
      table === "items" ? {} : encodeRow(table, v);
    if (table === "items")
      data = {
        Title: v.title,
        ParentCategoryCode: v.parent,
        CategoryCode: v.category,
        Color: (v.colors as string[]).join(";"),
        CampusCode: v.campus,
        BuildingCode: v.building,
        Place: v.place,
        FoundOn: v.foundOn ? `${v.foundOn}T00:00:00Z` : null,
        StorageWindow: v.window,
        Feature: v.feature,
        IsPublic: true,
        Status: v.status,
        InternalNote: v.internalNote || "",
        ReturnRecipientEmail: v.recipientEmail || "",
        ReturnedAt: v.returnedAt || null,
        ReturnedByEmail: v.returnedBy || "",
        ClaimId: v.claimId || "",
        RequestId: v.requestId || "",
        ReturnAudit: JSON.stringify(v.audit || []),
      };
    if (id) {
      if (!etag)
        throw new Error("更新情報が古くなりました。再読込してください。");
      await this.call(`${this.base(table)}/items(${Number(id)})`, data, {
        "X-HTTP-Method": "MERGE",
        "IF-MATCH": etag,
      });
      return id;
    }
    const result = await this.call(`${this.base(table)}/items`, data);
    return String(result.Id);
  }
  public async remove(table: Table, id: string): Promise<void> {
    if (table === "photoBatches") throw new Error("日別写真は職員画面で管理してください。");
    const row = (await this.list(table)).find((r) => r.id === id);
    if (!row) return;
    await this.call(
      `${this.base(table)}/items(${Number(id)})`,
      {},
      { "X-HTTP-Method": "DELETE", "IF-MATCH": row.etag || "" },
    );
  }
}
