import type { NextConfig } from "next";
import { version } from "./package.json";

/*
 * 빌드 스탬프 — 이 파일은 빌드를 시작할 때 한 번 실행되므로,
 * 여기서 만든 값은 "이번 빌드"를 가리키는 지문(fingerprint)이 된다.
 * package.json 버전이 그대로여도 배포(빌드)할 때마다 값이 달라져서,
 * 서비스 워커 URL을 바꿔 브라우저가 반드시 새 버전을 감지하게 만든다.
 */
const buildStamp = Date.now().toString(36);

const nextConfig: NextConfig = {
  /*
   * env에 넣은 값은 빌드 시점에 코드 속 process.env.X 자리에 "문자열로 구워"진다.
   * 파이썬으로 비유하면 실행 중에 os.environ을 읽는 게 아니라,
   * 배포 전에 템플릿 치환으로 상수를 박아 넣는 것에 가깝다.
   */
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_BUILD_STAMP: buildStamp,
  },
};

export default nextConfig;
