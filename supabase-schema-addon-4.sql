-- ============================================================
-- 추가 스니펫 #4: 좌석 중복 예매 방지 + 매진 좌석 조회
-- SQL Editor에 붙여넣고 Run 하세요. (기존 스키마는 그대로 두고 이것만 추가 실행)
--
-- 배경
--  * bookings 는 RLS 때문에 "본인 예매"만 조회됩니다. 그래서 예매 화면에서
--    다른 사람이 잡은 좌석이 비어 보이는 문제가 있었습니다.
--  * 아래 get_taken_seats() 는 이름/연락처 없이 '좌석 코드'만 돌려줍니다.
--    (개인정보는 계속 비공개)
--  * 트리거는 저장 시점에 한 번 더 검사해 동시 클릭(경쟁 상태)도 막습니다.
-- ============================================================

-- 1) 이미 잡힌 좌석 코드 목록 (예매 + VIP). 개인정보 없음.
create or replace function public.get_taken_seats()
returns text[]
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(array_agg(distinct s), '{}'::text[])
  from (
    select jsonb_array_elements_text(seats) as s from public.bookings
    union all
    select seat_code from public.vip_seats
  ) t;
$$;

grant execute on function public.get_taken_seats() to anon, authenticated;

-- 2) 저장 직전 중복·인원 검사 (security definer: 다른 사람의 예매까지 봐야 하므로)
create or replace function public.prevent_double_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dup text;
  n int;
begin
  -- 동시에 들어온 예매를 한 줄로 세움
  perform pg_advisory_xact_lock(hashtext('bookings_seats_lock'));

  if jsonb_typeof(new.seats) <> 'array' or jsonb_array_length(new.seats) = 0 then
    raise exception 'NO_SEATS' using errcode = '22023';
  end if;

  n := jsonb_array_length(new.seats);
  if n > 6 then
    raise exception 'TOO_MANY_SEATS' using errcode = '22023';
  end if;

  if (select count(distinct x) from jsonb_array_elements_text(new.seats) x) <> n then
    raise exception 'DUPLICATE_IN_REQUEST' using errcode = '22023';
  end if;

  select s into dup
  from jsonb_array_elements_text(new.seats) s
  where s in (select jsonb_array_elements_text(b.seats) from public.bookings b)
     or s in (select seat_code from public.vip_seats)
  limit 1;

  if dup is not null then
    raise exception 'SEAT_TAKEN:%', dup using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_prevent_double on public.bookings;
create trigger bookings_prevent_double
  before insert on public.bookings
  for each row execute function public.prevent_double_booking();
