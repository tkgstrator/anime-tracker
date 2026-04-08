#!/usr/bin/env python3
"""Reorder D1 SQL dump so tables are created in dependency order."""
import re
import sys

# 依存順 (被参照テーブルが先)
TABLE_ORDER = ["d1_migrations", "anime", "seasons", "episodes"]

def main():
    dump_path = sys.argv[1]
    with open(dump_path, "r") as f:
        content = f.read()

    # PRAGMA 行を除去 (自前で出力する)
    content = re.sub(r'^PRAGMA [^;]+;\n', '', content, flags=re.MULTILINE)

    # テーブルごとのブロックを抽出: CREATE TABLE ... 〜 次の CREATE TABLE の直前
    blocks = {}  # table_name -> sql_text
    indexes = {}  # table_name -> [index_sql, ...]

    # CREATE TABLE で分割
    parts = re.split(r'(?=^CREATE TABLE IF NOT EXISTS ")', content, flags=re.MULTILINE)

    for part in parts:
        part = part.strip()
        if not part:
            continue
        m = re.match(r'^CREATE TABLE IF NOT EXISTS "([^"]+)"', part)
        if m:
            table_name = m.group(1)
            # このブロックから CREATE INDEX 文を分離
            lines = part.split('\n')
            table_lines = []
            for line in lines:
                idx_match = re.match(r'^CREATE (?:UNIQUE )?INDEX "([^"]*?)(?:_idx|_key)".*ON "([^"]+)"', line)
                if idx_match:
                    ref_table = idx_match.group(2)
                    indexes.setdefault(ref_table, []).append(line)
                else:
                    table_lines.append(line)
            blocks[table_name] = '\n'.join(table_lines)
        else:
            # CREATE TABLE の前にある INDEX 文など
            for line in part.split('\n'):
                idx_match = re.match(r'^CREATE (?:UNIQUE )?INDEX "[^"]*".*ON "([^"]+)"', line)
                if idx_match:
                    ref_table = idx_match.group(1)
                    indexes.setdefault(ref_table, []).append(line)

    # 出力
    out = []
    out.append("PRAGMA foreign_keys=OFF;")

    # DROP TABLE (逆順)
    for t in reversed(TABLE_ORDER):
        out.append(f'DROP TABLE IF EXISTS "{t}";')

    # CREATE TABLE + INSERT + CREATE INDEX (依存順)
    for t in TABLE_ORDER:
        if t in blocks:
            out.append(blocks[t])
        if t in indexes:
            for idx in indexes[t]:
                out.append(idx)

    with open(dump_path, "w") as f:
        f.write('\n'.join(out) + '\n')

if __name__ == "__main__":
    main()
