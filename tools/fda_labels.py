#!/usr/bin/env python3
"""약국이 내장 약 정보의 근거 자료를 미국 FDA 공개 허가사항(openFDA drug label)에서 내려받아
검토용 요약(digest)을 만드는 도구.

  python3 tools/fda_labels.py fetch  <폴더>   # 성분별 허가사항(JSON)을 내려받음
  python3 tools/fda_labels.py digest <폴더>   # 내려받은 자료에서 검토할 부분만 뽑아 출력

index.html 안의 OFFICIAL 표(우리말 요약)는 이 digest를 사람이 읽고 옮겨 쓴 것이다.
자동 번역이 아니므로, 자료를 새로 받으면 digest를 다시 읽고 OFFICIAL 표를 손으로 고친다.
openFDA: https://open.fda.gov (인증키 없이 하루 1,000회까지 요청 가능)
"""
import json, os, re, sys, time, urllib.parse, urllib.request

API = "https://api.fda.gov/drug/label.json"

# 약국이 규칙에 쓰는 영문 성분명 -> openFDA에서 찾을 이름 (다르면 따로 적음)
INGREDIENTS = """
risperidone paliperidone olanzapine quetiapine aripiprazole haloperidol clozapine chlorpromazine
ziprasidone perphenazine lurasidone cariprazine brexpiprazole
lithium valproate:divalproex lamotrigine carbamazepine oxcarbazepine topiramate gabapentin pregabalin
fluoxetine sertraline escitalopram citalopram paroxetine fluvoxamine duloxetine venlafaxine
desvenlafaxine vortioxetine bupropion mirtazapine trazodone amitriptyline imipramine nortriptyline clomipramine
lorazepam diazepam alprazolam clonazepam triazolam clobazam flurazepam zolpidem eszopiclone buspirone hydroxyzine
benztropine trihexyphenidyl propranolol
donepezil rivastigmine galantamine memantine methylphenidate atomoxetine naltrexone acamprosate varenicline
metformin glimepiride sitagliptin linagliptin empagliflozin dapagliflozin pioglitazone
amlodipine losartan valsartan telmisartan candesartan olmesartan irbesartan enalapril ramipril lisinopril
hydrochlorothiazide furosemide spironolactone carvedilol bisoprolol atenolol
atorvastatin rosuvastatin simvastatin pitavastatin pravastatin
clopidogrel warfarin rivaroxaban apixaban
levothyroxine tamsulosin finasteride
omeprazole esomeprazole pantoprazole lansoprazole famotidine metoclopramide
ibuprofen naproxen celecoxib meloxicam tramadol
levodopa:carbidopa+levodopa ropinirole pramipexole
oxybutynin solifenacin tolterodine mirabegron
lactulose bisacodyl magnesium:magnesium+hydroxide
amantadine doxazosin nifedipine aspirin acetaminophen diphenhydramine chlorpheniramine
""".split()

COMBO_OK = {"levodopa"}


def get(params):
    url = API + "?" + "&".join(k + "=" + urllib.parse.quote(v, safe='+:"()') for k, v in params.items())
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=90) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(2 * (attempt + 1))
        except Exception:
            time.sleep(2 * (attempt + 1))
    return None


def single(term):
    return not re.search(r" AND |,|/| WITH | PLUS ", term)


def fetch(outdir):
    os.makedirs(outdir, exist_ok=True)
    for item in INGREDIENTS:
        key, _, q = item.partition(":")
        q = (q or key).replace("+", " ")
        path = os.path.join(outdir, key + ".json")
        if os.path.exists(path):
            continue
        words = q.split()
        search = "+AND+".join('openfda.generic_name:"%s"' % w for w in words)
        c = get({"search": search, "count": "openfda.generic_name.exact", "limit": "100"})
        terms = [t["term"] for t in (c or {}).get("results", [])]
        if key in COMBO_OK:
            cands = [t for t in terms if all(w.upper() in t for w in words) and t.count(" AND ") == 1 and "," not in t]
        else:
            cands = [t for t in terms if single(t)]
        if not cands:
            print("없음:", key, terms[:5]); continue
        best = None
        for term in cands[:3]:
            for ptype in ("HUMAN PRESCRIPTION DRUG", "HUMAN OTC DRUG"):
                d = get({"search": 'openfda.generic_name.exact:"%s"+AND+openfda.product_type.exact:"%s"' % (term, ptype),
                         "sort": "effective_time:desc", "limit": "5"})
                for r in (d or {}).get("results", []):
                    o = r.get("openfda", {})
                    score = (("warnings_and_cautions" in r) * 4 + ("information_for_patients" in r) * 2
                             + ("ORAL" in o.get("route", [])) * 2 + (len(o.get("substance_name", [])) == 1 or key in COMBO_OK) * 3
                             + ("adverse_reactions" in r) * 2)
                    if best is None or (score, r.get("effective_time", "")) > best[0]:
                        best = ((score, r.get("effective_time", "")), r)
                if best and best[0][0] >= 9:
                    break
                time.sleep(0.3)
            if best and best[0][0] >= 9:
                break
        if not best:
            print("없음:", key); continue
        json.dump(best[1], open(path, "w"), ensure_ascii=False)
        o = best[1].get("openfda", {})
        print("받음:", key, "|", (o.get("generic_name") or ["?"])[0], "|", (o.get("brand_name") or ["?"])[0], "|", best[1].get("effective_time"), "| 점수", best[0][0])
        time.sleep(0.3)


FLAGS = {
    "weight": r"weight gain|weight increased|increased weight|increases? in (body )?weight",
    "glucose": r"hyperglycemi|diabetes mellitus", "lipid": r"dyslipidemia|hyperlipid",
    "ortho": r"orthostatic|postural hypotension|syncope", "falls": r"\bfalls?\b",
    "sedation": r"somnolence|sedation|drowsiness|cognitive and motor impairment",
    "eps": r"extrapyramidal|akathisia|parkinsonism|dystonia|tardive dyskinesia", "nms": r"neuroleptic malignant",
    "qt": r"QT prolong|QTc|torsade", "constip": r"constipation|hypomotility|ileus", "urinary": r"urinary retention",
    "drymouth": r"dry mouth|xerostomia", "heat": r"body temperature|heat ?stroke|overheating|anhidrosis|oligohidrosis|hyperthermia",
    "seizure": r"seizure", "prolactin": r"prolactin", "suicid": r"suicid", "serotonin": r"serotonin syndrome",
    "bleed": r"bleeding", "hypona": r"hyponatremia|SIADH", "withdraw": r"withdrawal|discontinuation syndrome|abrupt",
    "depend": r"dependence|abuse|misuse", "resp": r"respiratory depression", "alcohol": r"alcohol",
    "driving": r"driving|machinery|motor vehicle", "preg": r"pregnan|fetal|teratogen|neural tube",
    "rash": r"\brash|Stevens-Johnson|epidermal necrolysis|DRESS", "hepat": r"hepatotoxic|liver (injury|failure)|hepatic failure",
    "neutro": r"neutropenia|agranulocytosis|leukopenia", "myocard": r"myocarditis|cardiomyopathy",
    "dysphagia": r"dysphagia|aspiration", "glaucoma": r"angle.closure|glaucoma", "hypogly": r"hypoglycemi",
    "lactic": r"lactic acidosis", "thyroid": r"hypothyroid", "smoking": r"smok",
}


def text(r, k):
    return re.sub(r"\s+", " ", " ".join(r.get(k) or [])).strip()


def windows(adv):
    """'가장 흔한 이상반응' 문장을 찾아 그 앞뒤만 잘라 냄."""
    out, last = [], -999
    for m in re.finditer(r"most common|commonly observed|most frequent|commonly reported", adv, re.I):
        if m.start() - last < 400:
            continue
        start = max(adv.rfind(". ", 0, m.start()), adv.rfind(") ", max(0, m.start() - 120), m.start()), m.start() - 120, 0)
        seg = adv[start:m.start() + 400].lstrip(". )")
        if re.search(r"discontinuation|see Warnings", seg[:160]):
            continue
        out.append(seg); last = m.start()
        if len(out) == 2:
            break
    return out


def digest(outdir, only_adv=()):
    for item in INGREDIENTS:
        key = item.partition(":")[0]
        path = os.path.join(outdir, key + ".json")
        if not os.path.exists(path):
            print("\n### %s\n(자료 없음)" % key); continue
        r = json.load(open(path))
        o = r.get("openfda", {})
        adv = text(r, "adverse_reactions")
        hits = windows(adv)
        if key in only_adv:
            print("\n### %s\nADV: %s" % (key, " || ".join(hits) if hits else adv[:380])); continue
        print("\n### %s | %s | %s | %s | %s | %s" % (key, (o.get("generic_name") or ["?"])[0], (o.get("brand_name") or ["?"])[0],
              r.get("effective_time"), (o.get("spl_set_id") or [r.get("set_id", "?")])[0], ",".join(o.get("route", []))))
        box = text(r, "boxed_warning")
        if box: print("BOX:", box[:170])
        ind = text(r, "indications_and_usage") or text(r, "purpose")
        m = re.search(r"\b1\.1\s", ind)
        print("IND:", (ind[:m.start()] if m and m.start() > 60 else ind)[:330])
        wc = text(r, "warnings_and_cautions")
        if wc:
            m = re.search(r"\b5\.1\s+[A-Z]", wc)
            head = wc[:m.start()] if m and m.start() > 80 else wc[:1500]
            titles = [b.strip(" .•").split(":", 1)[0].strip()[:60] for b in re.split(r"\(\s*5\.\d+(?:\s*,\s*[\d.]+)*\s*\)", head) if b.strip(" .•")]
            print("W&P:", "; ".join(t for t in titles if len(t) > 3)[:720])
        else:
            w = text(r, "warnings"); p = text(r, "precautions") or text(r, "general_precautions")
            if w: print("WARN:", w[:420])
            if p: print("PREC:", p[:300])
        print("ADV:", " || ".join(hits) if hits else adv[:380])
        blob = " ".join(text(r, k) for k in ("boxed_warning", "warnings_and_cautions", "warnings", "precautions", "information_for_patients", "drug_interactions")) + " " + " ".join(hits)
        print("FLAG:", " ".join(k for k, pat in FLAGS.items() if re.search(pat, blob, re.I)))


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("fetch", "digest"):
        sys.exit(__doc__)
    (fetch if sys.argv[1] == "fetch" else digest)(sys.argv[2])
