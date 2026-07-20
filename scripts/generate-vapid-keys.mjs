/*
 * VAPID 키 쌍 생성 스크립트.
 *
 * VAPID = 웹 푸시에서 "우리 서버"임을 증명하는 공개키/비밀키 쌍.
 * - 공개키: 브라우저 구독 시 사용 → NEXT_PUBLIC_ 접두사로 클라이언트에 노출 OK
 * - 비밀키: 발송 서명용 → 절대 커밋 금지, 서버 환경변수로만 보관
 *
 * 실행: node scripts/generate-vapid-keys.mjs
 * 출력된 내용을 로컬은 .env.local에, 배포는 Vercel 환경변수에 넣는다.
 * 키를 바꾸면 기존 구독이 전부 무효가 되므로 한 번 만들면 계속 쓴다.
 */
import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();

console.log("# 아래 3줄을 .env.local (및 Vercel 환경변수)에 넣어주세요");
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:you@example.com`);
