import json
import sys

# Google account domains to EXCLUDE (security risk if leaked)
# YouTube cookies are intentionally NOT in this list — yt-dlp needs them
EXCLUDED_DOMAINS = [
    '.google.com',
    '.google.co.in',
    'accounts.google.com',
    'mail.google.com',
    'myaccount.google.com',
    'gds.google.com',
    'contacts.google.com',
    'ogs.google.com',
    '.googleapis.com',
    '.googlevideo.com',
]

def is_excluded(domain):
    domain_lower = domain.lower()
    for excluded in EXCLUDED_DOMAINS:
        if domain_lower == excluded or domain_lower == excluded.lstrip('.'):
            return True
    return False

def main():
    print("=" * 50)
    print("  Cookie JSON → Netscape Converter")
    print("=" * 50)
    print()
    print("Paste the full JSON from your cookie extension,")
    print("then press Enter on a blank line to finish:")
    print()

    lines = []
    while True:
        try:
            line = input()
        except EOFError:
            break
        lines.append(line)
        stripped = line.strip()
        if stripped == ']' or stripped == '];':
            break

    raw = '\n'.join(lines)

    try:
        cookies = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"\nError: Invalid JSON! {e}")
        input("Press Enter to exit...")
        sys.exit(1)

    output_file = r"D:\YouTube_Video_Downloader\cookies.txt"

    included = 0
    excluded = 0

    with open(output_file, "w", encoding="utf-8") as f:
        f.write("# Netscape HTTP Cookie File\n")
        f.write("# Converted from browser extension JSON export\n")
        f.write("# Google account cookies excluded for security.\n\n")

        for cookie in cookies:
            domain = cookie.get("domain", "")
            if is_excluded(domain):
                excluded += 1
                continue

            name = cookie.get("name", "")
            value = cookie.get("value", "")
            path = cookie.get("path", "/")
            secure = "TRUE" if cookie.get("secure", False) else "FALSE"
            host_only = cookie.get("hostOnly", False)
            include_subdomains = "FALSE" if host_only else "TRUE" if domain.startswith(".") else "FALSE"

            expires = int(cookie.get("expirationDate", 0))
            if expires == 0 and cookie.get("session", False):
                expires = 0

            f.write(f"{domain}\t{include_subdomains}\t{path}\t{secure}\t{expires}\t{name}\t{value}\n")
            included += 1

    print(f"\nDone! Saved {included} cookies. ({excluded} Google account cookies excluded)")
    print(f"  → {output_file}")
    print()
    input("Press Enter to exit...")

if __name__ == "__main__":
    main()
