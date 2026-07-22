/**
 * 컷신 사운드 placeholder — Web Audio 합성음.
 *
 * 오디오 파일이 아직 없어서, 오실레이터로 즉석 합성한다(jd-03 사운드
 * 레이어와 같은 발상). 브라우저는 사용자 제스처 후에만 소리를 허용하므로
 * Scene 3의 '터치' 순간에 호출되는 게 자연스럽다.
 * 실제 SFX(ASSET_URLS.sfx)를 넣을 땐 여기서 오디오를 로드·재생하면 된다.
 */

type WindowWithWebkit = typeof window & {
  webkitAudioContext?: typeof AudioContext;
};

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const w = window as WindowWithWebkit;
    const Ctor = window.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** 톤 하나를 부드럽게 울린다 (attack→release 엔벨로프) */
function blip(
  c: AudioContext,
  freq: number,
  at: number,
  dur: number,
  type: OscillatorType,
  peak: number,
) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/** 기쁨 — 도미솔도 아르페지오 (줍이가 신났다!) */
export function playHappySound() {
  const c = getCtx();
  if (!c) return;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => blip(c, f, c.currentTime + i * 0.08, 0.26, "triangle", 0.18));
}

/** 발진 — 낮은 음에서 치솟는 부스터 휘잉 */
export function playLaunchSound() {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  const t = c.currentTime;
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(120, t);
  osc.frequency.exponentialRampToValueAtTime(880, t + 0.9);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.16, t + 0.12);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + 1.05);
}
