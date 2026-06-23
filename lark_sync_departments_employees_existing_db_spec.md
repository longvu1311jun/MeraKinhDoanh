# Đặc tả code: Đồng bộ phòng ban và nhân viên Lark Suite vào DB hiện có

> **Quan trọng:** Database và 2 bảng `lark_departments`, `lark_employees` đã tồn tại.  
> Task này **không được tạo bảng mới**, **không tự ALTER TABLE**, **không tự tạo migration**, **không tự tạo bảng phụ**.  
> Chỉ viết code đồng bộ dữ liệu vào đúng các cột đang có.

---

## 1. Mục tiêu

Xây dựng job/service đồng bộ dữ liệu từ Lark Suite về DB nội bộ hiện có, gồm:

1. Đồng bộ toàn bộ cây phòng ban từ Lark API.
2. Đồng bộ toàn bộ nhân viên theo từng phòng ban đã lưu trong DB.
3. Chạy lại nhiều lần không tạo duplicate.
4. Có xử lý phân trang bằng `has_more` và `page_token`.
5. Không hardcode token, không log token ra console/log file.

Thứ tự chạy bắt buộc:

```text
sync departments trước
-> lấy toàn bộ open_id phòng ban trong bảng lark_departments
-> sync employees theo từng open_id phòng ban
```

---

## 2. DB hiện có, không tạo thêm bảng

### 2.1. Bảng `lark_departments`

Các cột đang có:

```text
id
name
parent_id
open_id
created_at
updated_at
```

Mapping khi lưu phòng ban:

| API field | DB field | Ghi chú |
|---|---|---|
| `item.name` | `lark_departments.name` | Tên phòng ban |
| `item.open_department_id` | `lark_departments.open_id` | Dùng để tìm record cũ và update, tránh duplicate |
| DB id của phòng ban cha | `lark_departments.parent_id` | Lưu `id` của phòng ban cha trong DB |
| `item.department_id` | Không lưu | DB hiện tại không có cột tương ứng |
| `item.member_count` | Không lưu | DB hiện tại không có cột tương ứng |
| `item.primary_member_count` | Không lưu | DB hiện tại không có cột tương ứng |

Quy tắc cho `parent_id`:

```text
- Phòng ban root lấy từ department_id = 0, ví dụ HOST: parent_id = null.
- Phòng ban con: parent_id = id của record cha trong bảng lark_departments.
```

> Lưu ý: Nếu sau này bắt buộc phải lưu `department_id` hoặc `member_count` của Lark thì cần yêu cầu riêng để bổ sung cột DB. Trong task hiện tại, AI/dev không tự ý sửa schema.

---

### 2.2. Bảng `lark_employees`

Các cột đang có:

```text
id
open_id
union_id
name
email
phone_number
employee_no
department_id
job_title
avatar_url
status
pos_user_id
fb_id
created_at
updated_at
```

Mapping khi lưu nhân viên:

| API field | DB field | Ghi chú |
|---|---|---|
| `user.open_id` | `lark_employees.open_id` | Dùng để tìm record cũ và update, tránh duplicate |
| `user.union_id` | `lark_employees.union_id` | Có thể null |
| `user.name` | `lark_employees.name` | Tên hiển thị |
| `user.email` | `lark_employees.email` | Empty string thì lưu null |
| `user.mobile` | `lark_employees.phone_number` | Empty string thì lưu null |
| `user.employee_no` | `lark_employees.employee_no` | Empty string thì lưu null |
| DB id của phòng ban chính | `lark_employees.department_id` | Map từ `open_department_id` sang `lark_departments.id` |
| `user.job_title` | `lark_employees.job_title` | Empty string thì lưu null |
| `user.avatar.avatar_origin` | `lark_employees.avatar_url` | Fallback lần lượt `avatar_640`, `avatar_240`, `avatar_72` |
| derived from `user.status` | `lark_employees.status` | Xem quy tắc ở mục 8 |
| Không có trong Lark response | `pos_user_id`, `fb_id` | Không update, giữ nguyên giá trị hiện tại hoặc null |

Không tạo bảng phụ quan hệ nhân viên - phòng ban. Nếu một nhân viên thuộc nhiều phòng ban, chỉ lưu phòng ban chính vào `lark_employees.department_id`.

---

## 3. Không dùng DDL trong task này

AI/dev khi code **không được** sinh hoặc chạy các câu sau:

```sql
CREATE TABLE ...
ALTER TABLE ...
CREATE INDEX ...
CREATE UNIQUE INDEX ...
DROP TABLE ...
```

Cách chống duplicate phải làm bằng logic application:

```text
- Với phòng ban: tìm theo lark_departments.open_id.
  - Có rồi thì update.
  - Chưa có thì insert.

- Với nhân viên: tìm theo lark_employees.open_id.
  - Có rồi thì update.
  - Chưa có thì insert.
```

Nếu DB đã có unique constraint/index thì tận dụng được, nhưng code không được tự tạo constraint/index trong task này.

---

## 4. Cấu hình môi trường

Không hardcode token trong source code. Đọc từ biến môi trường hoặc config bảo mật.

```env
LARK_BASE_URL=https://open.larksuite.com
LARK_TENANT_ACCESS_TOKEN=<tenant-token>
LARK_USER_ACCESS_TOKEN=<user-token>
LARK_DEPARTMENT_PAGE_SIZE=10
LARK_EMPLOYEE_PAGE_SIZE=20
```

Token sử dụng:

| API | Header token |
|---|---|
| Lấy phòng ban | `Authorization: Bearer ${LARK_TENANT_ACCESS_TOKEN}` |
| Lấy nhân viên theo phòng ban | `Authorization: Bearer ${LARK_USER_ACCESS_TOKEN}` |

Không log full header vì sẽ lộ token.

---

## 5. API đồng bộ phòng ban

### 5.1. Endpoint

```http
GET /open-apis/contact/v3/departments/{department_id}/children
```

Base URL:

```text
https://open.larksuite.com
```

Query params cố định:

```text
department_id_type=open_department_id
page_size=10
user_id_type=open_id
```

Khi có phân trang, truyền thêm:

```text
page_token=<data.page_token của response trước>
```

Curl mẫu lần đầu:

```bash
curl -i -X GET 'https://open.larksuite.com/open-apis/contact/v3/departments/0/children?department_id_type=open_department_id&page_size=10&user_id_type=open_id' \
  -H 'Authorization: Bearer <tenant-token>'
```

### 5.2. Response phòng ban

Response thành công có dạng:

```json
{
  "code": 0,
  "data": {
    "has_more": false,
    "items": [
      {
        "department_id": "c8956db6gc739dg3",
        "name": "HOST",
        "open_department_id": "od-058b35b9a2042e91906a7e33fc8fa8eb",
        "parent_department_id": "0",
        "member_count": 168,
        "primary_member_count": 82,
        "status": {
          "is_deleted": false
        }
      }
    ]
  },
  "msg": "success"
}
```

Chỉ xử lý khi:

```text
HTTP status là 2xx
và body.code == 0
```

Nếu `body.code != 0`, coi là lỗi từ Lark. Log `code`, `msg`, endpoint, params đã mask token, sau đó retry hoặc fail job theo retry policy.

---

## 6. Logic đồng bộ phòng ban

### 6.1. Điểm bắt đầu

Lần đầu gọi API với:

```text
department_id = 0
```

API trả về phòng ban cấp đầu tiên, ví dụ `HOST`.

Lưu `HOST` vào DB:

```text
lark_departments.name      = item.name
lark_departments.open_id   = item.open_department_id
lark_departments.parent_id = null
```

Sau khi lưu được `HOST`, lấy `id` của record `HOST` trong DB. Tiếp tục gọi API children với:

```text
department_id = HOST.open_department_id
```

Ví dụ:

```http
GET /open-apis/contact/v3/departments/od-058b35b9a2042e91906a7e33fc8fa8eb/children?department_id_type=open_department_id&page_size=10&user_id_type=open_id
```

Các phòng ban con lấy được sẽ lưu:

```text
lark_departments.name      = child.name
lark_departments.open_id   = child.open_department_id
lark_departments.parent_id = HOST.id
```

Tiếp tục gọi API children với từng `open_department_id` mới lưu cho đến khi duyệt hết cây phòng ban.

### 6.2. Điều kiện dừng đúng

`has_more` chỉ cho biết còn page tiếp theo của **danh sách con hiện tại** hay không. Nó không có nghĩa là đã duyệt hết toàn bộ cây phòng ban.

Với mỗi `department_id` đang xử lý:

```text
Nếu has_more = true:
  gọi lại cùng department_id, truyền thêm page_token.

Nếu has_more = false:
  đã lấy hết children của department_id hiện tại.
  Sau đó vẫn phải xử lý các phòng ban con đã đưa vào queue.
```

Toàn bộ sync phòng ban chỉ kết thúc khi:

```text
queue/stack duyệt cây phòng ban rỗng
và mọi page của mọi phòng ban đã xử lý xong
```

### 6.3. Thuật toán đề xuất

Có thể dùng BFS hoặc DFS. BFS dễ debug hơn.

Pseudo-code:

```pseudo
function syncAllDepartments():
    queue = [{ openDepartmentId: "0", parentDbId: null }]
    visited = Set()

    while queue is not empty:
        current = queue.pop()

        if current.openDepartmentId in visited:
            continue
        visited.add(current.openDepartmentId)

        pageToken = null

        do:
            response = callGetDepartmentChildren(
                departmentId = current.openDepartmentId,
                pageToken = pageToken
            )

            assertSuccess(response)

            items = response.data.items or []

            for item in items:
                if item.status exists and item.status.is_deleted == true:
                    continue

                deptDbRecord = findDepartmentByOpenId(item.open_department_id)

                if deptDbRecord exists:
                    update deptDbRecord set:
                        name = item.name
                        parent_id = current.parentDbId
                        updated_at = now()
                else:
                    deptDbRecord = insert into lark_departments:
                        name = item.name
                        open_id = item.open_department_id
                        parent_id = current.parentDbId
                        created_at = now()
                        updated_at = now()

                queue.push({
                    openDepartmentId: item.open_department_id,
                    parentDbId: deptDbRecord.id
                })

            pageToken = response.data.page_token

        while response.data.has_more == true
```

### 6.4. Upsert phòng ban theo DB hiện có

Khóa tìm kiếm logic:

```text
lark_departments.open_id = item.open_department_id
```

Nếu chưa tồn tại:

```text
insert name, open_id, parent_id, created_at, updated_at
```

Nếu đã tồn tại:

```text
update name, parent_id, updated_at
```

Không insert/update các field không có trong DB hiện tại như `department_id`, `member_count`.

---

## 7. API đồng bộ nhân viên

### 7.1. Endpoint

```http
GET /open-apis/contact/v3/users/find_by_department
```

Query params:

```text
department_id=<open_department_id>
department_id_type=open_department_id
page_size=20
user_id_type=open_id
```

Khi có phân trang, truyền thêm:

```text
page_token=<data.page_token của response trước>
```

Curl mẫu:

```bash
curl -i -X GET 'https://open.larksuite.com/open-apis/contact/v3/users/find_by_department?department_id=od-21d5d767c4b188e7d97c7082f82a55ab&department_id_type=open_department_id&page_size=20&user_id_type=open_id' \
  -H 'Authorization: Bearer <user-token>'
```

### 7.2. Response nhân viên

Response thành công có dạng tổng quát:

```json
{
  "code": 0,
  "data": {
    "has_more": false,
    "items": [
      {
        "open_id": "ou_xxx",
        "union_id": "on_xxx",
        "user_id": "xxx",
        "name": "Tên nhân viên",
        "email": "email@example.com",
        "mobile": "",
        "employee_no": "",
        "job_title": "",
        "avatar": {
          "avatar_origin": "https://...",
          "avatar_640": "https://...",
          "avatar_240": "https://...",
          "avatar_72": "https://..."
        },
        "department_ids": [
          "od-21d5d767c4b188e7d97c7082f82a55ab"
        ],
        "orders": [
          {
            "department_id": "od-21d5d767c4b188e7d97c7082f82a55ab",
            "is_primary_dept": true
          }
        ],
        "status": {
          "is_activated": true,
          "is_exited": false,
          "is_frozen": false,
          "is_resigned": false,
          "is_unjoin": false
        }
      }
    ]
  },
  "msg": "success"
}
```

---

## 8. Logic đồng bộ nhân viên

### 8.1. Nguồn danh sách phòng ban

Sau khi sync xong phòng ban, lấy toàn bộ phòng ban từ DB hiện có:

```sql
SELECT id, open_id, name
FROM lark_departments
WHERE open_id IS NOT NULL;
```

Với từng record, gọi API nhân viên:

```text
department_id = lark_departments.open_id
```

Không gọi API nhân viên với `department_id = 0`.

### 8.2. Thuật toán đề xuất

```pseudo
function syncAllEmployees():
    departments = getAllLarkDepartmentsFromDb()
    departmentMapByOpenId = map departments by open_id

    for department in departments:
        syncEmployeesByDepartment(
            departmentOpenId = department.open_id,
            fallbackDepartmentDbId = department.id,
            departmentMapByOpenId = departmentMapByOpenId
        )
```

```pseudo
function syncEmployeesByDepartment(departmentOpenId, fallbackDepartmentDbId, departmentMapByOpenId):
    pageToken = null

    do:
        response = callFindUsersByDepartment(
            departmentId = departmentOpenId,
            pageToken = pageToken
        )

        assertSuccess(response)

        users = response.data.items or []

        for user in users:
            primaryOpenDepartmentId = getPrimaryDepartmentOpenId(user)

            if primaryOpenDepartmentId exists in departmentMapByOpenId:
                employeeDepartmentDbId = departmentMapByOpenId[primaryOpenDepartmentId].id
            else:
                employeeDepartmentDbId = fallbackDepartmentDbId

            upsertEmployee(user, employeeDepartmentDbId)

        pageToken = response.data.page_token

    while response.data.has_more == true
```

### 8.3. Xác định phòng ban chính của nhân viên

```pseudo
function getPrimaryDepartmentOpenId(user):
    primaryOrder = first item in user.orders where item.is_primary_dept == true

    if primaryOrder exists:
        return primaryOrder.department_id

    if user.department_ids has at least 1 item:
        return user.department_ids[0]

    return null
```

### 8.4. Quy tắc status nhân viên

Vì `lark_employees.status` đang là field số, mapping đề xuất:

```text
status = 1 nếu:
  user.status.is_activated = true
  và user.status.is_exited = false
  và user.status.is_frozen = false
  và user.status.is_resigned = false
  và user.status.is_unjoin = false

status = 0 cho các trường hợp còn lại
```

Nếu object `user.status` thiếu field nào, coi field đó là false, trừ `is_activated` phải là true thì mới active.

### 8.5. Upsert nhân viên theo DB hiện có

Khóa tìm kiếm logic:

```text
lark_employees.open_id = user.open_id
```

Nếu chưa tồn tại:

```text
insert:
  open_id
  union_id
  name
  email
  phone_number
  employee_no
  department_id
  job_title
  avatar_url
  status
  created_at
  updated_at
```

Nếu đã tồn tại:

```text
update:
  union_id
  name
  email
  phone_number
  employee_no
  department_id
  job_title
  avatar_url
  status
  updated_at
```

Không update các field không có dữ liệu từ Lark:

```text
pos_user_id
fb_id
```

### 8.6. Helper normalize data

```pseudo
function nullIfEmpty(value):
    if value is null or value is undefined:
        return null
    if trim(value) == "":
        return null
    return value
```

```pseudo
function getAvatarUrl(user):
    if user.avatar is null:
        return null

    return user.avatar.avatar_origin
        or user.avatar.avatar_640
        or user.avatar.avatar_240
        or user.avatar.avatar_72
        or null
```

```pseudo
function getEmployeeStatus(user):
    status = user.status or {}

    if status.is_activated == true
       and status.is_exited != true
       and status.is_frozen != true
       and status.is_resigned != true
       and status.is_unjoin != true:
        return 1

    return 0
```

---

## 9. HTTP client chung

Tạo wrapper gọi Lark API để tái sử dụng.

Yêu cầu wrapper:

1. Ghép `LARK_BASE_URL` với endpoint.
2. Encode path param `department_id` ở API departments children.
3. Chỉ thêm `page_token` vào query khi có giá trị.
4. Set header `Authorization` đúng token theo từng API.
5. Parse JSON response.
6. Check cả HTTP status và `body.code`.
7. Retry lỗi tạm thời: HTTP `429`, `500`, `502`, `503`, `504`.
8. Exponential backoff, ví dụ 1s, 2s, 4s; tối đa 3 lần.
9. Không retry vô hạn.
10. Mask token trong log.

Pseudo-code:

```pseudo
function assertSuccess(response):
    if response.httpStatus < 200 or response.httpStatus >= 300:
        throw HttpError(response.httpStatus, response.body)

    if response.body.code != 0:
        throw LarkBusinessError(response.body.code, response.body.msg)
```

---

## 10. Hàm gọi API

### 10.1. Lấy children của phòng ban

```pseudo
function callGetDepartmentChildren(departmentId, pageToken):
    endpoint = "/open-apis/contact/v3/departments/" + urlEncode(departmentId) + "/children"

    query = {
        department_id_type: "open_department_id",
        page_size: env.LARK_DEPARTMENT_PAGE_SIZE or 10,
        user_id_type: "open_id"
    }

    if pageToken is not null:
        query.page_token = pageToken

    return httpGet(endpoint, query, token = env.LARK_TENANT_ACCESS_TOKEN)
```

### 10.2. Lấy nhân viên theo phòng ban

```pseudo
function callFindUsersByDepartment(departmentId, pageToken):
    endpoint = "/open-apis/contact/v3/users/find_by_department"

    query = {
        department_id: departmentId,
        department_id_type: "open_department_id",
        page_size: env.LARK_EMPLOYEE_PAGE_SIZE or 20,
        user_id_type: "open_id"
    }

    if pageToken is not null:
        query.page_token = pageToken

    return httpGet(endpoint, query, token = env.LARK_USER_ACCESS_TOKEN)
```

---

## 11. Logging

Log đủ để debug nhưng không log token.

Log khi bắt đầu job:

```text
[lark-sync] start sync departments
[lark-sync] start sync employees
```

Log mỗi page:

```text
[lark-sync] department children fetched parent=<open_department_id> count=<n> has_more=<true|false>
[lark-sync] employees fetched department=<open_department_id> count=<n> has_more=<true|false>
```

Log tổng kết:

```text
[lark-sync] departments inserted=<n> updated=<n> skipped_deleted=<n>
[lark-sync] employees inserted=<n> updated=<n>
[lark-sync] done duration_ms=<n>
```

Log lỗi:

```text
[lark-sync] error endpoint=<endpoint> params=<masked_params> code=<code> msg=<msg>
```

---

## 12. Transaction và hiệu năng

Không bọc toàn bộ job vào một transaction lớn.

Khuyến nghị:

1. Mỗi upsert là transaction nhỏ, hoặc batch upsert theo từng page.
2. Commit sau khi xử lý xong mỗi page.
3. Nhân viên có thể xuất hiện ở nhiều phòng ban, nên upsert theo `open_id` để tránh duplicate.
4. Có thể chạy tuần tự để tránh rate limit.
5. Nếu cần chạy song song, giới hạn concurrency, ví dụ 3-5 request đồng thời.

---

## 13. Xử lý dữ liệu bị xóa hoặc không còn tồn tại

### 13.1. Phòng ban

Nếu item phòng ban có:

```json
"status": { "is_deleted": true }
```

Không insert mới. Nếu record đã tồn tại trong DB hiện có, không xóa vật lý vì bảng không có cột soft delete. Chỉ log `skipped_deleted`.

### 13.2. Nhân viên

Không xóa nhân viên khỏi DB chỉ vì không thấy trong một lần gọi API của một phòng ban.

Nếu cần mark nhân viên inactive, dùng object `user.status` để update `lark_employees.status` theo mục 8.4.

---

## 14. Luồng tổng thể end-to-end

```pseudo
function runLarkSyncJob():
    startedAt = now()

    log("start sync departments")
    syncAllDepartments()

    log("start sync employees")
    syncAllEmployees()

    log("done", duration = now() - startedAt)
```

---

## 15. Checklist triển khai

Developer hoặc AI code cần làm đủ các việc sau:

```text
[ ] Không tạo bảng mới.
[ ] Không ALTER TABLE.
[ ] Không CREATE INDEX.
[ ] Dùng đúng bảng hiện có: lark_departments, lark_employees.
[ ] Dùng logic find/update/create theo open_id để tránh duplicate.
[ ] Tạo config/env cho base url, tenant token, user token, page size.
[ ] Viết Lark HTTP client chung có retry và check body.code.
[ ] Viết hàm callGetDepartmentChildren.
[ ] Viết hàm callFindUsersByDepartment.
[ ] Viết upsertDepartment theo lark_departments.open_id.
[ ] Viết syncAllDepartments dùng BFS/DFS từ department_id = 0.
[ ] Xử lý phân trang departments bằng has_more/page_token.
[ ] Viết getPrimaryDepartmentOpenId.
[ ] Viết getAvatarUrl.
[ ] Viết getEmployeeStatus.
[ ] Viết normalize nullIfEmpty.
[ ] Viết upsertEmployee theo lark_employees.open_id.
[ ] Viết syncAllEmployees sau khi sync xong departments.
[ ] Xử lý phân trang employees bằng has_more/page_token.
[ ] Không update pos_user_id, fb_id bằng dữ liệu rỗng từ Lark.
[ ] Log số lượng insert/update và lỗi đã mask token.
[ ] Test chạy lại job 2 lần không tạo duplicate.
```

---

## 16. Test cases bắt buộc

### Test 1: DB chưa có dữ liệu Lark, sync departments

Input:

```text
department_id = 0
```

Kỳ vọng:

```text
- Lưu được phòng ban HOST vào lark_departments.
- HOST.parent_id = null.
- HOST.open_id = item.open_department_id.
- Tiếp tục lấy children của HOST bằng HOST.open_id.
- Lưu được tất cả phòng ban con với parent_id = HOST.id.
- Tiếp tục duyệt đến khi queue rỗng.
```

### Test 2: Department API có nhiều page

Giả lập response:

```text
Page 1: has_more = true, page_token = abc
Page 2: has_more = false
```

Kỳ vọng:

```text
- Gọi đủ cả page 1 và page 2.
- Không bỏ sót item ở page 2.
```

### Test 3: Chạy sync departments lần 2

Kỳ vọng:

```text
- Không tạo duplicate.
- Record cũ được update name, parent_id, updated_at.
```

### Test 4: Sync employees theo từng phòng ban

Input:

```text
DB đã có nhiều lark_departments với open_id khác nhau.
```

Kỳ vọng:

```text
- Mỗi open_id được truyền vào users/find_by_department.
- Có xử lý pagination nếu has_more = true.
- Nhân viên được upsert theo open_id.
- department_id của nhân viên map về id trong lark_departments.
```

### Test 5: Employee API có nhiều page

Giả lập response:

```text
Page 1: has_more = true, page_token = xyz
Page 2: has_more = false
```

Kỳ vọng:

```text
- Gọi đủ cả page 1 và page 2.
- Không bỏ sót nhân viên ở page 2.
```

### Test 6: Nhân viên xuất hiện ở nhiều phòng ban

Kỳ vọng:

```text
- Không tạo duplicate nhân viên.
- Nếu có orders[].is_primary_dept = true thì dùng phòng ban đó làm department_id chính.
- Nếu không có primary dept thì dùng phòng ban đang sync làm fallback.
```

---

## 17. Definition of Done

Chức năng hoàn thành khi:

```text
[ ] Từ department_id = 0 sync được toàn bộ cây phòng ban.
[ ] Mỗi department được lưu/update bằng open_department_id vào lark_departments.open_id.
[ ] Department chỉ ghi các cột hiện có: name, open_id, parent_id, created_at, updated_at.
[ ] Không có code tạo bảng/migration/index.
[ ] Từ danh sách departments trong DB sync được employees.
[ ] Mỗi employee được lưu/update bằng open_id.
[ ] Employee map đúng department_id về lark_departments.id.
[ ] Có xử lý pagination cho cả departments và employees.
[ ] Có retry lỗi tạm thời, không retry vô hạn.
[ ] Không hardcode hoặc log token.
[ ] Chạy lại job không tạo duplicate.
```
