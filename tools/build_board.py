"""약국이 현황판(board/index.html)을 만든다.

board/app.html(현황판 화면)에 index.html(약국이)의 함께 쓰는 부분을 넣는다.
함께 쓰는 부분은 index.html 안의 `/* @@share-begin ... */`와 `/* @@share-end */` 사이(4곳)로,
내장 약 정보(OFFICIAL), 병용·누적 부담 규칙, 회원 상태별 주의, 건강 개입 지침, 약 이름 비교다.
index.html의 이 부분을 고쳤으면 이 도구를 다시 돌려 현황판도 같은 자료를 쓰게 한다.

    python3 tools/build_board.py
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
BEGIN, END = "/* @@share-begin", "/* @@share-end */"


def main():
    src = (ROOT / "index.html").read_text(encoding="utf-8")
    tpl = (ROOT / "board" / "app.html").read_text(encoding="utf-8")

    parts, pos = [], 0
    while True:
        b = src.find(BEGIN, pos)
        if b < 0:
            break
        body = src.index("*/", b) + 2
        e = src.find(END, body)
        if e < 0:
            sys.exit("index.html: @@share-begin 뒤에 @@share-end가 없습니다.")
        parts.append(src[body:e].strip("\n"))
        pos = e + len(END)
    if len(parts) != 4:
        sys.exit(f"index.html: 함께 쓰는 부분이 {len(parts)}곳입니다(4곳이어야 합니다).")
    shared = "\n\n".join(parts)
    for bad in ('$("', "document.", "window.claude", "sample("):
        if bad in shared:
            sys.exit(f"함께 쓰는 부분에 화면·AI 코드({bad})가 섞여 있습니다. @@share 표시를 옮겨 주세요.")

    a, b = src.index("<!--"), src.index("-->")
    license_text = src[a + 4:b].strip()

    for mark in ("<!--@@LICENSE@@-->", "/*@@SHARED@@*/"):
        if tpl.count(mark) != 1:
            sys.exit(f"board/app.html: {mark} 자리가 한 곳이어야 합니다.")
    out = tpl.replace("<!--@@LICENSE@@-->",
                      "<!--\n이 파일은 tools/build_board.py가 board/app.html과 index.html(약국이)의 함께 쓰는 부분으로 만든 것입니다. 직접 고치지 말고 두 파일을 고친 뒤 다시 만드세요.\n\n"
                      + license_text + "\n-->")
    out = out.replace("/*@@SHARED@@*/",
                      "/* ---------- 여기부터 약국이(index.html)와 함께 쓰는 부분: 내장 약 정보, 점검 규칙, 건강 개입 지침, 약 이름 비교 ---------- */\n"
                      + shared + "\n/* ---------- 함께 쓰는 부분 끝 ---------- */")
    dest = ROOT / "board" / "index.html"
    dest.write_text(out, encoding="utf-8")
    print(f"{dest.relative_to(ROOT)} {len(out.encode('utf-8')):,} 바이트 (함께 쓰는 부분 {len(shared.encode('utf-8')):,} 바이트)")


if __name__ == "__main__":
    main()
