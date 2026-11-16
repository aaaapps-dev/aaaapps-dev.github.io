#!/usr/bin/env python3
"""
Deep Keyboard: builds a keyboard dictionary with next-word predictions ("phrases").

For one language it
  1. reads the current word list (tools/base_<lang>.combined.gz),
  2. downloads open text corpora from the Leipzig Corpora Collection (CC BY 4.0),
  3. counts which word follows which (bigrams), plus the phrases in tools/seeds_<lang>.txt,
  4. writes the word list + the best next words of every word in the "combined" format,
  5. the workflow then turns it into dicts/main_<lang>.dict with tools/dicttool.jar.

Usage: build_phrases.py <lang> <leipzig code> <out.combined> [local corpus .tar.gz ...]
"""
import gzip, io, math, os, re, sys, tarfile, time, urllib.request

MAX_FOLLOWERS = 8        # next words kept for each word
MIN_COUNT = 3            # a pair must be seen at least this many times
MAX_SOURCES = 30000      # only the most common words get next words (keeps the file small)
CORPORA_PER_LANG = 3     # how many Leipzig corpora are mixed
SEED_BONUS = 1_000_000   # phrases from seeds_<lang>.txt always come first

TYPES = ["news", "newscrawl", "web", "wikipedia", "mixed", "news-typical"]
YEARS = list(range(2024, 2004, -1))
SIZES = ["1M", "300K"]
BASE = "https://downloads.wortschatz-leipzig.de/corpora/"

MARKS = re.compile("[ؐ-ًؚ-ٰٟۖ-ۭـ]")   # Arabic tashkeel + tatweel
SPLIT = re.compile(r"[.,!?;:\"()\[\]{}<>«»“”„…–—|/\\،؛؟۔]+")
WORD = re.compile(r"[^\W\d_]+(?:['’][^\W\d_]+)*")


def log(*a):
    print(*a, flush=True)


def exists(url):
    for method, headers in (("HEAD", {}), ("GET", {"Range": "bytes=0-0"})):
        try:
            req = urllib.request.Request(url, method=method, headers=headers)
            with urllib.request.urlopen(req, timeout=20) as r:
                if r.status in (200, 206):
                    return True
        except Exception:
            pass
    return False


def find_corpora(code):
    """Newest big corpora first, at most one per type."""
    found = []
    for t in TYPES:
        hit = None
        for y in YEARS:
            for s in SIZES:
                for name in ("%s_%s_%d_%s" % (code, t, y, s),):
                    if exists(BASE + name + ".tar.gz"):
                        hit = name
                        break
                if hit: break
            if hit: break
        if hit:
            log("  found", hit)
            found.append(hit)
        if len(found) >= CORPORA_PER_LANG:
            break
    return found


def download(name, folder):
    path = os.path.join(folder, name + ".tar.gz")
    if not os.path.exists(path):
        log("  downloading", name)
        for attempt in range(3):
            try:
                urllib.request.urlretrieve(BASE + name + ".tar.gz", path)
                break
            except Exception as e:
                log("   retry:", e)
                time.sleep(10)
    return path


def sentences(tar_path):
    with tarfile.open(tar_path, "r:gz") as t:
        for m in t:
            if m.name.endswith("-sentences.txt"):
                f = t.extractfile(m)
                for line in io.TextIOWrapper(f, encoding="utf-8", errors="ignore"):
                    tab = line.find("\t")
                    yield line[tab + 1:] if tab >= 0 else line


def read_base(path):
    header, words = None, []
    opener = gzip.open if path.endswith(".gz") else open
    with opener(path, "rt", encoding="utf-8") as f:
        cur = None
        for line in f:
            line = line.rstrip("\n")
            if line.startswith("dictionary="):
                header = line
            elif line.startswith(" word="):
                cur = [line, []]
                words.append(cur)
            elif line.startswith("  ") and cur is not None and not line.strip().startswith("bigram="):
                cur[1].append(line)   # shortcuts etc. stay as they are
    return header, words


def field(line, key):
    m = re.search(r"(?:^| |,)" + key + r"=([^,]*)", line)
    return m.group(1) if m else None


def main():
    lang, code, out = sys.argv[1], sys.argv[2], sys.argv[3]
    local = sys.argv[4:]
    here = os.path.dirname(os.path.abspath(__file__))
    header, entries = read_base(os.path.join(here, "base_" + lang + ".combined.gz"))
    words = [field(e[0], "word") for e in entries]
    freq = [int(field(e[0], "f") or 0) for e in entries]
    index = {w: i for i, w in enumerate(words)}
    lower = {}
    for i, w in enumerate(words):
        lower.setdefault(w.lower(), i)
    log(lang, "base words:", len(words))

    # seed phrases: added to the word list if missing, and counted first
    seeds = []
    seed_path = os.path.join(here, "seeds_" + lang + ".txt")
    if os.path.exists(seed_path):
        for line in open(seed_path, encoding="utf-8"):
            line = MARKS.sub("", line.strip())
            if not line or line.startswith("#"): continue
            toks = WORD.findall(line)
            for t in toks:
                if t not in index and t.lower() not in lower:
                    index[t] = len(words); lower.setdefault(t.lower(), len(words))
                    words.append(t); freq.append(150)
                    entries.append([" word=%s,f=150,flags=,originalFreq=150" % t, []])
            seeds.append(toks)
    log(lang, "seed phrases:", len(seeds))

    def wid(tok):
        i = index.get(tok)
        if i is None: i = lower.get(tok.lower())
        return i

    SHIFT = 20
    pairs = {}
    seen = [0] * len(words)

    def count_line(text, weight=1):
        text = MARKS.sub("", text)
        for part in SPLIT.split(text):
            prev = None
            for tok in WORD.findall(part):
                i = wid(tok)
                if i is not None:
                    seen[i] += weight
                    if prev is not None:
                        k = (prev << SHIFT) | i
                        pairs[k] = pairs.get(k, 0) + weight
                prev = i

    for toks in seeds:
        count_line(" ".join(toks), SEED_BONUS)

    folder = os.path.join(here, "..", "corpora")
    os.makedirs(folder, exist_ok=True)
    tars = local or [download(n, folder) for n in find_corpora(code)]
    if not tars and not seeds:
        sys.exit("no corpus found for " + code)
    for tp in tars:
        n = 0
        for s in sentences(tp):
            count_line(s)
            n += 1
            if n % 200000 == 0:
                log("  ", os.path.basename(tp), n, "sentences,", len(pairs), "pairs")
        log("  done", os.path.basename(tp), n, "sentences")

    # the most used words get their best next words
    sources = sorted((i for i in range(len(words)) if seen[i] > 0), key=lambda i: -seen[i])[:MAX_SOURCES]
    sources = set(sources)
    follow = {}
    for k, c in pairs.items():
        a, b = k >> SHIFT, k & ((1 << SHIFT) - 1)
        if (a in sources or c >= SEED_BONUS) and c >= MIN_COUNT:
            follow.setdefault(a, []).append((c, b))
    total = 0
    with open(out, "w", encoding="utf-8") as f:
        f.write(header.split(",date=")[0] + ",date=%d,version=%d\n" % (int(time.time()), int(time.time()) // 86400))
        for i, (line, extra) in enumerate(entries):
            f.write(line + "\n")
            for e in extra:
                f.write(e + "\n")
            lst = follow.get(i)
            if not lst: continue
            lst.sort(reverse=True)
            lst = lst[:MAX_FOLLOWERS]
            top = lst[0][0]
            for rank, (c, b) in enumerate(lst):
                u = freq[b]
                share = max(0.15, min(1.0, math.log(c + 1) / math.log(top + 1))) * (1 - rank * 0.06)
                bf = min(255, max(u + 1, int(u + (255 - u) * share)))
                f.write("  bigram=%s,f=%d\n" % (words[b], bf))
                total += 1
    log(lang, "words with next words:", len(follow), " pairs written:", total)


if __name__ == "__main__":
    main()
