-- ============================================================
-- 추가 스니펫 #3
-- 응원 메시지 삭제 권한을 "본인" 또는 "최고관리자"로만 제한
-- (기존 정책은 승격된 일반 관리자도 삭제 가능했음 — 최고관리자만 가능하도록 변경)
-- SQL Editor에 붙여넣고 Run 하세요.
-- ============================================================

drop policy if exists "cheer_delete_own_or_admin" on public.cheer_messages;

create policy "cheer_delete_own_or_superadmin" on public.cheer_messages for delete
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
  );
