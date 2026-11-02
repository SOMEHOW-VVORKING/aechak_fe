/**
 * 새 서버 값(`next`)을 폼에 반영하면서, 사용자가 **건드린 칸만** 입력(`prev`)을 지킨다.
 *
 * 전체 덮어쓰기 PUT 화면이 쓴다(스토어 설정·배송 정책). 두 화면은 주소 3필드를 같은 서버
 * 컬럼에 쓰므로, 폼 전체를 1회만 시드해 두면 안 건드린 칸의 옛 값이 그대로 PUT에 실려
 * 다른 화면이 바꾼 값을 되돌린다 — 그 경로를 막는 병합이다.
 */
export function mergeDirty<V extends object>(next: V, prev: V, dirtyKeys: Iterable<keyof V>): V {
  const merged = { ...next }
  for (const key of dirtyKeys) merged[key] = prev[key]
  return merged
}
