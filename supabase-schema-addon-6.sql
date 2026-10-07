-- ============================================================
-- 추가 스니펫 #6: 이메일 링크 없이 비밀번호 재설정
-- (가입 때 입력한 이메일 + 아이디 + 연락처가 모두 일치하면 새 비밀번호로 바로 변경)
-- SQL Editor에 붙여넣고 Run 하세요.
--
-- 안전장치
--  * 세 가지가 모두 일치해야 하고, 연락처가 비어 있는 계정은 사용할 수 없음
--  * 같은 이메일로 15분 안에 5번 틀리면 15분간 잠금 (무차별 대입 방지)
--  * 기존 비밀번호는 암호화되어 있어 확인할 수 없으므로 '새로 설정'만 가능
-- ============================================================

create table if not exists public.pw_reset_attempts (
  email text primary key,
  fails int not null default 0,
  last_fail timestamptz
);
alter table public.pw_reset_attempts enable row level security;  -- 정책 없음 = 사이트에서 직접 접근 불가

create or replace function public.reset_password_with_identity(
  p_email text, p_username text, p_phone text, p_new_password text
)
returns text
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  uid uuid;
  rec record;
  phone_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  p_email := lower(trim(coalesce(p_email, '')));

  if length(coalesce(p_new_password, '')) < 6 then
    return 'WEAK';
  end if;

  select * into rec from public.pw_reset_attempts where email = p_email;
  if found and rec.fails >= 5 and rec.last_fail > now() - interval '15 minutes' then
    return 'LOCKED';
  end if;

  select p.id into uid
  from public.profiles p
  where lower(p.email) = p_email
    and p.username = trim(coalesce(p_username, ''))
    and phone_digits <> ''
    and regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') = phone_digits;

  if uid is null then
    insert into public.pw_reset_attempts (email, fails, last_fail)
    values (p_email, 1, now())
    on conflict (email) do update
      set fails = case when public.pw_reset_attempts.last_fail > now() - interval '15 minutes'
                       then public.pw_reset_attempts.fails + 1 else 1 end,
          last_fail = now();
    return 'NOMATCH';
  end if;

  update auth.users
  set encrypted_password = crypt(p_new_password, gen_salt('bf')), updated_at = now()
  where id = uid;

  delete from public.pw_reset_attempts where email = p_email;
  return 'OK';
end;
$$;

grant execute on function public.reset_password_with_identity(text, text, text, text) to anon, authenticated;
