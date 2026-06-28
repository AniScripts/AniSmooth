import os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXTS = {'.html', '.py', '.js', '.jsx', '.css', '.md'}

fixed = 0

for dirpath, _, filenames in os.walk(ROOT):
    if '__pycache__' in dirpath or '.git' in dirpath or 'node_modules' in dirpath:
        continue
    for fn in filenames:
        ext = os.path.splitext(fn)[1].lower()
        if ext not in EXTS:
            continue
        fpath = os.path.join(dirpath, fn)
        with open(fpath, 'r', encoding='utf-8') as f:
            content = f.read()

        new_content = content
        new_content = new_content.replace(' - ', ' - ')
        new_content = new_content.replace(' - ', ' - ')
        new_content = new_content.replace('- ', '- ')
        new_content = re.sub(r'(\S) - (\S)', r'\1 - \2', new_content)

        if new_content != content:
            with open(fpath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            fixed += 1
            print(f'Fixed: {os.path.relpath(fpath, ROOT)}')

print(f'\n{fixed} files fixed.')
