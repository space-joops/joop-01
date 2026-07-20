/**
 * 게임 기획 기반 푸시 메시지 템플릿.
 *
 * 기획서의 3대 지표(배터리·내구도·데이터)와 방치형 루프(오프라인 보상)에서
 * 알림을 보낼 만한 순간들을 미리 문구로 정리해 둔다.
 * 지금은 "테스트 전파" 버튼이 이 중 하나를 무작위로 쏘고,
 * Supabase(Edge Function + cron)가 붙으면 서버가 유저별 펫 상태를 보고
 * 실제 타이밍에 맞춰 발송하게 된다.
 *
 * tag: 같은 tag의 알림은 서로 교체된다 — "배터리 부족"이 5통 쌓여
 * 유저를 괴롭히는 일을 막는 장치.
 */

export interface PushMessage {
  /** 알림 제목 */
  title: string;
  /** 알림 본문 */
  body: string;
  /** 같은 종류 알림 덮어쓰기용 식별자 */
  tag: string;
  /** 알림을 눌렀을 때 열 주소 */
  url: string;
}

export const PUSH_MESSAGES = {
  /** 배터리(포만감) 임계치 — 절전 모드 진입 전에 충전 유도 */
  batteryLow: {
    title: "🔋 줍이의 배터리가 깜빡여요",
    body: "곧 절전 모드에 들어가요. 태양광 패널을 펴서 충전해 주세요!",
    tag: "joops-battery",
    url: "/",
  },
  /** 데이터 용량 가득 — 수집 효율 반감 상태 해소 유도 */
  dataFull: {
    title: "📡 데이터 용량이 가득 찼어요",
    body: "수집 효율이 절반으로 떨어졌어요. 기지국으로 전송해 주세요!",
    tag: "joops-data",
    url: "/",
  },
  /** 방치형 루프 — 오프라인 수집 보상 도착 */
  offlineReward: {
    title: "☄️ 궤도 순찰 완료!",
    body: "줍이가 자리를 비운 사이 파편을 잔뜩 모아 왔어요. 관제 콘솔에서 확인하세요.",
    tag: "joops-reward",
    url: "/",
  },
  /** 장기 방치 — 시무룩 단계 (기획서: 시무룩 → 절전 → 동면, 사망 없음) */
  missYou: {
    title: "🛰️ 줍이가 지구를 바라보고 있어요",
    body: "오퍼레이터님이 보고 싶은가 봐요. 잠깐 들러서 쓰다듬어 주세요.",
    tag: "joops-social",
    url: "/",
  },
} satisfies Record<string, PushMessage>;

export type PushMessageKey = keyof typeof PUSH_MESSAGES;
