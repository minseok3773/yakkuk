#!/bin/sh
# 공공데이터포털(data.go.kr)에서 한국의약품안전관리원 DUR 파일데이터를 내려받는다(인증키 불필요).
# 보안문자(캡차)를 요구하면 멈춘다.
set -e
cd "$(dirname "$0")/.."
OUT=raw/dur_files; mkdir -p "$OUT"; J="$OUT/cookies.txt"
for pk in 15089525:병용금기 15089531:연령금기 15089521:노인주의 15089735:임부금기 15089541:투여기간주의 15089533:용량주의 15089542:효능군중복; do
  id=${pk%%:*}; name=${pk#*:}
  page=$(curl -sSL -c $J -b $J -A "Mozilla/5.0" "https://www.data.go.kr/data/$id/fileData.do")
  detail=$(printf '%s' "$page" | grep -o 'id="publicDataDetailPk" name="publicDataDetailPk" value="[^"]*"' | head -1 | sed 's/.*value="//;s/"$//')
  sleep 1
  tok=$(curl -sS -c $J -b $J -A "Mozilla/5.0" -e "https://www.data.go.kr/data/$id/fileData.do" -H "X-Requested-With: XMLHttpRequest" \
    --data "publicDataDetailPk=$detail&publicDataPk=$id&atchFileId=&fileDetailSn=1&publicDataTyCode=PR0051" \
    "https://www.data.go.kr/tcs/dss/selectFileDataDownload.do")
  atch=$(printf '%s' "$tok" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.atchFileId+' '+j.fileDetailSn+' '+j.dataSetFileDetailInfo.dataNm)})")
  set -- $atch
  sleep 1
  lim=$(curl -sS -c $J -b $J -A "Mozilla/5.0" -e "https://www.data.go.kr/data/$id/fileData.do" -H "X-Requested-With: XMLHttpRequest" --data "atchFileId=$1&fileDetailSn=$2" "https://www.data.go.kr/cmm/cmm/check-limit.json")
  case "$lim" in *'"needCaptcha":true'*) echo "보안문자 요구됨: $name — 중단"; exit 2;; esac
  sleep 1
  curl -sS -c $J -b $J -A "Mozilla/5.0" -e "https://www.data.go.kr/data/$id/fileData.do" -o "$OUT/$name.csv" -w "$name %{http_code} %{size_download}\n" \
    "https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=$1&fileDetailSn=$2&dataNm=$(node -e "console.log(encodeURI(process.argv[1]))" "$3")"
  echo "$id $name $3" >> "$OUT/sources.txt"
done
