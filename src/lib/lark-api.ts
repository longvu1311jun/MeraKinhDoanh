const LARK_BASE_URL = process.env.LARK_BASE_URL || "https://open.larksuite.com";
const DEPT_PAGE_SIZE = parseInt(process.env.LARK_DEPARTMENT_PAGE_SIZE || "10", 10);
const EMP_PAGE_SIZE = parseInt(process.env.LARK_EMPLOYEE_PAGE_SIZE || "20", 10);

class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(`HTTP ${status}`);
    this.name = "HttpError";
  }
}

class LarkBusinessError extends Error {
  constructor(
    public readonly code: number,
    msg: string
  ) {
    super(msg);
    this.name = "LarkBusinessError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface RetryableResponse {
  ok: boolean;
  status: number;
  json: () => Promise<{ code: number; msg: string }>;
}

async function larkGet<T = unknown>(
  endpoint: string,
  params: Record<string, string | number | undefined>,
  token: string
): Promise<T> {
  const searchParams = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) {
      searchParams.set(k, String(v));
    }
  }

  const url = `${LARK_BASE_URL}${endpoint}?${searchParams.toString()}`;
  let lastResponse: RetryableResponse | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await sleep(Math.pow(2, attempt - 1) * 1000);
    }

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    lastResponse = {
      ok: res.ok,
      status: res.status,
      json: () => res.json() as Promise<{ code: number; msg: string }>,
    };

    const body = await lastResponse.json();

    if (res.ok && body.code === 0) {
      return body as T;
    }

    if (res.status === 429 || res.status >= 500) {
      continue;
    }

    throw new LarkBusinessError(body.code, body.msg);
  }

  if (lastResponse) {
    const body = await lastResponse.json();
    throw new LarkBusinessError(body.code, body.msg);
  }
  throw new HttpError(0, null);
}

export interface DepartmentItem {
  name: string;
  open_department_id: string;
  parent_department_id: string;
  status?: { is_deleted: boolean };
}

export interface DepartmentChildrenResponse {
  code: number;
  msg: string;
  data: {
    has_more: boolean;
    page_token?: string;
    items: DepartmentItem[];
  };
}

export async function getDepartmentChildren(
  departmentId: string,
  pageToken: string | null,
  token: string
): Promise<DepartmentChildrenResponse> {
  const params: Record<string, string | number | undefined> = {
    department_id_type: "open_department_id",
    page_size: DEPT_PAGE_SIZE,
    user_id_type: "open_id",
    page_token: pageToken ?? undefined,
  };

  const encoded = encodeURIComponent(departmentId);
  return larkGet<DepartmentChildrenResponse>(
    `/open-apis/contact/v3/departments/${encoded}/children`,
    params,
    token
  );
}

export interface LarkUser {
  open_id: string;
  union_id: string;
  name: string;
  email: string;
  mobile: string;
  employee_no: string;
  job_title: string;
  avatar?: {
    avatar_origin?: string;
    avatar_640?: string;
    avatar_240?: string;
    avatar_72?: string;
  };
  department_ids: string[];
  orders?: { department_id: string; is_primary_dept: boolean }[];
  status?: {
    is_activated?: boolean;
    is_exited?: boolean;
    is_frozen?: boolean;
    is_resigned?: boolean;
    is_unjoin?: boolean;
  };
}

export interface FindUsersByDepartmentResponse {
  code: number;
  msg: string;
  data: {
    has_more: boolean;
    page_token?: string;
    items: LarkUser[];
  };
}

export async function findUsersByDepartment(
  departmentOpenId: string,
  pageToken: string | null,
  token: string
): Promise<FindUsersByDepartmentResponse> {
  const params: Record<string, string | number | undefined> = {
    department_id: departmentOpenId,
    department_id_type: "open_department_id",
    page_size: EMP_PAGE_SIZE,
    user_id_type: "open_id",
    page_token: pageToken ?? undefined,
  };

  return larkGet<FindUsersByDepartmentResponse>(
    "/open-apis/contact/v3/users/find_by_department",
    params,
    token
  );
}

export { HttpError, LarkBusinessError };
