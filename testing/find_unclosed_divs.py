with open('frontend/components/modals.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

import re
stack = []
for idx, line in enumerate(lines, 1):
    tokens = re.findall(r'(<div\b[^>]*>|</div>)', line, re.I)
    for tok in tokens:
        if tok.startswith('</'):
            if stack:
                stack.pop()
            else:
                print(f'Line {idx}: Unmatched closing div')
        else:
            m_id = re.search(r'id=["\']([^"\']+)["\']', tok)
            m_class = re.search(r'class=["\']([^"\']+)["\']', tok)
            id_str = m_id.group(1) if m_id else ""
            class_str = m_class.group(1) if m_class else ""
            info = f'{id_str} ({class_str})'
            stack.append((idx, info.strip()))

print('Unclosed divs at end of file:')
for line_num, info in stack:
    print(f'  Line {line_num}: {info}')
