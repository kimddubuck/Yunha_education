#!/bin/sh
# 고친 뒤 올리기 전에 실행: sos 페이지가 불러오는 우리 js·css 주소 끝의 ?v= 를 새로 바꿔서
# 휴대폰 브라우저가 예전 파일을 캐시에서 꺼내 쓰지 않게 해요.
cd "$(dirname "$0")/../sos" || exit 1
v=$(date +%Y%m%d%H%M)
sed -i -E "s#((src|href)=\"(assets/[a-z]+\.(js|css)|plays\.js|manifest\.webmanifest))(\?v=[0-9]+)?\"#\1?v=$v\"#g" *.html
# 🔐 운영자 화면(admin.html)의 "규칙 복사" 버튼이 읽는 최신 규칙 (내 번호 자리는 비워 둔 채로)
cp ../sos-dev/firestore.rules admin-rules.txt
echo "v=$v"
