#!/usr/bin/env bash
# P0/P3 자동 검사 — 모든 항목이 0건이어야 통과.
# 사용: bash verify.sh [소스디렉터리]      (기본값: src)
set -u
DIR="${1:-src}"
fail=0

check() {   # check <설명> <확장정규식>
  local label="$1" pattern="$2" hits
  hits=$(grep -rnE "$pattern" "$DIR" \
           --include=*.jsx --include=*.tsx --include=*.js --include=*.ts \
           2>/dev/null | grep -v "verify.sh" || true)
  if [ -n "$hits" ]; then
    echo "FAIL  $label"
    echo "$hits" | sed 's/^/      /'
    fail=1
  else
    echo "ok    $label"
  fi
}

echo "검사 대상: $DIR"
echo
check "네이티브 대화상자 (prompt/alert/confirm)"        "(^|[^a-zA-Z_.])(window\.)?(prompt|alert|confirm)\("
check "네이티브 입력 (number/date/time/color/checkbox)"  "type=[\"'](number|date|time|color|checkbox)[\"']"
check "네이티브 select"                                  "<select[ >]"
check "다크 전용 색 (흰색 rgba)"                          "rgba\(255, ?255, ?255"
check "액센트 위 글자색 하드코딩 (#fff/#000)"              "color: ?[\"']#(fff|ffffff|000|000000)[\"']"
check "textarea 수동 리사이즈 핸들"                        "resize: ?[\"'](both|vertical|horizontal)[\"']"

echo
if [ "$fail" -eq 0 ]; then
  echo "PASS — 위반 0건"
else
  echo "위 항목을 고친 뒤 다시 실행하세요. (의도적 예외는 해당 줄에 이유를 주석으로 남길 것)"
fi
exit $fail
