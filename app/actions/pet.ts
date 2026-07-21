"use server";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import type {
  EvolveResult,
  OfflineSettlement,
  PetRow,
  PetVariant,
} from "@/lib/supabase/types";

/**
 * 펫 Server Actions — 관제 링크의 서버 쪽 절반.
 *
 * 흐름 요약:
 *   접속 → bootPet()  : 펫 로드(없으면 생성) + 오프라인 정산 RPC
 *   플레이 중 → syncPet(): 클라이언트 상태 스냅샷을 주기적으로 저장
 *
 * 게임 규칙(정산식, 값 검증)은 전부 DB 함수 안에 있다는 점이 핵심.
 * 여기는 "인증된 유저의 요청을 DB에 전달"하는 얇은 통로일 뿐이다.
 * 파이썬으로 치면 로직이 스토어드 프로시저에 있고, Flask 핸들러는
 * 호출만 하는 구조다.
 */

export type BootPetResult =
  | { ok: true; pet: PetRow; settlement: OfflineSettlement | null; isNew: boolean }
  | { ok: false; reason: "not-configured" | "no-session" | "error"; error?: string };

/** 접속 부팅 — 펫을 확보하고, 자리 비운 시간을 DB 시간 기준으로 정산한다 */
export async function bootPet(): Promise<BootPetResult> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return { ok: false, reason: "not-configured" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "no-session" };

  // 1) 내 펫 조회 (RLS 덕분에 "내 것"만 보인다 — where user_id는 이중 안전장치)
  const { data: existing, error: selectError } = await supabase
    .from("joop_01_pets")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (selectError) {
    return { ok: false, reason: "error", error: selectError.message };
  }

  // 2) 첫 접속이면 기본값으로 부화 — 갓 태어난 펫은 정산할 과거가 없다
  if (!existing) {
    const { data: created, error: insertError } = await supabase
      .from("joop_01_pets")
      .insert({ user_id: user.id })
      .select("*")
      .single();
    if (insertError || !created) {
      return { ok: false, reason: "error", error: insertError?.message };
    }
    return { ok: true, pet: created as PetRow, settlement: null, isNew: true };
  }

  // 3) 오프라인 정산 — 시간 계산은 전부 DB의 now() 기준 (개발 원칙 4)
  const { data: settlement, error: rpcError } = await supabase.rpc(
    "joop_01_settle_offline",
  );
  if (rpcError) {
    // 정산이 실패해도 게임은 계속되어야 한다 — 마지막 상태로 입장
    console.error("[pet] 오프라인 정산 실패:", rpcError.message);
    return { ok: true, pet: existing as PetRow, settlement: null, isNew: false };
  }

  const result = settlement as OfflineSettlement;
  return {
    ok: true,
    // 정산이 일어났으면 정산 후 상태가 최신이다
    pet: result.settled && result.pet ? result.pet : (existing as PetRow),
    settlement: result,
    isNew: false,
  };
}

/** 클라이언트 스토어의 스냅샷 — 서버(DB 함수)가 한 번 더 검증·클램프한다 */
export interface PetSnapshot {
  battery: number;
  durability: number;
  dataUsed: number;
  debris: number;
  exp: number;
}

export type EvolvePetResult =
  | (EvolveResult & { configured: true })
  | { configured: false };

/**
 * 진화 요청 — 임계값 검증은 전부 DB 함수 안에서 이루어진다.
 * Supabase 미설정(로컬 모드)이면 configured:false를 돌려주고,
 * 클라이언트가 스토어의 로컬 진화 로직으로 폴백한다.
 */
export async function evolvePet(
  variant: PetVariant | null,
): Promise<EvolvePetResult> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return { configured: false };

  const { data, error } = await supabase.rpc("joop_01_evolve_pet", {
    p_variant: variant,
  });
  if (error) {
    console.error("[pet] 진화 실패:", error.message);
    return { configured: true, ok: false };
  }
  return { configured: true, ...(data as EvolveResult) };
}

/** 플레이 중 주기 동기화 — last_settled_at도 now()로 당겨 이중 정산을 막는다 */
export async function syncPet(snapshot: PetSnapshot): Promise<{ ok: boolean }> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return { ok: false };

  const { error } = await supabase.rpc("joop_01_sync_pet", {
    p_battery: snapshot.battery,
    p_durability: snapshot.durability,
    p_data_used: snapshot.dataUsed,
    p_debris: snapshot.debris,
    p_exp: Math.floor(snapshot.exp),
  });
  if (error) {
    console.error("[pet] 동기화 실패:", error.message);
    return { ok: false };
  }
  return { ok: true };
}
