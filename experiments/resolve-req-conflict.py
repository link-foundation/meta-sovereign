import re, sys
for path in sys.argv[1:]:
    s = open(path, encoding='utf-8').read()
    def fix(m):
        ours, theirs = m.group(1), m.group(2)
        ours = ours.replace('## W.', '## X.')
        ours = re.sub(r'\bR-W(\d+)', r'R-X\1', ours)
        # restore table widths: R-X1 same width as R-W1, fine
        return theirs + '\n' + ours
    s2 = re.sub(r'<<<<<<< HEAD\n(.*?)=======\n(.*?)>>>>>>> origin/main\n', fix, s, flags=re.S)
    open(path, 'w', encoding='utf-8').write(s2)
