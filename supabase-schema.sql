-- ============================================================
-- 매직아워 사이트 Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 Run 하세요.
-- ============================================================

-- 1) profiles: auth.users 1:1 확장 테이블 (이름/전화/아이디/권한)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  name text not null,
  phone text,
  email text,
  role text not null default 'member' check (role in ('member', 'admin')),
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- 2) films: 영화 정보 관리
create table if not exists public.films (
  id text primary key,
  category text not null,
  title text not null,
  director text,
  runtime text,
  genre text,
  year text,
  image text,
  stills jsonb not null default '[]'::jsonb,
  synopsis text,
  director_bio text,
  credits jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- 3) notices: 공지사항
create table if not exists public.notices (
  id text primary key,
  tag text,
  title text not null,
  date text not null,
  body jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- 4) schedule: 운영 일정 (캘린더)
create table if not exists public.schedule (
  id text primary key,
  category text not null,
  date date not null,
  end_date date,
  title text not null,
  memo text,
  created_at timestamptz not null default now()
);

-- 5) sponsors: 후원 현황
create table if not exists public.sponsors (
  id text primary key,
  name text not null,
  type text,
  amount text,
  status text not null default '협의중',
  contact text,
  memo text,
  created_at timestamptz not null default now()
);

-- 6) settlement: 정산 (수입/지출)
create table if not exists public.settlement (
  id text primary key,
  date date not null,
  type text not null check (type in ('수입', '지출')),
  category text,
  item text,
  amount numeric not null default 0,
  created_at timestamptz not null default now()
);

-- 7) cheer_messages: 응원 메시지
create table if not exists public.cheer_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  message text not null,
  created_at timestamptz not null default now()
);

-- 8) bookings: 예매 내역
create table if not exists public.bookings (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text,
  phone text,
  email text,
  seats jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- 9) vip_seats: VIP 확보 좌석
create table if not exists public.vip_seats (
  seat_code text primary key,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 신규 가입 시 profiles 자동 생성 트리거
-- 회원가입 폼에서 email/password 외에 username, name, phone을
-- auth.signUp()의 options.data 로 넘기면 여기서 자동으로 저장됩니다.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, name, phone, email, role, is_super_admin)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'phone',
    new.email,
    'member',
    false
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 권한 체크용 헬퍼 함수 (RLS 정책에서 사용)
-- ============================================================
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- 본인 프로필(이름/전화)만 수정. role/is_super_admin은 여기서 손댈 수 없음.
create or replace function public.update_my_profile(new_name text, new_phone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set name = new_name, phone = new_phone where id = auth.uid();
end;
$$;

-- 회원 -> 관리자 승인/해제. 반드시 최고관리자(is_super_admin)만 호출 가능.
create or replace function public.set_member_role(target_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true) then
    raise exception 'permission denied: super admin only';
  end if;
  update public.profiles set role = new_role where id = target_id;
end;
$$;

-- ============================================================
-- Row Level Security 활성화 + 정책
-- ============================================================
alter table public.profiles enable row level security;
alter table public.films enable row level security;
alter table public.notices enable row level security;
alter table public.schedule enable row level security;
alter table public.sponsors enable row level security;
alter table public.settlement enable row level security;
alter table public.cheer_messages enable row level security;
alter table public.bookings enable row level security;
alter table public.vip_seats enable row level security;

-- profiles: 본인 또는 관리자만 조회 가능. 쓰기는 위의 RPC 함수로만.
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

-- films / notices / schedule: 전체 공개 읽기, 쓰기는 관리자만
create policy "films_select_all" on public.films for select using (true);
create policy "films_write_admin" on public.films for all
  using (public.is_admin()) with check (public.is_admin());

create policy "notices_select_all" on public.notices for select using (true);
create policy "notices_write_admin" on public.notices for all
  using (public.is_admin()) with check (public.is_admin());

create policy "schedule_select_all" on public.schedule for select using (true);
create policy "schedule_write_admin" on public.schedule for all
  using (public.is_admin()) with check (public.is_admin());

-- sponsors / settlement: 관리자 전용 (내부 운영 데이터)
create policy "sponsors_admin_only" on public.sponsors for all
  using (public.is_admin()) with check (public.is_admin());

create policy "settlement_admin_only" on public.settlement for all
  using (public.is_admin()) with check (public.is_admin());

-- vip_seats: 공개 읽기(매진 표시용), 쓰기는 관리자만
create policy "vip_seats_select_all" on public.vip_seats for select using (true);
create policy "vip_seats_write_admin" on public.vip_seats for all
  using (public.is_admin()) with check (public.is_admin());

-- cheer_messages: 공개 읽기, 본인 글만 작성/삭제(관리자는 전체 삭제 가능)
create policy "cheer_select_all" on public.cheer_messages for select using (true);
create policy "cheer_insert_own" on public.cheer_messages for insert
  with check (auth.uid() = user_id);
create policy "cheer_delete_own_or_admin" on public.cheer_messages for delete
  using (auth.uid() = user_id or public.is_admin());

-- bookings: 본인 예매만 조회/삭제, 관리자는 전체 조회
create policy "bookings_select_own_or_admin" on public.bookings for select
  using (auth.uid() = user_id or public.is_admin());
create policy "bookings_insert_own" on public.bookings for insert
  with check (auth.uid() = user_id);
create policy "bookings_delete_own_or_admin" on public.bookings for delete
  using (auth.uid() = user_id or public.is_admin());

-- ============================================================
-- 최고관리자 계정 승격 안내
-- ------------------------------------------------------------
-- 1. 먼저 사이트의 회원가입 화면에서 원하는 아이디/비밀번호로 평소처럼 가입하세요.
-- 2. 그 다음 아래 UPDATE문에서 <가입한_이메일> 부분을 실제로 가입한 이메일로
--    바꾼 뒤 SQL Editor에서 실행하면 그 계정이 최고관리자가 됩니다.
-- ============================================================
-- update public.profiles
-- set role = 'admin', is_super_admin = true
-- where email = '<가입한_이메일>';
