/**
 * 아기 위성 (큐브샛) — 오프닝 컷신의 주인공.
 *
 * 홈 화면의 성체 위성보다 몸통이 통통하고 눈이 크며,
 * 굽은 안테나가 강아지 꼬리처럼 파닥인다 (감정 표현의 핵심).
 * 서버에서도 그릴 수 있는 순수 SVG라 "use client"가 필요 없다.
 */

interface BabySatelliteProps {
  /** 표정 — idle: 초롱초롱 / happy: 함박웃음 */
  mood?: "idle" | "happy";
  /** 추진기 불꽃 점화 여부 (출격 연출용) */
  thruster?: boolean;
  className?: string;
}

export default function BabySatellite({
  mood = "idle",
  thruster = false,
  className,
}: BabySatelliteProps) {
  return (
    <svg viewBox="0 0 160 175" className={className} aria-hidden>
      {/* 추진기 불꽃 — 몸통 뒤(아래)에서 일렁인다 */}
      {thruster && (
        <g className="animate-flame-flicker">
          <polygon points="66,112 94,112 80,150" fill="#fb923c" opacity="0.9" />
          <polygon points="72,112 88,112 80,135" fill="#fde047" />
        </g>
      )}

      {/* 굽은 안테나 — 뿌리를 축으로 파닥파닥 */}
      <g className="animate-antenna-flap">
        <path
          d="M80 40 Q84 24 96 17"
          stroke="#8b93bd"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="99" cy="15" r="6" fill="#fbbf24" />
      </g>

      {/* 뭉툭한 아기 태양광 패널 */}
      <g>
        <rect x="34" y="82" width="12" height="9" fill="#8b93bd" />
        <rect
          x="6"
          y="70"
          width="30"
          height="30"
          rx="5"
          fill="#3b4aa0"
          stroke="#5c6fd6"
          strokeWidth="2"
        />
        <line x1="21" y1="72" x2="21" y2="98" stroke="#5c6fd6" strokeWidth="1.5" />
        <line x1="8" y1="85" x2="34" y2="85" stroke="#5c6fd6" strokeWidth="1.5" />
      </g>
      <g>
        <rect x="114" y="82" width="12" height="9" fill="#8b93bd" />
        <rect
          x="124"
          y="70"
          width="30"
          height="30"
          rx="5"
          fill="#3b4aa0"
          stroke="#5c6fd6"
          strokeWidth="2"
        />
        <line x1="139" y1="72" x2="139" y2="98" stroke="#5c6fd6" strokeWidth="1.5" />
        <line x1="126" y1="85" x2="152" y2="85" stroke="#5c6fd6" strokeWidth="1.5" />
      </g>

      {/* 통통한 몸통 — 아랫면을 어둡게 칠해 로우폴리 입체감 */}
      <rect
        x="44"
        y="46"
        width="72"
        height="66"
        rx="20"
        fill="#e8eaf6"
        stroke="#b9c0e4"
        strokeWidth="2.5"
      />
      <path
        d="M44 90 L116 82 L116 92 A20 20 0 0 1 96 112 L64 112 A20 20 0 0 1 44 92 Z"
        fill="#c9d0ef"
      />

      {/* 얼굴 — 아기답게 눈이 크다 */}
      {mood === "happy" ? (
        <g stroke="#1f2547" strokeWidth="4" strokeLinecap="round" fill="none">
          <path d="M60 78 q8 -9 16 0" />
          <path d="M84 78 q8 -9 16 0" />
        </g>
      ) : (
        <g>
          <circle cx="68" cy="77" r="8" fill="#1f2547" />
          <circle cx="92" cy="77" r="8" fill="#1f2547" />
          {/* 초롱초롱 반짝임 */}
          <circle cx="71" cy="74" r="2.5" fill="#ffffff" />
          <circle cx="95" cy="74" r="2.5" fill="#ffffff" />
        </g>
      )}

      {/* 볼터치 */}
      <circle cx="57" cy="90" r="5" fill="#f9a8d4" opacity="0.7" />
      <circle cx="103" cy="90" r="5" fill="#f9a8d4" opacity="0.7" />

      {/* 입 */}
      <path
        d={mood === "happy" ? "M73 92 q7 9 14 0" : "M76 93 q4 4 8 0"}
        stroke="#1f2547"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
