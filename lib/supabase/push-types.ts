/**
 * 웹 푸시 백엔드용 DB 타입 모음.
 *
 * lib/supabase/types.ts가 아닌 별도 파일인 이유: types.ts는 지금
 * 브랜치 1(진화 시스템)이 수정 중이라, 같은 파일을 건드리면 병합
 * 충돌이 난다. 도메인도 다르니(펫 상태 vs 푸시 인프라) 파일을
 * 나누는 편이 구조적으로도 맞다.
 */

/** 자동 알림의 종류 — DB check 제약과 lib/push-messages.ts 키의 교집합 */
export type PushNotifyType = "batteryLow" | "dataFull" | "missYou";

/** joop_01_push_subscriptions 한 행 */
export interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
}

/** joop_01_push_candidates()가 돌려주는 발송 후보 한 행 */
export interface PushCandidateRow {
  user_id: string;
  notify_type: PushNotifyType;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** 구독 저장/삭제 Server Action의 결과 */
export interface PushSubscriptionSyncResult {
  ok: boolean;
  /** 실패 사유 — not-configured(로컬 모드) / no-session / error */
  reason?: "not-configured" | "no-session" | "error";
}
