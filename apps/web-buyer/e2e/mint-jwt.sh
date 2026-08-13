#!/bin/zsh
# 로컬 BE(AUTH_JWT_PRIVATE_KEY로 띄운)와 같은 키로 access token을 직접 서명한다.
# 클레임 계약: sub=userId(문자열), role=GENERAL|ADMIN, iat/exp (TokenCodecAdapter.encodeAccessToken).
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
SUB="${1:-1}"
NOW=$(date +%s)
EXP=$((NOW + 86400))

# 키가 없으면 로컬 전용으로 새로 만든다(리포에 개인키를 커밋하지 않음). BE bootRun에 반드시
# 같은 키(jwt-private.pem/jwt-public.pem)를 AUTH_JWT_* 로 주입해야 서명 검증이 통과한다.
if [[ ! -f "$DIR/jwt-private.pem" ]]; then
  openssl genrsa -out "$DIR/jwt-private.pem" 2048 2>/dev/null
  openssl rsa -in "$DIR/jwt-private.pem" -pubout -out "$DIR/jwt-public.pem" 2>/dev/null
fi

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

HEADER=$(printf '{"alg":"RS256","typ":"JWT"}' | b64url)
PAYLOAD=$(printf '{"sub":"%s","role":"GENERAL","iat":%d,"exp":%d}' "$SUB" "$NOW" "$EXP" | b64url)
SIG=$(printf '%s.%s' "$HEADER" "$PAYLOAD" | openssl dgst -sha256 -sign "$DIR/jwt-private.pem" -binary | b64url)
printf '%s.%s.%s\n' "$HEADER" "$PAYLOAD" "$SIG"
