import { getDatabaseUri } from '@/src/utils/mysql';
import { data } from 'autoprefixer';
import { Connection, createConnection } from 'mysql2/promise';
import * as process from 'process';
import kv from '@/app/(client)/api/kv';
import { NextRequest, NextResponse } from 'next/server';
import config from '@/.osswrc.json';
import { authenticateApiGuard } from '@/src/auth';

// TODO: use config
const db = config.db;

export async function POST (req: NextRequest, { params: { name } }: any) {
  let readonly = false;
  const res = await authenticateApiGuard(req);
  if (res) {
    readonly = true;
  }

  if (!process.env.TIDB_USER || !process.env.TIDB_HOST || !process.env.TIDB_HOST || !process.env.TIDB_PORT) {
    return NextResponse.json({
      message: 'TiDB integration was not configured. Check your vercel project config.',
    }, { status: 500 });
  }

  const target = db.find(db => db.name === name);

  if (!target) {
    return NextResponse.json({
      type: 'ERR_NOT_FOUND',
      message: `DB ${name} not found`,
    }, { status: 404 });
  }

  const database = process.env[target.env] || target.database;
  const uri = getDatabaseUri(database, readonly)

  const { searchParams } = new URL(req.url);

  const force = searchParams.get('force');
  const sql = await req.text();
  const cacheKey = `${name}${sql}`;

  const ignoreCache = force === 'true';

  if (!ignoreCache) {
    let cached: any;
    try {
      cached = await kv.get(cacheKey);
      if (cached) {
        cached.ttl = await kv.ttl(cacheKey);
        cached.cached = true;
      }
    } catch (e) {
      console.error(e);
    }
    if (cached) {
      return NextResponse.json({
        ...cached,
        cached: true,
      });
    }
  }

  let conn: Connection;
  try {
    conn = await createConnection(uri);
  } catch (e) {
    return NextResponse.json({
      code: 'ERR_CONN',
      message: `Connecting to database failed: ${String((e as any)?.message ?? e)}`,
    }, { status: 500 });
  }

  try {
    const start = Date.now();
    const result = await conn.execute(sql);
    const end = Date.now();
    const data: any = {
      data: result[0],
      columns: result[1].map(col => ({ name: col.name, type: col.type })),
      startAt: start,
      endAt: end,
      spent: end - start,
    };
    try {
      await kv.setex(cacheKey, 1800, data);
      data.ttl = 1800;
    } catch (e) {
      // ignore if kv not configured.
      console.error(e);
    }
    return NextResponse.json(data);

  } catch (e) {
    return NextResponse.json({
      type: 'ERR_EXEC',
      message: String((e as any)?.message ?? String(e)),
    });
  } finally {
    conn.destroy();
  }
}
