#!/usr/bin/env python3
"""필라멘트코리아 공개 게시판의 제품·시공 사진을 로컬 카탈로그로 가져온다."""

import json
import os
import re
import sqlite3
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "app.db"
PRODUCT_DIR = ROOT / "public" / "products"
PROJECT_DIR = ROOT / "public" / "projects"
MANIFEST = ROOT / "data" / "public-catalog.json"
UA = {"User-Agent": "Mozilla/5.0"}
BOARDS = {
    "purveyor02": "down",
    "purveyor04": "pendant",
    "purveyor05": "spot",
    "purveyor06": "surface",
    "purveyor07": "magnetic",
    "purveyor08": "linear",
    "purveyor09": "etc",
    "LEDIN": "procurement",
    "LEDDOWN": "procurement",
    "LEDOUT": "outdoor",
}
NAMES = {
    "down": "다운라이트",
    "pendant": "펜던트",
    "spot": "스포트·트랙",
    "surface": "천장 직부",
    "magnetic": "마그네틱",
    "linear": "라인 조명",
    "outdoor": "실외 조명",
    "procurement": "조달 조명",
    "etc": "기타 조명",
}


def fetch(url: str) -> str:
    request = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(request, timeout=40) as response:
        return response.read().decode("utf-8", "replace")


def fetch_bytes(url: str) -> bytes:
    request = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(request, timeout=40) as response:
        return response.read()


def pages_for(board: str) -> int:
    html = fetch(f"http://filamentkorea.com/board/list.php?bdId={board}")
    found = [int(page) for page in re.findall(r"[?&]page=(\d+)", html)]
    return max(found) if found else 1


def parse_products(board: str, html: str) -> list[dict]:
    items = []
    for block in re.findall(r'<li style="width:20%.*?</li>', html, re.S):
        image = re.search(r'src="(/data/editor/board/[^"]+)"', block)
        title = re.search(r'class="tit_strong"[^>]*>(.*?)</strong>', block, re.S)
        if not image or not title:
            continue
        raw = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", title.group(1))).strip()
        ident = ""
        match = re.match(r"^(.*?)\s*\(([^)]+)\)\s*$", raw)
        code = match.group(1).strip() if match else raw
        if match:
            ident = match.group(2).strip()
        if not code:
            continue
        items.append(
            {
                "board": board,
                "category": BOARDS[board],
                "code": code,
                "ident": ident,
                "image": "http://filamentkorea.com" + image.group(1),
            }
        )
    return items


def parse_projects(html: str) -> list[dict]:
    items = []
    for block in re.findall(r'class="gallery_cont".{0,2500}?class="tit_strong"', html, re.S):
        image = re.search(r'src="(/data/editor/board/[^"]+)"', block)
        if not image:
            continue
        tail = html[html.find(block) + len(block) : html.find(block) + len(block) + 400]
        title = re.search(r">(.*?)(?:</strong>|<)", tail, re.S)
        if not title:
            continue
        name = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", title.group(1))).strip()
        if not name:
            continue
        items.append({"title": name, "image": "http://filamentkorea.com" + image.group(1)})
    return items


def code_to_slug(code: str) -> str:
    slug = code.replace("+", "-plus").replace("[", "-").replace("]", "")
    slug = re.sub(r"[^A-Za-z0-9-]+", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug or "item"


def download(url: str, dest: Path) -> None:
    if dest.exists() and dest.stat().st_size > 0:
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(fetch_bytes(url))


def collect() -> tuple[list[dict], list[dict]]:
    products: list[dict] = []
    projects: list[dict] = []
    for board in BOARDS:
        last = pages_for(board)
        print(f"{board} pages {last}", flush=True)
        for page in range(1, last + 1):
            html = fetch(f"http://filamentkorea.com/board/list.php?bdId={board}&page={page}")
            products.extend(parse_products(board, html))
            time.sleep(0.05)
    for page in range(1, pages_for("gallery") + 1):
        html = fetch(f"http://filamentkorea.com/board/list.php?bdId=gallery&page={page}")
        projects.extend(parse_projects(html))
    unique = {}
    for item in products:
        unique.setdefault(item["code"], item)
    return list(unique.values()), projects


def apply(products: list[dict], projects: list[dict]) -> None:
    db = sqlite3.connect(DB)
    db.execute("PRAGMA foreign_keys = ON")
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    admin = db.execute("SELECT id FROM users WHERE role = 'admin'").fetchone()[0]
    categories = {row[0]: row[1] for row in db.execute("SELECT slug, id FROM categories")}
    taken = {row[0]: row[1] for row in db.execute("SELECT slug, code FROM products")}
    inserted = 0
    updated = 0
    planned = []
    for item in products:
        existing = db.execute("SELECT id, slug FROM products WHERE code = ?", (item["code"],)).fetchone()
        if existing:
            slug = existing[1]
        else:
            slug = code_to_slug(item["code"])
            base = slug
            n = 2
            while slug in taken and taken[slug] != item["code"]:
                slug = f"{base}-{n}"
                n += 1
            taken[slug] = item["code"]
        ext = os.path.splitext(item["image"].split("?")[0])[1].lower() or ".jpg"
        if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
            ext = ".jpg"
        filename = f"{slug}{ext}"
        item = {**item, "slug": slug, "file": filename, "web": f"/products/{filename}"}
        planned.append(item)
    print(f"downloading {len(planned)} images", flush=True)
    with ThreadPoolExecutor(12) as pool:
        futures = [pool.submit(download, item["image"], PRODUCT_DIR / item["file"]) for item in planned]
        for index, future in enumerate(as_completed(futures), 1):
            future.result()
            if index % 100 == 0:
                print(f"downloaded {index}", flush=True)
    for item in planned:
        slug = item["slug"]
        web = item["web"]
        name = f"{NAMES[item['category']]} {item['code']}"
        options = f"식별번호 {item['ident']}" if item["ident"] else ""
        row = db.execute("SELECT id FROM products WHERE code = ?", (item["code"],)).fetchone()
        if row:
            db.execute(
                """UPDATE products SET name = ?, category_id = ?, options_text = CASE WHEN options_text = '' THEN ? ELSE options_text END,
                   public_url = ?, published = 1, updated_at = ? WHERE id = ?""",
                (name, categories[item["category"]], options, f"/products/{slug}", now, row[0]),
            )
            image = db.execute(
                "SELECT id FROM product_images WHERE product_id = ? AND kind = 'normal' LIMIT 1",
                (row[0],),
            ).fetchone()
            if image:
                db.execute(
                    "UPDATE product_images SET path = ?, alt = ?, source_url = ?, updated_at = ? WHERE id = ?",
                    (web, f"{name} 제품 사진", item["image"], now, image[0]),
                )
            else:
                db.execute(
                    """INSERT INTO product_images
                       (id, product_id, kind, path, alt, source_url, sort_order, created_at, updated_at, created_by, updated_by, version)
                       VALUES (lower(hex(randomblob(16))), ?, 'normal', ?, ?, ?, 0, ?, ?, ?, ?, 1)""",
                    (row[0], web, f"{name} 제품 사진", item["image"], now, now, admin, admin),
                )
            updated += 1
        else:
            product_id = os.urandom(16).hex()
            db.execute(
                """INSERT INTO products (
                    id, slug, code, name, spec, category_id, manufacturer, watt, color_temp, beam_angle, size_text, finish, options_text,
                    grade, stock_class, item_class, physical_status, work_status, sales_priority, priority_reason, published, featured,
                    public_url, year_occurred, last_in, last_out, department_id, owner_name, plan_text, is_sample, deleted_at,
                    created_at, updated_at, created_by, updated_by, version
                ) VALUES (
                    ?, ?, ?, ?, '', ?, '필라멘트코리아', '', '', '', '', '', ?,
                    'C', '', ?, '정상', '판매가능', '일반', '', 1, 0,
                    ?, NULL, NULL, NULL, NULL, '', '', 0, NULL,
                    ?, ?, ?, ?, 1
                )""",
                (
                    product_id,
                    slug,
                    item["code"],
                    name,
                    categories[item["category"]],
                    options,
                    NAMES[item["category"]],
                    f"/products/{slug}",
                    now,
                    now,
                    admin,
                    admin,
                ),
            )
            db.execute(
                """INSERT INTO inventory_items (
                    id, product_id, erp_qty, reserved_qty, outbound_qty, defect_qty, quarantine_qty, unit_cost, sell_price,
                    created_at, updated_at, created_by, updated_by, version
                ) VALUES (lower(hex(randomblob(16))), ?, 0, 0, 0, 0, 0, 0, 0, ?, ?, ?, ?, 1)""",
                (product_id, now, now, admin, admin),
            )
            db.execute(
                """INSERT INTO product_images
                   (id, product_id, kind, path, alt, source_url, sort_order, created_at, updated_at, created_by, updated_by, version)
                   VALUES (lower(hex(randomblob(16))), ?, 'normal', ?, ?, ?, 0, ?, ?, ?, ?, 1)""",
                (product_id, web, f"{name} 제품 사진", item["image"], now, now, admin, admin),
            )
            inserted += 1
        if (inserted + updated) % 50 == 0:
            db.commit()
            print(f"progress inserted {inserted} updated {updated}", flush=True)
    project_inserted = 0
    for index, project in enumerate(projects, 1):
        exists = db.execute("SELECT id FROM posts WHERE board = 'project' AND title = ?", (project["title"],)).fetchone()
        ext = os.path.splitext(project["image"])[1].lower() or ".jpg"
        filename = f"gallery-{index}{ext}"
        download(project["image"], PROJECT_DIR / filename)
        web = f"/projects/{filename}"
        if exists:
            db.execute("UPDATE posts SET image_path = ?, visible = 1, updated_at = ? WHERE id = ?", (web, now, exists[0]))
        else:
            db.execute(
                """INSERT INTO posts (id, board, title, body, image_path, visible, created_at, updated_at, created_by, updated_by, version)
                   VALUES (lower(hex(randomblob(16))), 'project', ?, '필라멘트코리아 공개 시공 갤러리입니다.', ?, 1, ?, ?, ?, ?, 1)""",
                (project["title"], web, now, now, admin, admin),
            )
            project_inserted += 1
    db.commit()
    total = db.execute("SELECT COUNT(*) FROM products WHERE deleted_at IS NULL").fetchone()[0]
    print(f"done products inserted {inserted} updated {updated} total {total} projects {project_inserted}")
    db.close()


def main() -> None:
    products, projects = collect()
    print(f"collected products {len(products)} projects {len(projects)}", flush=True)
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps({"products": products, "projects": projects}, ensure_ascii=False), encoding="utf-8")
    apply(products, projects)


if __name__ == "__main__":
    main()
