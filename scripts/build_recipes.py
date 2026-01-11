import json, re, time
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup

BASE = "https://alchemy-factory-codex.com/"
INDEX = urljoin(BASE, "recipes/")

S = requests.Session()
S.headers["User-Agent"] = "alchplanner (personal use)"

def fetch(url: str) -> str:
    r = S.get(url, timeout=30)
    r.raise_for_status()
    return r.text

def parse_io_section(soup: BeautifulSoup, title: str):
    hdr = soup.find(lambda t: t.name in ["h2","h3"] and title.lower() in t.get_text(strip=True).lower())
    if not hdr:
        return []
    out = []
    for sib in hdr.find_all_next():
        if sib.name in ["h2","h3"] and sib is not hdr:
            break
        txt = sib.get_text(" ", strip=True).lower()
        m = re.search(r"(\d+)\s*×\s*([a-z0-9 '\-]+)\s*\(", txt)
        if m:
            out.append({"amount": int(m.group(1)), "item": m.group(2).strip()})
    seen=set(); uniq=[]
    for x in out:
        k=(x["item"], x["amount"])
        if k not in seen:
            seen.add(k); uniq.append(x)
    return uniq

def parse_recipe(url: str):
    soup = BeautifulSoup(fetch(url), "html.parser")
    h1 = soup.find("h1")
    name = h1.get_text(strip=True) if h1 else url.rstrip("/").split("/")[-1]
    slug = url.rstrip("/").split("/")[-1]

    text = soup.get_text("\n", strip=True)

    m = re.search(r"Crafting Time\s+(\d+)\s*s", text, flags=re.IGNORECASE)
    if not m:
        return {"url": url, "slug": slug, "name": name, "parse_error": True, "reason":"no crafting time"}
    crafting_s = int(m.group(1))

    dev = None
    m2 = re.search(r"\nDevice\n\s*([^\n]+)", text, flags=re.IGNORECASE)
    if m2:
        dev = m2.group(1).strip().lower()
    if not dev:
        dev = "unknown device"

    inputs = parse_io_section(soup, "Inputs")
    outputs = parse_io_section(soup, "Outputs")

    if not outputs:
        return {"url": url, "slug": slug, "name": name, "parse_error": True, "reason":"no outputs"}

    return {
        "name": name, "slug": slug, "device": dev, "crafting_s": crafting_s,
        "inputs": inputs, "outputs": outputs, "url": url,
    }

def main():
    soup = BeautifulSoup(fetch(INDEX), "html.parser")
    links=set()
    for a in soup.find_all("a", href=True):
        href=a["href"]
        if href.startswith("/recipe/"):
            links.add(urljoin(BASE, href))
    links=sorted(links)

    out=[]
    for i,u in enumerate(links,1):
        try:
            out.append(parse_recipe(u))
            print(f"[{i}/{len(links)}] {u}")
        except Exception as e:
            out.append({"url":u,"parse_error":True,"error":str(e)})
        time.sleep(0.2)

    with open("public/recipes.json","w",encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print("Wrote public/recipes.json")

if __name__ == "__main__":
    main()
