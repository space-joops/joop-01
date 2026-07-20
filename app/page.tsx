import GameRoot from "@/components/game-root";

/**
 * 루트 페이지 (서버 컴포넌트).
 * 컷신/홈 분기와 게임 화면은 클라이언트 컴포넌트인 GameRoot가 담당한다.
 * 나중에 여기서 Supabase로 유저/펫 데이터를 읽어 초기값으로 내려주게 된다.
 */
export default function Home() {
  return <GameRoot />;
}
