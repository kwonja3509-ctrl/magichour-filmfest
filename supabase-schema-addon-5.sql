-- ============================================================
-- 추가 스니펫 #5: 현장 입장 체크 (관리자 페이지 > 예매 현황)
-- SQL Editor에 붙여넣고 Run 하세요. (기존 스키마는 그대로 두고 이것만 추가 실행)
-- ============================================================

-- 입장 완료 시각 (null 이면 아직 입장 전)
alter table public.bookings add column if not exists checked_in_at timestamptz;

-- 관리자만 예매 행을 수정(입장 체크)할 수 있음. 일반 회원은 수정 불가.
drop policy if exists "bookings_update_admin" on public.bookings;
create policy "bookings_update_admin" on public.bookings for update
  using (public.is_admin()) with check (public.is_admin());
