import { query } from "./db";
import {
  getDepartmentChildren,
  findUsersByDepartment,
  DepartmentItem,
  LarkUser,
} from "./lark-api";
import type { ResultSetHeader } from "mysql2/promise";

interface DbDepartment {
  id: number;
  open_id: string | null;
  name: string;
}

function log(msg: string) {
  console.log(`[lark-sync] ${msg}`);
}

function nullIfEmpty(val: string | null | undefined): string | null {
  if (val === null || val === undefined) return null;
  if (val.trim() === "") return null;
  return val;
}

function getAvatarUrl(user: LarkUser): string | null {
  const a = user.avatar;
  if (!a) return null;
  return a.avatar_origin || a.avatar_640 || a.avatar_240 || a.avatar_72 || null;
}

function getEmployeeStatus(user: LarkUser): number {
  const s = user.status || {};
  if (
    s.is_activated === true &&
    s.is_exited !== true &&
    s.is_frozen !== true &&
    s.is_resigned !== true &&
    s.is_unjoin !== true
  ) {
    return 1;
  }
  return 0;
}

function getPrimaryDepartmentOpenId(user: LarkUser): string | null {
  if (user.orders && user.orders.length > 0) {
    const primary = user.orders.find((o) => o.is_primary_dept);
    if (primary) return primary.department_id;
  }
  if (user.department_ids && user.department_ids.length > 0) {
    return user.department_ids[0];
  }
  return null;
}

async function upsertDepartment(
  item: DepartmentItem,
  parentDbId: number | null
): Promise<{ id: number; isNew: boolean }> {
  const existing = await query<{ id: number }[]>(
    "SELECT id FROM lark_departments WHERE open_id = ?",
    [item.open_department_id]
  );

  const now = new Date();

  if (existing.length > 0) {
    await query(
      "UPDATE lark_departments SET name = ?, parent_id = ?, updated_at = ? WHERE id = ?",
      [item.name, parentDbId, now, existing[0].id]
    );
    return { id: existing[0].id, isNew: false };
  }

  const result = await query<ResultSetHeader>(
    "INSERT INTO lark_departments (name, open_id, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    [item.name, item.open_department_id, parentDbId, now, now]
  );
  return { id: result.insertId, isNew: true };
}

async function upsertEmployee(
  user: LarkUser,
  departmentDbId: number | null
): Promise<boolean> {
  const existing = await query<{ id: number }[]>(
    "SELECT id FROM lark_employees WHERE open_id = ?",
    [user.open_id]
  );

  const now = new Date();
  const isNew = existing.length === 0;

  const data = {
    union_id: nullIfEmpty(user.union_id),
    name: user.name,
    email: nullIfEmpty(user.email),
    phone_number: nullIfEmpty(user.mobile),
    employee_no: nullIfEmpty(user.employee_no),
    department_id: departmentDbId,
    job_title: nullIfEmpty(user.job_title),
    avatar_url: getAvatarUrl(user),
    status: getEmployeeStatus(user),
    updated_at: now,
  };

  if (isNew) {
    await query(
      `INSERT INTO lark_employees
        (open_id, union_id, name, email, phone_number, employee_no, department_id, job_title, avatar_url, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.open_id, data.union_id, data.name, data.email, data.phone_number,
        data.employee_no, data.department_id, data.job_title, data.avatar_url,
        data.status, now, now,
      ]
    );
  } else {
    await query(
      `UPDATE lark_employees SET
        union_id=?, name=?, email=?, phone_number=?, employee_no=?,
        department_id=?, job_title=?, avatar_url=?, status=?, updated_at=?
       WHERE id=?`,
      [
        data.union_id, data.name, data.email, data.phone_number, data.employee_no,
        data.department_id, data.job_title, data.avatar_url, data.status,
        data.updated_at, existing[0].id,
      ]
    );
  }

  return isNew;
}

interface QueueItem {
  openDepartmentId: string;
  parentDbId: number | null;
}

export async function syncAllDepartments(tenantToken: string): Promise<{
  inserted: number;
  updated: number;
  skippedDeleted: number;
}> {
  const queue: QueueItem[] = [{ openDepartmentId: "0", parentDbId: null }];
  const visited = new Set<string>();

  let inserted = 0;
  let updated = 0;
  let skippedDeleted = 0;

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (visited.has(current.openDepartmentId)) continue;
    visited.add(current.openDepartmentId);

    let pageToken: string | null = null;

    do {
      const response = await getDepartmentChildren(
        current.openDepartmentId,
        pageToken,
        tenantToken
      );

      const items = response.data.items || [];

      log(
        `department children fetched parent=${current.openDepartmentId} ` +
        `count=${items.length} has_more=${response.data.has_more}`
      );

      for (const item of items) {
        if (item.status?.is_deleted === true) {
          skippedDeleted++;
          continue;
        }

        const result = await upsertDepartment(item, current.parentDbId);
        if (result.isNew) inserted++;
        else updated++;

        queue.push({
          openDepartmentId: item.open_department_id,
          parentDbId: result.id,
        });
      }

      pageToken = response.data.has_more ? (response.data.page_token ?? null) : null;
    } while (pageToken !== null);
  }

  log(`departments inserted=${inserted} updated=${updated} skipped_deleted=${skippedDeleted}`);
  return { inserted, updated, skippedDeleted };
}

export async function syncAllEmployees(
  userToken: string
): Promise<{ inserted: number; updated: number }> {
  const departments = await query<DbDepartment[]>(
    "SELECT id, open_id, name FROM lark_departments WHERE open_id IS NOT NULL"
  );

  const departmentMap = new Map<string, number>();
  for (const dept of departments) {
    if (dept.open_id) {
      departmentMap.set(dept.open_id, dept.id);
    }
  }

  let inserted = 0;
  let updated = 0;

  for (const dept of departments) {
    if (!dept.open_id) continue;

    let pageToken: string | null = null;

    do {
      const response = await findUsersByDepartment(dept.open_id, pageToken, userToken);

      const users = response.data.items || [];

      log(
        `employees fetched department=${dept.open_id} ` +
        `count=${users.length} has_more=${response.data.has_more}`
      );

      for (const user of users) {
        const primaryOpenId = getPrimaryDepartmentOpenId(user);
        const departmentDbId = primaryOpenId
          ? (departmentMap.get(primaryOpenId) ?? null)
          : dept.id;

        const isNew = await upsertEmployee(user, departmentDbId);
        if (isNew) inserted++;
        else updated++;
      }

      pageToken = response.data.has_more ? (response.data.page_token ?? null) : null;
    } while (pageToken !== null);
  }

  log(`employees inserted=${inserted} updated=${updated}`);
  return { inserted, updated };
}

export async function runLarkSyncJob(
  tenantToken: string,
  userToken: string
): Promise<{ deptResult: Awaited<ReturnType<typeof syncAllDepartments>>; empResult: Awaited<ReturnType<typeof syncAllEmployees>>; durationMs: number }> {
  const startedAt = Date.now();

  log("start sync departments");
  const deptResult = await syncAllDepartments(tenantToken);

  log("start sync employees");
  const empResult = await syncAllEmployees(userToken);

  const durationMs = Date.now() - startedAt;
  log(`done duration_ms=${durationMs}`);

  return { deptResult, empResult, durationMs };
}
