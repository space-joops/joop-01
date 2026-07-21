-- ═══════════════════════════════════════════════════════════════
-- 자동 푸시 크론 등록 — Supabase 대시보드 SQL Editor에서 1회 실행
--
-- ⚠️ 이 파일은 "템플릿"이다. 마이그레이션에 넣지 않은 이유:
--   1. 배포 URL과 시크릿이 환경(로컬/클라우드)마다 다르다.
--   2. 시크릿을 git에 커밋하면 안 된다.
-- 실행 전에 아래 두 자리를 채울 것:
--   <배포도메인>  → 예: joops.vercel.app
--   <CRON_SECRET> → Vercel 환경변수에 넣은 값과 동일하게
--
-- (더 세련된 방법: 시크릿을 Supabase Vault에 저장하고
--  vault.decrypted_secrets에서 읽어 headers를 조립할 수도 있다.
--  지금은 등록 SQL을 1회만 실행하므로 직접 치환으로 충분하다.)
-- ═══════════════════════════════════════════════════════════════

-- 1. 확장 켜기 (대시보드 Database → Extensions에서 켜도 같다)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. 15분마다 디스패처 호출 등록
--    pg_cron이 스케줄러, pg_net이 HTTP 클라이언트 역할.
--    같은 이름으로 다시 schedule하면 기존 작업이 교체된다(재실행 안전).
select cron.schedule(
  'joop-01-push-dispatch',   -- 작업 이름 (joop_01 네임스페이스 관례)
  '*/15 * * * *',            -- 15분마다 — 배터리 알림 유효 창(~4.8h)에 충분
  $$
  select net.http_post(
    url     := 'https://<배포도메인>/api/push/dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <CRON_SECRET>'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 15000
  )
  $$
);

-- ── 운영 치트시트 ────────────────────────────────────────────────
-- 등록 확인:   select * from cron.job;
-- 실행 이력:   select * from cron.job_run_details order by start_time desc limit 10;
-- 응답 확인:   select status_code, content, created
--              from net._http_response order by created desc limit 5;
--              → 디스패처의 {candidates, sent, pruned, failed}가 여기 남는다
-- 크론 해제:   select cron.unschedule('joop-01-push-dispatch');
