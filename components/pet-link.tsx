"use client";

import { useEffect, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { bootPet, syncPet } from "@/app/actions/pet";
import { usePetStore } from "@/stores/pet-store";
import type { OfflineSettlement } from "@/lib/supabase/types";

/**
 * 관제 링크 — 화면에는 아무것도 그리지 않는 통신 담당 컴포넌트.
 *
 * 하는 일 세 가지:
 *   1) 세션 확보: 없으면 익명 가입 (가입 폼 없이 바로 펫과 만난다 — 온보딩 90초 룰)
 *   2) 부팅 정산: bootPet()으로 펫 로드 + 오프라인 보상 정산 → 스토어 덮어쓰기
 *   3) 주기 동기화: 스토어가 바뀌었을 때만 30초마다 서버로 스냅샷 전송
 *
 * Supabase 키가 없으면(로컬 모드) 조용히 아무 일도 하지 않는다.
 */

/** 동기화 주기 — 활성 유저 기준 서버 쓰기 부하와 데이터 유실 허용치의 절충값 */
const SYNC_INTERVAL_MS = 30_000;

/** 귀환 보고를 띄우는 최소 부재 시간(초) — 잠깐 탭 전환까지 축하하면 피곤하다 */
const MIN_REPORT_AWAY_SECONDS = 10 * 60;

/** 부재가 짧아도 파편을 이만큼 모았으면 보고할 가치가 있다 */
const MIN_REPORT_DEBRIS = 1;

interface PetLinkProps {
  /** 보고할 만한 오프라인 정산이 있을 때 호출된다 (귀환 보고 모달 트리거) */
  onSettlement: (settlement: OfflineSettlement) => void;
}

export default function PetLink({ onSettlement }: PetLinkProps) {
  // 부팅 정산이 끝나기 전에는 동기화를 보내지 않는다 (낡은 초기값으로 서버를 덮어쓰는 사고 방지)
  const linked = useRef(false);
  // "마지막 동기화 이후 상태가 바뀌었나" — 바뀐 게 없으면 서버를 조용히 둔다
  const dirty = useRef(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return; // 로컬 모드 — persist(localStorage)가 지켜준다

    let cancelled = false;

    const boot = async () => {
      // 1) 세션 확보 — 익명 계정도 어엿한 auth.users 한 명이다
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) {
          console.warn("[관제 링크] 익명 로그인 실패:", error.message);
          return;
        }
      }

      // 2) 부팅 정산 — 서버(DB 시간)가 계산한 결과로 스토어를 덮어쓴다
      const result = await bootPet();
      if (cancelled || !result.ok) {
        if (!result.ok) console.warn("[관제 링크] 부팅 실패:", result.reason);
        return;
      }
      usePetStore.getState().hydrateFromServer(result.pet);
      dirty.current = false; // hydrate로 인한 변경은 동기화 대상이 아니다
      linked.current = true;

      const s = result.settlement;
      const worthReporting =
        s?.settled &&
        (s.away_seconds >= MIN_REPORT_AWAY_SECONDS ||
          (s.debris_gained ?? 0) >= MIN_REPORT_DEBRIS);
      if (worthReporting && s) onSettlement(s);
    };
    void boot();

    // 3) 주기 동기화 — 스토어의 어떤 변경이든 dirty 표시만 해두고,
    //    실제 전송은 30초에 한 번 몰아서 한다 (탭 연타마다 서버를 부르지 않기)
    const unsubscribe = usePetStore.subscribe(() => {
      dirty.current = true;
    });

    const push = () => {
      if (!linked.current || !dirty.current) return;
      dirty.current = false;
      const state = usePetStore.getState();
      syncPet({
        battery: state.battery,
        durability: state.durability,
        dataUsed: state.dataUsed,
        debris: state.debris,
        exp: state.exp,
      }).then((r) => {
        // 실패하면 다음 주기에 다시 시도하도록 dirty를 되살린다
        if (!r.ok) dirty.current = true;
      });
    };
    const timer = setInterval(push, SYNC_INTERVAL_MS);

    // 탭을 벗어나는 순간 마지막 스냅샷을 밀어 넣는다 (30초를 기다리면 늦는다)
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") push();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(timer);
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [onSettlement]);

  return null;
}
