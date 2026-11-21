"""국내에서 쓰지만 미국 FDA 자료가 없는 약의 해외 공식 허가사항을 내려받아 읽을 부분만 보여 준다.

index.html의 OFFICIAL 표 맨 끝, src가 있는 21가지(2026-11-21)의 근거 문서다.
식약처 의약품안전나라는 해외 작업 환경에서 접속이 끊겨, 같은 성분의 일본·영국·스페인·프랑스 허가사항을 쓴다.
접속할 곳: www.kegg.jp, www.medicines.org.uk, cima.aemps.es, base-donnees-publique.medicaments.gouv.fr

    python3 tools/intl_labels.py fetch labels-intl
    python3 tools/intl_labels.py digest labels-intl            # 모두
    python3 tools/intl_labels.py digest labels-intl jp_sulpiride uk_domperidone

내려받은 글은 읽을 자료일 뿐이다. OFFICIAL 표는 이 출력물을 사람이 읽고 우리말로 옮겨 쓴 것이므로,
자료를 새로 받으면 다시 읽고 표(쓰임, 흔한 부작용, 경고·주의, 개정일 dt)를 고친다.
"""
import html
import os
import re
import sys
import urllib.request

KEGG = "https://www.kegg.jp/medicus-bin/japic_med?japic_code="
EMC = "https://www.medicines.org.uk/emc/product/{}/smpc"
CIMA = "https://cima.aemps.es/cima/dochtml/ft/{0}/FT_{0}.html"
BDPM = "https://base-donnees-publique.medicaments.gouv.fr/medicament/{}/extrait"

# (출처, 성분, 문서 번호) — 일본 JAPIC 코드, 영국 emc 제품 번호, 스페인 등록 번호, 프랑스 CIS 코드
DOCS = [
    ("uk", "amisulpride", "102319"), ("jp", "sulpiride", "00055067"), ("jp", "blonanserin", "00058467"), ("jp", "zotepine", "00004407"),
    ("jp", "etizolam", "00060755"), ("jp", "clotiazepam", "00048742"), ("jp", "bromazepam", "00053019"), ("jp", "brotizolam", "00052533"),
    ("jp", "tofisopam", "00070816"), ("fr", "tianeptine", "65411280"), ("uk", "agomelatine", "6564"), ("fr", "milnacipran", "60430095"),
    ("es", "levosulpiride", "63715"), ("uk", "domperidone", "101741"), ("jp", "mosapride", "00057128"), ("jp", "itopride", "00047605"),
    ("fr", "trimebutine", "60246750"), ("jp", "rebamipide", "00071410"), ("jp", "loxoprofen", "00057032"), ("uk", "aceclofenac", "6578"),
    ("jp", "teneligliptin", "00069247"),
]


def url_of(src, num):
    return {"jp": KEGG + num, "uk": EMC.format(num), "es": CIMA.format(num), "fr": BDPM.format(num)}[src]


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; label-reader)"})
    with urllib.request.urlopen(req, timeout=90) as r:
        b = r.read()
        for enc in [r.headers.get_content_charset()] + ["utf-8", "euc-jp", "shift_jis", "latin-1"]:
            if not enc:
                continue
            try:
                return b.decode(enc)
            except Exception:
                pass
        return b.decode("utf-8", "replace")


def text(h):
    h = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", h)
    h = re.sub(r"(?i)<br\s*/?>|</(p|div|tr|li|h\d|table|dt|dd)>", "\n", h)
    h = html.unescape(re.sub(r"<[^>]+>", " ", h))
    h = re.sub(r"[ \t　\xa0]+", " ", h)
    return re.sub(r"\n\s*\n+", "\n", h).strip()


def fetch(out):
    os.makedirs(out, exist_ok=True)
    for src, k, num in DOCS:
        u = url_of(src, num)
        try:
            t = text(get(u))
            open(os.path.join(out, f"{src}_{k}.txt"), "w", encoding="utf-8").write(u + "\n\n" + t)
            print(f"{src}_{k}: {len(t):,}자")
        except Exception as e:
            print(f"{src}_{k}: 오류 {e}")


def section(t, start, end, lim, longest=False):
    """start 제목부터 end 제목 앞까지. longest면 목차를 피하려고 가장 긴 곳을 고름."""
    best = ""
    for m in re.finditer(start, t):
        rest = t[m.start():]
        e = re.search(end, rest[12:])
        seg = rest[:e.start() + 12] if e else rest[:4000]
        if not longest:
            best = seg
            break
        if len(seg) > len(best):
            best = seg
    s = re.sub(r"\s+", " ", best)
    return (s[:lim] + (" …" if len(s) > lim else "")) if s else "(못 찾음)"


def digest(d, names):
    files = sorted(f[:-4] for f in os.listdir(d) if f.endswith(".txt"))
    for name in names or files:
        t = open(os.path.join(d, name + ".txt"), encoding="utf-8").read()
        print("=" * 30, name, "|", t.split("\n")[0])
        if name.startswith("jp_"):
            m = re.search(r"(\d{4})年(\d{1,2})月\s*(?:改訂|作成)", t)
            print("[개정]", f"{m.group(1)}-{int(m.group(2)):02d}" if m else "(못 찾음)")
            i = t.find("商品情報")
            b = t[i:] if i >= 0 else t
            print("[효능]", section(b, r"効能(又は|または|・)効果", r"用法(及び|・)用量", 500))
            print("[금기]", section(b, r"禁忌", r"効能(又は|または|・)効果", 500))
            print("[주의]", section(b, r"重要な基本的注意", r"特定の背景を有する患者|相互作用|\n11\.", 1500))
            print("[중대한 부작용·기타]", section(b, r"重大な副作用", r"過量投与|適用上の注意|その他の注意", 2500))
        else:
            fr = name.startswith("fr_")
            pats = {"효능": (r"4\.1\.?\s*(Therapeutic indications|Indicaciones terap|Indications th)", r"4\.2\.?\s"),
                    "금기": (r"4\.3\.?\s*(Contraindications|Contraindicaciones|Contre-indications)", r"4\.4\.?\s"),
                    "주의": (r"4\.4\.?\s*(Special warnings|Advertencias|Mises en garde)", r"4\.5\.?\s"),
                    "부작용": (r"4\.8\.?\s*(Undesirable effects|Reacciones adversas|Effets ind)", r"4\.9\.?\s")}
            m = re.search(r"(Date of revision of the text|Fecha de la revisi[oó]n del texto|Dernière mise à jour le)[^0-9A-Za-z]{0,40}([0-9A-Za-z/\.\- ]{4,30})", t, re.I)
            print("[개정]", m.group(2).strip() if m else "(못 찾음)")
            for lab, (a, b) in pats.items():
                print(f"[{lab}]", section(t, a, b, {"효능": 500, "금기": 900, "주의": 1800, "부작용": 2500}[lab], longest=fr))


if __name__ == "__main__":
    if len(sys.argv) < 3 or sys.argv[1] not in ("fetch", "digest"):
        sys.exit(__doc__)
    fetch(sys.argv[2]) if sys.argv[1] == "fetch" else digest(sys.argv[2], sys.argv[3:])
