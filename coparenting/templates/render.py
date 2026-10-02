"""공지 HTML → PDF + PNG 변환기
사용법: python render.py <입력.html> <출력경로(확장자 없이)>
예시:  python render.py templates/notice_notion.html output/2026-10-09_미술놀이
필요: pip install playwright && playwright install chromium
폰트: Pretendard 설치 필요 (https://github.com/orioncactus/pretendard)
"""
import os, sys
from playwright.sync_api import sync_playwright

src, out = sys.argv[1], sys.argv[2]
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 794, "height": 1123}, device_scale_factor=2)
    pg.goto("file://" + os.path.abspath(src))
    pg.wait_for_timeout(800)
    # 넘침 검사: 내용이 A4 한 장을 넘으면 경고
    bottom = pg.evaluate("""()=>{const s=document.querySelector('.page');const r=s.getBoundingClientRect();
      let m=0;s.querySelectorAll('*').forEach(e=>{const b=e.getBoundingClientRect().bottom;if(b>m)m=b;});return Math.round(m-r.top);}""")
    print(f"내용 하단: {bottom}px / 1123px", "⚠️ 넘침!" if bottom > 1085 else "✅ 한 장에 맞음")
    pg.pdf(path=out + ".pdf", format="A4", print_background=True, prefer_css_page_size=True)
    pg.query_selector(".page").screenshot(path=out + ".png")
    b.close()
