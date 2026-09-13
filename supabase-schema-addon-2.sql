-- ============================================================
-- 추가 스니펫 #2
-- 1) 일정(schedule)에 등록자 이름 저장
-- 2) 관리자가 회원 계정을 탈퇴(삭제) 처리할 수 있도록 허용 (최고관리자 계정은 보호)
-- SQL Editor에 붙여넣고 Run 하세요. (기존 스키마는 그대로 두고 이것만 추가 실행)
-- ============================================================

alter table public.schedule add column if not exists created_by_name text;

alter table public.films add column if not exists director_photo text;

create policy "profiles_delete_admin_only" on public.profiles
  for delete using (public.is_admin() and is_super_admin = false);
