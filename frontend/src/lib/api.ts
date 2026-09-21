/**
 * Typed fetch client. One place that knows about the API base, auth header,
 * and error shape, so components only deal with data or a thrown Error.
 */

import type {
  AuditList,
  Figure,
  FigureDetail,
  FigureList,
  GraphData,
  Health,
  ImportResult,
  Issue,
  IssueList,
  MatrixData,
  Relationship,
  RelationshipList,
  Stats,
  TierList,
  Token,
} from "./types";

const BASE = "/api";
const TOKEN_KEY = "prism.token";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      // Private browsing can throw on access; treat as logged out.
      return null;
    }
  },
  set(token: string): void {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* ignore */
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  if (options.auth) {
    const token = tokenStore.get();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    // FastAPI returns {detail: string} for HTTPException and
    // {detail: [{msg, loc}]} for validation errors.
    let message = `Request failed (${response.status})`;
    if (payload && typeof payload === "object" && "detail" in payload) {
      const detail = (payload as { detail: unknown }).detail;
      if (typeof detail === "string") {
        message = detail;
      } else if (Array.isArray(detail) && detail.length > 0) {
        const first = detail[0] as { msg?: string };
        message = first.msg ?? message;
      }
    }
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Upload files as multipart/form-data.
 *
 * Separate from `request` because a multipart body must NOT set Content-Type:
 * the browser has to add the boundary, and setting the header by hand makes the
 * server unable to parse the body at all. Sending it as JSON is not an option
 * either, since the payload is a file.
 */
async function upload<T>(path: string, files: File[]): Promise<T> {
  const form = new FormData();
  for (const file of files) form.append("files", file, file.name);

  const headers: Record<string, string> = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: form,
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    // The import endpoints answer 200 with ok:false for validation problems, so
    // reaching here means the request itself failed. Still, prefer the server's
    // message when there is one.
    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? String((payload as { detail: unknown }).detail)
        : `Permintaan gagal (HTTP ${response.status}).`;
    throw new ApiError(detail, response.status);
  }

  return payload as T;
}

export const api = {
  health: () => request<Health>("/health"),
  tiers: () => request<TierList>("/tiers"),

  /**
   * Download the whole dataset in the import format.
   *
   * Fetched rather than linked so the auth header is sent: a plain <a href>
   * cannot carry a bearer token, and the endpoint requires one.
   */
  exportBundle: async (): Promise<void> => {
    const headers: Record<string, string> = {};
    const token = tokenStore.get();
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${BASE}/admin/export`, { headers });
    if (!response.ok) {
      throw new ApiError(`Ekspor gagal (HTTP ${response.status}).`, response.status);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "prism-bundle.json";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },

  importData: {
    preview: (files: File[]) => upload<ImportResult>("/admin/import/preview", files),
    apply: (files: File[]) => upload<ImportResult>("/admin/import", files),
  },

  figures: {
    list: (params: { q?: string; bloc?: string; party?: string } = {}) =>
      request<FigureList>(`/figures${query(params)}`),
    get: (id: number) => request<FigureDetail>(`/figures/${id}`),
    create: (body: Partial<Figure>) =>
      request<{ id: number }>("/admin/figures", { method: "POST", body, auth: true }),
    update: (id: number, body: Partial<Figure>) =>
      request<{ ok: boolean }>(`/admin/figures/${id}`, { method: "PUT", body, auth: true }),
    remove: (id: number) =>
      request<{ ok: boolean }>(`/admin/figures/${id}`, { method: "DELETE", auth: true }),
  },

  issues: {
    list: () => request<IssueList>("/issues"),
    create: (body: Partial<Issue>) =>
      request<{ id: number }>("/admin/issues", { method: "POST", body, auth: true }),
    update: (id: number, body: Partial<Issue>) =>
      request<{ ok: boolean }>(`/admin/issues/${id}`, { method: "PUT", body, auth: true }),
    remove: (id: number) =>
      request<{ ok: boolean }>(`/admin/issues/${id}`, { method: "DELETE", auth: true }),
  },

  relationships: {
    list: (
      params: { min_score?: number; max_score?: number; rel_type?: string; figure_id?: number } = {},
    ) => request<RelationshipList>(`/relationships${query(params)}`),
    create: (body: {
      source_id: number;
      target_id: number;
      rel_type?: string;
      score_mode?: string;
      manual_score?: number;
      notes?: string | null;
    }) => request<{ id: number }>("/admin/relationships", { method: "POST", body, auth: true }),
    update: (id: number, body: Partial<Relationship>) =>
      request<{ ok: boolean }>(`/admin/relationships/${id}`, { method: "PUT", body, auth: true }),
    remove: (id: number) =>
      request<{ ok: boolean }>(`/admin/relationships/${id}`, { method: "DELETE", auth: true }),
    upsertIssue: (
      relId: number,
      body: { issue_id: number; score: number; weight: number; stance?: string | null },
    ) =>
      request<{ ok: boolean }>(`/admin/relationships/${relId}/issues`, {
        method: "POST",
        body,
        auth: true,
      }),
    removeIssue: (relId: number, issueId: number) =>
      request<{ ok: boolean }>(`/admin/relationships/${relId}/issues/${issueId}`, {
        method: "DELETE",
        auth: true,
      }),
    addModifier: (
      relId: number,
      body: {
        label: string;
        value: number;
        kind: string;
        expires_at?: string | null;
        note?: string | null;
      },
    ) =>
      request<{ id: number }>(`/admin/relationships/${relId}/modifiers`, {
        method: "POST",
        body,
        auth: true,
      }),
  },

  modifiers: {
    update: (id: number, body: unknown) =>
      request<{ ok: boolean }>(`/admin/modifiers/${id}`, { method: "PUT", body, auth: true }),
    remove: (id: number) =>
      request<{ ok: boolean }>(`/admin/modifiers/${id}`, { method: "DELETE", auth: true }),
  },

  graph: (params: { threshold?: number; bloc?: string } = {}) =>
    request<GraphData>(`/graph${query(params)}`),
  matrix: (params: { bloc?: string } = {}) => request<MatrixData>(`/matrix${query(params)}`),
  stats: () => request<Stats>("/stats"),

  auth: {
    login: (username: string, password: string) =>
      request<Token>("/admin/auth/login", { method: "POST", body: { username, password } }),
    changePassword: (oldPassword: string, newPassword: string) =>
      request<{ ok: boolean }>("/admin/auth/change-password", {
        method: "POST",
        body: { old_password: oldPassword, new_password: newPassword },
        auth: true,
      }),
    audit: (limit = 200) =>
      request<AuditList>(`/admin/audit${query({ limit })}`, { auth: true }),
  },
};
