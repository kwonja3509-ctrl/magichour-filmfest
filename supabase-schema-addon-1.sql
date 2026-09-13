-- ============================================================
-- 추가 스니펫 #1: "아이디 찾기" 기능용 RPC
-- (이메일로 조회해도 다른 개인정보는 노출되지 않고 username만 반환)
-- SQL Editor에 붙여넣고 Run 하세요. (기존 스키마는 그대로 두고 이것만 추가 실행)
-- ============================================================
create or replace function public.find_username_by_email(lookup_email text)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select username from public.profiles where email = lookup_email limit 1;
$$;

grant execute on function public.find_username_by_email(text) to anon, authenticated;

-- 로그인 화면에서 "아이디"로 입력받은 값을 실제 Supabase Auth 이메일로 변환하기 위한 RPC.
-- (Supabase Auth 로그인은 이메일 기반이라, 아이디 로그인을 지원하려면 이 조회가 필요합니다.)
create or replace function public.get_email_by_username(lookup_username text)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select email from public.profiles where username = lookup_username limit 1;
$$;

grant execute on function public.get_email_by_username(text) to anon, authenticated;
