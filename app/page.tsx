import HomeScreen from "@/components/home/home-screen";

/**
 * 루트 페이지 (서버 컴포넌트).
 * 상호작용이 필요한 실제 게임 화면은 클라이언트 컴포넌트인 HomeScreen이 담당한다.
 * 나중에 여기서 Supabase로 유저/펫 데이터를 읽어 초기값으로 내려주게 된다.
 */
export default function Home() {
  return <HomeScreen />;
}
