-- =========================================================================
-- 1. 啟用 pgvector 擴充功能
-- =========================================================================
create extension if not exists vector;

-- =========================================================================
-- 2. 清除舊資料表（若存在，以利乾淨初始化）
-- =========================================================================
drop table if exists dynamic_alerts;
drop table if exists weather_cache;
drop table if exists static_landmarks;
drop table if exists static_segments;
drop table if exists static_routes;

-- =========================================================================
-- 3. 建立靜態與動態資料表
-- =========================================================================

-- (1) 路線表
create table static_routes (
  id uuid default gen_random_uuid() primary key,
  name varchar(255) not null,
  description text,
  checkpoints jsonb not null, -- 儲存 RoutePoint[] 節點座標及導航指令
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- (2) 路段表 (啟用 Realtime 後，前端可即時監聽速限與車流變化)
create table static_segments (
  id varchar(50) primary key, -- 例如 seg_1, seg_2
  name varchar(255) not null,
  coordinates jsonb not null, -- 儲存經緯度點陣列 [[lat, lng], [lat, lng]]
  status varchar(20) not null, -- smooth (順暢), heavy (車多), jammed (擁堵)
  speed_limit integer not null,
  average_speed integer not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- (3) 固定式測速照相與路標
create table static_landmarks (
  id varchar(50) primary key,
  type varchar(50) default 'speed_camera',
  title varchar(255) not null,
  description text,
  latitude double precision not null,
  longitude double precision not null,
  road_name varchar(255),
  speed_limit integer,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- (4) 天氣資訊快取表
create table weather_cache (
  location varchar(100) primary key, -- 例如 "Taipei"
  temperature double precision,
  condition varchar(50),             -- sunny, rainy, cloudy
  wind_speed double precision,
  rainfall_mm double precision,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- (5) 動態路況警報表 (啟用 Realtime 後，前端可即時接收即時事件)
create table dynamic_alerts (
  id uuid default gen_random_uuid() primary key,
  type varchar(50) not null,             -- accident, flooding, road_closure, construction, speed_camera
  title varchar(255) not null,
  description text,
  latitude double precision not null,
  longitude double precision not null,
  road_name varchar(255),
  severity varchar(20) default 'medium',  -- low, medium, high
  is_active boolean default true,        -- 是否活躍中
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  ended_at timestamp with time zone
);

-- =========================================================================
-- 4. 對動態警報描述建立 HNSW 向量索引 (pgvector 應用範例)
--    假設我們未來使用 1536 維度之文字 Embedding (如 OpenAI text-embedding-ada-002)
-- =========================================================================
alter table dynamic_alerts add column description_vector vector(1536);
create index on dynamic_alerts using hnsw (description_vector vector_cosine_ops);

-- =========================================================================
-- 5. 啟用 Supabase Realtime 即時廣播
-- =========================================================================
-- 向即時廣播發佈加入資料表
alter publication supabase_realtime add table dynamic_alerts;
alter publication supabase_realtime add table static_segments;
alter publication supabase_realtime add table weather_cache;

-- =========================================================================
-- 6. 授權 Supabase API 角色 (anon, authenticated, service_role) 存取權限
-- =========================================================================
grant usage on schema public to postgres, anon, authenticated, service_role;

grant all privileges on all tables in schema public to postgres, anon, authenticated, service_role;
grant all privileges on all sequences in schema public to postgres, anon, authenticated, service_role;
grant all privileges on all functions in schema public to postgres, anon, authenticated, service_role;

-- 設定預設授權，以防未來新增表時權限丟失
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;

